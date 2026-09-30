import { Solar } from "lunar-typescript";

/* ============================================================
   八字排盘（M3）
   四柱/十神/藏干/纳音/地势/旬空 由 lunar-typescript 提供；
   五行力量加权统计、日主强弱、喜忌、神煞 为本模块自行实现，
   采用「简化扶抑模型」，仅在结果中标注口径，不作为论断依据。
   ============================================================ */

export interface BaziRequest {
  gender: string; // "男" | "女"
  year: number;
  month: number;
  day: number;
  hour: number; // 0-23
  minute?: number;
  /** 需要展开流月的年份（默认取当前年） */
  focusYear?: number;
}

export type WuXing = "木" | "火" | "土" | "金" | "水";

/** 三合局只论四局（水土同局者不取），故单独收窄 */
export type SanHeJu = "水" | "火" | "金" | "木";

export interface GanZhiPillar {
  key: "year" | "month" | "day" | "time";
  label: string;
  ganzhi: string;
  gan: string;
  zhi: string;
  ganWuXing: WuXing;
  zhiWuXing: WuXing;
  ganShiShen: string;
  zhiHideGan: string[];
  zhiShiShen: string[];
  naYin: string;
  diShi: string;
  xunKong: string;
}

export interface WuXingStat {
  element: WuXing;
  /** 加权力量值 */
  score: number;
  /** 占总力量百分比 */
  percent: number;
  /** 显于天干的个数 */
  ganCount: number;
  /** 藏于地支的加权个数 */
  zhiScore: number;
  /** 是否为同类（比劫 / 印） */
  sameKind: boolean;
  /** 是否缺（力量为 0） */
  missing: boolean;
}

export interface ShenShaItem {
  name: string;
  kind: "吉" | "凶" | "中性";
  /** 查法依据，如「以日干 丙 查 亥、酉」 */
  basis: string;
  /** 命中的柱位，如 ["年支", "时支"] */
  positions: string[];
  desc: string;
  hit: boolean;
}

export interface YunInfo {
  startAgeText: string;
  startSolar: string;
  direction: string;
  forward: boolean;
}

export interface LiuNianItem {
  year: number;
  age: number;
  ganZhi: string;
  ganShiShen: string;
  xunKong: string;
  liuYue?: Array<{ month: string; ganZhi: string; ganShiShen: string }>;
}

export interface DaYunItem {
  index: number;
  ganZhi: string;
  startAge: number;
  endAge: number;
  startYear: number;
  endYear: number;
  xunKong: string;
  ganShiShen: string;
  liuNian: LiuNianItem[];
}

export interface BaziResult {
  solar: string;
  lunar: string;
  lunarFull: string;
  yearInGanZhi: string;
  yearShengXiao: string;
  pillars: GanZhiPillar[];
  fourPillars: Record<"year" | "month" | "day" | "time", { ganzhi: string; gan: string; zhi: string }>;
  dayMaster: string;
  dayMasterWuXing: WuXing;
  dayMasterYinYang: string;
  taiYuan: string;
  taiYuanNaYin: string;
  mingGong: string;
  mingGongNaYin: string;
  shenGong: string;
  shenGongNaYin: string;
  taiXi: string;
  taiXiNaYin: string;
  wuXing: {
    stats: WuXingStat[];
    sameScore: number;
    otherScore: number;
    /** 同类力量占比 */
    ratio: number;
    /** 偏强 / 中和 / 偏弱 / 从强 / 从弱 */
    level: string;
    deLing: boolean;
    deDi: boolean;
    deShi: boolean;
    summary: string;
    missing: WuXing[];
    /** 喜用五行（扶抑法简化） */
    favorable: WuXing[];
    /** 忌神五行 */
    unfavorable: WuXing[];
  };
  shiShenCount: Array<{ name: string; count: number; kind: string }>;
  shenSha: ShenShaItem[];
  yun: YunInfo;
  daYun: DaYunItem[];
  focusYear: number;
  disclaimer: string;
}

/* ---------------- 基础表 ---------------- */

const GAN: string[] = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];

const GAN_WUXING: Record<string, WuXing> = {
  甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土",
  己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水"
};

const ZHI_WUXING: Record<string, WuXing> = {
  子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火",
  午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水"
};

/** 地支藏干及本气/中气/余气权重（简化量表） */
const ZHI_CANG: Record<string, Array<[string, number]>> = {
  子: [["癸", 1]],
  丑: [["己", 0.6], ["癸", 0.3], ["辛", 0.1]],
  寅: [["甲", 0.6], ["丙", 0.3], ["戊", 0.1]],
  卯: [["乙", 1]],
  辰: [["戊", 0.6], ["乙", 0.3], ["癸", 0.1]],
  巳: [["丙", 0.6], ["庚", 0.3], ["戊", 0.1]],
  午: [["丁", 0.7], ["己", 0.3]],
  未: [["己", 0.6], ["丁", 0.3], ["乙", 0.1]],
  申: [["庚", 0.6], ["壬", 0.3], ["戊", 0.1]],
  酉: [["辛", 1]],
  戌: [["戊", 0.6], ["辛", 0.3], ["丁", 0.1]],
  亥: [["壬", 0.7], ["甲", 0.3]]
};

/** 各柱干支权重（月令司权，故月支最重） */
const PILLAR_WEIGHT: Record<"year" | "month" | "day" | "time", { gan: number; zhi: number }> = {
  year: { gan: 1, zhi: 1 },
  month: { gan: 1, zhi: 1.6 },
  day: { gan: 1, zhi: 1.2 },
  time: { gan: 1, zhi: 1 }
};

const SHENG: Record<WuXing, WuXing> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const KE: Record<WuXing, WuXing> = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

const ELEMENTS: WuXing[] = ["木", "火", "土", "金", "水"];

const SHI_SHEN_KIND: Record<string, string> = {
  比肩: "比劫", 劫财: "比劫",
  食神: "食伤", 伤官: "食伤",
  偏财: "财星", 正财: "财星",
  七杀: "官杀", 正官: "官杀",
  偏印: "印星", 正印: "印星",
  日主: "自身"
};

/** 十神：以日干为「我」 */
function shiShenOf(dayGan: string, gan: string): string {
  if (dayGan === gan) return "比肩";
  const d = GAN_WUXING[dayGan];
  const g = GAN_WUXING[gan];
  const sameYinYang = GAN.indexOf(dayGan) % 2 === GAN.indexOf(gan) % 2;
  if (d === g) return sameYinYang ? "比肩" : "劫财";
  if (SHENG[d] === g) return sameYinYang ? "食神" : "伤官";
  if (KE[d] === g) return sameYinYang ? "偏财" : "正财";
  if (KE[g] === d) return sameYinYang ? "七杀" : "正官";
  if (SHENG[g] === d) return sameYinYang ? "偏印" : "正印";
  return "—";
}

/** 三合局归属（用于驿马/桃花/华盖等） */
const SANHE: Record<string, SanHeJu> = {
  申: "水", 子: "水", 辰: "水",
  寅: "火", 午: "火", 戌: "火",
  巳: "金", 酉: "金", 丑: "金",
  亥: "木", 卯: "木", 未: "木"
};

/* ---------------- 神煞规则 ---------------- */

const TIAN_YI: Record<string, string[]> = {
  甲: ["丑", "未"], 戊: ["丑", "未"], 庚: ["丑", "未"],
  乙: ["子", "申"], 己: ["子", "申"],
  丙: ["亥", "酉"], 丁: ["亥", "酉"],
  壬: ["卯", "巳"], 癸: ["卯", "巳"],
  辛: ["午", "寅"]
};

const WEN_CHANG: Record<string, string> = {
  甲: "巳", 乙: "午", 丙: "申", 丁: "酉", 戊: "申",
  己: "酉", 庚: "亥", 辛: "子", 壬: "寅", 癸: "卯"
};

const TAI_JI: Record<string, string[]> = {
  甲: ["子", "午"], 乙: ["子", "午"],
  丙: ["卯", "酉"], 丁: ["卯", "酉"],
  戊: ["辰", "戌", "丑", "未"], 己: ["辰", "戌", "丑", "未"],
  庚: ["寅", "亥"], 辛: ["寅", "亥"],
  壬: ["巳", "申"], 癸: ["巳", "申"]
};

const LU_SHEN: Record<string, string> = {
  甲: "寅", 乙: "卯", 丙: "巳", 丁: "午", 戊: "巳",
  己: "午", 庚: "申", 辛: "酉", 壬: "亥", 癸: "子"
};

const YANG_REN: Record<string, string> = {
  甲: "卯", 乙: "寅", 丙: "午", 丁: "巳", 戊: "午",
  己: "巳", 庚: "酉", 辛: "申", 壬: "子", 癸: "亥"
};

const JIN_YU: Record<string, string> = {
  甲: "辰", 乙: "巳", 丙: "未", 丁: "申", 戊: "未",
  己: "申", 庚: "戌", 辛: "亥", 壬: "丑", 癸: "寅"
};

const HONG_YAN: Record<string, string> = {
  甲: "午", 乙: "午", 丙: "寅", 丁: "未", 戊: "辰",
  己: "辰", 庚: "戌", 辛: "酉", 壬: "子", 癸: "申"
};

const YI_MA: Record<SanHeJu, string> = { 水: "寅", 火: "申", 金: "亥", 木: "巳" };
const TAO_HUA: Record<SanHeJu, string> = { 水: "酉", 火: "卯", 金: "午", 木: "子" };
const HUA_GAI: Record<SanHeJu, string> = { 水: "辰", 火: "戌", 金: "丑", 木: "未" };
const JIANG_XING: Record<SanHeJu, string> = { 水: "子", 火: "午", 金: "酉", 木: "卯" };
const JIE_SHA: Record<SanHeJu, string> = { 水: "巳", 火: "亥", 金: "寅", 木: "申" };
const WANG_SHEN: Record<SanHeJu, string> = { 水: "亥", 火: "巳", 金: "申", 木: "寅" };

const GU_GUA: Array<{ group: string[]; gu: string; gua: string }> = [
  { group: ["亥", "子", "丑"], gu: "寅", gua: "戌" },
  { group: ["寅", "卯", "辰"], gu: "巳", gua: "丑" },
  { group: ["巳", "午", "未"], gu: "申", gua: "辰" },
  { group: ["申", "酉", "戌"], gu: "亥", gua: "未" }
];

const TIAN_DE: Record<string, string> = {
  寅: "丁", 卯: "申", 辰: "壬", 巳: "辛", 午: "亥", 未: "甲",
  申: "癸", 酉: "寅", 戌: "丙", 亥: "乙", 子: "巳", 丑: "庚"
};

const YUE_DE: Record<SanHeJu, string> = { 火: "丙", 水: "壬", 木: "甲", 金: "庚" };

/* ---------------- 主流程 ---------------- */

export function calcBazi(req: BaziRequest): BaziResult {
  const solar = Solar.fromYmdHms(req.year, req.month, req.day, req.hour, req.minute ?? 0, 0);
  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();

  const genderCode = req.gender === "女" ? 0 : 1;

  /* --- 四柱 --- */
  const raw: Array<{
    key: "year" | "month" | "day" | "time";
    label: string;
    ganzhi: string;
    gan: string;
    zhi: string;
    hideGan: string[];
    shiShenGan: string;
    shiShenZhi: string[];
    naYin: string;
    diShi: string;
    xunKong: string;
  }> = [
    {
      key: "year", label: "年柱", ganzhi: ec.getYear(), gan: ec.getYearGan(), zhi: ec.getYearZhi(),
      hideGan: ec.getYearHideGan(), shiShenGan: ec.getYearShiShenGan(), shiShenZhi: ec.getYearShiShenZhi(),
      naYin: ec.getYearNaYin(), diShi: ec.getYearDiShi(), xunKong: ec.getYearXunKong()
    },
    {
      key: "month", label: "月柱", ganzhi: ec.getMonth(), gan: ec.getMonthGan(), zhi: ec.getMonthZhi(),
      hideGan: ec.getMonthHideGan(), shiShenGan: ec.getMonthShiShenGan(), shiShenZhi: ec.getMonthShiShenZhi(),
      naYin: ec.getMonthNaYin(), diShi: ec.getMonthDiShi(), xunKong: ec.getMonthXunKong()
    },
    {
      key: "day", label: "日柱", ganzhi: ec.getDay(), gan: ec.getDayGan(), zhi: ec.getDayZhi(),
      hideGan: ec.getDayHideGan(), shiShenGan: ec.getDayShiShenGan(), shiShenZhi: ec.getDayShiShenZhi(),
      naYin: ec.getDayNaYin(), diShi: ec.getDayDiShi(), xunKong: ec.getDayXunKong()
    },
    {
      key: "time", label: "时柱", ganzhi: ec.getTime(), gan: ec.getTimeGan(), zhi: ec.getTimeZhi(),
      hideGan: ec.getTimeHideGan(), shiShenGan: ec.getTimeShiShenGan(), shiShenZhi: ec.getTimeShiShenZhi(),
      naYin: ec.getTimeNaYin(), diShi: ec.getTimeDiShi(), xunKong: ec.getTimeXunKong()
    }
  ];

  const dayGan = ec.getDayGan();
  const dayWuXing = GAN_WUXING[dayGan];
  const dayYinYang = GAN.indexOf(dayGan) % 2 === 0 ? "阳" : "阴";

  const pillars: GanZhiPillar[] = raw.map((p) => ({
    key: p.key,
    label: p.label,
    ganzhi: p.ganzhi,
    gan: p.gan,
    zhi: p.zhi,
    ganWuXing: GAN_WUXING[p.gan],
    zhiWuXing: ZHI_WUXING[p.zhi],
    ganShiShen: p.shiShenGan,
    zhiHideGan: p.hideGan,
    zhiShiShen: p.shiShenZhi,
    naYin: p.naYin,
    diShi: p.diShi,
    xunKong: p.xunKong
  }));

  /* --- 五行力量加权统计 --- */
  const score: Record<WuXing, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const ganCount: Record<WuXing, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const zhiScore: Record<WuXing, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };

  for (const p of pillars) {
    const w = PILLAR_WEIGHT[p.key];
    score[GAN_WUXING[p.gan]] += w.gan;
    ganCount[GAN_WUXING[p.gan]] += 1;

    for (const [g, ratio] of ZHI_CANG[p.zhi]) {
      const val = w.zhi * ratio;
      score[GAN_WUXING[g]] += val;
      zhiScore[GAN_WUXING[g]] += val;
    }
  }

  const total = ELEMENTS.reduce((s, e) => s + score[e], 0) || 1;

  // 生我（印）、我生（食伤）、我克（财）、克我（官杀）
  const shengWo = (Object.keys(SHENG) as WuXing[]).find((k) => SHENG[k] === dayWuXing) as WuXing;
  const woSheng = SHENG[dayWuXing];
  const woKe = KE[dayWuXing];
  const keWo = (Object.keys(KE) as WuXing[]).find((k) => KE[k] === dayWuXing) as WuXing;

  const sameElements: WuXing[] = [dayWuXing, shengWo];
  const sameScore = sameElements.reduce((s, e) => s + score[e], 0);
  const ratio = sameScore / total;

  const stats: WuXingStat[] = ELEMENTS.map((element) => ({
    element,
    score: round2(score[element]),
    percent: round1((score[element] / total) * 100),
    ganCount: ganCount[element],
    zhiScore: round2(zhiScore[element]),
    sameKind: sameElements.includes(element),
    missing: score[element] <= 0.0001
  }));

  const level =
    ratio >= 0.75 ? "从强" : ratio >= 0.6 ? "偏强" : ratio >= 0.42 ? "中和" : ratio >= 0.28 ? "偏弱" : "从弱";

  // 得令：月支藏干主气与日主同类或生我
  const monthMainGan = ZHI_CANG[raw[1].zhi][0][0];
  const monthMainWuXing = GAN_WUXING[monthMainGan];
  const deLing = monthMainWuXing === dayWuXing || SHENG[monthMainWuXing] === dayWuXing;

  // 得地：日支（同类或生我）
  const dayZhiMain = GAN_WUXING[ZHI_CANG[raw[2].zhi][0][0]];
  const deDi = dayZhiMain === dayWuXing || SHENG[dayZhiMain] === dayWuXing;

  // 得势：月干 / 时干 有比劫或印星
  const deShi = [raw[1].shiShenGan, raw[3].shiShenGan].some(
    (s) => s === "比肩" || s === "劫财" || s === "正印" || s === "偏印"
  );

  const missing = ELEMENTS.filter((e) => score[e] <= 0.0001);

  // 喜忌（扶抑法简化）：身强喜克泄耗，身弱喜生扶；成从格者顺势；中和取最弱两行补不足
  let favorable: WuXing[];
  if (level === "从强") {
    favorable = [dayWuXing, shengWo];
  } else if (level === "偏弱") {
    favorable = [shengWo, dayWuXing];
  } else if (level === "中和") {
    favorable = [...stats]
      .sort((a, b) => a.score - b.score)
      .slice(0, 2)
      .map((s) => s.element);
  } else {
    // 偏强 / 从弱：顺势取官杀、财、食伤
    favorable = [keWo, woKe, woSheng];
  }
  favorable = [...new Set(favorable)];
  const unfavorable: WuXing[] = ELEMENTS.filter((e) => !favorable.includes(e));

  const strongest = [...stats].sort((a, b) => b.score - a.score)[0];
  const weakest = [...stats].sort((a, b) => a.score - b.score)[0];

  const summary = [
    `${dayYinYang}${dayWuXing}日主（${dayGan}）生于${raw[1].zhi}月`,
    `${deLing ? "得令" : "失令"}·${deDi ? "得地" : "失地"}·${deShi ? "得势" : "失势"}`,
    `同类力量占比 ${round1(ratio * 100)}%，属${level}`,
    `全局${strongest.element}最旺（${strongest.score}），${weakest.element}最弱（${weakest.score}）`
  ].join("；");

  /* --- 十神统计 --- */
  const counter = new Map<string, number>();
  const bump = (name: string) => {
    if (!name || name === "日主") return;
    counter.set(name, (counter.get(name) ?? 0) + 1);
  };
  for (const p of pillars) {
    if (p.key !== "day") bump(p.ganShiShen);
    p.zhiShiShen.forEach(bump);
  }
  const shiShenCount = [...counter.entries()]
    .map(([name, count]) => ({ name, count, kind: SHI_SHEN_KIND[name] ?? "其他" }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  /* --- 神煞 --- */
  const zhis = raw.map((p) => p.zhi);
  const zhiPos = ["年支", "月支", "日支", "时支"];
  const ganPos = ["年干", "月干", "日干", "时干"];
  const gans = raw.map((p) => p.gan);

  const matchZhi = (targets: string[] | string) => {
    const list = Array.isArray(targets) ? targets : [targets];
    return zhis.map((z, i) => (list.includes(z) ? zhiPos[i] : null)).filter(Boolean) as string[];
  };
  const matchGan = (targets: string[] | string) => {
    const list = Array.isArray(targets) ? targets : [targets];
    return gans.map((g, i) => (list.includes(g) ? ganPos[i] : null)).filter(Boolean) as string[];
  };

  const yearZhi = raw[0].zhi;
  const monthZhi = raw[1].zhi;
  const ju = SANHE[yearZhi] ?? SANHE[raw[2].zhi];
  const guGua = GU_GUA.find((g) => g.group.includes(yearZhi));
  const tianDeTarget = TIAN_DE[monthZhi];
  const yueDeTarget = YUE_DE[SANHE[monthZhi]];

  const shenSha: ShenShaItem[] = [];

  const push = (
    name: string,
    kind: ShenShaItem["kind"],
    basis: string,
    positions: string[],
    desc: string
  ) => {
    shenSha.push({ name, kind, basis, positions, desc, hit: positions.length > 0 });
  };

  push("天乙贵人", "吉", `以日干 ${dayGan} 查 ${TIAN_YI[dayGan].join("、")}`, matchZhi(TIAN_YI[dayGan]), "最尊贵之吉星，主逢凶化吉、得贵人扶助。");
  push("文昌贵人", "吉", `以日干 ${dayGan} 查 ${WEN_CHANG[dayGan]}`, matchZhi(WEN_CHANG[dayGan]), "主聪明好学、利考试文书。");
  push("太极贵人", "吉", `以日干 ${dayGan} 查 ${TAI_JI[dayGan].join("、")}`, matchZhi(TAI_JI[dayGan]), "主好学深思，喜玄学哲理。");
  push("禄神", "吉", `以日干 ${dayGan} 查 ${LU_SHEN[dayGan]}`, matchZhi(LU_SHEN[dayGan]), "主衣禄丰足、身健有力。");
  push("金舆", "吉", `以日干 ${dayGan} 查 ${JIN_YU[dayGan]}`, matchZhi(JIN_YU[dayGan]), "主富贵安逸、得配偶助。");
  push("天德贵人", "吉", `以月支 ${monthZhi} 查 ${tianDeTarget ?? "—"}`, matchGan(tianDeTarget ?? []), "主逢凶化吉、心地慈善。");
  push("月德贵人", "吉", `以月支 ${monthZhi} 所属三合局查 ${yueDeTarget ?? "—"}`, matchGan(yueDeTarget ?? []), "主福厚寿长、人缘和顺。");
  push("羊刃", "中性", `以日干 ${dayGan} 查 ${YANG_REN[dayGan]}`, matchZhi(YANG_REN[dayGan]), "刚烈果决之星，喜制伏、忌生助。");
  push("将星", "吉", `以年支 ${yearZhi} 所属三合局查 ${ju ? JIANG_XING[ju] : "—"}`, ju ? matchZhi(JIANG_XING[ju]) : [], "主威权领导，能担重任。");
  push("华盖", "中性", `以年支 ${yearZhi} 所属三合局查 ${ju ? HUA_GAI[ju] : "—"}`, ju ? matchZhi(HUA_GAI[ju]) : [], "主孤高清雅，近艺术玄学。");
  push("驿马", "中性", `以年支 ${yearZhi} 所属三合局查 ${ju ? YI_MA[ju] : "—"}`, ju ? matchZhi(YI_MA[ju]) : [], "主奔波变动、迁移出行。");
  push("桃花（咸池）", "中性", `以年支 ${yearZhi} 所属三合局查 ${ju ? TAO_HUA[ju] : "—"}`, ju ? matchZhi(TAO_HUA[ju]) : [], "主人缘魅力，亦主情感纠葛。");
  push("劫煞", "凶", `以年支 ${yearZhi} 所属三合局查 ${ju ? JIE_SHA[ju] : "—"}`, ju ? matchZhi(JIE_SHA[ju]) : [], "主意外破耗，宜谨慎行事。");
  push("亡神", "凶", `以年支 ${yearZhi} 所属三合局查 ${ju ? WANG_SHEN[ju] : "—"}`, ju ? matchZhi(WANG_SHEN[ju]) : [], "主心机深、易生官非口舌。");
  push("红艳煞", "凶", `以日干 ${dayGan} 查 ${HONG_YAN[dayGan]}`, matchZhi(HONG_YAN[dayGan]), "主情感丰富，易生感情困扰。");
  if (guGua) {
    push("孤辰", "凶", `以年支 ${yearZhi} 查 ${guGua.gu}`, matchZhi(guGua.gu), "主孤独少亲，宜修身养性。");
    push("寡宿", "凶", `以年支 ${yearZhi} 查 ${guGua.gua}`, matchZhi(guGua.gua), "主寡合少助，宜主动经营人际。");
  }

  /* --- 大运 / 流年 / 流月 --- */
  const yun = ec.getYun(genderCode, 2);
  const startSolar = yun.getStartSolar();
  const startAgeParts = [
    yun.getStartYear() ? `${yun.getStartYear()} 年` : "",
    yun.getStartMonth() ? `${yun.getStartMonth()} 个月` : "",
    yun.getStartDay() ? `${yun.getStartDay()} 天` : ""
  ].filter(Boolean);

  const focusYear = req.focusYear ?? new Date().getFullYear();
  const forward = isForward(ec.getYearGan(), req.gender);

  const daYun: DaYunItem[] = yun.getDaYun().map((d) => {
    const gz = d.getGanZhi();
    const gan = gz ? gz.charAt(0) : "";
    return {
      index: d.getIndex(),
      ganZhi: gz || "起运前",
      startAge: d.getStartAge(),
      endAge: d.getEndAge(),
      startYear: d.getStartYear(),
      endYear: d.getEndYear(),
      // 起运前那一步干支为空，lunar-typescript 内部会抛错，故先判空再取
      xunKong: gz ? safe(() => d.getXunKong(), "—") : "—",
      ganShiShen: gan ? shiShenOf(dayGan, gan) : "—",
      liuNian: d.getLiuNian().map((n) => {
        const lgz = n.getGanZhi();
        const lgan = lgz ? lgz.charAt(0) : "";
        const item: LiuNianItem = {
          year: n.getYear(),
          age: n.getAge(),
          ganZhi: lgz,
          ganShiShen: lgan ? shiShenOf(dayGan, lgan) : "—",
          xunKong: lgz ? safe(() => n.getXunKong(), "—") : "—"
        };
        if (n.getYear() === focusYear) {
          item.liuYue = n.getLiuYue().map((m) => {
            const mgz = m.getGanZhi();
            const mgan = mgz ? mgz.charAt(0) : "";
            return {
              month: `${m.getMonthInChinese()}月`,
              ganZhi: mgz,
              ganShiShen: mgan ? shiShenOf(dayGan, mgan) : "—"
            };
          });
        }
        return item;
      })
    };
  });

  return {
    solar: solar.toString(),
    lunar: lunar.toString(),
    lunarFull: lunar.toString(),
    yearInGanZhi: lunar.getYearInGanZhi(),
    yearShengXiao: lunar.getYearShengXiao(),
    pillars,
    fourPillars: {
      year: { ganzhi: raw[0].ganzhi, gan: raw[0].gan, zhi: raw[0].zhi },
      month: { ganzhi: raw[1].ganzhi, gan: raw[1].gan, zhi: raw[1].zhi },
      day: { ganzhi: raw[2].ganzhi, gan: raw[2].gan, zhi: raw[2].zhi },
      time: { ganzhi: raw[3].ganzhi, gan: raw[3].gan, zhi: raw[3].zhi }
    },
    dayMaster: dayGan,
    dayMasterWuXing: dayWuXing,
    dayMasterYinYang: dayYinYang,
    taiYuan: ec.getTaiYuan(),
    taiYuanNaYin: ec.getTaiYuanNaYin(),
    mingGong: ec.getMingGong(),
    mingGongNaYin: ec.getMingGongNaYin(),
    shenGong: ec.getShenGong(),
    shenGongNaYin: ec.getShenGongNaYin(),
    taiXi: ec.getTaiXi(),
    taiXiNaYin: ec.getTaiXiNaYin(),
    wuXing: {
      stats,
      sameScore: round2(sameScore),
      otherScore: round2(total - sameScore),
      ratio: round2(ratio),
      level,
      deLing,
      deDi,
      deShi,
      summary,
      missing,
      favorable,
      unfavorable
    },
    shiShenCount,
    shenSha,
    yun: {
      startAgeText: startAgeParts.join(" ") || "—",
      startSolar: startSolar.toString(),
      direction: `${genderCode === 1 ? "男" : "女"}命${forward ? "顺" : "逆"}行`,
      forward
    },
    daYun,
    focusYear,
    disclaimer: "本结果仅供文化娱乐与自省参考，不构成任何专业建议。"
  };
}

/** 阳年男 / 阴年女 顺排，其余逆排 */
function isForward(yearGan: string, gender: string): boolean {
  const yearGanYang = GAN.indexOf(yearGan) % 2 === 0;
  const male = gender !== "女";
  return yearGanYang === male;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
/** lunar-typescript 在空干支上调用旬空相关方法会抛错，统一兜底 */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
