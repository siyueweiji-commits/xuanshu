/** v1 初始表结构（对应 PRD 第 7 节数据模型） */
export const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  birth_time TEXT NOT NULL,
  birth_location TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS charts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('ziwei', 'bazi')),
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS daily_fortunes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  chart_json TEXT NOT NULL,
  advice_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS divinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('meihua', 'liuyao')),
  question TEXT,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS feedbacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  event_type TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS update_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,
  status TEXT NOT NULL,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_charts_profile ON charts(profile_id);
CREATE INDEX IF NOT EXISTS idx_daily_fortunes_profile_date ON daily_fortunes(profile_id, date);
CREATE INDEX IF NOT EXISTS idx_divinations_profile ON divinations(profile_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_profile_date ON feedbacks(profile_id, date);
`;
