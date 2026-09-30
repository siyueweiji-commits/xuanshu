/**
 * 紫微斗数服务（M2 完善版）
 *
 * M1：仅本命盘排盘。
 * M2：补齐运限 —— 大限 / 流年 / 流月 / 流日 / 流时，以及一生 12 个大限列表。
 *
 * 运限数据由 iztro 的 `astrolabe.horoscope(date, timeIndex)` 提供。
 * 关键约定（已实测校验）：
 *   - `horoscope.*.index` 表示该运限「命宫」在十二宫数组中的位置；
 *   - `astrolabe.palaces[index]` 与 `horoscope.*.palaceNames[index]` 索引同序，
 *     因此 `palaces[item.index].name` 即「该运限命宫落在本命哪个宫」。
 */
import { astro } from "iztro";

export interface ZiweiRequest {
  gender: string; // "男" | "女"
  year: number;
  month: number;
  day: number;
  timeIndex: number; // 0=早子时 ... 12=晚子时
  minute?: number;
  calendar?: "solar" | "lunar";
}

export interface ZiweiHoroscopeRequest extends ZiweiRequest {
  /** 要查询运限的目标日期（公历） */
  targetYear: number;
  targetMonth: number;
  targetDay: number;
  /** 目标时辰索引，缺省沿用本命的 timeIndex */
  targetTimeIndex?: number;
}

/** 单个运限层（大限/流年/流月/流日/流时） */
export interface HoroscopeScopeView {
  /** 该运限命宫在十二宫中的位置 */
  index: number;
  /** 层级名：大限 / 流年 / 流月 / 流日 / 流时 */
  name: string;
  heavenlyStem: string;
  earthlyBranch: string;
  /** 四化星名（禄权科忌顺序） */
  mutagen: string[];
  /** 该运限下十二宫的宫名（与本命 palaces 索引同序） */
  palaceNames: string[];
  /** 该运限命宫落在本命哪个宫 */
  landedPalace: string;
}

/** 大限条目（一生共 12 个） */
export interface DecadalView {
  index: number;
  palaceName: string;
  heavenlyStem: string;
  earthlyBranch: string;
  ageRange: number[];
  yearRange: number[];
  mutagen: string[];
}

export interface ZiweiHoroscopeResult {
  targetDate: string;
  solarDate: string;
  lunarDate: string;
  nominalAge: number;
  decadal: HoroscopeScopeView;
  yearly: HoroscopeScopeView;
  monthly: HoroscopeScopeView;
  daily: HoroscopeScopeView;
  hourly: HoroscopeScopeView;
  decadalList: DecadalView[];
  disclaimer: string;
}

export const DISCLAIMER =
  "本结果仅供文化娱乐与自省参考，不构成医疗、法律、投资或出行安全建议。";

/* ---------------- 对外投影（纯数据，可结构化克隆） ---------------- */

export interface ZiweiStarView {
  name: string;
  type: string;
  brightness: string;
  mutagen: string;
}

export interface ZiweiPalaceView {
  index: number;
  name: string;
  isBodyPalace: boolean;
  isOriginalPalace: boolean;
  heavenlyStem: string;
  earthlyBranch: string;
  majorStars: ZiweiStarView[];
  minorStars: ZiweiStarView[];
  adjectiveStars: Array<{ name: string; type: string }>;
  changsheng12: string;
  decadalRange: number[];
  ages: number[];
}

export interface ZiweiChartView {
  solarDate: string;
  lunarDate: string;
  chineseDate: string;
  time: string;
  timeRange: string;
  sign: string;
  zodiac: string;
  earthlyBranchOfSoulPalace: string;
  earthlyBranchOfBodyPalace: string;
  soul: string;
  body: string;
  fiveElementsClass: string;
  palaces: ZiweiPalaceView[];
}

interface RawStar {
  name?: string;
  type?: string;
  brightness?: string;
  mutagen?: string;
}

interface RawPalace {
  index?: number;
  name?: string;
  isBodyPalace?: boolean;
  isOriginalPalace?: boolean;
  heavenlyStem?: string;
  earthlyBranch?: string;
  majorStars?: RawStar[];
  minorStars?: RawStar[];
  adjectiveStars?: RawStar[];
  changsheng12?: string;
  ages?: number[];
  decadal?: { range?: number[] };
}

interface RawAstrolabe {
  solarDate?: string;
  lunarDate?: string;
  chineseDate?: string;
  time?: string;
  timeRange?: string;
  sign?: string;
  zodiac?: string;
  earthlyBranchOfSoulPalace?: string;
  earthlyBranchOfBodyPalace?: string;
  soul?: string;
  body?: string;
  fiveElementsClass?: string;
  palaces?: RawPalace[];
}

/** 排本命盘（solar / lunar 两种入口） */
function buildAstrolabe(req: ZiweiRequest) {
  const dateStr = `${req.year}-${req.month}-${req.day}`;
  const gender = req.gender === "女" ? "女" : "男";
  if (req.calendar === "lunar") {
    // 参数序：农历日期、时辰序、性别、是否闰月、是否修正闰月、语言
    return astro.byLunar(dateStr, req.timeIndex, gender, false, true, "zh-CN");
  }
  return astro.bySolar(dateStr, req.timeIndex, gender, true, "zh-CN");
}

/** 星曜 → 纯对象（丢弃 iztro 实例上的方法与 getter） */
function starView(s: RawStar): ZiweiStarView {
  return {
    name: s.name ?? "",
    type: s.type ?? "",
    brightness: s.brightness ?? "",
    mutagen: s.mutagen ?? ""
  };
}

/**
 * 本命盘排盘。
 *
 * 注意：iztro 返回的是带方法的类实例，直接经 ipcMain 回传会报
 * 「An object could not be cloned」，因此必须显式投影为纯数据。
 */
export function calcZiwei(req: ZiweiRequest): ZiweiChartView {
  const raw = buildAstrolabe(req).toJSON() as RawAstrolabe;

  return {
    solarDate: raw.solarDate ?? "",
    lunarDate: raw.lunarDate ?? "",
    chineseDate: raw.chineseDate ?? "",
    time: raw.time ?? "",
    timeRange: raw.timeRange ?? "",
    sign: raw.sign ?? "",
    zodiac: raw.zodiac ?? "",
    earthlyBranchOfSoulPalace: raw.earthlyBranchOfSoulPalace ?? "",
    earthlyBranchOfBodyPalace: raw.earthlyBranchOfBodyPalace ?? "",
    soul: raw.soul ?? "",
    body: raw.body ?? "",
    fiveElementsClass: raw.fiveElementsClass ?? "",
    palaces: (raw.palaces ?? []).map((p) => ({
      index: p.index ?? 0,
      name: p.name ?? "",
      isBodyPalace: Boolean(p.isBodyPalace),
      isOriginalPalace: Boolean(p.isOriginalPalace),
      heavenlyStem: p.heavenlyStem ?? "",
      earthlyBranch: p.earthlyBranch ?? "",
      majorStars: (p.majorStars ?? []).map(starView),
      minorStars: (p.minorStars ?? []).map(starView),
      adjectiveStars: (p.adjectiveStars ?? []).map((s) => ({
        name: s.name ?? "",
        type: s.type ?? ""
      })),
      changsheng12: p.changsheng12 ?? "",
      decadalRange: p.decadal?.range ?? [],
      ages: p.ages ?? []
    }))
  };
}

/** 运限排盘：大限 / 流年 / 流月 / 流日 / 流时 */
export function calcZiweiHoroscope(req: ZiweiHoroscopeRequest): ZiweiHoroscopeResult {
  if (
    !Number.isFinite(req.targetYear) ||
    !Number.isFinite(req.targetMonth) ||
    !Number.isFinite(req.targetDay)
  ) {
    throw new Error("运限查询需要提供目标日期（targetYear / targetMonth / targetDay）");
  }

  const astrolabe = buildAstrolabe(req);
  const targetDate = `${req.targetYear}-${req.targetMonth}-${req.targetDay}`;
  const timeIndex = Number.isFinite(req.targetTimeIndex)
    ? (req.targetTimeIndex as number)
    : req.timeIndex;

  const horoscope = astrolabe.horoscope(targetDate, timeIndex).toJSON();

  const landed = (index: number): string => astrolabe.palaces[index]?.name ?? "未知";

  const toView = (item: {
    index: number;
    name: string;
    heavenlyStem: string;
    earthlyBranch: string;
    mutagen: string[];
    palaceNames: string[];
  }): HoroscopeScopeView => ({
    index: item.index,
    name: item.name,
    heavenlyStem: item.heavenlyStem,
    earthlyBranch: item.earthlyBranch,
    mutagen: item.mutagen,
    palaceNames: item.palaceNames,
    landedPalace: landed(item.index)
  });

  return {
    targetDate,
    solarDate: horoscope.solarDate,
    lunarDate: horoscope.lunarDate,
    nominalAge: horoscope.age.nominalAge,
    decadal: toView(horoscope.decadal),
    yearly: toView(horoscope.yearly),
    monthly: toView(horoscope.monthly),
    daily: toView(horoscope.daily),
    hourly: toView(horoscope.hourly),
    decadalList: astrolabe.decadalList().map((d) => ({
      index: d.index,
      palaceName: d.palaceName,
      heavenlyStem: d.heavenlyStem,
      earthlyBranch: d.earthlyBranch,
      ageRange: d.ageRange,
      yearRange: d.yearRange,
      mutagen: d.mutagen
    })),
    disclaimer: DISCLAIMER
  };
}
