/**
 * 规则引擎（基础版）
 * - 加载内置规则（resources/rules/*.json）+ 用户规则（userData/data/rules/*.json，同名覆盖）
 * - 条件为简单的 key-value 精确匹配（数组值用 includes）
 * M5 将扩展条件表达式（JSON Logic）与权重排序输出
 */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "../db/database";

export interface Rule {
  id: string;
  system: string;
  condition: Record<string, unknown>;
  advice: string;
  weight?: number;
  level?: string;
  tags?: string[];
  /** 面向用户展示的来源标签，缺省时回退到 system 的中文名 */
  label?: string;
  enabled?: boolean;
}

export const DISCLAIMER =
  "本应用为文化娱乐工具，所有输出仅供自省参考，不构成医疗、法律、投资或安全建议。";

export function builtinRulesDir(): string {
  // 开发态：dist-electron/services → 项目根 resources；打包态：asar 内相对路径一致
  return path.resolve(__dirname, "../../resources/rules");
}

export function userRulesDir(): string {
  // 渲染层/纯 Node 环境下 electron.app 不可用，此时降级为「无用户规则」，
  // 内置规则仍可正常读取（内置目录只依赖 __dirname）。
  try {
    return path.join(getDataDir(), "rules");
  } catch {
    return "";
  }
}

function readRuleFile(file: string): Rule[] {
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw) as Rule[] | { rules: Rule[] };
    const list = Array.isArray(parsed) ? parsed : parsed.rules ?? [];
    return list.filter((r) => r && typeof r.id === "string" && typeof r.advice === "string");
  } catch {
    return [];
  }
}

function listRuleFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
}

/** 内置规则 + 用户规则合并（用户规则同 id 覆盖内置） */
export function listRules(system?: string): Rule[] {
  const map = new Map<string, Rule>();
  for (const dir of [builtinRulesDir(), userRulesDir()]) {
    for (const f of listRuleFiles(dir)) {
      for (const rule of readRuleFile(path.join(dir, f))) {
        map.set(rule.id, rule);
      }
    }
  }
  const all = Array.from(map.values());
  return system ? all.filter((r) => r.system === system) : all;
}

/**
 * 单条事实命中判断，支持四种组合：
 *   - 条件为数组、事实为标量 → 任一条件值命中即可（OR）
 *   - 条件为标量、事实为数组 → 事实包含该值即可（如「宜」是列表，条件是「开市」）
 *   - 均为数组            → 有交集即可
 *   - 均为标量            → 精确相等
 */
function hit(fact: unknown, cond: unknown): boolean {
  if (Array.isArray(cond)) {
    return Array.isArray(fact)
      ? cond.some((c) => fact.includes(c))
      : cond.some((c) => hit(fact, c));
  }
  if (Array.isArray(fact)) return fact.includes(cond);
  return fact === cond;
}

/** 事实匹配：condition 的每个 key 须在 facts 中命中 */
export function matchRules(rules: Rule[], facts: Record<string, unknown>): Rule[] {
  return rules
    .filter((r) => r.enabled !== false)
    .filter((r) => Object.entries(r.condition ?? {}).every(([k, v]) => hit(facts[k], v)))
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
}

/** 保存用户自定义规则（写入用户数据目录，热生效） */
export function saveUserRule(rule: Rule): void {
  const dir = userRulesDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `user_${rule.system}.json`);
  const existing = readRuleFile(file).filter((r) => r.id !== rule.id);
  existing.push(rule);
  fs.writeFileSync(file, JSON.stringify(existing, null, 2), "utf-8");
}

export function appDataSummary(): unknown {
  return {
    appName: app.getName(),
    appVersion: app.getVersion(),
    platform: process.platform,
    userDataDir: app.getPath("userData"),
    dataDir: getDataDir()
  };
}
