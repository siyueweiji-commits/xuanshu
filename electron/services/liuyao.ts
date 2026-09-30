/**
 * 六爻（M6 完整版）
 *
 * 起卦：
 *   1. 铜钱起卦（模拟三枚铜钱，六掷成卦）
 *      三背 = 老阳（阳，动）　两背一字 = 少阳（阳，静）
 *      三字 = 老阴（阴，动）　两字一背 = 少阴（阴，静）
 *   2. 手动录入：直接给出六爻（先/后）与动爻
 *
 * 装卦：
 *   纳甲（京房纳甲：内外卦各配天干地支）→ 六亲（以宫五行为我）→ 六神（按日干起）
 *   → 世应（按京房八宫位次）→ 伏神（本宫首卦同爻位补缺）→ 变卦装卦
 *
 * 另判：六冲卦 / 六合卦 / 卦身 / 世应六亲关系 / 旬空
 */
import {
  HexagramMeta,
  LIUSHEN,
  LiuQin,
  LiuShen,
  NaJiaEntry,
  ZHI,
  changedLines,
  hexagramMeta,
  hexagramOfLines,
  linesToUpperLower,
  liuQin,
  liuShenOf,
  najia,
  upperLowerToLines,
  yaoTitle,
  hexagramName
} from "./bagua";
import { matchRules, DISCLAIMER, Rule, listRules } from "./rules";

export const COIN_FACES = ["字", "背"] as const;

/* ------------------------------------------------------------------ */
/*  输入 / 输出                                                        */
/* ------------------------------------------------------------------ */

export interface LiuyaoRequest {
  question?: string;
  /** 起卦方式：coins（默认）或 manual */
  mode?: "coins" | "manual";
  /**
   * manual 模式的六爻，**初爻在前**。
   * value：1 = 阳，0 = 阴；changing：是否动爻
   */
  manualLines?: Array<{ value: number; changing?: boolean }>;
  /** 日干（用于起六神），不传则用今日干支 */
  dayGan?: string;
  /** 日干支（用于旬空与日辰），如「丁未」 */
  dayGanZhi?: string;
  /** 月干支，如「丁酉」 */
  monthGanZhi?: string;
}

export interface YaoDetail {
  position: number;
  /** 爻性：老阳/少阴/老阴/少阳 */
  nature: string;
  yang: boolean;
  changing: boolean;
  /** 如「初九」 */
  title: string;
  /** 三枚铜钱（manual 模式为 null） */
  coins: string[] | null;
  /** 纳甲干支 */
  gan: string;
  zhi: string;
  ganZhi: string;
  /** 地支五行 */
  wuxing: string;
  /** 六亲 */
  liuQin: LiuQin;
  /** 六神 */
  liuShen: LiuShen;
  /** 是否世爻 / 应爻 */
  isShi: boolean;
  isYing: boolean;
  /** 伏神：本卦缺此六亲时，从本宫首卦同爻位借来 */
  fuShen: { liuQin: LiuQin; ganZhi: string; wuxing: string } | null;
  /** 变爻（动爻才有） */
  changedYang: boolean | null;
}

export interface LiuyaoAdvice {
  id: string;
  text: string;
  level: string;
  weight: number;
  system: string;
  source: string;
}

export interface HexagramBrief {
  name: string;
  upper: number;
  lower: number;
  upperName: string;
  lowerName: string;
  lines: number[];
}

export interface LiuyaoResult {
  mode: "coins" | "manual";
  question: string;
  /** 公历起卦时间 */
  thrownAt: string;
  /** 起卦所用日干支 / 月干支 */
  dayGanZhi: string;
  monthGanZhi: string;
  /** 旬空（日辰所在旬的空亡地支） */
  xunKong: string[];
  lines: YaoDetail[];
  original: HexagramBrief;
  changed: HexagramBrief | null;
  /** 变卦的宫位信息（有动爻时） */
  changedMeta: (HexagramMeta & { name: string }) | null;
  movingLines: number[];
  meta: HexagramMeta & { name: string; palaceWuxing: string };
  /** 世爻 / 应爻所在爻位 */
  shi: number;
  ying: number;
  shiYao: YaoDetail;
  yingYao: YaoDetail;
  /** 六亲分布统计 */
  liuQinCount: Record<string, number>;
  /** 六冲卦 / 六合卦 */
  isChong: boolean;
  isHe: boolean;
  /** 世应关系（世爻六亲 ↔ 应爻六亲） */
  shiYingText: string;
  advice: LiuyaoAdvice[];
  facts: Record<string, unknown>;
  disclaimer: string;
}

/* ------------------------------------------------------------------ */
/*  常量表                                                             */
/* ------------------------------------------------------------------ */

/** 六冲卦：八纯卦 + 天雷无妄 + 雷天大壮 */
const CHONG_HEXAGRAMS = new Set([
  "乾为天", "坤为地", "震为雷", "巽为风", "坎为水", "离为火", "艮为山", "兑为泽",
  "天雷无妄", "雷天大壮"
]);

/** 六合卦：天地否、地天泰、雷地豫、地雷复、火山旅、山火贲、水泽节、泽水困 */
const HE_HEXAGRAMS = new Set([
  "天地否", "地天泰", "雷地豫", "地雷复", "火山旅", "山火贲", "水泽节", "泽水困"
]);

/** 六亲完整集合（用于判断本卦缺哪些六亲，进而补伏神） */
const ALL_LIUQIN: LiuQin[] = ["父母", "兄弟", "子孙", "妻财", "官鬼"];

/** 天干 */
const GAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];

/* ------------------------------------------------------------------ */
/*  工具                                                               */
/* ------------------------------------------------------------------ */

function trimGan(g: string | undefined): string {
  const s = (g ?? "").trim();
  return GAN.includes(s) ? s : "";
}

/** 由日干支取旬空（空亡）两支 */
export function xunKongOf(ganZhi: string): string[] {
  const gan = ganZhi.slice(0, 1);
  const zhi = ganZhi.slice(1, 2);
  const gi = GAN.indexOf(gan);
  const zi = (ZHI as readonly string[]).indexOf(zhi);
  if (gi < 0 || zi < 0) return [];
  // 旬首：找到该旬的起始（甲 x），旬空为旬首前两位地支
  const startZhi = ((zi - gi) % 12 + 12) % 12;
  const kong1 = ZHI[(startZhi + 10) % 12];
  const kong2 = ZHI[(startZhi + 11) % 12];
  return [kong1, kong2];
}

function natureOf(yang: boolean, changing: boolean): string {
  if (yang) return changing ? "老阳（动）" : "少阳";
  return changing ? "老阴（动）" : "少阴";
}

/* ------------------------------------------------------------------ */
/*  起卦                                                               */
/* ------------------------------------------------------------------ */

function throwCoins(): { coins: string[]; yang: boolean; changing: boolean; nature: string } {
  const coins = Array.from({ length: 3 }, () => (Math.random() < 0.5 ? "背" : "字"));
  const backs = coins.filter((c) => c === "背").length;
  if (backs === 3) return { coins, yang: true, changing: true, nature: "老阳（动）" };
  if (backs === 2) return { coins, yang: true, changing: false, nature: "少阳" };
  if (backs === 1) return { coins, yang: false, changing: false, nature: "少阴" };
  return { coins, yang: false, changing: true, nature: "老阴（动）" };
}

interface RawLine {
  yang: boolean;
  changing: boolean;
  coins: string[] | null;
}

function resolveLines(req: LiuyaoRequest): RawLine[] {
  if (req.mode === "manual") {
    const input = req.manualLines;
    if (!Array.isArray(input) || input.length !== 6) {
      throw new Error("手动录入需要正好 6 爻（初爻在前）");
    }
    return input.map((l, i) => {
      if (!l || (l.value !== 0 && l.value !== 1)) {
        throw new Error(`第 ${i + 1} 爻需为 1（阳）或 0（阴）`);
      }
      return { yang: l.value === 1, changing: l.changing === true, coins: null };
    });
  }
  return Array.from({ length: 6 }, () => {
    const t = throwCoins();
    return { yang: t.yang, changing: t.changing, coins: t.coins };
  });
}

/* ------------------------------------------------------------------ */
/*  装卦                                                               */
/* ------------------------------------------------------------------ */

interface Installed {
  name: string;
  lines: number[];
  meta: HexagramMeta;
  najia: NaJiaEntry[];
  liuQinList: LiuQin[];
  fuShen: Array<{ liuQin: LiuQin; ganZhi: string; wuxing: string } | null>;
}

/**
 * 装一卦：纳甲 + 六亲 + 伏神。
 * 伏神规则：本卦缺少某六亲时，从**本宫首卦（八纯卦）**里找到该六亲所在爻位，
 * 把那一爻的干支作为伏神伏在该爻位之下。每个缺失六亲只伏一处。
 */
function install(lines: number[]): Installed {
  const { upper, lower } = linesToUpperLower(lines);
  const name = hexagramName(upper, lower);
  const meta = hexagramMeta(name);
  const nj = najia(lines);
  const liuQinList = nj.map((e) => liuQin(meta.palaceWuxing, e.wuxing));

  const present = new Set(liuQinList);

  // 本宫首卦（八纯卦）的纳甲与六亲
  const palaces: Record<string, number> = { 乾: 1, 坎: 6, 艮: 7, 震: 4, 巽: 5, 离: 3, 坤: 8, 兑: 2 };
  const pureUpper = palaces[meta.palace] ?? 1;
  const pureNj = najia(upperLowerToLines(pureUpper, pureUpper));

  const fuShen: Installed["fuShen"] = new Array(6).fill(null);
  for (const missing of ALL_LIUQIN) {
    if (present.has(missing)) continue;
    for (let i = 0; i < 6; i += 1) {
      if (liuQin(meta.palaceWuxing, pureNj[i].wuxing) !== missing) continue;
      fuShen[i] = {
        liuQin: missing,
        ganZhi: pureNj[i].ganzhi,
        wuxing: pureNj[i].wuxing
      };
      break;
    }
  }

  return { name, lines, meta, najia: nj, liuQinList, fuShen };
}

/* ------------------------------------------------------------------ */
/*  主入口                                                             */
/* ------------------------------------------------------------------ */

export function qigua(req: LiuyaoRequest = {}): LiuyaoResult {
  const mode: "coins" | "manual" = req.mode === "manual" ? "manual" : "coins";
  const raw = resolveLines({ ...req, mode });

  const lines = raw.map((l) => (l.yang ? 1 : 0));
  const movingLines = raw.map((l, i) => (l.changing ? i + 1 : 0)).filter((v) => v > 0);

  const inst = install(lines);
  const hasChange = movingLines.length > 0;
  const changedArr = changedLines(lines, movingLines);
  const changedInst = hasChange ? install(changedArr) : null;

  // 日干支：未传则用今日
  const dayGanZhi = (req.dayGanZhi ?? "").trim() || todayGanZhi();
  const monthGanZhi = (req.monthGanZhi ?? "").trim();
  const dayGan = trimGan(req.dayGan) || dayGanZhi.slice(0, 1);
  const liuShen = liuShenOf(dayGan);
  const xunKong = xunKongOf(dayGanZhi);

  const details: YaoDetail[] = raw.map((l, i) => {
    const nj = inst.najia[i];
    return {
      position: i + 1,
      nature: natureOf(l.yang, l.changing),
      yang: l.yang,
      changing: l.changing,
      title: yaoTitle(i + 1, l.yang),
      coins: l.coins,
      gan: nj.gan,
      zhi: nj.zhi,
      ganZhi: nj.ganzhi,
      wuxing: nj.wuxing,
      liuQin: inst.liuQinList[i],
      liuShen: liuShen[i],
      isShi: inst.meta.shi === i + 1,
      isYing: inst.meta.ying === i + 1,
      fuShen: inst.fuShen[i],
      changedYang: l.changing ? !l.yang : null
    };
  });

  const shiYao = details[inst.meta.shi - 1];
  const yingYao = details[inst.meta.ying - 1];

  const liuQinCount: Record<string, number> = {};
  for (const q of ALL_LIUQIN) liuQinCount[q] = 0;
  for (const d of details) liuQinCount[d.liuQin] = (liuQinCount[d.liuQin] ?? 0) + 1;

  const missingQin = ALL_LIUQIN.filter((q) => (liuQinCount[q] ?? 0) === 0);

  const facts: Record<string, unknown> = {
    本卦: inst.name,
    变卦: changedInst?.name ?? "",
    卦宫: inst.meta.palace,
    宫五行: inst.meta.palaceWuxing,
    卦位次: inst.meta.slotName,
    世爻: inst.meta.shi,
    应爻: inst.meta.ying,
    世爻六亲: shiYao.liuQin,
    应爻六亲: yingYao.liuQin,
    世应关系: `${shiYao.liuQin}对${yingYao.liuQin}`,
    动爻数量: movingLines.length,
    动爻: movingLines.join("、"),
    世爻旬空: xunKong.includes(shiYao.zhi),
    应爻旬空: xunKong.includes(yingYao.zhi),
    世爻地支: shiYao.zhi,
    世爻五行: shiYao.wuxing,
    世爻与月建同支: Boolean(monthGanZhi) && monthGanZhi.slice(1, 2) === shiYao.zhi,
    世爻与日辰同支: dayGanZhi.slice(1, 2) === shiYao.zhi,
    六冲卦: CHONG_HEXAGRAMS.has(inst.name),
    六合卦: HE_HEXAGRAMS.has(inst.name),
    游魂卦: inst.meta.slotName === "游魂",
    归魂卦: inst.meta.slotName === "归魂",
    本宫卦: inst.meta.slotName === "本宫",
    六亲齐备: missingQin.length === 0,
    缺六亲: missingQin.join("、"),
    缺妻财: missingQin.includes("妻财"),
    缺官鬼: missingQin.includes("官鬼"),
    缺父母: missingQin.includes("父母"),
    缺兄弟: missingQin.includes("兄弟"),
    缺子孙: missingQin.includes("子孙"),
    日干支: dayGanZhi,
    月干支: monthGanZhi,
    旬空: xunKong.join("、")
  };

  const advice: LiuyaoAdvice[] = matchRules(listRules("liuyao"), facts)
    .map((r: Rule) => ({
      id: r.id,
      text: r.advice,
      level: r.level ?? "info",
      weight: r.weight ?? 0.3,
      system: r.system,
      source: r.label ?? `六爻·${r.tags?.[0] ?? "断卦"}`
    }))
    .sort((a, b) => b.weight - a.weight);

  return {
    mode,
    question: req.question?.trim() || "未记录问题",
    thrownAt: new Date().toISOString(),
    dayGanZhi,
    monthGanZhi,
    xunKong,
    lines: details,
    original: {
      name: inst.name,
      upper: linesToUpperLower(lines).upper,
      lower: linesToUpperLower(lines).lower,
      upperName: hexagramOfLines(lines).upperName,
      lowerName: hexagramOfLines(lines).lowerName,
      lines
    },
    changed: changedInst
      ? {
          name: changedInst.name,
          upper: linesToUpperLower(changedArr).upper,
          lower: linesToUpperLower(changedArr).lower,
          upperName: hexagramOfLines(changedArr).upperName,
          lowerName: hexagramOfLines(changedArr).lowerName,
          lines: changedArr
        }
      : null,
    changedMeta: changedInst ? { ...changedInst.meta, name: changedInst.name } : null,
    movingLines,
    meta: { ...inst.meta, name: inst.name },
    shi: inst.meta.shi,
    ying: inst.meta.ying,
    shiYao,
    yingYao,
    liuQinCount,
    isChong: CHONG_HEXAGRAMS.has(inst.name),
    isHe: HE_HEXAGRAMS.has(inst.name),
    shiYingText: `${shiYao.liuQin}（世）对${yingYao.liuQin}（应）`,
    advice,
    facts,
    disclaimer: DISCLAIMER
  };
}

/** 今日干支（不依赖 electron） */
function todayGanZhi(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Solar } = require("lunar-typescript") as typeof import("lunar-typescript");
  const d = new Date();
  return Solar.fromYmdHms(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), 0)
    .getLunar()
    .getDayInGanZhi();
}

export { LIUSHEN, hexagramMeta };
export type { LiuQin, LiuShen };
