/**
 * 知识库加载（resources/knowledge/*.json）
 *
 * 只读、可缓存；找不到文件时返回空结构，不抛错——知识库属于「锦上添花」，
 * 缺了不应该让报告生成失败。
 */
import fs from "node:fs";
import path from "node:path";

export interface StarInfo {
  name: string;
  wuxing: string;
  keywords: string[];
  brief: string;
}

export function builtinKnowledgeDir(): string {
  return path.resolve(__dirname, "../../resources/knowledge");
}

interface StarFile {
  version?: string;
  stars?: StarInfo[];
}

let starCache: Map<string, StarInfo> | null = null;

function loadStars(): Map<string, StarInfo> {
  if (starCache) return starCache;
  const map = new Map<string, StarInfo>();
  try {
    const file = path.join(builtinKnowledgeDir(), "stars.json");
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as StarFile;
    for (const s of parsed.stars ?? []) {
      if (s && typeof s.name === "string") map.set(s.name, s);
    }
  } catch {
    /* 知识库缺失时静默降级 */
  }
  starCache = map;
  return map;
}

/** 按主星名取释义（取不到返回 null） */
export function starBrief(name: string): StarInfo | null {
  return loadStars().get(name) ?? null;
}

/** 批量取释义，跳过未知星名 */
export function starBriefs(names: string[]): StarInfo[] {
  return names.map((n) => starBrief(n)).filter((s): s is StarInfo => s !== null);
}

/** 清空缓存（数据更新后调用） */
export function clearKnowledgeCache(): void {
  starCache = null;
}
