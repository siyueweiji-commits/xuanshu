/**
 * 反馈记录与回测（M7）
 *
 * 两件事：
 *   1. 记录实际发生的事件（罚单 / 破财 / 争吵 / 生病 / 好事 …），与日期、档案关联；
 *   2. 回测：把「事件」与当日「注意事项」对照，统计规则命中率。
 *
 * 命中判定（关键，不能含糊）：
 *   - 凶性事件（破财 / 罚单 / 争吵 / 生病 / 工作压力 / 出行不顺）：
 *     当日同分类下**存在 caution 或 warning 级别的注意事项** → 记为命中（即规则提前警示到）
 *   - 吉性事件（好事）：当日同分类下存在 info 级别注意事项 → 命中
 *   - 中性事件（其他）：不计入命中率，只参与「事件天数」统计
 *
 * 所有数据仅存本地 SQLite，不上传。
 */
import { getDb } from "../db/database";
import { calcDaily, DailyRequest, DailyResult, AdviceGroup } from "./daily";
import { DISCLAIMER } from "./rules";

/* ------------------------------------------------------------------ */
/*  事件类型                                                            */
/* ------------------------------------------------------------------ */

export type EventPolarity = "good" | "bad" | "neutral";

export interface EventTypeMeta {
  key: string;
  /** 关联的注意事项分类；null 表示不参与分类命中 */
  group: AdviceGroup | null;
  polarity: EventPolarity;
  desc: string;
}

export const EVENT_TYPES: EventTypeMeta[] = [
  { key: "好事", group: "事业", polarity: "good", desc: "顺利、有进展、得助" },
  { key: "进财", group: "财运", polarity: "good", desc: "进项、回款、收益" },
  { key: "破财", group: "财运", polarity: "bad", desc: "意外支出、损失" },
  { key: "罚单", group: "出行", polarity: "bad", desc: "违章、罚款、行程受阻" },
  { key: "争吵", group: "人际", polarity: "bad", desc: "口角、冲突、关系紧张" },
  { key: "生病", group: "健康", polarity: "bad", desc: "身体不适、就医" },
  { key: "工作压力", group: "事业", polarity: "bad", desc: "加班、被催、任务受阻" },
  { key: "出行不顺", group: "出行", polarity: "bad", desc: "延误、耽误、路况问题" },
  { key: "其他", group: null, polarity: "neutral", desc: "不参与命中率统计" }
];

const TYPE_MAP = new Map(EVENT_TYPES.map((t) => [t.key, t]));

export function eventTypes(): EventTypeMeta[] {
  return EVENT_TYPES;
}

export function eventTypeMeta(key: string): EventTypeMeta {
  return TYPE_MAP.get(key) ?? TYPE_MAP.get("其他")!;
}

/* ------------------------------------------------------------------ */
/*  CRUD                                                               */
/* ------------------------------------------------------------------ */

export interface FeedbackRow {
  id: number;
  profile_id: number | null;
  date: string;
  event_type: string;
  description: string | null;
  created_at: string;
}

export interface FeedbackInput {
  profileId?: number | null;
  date: string;
  eventType: string;
  description?: string;
}

export interface FeedbackView extends FeedbackRow {
  polarity: EventPolarity;
  group: AdviceGroup | null;
  /** 事件类型中文描述 */
  typeDesc: string;
}

function toView(r: FeedbackRow): FeedbackView {
  const meta = eventTypeMeta(r.event_type);
  return {
    ...r,
    polarity: meta.polarity,
    group: meta.group,
    typeDesc: meta.desc
  };
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function createFeedback(input: FeedbackInput): FeedbackView {
  const date = (input.date ?? "").trim();
  if (!YMD.test(date)) throw new Error(`日期格式应为 YYYY-MM-DD：${date}`);
  const eventType = (input.eventType ?? "").trim();
  if (!TYPE_MAP.has(eventType)) {
    throw new Error(`未知事件类型「${eventType}」，可选：${EVENT_TYPES.map((t) => t.key).join("、")}`);
  }
  const info = getDb()
    .prepare("INSERT INTO feedbacks (profile_id, date, event_type, description) VALUES (?, ?, ?, ?)")
    .run(
      typeof input.profileId === "number" && Number.isFinite(input.profileId) ? input.profileId : null,
      date,
      eventType,
      (input.description ?? "").trim() || null
    );
  const row = getDb().prepare("SELECT * FROM feedbacks WHERE id = ?").get(info.lastInsertRowid) as FeedbackRow;
  return toView(row);
}

export function listFeedbacks(profileId?: number | null, limit = 200): FeedbackView[] {
  const db = getDb();
  const cap = Math.min(1000, Math.max(1, Math.floor(limit) || 200));
  const rows =
    typeof profileId === "number" && Number.isFinite(profileId)
      ? (db
          .prepare("SELECT * FROM feedbacks WHERE profile_id = ? ORDER BY date DESC, id DESC LIMIT ?")
          .all(profileId, cap) as FeedbackRow[])
      : (db.prepare("SELECT * FROM feedbacks ORDER BY date DESC, id DESC LIMIT ?").all(cap) as FeedbackRow[]);
  return rows.map(toView);
}

export function updateFeedback(id: number, patch: Partial<FeedbackInput>): FeedbackView | null {
  const db = getDb();
  const cur = db.prepare("SELECT * FROM feedbacks WHERE id = ?").get(id) as FeedbackRow | undefined;
  if (!cur) return null;
  const date = patch.date !== undefined ? patch.date.trim() : cur.date;
  if (!YMD.test(date)) throw new Error(`日期格式应为 YYYY-MM-DD：${date}`);
  const eventType = patch.eventType !== undefined ? patch.eventType.trim() : cur.event_type;
  if (!TYPE_MAP.has(eventType)) throw new Error(`未知事件类型「${eventType}」`);
  const description =
    patch.description !== undefined ? (patch.description.trim() || null) : cur.description;
  const profileId =
    patch.profileId !== undefined
      ? typeof patch.profileId === "number" && Number.isFinite(patch.profileId)
        ? patch.profileId
        : null
      : cur.profile_id;

  db.prepare("UPDATE feedbacks SET profile_id = ?, date = ?, event_type = ?, description = ? WHERE id = ?").run(
    profileId,
    date,
    eventType,
    description,
    id
  );
  return toView(db.prepare("SELECT * FROM feedbacks WHERE id = ?").get(id) as FeedbackRow);
}

export function deleteFeedback(id: number): boolean {
  return getDb().prepare("DELETE FROM feedbacks WHERE id = ?").run(id).changes > 0;
}

/** 清空反馈记录（按档案或全部）；返回删除条数 */
export function clearFeedbacks(profileId?: number | null): number {
  const db = getDb();
  const info =
    typeof profileId === "number" && Number.isFinite(profileId)
      ? db.prepare("DELETE FROM feedbacks WHERE profile_id = ?").run(profileId)
      : db.prepare("DELETE FROM feedbacks").run();
  return info.changes;
}

/* ------------------------------------------------------------------ */
/*  回测                                                                */
/* ------------------------------------------------------------------ */

export interface BacktestRequest {
  dateFrom: string;
  dateTo: string;
  profileId?: number | null;
  /** 可选生辰，用于让当日注意事项带上个人命盘 */
  birth?: DailyRequest["birth"];
}

export interface EventHitView {
  id: number;
  eventType: string;
  polarity: EventPolarity;
  group: AdviceGroup | null;
  /** 当日该分类下的命中条目 id（已取前 3 条） */
  matched: Array<{ id: string; text: string; level: string }>;
  hit: boolean | null;
  description: string;
}

export interface BacktestDayRow {
  date: string;
  weekday: string;
  adviceCount: number;
  groups: Partial<Record<AdviceGroup, number>>;
  /** 当日最高警示级别 */
  topLevel: string;
  events: EventHitView[];
  /** 有事件且全部命中 */
  allHit: boolean;
  /** 有事件且一条都没命中 */
  allMiss: boolean;
}

export interface BacktestSummary {
  days: number;
  eventDays: number;
  scoredEvents: number;
  hitEvents: number;
  /** 命中率（hitEvents / scoredEvents），0~1 */
  hitRate: number;
  byType: Array<{ eventType: string; total: number; hit: number; rate: number }>;
  byGroup: Array<{ group: AdviceGroup; eventCount: number; hitCount: number; rate: number }>;
  /** 无事件但出现 warning 的天数（作为「未应验的警示」参考） */
  quietDays: number;
  quietWarningDays: number;
  /** 规则命中频次 Top（规则 id → 出现天数） */
  ruleTop: Array<{ id: string; days: number; text: string }>;
}

export interface BacktestResult {
  dateFrom: string;
  dateTo: string;
  profileId: number | null;
  summary: BacktestSummary;
  rows: BacktestDayRow[];
  disclaimer: string;
}

const LEVEL_RANK: Record<string, number> = { info: 0, caution: 1, warning: 2 };

function parseYmd(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s ?? "").trim());
  if (!m) throw new Error(`日期格式应为 YYYY-MM-DD：${s}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function toYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

const WEEK_CN = ["日", "一", "二", "三", "四", "五", "六"];

/** 判断一个事件在当日注意事项里是否算命中 */
function judge(
  meta: EventTypeMeta,
  day: DailyResult
): { hit: boolean | null; matched: Array<{ id: string; text: string; level: string }> } {
  if (meta.polarity === "neutral" || !meta.group) return { hit: null, matched: [] };
  const list = day.groups[meta.group] ?? [];
  const matched = list
    .filter((a) =>
      meta.polarity === "bad" ? a.level === "caution" || a.level === "warning" : a.level === "info"
    )
    .slice(0, 3)
    .map((a) => ({ id: a.id, text: a.text, level: a.level }));
  return { hit: matched.length > 0, matched };
}

export function backtest(req: BacktestRequest): BacktestResult {
  const from = parseYmd(req.dateFrom);
  const to = parseYmd(req.dateTo);
  if (to.getTime() < from.getTime()) throw new Error("结束日期不能早于开始日期");
  const span = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  if (span > 400) throw new Error(`回测区间过长（${span} 天），请控制在 400 天以内`);

  const feedbacks = listFeedbacks(req.profileId ?? null, 1000).filter(
    (f) => f.date >= req.dateFrom && f.date <= req.dateTo
  );
  const byDate = new Map<string, FeedbackView[]>();
  for (const f of feedbacks) {
    const arr = byDate.get(f.date) ?? [];
    arr.push(f);
    byDate.set(f.date, arr);
  }

  const rows: BacktestDayRow[] = [];
  const ruleDays = new Map<string, { days: number; text: string }>();
  let scored = 0;
  let hits = 0;
  let eventDays = 0;
  let quietDays = 0;
  let quietWarningDays = 0;
  const typeAgg = new Map<string, { total: number; hit: number }>();
  const groupAgg = new Map<AdviceGroup, { eventCount: number; hitCount: number }>();

  for (let i = 0; i < span; i += 1) {
    const d = addDays(from, i);
    const ymd = toYmd(d);
    const daily = calcDaily(
      req.birth
        ? { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), birth: req.birth }
        : { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
    );

    for (const a of daily.advice) {
      const cur = ruleDays.get(a.id) ?? { days: 0, text: a.text };
      cur.days += 1;
      ruleDays.set(a.id, cur);
    }

    const groups: Partial<Record<AdviceGroup, number>> = {};
    let topLevel = "info";
    for (const a of daily.advice) {
      groups[a.group] = (groups[a.group] ?? 0) + 1;
      if (LEVEL_RANK[a.level] > LEVEL_RANK[topLevel]) topLevel = a.level;
    }

    const evs = byDate.get(ymd) ?? [];
    const eventViews: EventHitView[] = evs.map((f) => {
      const meta = eventTypeMeta(f.event_type);
      const verdict = judge(meta, daily);
      if (verdict.hit !== null) {
        scored += 1;
        if (verdict.hit) hits += 1;
        const t = typeAgg.get(f.event_type) ?? { total: 0, hit: 0 };
        t.total += 1;
        if (verdict.hit) t.hit += 1;
        typeAgg.set(f.event_type, t);
        if (meta.group) {
          const g = groupAgg.get(meta.group) ?? { eventCount: 0, hitCount: 0 };
          g.eventCount += 1;
          if (verdict.hit) g.hitCount += 1;
          groupAgg.set(meta.group, g);
        }
      }
      return {
        id: f.id,
        eventType: f.event_type,
        polarity: f.polarity,
        group: f.group,
        matched: verdict.matched,
        hit: verdict.hit,
        description: f.description ?? ""
      };
    });

    if (evs.length > 0) eventDays += 1;
    else {
      quietDays += 1;
      if (topLevel === "warning") quietWarningDays += 1;
    }

    const scoredEvents = eventViews.filter((e) => e.hit !== null);
    rows.push({
      date: ymd,
      weekday: WEEK_CN[d.getDay()],
      adviceCount: daily.advice.length,
      groups,
      topLevel,
      events: eventViews,
      allHit: scoredEvents.length > 0 && scoredEvents.every((e) => e.hit === true),
      allMiss: scoredEvents.length > 0 && scoredEvents.every((e) => e.hit === false)
    });
  }

  const ruleTop = [...ruleDays.entries()]
    .map(([id, v]) => ({ id, days: v.days, text: v.text }))
    .sort((a, b) => b.days - a.days || a.id.localeCompare(b.id))
    .slice(0, 12);

  return {
    dateFrom: req.dateFrom,
    dateTo: req.dateTo,
    profileId: req.profileId ?? null,
    summary: {
      days: span,
      eventDays,
      scoredEvents: scored,
      hitEvents: hits,
      hitRate: scored === 0 ? 0 : hits / scored,
      byType: [...typeAgg.entries()]
        .map(([eventType, v]) => ({
          eventType,
          total: v.total,
          hit: v.hit,
          rate: v.total === 0 ? 0 : v.hit / v.total
        }))
        .sort((a, b) => b.total - a.total),
      byGroup: [...groupAgg.entries()]
        .map(([group, v]) => ({
          group,
          eventCount: v.eventCount,
          hitCount: v.hitCount,
          rate: v.eventCount === 0 ? 0 : v.hitCount / v.eventCount
        }))
        .sort((a, b) => b.eventCount - a.eventCount),
      quietDays,
      quietWarningDays,
      ruleTop
    },
    rows,
    disclaimer: DISCLAIMER
  };
}

/** 把回测结果导成 CSV（不含正文，纯统计表） */
export function backtestCsv(result: BacktestResult): string {
  const lines: string[] = [];
  lines.push("日期,星期,事项数,最高级别,事件,事件类型,是否命中,说明");
  const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
  for (const r of result.rows) {
    if (r.events.length === 0) {
      lines.push([r.date, r.weekday, r.adviceCount, r.topLevel, "", "", "", ""].join(","));
      continue;
    }
    for (const e of r.events) {
      lines.push(
        [
          r.date,
          r.weekday,
          r.adviceCount,
          r.topLevel,
          esc(e.eventType),
          esc(e.group ?? ""),
          e.hit === null ? "不计分" : e.hit ? "命中" : "未命中",
          esc(e.description)
        ].join(",")
      );
    }
  }
  return lines.join("\r\n") + "\r\n";
}
