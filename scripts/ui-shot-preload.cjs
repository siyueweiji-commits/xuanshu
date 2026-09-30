/**
 * UI 截图验证用的「假 preload」。
 * 不启动主进程 / SQLite，直接 require 已编译的服务层（纯计算、无原生依赖），
 * 让渲染层拿到真实排盘数据，从而截出可信的界面。
 *
 * 仅供 scripts/ui-shot.cjs 使用，不参与打包。
 */
const path = require("node:path");
const { contextBridge } = require("electron");

const SVC = path.join(__dirname, "..", "dist-electron", "services");
const calendar = require(path.join(SVC, "calendar.js"));
const ziwei = require(path.join(SVC, "ziwei.js"));
const bazi = require(path.join(SVC, "bazi.js"));
const meihua = require(path.join(SVC, "meihua.js"));
const liuyao = require(path.join(SVC, "liuyao.js"));
const daily = require(path.join(SVC, "daily.js"));
const rules = require(path.join(SVC, "rules.js"));
const report = require(path.join(SVC, "report.js"));

function asObject(p) {
  return p && typeof p === "object" ? p : {};
}
function num(o, k, fb = 0) {
  const v = o[k];
  return typeof v === "number" && Number.isFinite(v) ? v : fb;
}
function str(o, k, fb = "") {
  const v = o[k];
  return typeof v === "string" ? v : fb;
}

function birthInput(o) {
  const input = {
    year: num(o, "year"),
    month: num(o, "month"),
    day: num(o, "day"),
    city: str(o, "city") || undefined,
    useTrueSolar: o.useTrueSolar === true
  };
  if (typeof o.hour === "number") input.hour = o.hour;
  if (typeof o.minute === "number") input.minute = o.minute;
  if (typeof o.timeIndex === "number") input.timeIndex = o.timeIndex;
  return input;
}

function birthMeta(b) {
  return {
    applied: b.applied,
    clockTime: b.detail?.clockTime ?? null,
    trueSolarTime: b.detail?.trueSolarTime ?? null,
    offsetMinutes: b.detail?.totalOffsetMinutes ?? null,
    longitude: b.detail?.longitude ?? null,
    cityName: b.detail?.cityName ?? null,
    timeIndex: b.timeIndex,
    timeName: calendar.SHICHEN_NAMES[b.timeIndex]
  };
}

const MOCK_PROFILES = [
  {
    id: 2,
    name: "示例档案 · 女",
    gender: "female",
    birth_time: "1993-08-16 09:20",
    birth_location: "孝感",
    is_default: 1
  },
  {
    id: 1,
    name: "示例档案 · 男",
    gender: "male",
    birth_time: "1990-01-01 12:30",
    birth_location: "武汉",
    is_default: 0
  }
];

const MOCK_FEEDBACKS = [
  { id: 1, profile_id: null, date: "2026-09-22", event_type: "破财", description: "车胎爆了换胎 680", created_at: "2026-09-22 20:10:00", polarity: "bad", group: "财运", typeDesc: "意外支出、损失" },
  { id: 2, profile_id: null, date: "2026-09-18", event_type: "争吵", description: "和供应商在电话里起了火", created_at: "2026-09-18 17:32:00", polarity: "bad", group: "人际", typeDesc: "口角、冲突、关系紧张" },
  { id: 3, profile_id: null, date: "2026-09-12", event_type: "好事", description: "拖了半年的单子签了", created_at: "2026-09-12 15:02:00", polarity: "good", group: "事业", typeDesc: "顺利、有进展、得助" },
  { id: 4, profile_id: null, date: "2026-09-05", event_type: "生病", description: "肠胃不适，跑了两趟医院", created_at: "2026-09-05 21:40:00", polarity: "bad", group: "健康", typeDesc: "身体不适、就医" }
];

/** 用真实服务层逐日算注意事项，再套上模拟事件，保证截图内容是真实输出 */
function mockBacktest(dateFrom, dateTo) {
  const from = new Date(dateFrom.replace(/-/g, "/"));
  const to = new Date(dateTo.replace(/-/g, "/"));
  const p2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const byDate = new Map();
  for (const f of MOCK_FEEDBACKS) {
    const arr = byDate.get(f.date) || [];
    arr.push(f);
    byDate.set(f.date, arr);
  }

  const rows = [];
  let scored = 0;
  let hits = 0;
  let eventDays = 0;
  let quietDays = 0;
  let quietWarningDays = 0;
  const typeAgg = new Map();
  const groupAgg = new Map();
  const ruleDays = new Map();
  const rank = { info: 0, caution: 1, warning: 2 };

  for (let d = new Date(from.getTime()); d.getTime() <= to.getTime(); d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const r = daily.calcDaily({ year: y, month: m, day: day });
    const evs = byDate.get(ymd(d)) || [];
    const groups = {};
    let top = "info";
    for (const a of r.advice) {
      groups[a.group] = (groups[a.group] || 0) + 1;
      if (rank[a.level] > rank[top]) top = a.level;
      const cur = ruleDays.get(a.id) || { days: 0, text: a.text };
      cur.days += 1;
      ruleDays.set(a.id, cur);
    }
    const events = evs.map((f) => {
      const list = f.group ? r.advice.filter((a) => a.group === f.group) : [];
      const matched = list
        .filter((a) => (f.polarity === "bad" ? a.level !== "info" : a.level === "info"))
        .slice(0, 3)
        .map((a) => ({ id: a.id, text: a.text, level: a.level }));
      const hit = f.polarity === "neutral" ? null : matched.length > 0;
      if (hit !== null) {
        scored += 1;
        if (hit) hits += 1;
        const t = typeAgg.get(f.event_type) || { total: 0, hit: 0 };
        t.total += 1;
        if (hit) t.hit += 1;
        typeAgg.set(f.event_type, t);
        if (f.group) {
          const g = groupAgg.get(f.group) || { eventCount: 0, hitCount: 0 };
          g.eventCount += 1;
          if (hit) g.hitCount += 1;
          groupAgg.set(f.group, g);
        }
      }
      return { id: f.id, eventType: f.event_type, polarity: f.polarity, group: f.group, matched, hit, description: f.description };
    });
    if (evs.length) eventDays += 1;
    else {
      quietDays += 1;
      if (top === "warning") quietWarningDays += 1;
    }
    const sc = events.filter((e) => e.hit !== null);
    rows.push({
      date: ymd(d),
      weekday: "日一二三四五六"[d.getDay()],
      adviceCount: r.advice.length,
      groups,
      topLevel: top,
      events,
      allHit: sc.length > 0 && sc.every((e) => e.hit === true),
      allMiss: sc.length > 0 && sc.every((e) => e.hit === false)
    });
  }

  return {
    dateFrom,
    dateTo,
    profileId: null,
    summary: {
      days: rows.length,
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
      byGroup: [...groupAgg.entries()].map(([group, v]) => ({
        group,
        eventCount: v.eventCount,
        hitCount: v.hitCount,
        rate: v.eventCount === 0 ? 0 : v.hitCount / v.eventCount
      })),
      quietDays,
      quietWarningDays,
      ruleTop: [...ruleDays.entries()]
        .map(([id, v]) => ({ id, days: v.days, text: v.text }))
        .sort((a, b) => b.days - a.days || a.id.localeCompare(b.id))
        .slice(0, 12)
    },
    rows,
    disclaimer: "本应用为文化娱乐工具，所有输出仅供自省参考，不构成医疗、法律、投资或安全建议。"
  };
}

const HANDLERS = {
  "app:info": () => ({
    appName: "玄枢 XuanShu",
    appVersion: "0.1.0",
    platform: process.platform,
    userDataDir: path.join(process.env.APPDATA || "C:\\Users", "XuanShu"),
    dataDir: path.join(process.env.APPDATA || "C:\\Users", "XuanShu", "data")
  }),

  "profile:list": () => MOCK_PROFILES,
  "profile:create": () => ({ id: 3 }),
  "profile:delete": (o) => ({ deleted: num(o, "id") }),

  "calendar:cities": () => calendar.listCities(),
  "calendar:convert": (o) =>
    calendar.convertCalendar({
      year: num(o, "year"),
      month: num(o, "month"),
      day: num(o, "day"),
      hour: num(o, "hour"),
      minute: num(o, "minute")
    }),
  "calendar:truesolar": (o) => {
    const req = {
      year: num(o, "year"),
      month: num(o, "month"),
      day: num(o, "day"),
      hour: num(o, "hour"),
      minute: num(o, "minute"),
      city: str(o, "city") || undefined
    };
    if (typeof o.longitude === "number") req.longitude = o.longitude;
    return calendar.toTrueSolarTime(req);
  },

  "chart:ziwei": (o) => {
    const b = calendar.resolveBirthTime(birthInput(o));
    return {
      ...ziwei.calcZiwei({
        gender: str(o, "gender", "男"),
        year: b.year,
        month: b.month,
        day: b.day,
        timeIndex: b.timeIndex,
        calendar: str(o, "calendar", "solar")
      }),
      meta: { birth: birthMeta(b) }
    };
  },

  "chart:ziwei-horoscope": (o) => {
    const b = calendar.resolveBirthTime(birthInput(o));
    return ziwei.calcZiweiHoroscope({
      gender: str(o, "gender", "男"),
      year: b.year,
      month: b.month,
      day: b.day,
      timeIndex: b.timeIndex,
      calendar: str(o, "calendar", "solar"),
      targetYear: num(o, "targetYear"),
      targetMonth: num(o, "targetMonth"),
      targetDay: num(o, "targetDay")
    });
  },

  "chart:bazi": (o) => {
    const b = calendar.resolveBirthTime(birthInput(o));
    const req = {
      gender: str(o, "gender", "男"),
      year: b.year,
      month: b.month,
      day: b.day,
      hour: b.hour,
      minute: b.minute
    };
    if (typeof o.focusYear === "number" && Number.isFinite(o.focusYear)) req.focusYear = o.focusYear;
    return {
      ...bazi.calcBazi(req),
      meta: { birth: birthMeta(b) }
    };
  },

  "divination:meihua": (o) => {
    const mode = ["time", "numbers", "baoshu"].includes(str(o, "mode")) ? str(o, "mode") : "time";
    const req = { mode, question: str(o, "question") };
    if (mode === "time") {
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2}))?/.exec(str(o, "datetime"));
      const now = new Date();
      const parts = calendar.divinationTimeParts(
        m
          ? { year: +m[1], month: +m[2], day: +m[3], hour: m[4] ? +m[4] : 0, minute: m[5] ? +m[5] : 0 }
          : { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour: now.getHours(), minute: now.getMinutes() }
      );
      req.yearZhiIndex = parts.yearZhiIndex;
      req.lunarMonth = parts.lunarMonth;
      req.lunarDay = parts.lunarDay;
      req.hourIndex = parts.hourIndex;
      const r = meihua.qigua(req);
      return {
        ...r,
        lunar: {
          ...r.lunar,
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
    return meihua.qigua(req);
  },

  "divination:liuyao": (o) => {
    const mode = str(o, "mode") === "manual" ? "manual" : "coins";
    const req = { mode, question: str(o, "question") };
    if (mode === "manual") {
      req.manualLines = (Array.isArray(o.manualLines) ? o.manualLines : []).map((l) => ({
        value: num(l, "value"),
        changing: l && l.changing === true
      }));
    }
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2}))?/.exec(str(o, "datetime"));
    const now = new Date();
    const parts = calendar.divinationTimeParts(
      m
        ? { year: +m[1], month: +m[2], day: +m[3], hour: m[4] ? +m[4] : 0, minute: m[5] ? +m[5] : 0 }
        : { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour: now.getHours(), minute: now.getMinutes() }
    );
    req.dayGanZhi = parts.dayGanZhi;
    req.dayGan = parts.dayGanZhi.slice(0, 1);
    req.monthGanZhi = parts.monthGanZhi;
    const r = liuyao.qigua(req);
    return { ...r, timeParts: parts };
  },

  "daily:fortune": (o) => {
    const raw = o.birth && typeof o.birth === "object" ? o.birth : null;
    let birth;
    let meta = null;
    if (raw && typeof raw.year === "number" && Number.isFinite(raw.year)) {
      const b = calendar.resolveBirthTime(birthInput(raw));
      birth = {
        gender: str(raw, "gender", "男"),
        year: b.year,
        month: b.month,
        day: b.day,
        timeIndex: b.timeIndex,
        hour: b.hour,
        minute: b.minute,
        calendar: str(raw, "calendar", "solar")
      };
      meta = { birth: birthMeta(b) };
    }
    const result = daily.calcDaily(
      birth
        ? { year: num(o, "year"), month: num(o, "month"), day: num(o, "day"), birth }
        : { year: num(o, "year"), month: num(o, "month"), day: num(o, "day") }
    );
    return { ...result, meta };
  },

  "export:image": () => ({
    saved: true,
    path: path.join("C:\\Users", "Pictures", "XuanShu", "紫微命盘-1990-01-01-20260101120000.png")
  }),

  /* ---------- M5：规则库 / 模板 / 报告 ---------- */

  "rules:overview": () => rules.rulesOverview(),
  "rules:list": (o) => rules.listRules(str(o, "system") || undefined),
  "rules:toggle": (o) => ({ changed: rules.setRuleEnabled(str(o, "id"), o.enabled !== false) }),
  "rules:remove": () => ({ removed: true }),
  "rules:export": (o) => {
    const json = rules.exportRules(str(o, "system") || undefined);
    return { system: str(o, "system", "all"), json, count: JSON.parse(json).rules.length };
  },
  "rules:import": () => ({ imported: 3, skipped: 0, systems: ["custom"] }),

  "templates:list": () => report.listTemplates(),

  "report:build": (o) => {
    const raw = o.birth && typeof o.birth === "object" ? o.birth : null;
    const req = { scope: str(o, "scope") === "range" ? "range" : "daily", date: str(o, "date") };
    if (typeof o.days === "number") req.days = o.days;
    if (str(o, "templateId")) req.templateId = str(o, "templateId");
    req.profileName = str(o, "profileName", "本人生辰");
    if (raw && typeof raw.year === "number" && Number.isFinite(raw.year)) {
      const b = calendar.resolveBirthTime(birthInput(raw));
      req.birth = {
        gender: str(raw, "gender", "男"),
        year: b.year,
        month: b.month,
        day: b.day,
        timeIndex: b.timeIndex,
        hour: b.hour,
        minute: b.minute,
        calendar: str(raw, "calendar", "solar")
      };
    }
    return report.buildReport(req);
  },
  "report:save": () => ({ id: 7 }),
  "report:list": () => [
    {
      id: 7,
      profile_id: null,
      scope: "daily",
      template_id: "daily_report",
      title: "流日参考报告 · 2026-09-30",
      date_from: "2026-09-30",
      date_to: "2026-09-30",
      created_at: "2026-09-30 12:52:10",
      summary: { adviceCount: 10 }
    },
    {
      id: 6,
      profile_id: null,
      scope: "range",
      template_id: "range_report",
      title: "流日区间报告 · 2026-09-28 ~ 2026-10-04",
      date_from: "2026-09-28",
      date_to: "2026-10-04",
      created_at: "2026-09-30 12:40:02",
      summary: { days: 7, totalAdvice: 70 }
    }
  ],
  "report:get": () => ({ content_md: "" }),
  "report:delete": () => ({ deleted: true }),
  "report:clear": () => ({ removed: 0 }),
  "report:export": () => ({
    saved: true,
    path: path.join("C:\\Users", "Documents", "XuanShu", "流日参考报告-20260930125210.md")
  }),
  "daily:saved": () => null,

  /* ---------- M7：反馈与回测（截图用静态数据，不落库） ---------- */

  "feedback:types": () => [
    { key: "好事", group: "事业", polarity: "good", desc: "顺利、有进展、得助" },
    { key: "进财", group: "财运", polarity: "good", desc: "进项、回款、收益" },
    { key: "破财", group: "财运", polarity: "bad", desc: "意外支出、损失" },
    { key: "罚单", group: "出行", polarity: "bad", desc: "违章、罚款、行程受阻" },
    { key: "争吵", group: "人际", polarity: "bad", desc: "口角、冲突、关系紧张" },
    { key: "生病", group: "健康", polarity: "bad", desc: "身体不适、就医" },
    { key: "工作压力", group: "事业", polarity: "bad", desc: "加班、被催、任务受阻" },
    { key: "出行不顺", group: "出行", polarity: "bad", desc: "延误、耽误、路况问题" },
    { key: "其他", group: null, polarity: "neutral", desc: "不参与命中率统计" }
  ],

  "feedback:list": () => MOCK_FEEDBACKS,

  "feedback:create": (o) => ({
    id: 99,
    profile_id: null,
    date: str(o, "date"),
    event_type: str(o, "eventType"),
    description: str(o, "description") || null,
    created_at: "2026-09-30 13:40:00",
    polarity: "bad",
    group: "财运",
    typeDesc: "意外支出、损失"
  }),
  "feedback:update": (o) => ({ id: num(o, "id") }),
  "feedback:delete": () => ({ deleted: true }),
  "feedback:clear": () => ({ removed: 0 }),
  "feedback:export": () => ({
    saved: true,
    path: path.join("C:\\Users", "Documents", "XuanShu", "回测记录-2026-09-01_2026-09-30-20260930134000.csv")
  }),

  "feedback:backtest": (o) => mockBacktest(str(o, "dateFrom"), str(o, "dateTo"))
};

contextBridge.exposeInMainWorld("xuanshu", {
  invoke: async (channel, payload) => {
    const fn = HANDLERS[channel];
    if (!fn) return { ok: false, error: `[ui-shot] 未模拟的通道：${channel}` };
    try {
      return { ok: true, data: await fn(asObject(payload)) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
});
