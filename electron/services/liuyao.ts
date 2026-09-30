/**
 * 六爻（自研基础版）：三枚铜钱模拟起卦
 * 三掷定一爻：2背1字=少阳(1)、2字1背=少阴(0)、3背=老阳(1,变)、3字=老阴(0,变)
 * M6 将补充：纳甲、六亲、六神、世应、规则库解读
 */
import { hexagramName, linesToUpperLower } from "./meihua";

export interface LiuyaoRequest {
  question?: string;
}

export interface LiuyaoResult {
  question: string;
  lines: Array<{ position: number; value: number; changing: boolean; coinThrow: string[] }>;
  originalHexagram: string;
  changedHexagram: string | null;
  movingLines: number[];
  thrownAt: string;
  disclaimer: string;
}

function throwCoins(): { coins: string[]; value: number; changing: boolean } {
  const coins = Array.from({ length: 3 }, () => (Math.random() < 0.5 ? "字" : "背"));
  const backs = coins.filter((c) => c === "背").length;
  if (backs === 2) return { coins, value: 1, changing: false }; // 少阳
  if (backs === 1) return { coins, value: 0, changing: false }; // 少阴
  if (backs === 3) return { coins, value: 1, changing: true }; // 老阳
  return { coins, value: 0, changing: true }; // 老阴（3字）
}

export function qigua(req: LiuyaoRequest): LiuyaoResult {
  const lines = Array.from({ length: 6 }, (_, i) => {
    const t = throwCoins();
    return { position: i + 1, value: t.value, changing: t.changing, coinThrow: t.coins };
  });

  const original = linesToUpperLower(lines.map((l) => l.value));
  const changedLines = lines.map((l) => (l.changing ? 1 - l.value : l.value));
  const changed = linesToUpperLower(changedLines);
  const hasChange = lines.some((l) => l.changing);

  return {
    question: req.question?.trim() || "未记录问题",
    lines,
    originalHexagram: hexagramName(original.upper, original.lower),
    changedHexagram: hasChange ? hexagramName(changed.upper, changed.lower) : null,
    movingLines: lines.filter((l) => l.changing).map((l) => l.position),
    thrownAt: new Date().toISOString(),
    disclaimer: "六爻结果仅供文化娱乐与自省参考，不构成任何决策建议。"
  };
}
