/**
 * 数据目录解析（M8）
 *
 * 两类目录：
 *   - 内置：`resources/{rules,knowledge,templates,data}`，随安装包发布，只读；
 *   - 用户：`<userData>/data/{rules,knowledge,templates,data}`，由更新模块写入，可回滚。
 *
 * 解析顺序恒为 **用户目录优先**：用户目录里存在同名文件就盖过内置文件。
 * 这样「一次更新」就能覆盖规则库 / 知识库 / 模板 / 城市数据，且卸载重装不会丢。
 */
import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "../db/database";

export type ResourceKind = "rules" | "knowledge" | "templates" | "data";

export const RESOURCE_KINDS: ResourceKind[] = ["rules", "knowledge", "templates", "data"];

/** 内置资源根目录（开发态 dist-electron/services → 项目根 resources） */
export function builtinRoot(): string {
  return path.resolve(__dirname, "../../resources");
}

/**
 * 用户资源根目录；纯 Node 下 electron.app 不可用时返回 ""。
 *
 * 注意：`getDataDir()` 本身已经是 `<userData>/data`，这里**不要再拼 "data"**，
 * 否则会变成 `<userData>/data/data`（踩过）。于是用户资源路径为：
 *   <userData>/data/rules      ← 用户规则覆盖与更新落地的规则库
 *   <userData>/data/knowledge
 *   <userData>/data/templates
 *   <userData>/data/data       ← 城市数据等杂项
 *   <userData>/data/manifest.json
 *   <userData>/data/.backup/
 */
export function userRoot(): string {
  try {
    return getDataDir();
  } catch {
    return "";
  }
}

export function builtinDir(kind: ResourceKind): string {
  return path.join(builtinRoot(), kind);
}

export function userDir(kind: ResourceKind): string {
  const root = userRoot();
  return root ? path.join(root, kind) : "";
}

/** 用户目录优先，其次内置目录；都找不到返回 null */
export function resolveResource(kind: ResourceKind, file: string): string | null {
  const u = userDir(kind);
  if (u) {
    const p = path.join(u, file);
    if (fs.existsSync(p)) return p;
  }
  const b = path.join(builtinDir(kind), file);
  if (fs.existsSync(b)) return b;
  return null;
}

/**
 * 列出某类资源下的文件：内置与用户目录合并，用户同名覆盖。
 * 返回文件名（不含目录）。
 */
export function listResourceFiles(kind: ResourceKind, ext = ".json"): string[] {
  const set = new Set<string>();
  for (const dir of [builtinDir(kind), userDir(kind)]) {
    if (!dir || !fs.existsSync(dir)) continue;
    try {
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith(ext)) set.add(f);
      }
    } catch {
      /* 目录不可读时跳过 */
    }
  }
  return [...set].sort();
}

/** 计算文件的 sha256，返回 `sha256:<hex>`；文件不存在返回 null */
export function fileHash(file: string): string | null {
  try {
    return hashBuffer(fs.readFileSync(file));
  } catch {
    return null;
  }
}

/** 计算字节的 sha256 —— manifest 一律按**原始字节**校验，避免行尾/BOM 带来的假不一致 */
export function hashBuffer(buf: Buffer): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require("node:crypto") as typeof import("node:crypto");
  return "sha256:" + crypto.createHash("sha256").update(buf).digest("hex");
}

/** 计算字符串的 sha256（按 UTF-8 字节） */
export function textHash(text: string): string {
  return hashBuffer(Buffer.from(text, "utf-8"));
}
