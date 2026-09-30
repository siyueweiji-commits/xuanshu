/**
 * 卦象基础模块（M6）——梅花易数与六爻共用的底座
 *
 * 内容：
 *   1. 八卦：先天数、五行、三爻阴阳
 *   2. 六十四卦：卦名表、爻位 ↔ 卦互转
 *   3. 卦变：变卦（动爻翻）、互卦、错卦、综卦
 *   4. 五行生克关系
 *   5. 京房八宫卦序、世应位置
 *   6. 纳甲（天干 + 地支）、六亲、六神
 *
 * 约定：
 *   - 八卦用「先天数」标识：乾1 兑2 离3 震4 巽5 坎6 艮7 坤8
 *   - 爻数组统一为 **初爻在前**：`[初, 二, 三, 四, 五, 上]`，1 = 阳，0 = 阴
 *   - 爻位序号用 1..6（1 = 初爻），与用户看到的「第 N 爻」一致
 */

/* ------------------------------------------------------------------ */
/*  1. 八卦                                                             */
/* ------------------------------------------------------------------ */

export const XIANTIAN_NUM = {
  乾: 1,
  兑: 2,
  离: 3,
  震: 4,
  巽: 5,
  坎: 6,
  艮: 7,
  坤: 8
} as const;

export interface TrigramInfo {
  num: number;
  name: string;
  symbol: string;
  wuxing: string;
  /** 三爻阴阳，初爻在前 */
  lines: [number, number, number];
  /** 自然象 */
  nature: string;
}

export const TRIGRAMS: Record<number, TrigramInfo> = {
  1: { num: 1, name: "乾", symbol: "☰", wuxing: "金", lines: [1, 1, 1], nature: "天" },
  2: { num: 2, name: "兑", symbol: "☱", wuxing: "金", lines: [1, 1, 0], nature: "泽" },
  3: { num: 3, name: "离", symbol: "☲", wuxing: "火", lines: [1, 0, 1], nature: "火" },
  4: { num: 4, name: "震", symbol: "☳", wuxing: "木", lines: [1, 0, 0], nature: "雷" },
  5: { num: 5, name: "巽", symbol: "☴", wuxing: "木", lines: [0, 1, 1], nature: "风" },
  6: { num: 6, name: "坎", symbol: "☵", wuxing: "水", lines: [0, 1, 0], nature: "水" },
  7: { num: 7, name: "艮", symbol: "☶", wuxing: "土", lines: [0, 0, 1], nature: "山" },
  8: { num: 8, name: "坤", symbol: "☷", wuxing: "土", lines: [0, 0, 0], nature: "地" }
};

export function trigram(num: number): TrigramInfo {
  return TRIGRAMS[num] ?? TRIGRAMS[1];
}

/* ------------------------------------------------------------------ */
/*  2. 六十四卦                                                         */
/* ------------------------------------------------------------------ */

/** GUA_NAMES[上卦先天数][下卦先天数] = 卦名 */
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

/** 三爻位掩码 → 先天数（bit0=初爻） */
const BITS_TO_NUMBER: Record<number, number> = {
  7: 1, 3: 2, 5: 3, 1: 4, 6: 5, 2: 6, 4: 7, 0: 8
};

function trigramOf(bits: number[]): number {
  const mask = (bits[0] ? 1 : 0) | (bits[1] ? 2 : 0) | (bits[2] ? 4 : 0);
  return BITS_TO_NUMBER[mask] ?? 8;
}

/** 六爻 → { 上卦, 下卦 }（爻数组初爻在前） */
export function linesToUpperLower(lines: number[]): { upper: number; lower: number } {
  if (!Array.isArray(lines) || lines.length !== 6) {
    throw new Error(`爻数组长度须为 6，收到 ${Array.isArray(lines) ? lines.length : typeof lines}`);
  }
  const norm = lines.map((v) => (v ? 1 : 0));
  return { lower: trigramOf(norm.slice(0, 3)), upper: trigramOf(norm.slice(3, 6)) };
}

export function hexagramName(upper: number, lower: number): string {
  return GUA_NAMES[upper]?.[lower] ?? "未知卦";
}

/** 上卦 / 下卦先天数 → 六爻数组（初爻在前） */
export function upperLowerToLines(upper: number, lower: number): number[] {
  return [...trigram(lower).lines, ...trigram(upper).lines];
}

export interface HexagramView {
  /** 上卦先天数 */
  upper: number;
  /** 下卦先天数 */
  lower: number;
  upperName: string;
  upperSymbol: string;
  lowerName: string;
  lowerSymbol: string;
  name: string;
  lines: number[];
}

/** 由六爻数组构造完整卦象视图 */
export function hexagramOfLines(lines: number[]): HexagramView {
  const { upper, lower } = linesToUpperLower(lines);
  const u = trigram(upper);
  const l = trigram(lower);
  return {
    upper,
    lower,
    upperName: u.name,
    upperSymbol: u.symbol,
    lowerName: l.name,
    lowerSymbol: l.symbol,
    name: hexagramName(upper, lower),
    lines: lines.map((v) => (v ? 1 : 0))
  };
}

export function hexagramOfTrigrams(upper: number, lower: number): HexagramView {
  return hexagramOfLines(upperLowerToLines(upper, lower));
}

/** 全部 64 卦（按上卦、下卦遍历），供校验与知识库使用 */
export function allHexagramNames(): string[] {
  const out: string[] = [];
  for (let u = 1; u <= 8; u += 1) {
    for (let l = 1; l <= 8; l += 1) out.push(GUA_NAMES[u][l]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  3. 卦变                                                             */
/* ------------------------------------------------------------------ */

/** 变卦：动爻阴阳互换；moving 为 1..6 的爻位列表 */
export function changedLines(lines: number[], moving: number[]): number[] {
  const set = new Set(moving);
  return lines.map((v, i) => (set.has(i + 1) ? 1 - (v ? 1 : 0) : v ? 1 : 0));
}

/**
 * 互卦：取 2-3-4 爻为下卦、3-4-5 爻为上卦。
 * 乾坤二卦的互卦仍是本卦。
 */
export function mutualLines(lines: number[]): number[] {
  const l = lines.map((v) => (v ? 1 : 0));
  return [l[1], l[2], l[3], l[2], l[3], l[4]];
}

/** 错卦（旁通）：六爻全变 */
export function oppositeLines(lines: number[]): number[] {
  return lines.map((v) => 1 - (v ? 1 : 0));
}

/** 综卦（反卦）：六爻上下颠倒 */
export function reversedLines(lines: number[]): number[] {
  return [...lines].map((v) => (v ? 1 : 0)).reverse();
}

/* ------------------------------------------------------------------ */
/*  4. 五行生克                                                         */
/* ------------------------------------------------------------------ */

export const WUXING_GENERATES: Record<string, string> = {
  木: "火",
  火: "土",
  土: "金",
  金: "水",
  水: "木"
};

export const WUXING_OVERCOMES: Record<string, string> = {
  木: "土",
  土: "水",
  水: "火",
  火: "金",
  金: "木"
};

export type RelationKind = "比和" | "体克用" | "用克体" | "体生用" | "用生体";

/** 以「体」为主体判断与「用」的关系 */
export function relation(bodyWuxing: string, useWuxing: string): RelationKind {
  if (bodyWuxing === useWuxing) return "比和";
  if (WUXING_OVERCOMES[bodyWuxing] === useWuxing) return "体克用";
  if (WUXING_OVERCOMES[useWuxing] === bodyWuxing) return "用克体";
  if (WUXING_GENERATES[bodyWuxing] === useWuxing) return "体生用";
  return "用生体";
}

export interface RelationInfo {
  kind: RelationKind;
  bodyWuxing: string;
  useWuxing: string;
  /** 吉凶倾向：吉 / 平 / 凶 */
  fortune: "吉" | "平" | "凶";
  text: string;
}

const RELATION_TEXT: Record<RelationKind, { fortune: "吉" | "平" | "凶"; text: string }> = {
  比和: { fortune: "吉", text: "体用比和，同气相求，诸事顺遂，可平稳推进。" },
  用生体: { fortune: "吉", text: "用生体，外来助力与进益，得人相扶，宜顺势而为。" },
  体克用: { fortune: "平", text: "体克用，事可成但需费心力，主动把握方能拿下。" },
  体生用: { fortune: "平", text: "体生用，有耗泄之象，付出多而回报缓，量力守成。" },
  用克体: { fortune: "凶", text: "用克体，事多阻逆，宜守不宜进，防损耗与外力相逼。" }
};

export function relationInfo(bodyWuxing: string, useWuxing: string): RelationInfo {
  const kind = relation(bodyWuxing, useWuxing);
  const meta = RELATION_TEXT[kind];
  return { kind, bodyWuxing, useWuxing, fortune: meta.fortune, text: meta.text };
}

/* ------------------------------------------------------------------ */
/*  5. 京房八宫卦序 + 世应                                              */
/* ------------------------------------------------------------------ */

/**
 * 八宫卦序：每宫 8 卦，顺序为
 *   本宫（八纯）→ 一世 → 二世 → 三世 → 四世 → 五世 → 游魂 → 归魂
 */
export const PALACE_HEXAGRAMS: Array<{ palace: string; wuxing: string; hexagrams: string[] }> = [
  {
    palace: "乾",
    wuxing: "金",
    hexagrams: ["乾为天", "天风姤", "天山遁", "天地否", "风地观", "山地剥", "火地晋", "火天大有"]
  },
  {
    palace: "坎",
    wuxing: "水",
    hexagrams: ["坎为水", "水泽节", "水雷屯", "水火既济", "泽火革", "雷火丰", "地火明夷", "地水师"]
  },
  {
    palace: "艮",
    wuxing: "土",
    hexagrams: ["艮为山", "山火贲", "山天大畜", "山泽损", "火泽睽", "天泽履", "风泽中孚", "风山渐"]
  },
  {
    palace: "震",
    wuxing: "木",
    hexagrams: ["震为雷", "雷地豫", "雷水解", "雷风恒", "地风升", "水风井", "泽风大过", "泽雷随"]
  },
  {
    palace: "巽",
    wuxing: "木",
    hexagrams: ["巽为风", "风天小畜", "风火家人", "风雷益", "天雷无妄", "火雷噬嗑", "山雷颐", "山风蛊"]
  },
  {
    palace: "离",
    wuxing: "火",
    hexagrams: ["离为火", "火山旅", "火风鼎", "火水未济", "山水蒙", "风水涣", "天水讼", "天火同人"]
  },
  {
    palace: "坤",
    wuxing: "土",
    hexagrams: ["坤为地", "地雷复", "地泽临", "地天泰", "雷天大壮", "泽天夬", "水天需", "水地比"]
  },
  {
    palace: "兑",
    wuxing: "金",
    hexagrams: ["兑为泽", "泽水困", "泽地萃", "泽山咸", "水山蹇", "地山谦", "雷山小过", "雷泽归妹"]
  }
];

/** 卦宫内位置 → 世爻所在爻位（1..6） */
const SHI_BY_SLOT = [6, 1, 2, 3, 4, 5, 4, 3];
/** 卦宫内位置 → 名称 */
const SLOT_NAMES = ["本宫", "一世", "二世", "三世", "四世", "五世", "游魂", "归魂"];

export interface HexagramMeta {
  /** 所属宫 */
  palace: string;
  /** 宫五行 */
  palaceWuxing: string;
  /** 卦宫内的位次名称（本宫 / 一世 … 归魂） */
  slotName: string;
  /** 世爻爻位 1..6 */
  shi: number;
  /** 应爻爻位 1..6 */
  ying: number;
}

const META_INDEX = new Map<string, HexagramMeta>();
for (const g of PALACE_HEXAGRAMS) {
  g.hexagrams.forEach((name, i) => {
    const shi = SHI_BY_SLOT[i];
    META_INDEX.set(name, {
      palace: g.palace,
      palaceWuxing: g.wuxing,
      slotName: SLOT_NAMES[i],
      shi,
      ying: shi > 3 ? shi - 3 : shi + 3
    });
  });
}

/** 查卦的宫位 / 世应信息；未收录时返回兜底（世 6 应 3） */
export function hexagramMeta(name: string): HexagramMeta {
  return (
    META_INDEX.get(name) ?? {
      palace: "乾",
      palaceWuxing: "金",
      slotName: "本宫",
      shi: 6,
      ying: 3
    }
  );
}

/* ------------------------------------------------------------------ */
/*  6. 纳甲 / 六亲 / 六神                                               */
/* ------------------------------------------------------------------ */

export const ZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;
export type Zhi = (typeof ZHI)[number];

export const ZHI_WUXING: Record<string, string> = {
  子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火",
  午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水"
};

export const GAN_WUXING: Record<string, string> = {
  甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土",
  己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水"
};

/**
 * 纳甲表：每个八卦的 [内卦三爻, 外卦三爻] 对应的天干与地支。
 * 地支按初→二→三（内）/ 四→五→上（外）排列。
 */
const NAJIA: Record<number, { gan: [string, string]; zhi: [string, string, string, string, string, string] }> = {
  1: { gan: ["甲", "壬"], zhi: ["子", "寅", "辰", "午", "申", "戌"] }, // 乾
  2: { gan: ["丁", "丁"], zhi: ["巳", "卯", "丑", "亥", "酉", "未"] }, // 兑
  3: { gan: ["己", "己"], zhi: ["卯", "丑", "亥", "酉", "未", "巳"] }, // 离
  4: { gan: ["庚", "庚"], zhi: ["子", "寅", "辰", "午", "申", "戌"] }, // 震
  5: { gan: ["辛", "辛"], zhi: ["丑", "亥", "酉", "未", "巳", "卯"] }, // 巽
  6: { gan: ["戊", "戊"], zhi: ["寅", "辰", "午", "申", "戌", "子"] }, // 坎
  7: { gan: ["丙", "丙"], zhi: ["辰", "午", "申", "戌", "子", "寅"] }, // 艮
  8: { gan: ["乙", "癸"], zhi: ["未", "巳", "卯", "丑", "亥", "酉"] }  // 坤
};

export interface NaJiaEntry {
  /** 爻位 1..6 */
  position: number;
  gan: string;
  zhi: string;
  /** 干 + 支 */
  ganzhi: string;
  wuxing: string;
}

/**
 * 装卦纳甲：给出六爻（初在前）的上下卦，返回每爻的天干地支。
 * 内卦（初二三）用内卦纳甲，外卦（四五六）用外卦纳甲。
 */
export function najia(lines: number[]): NaJiaEntry[] {
  const { upper, lower } = linesToUpperLower(lines);
  const inner = NAJIA[lower];
  const outer = NAJIA[upper];
  return Array.from({ length: 6 }, (_, i) => {
    const isInner = i < 3;
    const gan = isInner ? inner.gan[0] : outer.gan[1];
    const zhi = isInner ? inner.zhi[i] : outer.zhi[i];
    return {
      position: i + 1,
      gan,
      zhi,
      ganzhi: gan + zhi,
      wuxing: ZHI_WUXING[zhi]
    };
  });
}

export type LiuQin = "父母" | "兄弟" | "子孙" | "妻财" | "官鬼";

/** 以宫五行为「我」，地支五行相对「我」定六亲 */
export function liuQin(palaceWuxing: string, zhiWuxing: string): LiuQin {
  if (zhiWuxing === palaceWuxing) return "兄弟";
  if (WUXING_GENERATES[zhiWuxing] === palaceWuxing) return "父母";
  if (WUXING_GENERATES[palaceWuxing] === zhiWuxing) return "子孙";
  if (WUXING_OVERCOMES[zhiWuxing] === palaceWuxing) return "官鬼";
  return "妻财";
}

export const LIUSHEN = ["青龙", "朱雀", "勾陈", "腾蛇", "白虎", "玄武"] as const;
export type LiuShen = (typeof LIUSHEN)[number];

/** 日干 → 初爻所起六神（其余五神依次顺排） */
export function liuShenOf(dayGan: string): LiuShen[] {
  const start: Record<string, number> = {
    甲: 0, 乙: 0, // 青龙
    丙: 1, 丁: 1, // 朱雀
    戊: 2, // 勾陈
    己: 3, // 腾蛇
    庚: 4, 辛: 4, // 白虎
    壬: 5, 癸: 5 // 玄武
  };
  const s = start[dayGan] ?? 0;
  return Array.from({ length: 6 }, (_, i) => LIUSHEN[(s + i) % 6]);
}

/* ------------------------------------------------------------------ */
/*  7. 爻位 / 爻性辅助                                                  */
/* ------------------------------------------------------------------ */

/** 爻位名称（1..6） */
export const YAO_NAMES = ["初", "二", "三", "四", "五", "上"];

/** 爻位 + 阴阳 → 传统称谓，如「初九」「六三」 */
export function yaoTitle(position: number, yang: boolean): string {
  const name = YAO_NAMES[position - 1] ?? String(position);
  const yinYang = yang ? "九" : "六";
  if (position === 1) return `初${yinYang}`;
  if (position === 6) return `上${yinYang}`;
  return `${yinYang}${name}`;
}

/** 卦的阴阳属性（乾/震/坎/艮 为阳卦，坤/巽/离/兑 为阴卦） */
export function trigramYinYang(num: number): "阳" | "阴" {
  return [1, 4, 6, 7].includes(num) ? "阳" : "阴";
}

/** 六爻数组 → 爻线绘制用描述（自下而上，1 = 阳实线） */
export function lineAscii(lines: number[]): string[] {
  return lines.map((v) => (v ? "━━━━━━━" : "━━━ ━━━"));
}
