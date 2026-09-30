import { app, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db/database";
import { calcZiwei, calcZiweiHoroscope, ZiweiRequest, ZiweiHoroscopeRequest } from "../services/ziwei";
import {
  convertCalendar,
  toTrueSolarTime,
  listCities,
  resolveBirthTime,
  SHICHEN_NAMES,
  TrueSolarRequest,
  ResolvedBirthTime
} from "../services/calendar";
import { calcBazi, BaziRequest } from "../services/bazi";
import { shijianQigua, shuziQigua } from "../services/meihua";
import { qigua } from "../services/liuyao";
import { getHuangli } from "../services/huangli";
import { listRules, matchRules, saveUserRule, appDataSummary, DISCLAIMER, Rule } from "../services/rules";

type Handler = (payload: unknown) => unknown;

function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, (_event, payload: unknown) => {
    try {
      return { ok: true, data: fn(payload) };
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
      ...(calcZiwei(req) as Record<string, unknown>),
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
    return {
      ...(calcBazi(req) as Record<string, unknown>),
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

  // 起卦
  handle("divination:meihua", (payload) => {
    const o = asObject(payload);
    if (str(o, "mode") === "numbers") {
      return shuziQigua({ num1: num(o, "num1"), num2: num(o, "num2") });
    }
    return shijianQigua({
      yearZhiIndex: num(o, "yearZhiIndex", 1),
      lunarMonth: num(o, "lunarMonth", 1),
      lunarDay: num(o, "lunarDay", 1),
      hourIndex: num(o, "hourIndex", 1)
    });
  });

  handle("divination:liuyao", (payload) => qigua({ question: str(asObject(payload), "question") }));

  // 规则库
  handle("rules:list", (payload) => listRules(str(asObject(payload), "system") || undefined));

  handle("rules:save", (payload) => {
    saveUserRule(asObject(payload) as unknown as Rule);
    return { saved: true };
  });

  // 流日运势（M4 完善：规则引擎注意事项）
  handle("daily:fortune", (payload) => {
    const o = asObject(payload);
    const huangli = getHuangli({ year: num(o, "year"), month: num(o, "month"), day: num(o, "day") }) as Record<string, unknown>;
    const facts = {
      dayInGanZhi: huangli.dayInGanZhi,
      jieQi: huangli.jieQi
    };
    const advice = matchRules(listRules(), facts).map((r) => r.advice);
    return { huangli, advice, disclaimer: DISCLAIMER };
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
