/**
 * 报告落库与导出（M5）
 *
 * report.ts 保持纯函数（只做计算与渲染），本模块负责：
 *   - reports 表读写（保存 / 列表 / 详情 / 删除）
 *   - 导出 .md 到「文档/XuanShu」目录
 *   - 流日运势（daily_fortunes）的按日覆盖写入
 */
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { getDb } from "../db/database";
import { reportSnapshot, ReportResult } from "./report";

export interface ReportRow {
  id: number;
  profile_id: number | null;
  scope: "daily" | "range";
  template_id: string;
  title: string;
  date_from: string;
  date_to: string;
  created_at: string;
}

export interface ReportListItem extends ReportRow {
  /** 从 data_json 里抽出的轻量摘要 */
  summary: Record<string, unknown>;
}

export interface ReportDetail extends ReportRow {
  content_md: string;
  data: Record<string, unknown>;
}

function summaryOf(dataJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(dataJson) as Record<string, unknown>;
    return (parsed.summary as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

/** 保存一份报告，返回新 id */
export function saveReport(result: ReportResult): number {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO reports
         (profile_id, scope, template_id, title, date_from, date_to, content_md, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      result.profileId ?? null,
      result.scope,
      result.templateId,
      result.title,
      result.dateFrom,
      result.dateTo,
      result.contentMd,
      JSON.stringify(reportSnapshot(result))
    );
  return Number(info.lastInsertRowid);
}

/** 报告列表（不含正文，按创建时间倒序） */
export function listReports(profileId?: number | null, limit = 50): ReportListItem[] {
  const db = getDb();
  const cap = Math.min(200, Math.max(1, Math.floor(limit) || 50));
  const rows =
    typeof profileId === "number" && Number.isFinite(profileId)
      ? (db
          .prepare(
            `SELECT id, profile_id, scope, template_id, title, date_from, date_to, created_at, data_json
               FROM reports WHERE profile_id = ? ORDER BY id DESC LIMIT ?`
          )
          .all(profileId, cap) as Array<ReportRow & { data_json: string }>)
      : (db
          .prepare(
            `SELECT id, profile_id, scope, template_id, title, date_from, date_to, created_at, data_json
               FROM reports ORDER BY id DESC LIMIT ?`
          )
          .all(cap) as Array<ReportRow & { data_json: string }>);

  return rows.map(({ data_json, ...rest }) => ({ ...rest, summary: summaryOf(data_json) }));
}

/** 报告详情（含正文与快照） */
export function getReport(id: number): ReportDetail | null {
  const row = getDb()
    .prepare(
      `SELECT id, profile_id, scope, template_id, title, date_from, date_to, created_at, content_md, data_json
         FROM reports WHERE id = ?`
    )
    .get(id) as (ReportRow & { content_md: string; data_json: string }) | undefined;
  if (!row) return null;
  const { data_json, ...rest } = row;
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(data_json) as Record<string, unknown>;
  } catch {
    data = {};
  }
  return { ...rest, data };
}

/** 删除一份报告；返回是否真的删掉了 */
export function deleteReport(id: number): boolean {
  const info = getDb().prepare("DELETE FROM reports WHERE id = ?").run(id);
  return info.changes > 0;
}

/** 清空某个档案（或全部）的报告；返回删除条数 */
export function clearReports(profileId?: number | null): number {
  const db = getDb();
  const info =
    typeof profileId === "number" && Number.isFinite(profileId)
      ? db.prepare("DELETE FROM reports WHERE profile_id = ?").run(profileId)
      : db.prepare("DELETE FROM reports").run();
  return info.changes;
}

/** 导出 Markdown 到「文档/XuanShu」目录 */
export function exportReportFile(
  contentMd: string,
  title: string
): { saved: boolean; path: string; dir: string } {
  const text = typeof contentMd === "string" ? contentMd.trim() : "";
  if (!text) throw new Error("导出内容为空");

  const safeTitle = (title || "xuanshu-report").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60);
  const dir = path.join(app.getPath("documents"), "XuanShu");
  fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const file = path.join(dir, `${safeTitle}-${stamp}.md`);
  fs.writeFileSync(file, text.endsWith("\n") ? text : `${text}\n`, "utf-8");

  return { saved: true, path: file, dir };
}

/** 流日运势落库：同一档案同一天覆盖写入 */
export function saveDailyFortune(
  profileId: number,
  date: string,
  chartJson: unknown,
  adviceJson: unknown
): number {
  const db = getDb();
  db.prepare("DELETE FROM daily_fortunes WHERE profile_id = ? AND date = ?").run(profileId, date);
  const info = db
    .prepare(
      "INSERT INTO daily_fortunes (profile_id, date, chart_json, advice_json) VALUES (?, ?, ?, ?)"
    )
    .run(profileId, date, JSON.stringify(chartJson ?? null), JSON.stringify(adviceJson ?? null));
  return Number(info.lastInsertRowid);
}

/** 读取某档案某天的流日运势快照 */
export function getDailyFortune(
  profileId: number,
  date: string
): { id: number; date: string; chart: unknown; advice: unknown; created_at: string } | null {
  const row = getDb()
    .prepare(
      `SELECT id, date, chart_json, advice_json, created_at
         FROM daily_fortunes WHERE profile_id = ? AND date = ? ORDER BY id DESC LIMIT 1`
    )
    .get(profileId, date) as
    | { id: number; date: string; chart_json: string; advice_json: string; created_at: string }
    | undefined;
  if (!row) return null;
  const parse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  return {
    id: row.id,
    date: row.date,
    chart: parse(row.chart_json),
    advice: parse(row.advice_json),
    created_at: row.created_at
  };
}
