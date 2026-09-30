/**
 * v2：报告表（M5）
 *
 * 与 `daily_fortunes` 的分工：
 *   - `daily_fortunes`：每日流日快照缓存（profile_id + date 唯一语义），供「今天看过什么」回溯
 *   - `reports`：用户主动生成并保存的报告（单日或区间），含渲染后的 Markdown 全文
 */
export const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('daily', 'range')),
  template_id TEXT NOT NULL,
  title TEXT NOT NULL,
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  content_md TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_reports_profile_created ON reports(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_dates ON reports(date_from, date_to);
`;
