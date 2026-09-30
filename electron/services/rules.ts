/**
 * 规则引擎（基础版）
 * - 加载内置规则（resources/rules/*.json）+ 用户规则（userData/data/rules/*.json，同名覆盖）
 * - 条件为简单的 key-value 精确匹配（数组值用 includes）
 * M5 将扩展条件表达式（JSON Logic）与权重排序输出
 */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { builtinDir, userDir, userRoot } from "./dataPaths";

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
  return builtinDir("rules");
}

export function userRulesDir(): string {
  // 渲染层/纯 Node 环境下 electron.app 不可用，此时降级为「无用户规则」，
  // 内置规则仍可正常读取（内置目录只依赖 __dirname）。
  return userDir("rules");
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

/**
 * 用户目录下的规则文件分两类，**优先级不同**：
 *   - 更新落地的规则库（文件名与内置一致，如 `huangli.json`）：只是「内置规则的新版本」，
 *     优先级低于用户个人覆盖；
 *   - 用户个人覆盖（`user_<system>.json`，由 saveUserRule 写入）：优先级最高。
 * 这个区分很重要：否则更新一次之后，概览里每条规则都会被标成「已覆盖」。
 */
function readRuleDir(dir: string, prefixFilter: (file: string) => boolean): Rule[] {
  if (!dir) return [];
  return listRuleFiles(dir)
    .filter(prefixFilter)
    .flatMap((f) => readRuleFile(path.join(dir, f)));
}

/** 更新落地到用户目录的规则库（非 user_ 前缀） */
export function readUpdateRules(): Rule[] {
  return readRuleDir(userRulesDir(), (f) => !f.startsWith("user_"));
}

/**
 * 全量规则：内置 → 更新落地规则（覆盖内置）→ 用户个人覆盖（覆盖前两者）。
 * 三层顺序固定，不依赖 readdir 的字母序。
 */
export function listRules(system?: string): Rule[] {
  const map = new Map<string, Rule>();
  for (const rule of readRuleDir(builtinRulesDir(), () => true)) map.set(rule.id, rule);
  for (const rule of readUpdateRules()) map.set(rule.id, rule);
  for (const rule of readRuleDir(userRulesDir(), (f) => f.startsWith("user_"))) map.set(rule.id, rule);
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
  if (!dir) throw new Error("无法定位用户数据目录，规则保存失败");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `user_${rule.system}.json`);
  const existing = readRuleFile(file).filter((r) => r.id !== rule.id);
  existing.push(rule);
  fs.writeFileSync(file, JSON.stringify(existing, null, 2), "utf-8");
}

/* ------------------------------------------------------------------ */
/*  M5：规则库管理                                                      */
/* ------------------------------------------------------------------ */

export interface RuleFileView {
  file: string;
  system: string;
  version: string;
  count: number;
  builtin: boolean;
}

export interface RuleView extends Rule {
  /** 该规则的最终生效状态 */
  enabledFinal: boolean;
  /** 是否存在同名用户覆盖（用户规则恒为 true） */
  userOverride: boolean;
  /** 是否来自内置规则库 */
  builtin: boolean;
  /** 用户覆盖里是否禁用了它 */
  disabledByUser: boolean;
}

export interface RulesOverview {
  total: number;
  enabled: number;
  builtinFiles: RuleFileView[];
  userFiles: RuleFileView[];
  systems: string[];
  rules: RuleView[];
}

function readFileMeta(file: string): { system: string; version: string; count: number } {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as {
      system?: string;
      version?: string;
      rules?: Rule[];
    } | Rule[];
    if (Array.isArray(parsed)) {
      return { system: "", version: "", count: parsed.length };
    }
    return {
      system: parsed.system ?? "",
      version: parsed.version ?? "",
      count: (parsed.rules ?? []).length
    };
  } catch {
    return { system: "", version: "", count: 0 };
  }
}

function listFiles(dir: string, builtin: boolean): RuleFileView[] {
  return listRuleFiles(dir).map((f) => {
    const file = path.join(dir, f);
    const meta = readFileMeta(file);
    return {
      file: f,
      system: meta.system || f.replace(/\.json$/, "").replace(/^user_/, ""),
      version: meta.version,
      count: meta.count,
      builtin
    };
  });
}

/** 读取**用户个人覆盖**（`user_*.json`），不含更新落地的规则库 */
function readUserRules(): Rule[] {
  return readRuleDir(userRulesDir(), (f) => f.startsWith("user_"));
}

/** 规则库概览：内置（含更新落地）/ 用户覆盖文件清单 + 每条规则的最终状态 */
export function rulesOverview(): RulesOverview {
  // 「内置」= 打包内置 + 更新落地（后者覆盖前者），两者对用户是同一件事
  const builtin = new Map<string, Rule>();
  for (const f of listRuleFiles(builtinRulesDir())) {
    for (const r of readRuleFile(path.join(builtinRulesDir(), f))) builtin.set(r.id, r);
  }
  for (const r of readUpdateRules()) builtin.set(r.id, r);

  const user = new Map<string, Rule>();
  for (const r of readUserRules()) user.set(r.id, r);

  const ids = [...new Set([...builtin.keys(), ...user.keys()])];
  const rules: RuleView[] = ids.map((id) => {
    const b = builtin.get(id);
    const u = user.get(id);
    const merged = u ?? b ?? ({} as Rule);
    return {
      ...merged,
      enabledFinal: merged.enabled !== false,
      userOverride: Boolean(u),
      builtin: Boolean(b),
      disabledByUser: Boolean(b && u && u.enabled === false)
    };
  });

  const all = listRules();
  return {
    total: rules.length,
    enabled: all.length,
    builtinFiles: listFiles(builtinRulesDir(), true),
    userFiles: listFiles(userRulesDir(), false),
    systems: [...new Set(rules.map((r) => r.system))].filter(Boolean).sort(),
    rules: rules.sort((a, b) => (a.system === b.system ? a.id.localeCompare(b.id) : a.system.localeCompare(b.system)))
  };
}

/**
 * 启用 / 禁用某条规则（内置规则通过写一份用户覆盖实现，热生效）。
 * 找不到该规则时返回 false。
 */
export function setRuleEnabled(id: string, enabled: boolean): boolean {
  const all = listRules();
  const target = all.find((r) => r.id === id);
  if (!target) return false;
  saveUserRule({ ...target, enabled });
  return true;
}

/** 删除用户规则覆盖（内置规则会因此恢复原状）；返回是否真的删掉了 */
export function removeUserRule(id: string): boolean {
  const dir = userRulesDir();
  if (!dir || !fs.existsSync(dir)) return false;
  let removed = false;
  for (const f of listRuleFiles(dir)) {
    const file = path.join(dir, f);
    const list = readRuleFile(file);
    const next = list.filter((r) => r.id !== id);
    if (next.length === list.length) continue;
    removed = true;
    if (next.length === 0) fs.unlinkSync(file);
    else fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf-8");
  }
  return removed;
}

/** 新增 / 覆盖一条用户规则 */
export function createRule(rule: Rule): void {
  if (!rule || typeof rule.id !== "string" || !rule.id.trim()) {
    throw new Error("规则缺少 id");
  }
  if (typeof rule.advice !== "string" || !rule.advice.trim()) {
    throw new Error("规则缺少 advice 文案");
  }
  saveUserRule({ ...rule, system: rule.system || "custom" });
}

/** 导出规则为 JSON 文本（可按 system 过滤） */
export function exportRules(system?: string): string {
  const list = system ? listRules(system) : listRules();
  return JSON.stringify(
    {
      system: system ?? "all",
      version: new Date().toISOString().slice(0, 10).replace(/-/g, "."),
      exportedAt: new Date().toISOString(),
      count: list.length,
      rules: list.map((r) => ({ ...r, enabled: r.enabled !== false }))
    },
    null,
    2
  );
}

export interface ImportResult {
  imported: number;
  skipped: number;
  systems: string[];
}

/**
 * 导入规则 JSON 文本。
 * - `merge`：同 id 覆盖，其余保留
 * - `replace`：先清空指定 system 的用户规则再写入
 */
export function importRules(jsonText: string, mode: "merge" | "replace" = "merge"): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("导入失败：不是合法的 JSON 文本");
  }
  const raw = Array.isArray(parsed)
    ? parsed
    : ((parsed as { rules?: unknown }).rules ?? null);
  if (!Array.isArray(raw)) {
    throw new Error("导入失败：缺少 rules 数组");
  }

  const valid: Rule[] = [];
  let skipped = 0;
  for (const item of raw) {
    const r = item as Rule;
    if (!r || typeof r.id !== "string" || !r.id.trim() || typeof r.advice !== "string" || !r.advice.trim()) {
      skipped += 1;
      continue;
    }
    valid.push({
      ...r,
      system: r.system || "custom",
      condition: r.condition && typeof r.condition === "object" ? r.condition : {}
    });
  }
  if (valid.length === 0) {
    throw new Error(`导入失败：${skipped} 条规则均不合法（需要 id 与 advice）`);
  }

  const systems = [...new Set(valid.map((r) => r.system))];
  if (mode === "replace") {
    for (const sys of systems) {
      const file = path.join(userRulesDir(), `user_${sys}.json`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
  // 按 system 分组后一次性写入，避免同一文件被读改写多次
  for (const sys of systems) {
    const group = valid.filter((r) => r.system === sys);
    saveUserRulesBatch(sys, group, mode === "replace");
  }

  return { imported: valid.length, skipped, systems };
}

function saveUserRulesBatch(system: string, rules: Rule[], replace: boolean): void {
  const dir = userRulesDir();
  if (!dir) throw new Error("无法定位用户数据目录，规则导入失败");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `user_${system}.json`);
  const existing = replace ? [] : readRuleFile(file);
  const map = new Map(existing.map((r) => [r.id, r]));
  for (const r of rules) map.set(r.id, { ...r, system });
  fs.writeFileSync(file, JSON.stringify([...map.values()], null, 2), "utf-8");
}

export function appDataSummary(): unknown {
  return {
    appName: app.getName(),
    appVersion: app.getVersion(),
    platform: process.platform,
    userDataDir: app.getPath("userData"),
    dataDir: userRoot() || app.getPath("userData")
  };
}
