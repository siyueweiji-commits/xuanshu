/**
 * 报告生成（M5）
 *
 * 设计要点：
 *   1. **纯函数**：`buildReport` 不碰数据库，只做「算 + 拼」，方便脱离 Electron 校验。
 *   2. **模板驱动**：报告版式来自 `resources/templates/*.md`，改模板不需要改代码。
 *   3. **规则约束**：报告里的每一条提示都来自已启用的规则（含 M4 的黄历/八字/紫微规则），
 *      不做任何自由发挥，避免「胡说」。
 *   4. **切段输出**：除 Markdown 全文外，同时按 `##` 标题切成 sections，UI 直接渲染结构，
 *      不必在前端再实现一个 Markdown 解析器。
 */
import fs from "node:fs";
import { builtinDir, resolveResource } from "./dataPaths";
import { calcDaily, DailyResult, AdviceItem, ADVICE_GROUPS, AdviceGroup } from "./daily";
import { renderTemplate } from "./template";
import { starBriefs } from "./knowledge";
import { DISCLAIMER } from "./rules";

/* ------------------------------------------------------------------ */
/*  模板                                                               */
/* ------------------------------------------------------------------ */

export interface TemplateMeta {
  id: string;
  name: string;
  scope: "daily" | "range";
  file: string;
  desc: string;
}

export function builtinTemplatesDir(): string {
  return builtinDir("templates");
}

/** 读取模板文件：用户目录优先（更新落地），其次内置 */
function readTemplateFile(file: string): string | null {
  const p = resolveResource("templates", file);
  if (!p) return null;
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return null;
  }
}

interface TemplateIndex {
  version?: string;
  templates?: TemplateMeta[];
}

const FALLBACK_TEMPLATES: TemplateMeta[] = [
  { id: "daily_report", name: "流日参考报告", scope: "daily", file: "daily_report.md", desc: "" },
  { id: "range_report", name: "流日区间报告", scope: "range", file: "range_report.md", desc: "" }
];

export function listTemplates(): TemplateMeta[] {
  try {
    const raw = readTemplateFile("index.json");
    const parsed = raw ? (JSON.parse(raw) as TemplateIndex) : null;
    const list = (parsed?.templates ?? []).filter(
      (t) => t && typeof t.id === "string" && typeof t.file === "string"
    );
    if (list.length) return list;
  } catch {
    /* 走兜底 */
  }
  return FALLBACK_TEMPLATES;
}

function readTemplate(id: string): { meta: TemplateMeta; source: string } {
  const meta =
    listTemplates().find((t) => t.id === id) ??
    FALLBACK_TEMPLATES.find((t) => t.id === id) ??
    FALLBACK_TEMPLATES[0];
  const source = readTemplateFile(meta.file);
  if (source === null) throw new Error(`模板文件缺失：${meta.file}`);
  return { meta, source };
}

/* ------------------------------------------------------------------ */
/*  请求 / 响应                                                        */
/* ------------------------------------------------------------------ */

export interface ReportBirthInput {
  gender: string;
  year: number;
  month: number;
  day: number;
  timeIndex: number;
  hour: number;
  minute: number;
  calendar?: "solar" | "lunar";
}

export interface ReportRequest {
  scope: "daily" | "range";
  /** daily：目标日期；range：起始日期 */
  date: string;
  /** range 模式的天数（1～90，默认 7） */
  days?: number;
  templateId?: string;
  profileId?: number | null;
  profileName?: string;
  birth?: ReportBirthInput;
  /** 是否附上主星释义（默认 true） */
  withKnowledge?: boolean;
}

export interface ReportSection {
  key: string;
  title: string;
  body: string;
}

export interface RangeDayRow {
  date: string;
  weekCn: string;
  dayGanZhi: string;
  zhiXing: string;
  xiu: string;
  xiuLuck: string;
  count: number;
  top: string;
  level: string;
  advice: AdviceItem[];
  clash: boolean;
}

export interface RangeStats {
  days: number;
  totalAdvice: number;
  byGroup: Record<AdviceGroup, number>;
  rows: RangeDayRow[];
  keyDays: Array<{ date: string; weekCn: string; reason: string }>;
  adviceTop: Array<{ id: string; group: AdviceGroup; text: string; count: number; weight: number }>;
}

export interface ReportResult {
  templateId: string;
  templateName: string;
  scope: "daily" | "range";
  title: string;
  profileId: number | null;
  profileName: string;
  dateFrom: string;
  dateTo: string;
  contentMd: string;
  sections: ReportSection[];
  daily: DailyResult | null;
  range: RangeStats | null;
  vars: Record<string, unknown>;
  hasDisclaimer: boolean;
  generatedAt: string;
  disclaimer: string;
}

/* ------------------------------------------------------------------ */
/*  骨架：把 Markdown 按 `## ` 切段                                     */
/* ------------------------------------------------------------------ */

export function splitSections(md: string): ReportSection[] {
  const out: ReportSection[] = [];
  const head: string[] = [];
  let cur: { title: string; lines: string[] } | null = null;

  for (const line of md.split("\n")) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (cur) out.push({ key: "", title: cur.title, body: cur.lines.join("\n").trim() });
      cur = { title: m[1], lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    } else {
      head.push(line);
    }
  }
  if (cur) out.push({ key: "", title: cur.title, body: cur.lines.join("\n").trim() });

  const headText = head.join("\n").trim();
  if (headText) out.unshift({ key: "", title: "报告概览", body: headText });

  return out.map((s, i) => ({ ...s, key: `sec-${i}` }));
}

/* ------------------------------------------------------------------ */
/*  工具                                                               */
/* ------------------------------------------------------------------ */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseYmd(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s ?? "").trim());
  if (!m) throw new Error(`日期格式应为 YYYY-MM-DD，收到：${s}`);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) throw new Error(`无效日期：${s}`);
  return d;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

function nowStamp(): string {
  const d = new Date();
  return `${toYmd(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function percent(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : "0%";
}

/* ------------------------------------------------------------------ */
/*  单日报告                                                            */
/* ------------------------------------------------------------------ */

function dailyVars(
  day: DailyResult,
  profileName: string,
  withKnowledge: boolean
): Record<string, unknown> {
  const h = day.huangli;
  const zw = day.ziwei;

  const groupSummary = ADVICE_GROUPS.map((g) => {
    const items = day.groups[g] ?? [];
    return { group: g, count: items.length, items: items.map((a) => ({ text: a.text })) };
  }).filter((x) => x.count > 0);

  // 流日命宫主星释义
  const starNotes = withKnowledge && zw ? starBriefs(zw.soulStars) : [];

  const clashNote = day.personal
    ? day.personal.clashToday
      ? `（今日与您相冲：${day.personal.shengXiao} ↔ ${h.chong.shengXiao}，宜静守少动）`
      : `（今日不冲，当日冲${h.chong.shengXiao}）`
    : "";

  return {
    date: h.date,
    dateCn: h.dateCn,
    lunarDate: h.lunarDate,
    weekCn: `星期${h.weekCn}`,
    xingZuo: h.xingZuo,
    season: h.season,
    shengXiao: day.personal?.shengXiao ?? h.shengXiao,
    clashNote,

    yearGanZhi: h.yearInGanZhi,
    monthGanZhi: h.monthInGanZhi,
    dayGanZhi: h.dayInGanZhi,
    timeGanZhi: h.timeInGanZhi,
    naYin: h.naYin,
    wuXing: h.wuXing,

    yi: h.yi,
    ji: h.ji,
    chongSha: `冲${h.chong.shengXiao}（${h.chong.desc}）煞${h.chong.sha}`,
    zhiXing: h.zhiXing,
    xiu: h.xiu.name,
    xiuLuck: h.xiu.luck,
    tianShen: h.tianShen.name,
    tianShenType: h.tianShen.type,
    tianShenLuck: h.tianShen.luck,
    jieQi: h.jieQi.today
      ? `今日交${h.jieQi.today}`
      : h.jieQi.next
        ? `下一节气 ${h.jieQi.next.name} ${h.jieQi.next.date.slice(0, 10)}`
        : "—",
    jiShi: h.auspiciousHours,
    luckyHourCount: h.luckyHourCount,
    caiFang: `${h.positions.cai}（${h.positions.caiDesc}）`,
    xiFang: `${h.positions.xi}（${h.positions.xiDesc}）`,
    pengZu: [h.pengZu.gan, h.pengZu.zhi].filter(Boolean),
    jiShen: h.jiShen,
    xiongSha: h.xiongSha,

    advice: day.advice.map((a) => ({
      group: a.group,
      text: a.text,
      source: a.source,
      level: a.level
    })),
    adviceCount: day.advice.length,
    groupSummary,

    hasBirth: Boolean(day.bazi),
    dayMaster: day.bazi?.dayMaster,
    dayMasterWuXing: day.bazi?.dayMasterWuXing,
    baziLevel: day.bazi?.level,
    favorable: day.bazi?.favorable,
    unfavorable: day.bazi?.unfavorable,
    hasMissing: Boolean(day.bazi?.missing.length),
    missing: day.bazi?.missing,

    landedPalace: zw ? `${zw.daily.landedPalace}宫` : undefined,
    soulStars: zw?.soulStars,
    mutagenLu: zw?.mutagenStars.lu,
    mutagenQuan: zw?.mutagenStars.quan,
    mutagenKe: zw?.mutagenStars.ke,
    mutagenJi: zw?.mutagenStars.ji,
    starNotes: starNotes.map((s) => ({
      name: s.name,
      wuxing: s.wuxing,
      brief: s.brief
    })),

    profileName,
    generatedAt: nowStamp(),
    disclaimer: DISCLAIMER
  };
}

/* ------------------------------------------------------------------ */
/*  区间报告                                                            */
/* ------------------------------------------------------------------ */

function buildRange(
  req: ReportRequest,
  start: Date,
  days: number
): { stats: RangeStats; days: DailyResult[] } {
  const results: DailyResult[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = addDays(start, i);
    results.push(
      calcDaily(
        req.birth
          ? {
              year: d.getFullYear(),
              month: d.getMonth() + 1,
              day: d.getDate(),
              birth: req.birth
            }
          : { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
      )
    );
  }

  const byGroup = ADVICE_GROUPS.reduce(
    (acc, g) => {
      acc[g] = 0;
      return acc;
    },
    {} as Record<AdviceGroup, number>
  );

  const rows: RangeDayRow[] = results.map((r) => {
    const h = r.huangli;
    for (const a of r.advice) byGroup[a.group] += 1;
    const level = r.advice.some((a) => a.level === "warning")
      ? "warning"
      : r.advice.some((a) => a.level === "caution")
        ? "caution"
        : "info";
    return {
      date: h.date,
      weekCn: h.weekCn,
      dayGanZhi: h.dayInGanZhi,
      zhiXing: h.zhiXing,
      xiu: h.xiu.name,
      xiuLuck: h.xiu.luck,
      count: r.advice.length,
      top: r.advice[0]?.text ?? "—",
      level,
      advice: r.advice,
      clash: Boolean(r.personal?.clashToday)
    };
  });

  // 重点日：本人冲煞 / 有 warning 级提示 / 建除为破危闭 / 宿凶
  const BAD_ZHI_XING = new Set(["破", "危", "闭"]);
  const keyDays = rows
    .map((row, i) => {
      const h = results[i].huangli;
      const reasons: string[] = [];
      if (row.clash) reasons.push("日支与生肖相冲");
      if (row.level === "warning") reasons.push("含「留意」级提示");
      if (BAD_ZHI_XING.has(h.zhiXing)) reasons.push(`${h.zhiXing}日宜守不宜进`);
      if (h.xiu.luck === "凶") reasons.push(`${h.xiu.name}宿值凶`);
      return reasons.length ? { date: row.date, weekCn: row.weekCn, reason: reasons.join("；") } : null;
    })
    .filter((x): x is { date: string; weekCn: string; reason: string } => x !== null);

  // 高频提示：按 id 聚合天数
  const counter = new Map<string, { group: AdviceGroup; text: string; count: number; weight: number }>();
  for (const r of results) {
    const seen = new Set<string>();
    for (const a of r.advice) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      const cur = counter.get(a.id);
      if (cur) cur.count += 1;
      else counter.set(a.id, { group: a.group, text: a.text, count: 1, weight: a.weight });
    }
  }
  const adviceTop = [...counter.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.count - a.count || b.weight - a.weight)
    .slice(0, 8);

  return {
    stats: {
      days,
      totalAdvice: results.reduce((n, r) => n + r.advice.length, 0),
      byGroup,
      rows,
      keyDays,
      adviceTop
    },
    days: results
  };
}

function rangeVars(
  stats: RangeStats,
  req: ReportRequest,
  start: Date
): Record<string, unknown> {
  const total = stats.totalAdvice;
  const groupItems = ADVICE_GROUPS.map((g) => {
    const seen = new Map<string, { date: string; text: string }>();
    for (const row of stats.rows) {
      for (const a of row.advice) {
        if (a.group !== g || seen.has(a.id)) continue;
        seen.set(a.id, { date: row.date.slice(5), text: a.text });
      }
    }
    return {
      group: g,
      count: stats.byGroup[g],
      items: [...seen.values()].slice(0, 8)
    };
  }).filter((x) => x.count > 0);

  const end = addDays(start, stats.days - 1);

  return {
    dateFrom: toYmd(start),
    dateTo: toYmd(end),
    days: stats.days,
    totalAdvice: total,
    profileName: req.profileName ?? "未指定档案",
    generatedAt: nowStamp(),

    nCareer: stats.byGroup["事业"],
    nWealth: stats.byGroup["财运"],
    nPeople: stats.byGroup["人际"],
    nHealth: stats.byGroup["健康"],
    nTravel: stats.byGroup["出行"],
    pCareer: percent(stats.byGroup["事业"], total),
    pWealth: percent(stats.byGroup["财运"], total),
    pPeople: percent(stats.byGroup["人际"], total),
    pHealth: percent(stats.byGroup["健康"], total),
    pTravel: percent(stats.byGroup["出行"], total),

    keyDays: stats.keyDays,
    dailyRows: stats.rows.map((r) => ({ ...r, top: r.top.length > 40 ? `${r.top.slice(0, 40)}…` : r.top })),
    adviceTop: stats.adviceTop.map((a) => ({
      group: a.group,
      text: a.text,
      count: a.count
    })),
    groupSummary: groupItems,

    disclaimer: DISCLAIMER
  };
}

/* ------------------------------------------------------------------ */
/*  主入口                                                              */
/* ------------------------------------------------------------------ */

export function buildReport(req: ReportRequest): ReportResult {
  const scope: "daily" | "range" = req.scope === "range" ? "range" : "daily";
  const templateId = req.templateId || (scope === "range" ? "range_report" : "daily_report");
  const { meta, source } = readTemplate(templateId);
  const profileName = req.profileName?.trim() || "未指定档案";
  const withKnowledge = req.withKnowledge !== false;

  const start = parseYmd(req.date);
  let contentMd: string;
  let vars: Record<string, unknown>;
  let daily: DailyResult | null = null;
  let range: RangeStats | null = null;
  let dateFrom = toYmd(start);
  let dateTo = dateFrom;

  if (scope === "range") {
    const days = Math.min(90, Math.max(1, Math.floor(req.days ?? 7)));
    const built = buildRange(req, start, days);
    range = built.stats;
    dateTo = toYmd(addDays(start, days - 1));
    vars = rangeVars(range, req, start);
    contentMd = renderTemplate(source, vars);
  } else {
    daily = calcDaily(
      req.birth
        ? {
            year: start.getFullYear(),
            month: start.getMonth() + 1,
            day: start.getDate(),
            birth: req.birth
          }
        : { year: start.getFullYear(), month: start.getMonth() + 1, day: start.getDate() }
    );
    vars = dailyVars(daily, profileName, withKnowledge);
    contentMd = renderTemplate(source, vars);
  }

  const title =
    scope === "daily"
      ? `${meta.name} · ${dateFrom}`
      : `${meta.name} · ${dateFrom} ~ ${dateTo}`;

  return {
    templateId: meta.id,
    templateName: meta.name,
    scope,
    title,
    profileId: req.profileId ?? null,
    profileName,
    dateFrom,
    dateTo,
    contentMd,
    sections: splitSections(contentMd),
    daily,
    range,
    vars,
    hasDisclaimer: contentMd.includes("不构成任何医疗、法律、投资或驾驶安全建议"),
    generatedAt: nowStamp(),
    disclaimer: DISCLAIMER
  };
}

/** 报告存库时的紧凑快照（避免 data_json 过大） */
export function reportSnapshot(r: ReportResult): Record<string, unknown> {
  return {
    templateId: r.templateId,
    scope: r.scope,
    title: r.title,
    profileName: r.profileName,
    dateFrom: r.dateFrom,
    dateTo: r.dateTo,
    hasDisclaimer: r.hasDisclaimer,
    generatedAt: r.generatedAt,
    advice: r.daily?.advice ?? null,
    rangeStats: r.range
      ? { ...r.range, rows: r.range.rows.map((x) => ({ ...x, advice: undefined })) }
      : null,
    summary: {
      adviceCount: r.daily?.advice.length ?? null,
      days: r.range?.days ?? null,
      totalAdvice: r.range?.totalAdvice ?? null,
      byGroup: r.range?.byGroup ?? null
    }
  };
}
