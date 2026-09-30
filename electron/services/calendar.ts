/**
 * 历法服务（M2）
 *
 * 提供公历/农历互转、干支纪法、节气查询与真太阳时校正。
 *
 * 真太阳时 = 平太阳时 + 经度时差 + 均时差
 *   - 经度时差：(本地经度 − 120°) × 4 分钟（东八区以东经 120° 为基准）
 *   - 均时差：地球轨道偏心率与黄赤交角引起，用近似公式计算（误差 < 1 分钟）
 *
 * 本文件只做纯计算，城市经纬度来自 resources/data/city_coords.json。
 */
import fs from "node:fs";
import path from "node:path";
import { Solar } from "lunar-typescript";

export interface CityInfo {
  name: string;
  province: string;
  longitude: number;
  latitude: number;
}

export interface CalendarRequest {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
}

export interface TrueSolarRequest extends CalendarRequest {
  /** 直接指定经度（优先于 city） */
  longitude?: number;
  /** 城市名，从 city_coords.json 查经度 */
  city?: string;
}

export interface GanZhi {
  year: string;
  month: string;
  day: string;
  time: string;
}

export interface CalendarResult {
  solar: string;
  lunar: string;
  lunarFull: string;
  ganZhi: GanZhi;
  shengXiao: string;
  xingZuo: string;
  timeIndex: number;
  timeName: string;
  jieQi: {
    prev: { name: string; date: string } | null;
    next: { name: string; date: string } | null;
    table: Record<string, string>;
  };
}

export interface TrueSolarResult {
  cityName: string | null;
  longitude: number;
  longitudeOffsetMinutes: number;
  equationOfTimeMinutes: number;
  totalOffsetMinutes: number;
  clockTime: string;
  trueSolarTime: string;
  dayShift: number;
  timeIndex: number;
  timeName: string;
  note: string;
}

/** 时辰名（索引与 iztro 的 timeIndex 对齐：0=早子时 ... 12=晚子时） */
export const SHICHEN_NAMES = [
  "早子时", "丑时", "寅时", "卯时", "辰时", "巳时",
  "午时", "未时", "申时", "酉时", "戌时", "亥时", "晚子时"
];

export const SHICHEN_RANGES = [
  "00:00-01:00", "01:00-03:00", "03:00-05:00", "05:00-07:00", "07:00-09:00", "09:00-11:00",
  "11:00-13:00", "13:00-15:00", "15:00-17:00", "17:00-19:00", "19:00-21:00", "21:00-23:00",
  "23:00-24:00"
];

/** 小时 → 时辰索引 */
export function hourToTimeIndex(hour: number): number {
  if (hour <= 0) return 0;
  if (hour >= 23) return 12;
  return Math.floor((hour + 1) / 2);
}

/** 城市经纬度数据文件路径（开发态 dist-electron/services → 项目根 resources） */
export function cityDataFile(): string {
  return path.resolve(__dirname, "../../resources/data/city_coords.json");
}

let cityCache: CityInfo[] | null = null;

/** 读取城市列表（带进程内缓存） */
export function listCities(): CityInfo[] {
  if (cityCache) return cityCache;
  try {
    const raw = fs.readFileSync(cityDataFile(), "utf-8");
    const parsed = JSON.parse(raw) as { cities?: CityInfo[] };
    cityCache = Array.isArray(parsed.cities) ? parsed.cities : [];
  } catch {
    cityCache = [];
  }
  return cityCache;
}

/** 按城市名查经纬度（支持模糊：如「孝感」匹配「孝感市」） */
export function findCity(name: string): CityInfo | null {
  const target = name.trim().replace(/市$/, "");
  if (!target) return null;
  const cities = listCities();
  return (
    cities.find((c) => c.name === target) ??
    cities.find((c) => c.name.startsWith(target) || target.startsWith(c.name)) ??
    null
  );
}

/**
 * 均时差（分钟）。近似公式，全年误差 < 1 分钟。
 * @param dayOfYear 一年中的第几天（1-366）
 */
function equationOfTime(dayOfYear: number): number {
  const b = (2 * Math.PI * (dayOfYear - 81)) / 364;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

/** 一年中的第几天 */
function dayOfYear(y: number, m: number, d: number): number {
  const start = Date.UTC(y, 0, 1);
  const cur = Date.UTC(y, m - 1, d);
  return Math.floor((cur - start) / 86400000) + 1;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function fmt(y: number, m: number, d: number, h: number, min: number): string {
  return `${y}-${pad(m)}-${pad(d)} ${pad(h)}:${pad(min)}`;
}

/** 构造 Solar 对象（hour/minute 可缺省，缺省按 0 点） */
function toSolar(req: CalendarRequest): Solar {
  const h = Number.isFinite(req.hour) ? (req.hour as number) : 0;
  const mi = Number.isFinite(req.minute) ? (req.minute as number) : 0;
  if (!Number.isFinite(req.year) || !Number.isFinite(req.month) || !Number.isFinite(req.day)) {
    throw new Error("日期参数不完整：需要 year / month / day");
  }
  if (req.month < 1 || req.month > 12 || req.day < 1 || req.day > 31) {
    throw new Error(`日期超出范围：${req.year}-${req.month}-${req.day}`);
  }
  return Solar.fromYmdHms(req.year, req.month, req.day, h, mi, 0);
}

/** 公历 → 农历 / 干支 / 节气 */
export function convertCalendar(req: CalendarRequest): CalendarResult {
  const solar = toSolar(req);
  const lunar = solar.getLunar();

  const prevJieQi = lunar.getPrevJieQi();
  const nextJieQi = lunar.getNextJieQi();
  const table: Record<string, string> = {};
  for (const [name, s] of Object.entries(lunar.getJieQiTable())) {
    table[name] = s.toString();
  }

  const hour = Number.isFinite(req.hour) ? (req.hour as number) : 0;
  const timeIndex = hourToTimeIndex(hour);

  return {
    solar: solar.toString(),
    lunar: `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    lunarFull: lunar.toString(),
    ganZhi: {
      year: lunar.getYearInGanZhi(),
      month: lunar.getMonthInGanZhi(),
      day: lunar.getDayInGanZhi(),
      time: lunar.getTimeInGanZhi()
    },
    shengXiao: lunar.getYearShengXiao(),
    xingZuo: solar.getXingZuo(),
    timeIndex,
    timeName: SHICHEN_NAMES[timeIndex],
    jieQi: {
      prev: prevJieQi ? { name: prevJieQi.getName(), date: prevJieQi.getSolar().toString() } : null,
      next: nextJieQi ? { name: nextJieQi.getName(), date: nextJieQi.getSolar().toString() } : null,
      table
    }
  };
}

/**
 * 真太阳时校正。
 * 若同时给了 longitude 与 city，以 longitude 为准；都没给则用东经 120°（即不校正经度差）。
 */
export function toTrueSolarTime(req: TrueSolarRequest): TrueSolarResult {
  let longitude = 120;
  let cityName: string | null = null;

  if (typeof req.longitude === "number" && Number.isFinite(req.longitude)) {
    longitude = req.longitude;
    const matched = listCities().find((c) => Math.abs(c.longitude - longitude) < 0.01);
    cityName = matched?.name ?? (req.city ?? null);
  } else if (req.city) {
    const city = findCity(req.city);
    if (city) {
      longitude = city.longitude;
      cityName = city.name;
    }
  }

  const doy = dayOfYear(req.year, req.month, req.day);
  const eot = equationOfTime(doy);
  const lonOffset = (longitude - 120) * 4;
  const totalOffset = lonOffset + eot;

  const h = Number.isFinite(req.hour) ? (req.hour as number) : 0;
  const mi = Number.isFinite(req.minute) ? (req.minute as number) : 0;

  // 用毫秒做位移，天然处理跨日/跨月/跨年
  const base = new Date(Date.UTC(req.year, req.month - 1, req.day, h, mi, 0));
  const shifted = new Date(base.getTime() + Math.round(totalOffset * 60000));

  const ty = shifted.getUTCFullYear();
  const tm = shifted.getUTCMonth() + 1;
  const td = shifted.getUTCDate();
  const th = shifted.getUTCHours();
  const tmin = shifted.getUTCMinutes();

  const dayShift = Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(req.year, req.month - 1, req.day)) / 86400000
  );

  const timeIndex = hourToTimeIndex(th);

  return {
    cityName,
    longitude: Number(longitude.toFixed(4)),
    longitudeOffsetMinutes: Number(lonOffset.toFixed(2)),
    equationOfTimeMinutes: Number(eot.toFixed(2)),
    totalOffsetMinutes: Number(totalOffset.toFixed(2)),
    clockTime: fmt(req.year, req.month, req.day, h, mi),
    trueSolarTime: fmt(ty, tm, td, th, tmin),
    dayShift,
    timeIndex,
    timeName: SHICHEN_NAMES[timeIndex],
    note: "真太阳时 = 钟表时间 + 经度时差 + 均时差；用于校准时柱。"
  };
}
