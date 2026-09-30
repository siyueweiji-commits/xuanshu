/**
 * 黄历服务（M4 完整版）
 *
 * 覆盖：干支四柱、宜忌、冲煞、彭祖百忌、建除十二神、二十八宿、天神吉凶、
 * 吉神凶煞、五方吉位、纳音、九星、六曜月相、节日、逐时辰吉凶。
 *
 * 所有取值均包一层 `safe()`：lunar-typescript 在边界日期（如早年、闰月）偶有抛错，
 * 单点失败不应让整份黄历挂掉。
 */
import { Solar } from "lunar-typescript";

export interface HuangliRequest {
  year: number;
  month: number;
  day: number;
}

/** 单个时辰的吉凶明细 */
export interface HuangliTimeView {
  /** 0=早子时 … 11=亥时（十二时辰） */
  index: number;
  label: string;
  zhi: string;
  ganZhi: string;
  tianShen: string;
  tianShenType: string;
  tianShenLuck: string;
  yi: string[];
  ji: string[];
  chongDesc: string;
  chongShengXiao: string;
  sha: string;
  naYin: string;
  minHm: string;
  maxHm: string;
  positionCai: string;
  positionXi: string;
  positionFu: string;
}

export interface HuangliView {
  date: string;
  dateCn: string;
  lunarDate: string;
  lunarDateCn: string;
  week: number;
  weekCn: string;
  xingZuo: string;

  yearInGanZhi: string;
  monthInGanZhi: string;
  dayInGanZhi: string;
  timeInGanZhi: string;
  shengXiao: string;
  dayShengXiao: string;
  /** 季节：春 / 夏 / 秋 / 冬 */
  season: string;

  jieQi: {
    today: string | null;
    prev: { name: string; date: string } | null;
    next: { name: string; date: string } | null;
  };

  yi: string[];
  ji: string[];
  jiShen: string[];
  xiongSha: string[];

  chong: { zhi: string; desc: string; gan: string; shengXiao: string; sha: string };
  pengZu: { gan: string; zhi: string };

  /** 建除十二神 */
  zhiXing: string;
  xiu: { name: string; luck: string; song: string };
  tianShen: { name: string; type: string; luck: string };
  /** 六曜 */
  liuYao: string;
  yueXiang: string;
  gong: string;
  shou: string;

  naYin: string;
  wuXing: string;
  dayLu: string;
  xunKong: string;
  nineStar: string;
  /** 太岁方位（含房内方位） */
  taiSui: string;

  positions: {
    xi: string;
    xiDesc: string;
    cai: string;
    caiDesc: string;
    fu: string;
    fuDesc: string;
    yangGui: string;
    yinGui: string;
  };

  festivals: string[];
  otherFestivals: string[];

  times: HuangliTimeView[];
  /** 十二时辰中「吉」的时辰（label） */
  auspiciousHours: string[];
  luckyHourCount: number;

  disclaimer: string;
}

const DISCLAIMER = "黄历内容源自传统历注，仅供文化参考，不构成任何专业建议。";

const SHICHEN_LABELS = [
  "子时", "丑时", "寅时", "卯时", "辰时", "巳时",
  "午时", "未时", "申时", "酉时", "戌时", "亥时"
];

const GAN_WUXING: Record<string, string> = {
  甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土",
  己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水"
};
const ZHI_WUXING: Record<string, string> = {
  寅: "木", 卯: "木", 巳: "火", 午: "火",
  辰: "土", 戌: "土", 丑: "土", 未: "土",
  申: "金", 酉: "金", 亥: "水", 子: "水"
};

/** 月支 → 季节 */
export function seasonOfZhi(zhi: string): string {
  if ("寅卯辰".includes(zhi)) return "春";
  if ("巳午未".includes(zhi)) return "夏";
  if ("申酉戌".includes(zhi)) return "秋";
  if ("亥子丑".includes(zhi)) return "冬";
  return "";
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn();
    if (v === null || v === undefined) return fallback;
    return v;
  } catch {
    return fallback;
  }
}

function strArr(fn: () => unknown): string[] {
  const v = safe(fn, [] as unknown);
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

function txt(fn: () => unknown): string {
  const v = safe(fn, "");
  return typeof v === "string" ? v : String(v);
}

function toTimeView(t: unknown, index: number): HuangliTimeView {
  const o = t as Record<string, () => unknown>;
  const call = <T>(name: string, fallback: T): T =>
    typeof o[name] === "function" ? safe(() => o[name]() as T, fallback) : fallback;
  const arr = (name: string): string[] => {
    const v = call<unknown>(name, []);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  };
  return {
    index,
    label: SHICHEN_LABELS[index] ?? "",
    zhi: call("getZhi", ""),
    ganZhi: call("getGanZhi", ""),
    tianShen: call("getTianShen", ""),
    tianShenType: call("getTianShenType", ""),
    tianShenLuck: call("getTianShenLuck", ""),
    yi: arr("getYi"),
    ji: arr("getJi"),
    chongDesc: call("getChongDesc", ""),
    chongShengXiao: call("getChongShengXiao", ""),
    sha: call("getSha", ""),
    naYin: call("getNaYin", ""),
    minHm: call("getMinHm", ""),
    maxHm: call("getMaxHm", ""),
    positionCai: call("getPositionCai", ""),
    positionXi: call("getPositionXi", ""),
    positionFu: call("getPositionFu", "")
  };
}

export function getHuangli(req: HuangliRequest): HuangliView {
  const solar = Solar.fromYmd(req.year, req.month, req.day);
  const lunar = solar.getLunar();

  const dayGan = txt(() => lunar.getDayGan());
  const dayZhi = txt(() => lunar.getDayZhi());
  const monthZhi = txt(() => lunar.getMonthZhi());

  // 逐时辰吉凶：times 共 13 项（0=早子时，1..11=丑..亥，12=晚子时），此处取前 12 项
  const rawTimes = safe<unknown[]>(() => lunar.getTimes() as unknown[], []);
  const times = rawTimes.slice(0, 12).map((t, i) => toTimeView(t, i));
  const auspiciousHours = times.filter((t) => t.tianShenLuck === "吉").map((t) => t.label);

  const prev = safe<{ getName(): string; getSolar(): { toYmdHms(): string } } | null>(
    () => lunar.getPrevJieQi() as never,
    null
  );
  const next = safe<{ getName(): string; getSolar(): { toYmdHms(): string } } | null>(
    () => lunar.getNextJieQi() as never,
    null
  );
  const todayJq = safe<{ getName(): string } | null>(() => lunar.getCurrentJieQi() as never, null);

  return {
    date: txt(() => solar.toYmd()),
    dateCn: `${txt(() => solar.toYmd())} 星期${txt(() => solar.getWeekInChinese())}`,
    lunarDate: txt(() => lunar.toString()),
    lunarDateCn:
      `农历${txt(() => lunar.getMonthInChinese())}月${txt(() => lunar.getDayInChinese())}`,
    week: safe(() => solar.getWeek(), 0),
    weekCn: txt(() => solar.getWeekInChinese()),
    xingZuo: txt(() => solar.getXingZuo()),

    yearInGanZhi: txt(() => lunar.getYearInGanZhi()),
    monthInGanZhi: txt(() => lunar.getMonthInGanZhi()),
    dayInGanZhi: txt(() => lunar.getDayInGanZhi()),
    timeInGanZhi: txt(() => lunar.getTimeInGanZhi()),
    shengXiao: txt(() => lunar.getYearShengXiao()),
    dayShengXiao: txt(() => lunar.getDayShengXiao()),
    season: seasonOfZhi(monthZhi),

    jieQi: {
      today: todayJq ? safe(() => todayJq.getName(), null) : null,
      prev: prev
        ? { name: safe(() => prev.getName(), ""), date: safe(() => prev.getSolar().toYmdHms(), "") }
        : null,
      next: next
        ? { name: safe(() => next.getName(), ""), date: safe(() => next.getSolar().toYmdHms(), "") }
        : null
    },

    yi: strArr(() => lunar.getDayYi()),
    ji: strArr(() => lunar.getDayJi()),
    jiShen: strArr(() => lunar.getDayJiShen()),
    xiongSha: strArr(() => lunar.getDayXiongSha()),

    chong: {
      zhi: txt(() => lunar.getDayChong()),
      desc: txt(() => lunar.getDayChongDesc()),
      gan: txt(() => lunar.getDayChongGan()),
      shengXiao: txt(() => lunar.getDayChongShengXiao()),
      sha: txt(() => lunar.getDaySha())
    },
    pengZu: {
      gan: txt(() => lunar.getPengZuGan()),
      zhi: txt(() => lunar.getPengZuZhi())
    },

    zhiXing: txt(() => lunar.getZhiXing()),
    xiu: {
      name: txt(() => lunar.getXiu()),
      luck: txt(() => lunar.getXiuLuck()),
      song: txt(() => lunar.getXiuSong())
    },
    tianShen: {
      name: txt(() => lunar.getDayTianShen()),
      type: txt(() => lunar.getDayTianShenType()),
      luck: txt(() => lunar.getDayTianShenLuck())
    },
    liuYao: txt(() => lunar.getLiuYao()),
    yueXiang: txt(() => lunar.getYueXiang()),
    gong: txt(() => lunar.getGong()),
    shou: txt(() => lunar.getShou()),

    naYin: txt(() => lunar.getDayNaYin()),
    wuXing: `${GAN_WUXING[dayGan] ?? ""}${ZHI_WUXING[dayZhi] ?? ""}`,
    dayLu: txt(() => lunar.getDayLu()),
    xunKong: txt(() => lunar.getDayXunKong()),
    nineStar: txt(() => lunar.getDayNineStar().toString()),
    taiSui: txt(() => lunar.getDayPositionTai()),

    positions: {
      xi: txt(() => lunar.getDayPositionXi()),
      xiDesc: txt(() => lunar.getDayPositionXiDesc()),
      cai: txt(() => lunar.getDayPositionCai()),
      caiDesc: txt(() => lunar.getDayPositionCaiDesc()),
      fu: txt(() => lunar.getDayPositionFu()),
      fuDesc: txt(() => lunar.getDayPositionFuDesc()),
      yangGui: txt(() => lunar.getDayPositionYangGui()),
      yinGui: txt(() => lunar.getDayPositionYinGui())
    },

    festivals: strArr(() => lunar.getFestivals()),
    otherFestivals: strArr(() => lunar.getOtherFestivals()),

    times,
    auspiciousHours,
    luckyHourCount: auspiciousHours.length,

    disclaimer: DISCLAIMER
  };
}
