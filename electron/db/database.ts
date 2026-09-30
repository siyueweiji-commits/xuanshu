import Database from "better-sqlite3";
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_V1 } from "./migrations/001_init";
import { SCHEMA_V2 } from "./migrations/002_reports";

let db: Database.Database | null = null;

export function getDataDir(): string {
  const dir = path.join(app.getPath("userData"), "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDbPath(): string {
  return path.join(getDataDir(), "xuanshu.db");
}

export function initDatabase(): Database.Database {
  if (db) return db;
  db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function getDb(): Database.Database {
  return db ?? initDatabase();
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}

/** 基于 user_version 的轻量迁移：按序执行，失败即中止并抛错 */
function migrate(database: Database.Database): void {
  const MIGRATIONS: Array<{ version: number; sql: string }> = [
    { version: 1, sql: SCHEMA_V1 },
    { version: 2, sql: SCHEMA_V2 }
  ];
  const current = (database.pragma("user_version", { simple: true }) as number) ?? 0;

  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    const run = database.transaction(() => {
      database.exec(m.sql);
      database.pragma(`user_version = ${m.version}`);
    });
    try {
      run();
    } catch (err) {
      const msg = `Migration v${m.version} failed: ${String(err)}`;
      throw new Error(msg);
    }
  }
}
