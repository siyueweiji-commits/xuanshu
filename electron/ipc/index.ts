import { app, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db/database";
import { calcZiwei, calcZiweiHoroscope, ZiweiRequest, ZiweiHoroscopeRequest } from "../services/ziwei";
import {
  convertCalendar,
  divinationTimeParts,
  toTrueSolarTime,
  listCities,
  resolveBirthTime,
  SHICHEN_NAMES,
  TrueSolarRequest,
  ResolvedBirthTime
} from "../services/calendar";
import { calcBazi, BaziRequest } from "../services/bazi";
import { qigua as meihuaQigua, MEIHUA_MODES, MeihuaMode, MeihuaRequest } from "../services/meihua";
import { qigua as liuyaoQigua, LiuyaoRequest } from "../services/liuyao";
import { calcDaily } from "../services/daily";
import {
  listRules,
  saveUserRule,
  appDataSummary,
  Rule,
  rulesOverview,
  setRuleEnabled,
  removeUserRule,
  createRule,
  exportRules,
  importRules
} from "../services/rules";
import { buildReport, listTemplates, ReportBirthInput, ReportRequest } from "../services/report";
import {
  saveReport,
  listReports,
  getReport,
  deleteReport,
  clearReports,
  exportReportFile,
  exportDataFile,
  saveDailyFortune,
  getDailyFortune
} from "../services/reportStore";
import {
  eventTypes,
  createFeedback,
  listFeedbacks,
  updateFeedback,
  deleteFeedback,
  clearFeedbacks,
  backtest,
  backtestCsv,
  BacktestRequest
} from "../services/feedback";
import {
  checkUpdate,
  runUpdate,
  UpdateOptions,
  updateLogs,
  clearUpdateLogs,
  listBackups,
  rollback,
  dropBackup,
  dataOverview,
  getUpdateSettings,
  setUpdateSettings
} from "../services/updater";
import { RESOURCE_KINDS, ResourceKind } from "../services/dataPaths";

type Handler = (payload: unknown) => unknown;
type AsyncHandler = (payload: unknown) => Promise<unknown>;

function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, (_event, payload: unknown) => {
    try {
      return { ok: true, data: fn(payload) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

/** 异步通道（网络 / 文件 IO）；错误同样包成信封返回，不让 reject 冒到渲染层 */
function handleAsync(channel: string, fn: AsyncHandler): void {
  ipcMain.handle(channel, async (_event, payload: unknown) => {
    try {
      return { ok: true, data: await fn(payload) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

function asObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}

function num(o: Record<string, unknown>, key: string, fallback = 0): number {
  const v = o[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(o: Record<string, unknown>, key: string, fallback = ""): string {
  const v = o[key];
  return typeof v === "string" ? v : fallback;
}

/** 读取可空数字：非法一律返回 null（区别于 num 的 0 兜底） */
function maybeNum(o: Record<string, unknown>, key: string): number | null {
  const v = o[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** 本地当天 YYYY-MM-DD */
function toYmdNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 解析 `YYYY-MM-DD[ T]HH:mm`；非法或空则返回当前时刻 */
function parseDateTime(input: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2}))?/.exec((input ?? "").trim());
  if (m) {
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const hour = m[4] === undefined ? 0 : Number(m[4]);
    const minute = m[5] === undefined ? 0 : Number(m[5]);
    if (
      year >= 1900 && year <= 2200 &&
      month >= 1 && month <= 12 &&
      day >= 1 && day <= 31 &&
      hour >= 0 && hour <= 23 &&
      minute >= 0 && minute <= 59
    ) {
      return { year, month, day, hour, minute };
    }
  }
  const d = new Date();
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes()
  };
}

/** 把 IPC payload 里的 birth 对象解析成报告用的出生信息（走真太阳时） */
function reportBirth(raw: unknown): ReportBirthInput | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = asObject(raw);
  if (typeof o.year !== "number" || !Number.isFinite(o.year)) return undefined;
  const resolved = resolveBirthTime(birthInput(o));
  return {
    gender: str(o, "gender", "男"),
    year: resolved.year,
    month: resolved.month,
    day: resolved.day,
    timeIndex: resolved.timeIndex,
    hour: resolved.hour,
    minute: resolved.minute,
    calendar: str(o, "calendar", "solar") === "lunar" ? "lunar" : "solar"
  };
}

/** 从 IPC payload 读取出生时间 + 真太阳时相关参数 */
function birthInput(o: Record<string, unknown>): Parameters<typeof resolveBirthTime>[0] {
  const input: Parameters<typeof resolveBirthTime>[0] = {
    year: num(o, "year"),
    month: num(o, "month"),
    day: num(o, "day"),
    city: str(o, "city") || undefined,
    useTrueSolar: o.useTrueSolar === true
  };
  if (typeof o.hour === "number" && Number.isFinite(o.hour)) input.hour = o.hour;
  if (typeof o.minute === "number" && Number.isFinite(o.minute)) input.minute = o.minute;
  if (typeof o.timeIndex === "number" && Number.isFinite(o.timeIndex)) input.timeIndex = o.timeIndex;
  if (typeof o.longitude === "number" && Number.isFinite(o.longitude)) input.longitude = o.longitude;
  return input;
}

/** 把出生时间解析结果压成给前端展示的元信息 */
function birthMeta(b: ResolvedBirthTime) {
  return {
    applied: b.applied,
    clockTime: b.detail?.clockTime ?? null,
    trueSolarTime: b.detail?.trueSolarTime ?? null,
    offsetMinutes: b.detail?.totalOffsetMinutes ?? null,
    longitude: b.detail?.longitude ?? null,
    cityName: b.detail?.cityName ?? null,
    timeIndex: b.timeIndex,
    timeName: SHICHEN_NAMES[b.timeIndex]
  };
}

export function registerIpcHandlers(): void {
  // 应用信息
  handle("app:info", () => appDataSummary());

  // 档案管理
  handle("profile:create", (payload) => {
    const o = asObject(payload);
    const db = getDb();
    const stmt = db.prepare(
      "INSERT INTO profiles (name, gender, birth_time, birth_location, is_default) VALUES (?, ?, ?, ?, ?)"
    );
    const info = stmt.run(
      str(o, "name", "未命名"),
      str(o, "gender") === "female" ? "female" : "male",
      str(o, "birth_time", new Date().toISOString()),
      str(o, "birth_location") || null,
      o.is_default ? 1 : 0
    );
    return { id: info.lastInsertRowid };
  });

  handle("profile:list", () => getDb().prepare("SELECT * FROM profiles ORDER BY id DESC").all());

  handle("profile:delete", (payload) => {
    const id = num(asObject(payload), "id");
    getDb().prepare("DELETE FROM profiles WHERE id = ?").run(id);
    return { deleted: id };
  });

  // 排盘
  handle("chart:ziwei", (payload) => {
    const o = asObject(payload);
    const birth = resolveBirthTime(birthInput(o));
    const req: ZiweiRequest = {
      gender: str(o, "gender", "男"),
      year: birth.year,
      month: birth.month,
      day: birth.day,
      timeIndex: birth.timeIndex,
      calendar: str(o, "calendar", "solar") === "lunar" ? "lunar" : "solar"
    };
    return {
      ...calcZiwei(req),
      meta: { birth: birthMeta(birth) }
    };
  });

  handle("chart:bazi", (payload) => {
    const o = asObject(payload);
    const birth = resolveBirthTime(birthInput(o));
    const req: BaziRequest = {
      gender: str(o, "gender", "男"),
      year: birth.year,
      month: birth.month,
      day: birth.day,
      hour: birth.hour,
      minute: birth.minute
    };
    if (typeof o.focusYear === "number" && Number.isFinite(o.focusYear)) {
      req.focusYear = o.focusYear;
    }
    return {
      ...calcBazi(req),
      meta: { birth: birthMeta(birth) }
    };
  });

  // 紫微运限（M2）：大限 / 流年 / 流月 / 流日 / 流时
  handle("chart:ziwei-horoscope", (payload) => {
    const o = asObject(payload);
    // 本命时间同样走真太阳时解析，保证与本命盘一致
    const birth = resolveBirthTime(birthInput(o));
    const req: ZiweiHoroscopeRequest = {
      gender: str(o, "gender", "男"),
      year: birth.year,
      month: birth.month,
      day: birth.day,
      timeIndex: birth.timeIndex,
      calendar: str(o, "calendar", "solar") === "lunar" ? "lunar" : "solar",
      targetYear: num(o, "targetYear"),
      targetMonth: num(o, "targetMonth"),
      targetDay: num(o, "targetDay")
    };
    // 不传目标时辰时，沿用本命时辰（避免默认 0 覆盖）
    if (typeof o.targetTimeIndex === "number" && Number.isFinite(o.targetTimeIndex)) {
      req.targetTimeIndex = o.targetTimeIndex;
    }
    return calcZiweiHoroscope(req);
  });

  // 历法（M2）：公农历互转 / 干支 / 节气
  handle("calendar:convert", (payload) => {
    const o = asObject(payload);
    return convertCalendar({
      year: num(o, "year"),
      month: num(o, "month"),
      day: num(o, "day"),
      hour: num(o, "hour"),
      minute: num(o, "minute")
    });
  });

  // 真太阳时校正
  handle("calendar:truesolar", (payload) => {
    const o = asObject(payload);
    const req: TrueSolarRequest = {
      year: num(o, "year"),
      month: num(o, "month"),
      day: num(o, "day"),
      hour: num(o, "hour"),
      minute: num(o, "minute"),
      city: str(o, "city") || undefined
    };
    const lon = o.longitude;
    if (typeof lon === "number" && Number.isFinite(lon)) {
      req.longitude = lon;
    }
    return toTrueSolarTime(req);
  });

  // 城市经纬度（供真太阳时选择）
  handle("calendar:cities", () => listCities());

  // 起卦（M6）：梅花三法起卦 / 六爻铜钱与手动录入
  handle("divination:meihua", (payload) => {
    const o = asObject(payload);
    const modeRaw = str(o, "mode", "time");
    const mode: MeihuaMode = (MEIHUA_MODES as readonly string[]).includes(modeRaw)
      ? (modeRaw as MeihuaMode)
      : "time";

    const req: MeihuaRequest = { mode, question: str(o, "question") };

    if (mode === "time") {
      // 优先取显式传入的 datetime（YYYY-MM-DDTHH:mm 或带空格），否则用当前时刻
      const dt = parseDateTime(str(o, "datetime"));
      const parts = divinationTimeParts({
        year: dt.year,
        month: dt.month,
        day: dt.day,
        hour: dt.hour,
        minute: dt.minute
      });
      req.yearZhiIndex = parts.yearZhiIndex;
      req.lunarMonth = parts.lunarMonth;
      req.lunarDay = parts.lunarDay;
      req.hourIndex = parts.hourIndex;
      const result = meihuaQigua(req);
      return {
        ...result,
        lunar: {
          ...result.lunar,
          yearZhi: parts.yearZhi,
          lunarMonthCn: parts.lunarMonthCn,
          lunarDayCn: parts.lunarDayCn,
          hourZhi: parts.hourZhi
        },
        timeParts: parts
      };
    }

    req.num1 = num(o, "num1");
    req.num2 = num(o, "num2");
    if (mode === "baoshu") req.num3 = num(o, "num3");
    return meihuaQigua(req);
  });

  handle("divination:liuyao", (payload) => {
    const o = asObject(payload);
    const mode = str(o, "mode") === "manual" ? "manual" : "coins";
    const req: LiuyaoRequest = { mode, question: str(o, "question") };

    if (mode === "manual") {
      const raw = Array.isArray(o.manualLines) ? o.manualLines : [];
      req.manualLines = raw.map((item) => {
        const l = asObject(item);
        return { value: num(l, "value"), changing: l.changing === true };
      });
    }

    // 用起卦时刻的干支装卦：六神按日干起、旬空按日干支推、月建取月干支
    const dt = parseDateTime(str(o, "datetime"));
    const parts = divinationTimeParts({
      year: dt.year,
      month: dt.month,
      day: dt.day,
      hour: dt.hour,
      minute: dt.minute
    });
    req.dayGanZhi = parts.dayGanZhi;
    req.dayGan = parts.dayGanZhi.slice(0, 1);
    req.monthGanZhi = parts.monthGanZhi;

    const result = liuyaoQigua(req);
    return { ...result, timeParts: parts };
  });

  // 规则库
  handle("rules:list", (payload) => listRules(str(asObject(payload), "system") || undefined));

  handle("rules:save", (payload) => {
    saveUserRule(asObject(payload) as unknown as Rule);
    return { saved: true };
  });

  // 规则库管理（M5）：概览 / 开关 / 删除覆盖 / 新增 / 导入导出
  handle("rules:overview", () => rulesOverview());

  handle("rules:toggle", (payload) => {
    const o = asObject(payload);
    const id = str(o, "id");
    if (!id) throw new Error("缺少规则 id");
    return { changed: setRuleEnabled(id, o.enabled !== false) };
  });

  handle("rules:remove", (payload) => {
    const id = str(asObject(payload), "id");
    if (!id) throw new Error("缺少规则 id");
    return { removed: removeUserRule(id) };
  });

  handle("rules:create", (payload) => {
    createRule(asObject(payload) as unknown as Rule);
    return { created: true };
  });

  handle("rules:export", (payload) => {
    const system = str(asObject(payload), "system") || undefined;
    const json = exportRules(system);
    let count = 0;
    try {
      const parsed = JSON.parse(json) as { rules?: Rule[] } | Rule[];
      count = Array.isArray(parsed) ? parsed.length : (parsed.rules ?? []).length;
    } catch {
      count = 0;
    }
    return { system: system ?? "all", json, count };
  });

  handle("rules:import", (payload) => {
    const o = asObject(payload);
    const mode = str(o, "mode") === "replace" ? "replace" : "merge";
    return importRules(str(o, "json"), mode);
  });

  /* ---------------- 反馈与回测（M7） ---------------- */

  handle("feedback:types", () => eventTypes());

  handle("feedback:create", (payload) => {
    const o = asObject(payload);
    return createFeedback({
      profileId: maybeNum(o, "profileId"),
      date: str(o, "date"),
      eventType: str(o, "eventType"),
      description: str(o, "description")
    });
  });

  handle("feedback:list", (payload) => {
    const o = asObject(payload);
    return listFeedbacks(maybeNum(o, "profileId"), maybeNum(o, "limit") ?? 200);
  });

  handle("feedback:update", (payload) => {
    const o = asObject(payload);
    const id = maybeNum(o, "id");
    if (id === null) throw new Error("缺少记录 id");
    const patch: Record<string, unknown> = {};
    if (typeof o.date === "string") patch.date = o.date;
    if (typeof o.eventType === "string") patch.eventType = o.eventType;
    if (typeof o.description === "string") patch.description = o.description;
    if (typeof o.profileId === "number" || o.profileId === null) patch.profileId = o.profileId;
    const row = updateFeedback(id, patch);
    if (!row) throw new Error(`记录不存在：${id}`);
    return row;
  });

  handle("feedback:delete", (payload) => {
    const id = maybeNum(asObject(payload), "id");
    if (id === null) throw new Error("缺少记录 id");
    return { deleted: deleteFeedback(id) };
  });

  handle("feedback:clear", (payload) => ({
    removed: clearFeedbacks(maybeNum(asObject(payload), "profileId"))
  }));

  handle("feedback:backtest", (payload) => {
    const o = asObject(payload);
    const req: BacktestRequest = {
      dateFrom: str(o, "dateFrom"),
      dateTo: str(o, "dateTo"),
      profileId: maybeNum(o, "profileId")
    };
    const birth = reportBirth(o.birth);
    if (birth) req.birth = birth;
    return backtest(req);
  });

  handle("feedback:export", (payload) => {
    const o = asObject(payload);
    const req: BacktestRequest = {
      dateFrom: str(o, "dateFrom"),
      dateTo: str(o, "dateTo"),
      profileId: maybeNum(o, "profileId")
    };
    const birth = reportBirth(o.birth);
    if (birth) req.birth = birth;
    const result = backtest(req);
    return exportDataFile(backtestCsv(result), ".csv", `回测记录-${result.dateFrom}_${result.dateTo}`);
  });

  // 模板与报告（M5）
  handle("templates:list", () => listTemplates());

  handle("report:build", (payload) => {
    const o = asObject(payload);
    const scope = str(o, "scope") === "range" ? "range" : "daily";
    const date = str(o, "date") || toYmdNow();
    const req: ReportRequest = { scope, date };
    const days = maybeNum(o, "days");
    if (days !== null) req.days = days;
    const templateId = str(o, "templateId");
    if (templateId) req.templateId = templateId;
    const profileId = maybeNum(o, "profileId");
    if (profileId !== null) req.profileId = profileId;
    const profileName = str(o, "profileName");
    if (profileName) req.profileName = profileName;
    const birth = reportBirth(o.birth);
    if (birth) req.birth = birth;
    if (o.withKnowledge === false) req.withKnowledge = false;
    return buildReport(req);
  });

  handle("report:save", (payload) => {
    // 允许直接传 build 结果，也支持传 id 之外的最小字段由前端回传 contentMd
    const o = asObject(payload);
    const result = o.result && typeof o.result === "object" ? asObject(o.result) : o;
    if (!str(result, "contentMd")) throw new Error("报告内容为空，无法保存");
    return { id: saveReport(result as unknown as Parameters<typeof saveReport>[0]) };
  });

  handle("report:list", (payload) => {
    const o = asObject(payload);
    const profileId = maybeNum(o, "profileId");
    const limit = maybeNum(o, "limit");
    return listReports(profileId, limit ?? 50);
  });

  handle("report:get", (payload) => {
    const id = maybeNum(asObject(payload), "id");
    if (id === null) throw new Error("缺少报告 id");
    const found = getReport(id);
    if (!found) throw new Error(`报告不存在：${id}`);
    return found;
  });

  handle("report:delete", (payload) => {
    const id = maybeNum(asObject(payload), "id");
    if (id === null) throw new Error("缺少报告 id");
    return { deleted: deleteReport(id) };
  });

  handle("report:clear", (payload) => {
    const profileId = maybeNum(asObject(payload), "profileId");
    return { removed: clearReports(profileId) };
  });

  handle("report:export", (payload) => {
    const o = asObject(payload);
    const id = maybeNum(o, "id");
    if (id !== null) {
      const found = getReport(id);
      if (!found) throw new Error(`报告不存在：${id}`);
      return exportReportFile(found.content_md, found.title);
    }
    const contentMd = str(o, "contentMd");
    return exportReportFile(contentMd, str(o, "title", "xuanshu-report"));
  });

  // 流日运势（M4）：黄历 + 可选个人命盘（八字 / 紫微流日）→ 五类注意事项
  handle("daily:fortune", (payload) => {
    const o = asObject(payload);
    const year = num(o, "year");
    const month = num(o, "month");
    const day = num(o, "day");

    const rawBirth = o.birth && typeof o.birth === "object" ? asObject(o.birth) : null;
    let resolved: ResolvedBirthTime | null = null;
    let birth: Parameters<typeof calcDaily>[0]["birth"];

    if (rawBirth && typeof rawBirth.year === "number" && Number.isFinite(rawBirth.year)) {
      resolved = resolveBirthTime(birthInput(rawBirth));
      birth = {
        gender: str(rawBirth, "gender", "男"),
        year: resolved.year,
        month: resolved.month,
        day: resolved.day,
        timeIndex: resolved.timeIndex,
        hour: resolved.hour,
        minute: resolved.minute,
        calendar: str(rawBirth, "calendar", "solar") === "lunar" ? "lunar" : "solar"
      };
    }

    const result = calcDaily(birth ? { year, month, day, birth } : { year, month, day });

    // 带了档案 id 就顺手落库（同日覆盖），失败不影响返回结果
    const profileId = maybeNum(o, "profileId");
    let savedId: number | null = null;
    if (profileId !== null) {
      try {
        savedId = saveDailyFortune(profileId, result.date, {
          bazi: result.bazi,
          ziwei: result.ziwei,
          personal: result.personal
        }, result.advice);
      } catch {
        savedId = null;
      }
    }

    return {
      ...result,
      savedId,
      meta: resolved ? { birth: birthMeta(resolved) } : null
    };
  });

  // 读取已保存的流日快照（M5）
  handle("daily:saved", (payload) => {
    const o = asObject(payload);
    const profileId = maybeNum(o, "profileId");
    const date = str(o, "date");
    if (profileId === null || !date) return null;
    return getDailyFortune(profileId, date);
  });

  /* ---------------- 数据更新（M8） ---------------- */

  handle("update:overview", () => dataOverview());
  handle("update:settings", () => getUpdateSettings());

  handle("update:set-settings", (payload) => {
    const o = asObject(payload);
    const patch: { sourceUrl?: string; autoCheck?: boolean } = {};
    if (typeof o.sourceUrl === "string") patch.sourceUrl = o.sourceUrl;
    if (typeof o.autoCheck === "boolean") patch.autoCheck = o.autoCheck;
    return setUpdateSettings(patch);
  });

  handleAsync("update:check", (payload) => checkUpdate(str(asObject(payload), "sourceUrl") || undefined));

  handleAsync("update:run", (payload) => {
    const o = asObject(payload);
    const opts: UpdateOptions = {};
    if (o.force === true) opts.force = true;
    if (o.noBackup === true) opts.noBackup = true;
    if (Array.isArray(o.only)) {
      const kinds = (o.only as unknown[]).filter((k): k is ResourceKind =>
        typeof k === "string" && (RESOURCE_KINDS as string[]).includes(k)
      );
      if (kinds.length) opts.only = kinds;
    }
    return runUpdate(str(o, "sourceUrl") || undefined, opts);
  });

  handle("update:logs", (payload) => updateLogs(maybeNum(asObject(payload), "limit") ?? 50));
  handle("update:clear-logs", () => ({ removed: clearUpdateLogs() }));
  handle("update:backups", () => listBackups());

  handle("update:rollback", (payload) => {
    const name = str(asObject(payload), "backup") || undefined;
    return rollback(name);
  });

  handle("update:drop-backup", (payload) => {
    const name = str(asObject(payload), "backup");
    if (!name) throw new Error("缺少备份名称");
    return { dropped: dropBackup(name) };
  });

  // 导出命盘图片：渲染进程用 canvas 生成 PNG 的 dataURL，这里负责落盘
  handle("export:image", (payload) => {
    const o = asObject(payload);
    const dataUrl = str(o, "dataUrl");
    const prefix = "data:image/png;base64,";
    if (!dataUrl.startsWith(prefix)) {
      throw new Error("导出数据无效：需要 data:image/png;base64 形式的图片");
    }
    const base64 = dataUrl.slice(prefix.length);
    if (!base64) throw new Error("导出数据为空");

    const safeName = str(o, "fileName", "xuanshu-chart").replace(/[\\/:*?"<>|\s]+/g, "_");
    const dir = path.join(app.getPath("pictures"), "XuanShu");
    fs.mkdirSync(dir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const file = path.join(dir, `${safeName}-${stamp}.png`);
    fs.writeFileSync(file, Buffer.from(base64, "base64"));

    return { saved: true, path: file, dir };
  });
}
