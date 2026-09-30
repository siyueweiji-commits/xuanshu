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

  "divination:meihua": (o) =>
    str(o, "mode") === "numbers"
      ? meihua.shuziQigua({ num1: num(o, "num1"), num2: num(o, "num2") })
      : meihua.shijianQigua({
          yearZhiIndex: num(o, "yearZhiIndex", 1),
          lunarMonth: num(o, "lunarMonth", 1),
          lunarDay: num(o, "lunarDay", 1),
          hourIndex: num(o, "hourIndex", 1)
        }),

  "divination:liuyao": (o) => liuyao.qigua({ question: str(o, "question") }),

  "export:image": () => ({
    saved: true,
    path: path.join("C:\\Users", "Pictures", "XuanShu", "紫微命盘-1990-01-01-20260101120000.png")
  })
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
