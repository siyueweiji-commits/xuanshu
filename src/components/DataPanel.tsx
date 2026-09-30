import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";

interface DataStats {
  appName: string;
  appVersion: string;
  dataDir: string;
  tables: Array<{ name: string; rows: number }>;
  settingsCount: number;
  totalRows: number;
}

interface ExportResult {
  path: string;
  rows: number;
  settings: number;
}

interface ImportResult {
  mode: "replace" | "merge";
  tables: Array<{ name: string; inserted: number; skipped: number }>;
  settingsApplied: number;
  totalInserted: number;
  skippedSettings: string[];
}

interface ClearResult {
  removed: Record<string, number>;
  total: number;
  keptSettings: boolean;
}

const TABLE_LABELS: Record<string, string> = {
  profiles: "档案",
  charts: "命盘",
  daily_fortunes: "流日快照",
  divinations: "卦例",
  feedbacks: "反馈",
  reports: "报告"
};

/**
 * 数据管理（M10）：全量导出 / 导入 / 清除。
 * 清除与「替换式导入」都会覆盖既有数据，因此做二次确认。
 */
export default function DataPanel() {
  const [stats, setStats] = useState<DataStats | null>(null);
  const [importText, setImportText] = useState("");
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [exportPath, setExportPath] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load(): Promise<void> {
    try {
      setStats(await ipc<DataStats>("app:data-stats"));
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function doExport(): Promise<void> {
    setError("");
    setNotice("");
    try {
      const r = await ipc<ExportResult>("app:export-data");
      setExportPath(r.path);
      setNotice(`已导出 ${r.rows} 条数据、${r.settings} 项设置到「文档/XuanShu」`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function doImport(): Promise<void> {
    setError("");
    setNotice("");
    if (!importText.trim()) {
      setError("请先粘贴备份 JSON");
      return;
    }
    try {
      const r = await ipc<ImportResult>("app:import-data", { json: importText, mode });
      setNotice(
        `导入完成（${r.mode === "replace" ? "替换" : "合并"}）：写入 ${r.totalInserted} 条，应用 ${r.settingsApplied} 项设置` +
          (r.skippedSettings.length ? `；跳过设置 ${r.skippedSettings.join("、")}` : "")
      );
      setImportText("");
      setConfirmImport(false);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function doClear(): Promise<void> {
    setError("");
    setNotice("");
    try {
      const r = await ipc<ClearResult>("app:clear-data", { keepSettings: true });
      setNotice(`已清除 ${r.total} 条数据（设置项已保留）`);
      setConfirmClear(false);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  const totalRows = stats?.totalRows ?? 0;

  return (
    <section className="card card-p" id="data-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="title">数据管理</h2>
          <p className="mt-1 sub">
            所有数据仅存本机。导出为单个 JSON 备份文件；导入与清除会改动本地数据，请谨慎操作。
          </p>
        </div>
        {stats && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="chip chip-neutral num">{totalRows} 条记录</span>
            <span className="chip chip-neutral num">{stats.settingsCount} 项设置</span>
          </div>
        )}
      </div>

      {error && <div className="notice notice-danger mt-4">{error}</div>}
      {notice && <div className="notice notice-info mt-4 break-all">{notice}</div>}

      {/* 数据概览 */}
      {stats && (
        <dl className="mt-4 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <div className="kv">
            <dt className="kv-k">数据目录</dt>
            <dd className="kv-v num break-all" title={stats.dataDir}>
              {stats.dataDir}
            </dd>
          </div>
          {stats.tables.map((t) => (
            <div className="kv" key={t.name}>
              <dt className="kv-k">{TABLE_LABELS[t.name] ?? t.name}</dt>
              <dd className="kv-v num">{t.rows}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* 导出 */}
      <div className="mt-5 border-t border-hair pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="title-sm">备份与恢复</h3>
          <button className="btn btn-sm btn-secondary" onClick={() => void doExport()}>
            导出备份
          </button>
          {exportPath && <span className="num text-micro text-ink-4 break-all">已写入 {exportPath}</span>}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">粘贴备份 JSON 以导入</label>
            <textarea
              className="input h-28 resize-y py-2 font-mono text-[11px] leading-relaxed"
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                setConfirmImport(false);
              }}
              placeholder='{ "format": "xuanshu-backup", "formatVersion": 1, ... }'
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <label className="label">导入方式</label>
              <div className="seg">
                {(["replace", "merge"] as const).map((m) => (
                  <button
                    key={m}
                    className={`seg-item ${mode === m ? "seg-item-active" : ""}`}
                    onClick={() => {
                      setMode(m);
                      setConfirmImport(false);
                    }}
                  >
                    {m === "replace" ? "替换（清空后导入）" : "合并（按 id 覆盖）"}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
              替换模式会先清空全部数据再导入，通常用于完整恢复；合并模式仅覆盖相同 id 的记录。
            </p>
            {!confirmImport ? (
              <button
                className="btn btn-sm btn-primary mt-3"
                onClick={() => (mode === "replace" ? setConfirmImport(true) : void doImport())}
              >
                导入
              </button>
            ) : (
              <div className="mt-3">
                <div className="notice notice-warn">确认执行「替换式导入」？现有数据将被清空后写入备份内容。</div>
                <div className="mt-2 flex gap-2">
                  <button className="btn btn-sm btn-danger" onClick={() => void doImport()}>
                    确认导入
                  </button>
                  <button className="btn btn-sm btn-quiet" onClick={() => setConfirmImport(false)}>
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 清除 */}
      <div className="mt-5 border-t border-hair pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="title-sm">清除全部数据</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
              删除档案、命盘、报告、卦例与反馈记录，保留设置项。此操作不可撤销。
            </p>
          </div>
          {!confirmClear ? (
            <button className="btn btn-sm btn-danger" disabled={totalRows === 0} onClick={() => setConfirmClear(true)}>
              清除全部数据
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-mark-danger">
                确认删除全部 {totalRows} 条记录？
              </span>
              <button className="btn btn-sm btn-danger" onClick={() => void doClear()}>
                确认清除
              </button>
              <button className="btn btn-sm btn-quiet" onClick={() => setConfirmClear(false)}>
                取消
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
