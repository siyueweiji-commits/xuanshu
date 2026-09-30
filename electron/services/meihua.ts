/**
 * 梅花易数（自研基础版）
 * 先天数：乾1 兑2 离3 震4 巽5 坎6 艮7 坤8
 * 上卦 = (年支序 + 月 + 日) % 8；下卦 = (年支序 + 月 + 日 + 时辰序) % 8；动爻 = 总和 % 6
 * M6 将补充：互卦/错卦/综卦全量、体用生克细则、规则库解读
 */

export const TRIGRAMS: Record<number, { name: string; symbol: string; wuxing: string }> = {
  1: { name: "乾", symbol: "☰", wuxing: "金" },
  2: { name: "兑", symbol: "☱", wuxing: "金" },
  3: { name: "离", symbol: "☲", wuxing: "火" },
  4: { name: "震", symbol: "☳", wuxing: "木" },
  5: { name: "巽", symbol: "☴", wuxing: "木" },
  6: { name: "坎", symbol: "☵", wuxing: "水" },
  7: { name: "艮", symbol: "☶", wuxing: "土" },
  8: { name: "坤", symbol: "☷", wuxing: "土" }
};

/** 六十四卦名表：GUA_NAMES[上卦先天数][下卦先天数] = 卦名 */
export const GUA_NAMES: Record<number, Record<number, string>> = {
  1: { 1: "乾为天", 2: "天泽履", 3: "天火同人", 4: "天雷无妄", 5: "天风姤", 6: "天水讼", 7: "天山遁", 8: "天地否" },
  2: { 1: "泽天夬", 2: "兑为泽", 3: "泽火革", 4: "泽雷随", 5: "泽风大过", 6: "泽水困", 7: "泽山咸", 8: "泽地萃" },
  3: { 1: "火天大有", 2: "火泽睽", 3: "离为火", 4: "火雷噬嗑", 5: "火风鼎", 6: "火水未济", 7: "火山旅", 8: "火地晋" },
  4: { 1: "雷天大壮", 2: "雷泽归妹", 3: "雷火丰", 4: "震为雷", 5: "雷风恒", 6: "雷水解", 7: "雷山小过", 8: "雷地豫" },
  5: { 1: "风天小畜", 2: "风泽中孚", 3: "风火家人", 4: "风雷益", 5: "巽为风", 6: "风水涣", 7: "风山渐", 8: "风地观" },
  6: { 1: "水天需", 2: "水泽节", 3: "水火既济", 4: "水雷屯", 5: "水风井", 6: "坎为水", 7: "水山蹇", 8: "水地比" },
  7: { 1: "山天大畜", 2: "山泽损", 3: "山火贲", 4: "山雷颐", 5: "山风蛊", 6: "山水蒙", 7: "艮为山", 8: "山地剥" },
  8: { 1: "地天泰", 2: "地泽临", 3: "地火明夷", 4: "地雷复", 5: "地风升", 6: "地水师", 7: "地山谦", 8: "坤为地" }
};

export function hexagramName(upper: number, lower: number): string {
  return GUA_NAMES[upper]?.[lower] ?? "未知卦";
}

/** 爻位（初爻为最低位）→ 内/外卦先天数 */
export function linesToUpperLower(lines: number[]): { upper: number; lower: number } {
  // lines: [初爻, 二爻, 三爻, 四爻, 五爻, 上爻]，1=阳 0=阴
  const lowerBits = (lines[0] ? 1 : 0) | (lines[1] ? 2 : 0) | (lines[2] ? 4 : 0);
  const upperBits = (lines[3] ? 1 : 0) | (lines[4] ? 2 : 0) | (lines[5] ? 4 : 0);
  const BITS_TO_NUMBER: Record<number, number> = {
    7: 1, 3: 2, 5: 3, 1: 4, 6: 5, 2: 6, 4: 7, 0: 8
  };
  return { upper: BITS_TO_NUMBER[upperBits], lower: BITS_TO_NUMBER[lowerBits] };
}

export interface MeihuaTimeInput {
  yearZhiIndex: number; // 年支序 1-12（子=1）
  lunarMonth: number;
  lunarDay: number;
  hourIndex: number; // 时辰序 1-12（子=1）
}

export interface MeihuaNumbersInput {
  num1: number;
  num2: number;
}

export interface MeihuaResult {
  upper: number;
  lower: number;
  upperName: string;
  lowerName: string;
  movingLine: number; // 1-6，动爻位（1=初爻）
  hexagram: string;
  bodyTrigram: number;
  useTrigram: number;
  bodyUseRelation: string;
  source: string;
  disclaimer: string;
}

const RELATIONS: Record<string, string> = {
  "体克用": "体克用，事可成但费力，宜主动把握。",
  "用克体": "用克体，事多阻逆，宜守不宜进，防损耗。",
  "体生用": "体生用，有耗泄之象，付出多而回报缓。",
  "用生体": "用生体，有进益之喜，得外助，宜顺势而为。",
  "体用同": "体用比和，诸事顺遂，可平稳推进。"
};

function relationBetween(body: number, use: number): string {
  const WX: Record<number, string> = { 1: "金", 2: "金", 3: "火", 4: "木", 5: "木", 6: "水", 7: "土", 8: "土" };
  const generates: Record<string, string> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
  const overcomes: Record<string, string> = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };
  const b = WX[body];
  const u = WX[use];
  if (b === u) return RELATIONS["体用同"];
  if (overcomes[b] === u) return RELATIONS["体克用"];
  if (overcomes[u] === b) return RELATIONS["用克体"];
  if (generates[b] === u) return RELATIONS["体生用"];
  return RELATIONS["用生体"];
}

function buildResult(upper: number, lower: number, sum: number, source: string): MeihuaResult {
  const movingLine = sum % 6 === 0 ? 6 : sum % 6;
  const bodyTrigram = movingLine <= 3 ? lower : upper;
  const useTrigram = movingLine <= 3 ? upper : lower;
  return {
    upper,
    lower,
    upperName: TRIGRAMS[upper].name + TRIGRAMS[upper].symbol,
    lowerName: TRIGRAMS[lower].name + TRIGRAMS[lower].symbol,
    movingLine,
    hexagram: hexagramName(upper, lower),
    bodyTrigram,
    useTrigram,
    bodyUseRelation: relationBetween(bodyTrigram, useTrigram),
    source,
    disclaimer: "梅花易数结果仅供文化娱乐与自省参考，不构成任何决策建议。"
  };
}

/** 时间起卦（需先由历法层提供农历分量） */
export function shijianQigua(input: MeihuaTimeInput): MeihuaResult {
  const base = input.yearZhiIndex + input.lunarMonth + input.lunarDay;
  const upper = ((base - 1) % 8) + 1;
  const lower = ((base + input.hourIndex - 1) % 8) + 1;
  const total = base + input.hourIndex;
  return buildResult(upper, lower, total, "时间起卦");
}

/** 数字起卦：两数分作上下卦，两数之和加时辰（此处不含时辰，用两数和取动爻） */
export function shuziQigua(input: MeihuaNumbersInput): MeihuaResult {
  const n1 = Math.abs(Math.floor(input.num1));
  const n2 = Math.abs(Math.floor(input.num2));
  if (!n1 || !n2) throw new Error("起卦数字须为正整数");
  const upper = ((n1 - 1) % 8) + 1;
  const lower = ((n2 - 1) % 8) + 1;
  return buildResult(upper, lower, n1 + n2, `数字起卦（${n1}/${n2}）`);
}
