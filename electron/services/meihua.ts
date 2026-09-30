/**
 * 梅花易数（M6 完整版）
 *
 * 三种起卦法：
 *   1. 时间起卦　上卦=(年支序+月+日)%8　下卦=(年支序+月+日+时辰序)%8　动爻=总和%6
 *   2. 数字起卦　两数分作上下卦，动爻取两数之和 %6
 *   3. 报数起卦　三数：数一=上卦、数二=下卦、数三=动爻
 *
 * 体用判定（**传统定则，勿弄反**）：
 *   「动爻所在之卦为用卦，另一卦为体卦」——体代表自己与主体，用代表所占之事。
 *   动爻在初/二/三爻 → 下卦为用、上卦为体；动爻在四/五/上爻 → 上卦为用、下卦为体。
 *
 * 输出：本卦 / 互卦 / 变卦 / 错卦 / 综卦、体用生克、逐爻明细、规则库解读。
 */
import {
  HexagramView,
  RelationInfo,
  changedLines,
  hexagramOfLines,
  linesToUpperLower,
  mutualLines,
  oppositeLines,
  relationInfo,
  reversedLines,
  trigram,
  upperLowerToLines,
  yaoTitle
} from "./bagua";
import { matchRules, DISCLAIMER, Rule, listRules } from "./rules";

export const MEIHUA_MODES = ["time", "numbers", "baoshu"] as const;
export type MeihuaMode = (typeof MEIHUA_MODES)[number];

export const MEIHUA_MODE_NAMES: Record<MeihuaMode, string> = {
  time: "时间起卦",
  numbers: "数字起卦",
  baoshu: "报数起卦"
};

/* ------------------------------------------------------------------ */
/*  输入                                                               */
/* ------------------------------------------------------------------ */

export interface MeihuaRequest {
  mode: MeihuaMode;
  question?: string;
  /** time 模式：农历分量（由历法层提供） */
  yearZhiIndex?: number;
  lunarMonth?: number;
  lunarDay?: number;
  hourIndex?: number;
  /** numbers / baoshu 模式 */
  num1?: number;
  num2?: number;
  /** baoshu 模式：动爻数 */
  num3?: number;
}

/* ------------------------------------------------------------------ */
/*  输出                                                               */
/* ------------------------------------------------------------------ */

export interface LunarCastView {
  yearZhi: string;
  yearZhiIndex: number;
  lunarMonth: number;
  lunarMonthCn: string;
  lunarDay: number;
  lunarDayCn: string;
  hourZhi: string;
  hourIndex: number;
  /** 年支序 + 农历月 + 农历日 */
  base: number;
  /** 年支序 + 农历月 + 农历日 + 时辰序 */
  total: number;
}

export interface YaoView {
  position: number;
  yang: boolean;
  changing: boolean;
  /** 如「初九」「六三」 */
  title: string;
}

export interface MeihuaAdvice {
  id: string;
  text: string;
  level: string;
  weight: number;
  system: string;
  source: string;
}

export interface HexagramBundle {
  name: string;
  upper: number;
  lower: number;
  upperName: string;
  lowerName: string;
  upperSymbol: string;
  lowerSymbol: string;
  lines: number[];
}

export interface TrigramRef {
  trigram: number;
  name: string;
  symbol: string;
  wuxing: string;
}

export interface MeihuaResult {
  mode: MeihuaMode;
  modeName: string;
  question: string;
  lunar: LunarCastView | null;
  /** 起卦所用数字（numbers：两数；baoshu：三数；time：起卦基数和） */
  numbers: number[];
  original: HexagramBundle;
  mutual: HexagramBundle;
  changed: HexagramBundle;
  opposite: HexagramBundle;
  reversed: HexagramBundle;
  movingLines: number[];
  movingLine: number;
  body: TrigramRef;
  use: TrigramRef;
  /** 用卦位于「下卦」（初二三）还是「上卦」（四五六） */
  usePart: "下卦" | "上卦";
  relation: RelationInfo;
  /** 变卦中「用卦所在位置」变成的新卦 */
  changedUse: TrigramRef;
  changedRelation: RelationInfo;
  yaos: YaoView[];
  advice: MeihuaAdvice[];
  facts: Record<string, unknown>;
  castAt: string;
  disclaimer: string;
}

/* ------------------------------------------------------------------ */
/*  起卦                                                               */
/* ------------------------------------------------------------------ */

/** 余数取卦：0 记为 8（坤） */
function mod8(n: number): number {
  const r = ((n % 8) + 8) % 8;
  return r === 0 ? 8 : r;
}

/** 余数取爻：0 记为 6（上爻） */
function mod6(n: number): number {
  const r = ((n % 6) + 6) % 6;
  return r === 0 ? 6 : r;
}

function positiveInt(v: unknown, field: string): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${field} 须为正整数`);
  return n;
}

interface CastCore {
  upper: number;
  lower: number;
  movingLine: number;
}

function castTime(req: MeihuaRequest): { core: CastCore; lunar: LunarCastView } {
  const yearZhiIndex = positiveInt(req.yearZhiIndex, "年支序");
  const lunarMonth = positiveInt(Math.abs(Number(req.lunarMonth)), "农历月");
  const lunarDay = positiveInt(req.lunarDay, "农历日");
  const hourIndex = positiveInt(req.hourIndex, "时辰序");
  const base = yearZhiIndex + lunarMonth + lunarDay;
  const total = base + hourIndex;
  return {
    core: { upper: mod8(base), lower: mod8(total), movingLine: mod6(total) },
    lunar: {
      yearZhi: "",
      yearZhiIndex,
      lunarMonth,
      lunarMonthCn: "",
      lunarDay,
      lunarDayCn: "",
      hourZhi: "",
      hourIndex,
      base,
      total
    }
  };
}

function castNumbers(req: MeihuaRequest): { core: CastCore; numbers: number[] } {
  const n1 = positiveInt(req.num1, "数一");
  const n2 = positiveInt(req.num2, "数二");
  return {
    core: { upper: mod8(n1), lower: mod8(n2), movingLine: mod6(n1 + n2) },
    numbers: [n1, n2]
  };
}

function castBaoshu(req: MeihuaRequest): { core: CastCore; numbers: number[] } {
  const n1 = positiveInt(req.num1, "数一");
  const n2 = positiveInt(req.num2, "数二");
  const n3 = positiveInt(req.num3, "数三");
  return {
    core: { upper: mod8(n1), lower: mod8(n2), movingLine: mod6(n3) },
    numbers: [n1, n2, n3]
  };
}

/* ------------------------------------------------------------------ */
/*  体用                                                               */
/* ------------------------------------------------------------------ */

/** 动爻所在之卦为「用」，另一卦为「体」 */
export function bodyUseOf(
  upper: number,
  lower: number,
  movingLine: number
): { body: number; use: number; usePart: "下卦" | "上卦" } {
  const lowerIsUse = movingLine <= 3;
  return {
    body: lowerIsUse ? upper : lower,
    use: lowerIsUse ? lower : upper,
    usePart: lowerIsUse ? "下卦" : "上卦"
  };
}

/* ------------------------------------------------------------------ */
/*  装配                                                               */
/* ------------------------------------------------------------------ */

function bundle(lines: number[]): HexagramBundle {
  const h: HexagramView = hexagramOfLines(lines);
  return {
    name: h.name,
    upper: h.upper,
    lower: h.lower,
    upperName: h.upperName,
    lowerName: h.lowerName,
    upperSymbol: h.upperSymbol,
    lowerSymbol: h.lowerSymbol,
    lines: h.lines
  };
}

function trigramAt(lines: number[], part: "下卦" | "上卦"): number {
  const { upper, lower } = linesToUpperLower(lines);
  return part === "下卦" ? lower : upper;
}

function trigramRef(num: number): TrigramRef {
  const t = trigram(num);
  return { trigram: num, name: t.name, symbol: t.symbol, wuxing: t.wuxing };
}

/* ------------------------------------------------------------------ */
/*  主入口                                                             */
/* ------------------------------------------------------------------ */

export function qigua(req: MeihuaRequest): MeihuaResult {
  const mode: MeihuaMode = MEIHUA_MODES.includes(req.mode) ? req.mode : "time";

  let core: CastCore;
  let lunar: LunarCastView | null = null;
  let numbers: number[] = [];

  if (mode === "time") {
    const t = castTime(req);
    core = t.core;
    lunar = t.lunar;
    numbers = [t.lunar.base, t.lunar.hourIndex, t.lunar.total];
  } else if (mode === "numbers") {
    const t = castNumbers(req);
    core = t.core;
    numbers = t.numbers;
  } else {
    const t = castBaoshu(req);
    core = t.core;
    numbers = t.numbers;
  }

  const lines = upperLowerToLines(core.upper, core.lower);
  const movingLines = [core.movingLine];
  const changed = changedLines(lines, movingLines);
  const mutual = mutualLines(lines);
  const opposite = oppositeLines(lines);
  const reversed = reversedLines(lines);

  const { body: bodyNum, use: useNum, usePart } = bodyUseOf(core.upper, core.lower, core.movingLine);
  const bodyRef = trigramRef(bodyNum);
  const useRef = trigramRef(useNum);
  const rel = relationInfo(bodyRef.wuxing, useRef.wuxing);

  const changedUseRef = trigramRef(trigramAt(changed, usePart));
  const changedRel = relationInfo(bodyRef.wuxing, changedUseRef.wuxing);

  const yaos: YaoView[] = lines.map((v, i) => ({
    position: i + 1,
    yang: Boolean(v),
    changing: movingLines.includes(i + 1),
    title: yaoTitle(i + 1, Boolean(v))
  }));

  const originalBundle = bundle(lines);
  const facts: Record<string, unknown> = {
    来源: MEIHUA_MODE_NAMES[mode],
    本卦: originalBundle.name,
    上卦: trigram(core.upper).name,
    下卦: trigram(core.lower).name,
    上卦五行: trigram(core.upper).wuxing,
    下卦五行: trigram(core.lower).wuxing,
    互卦: bundle(mutual).name,
    变卦: bundle(changed).name,
    错卦: bundle(opposite).name,
    综卦: bundle(reversed).name,
    体卦: bodyRef.name,
    用卦: useRef.name,
    体五行: bodyRef.wuxing,
    用五行: useRef.wuxing,
    体用关系: rel.kind,
    变卦体用关系: changedRel.kind,
    用卦位置: usePart,
    动爻: core.movingLine,
    动爻数: movingLines.length
  };

  const rules: Rule[] = matchRules(listRules("meihua"), facts);
  const advice: MeihuaAdvice[] = rules
    .map((r) => ({
      id: r.id,
      text: r.advice,
      level: r.level ?? "info",
      weight: r.weight ?? 0.3,
      system: r.system,
      source: r.label ?? `梅花·${r.tags?.[0] ?? "断卦"}`
    }))
    .sort((a, b) => b.weight - a.weight);

  return {
    mode,
    modeName: MEIHUA_MODE_NAMES[mode],
    question: req.question?.trim() || "未记录问题",
    lunar,
    numbers,
    original: originalBundle,
    mutual: bundle(mutual),
    changed: bundle(changed),
    opposite: bundle(opposite),
    reversed: bundle(reversed),
    movingLines,
    movingLine: core.movingLine,
    body: bodyRef,
    use: useRef,
    usePart,
    relation: rel,
    changedUse: changedUseRef,
    changedRelation: changedRel,
    yaos,
    advice,
    facts,
    castAt: new Date().toISOString(),
    disclaimer: DISCLAIMER
  };
}

/* ------------------------------------------------------------------ */
/*  兼容旧调用签名                                                     */
/* ------------------------------------------------------------------ */

export function shijianQigua(input: {
  yearZhiIndex: number;
  lunarMonth: number;
  lunarDay: number;
  hourIndex: number;
}): MeihuaResult {
  return qigua({ mode: "time", ...input });
}

export function shuziQigua(input: { num1: number; num2: number }): MeihuaResult {
  return qigua({ mode: "numbers", ...input });
}

export function baoshuQigua(input: { num1: number; num2: number; num3: number }): MeihuaResult {
  return qigua({ mode: "baoshu", ...input });
}

/** 由上卦数、下卦数、动爻直接成卦（供知识库与校验脚本使用） */
export function byTrigrams(upper: number, lower: number, movingLine: number): MeihuaResult {
  return qigua({ mode: "baoshu", num1: upper, num2: lower, num3: movingLine });
}

/* 兼容：早期实现把卦表放在本模块，现在统一迁到 bagua.ts */
export { GUA_NAMES, TRIGRAMS, hexagramName, linesToUpperLower } from "./bagua";
