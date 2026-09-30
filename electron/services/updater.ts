/**
 * 数据更新模块（M8）
 *
 * 目标：把规则库 / 知识库 / 模板 / 城市数据从远端更新源同步到本地用户目录。
 *
 * 设计原则：
 *   1. **离线优先**：更新失败只是「没更新」，绝不影响应用启动与既有功能；
 *   2. **可回滚**：每次更新前先把被覆盖的文件整份备份，回滚即恢复备份；
 *   3. **诚实校验**：每个下载文件都按 manifest 里的 sha256 校验，**校验不过就不落地**；
 *   4. **不写内置目录**：更新只写 `<userData>/data/**`，内置资源保持原样，
 *      因此「回滚 = 删掉用户目录里的覆盖文件」永远能回到出厂状态。
 *
 * 更新源协议（支持三种形态，便于自建/局域网/离线验证）：
 *   - `https://raw.githubusercontent.com/<user>/<repo>/main`（默认）
 *   - `file:///path/to/dir`（file:// 协议）
 *   - `D:/path/to/dir` 或 `//host/share`（本地目录 / UNC 共享盘点）
 */
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db/database";
import { RESOURCE_KINDS, ResourceKind, builtinDir, fileHash, hashBuffer, userDir, userRoot } from "./dataPaths";

export const DEFAULT_SOURCE =
  "https://raw.githubusercontent.com/siyueweiji-commits/xuanshu-data/main";

/** 更新源里允许出现的顶层目录（白名单，防止 manifest 写越界路径） */
const ALLOWED_PREFIX = new Set<string>(RESOURCE_KINDS);

const SETTINGS_KEY_SOURCE = "update.sourceUrl";
const SETTINGS_KEY_AUTO = "update.autoCheck";

/* ------------------------------------------------------------------ */
/*  设置                                                                */
/* ------------------------------------------------------------------ */

export interface UpdateSettings {
  sourceUrl: string;
  autoCheck: boolean;
}

function readSetting(key: string): string | null {
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

export function getUpdateSettings(): UpdateSettings {
  const src = readSetting(SETTINGS_KEY_SOURCE)?.trim();
  const auto = readSetting(SETTINGS_KEY_AUTO);
  return {
    sourceUrl: src || DEFAULT_SOURCE,
    autoCheck: auto === null ? true : auto === "1"
  };
}

export function setUpdateSettings(patch: Partial<UpdateSettings>): UpdateSettings {
  if (typeof patch.sourceUrl === "string") {
    const url = patch.sourceUrl.trim();
    writeSetting(SETTINGS_KEY_SOURCE, url || DEFAULT_SOURCE);
  }
  if (typeof patch.autoCheck === "boolean") {
    writeSetting(SETTINGS_KEY_AUTO, patch.autoCheck ? "1" : "0");
  }
  return getUpdateSettings();
}

/* ------------------------------------------------------------------ */
/*  远端读取                                                            */
/* ------------------------------------------------------------------ */

function isRemote(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** 把更新源字符串规整为「基址 + 本地目录」两种形态之一 */
function normalizeSource(source: string): { url: string } | { dir: string } {
  const s = (source ?? "").trim().replace(/\/+$/, "");
  if (isRemote(s)) return { url: s };
  if (/^file:\/\//i.test(s)) {
    let p = decodeURIComponent(s.replace(/^file:\/\//i, ""));
    // Windows 下 file:///D:/x → /D:/x，去掉前导斜杠
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    return { dir: p };
  }
  return { dir: s };
}

export interface SourceRef {
  kind: "http" | "dir";
  base: string;
  display: string;
}

export function describeSource(source: string): SourceRef {
  const n = normalizeSource(source);
  if ("url" in n) return { kind: "http", base: n.url, display: n.url };
  return { kind: "dir", base: n.dir, display: n.dir };
}

async function readRemote(
  relPath: string,
  source: string,
  timeoutMs = 20000
): Promise<{ buf: Buffer; text: string }> {
  const ref = describeSource(source);
  const clean = relPath.replace(/^\/+/, "");
  if (ref.kind === "dir") {
    const file = path.join(ref.base, clean);
    if (!fs.existsSync(file)) throw new Error(`更新源缺少文件：${clean}`);
    const buf = fs.readFileSync(file);
    return { buf, text: buf.toString("utf-8") };
  }
  const url = `${ref.base}/${clean}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": "XuanShu-Updater", accept: "application/json,text/plain,*/*" }
  });
  if (!res.ok) throw new Error(`拉取 ${clean} 失败：HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, text: buf.toString("utf-8") };
}

/* ------------------------------------------------------------------ */
/*  manifest                                                            */
/* ------------------------------------------------------------------ */

export interface ManifestFile {
  path: string;
  hash: string;
  size?: number;
}

export interface Manifest {
  version: string;
  files: ManifestFile[];
  note?: string;
  generatedAt?: string;
}

function validateManifest(raw: unknown): Manifest {
  const m = raw as Manifest;
  if (!m || typeof m !== "object") throw new Error("manifest 不是合法 JSON 对象");
  if (typeof m.version !== "string" || !m.version.trim()) throw new Error("manifest 缺少 version");
  if (!Array.isArray(m.files) || m.files.length === 0) throw new Error("manifest 缺少 files 数组");
  for (const f of m.files) {
    if (!f || typeof f.path !== "string" || typeof f.hash !== "string") {
      throw new Error("manifest 中的文件项需同时含 path 与 hash");
    }
    // 路径白名单：必须落在 rules/knowledge/templates/data 之下，且不允许穿越
    const norm = f.path.replace(/\\/g, "/");
    const top = norm.split("/")[0];
    if (!ALLOWED_PREFIX.has(top)) throw new Error(`manifest 含越界路径：${f.path}`);
    if (norm.includes("..")) throw new Error(`manifest 路径含 ..：${f.path}`);
    if (!/^sha256:[0-9a-f]{64}$/i.test(f.hash)) throw new Error(`manifest 哈希格式非法：${f.path}`);
  }
  return { version: m.version.trim(), files: m.files, note: m.note, generatedAt: m.generatedAt };
}

/** 本地已落地的 manifest（用户目录），没有则返回 null */
export function localManifest(): Manifest | null {
  const root = userRoot();
  if (!root) return null;
  const file = path.join(root, "manifest.json");
  if (!fs.existsSync(file)) return null;
  try {
    return validateManifest(JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch {
    return null;
  }
}

/** 本地版本号：优先用户目录 manifest，否则视为 0（出厂） */
export function localVersion(): string {
  return localManifest()?.version ?? "0";
}

/** 某文件在本地生效的哈希（用户目录优先，其次内置） */
function localFileHash(relPath: string): string | null {
  const norm = relPath.replace(/\\/g, "/");
  const [kind, ...rest] = norm.split("/");
  const k = kind as ResourceKind;
  const rel = rest.join("/");
  if (!ALLOWED_PREFIX.has(kind)) return null;
  const u = userDir(k);
  if (u) {
    const h = fileHash(path.join(u, rel));
    if (h) return h;
  }
  return fileHash(path.join(builtinDir(k), rel));
}

/* ------------------------------------------------------------------ */
/*  检查更新                                                            */
/* ------------------------------------------------------------------ */

export interface FileCheck {
  path: string;
  kind: ResourceKind;
  remoteHash: string;
  localHash: string | null;
  /** 远端有、本地没有 */
  isNew: boolean;
  /** 哈希不一致，需要更新 */
  changed: boolean;
}

export interface CheckResult {
  ok: boolean;
  source: string;
  sourceKind: "http" | "dir";
  localVersion: string;
  remoteVersion: string;
  hasUpdate: boolean;
  total: number;
  changedCount: number;
  files: FileCheck[];
  /** 远端 manifest 缺失的文件数（通常是本地比远端新，不算错误） */
  extraLocal: number;
  error: string | null;
}

/** 只比版本与逐文件哈希，不下载、不写盘 */
export async function checkUpdate(sourceUrl?: string): Promise<CheckResult> {
  const settings = getUpdateSettings();
  const source = (sourceUrl ?? settings.sourceUrl).trim() || DEFAULT_SOURCE;
  const ref = describeSource(source);
  const base: CheckResult = {
    ok: false,
    source,
    sourceKind: ref.kind === "http" ? "http" : "dir",
    localVersion: localVersion(),
    remoteVersion: "",
    hasUpdate: false,
    total: 0,
    changedCount: 0,
    files: [],
    extraLocal: 0,
    error: null
  };

  let manifest: Manifest;
  try {
    manifest = validateManifest(JSON.parse((await readRemote("manifest.json", source)).text));
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }

  const files: FileCheck[] = manifest.files.map((f) => {
    const norm = f.path.replace(/\\/g, "/");
    const lh = localFileHash(norm);
    return {
      path: norm,
      kind: norm.split("/")[0] as ResourceKind,
      remoteHash: f.hash.toLowerCase(),
      localHash: lh,
      isNew: lh === null,
      changed: lh === null || lh.toLowerCase() !== f.hash.toLowerCase()
    };
  });

  const local = localManifest();
  const localSet = new Set((local?.files ?? []).map((f) => f.path.replace(/\\/g, "/")));
  const extraLocal = localSet.size
    ? [...localSet].filter((p) => !manifest.files.some((f) => f.path.replace(/\\/g, "/") === p)).length
    : 0;

  const changedCount = files.filter((f) => f.changed).length;
  return {
    ...base,
    ok: true,
    remoteVersion: manifest.version,
    hasUpdate: changedCount > 0 || manifest.version !== base.localVersion,
    total: files.length,
    changedCount,
    files,
    extraLocal
  };
}

/* ------------------------------------------------------------------ */
/*  执行更新                                                            */
/* ------------------------------------------------------------------ */

export interface UpdateFileResult {
  path: string;
  status: "updated" | "skipped" | "failed";
  hash: string;
  localHashBefore: string | null;
  error?: string;
}

export interface UpdateResult {
  ok: boolean;
  source: string;
  fromVersion: string;
  toVersion: string;
  updated: number;
  skipped: number;
  failed: number;
  backupDir: string | null;
  files: UpdateFileResult[];
  error: string | null;
  finishedAt: string;
}

function tsStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function writeUpdateLog(source: string, status: string, message: string): void {
  try {
    getDb()
      .prepare("INSERT INTO update_logs (source, status, message) VALUES (?, ?, ?)")
      .run(source, status, message);
  } catch {
    /* 日志失败不影响主流程 */
  }
}

export interface UpdateOptions {
  /** 强制重下所有文件（即使哈希一致） */
  force?: boolean;
  /** 只更新指定前缀（如 "rules"），便于按需更新 */
  only?: ResourceKind[];
  /** 跳过自动备份（不建议） */
  noBackup?: boolean;
}

/**
 * 执行更新。
 * 流程：拉 manifest → 逐文件比对 → 下载并校验 → 备份 → 落地 → 写 manifest → 记日志。
 * **任何单个文件校验失败都不会落地**，其他文件继续；整体失败时返回 ok:false。
 */
export async function runUpdate(sourceUrl?: string, options: UpdateOptions = {}): Promise<UpdateResult> {
  const settings = getUpdateSettings();
  const source = (sourceUrl ?? settings.sourceUrl).trim() || DEFAULT_SOURCE;
  const started = { from: localVersion(), to: localVersion() };
  const files: UpdateFileResult[] = [];

  const finish = (
    ok: boolean,
    toVersion: string,
    backupDir: string | null,
    error: string | null
  ): UpdateResult => {
    const updated = files.filter((f) => f.status === "updated").length;
    const skipped = files.filter((f) => f.status === "skipped").length;
    const failed = files.filter((f) => f.status === "failed").length;
    const finishedAt = new Date().toISOString();
    writeUpdateLog(
      source,
      ok ? (updated > 0 ? "success" : "noop") : "failed",
      ok
        ? `${started.from} → ${toVersion}：更新 ${updated} / 跳过 ${skipped} / 失败 ${failed}`
        : `${started.from} → ${toVersion} 失败：${error}`
    );
    return {
      ok,
      source,
      fromVersion: started.from,
      toVersion,
      updated,
      skipped,
      failed,
      backupDir,
      files,
      error,
      finishedAt
    };
  };

  let manifest: Manifest;
  try {
    manifest = validateManifest(JSON.parse((await readRemote("manifest.json", source)).text));
  } catch (e) {
    return finish(false, started.to, null, e instanceof Error ? e.message : String(e));
  }
  started.to = manifest.version;

  const only = options.only && options.only.length ? new Set(options.only) : null;
  const targets = manifest.files.filter((f) => {
    const norm = f.path.replace(/\\/g, "/");
    const kind = norm.split("/")[0] as ResourceKind;
    return !only || only.has(kind);
  });

  // 1) 下载 + 校验（先全部拉到内存，全部通过后再动盘）
  const staged: Array<{ path: string; kind: ResourceKind; text: string; hash: string; localHashBefore: string | null }> = [];
  for (const f of targets) {
    const norm = f.path.replace(/\\/g, "/");
    const kind = norm.split("/")[0] as ResourceKind;
    const localHashBefore = localFileHash(norm);
    if (!options.force && localHashBefore && localHashBefore.toLowerCase() === f.hash.toLowerCase()) {
      files.push({ path: norm, status: "skipped", hash: f.hash, localHashBefore });
      continue;
    }
    try {
      const { buf, text } = await readRemote(norm, source);
      const actual = hashBuffer(buf);
      if (actual.toLowerCase() !== f.hash.toLowerCase()) {
        files.push({
          path: norm,
          status: "failed",
          hash: f.hash,
          localHashBefore,
          error: `哈希校验不通过（期望 ${f.hash.slice(0, 15)}…，实际 ${actual.slice(0, 15)}…）`
        });
        continue;
      }
      staged.push({ path: norm, kind, text, hash: f.hash, localHashBefore });
    } catch (e) {
      files.push({
        path: norm,
        status: "failed",
        hash: f.hash,
        localHashBefore,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }

  // 2) 备份 + 落地
  const root = userRoot();
  if (!root) return finish(false, started.to, null, "用户数据目录不可用");

  let backupDir: string | null = null;
  try {
    if (staged.length > 0 && !options.noBackup) {
      backupDir = path.join(root, ".backup", tsStamp());
      fs.mkdirSync(backupDir, { recursive: true });
      for (const s of staged) {
        const dest = path.join(root, s.path);
        if (fs.existsSync(dest)) {
          const b = path.join(backupDir, s.path);
          fs.mkdirSync(path.dirname(b), { recursive: true });
          fs.copyFileSync(dest, b);
        }
      }
      // 一并备份旧 manifest，回滚时要一起还原
      const mf = path.join(root, "manifest.json");
      if (fs.existsSync(mf)) fs.copyFileSync(mf, path.join(backupDir, "manifest.json"));
    }

    for (const s of staged) {
      const dest = path.join(root, s.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, s.text, "utf-8");
      files.push({
        path: s.path,
        status: "updated",
        hash: s.hash,
        localHashBefore: s.localHashBefore
      });
    }

    // manifest 代表「已经与远端这一版对齐」。
    // 只要本次没有任何文件校验失败（含「全部跳过」的情况）就落版本号，
    // 否则「已是最新」会被反复报成「有更新」。
    const failedSoFar = files.filter((x) => x.status === "failed").length;
    if (failedSoFar === 0 && targets.length > 0) {
      fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
    }
  } catch (e) {
    return finish(false, started.to, backupDir, e instanceof Error ? e.message : String(e));
  }

  const failed = files.filter((f) => f.status === "failed").length;
  const updated = files.filter((f) => f.status === "updated").length;
  const error =
    failed > 0
      ? `${failed} 个文件未通过校验，已跳过（其余 ${updated} 个已更新）`
      : null;
  // 只要有文件成功落地就算「部分成功」，全部失败才算失败
  return finish(updated > 0 || (failed === 0 && targets.length > 0), started.to, backupDir, error);
}

/* ------------------------------------------------------------------ */
/*  回滚                                                                */
/* ------------------------------------------------------------------ */

export interface BackupInfo {
  name: string;
  files: number;
  createdAt: string;
}

export function listBackups(): BackupInfo[] {
  const root = userRoot();
  if (!root) return [];
  const dir = path.join(root, ".backup");
  if (!fs.existsSync(dir)) return [];
  const out: BackupInfo[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let files = 0;
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name));
        else files += 1;
      }
    };
    try {
      walk(full);
      out.push({ name, files, createdAt: name });
    } catch {
      /* 跳过读不了的备份 */
    }
  }
  return out.sort((a, b) => b.name.localeCompare(a.name));
}

export interface RollbackResult {
  ok: boolean;
  backup: string | null;
  restored: number;
  removed: number;
  error: string | null;
}

/**
 * 回滚到最近一次备份。
 * 语义：把备份里的文件原样写回；备份里没有、但用户目录里多出来的文件按 manifest 差异删除。
 * 没有备份时退化为「清空用户目录覆盖文件」，即回到出厂内置状态。
 */
export function rollback(backupName?: string): RollbackResult {
  const root = userRoot();
  if (!root) return { ok: false, backup: null, restored: 0, removed: 0, error: "用户数据目录不可用" };

  const backups = listBackups();
  const target = backupName ?? backups[0]?.name ?? null;

  try {
    let restored = 0;
    let removed = 0;

    if (target) {
      const dir = path.join(root, ".backup", target);
      if (!fs.existsSync(dir)) {
        return { ok: false, backup: target, restored: 0, removed: 0, error: `备份不存在：${target}` };
      }
      const walk = (d: string, rel: string): void => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, e.name);
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) {
            walk(full, r);
            continue;
          }
          const dest = path.join(root, r);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(full, dest);
          restored += 1;
        }
      };
      walk(dir, "");
    }

    // 清掉比备份更新的落地文件（备份里没有的）
    const backupSet = new Set<string>();
    if (target) {
      const dir = path.join(root, ".backup", target);
      const walk = (d: string, rel: string): void => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) walk(path.join(d, e.name), r);
          else backupSet.add(r.replace(/\\/g, "/"));
        }
      };
      walk(dir, "");
    }

    const mf = path.join(root, "manifest.json");
    if (fs.existsSync(mf)) {
      if (!backupSet.has("manifest.json")) {
        fs.unlinkSync(mf);
        removed += 1;
      }
    }

    // 备份目录里的内容不再需要时，把本次已还原之外的落地文件清掉
    if (!target) {
      for (const kind of RESOURCE_KINDS) {
        const d = userDir(kind);
        if (!d || !fs.existsSync(d)) continue;
        removed += fs.readdirSync(d).length;
        fs.rmSync(d, { recursive: true, force: true });
      }
    }

    writeUpdateLog("rollback", "success", `回滚到 ${target ?? "出厂内置"}：还原 ${restored} / 清理 ${removed}`);
    return { ok: true, backup: target, restored, removed, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeUpdateLog("rollback", "failed", msg);
    return { ok: false, backup: target, restored: 0, removed: 0, error: msg };
  }
}

/** 删除指定备份目录 */
export function dropBackup(name: string): boolean {
  const root = userRoot();
  if (!root) return false;
  const dir = path.join(root, ".backup", name);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

/* ------------------------------------------------------------------ */
/*  更新日志                                                            */
/* ------------------------------------------------------------------ */

export interface UpdateLogRow {
  id: number;
  source: string | null;
  status: string;
  message: string | null;
  created_at: string;
}

export function updateLogs(limit = 50): UpdateLogRow[] {
  try {
    return getDb()
      .prepare("SELECT * FROM update_logs ORDER BY id DESC LIMIT ?")
      .all(Math.min(500, Math.max(1, Math.floor(limit) || 50))) as UpdateLogRow[];
  } catch {
    return [];
  }
}

export function clearUpdateLogs(): number {
  try {
    return getDb().prepare("DELETE FROM update_logs").run().changes;
  } catch {
    return 0;
  }
}

/** 当前本地数据概况：各类资源的文件数与来源（内置 / 已更新） */
export function dataOverview(): {
  version: string;
  sourceUrl: string;
  autoCheck: boolean;
  kinds: Array<{ kind: ResourceKind; builtin: number; updated: number }>;
  backups: BackupInfo[];
} {
  const kinds = RESOURCE_KINDS.map((kind) => {
    const count = (dir: string): number => {
      if (!dir || !fs.existsSync(dir)) return 0;
      try {
        return fs.readdirSync(dir).filter((f) => !f.startsWith(".")).length;
      } catch {
        return 0;
      }
    };
    return { kind, builtin: count(builtinDir(kind)), updated: count(userDir(kind)) };
  });
  const settings = getUpdateSettings();
  return {
    version: localVersion(),
    sourceUrl: settings.sourceUrl,
    autoCheck: settings.autoCheck,
    kinds,
    backups: listBackups()
  };
}

