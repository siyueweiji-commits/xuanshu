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

  // 首次启动免责声明：默认放行，避免挡住所有截图；
  // 设 XUANSHU_SHOT_DISCLAIMER=1 时返回未接受，用于单独截弹窗。
  "app:disclaimer": () => ({
    accepted: process.env.XUANSHU_SHOT_DISCLAIMER !== "1",
    acceptedVersion: "",
    currentVersion: "0.1.0",
    text: [
      "玄枢是一款**文化娱乐工具**，用于个人自省与命理学习研究。",
      "",
      "所有排盘、卦象、运势、报告与注意事项输出均仅供娱乐参考，不构成任何医疗、法律、投资或驾驶安全建议，也不承诺任何预测准确性。请勿据此做出重大决策。",
      "",
      "全部数据（档案、命盘、报告、卦例、事件记录）只保存在本机数据目录，不会上传到任何云端服务器；具备联网条件时，应用仅从公开更新源拉取规则库与知识库，不会上传本地数据。"
    ].join("\n")
  }),
  "app:accept-disclaimer": () => ({
    accepted: true,
    acceptedVersion: "0.1.0",
    currentVersion: "0.1.0",
    text: ""
  }),

  /* ---------- M10：偏好 / 数据管理（截图用静态数据） ---------- */

  "app:prefs": () => ({ theme: process.env.XUANSHU_SHOT_THEME || "system", useTrueSolar: false, defaultCity: "孝感" }),
  "app:set-prefs": (o) => ({ theme: str(o, "theme", "system"), useTrueSolar: o.useTrueSolar === true, defaultCity: str(o, "defaultCity") }),
  "app:theme-resolved": (o) => ({ applied: str(o, "theme", "light") }),

  "app:data-stats": () => ({
    appName: "玄枢 XuanShu",
    appVersion: "0.1.0",
    dataDir: path.join(process.env.APPDATA || "C:\\Users", "XuanShu"),
    tables: [
      { name: "profiles", rows: 2 },
      { name: "charts", rows: 6 },
      { name: "daily_fortunes", rows: 12 },
      { name: "divinations", rows: 9 },
      { name: "feedbacks", rows: 4 },
      { name: "reports", rows: 2 }
    ],
    settingsCount: 8,
    totalRows: 35
  }),
  "app:export-data": () => ({
    path: path.join(process.env.USERPROFILE || "C:\\Users", "Documents", "XuanShu", "玄枢备份-20260930141200.json"),
    rows: 35,
    settings: 8
  }),
  "app:import-data": () => ({
    mode: "replace",
    tables: [{ name: "profiles", inserted: 2, skipped: 0 }],
    settingsApplied: 8,
    totalInserted: 35,
    skippedSettings: []
  }),
  "app:clear-data": () => ({ removed: { profiles: 2, charts: 6 }, total: 35, keptSettings: true }),
  "app:clear-resource-overrides": () => ({ removed: 0 }),

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

  "feedback:backtest": (o) => mockBacktest(str(o, "dateFrom"), str(o, "dateTo")),

  /* ---------- M8：数据更新（截图用静态数据） ---------- */

  "update:overview": () => ({
    version: "2026.09.30",
    sourceUrl: "https://raw.githubusercontent.com/siyueweiji-commits/xuanshu-data/main",
    autoCheck: true,
    kinds: [
      { kind: "rules", builtin: 5, updated: 5 },
      { kind: "knowledge", builtin: 2, updated: 2 },
      { kind: "templates", builtin: 3, updated: 3 },
      { kind: "data", builtin: 1, updated: 1 }
    ],
    backups: [
      { name: "20260930-141210", files: 11, createdAt: "20260930-141210" },
      { name: "20260930-135002", files: 11, createdAt: "20260930-135002" }
    ]
  }),
  "update:settings": () => ({
    sourceUrl: "https://raw.githubusercontent.com/siyueweiji-commits/xuanshu-data/main",
    autoCheck: true
  }),
  "update:set-settings": (o) => ({ sourceUrl: str(o, "sourceUrl"), autoCheck: o.autoCheck !== false }),
  "update:check": () => ({
    ok: true,
    source: "https://raw.githubusercontent.com/siyueweiji-commits/xuanshu-data/main",
    sourceKind: "http",
    localVersion: "2026.09.20",
    remoteVersion: "2026.09.30",
    hasUpdate: true,
    total: 11,
    changedCount: 4,
    extraLocal: 0,
    error: null,
    files: [
      { path: "rules/huangli.json", kind: "rules", remoteHash: "sha256:8bb63732c1cb5fe5bead884a082742a73a8515554f0c2dd517c65fa7ec91f6cb", localHash: "sha256:11aa2233", isNew: false, changed: true },
      { path: "rules/meihua.json", kind: "rules", remoteHash: "sha256:0e8b1cb3dff08175823f5c095afa9b5a6d17a3f16965ed03063d7fea13cf7a4b", localHash: "sha256:44bb5566", isNew: false, changed: true },
      { path: "knowledge/gua.json", kind: "knowledge", remoteHash: "sha256:9d1e2f3a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6", localHash: null, isNew: true, changed: true },
      { path: "templates/range_report.md", kind: "templates", remoteHash: "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", localHash: "sha256:778899aa", isNew: false, changed: true }
    ]
  }),
  "update:run": () => ({
    ok: true,
    source: "https://raw.githubusercontent.com/siyueweiji-commits/xuanshu-data/main",
    fromVersion: "2026.09.20",
    toVersion: "2026.09.30",
    updated: 4,
    skipped: 7,
    failed: 0,
    backupDir: path.join("C:\\Users", "程倞", "AppData", "Roaming", "XuanShu", "data", ".backup", "20260930-141210"),
    files: [],
    error: null,
    finishedAt: "2026-09-30T14:12:10.000Z"
  }),
  "update:logs": () => [
    { id: 4, source: "https://raw.githubusercontent.com/siyueweiji-commits/xuanshu-data/main", status: "success", message: "2026.09.20 → 2026.09.30：更新 4 / 跳过 7 / 失败 0", created_at: "2026-09-30 14:12:10" },
    { id: 3, source: "rollback", status: "success", message: "回滚到 20260930-135002：还原 11 / 清理 0", created_at: "2026-09-30 13:51:22" },
    { id: 2, source: "https://raw.githubusercontent.com/siyueweiji-commits/xuanshu-data/main", status: "noop", message: "2026.09.20 → 2026.09.20：更新 0 / 跳过 11 / 失败 0", created_at: "2026-09-30 13:50:02" },
    { id: 1, source: "https://127.0.0.1:1/xuanshu-offline-test", status: "failed", message: "0 → 0 失败：fetch failed", created_at: "2026-09-30 13:48:31" }
  ],
  "update:clear-logs": () => ({ removed: 4 }),
  "update:backups": () => [
    { name: "20260930-141210", files: 11, createdAt: "20260930-141210" },
    { name: "20260930-135002", files: 11, createdAt: "20260930-135002" }
  ],
  "update:rollback": () => ({ ok: true, backup: "20260930-141210", restored: 11, removed: 0, error: null }),
  "update:drop-backup": () => ({ dropped: true })
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
