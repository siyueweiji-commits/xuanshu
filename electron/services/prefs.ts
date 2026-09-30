/**
 * 偏好设置（M10）
 *
 * 集中管理「记在 settings 表里」的用户偏好，渲染层通过 IPC 读写：
 *   - theme          主题：system / light / dark
 *   - useTrueSolar   起局是否默认启用真太阳时校正
 *   - defaultCity    起局默认城市（用于真太阳时经度）
 *
 * 另外提供全量数据导出 / 导入 / 清除（PRD 4.11「数据导出/导入」「数据清除」、4.12「用户可删除全部数据」）。
 */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db/database";
import { userRoot } from "./dataPaths";
import { exportDataFile } from "./reportStore";

/* ------------------------------------------------------------------ */
/*  偏好读写                                                            */
/* ------------------------------------------------------------------ */

export type ThemeMode = "system" | "light" | "dark";
export const THEMES: ThemeMode[] = ["system", "light", "dark"];

export interface Prefs {
  theme: ThemeMode;
  useTrueSolar: boolean;
  defaultCity: string;
}

const KEYS = {
  theme: "app.theme",
  useTrueSolar: "chart.useTrueSolar",
  defaultCity: "chart.defaultCity"
} as const;

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
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}

export function getPrefs(): Prefs {
  const t = readSetting(KEYS.theme);
  return {
    theme: THEMES.includes(t as ThemeMode) ? (t as ThemeMode) : "system",
    useTrueSolar: readSetting(KEYS.useTrueSolar) !== "0",
    defaultCity: readSetting(KEYS.defaultCity) ?? ""
  };
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  if (patch.theme !== undefined) {
    if (!THEMES.includes(patch.theme)) throw new Error(`未知主题：${patch.theme}`);
    writeSetting(KEYS.theme, patch.theme);
  }
  if (patch.useTrueSolar !== undefined) writeSetting(KEYS.useTrueSolar, patch.useTrueSolar ? "1" : "0");
  if (patch.defaultCity !== undefined) writeSetting(KEYS.defaultCity, patch.defaultCity.trim());
  return getPrefs();
}

/* ------------------------------------------------------------------ */
/*  数据导出 / 导入 / 清除                                              */
/* ------------------------------------------------------------------ */

/** 参与备份的用户数据表（settings 单独处理，update_logs 不备） */
const DATA_TABLES = [
  "profiles",
  "charts",
  "daily_fortunes",
  "divinations",
  "feedbacks",
  "reports"
] as const;

export interface DataStats {
  appName: string;
  appVersion: string;
  dataDir: string;
  tables: Array<{ name: string; rows: number }>;
  settingsCount: number;
  totalRows: number;
}

function countRows(table: string): number {
  const r = getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return r.n;
}

export function dataStats(): DataStats {
  const tables = DATA_TABLES.map((name) => ({ name, rows: countRows(name) }));
  const settingsCount = countRows("settings");
  return {
    appName: app.getName(),
    appVersion: app.getVersion(),
    dataDir: app.getPath("userData"),
    tables,
    settingsCount,
    totalRows: tables.reduce((n, t) => n + t.rows, 0)
  };
}

export interface ExportedData {
  format: "xuanshu-backup";
  formatVersion: 1;
  appVersion: string;
  exportedAt: string;
  tables: Record<string, unknown[]>;
  settings: Array<{ key: string; value: string }>;
}

/** 全量导出：用户数据表 + 设置项，写成一个 JSON 落到「文档/XuanShu」 */
export function exportAllData(): { path: string; rows: number; settings: number } {
  const db = getDb();
  const tables: Record<string, unknown[]> = {};
  let rows = 0;
  for (const t of DATA_TABLES) {
    const list = db.prepare(`SELECT * FROM ${t}`).all() as unknown[];
    tables[t] = list;
    rows += list.length;
  }
  const settings = db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;

  const payload: ExportedData = {
    format: "xuanshu-backup",
    formatVersion: 1,
    appVersion: app.getVersion(),
    exportedAt: new Date().toISOString(),
    tables,
    settings
  };

  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const r = exportDataFile(JSON.stringify(payload, null, 2), ".json", `玄枢备份-${stamp}`);
  return { path: r.path, rows, settings: settings.length };
}

export interface ImportOptions {
  /** replace：先清空再导入（推荐，结果可预期）；merge：同 id 覆盖、其余追加 */
  mode?: "replace" | "merge";
}

export interface ImportResult {
  mode: "replace" | "merge";
  tables: Array<{ name: string; inserted: number; skipped: number }>;
  settingsApplied: number;
  totalInserted: number;
  skippedSettings: string[];
}

function colsOf(table: string): string[] {
  return (getDb().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
}

/** 从备份 JSON 恢复。replace = 清空后整表导入；merge = 按 id 主键覆盖/追加 */
export function importAllData(json: string, opts: ImportOptions = {}): ImportResult {
  let payload: ExportedData;
  try {
    payload = JSON.parse(json) as ExportedData;
  } catch {
    throw new Error("备份文件不是合法 JSON");
  }
  if (!payload || payload.format !== "xuanshu-backup") {
    throw new Error("这不是玄枢的备份文件（缺少 format: xuanshu-backup）");
  }
  if (payload.formatVersion !== 1) {
    throw new Error(`备份格式版本不受支持：${payload.formatVersion}`);
  }
  const mode = opts.mode === "merge" ? "merge" : "replace";
  const db = getDb();
  const result: ImportResult = { mode, tables: [], settingsApplied: 0, totalInserted: 0, skippedSettings: [] };

  const run = db.transaction(() => {
    for (const table of DATA_TABLES) {
      const incoming = (payload.tables?.[table] ?? []) as Array<Record<string, unknown>>;
      const cols = colsOf(table);
      if (!cols.length) throw new Error(`表不存在：${table}`);
      const usable = cols.filter((c) => c !== "id");
      const hasId = cols.includes("id");

      if (mode === "replace") db.prepare(`DELETE FROM ${table}`).run();

      let inserted = 0;
      let skipped = 0;
      for (const row of incoming) {
        const names = usable.filter((c) => row[c] !== undefined);
        if (!names.length) {
          skipped += 1;
          continue;
        }
        const placeholders = names.map(() => "?").join(", ");
        const sql = `INSERT INTO ${table} (${names.join(", ")}) VALUES (${placeholders})`;
        db.prepare(sql).run(...names.map((n) => row[n]));
        inserted += 1;
      }
      result.tables.push({ name: table, inserted, skipped });
      result.totalInserted += inserted;
    }

    // 设置项：始终 merge（保留本地没有的），未知 key 跳过并上报
    const known = new Set(
      (db.prepare("SELECT DISTINCT key FROM settings").all() as Array<{ key: string }>).map((r) => r.key)
    );
    const settingsKey = (payload.settings ?? []).every(
      (s) => s && typeof s.key === "string" && typeof s.value === "string"
    );
    if (settingsKey) {
      for (const s of payload.settings ?? []) {
        try {
          db.prepare(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
          ).run(s.key, s.value);
          result.settingsApplied += 1;
        } catch {
          result.skippedSettings.push(s.key);
        }
      }
      void known;
    } else {
      result.skippedSettings.push("(settings 字段格式非法，已跳过)");
    }
  });

  run();
  return result;
}

export interface ClearResult {
  removed: Record<string, number>;
  total: number;
  /** 是否连同设置项一起清除 */
  keptSettings: boolean;
}

/** 清空用户数据（PRD 4.12「用户可删除全部数据」）。keepSettings 默认 true */
export function clearAllData(opts: { keepSettings?: boolean } = {}): ClearResult {
  const keepSettings = opts.keepSettings !== false;
  const db = getDb();
  const removed: Record<string, number> = {};
  let total = 0;

  const run = db.transaction(() => {
    for (const t of DATA_TABLES) {
      const info = db.prepare(`DELETE FROM ${t}`).run();
      removed[t] = info.changes;
      total += info.changes;
    }
    if (!keepSettings) {
      const info = db.prepare("DELETE FROM settings").run();
      removed["settings"] = info.changes;
      total += info.changes;
    }
  });
  run();

  return { removed, total, keptSettings: keepSettings };
}

/** 清除用户目录里的更新落地资源（回到内置版本），返回删除文件数 */
export function clearResourceOverrides(): number {
  let n = 0;
  const root = userRoot();
  if (!root) return 0;
  for (const kind of ["rules", "knowledge", "templates", "data"]) {
    const dir = path.join(root, kind);
    if (!fs.existsSync(dir)) continue;
    n += fs.readdirSync(dir).length;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const manifest = path.join(root, "manifest.json");
  if (fs.existsSync(manifest)) {
    fs.unlinkSync(manifest);
    n += 1;
  }
  return n;
}
