/**
 * 知识库加载（resources/knowledge/*.json）
 *
 * 只读、可缓存；找不到文件时返回空结构，不抛错——知识库属于「锦上添花」，
 * 缺了不应该让报告生成失败。
 */
import fs from "node:fs";
import path from "node:path";
import { builtinDir, resolveResource } from "./dataPaths";

export interface StarInfo {
  name: string;
  wuxing: string;
  keywords: string[];
  brief: string;
}

export function builtinKnowledgeDir(): string {
  return builtinDir("knowledge");
}

/** 读取知识库文件：用户目录优先（更新落地），其次内置 */
function readKnowledgeFile(file: string): string | null {
  const p = resolveResource("knowledge", file);
  if (!p) return null;
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return null;
  }
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
    const raw = readKnowledgeFile("stars.json");
    const parsed = raw ? (JSON.parse(raw) as StarFile) : null;
    for (const s of parsed?.stars ?? []) {
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
  guaCache = null;
}

/* ------------------------------------------------------------------ */
/*  六十四卦释义（M6）                                                  */
/* ------------------------------------------------------------------ */

export interface GuaInfo {
  name: string;
  /** 上卦 */
  upper: string;
  /** 下卦 */
  lower: string;
  /** 义理简释 */
  brief: string;
  keywords: string[];
}

interface GuaFile {
  version?: string;
  hexagrams?: GuaInfo[];
}

let guaCache: Map<string, GuaInfo> | null = null;

function loadGua(): Map<string, GuaInfo> {
  if (guaCache) return guaCache;
  const map = new Map<string, GuaInfo>();
  try {
    const raw = readKnowledgeFile("gua.json");
    const parsed = raw ? (JSON.parse(raw) as GuaFile) : null;
    for (const g of parsed?.hexagrams ?? []) {
      if (g && typeof g.name === "string") map.set(g.name, g);
    }
  } catch {
    /* 知识库缺失时静默降级 */
  }
  guaCache = map;
  return map;
}

/** 按卦名取释义（取不到返回 null） */
export function guaBrief(name: string): GuaInfo | null {
  return loadGua().get(name) ?? null;
}

/** 批量取卦释义，跳过未知卦名 */
export function guaBriefs(names: string[]): GuaInfo[] {
  return names.map((n) => guaBrief(n)).filter((g): g is GuaInfo => g !== null);
}

/** 知识库条目总数（供校验与设置页展示） */
export function knowledgeStats(): { stars: number; hexagrams: number } {
  return { stars: loadStars().size, hexagrams: loadGua().size };
}
