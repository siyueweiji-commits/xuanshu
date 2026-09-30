/**
 * 流日运势（M4）
 *
 * 组成：
 *   1. 黄历（services/huangli）—— 冲煞、建除十二神、二十八宿、天神、吉神凶煞、
 *      宜忌、方位、彭祖百忌、六曜、逐时辰吉凶
 *   2. 八字（services/bazi，需生辰）—— 日主五行、季节、身强弱、喜用神
 *   3. 紫微流日（services/ziwei，需生辰）—— 流日命宫落宫、流日四化落宫
 *
 * 输出统一为「注意事项」条目，按 事业 / 财运 / 人际 / 健康 / 出行 五类分组，
 * 总条数控制在 3～10 条（每组保底 1 条，再按权重补足）。
 */
import { Solar } from "lunar-typescript";
import { getHuangli, HuangliView } from "./huangli";
import { calcBazi } from "./bazi";
import { calcZiweiDaily, ziweiDailyFacts, ZiweiDailyResult } from "./ziwei";
import { listRules, matchRules, DISCLAIMER, Rule } from "./rules";

export const ADVICE_GROUPS = ["事业", "财运", "人际", "健康", "出行"] as const;
export type AdviceGroup = (typeof ADVICE_GROUPS)[number];

export type AdviceLevel = "info" | "caution" | "warning";

export interface AdviceItem {
  id: string;
  text: string;
  group: AdviceGroup;
  level: AdviceLevel;
  weight: number;
  system: "huangli" | "bazi" | "ziwei" | "rule";
  source: string;
}

export interface DailyBirthInput {
  gender: string;
  year: number;
  month: number;
  day: number;
  /** 时辰索引 0..12 */
  timeIndex: number;
  hour: number;
  minute: number;
  calendar?: "solar" | "lunar";
}

export interface DailyRequest {
  year: number;
  month: number;
  day: number;
  birth?: DailyBirthInput;
}

export interface BaziFactsView {
  dayMaster: string;
  dayMasterWuXing: string;
  season: string;
  level: string;
  favorable: string[];
  unfavorable: string[];
  missing: string[];
  summary: string;
}

export interface DailyResult {
  date: string;
  huangli: HuangliView;
  bazi: BaziFactsView | null;
  ziwei: ZiweiDailyResult | null;
  /** 本人信息（有生辰时） */
  personal: { shengXiao: string; clashToday: boolean } | null;
  advice: AdviceItem[];
  groups: Record<AdviceGroup, AdviceItem[]>;
  facts: Record<string, unknown>;
  disclaimer: string;
}

/* ------------------------------------------------------------------ */
/*  黄历 → 注意事项                                                     */
/* ------------------------------------------------------------------ */

const ZHI_XING_ADVICE: Record<
  string,
  { text: string; group: AdviceGroup; level: AdviceLevel; weight: number }
> = {
  建: { text: "建日主生发，气氛向上，宜向上争取、结交新友；但别把事情做绝。", group: "事业", level: "info", weight: 0.3 },
  除: { text: "除日主除旧，宜清理、了断与断舍离，把积压的旧事收个尾。", group: "健康", level: "info", weight: 0.3 },
  满: { text: "满日主丰盈，宜走动往来、聚会请客，气氛热闹处容易成事。", group: "人际", level: "info", weight: 0.3 },
  平: { text: "平日主平常，宜按部就班、修整守成，忌临场冒进。", group: "事业", level: "info", weight: 0.28 },
  定: { text: "定日主安定，宜把已定之事落细落实，忌反复摇摆。", group: "人际", level: "info", weight: 0.3 },
  执: { text: "执日主固守，宜坚持既定方向、守住既有成果，忌中途另起炉灶。", group: "事业", level: "info", weight: 0.3 },
  破: { text: "破日主破败，诸事不宜大动，宜以拆解、止损、治病为主。", group: "健康", level: "caution", weight: 0.55 },
  危: { text: "危日主险，宜谨慎缓行；涉水登高与冒险作业务必加倍小心。", group: "出行", level: "caution", weight: 0.5 },
  成: { text: "成日主成就，诸事容易收口，是推进要事、结项收尾的好日子。", group: "事业", level: "info", weight: 0.45 },
  收: { text: "收日主收敛，宜收纳进账、盘点结账，把摊子往回收一收。", group: "财运", level: "info", weight: 0.42 },
  开: { text: "开日主开通顺遂，宜主动沟通、推进新事，办事容易打通关隘。", group: "财运", level: "info", weight: 0.48 },
  闭: { text: "闭日主闭藏，宜静养休整、闭门梳理，忌大张旗鼓地启动新事。", group: "健康", level: "caution", weight: 0.45 }
};

const LIU_YAO_ADVICE: Record<
  string,
  { text: string; group: AdviceGroup; level: AdviceLevel; weight: number }
> = {
  大安: { text: "六曜为「大安」，万事顺遂，可放心推进既定计划。", group: "事业", level: "info", weight: 0.4 },
  先胜: { text: "六曜为「先胜」，上午行事为吉，宜抢先布局、尽早出手。", group: "事业", level: "info", weight: 0.32 },
  友引: { text: "六曜为「友引」，吉凶相伴，宜结伴同行、互相照应。", group: "人际", level: "info", weight: 0.3 },
  先负: { text: "六曜为「先负」，上午宜静、午后转吉，重要交涉可排在下午。", group: "事业", level: "info", weight: 0.32 },
  佛灭: { text: "六曜为「佛灭」，万事宜谨慎，不宜办喜庆与做重大决定。", group: "事业", level: "caution", weight: 0.46 },
  赤口: { text: "六曜为「赤口」，易生口舌是非，沟通宜缓、少与人争。", group: "人际", level: "caution", weight: 0.44 }
};

/** 化忌落宫的针对性提示 */
const JI_HINT: Record<string, { group: AdviceGroup; text: string; level: AdviceLevel }> = {
  命宫: { group: "健康", text: "自身状态易起伏，重要安排宜留缓冲、别硬撑", level: "caution" },
  兄弟: { group: "人际", text: "同侪与手足间易生比较，宜少议论、多做事", level: "caution" },
  夫妻: { group: "人际", text: "亲密关系需多沟通少计较，避免翻旧账", level: "caution" },
  子女: { group: "人际", text: "与晚辈或下属往来宜多耐心，少用命令口吻", level: "caution" },
  财帛: { group: "财运", text: "财务宜守不宜攻，避免大额支出与冲动消费", level: "caution" },
  疾厄: { group: "健康", text: "留意肠胃与咽喉不适，饮食清淡、少熬夜", level: "caution" },
  迁移: { group: "出行", text: "出行多留意路况与时间余量，长途驾驶宜换人", level: "warning" },
  仆役: { group: "人际", text: "合作与朋友往来宜留分寸，别轻易担保", level: "caution" },
  交友: { group: "人际", text: "合作与朋友往来宜留分寸，别轻易担保", level: "caution" },
  官禄: { group: "事业", text: "工作推进易遇反复，宜多核对细节、少做口头承诺", level: "caution" },
  田宅: { group: "财运", text: "家宅与固定资产事宜宜缓办，文书细节多核一遍", level: "caution" },
  福德: { group: "健康", text: "心神易浮躁，宜静养、少熬夜、少刷手机", level: "caution" },
  父母: { group: "人际", text: "与长辈、上级沟通宜谦和，避免正面顶撞", level: "caution" }
};

/** 化禄 / 化权 / 化科 的正向提示（按分类给语） */
const POSITIVE_TEXT: Record<AdviceGroup, Record<"禄" | "权" | "科", string>> = {
  事业: {
    禄: "事业面有助力、贵人多，宜主动推进并及时汇报",
    权: "主导权增强，宜果断执行、把责任扛起来",
    科: "宜以方案、文书与专业形象取胜"
  },
  财运: {
    禄: "财路较顺，可把握进账、收款与谈价的时机",
    权: "理财上宜主动做决定，但别过度加杠杆",
    科: "财务上宜把账算细、把过程留痕"
  },
  人际: {
    禄: "人缘和缓，适合走动拜访、化解旧隙",
    权: "往来中易占主导，宜给人留足台阶",
    科: "宜以礼数与专业赢得认可"
  },
  健康: {
    禄: "身心舒展，宜适度运动与规律作息调养",
    权: "精力较足，但别透支，运动量循序加",
    科: "宜按计划体检、按时作息"
  },
  出行: {
    禄: "出行顺遂，适合洽谈、拜访与短途往返",
    权: "行程掌控感强，宜把路线与时间先定死",
    科: "出行前把证件与行程资料备齐"
  }
};

/** 宫名补「宫」后缀（「命宫」已带则不加） */
function palaceLabel(name: string): string {
  return name.endsWith("宫") ? name : `${name}宫`;
}

function groupOfPalace(palace: string): AdviceGroup {
  return JI_HINT[palace]?.group ?? "事业";
}

function huangliAdvice(h: HuangliView, personal: DailyResult["personal"]): AdviceItem[] {
  const items: AdviceItem[] = [];
  const push = (
    id: string,
    text: string,
    group: AdviceGroup,
    level: AdviceLevel,
    weight: number,
    source: string
  ) => {
    items.push({ id, text, group, level, weight, system: "huangli", source });
  };

  // 冲煞（有生辰且相冲时加重）
  if (personal?.clashToday) {
    push(
      "hl_clash_self",
      `今日日支${h.chong.zhi}与您生肖（${personal.shengXiao}）相冲${h.chong.sha ? `，煞${h.chong.sha}方` : ""}；宜静守少远行，重要决定建议延后一日。`,
      "出行",
      "warning",
      0.9,
      "黄历·冲煞"
    );
  } else {
    push(
      "hl_clash",
      `今日冲${h.chong.shengXiao}（${h.chong.desc}）煞${h.chong.sha}；属${h.chong.shengXiao}者宜静守少动，重要事宜避开${h.chong.sha}方。`,
      "出行",
      "info",
      0.4,
      "黄历·冲煞"
    );
  }

  // 建除十二神
  const zx = ZHI_XING_ADVICE[h.zhiXing];
  if (zx) {
    push(
      "hl_zhixing",
      `今日为「${h.zhiXing}」日。${zx.text}`,
      zx.group,
      zx.level,
      zx.weight,
      "黄历·建除十二神"
    );
  }

  // 二十八宿
  if (h.xiu.name) {
    const good = h.xiu.luck === "吉";
    push(
      "hl_xiu",
      `今日值二十八宿之「${h.xiu.name}」宿（${h.xiu.luck}），${good ? "宜安排要事、与人商谈，事多顺遂。" : "宜守不宜进，重要决定可稍缓。"}`,
      "事业",
      good ? "info" : "caution",
      good ? 0.36 : 0.4,
      "黄历·二十八宿"
    );
  }

  // 天神（黄道 / 黑道）
  if (h.tianShen.name) {
    const huang = h.tianShen.type === "黄道";
    push(
      "hl_tianshen",
      `今日${h.tianShen.name}值日（${h.tianShen.type}${h.tianShen.luck}），${huang ? "宜推进正事、签订商议。" : "凡事宜留三分余地，避免仓促签字。"}`,
      "事业",
      huang ? "info" : "caution",
      huang ? 0.36 : 0.42,
      "黄历·天神"
    );
  }

  // 六曜
  const ly = LIU_YAO_ADVICE[h.liuYao];
  if (ly) push("hl_liuyao", ly.text, ly.group, ly.level, ly.weight, "黄历·六曜");

  // 吉神
  if (h.jiShen.length) {
    push(
      "hl_jishen",
      `今日吉神「${h.jiShen.slice(0, 4).join("、")}」在位，遇事多与长辈、同事商量，易得助力。`,
      "人际",
      "info",
      0.3,
      "黄历·吉神"
    );
  }

  // 凶煞
  if (h.xiongSha.length) {
    push(
      "hl_xiongsha",
      `今日凶煞「${h.xiongSha.slice(0, 4).join("、")}」，宜留意细节与口角，遇事勿逞强。`,
      "健康",
      "caution",
      0.32,
      "黄历·凶煞"
    );
  }

  // 宜 / 忌
  if (h.yi.length) {
    push("hl_yi", `今日宜：${h.yi.slice(0, 6).join("、")}。`, "事业", "info", 0.34, "黄历·宜");
  }
  if (h.ji.length) {
    push("hl_ji", `今日忌：${h.ji.slice(0, 6).join("、")}。`, "事业", "caution", 0.36, "黄历·忌");
  }

  // 方位
  if (h.positions.cai) {
    push(
      "hl_cai_pos",
      `财神在${h.positions.cai}方（${h.positions.caiDesc}），谈合作、收款时可面向此方。`,
      "财运",
      "info",
      0.3,
      "黄历·财神方位"
    );
  }
  if (h.positions.xi) {
    push(
      "hl_xi_pos",
      `喜神在${h.positions.xi}方（${h.positions.xiDesc}），会友、见客户可优先选此方位。`,
      "人际",
      "info",
      0.28,
      "黄历·喜神方位"
    );
  }

  // 吉时
  if (h.auspiciousHours.length) {
    const few = h.auspiciousHours.length <= 2;
    push(
      "hl_hours",
      `今日吉时为${h.auspiciousHours.join("、")}（共 ${h.auspiciousHours.length} 个），${few ? "吉时偏少，重要事宜宜提前安排、留好退路。" : "重要会面与出行可安排在这些时段。"}`,
      "出行",
      "info",
      0.34,
      "黄历·吉时"
    );
  }

  // 彭祖百忌
  if (h.pengZu.gan || h.pengZu.zhi) {
    push(
      "hl_pengzu",
      `彭祖百忌：${[h.pengZu.gan, h.pengZu.zhi].filter(Boolean).join("；")}。`,
      "健康",
      "info",
      0.26,
      "黄历·彭祖百忌"
    );
  }

  // 节气当日
  if (h.jieQi.today) {
    push(
      "hl_jieqi",
      `今日交「${h.jieQi.today}」，气候转换明显，注意增减衣物与作息调整。`,
      "健康",
      "info",
      0.4,
      "黄历·节气"
    );
  }

  return items;
}

/* ------------------------------------------------------------------ */
/*  八字 / 紫微 → 注意事项                                              */
/* ------------------------------------------------------------------ */

function baziAdvice(bf: BaziFactsView): AdviceItem[] {
  const weak = bf.level === "偏弱" || bf.level === "从弱";
  const strong = bf.level === "偏强" || bf.level === "从强";
  const text = weak
    ? `日主${bf.dayMasterWuXing}（${bf.dayMaster}）${bf.level}，喜用五行为${bf.favorable.join("、")}；重要事项宜先求支援、借力而行，忌独力硬扛。`
    : strong
      ? `日主${bf.dayMasterWuXing}（${bf.dayMaster}）${bf.level}，喜用五行为${bf.favorable.join("、")}；宜多做输出与协作，少与人争强好胜。`
      : `日主${bf.dayMasterWuXing}（${bf.dayMaster}）${bf.level}，喜用五行为${bf.favorable.join("、")}；五行较为均衡，按既定节奏推进即可。`;

  const items: AdviceItem[] = [
    { id: "bz_tiaohou", text, group: "事业", level: "info", weight: 0.42, system: "bazi", source: "八字·日主旺衰" }
  ];

  if (bf.missing.length) {
    items.push({
      id: "bz_missing",
      text: `命局缺${bf.missing.join("、")}，可在环境、颜色与作息上适度补足，助长整体流通。`,
      group: "健康",
      level: "info",
      weight: 0.3,
      system: "bazi",
      source: "八字·五行配平"
    });
  }
  if (bf.unfavorable.length) {
    items.push({
      id: "bz_avoid",
      text: `忌神为${bf.unfavorable.join("、")}，相关行业与方位的高风险决策宜多留一分谨慎。`,
      group: "财运",
      level: "info",
      weight: 0.28,
      system: "bazi",
      source: "八字·喜忌"
    });
  }
  return items;
}

function ziweiAdvice(zw: ZiweiDailyResult): AdviceItem[] {
  const items: AdviceItem[] = [];
  const { lu, quan, ke, ji } = zw.mutagenStars;

  // 化忌：按落宫给具体提示
  if (ji && zw.mutagenPalaces.ji.length) {
    for (const p of zw.mutagenPalaces.ji) {
      const hit = JI_HINT[p] ?? { group: "事业" as AdviceGroup, text: "宜多留意细节与沟通", level: "caution" as AdviceLevel };
      items.push({
        id: `zw_忌_${p}`,
        text: `流日${ji}化忌落在流日${palaceLabel(p)}，${hit.text}。`,
        group: hit.group,
        level: hit.level,
        weight: 0.58,
        system: "ziwei",
        source: "紫微·流日化忌"
      });
    }
  }

  // 化禄 / 化权 / 化科：按分类给正向提示
  const positive: Array<{ kind: "禄" | "权" | "科"; star: string; palaces: string[]; weight: number }> = [
    { kind: "禄", star: lu, palaces: zw.mutagenPalaces.lu, weight: 0.44 },
    { kind: "权", star: quan, palaces: zw.mutagenPalaces.quan, weight: 0.4 },
    { kind: "科", star: ke, palaces: zw.mutagenPalaces.ke, weight: 0.36 }
  ];
  for (const { kind, star, palaces, weight } of positive) {
    if (!star || !palaces.length) continue;
    for (const p of palaces) {
      const group = groupOfPalace(p);
      items.push({
        id: `zw_${kind}_${p}`,
        text: `流日${star}化${kind}入流日${palaceLabel(p)}，${POSITIVE_TEXT[group][kind]}。`,
        group,
        level: "info",
        weight,
        system: "ziwei",
        source: `紫微·流日化${kind}`
      });
    }
  }

  if (zw.soulStars.length) {
    const landed = zw.daily.landedPalace;
    const group = landed ? groupOfPalace(landed) : "事业";
    items.push({
      id: "zw_soul",
      text: `流日命宫落本命${palaceLabel(landed)}，主星${zw.soulStars.join("、")}，今日重心偏向${group}面。`,
      group,
      level: "info",
      weight: 0.3,
      system: "ziwei",
      source: "紫微·流日命宫"
    });
  }

  return items;
}

/* ------------------------------------------------------------------ */
/*  规则库命中                                                          */
/* ------------------------------------------------------------------ */

const TAG_GROUP: Record<string, AdviceGroup> = {
  事业: "事业", 工作: "事业", 官禄: "事业", 职场: "事业", 五行: "事业",
  财运: "财运", 理财: "财运", 金钱: "财运",
  人际: "人际", 感情: "人际", 贵人: "人际", 沟通: "人际",
  健康: "健康", 身体: "健康", 情绪: "健康", 作息: "健康",
  出行: "出行", 安全: "出行", 交通: "出行", 冲煞: "出行"
};

/** 规则库 system → 中文名（用于兜底来源标签） */
const SYSTEM_CN: Record<string, string> = {
  huangli: "黄历",
  bazi: "八字",
  ziwei: "紫微",
  meihua: "梅花",
  liuyao: "六爻"
};

function ruleAdvice(rules: Rule[]): AdviceItem[] {
  return rules.map((r) => {
    const group =
      (r.tags ?? []).map((t) => TAG_GROUP[t]).find((g): g is AdviceGroup => Boolean(g)) ?? "事业";
    return {
      id: `rule_${r.id}`,
      text: r.advice,
      group,
      level: (r.level === "warning" || r.level === "caution" || r.level === "info"
        ? r.level
        : "info") as AdviceLevel,
      weight: r.weight ?? 0.3,
      system: "rule" as const,
      source: `规则·${r.label ?? SYSTEM_CN[r.system] ?? r.system}`
    };
  });
}

/* ------------------------------------------------------------------ */
/*  选取：每组保底 1 条，总条数 3～10                                     */
/* ------------------------------------------------------------------ */

/**
 * 选取最终注意事项。
 * 第一轮每类保底 1 条（保证五行五类齐全）；第二轮只在权重不低于 `floor` 的
 * 候选中补足，避免为了凑数把最弱的边角条目也塞进来。总数 3～10 条。
 */
function selectAdvice(cands: AdviceItem[], max = 10, floor = 0.3): AdviceItem[] {
  const seen = new Set<string>();
  const uniq: AdviceItem[] = [];
  for (const c of cands) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    uniq.push(c);
  }

  const byGroup = new Map<AdviceGroup, AdviceItem[]>();
  for (const g of ADVICE_GROUPS) byGroup.set(g, []);
  for (const c of uniq) byGroup.get(c.group)?.push(c);
  for (const list of byGroup.values()) list.sort((a, b) => b.weight - a.weight);

  const picked: AdviceItem[] = [];
  const taken = new Set<string>();
  const take = (c?: AdviceItem) => {
    if (!c || taken.has(c.id)) return;
    taken.add(c.id);
    picked.push(c);
  };

  // 第一轮：每类保底 1 条
  for (const g of ADVICE_GROUPS) take(byGroup.get(g)?.[0]);

  // 第二轮：按权重补足
  const rest = uniq.filter((c) => !taken.has(c.id)).sort((a, b) => b.weight - a.weight);
  for (const c of rest) {
    if (picked.length >= max) break;
    if (c.weight < floor) continue;
    take(c);
  }

  return picked.sort((a, b) => b.weight - a.weight);
}

/* ------------------------------------------------------------------ */
/*  主入口                                                              */
/* ------------------------------------------------------------------ */

export function calcDaily(req: DailyRequest): DailyResult {
  const huangli = getHuangli({ year: req.year, month: req.month, day: req.day });

  const cands: AdviceItem[] = [];
  const facts: Record<string, unknown> = {
    公历: huangli.date,
    农历: huangli.lunarDate,
    日柱: huangli.dayInGanZhi,
    日支: huangli.dayInGanZhi.slice(1),
    日冲生肖: huangli.chong.shengXiao,
    煞方: huangli.chong.sha,
    宜: huangli.yi,
    忌: huangli.ji,
    建除十二神: huangli.zhiXing,
    二十八宿: huangli.xiu.name,
    宿吉凶: huangli.xiu.luck,
    天神: huangli.tianShen.name,
    天神类型: huangli.tianShen.type,
    天神吉凶: huangli.tianShen.luck,
    六曜: huangli.liuYao,
    吉神: huangli.jiShen,
    凶煞: huangli.xiongSha,
    季节: huangli.season,
    节气: huangli.jieQi.today ?? "",
    吉时数: huangli.auspiciousHours.length
  };

  /* ---- 八字 ---- */
  let baziView: BaziFactsView | null = null;
  let personal: DailyResult["personal"] = null;

  const birth = req.birth;
  if (birth) {
    try {
      const bz = calcBazi({
        gender: birth.gender,
        year: birth.year,
        month: birth.month,
        day: birth.day,
        hour: birth.hour,
        minute: birth.minute
      });
      baziView = {
        dayMaster: bz.dayMaster,
        dayMasterWuXing: bz.dayMasterWuXing,
        season: huangli.season,
        level: bz.wuXing.level,
        favorable: bz.wuXing.favorable,
        unfavorable: bz.wuXing.unfavorable,
        missing: bz.wuXing.missing,
        summary: bz.wuXing.summary
      };
      Object.assign(facts, {
        日主: bz.dayMaster,
        日主五行: bz.dayMasterWuXing,
        身强弱: bz.wuXing.level,
        喜用神: bz.wuXing.favorable,
        忌神: bz.wuXing.unfavorable,
        缺五行: bz.wuXing.missing
      });
      cands.push(...baziAdvice(baziView));
    } catch {
      baziView = null;
    }

    // 生肖（以立春为界）
    let shengXiao = "";
    try {
      shengXiao = Solar.fromYmdHms(birth.year, birth.month, birth.day, 12, 0, 0)
        .getLunar()
        .getYearShengXiaoExact();
    } catch {
      shengXiao = "";
    }
    const clashToday = Boolean(shengXiao) && shengXiao === huangli.chong.shengXiao;
    personal = { shengXiao, clashToday };
    facts.本人生肖 = shengXiao;
    facts.本人冲煞 = clashToday;
  }

  /* ---- 紫微流日 ---- */
  let ziweiView: ZiweiDailyResult | null = null;
  if (birth) {
    try {
      ziweiView = calcZiweiDaily({
        gender: birth.gender,
        year: birth.year,
        month: birth.month,
        day: birth.day,
        timeIndex: birth.timeIndex,
        calendar: birth.calendar ?? "solar",
        targetYear: req.year,
        targetMonth: req.month,
        targetDay: req.day,
        targetTimeIndex: birth.timeIndex
      });
      Object.assign(facts, ziweiDailyFacts(ziweiView));
      cands.push(...ziweiAdvice(ziweiView));
    } catch {
      ziweiView = null;
    }
  }

  /* ---- 规则库 ---- */
  const matched = matchRules(listRules(), facts);
  cands.push(...ruleAdvice(matched));

  /* ---- 黄历基础层（保证条数与类别覆盖） ---- */
  cands.push(...huangliAdvice(huangli, personal));

  /* ---- 汇总 ---- */
  const advice = selectAdvice(cands, 10);
  const groups = ADVICE_GROUPS.reduce(
    (acc, g) => {
      acc[g] = advice.filter((a) => a.group === g);
      return acc;
    },
    {} as Record<AdviceGroup, AdviceItem[]>
  );

  return {
    date: huangli.date,
    huangli,
    bazi: baziView,
    ziwei: ziweiView,
    personal,
    advice,
    groups,
    facts,
    disclaimer: DISCLAIMER
  };
}
