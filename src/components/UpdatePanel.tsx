import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";

/* ---------------- 类型 ---------------- */

interface KindStat {
  kind: string;
  builtin: number;
  updated: number;
}

interface BackupInfo {
  name: string;
  files: number;
  createdAt: string;
}

interface DataOverview {
  version: string;
  sourceUrl: string;
  autoCheck: boolean;
  kinds: KindStat[];
  backups: BackupInfo[];
}

interface FileCheck {
  path: string;
  kind: string;
  remoteHash: string;
  localHash: string | null;
  isNew: boolean;
  changed: boolean;
}

interface CheckResult {
  ok: boolean;
  source: string;
  sourceKind: "http" | "dir";
  localVersion: string;
  remoteVersion: string;
  hasUpdate: boolean;
  total: number;
  changedCount: number;
  files: FileCheck[];
  extraLocal: number;
  error: string | null;
}

interface UpdateFileResult {
  path: string;
  status: "updated" | "skipped" | "failed";
  hash: string;
  localHashBefore: string | null;
  error?: string;
}

interface UpdateResult {
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

interface UpdateLogRow {
  id: number;
  source: string | null;
  status: string;
  message: string | null;
  created_at: string;
}

const KIND_CN: Record<string, string> = {
  rules: "规则库",
  knowledge: "知识库",
  templates: "报告模板",
  data: "基础数据"
};

const STATUS_CHIP: Record<string, string> = {
  success: "chip-success",
  noop: "chip-neutral",
  failed: "chip-danger"
};

const STATUS_CN: Record<string, string> = {
  success: "成功",
  noop: "已是最新",
  failed: "失败"
};

/* ---------------- 组件 ---------------- */

export default function UpdatePanel() {
  const [ov, setOv] = useState<DataOverview | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [logs, setLogs] = useState<UpdateLogRow[]>([]);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadOverview(): Promise<void> {
    try {
      const o = await ipc<DataOverview>("update:overview");
      setOv(o);
      setSourceUrl(o.sourceUrl);
    } catch (e) {
      setError(String(e));
    }
  }

  async function loadLogs(): Promise<void> {
    try {
      setLogs(await ipc<UpdateLogRow[]>("update:logs", { limit: 20 }));
    } catch {
      setLogs([]);
    }
  }

  useEffect(() => {
    void loadOverview();
    void loadLogs();
  }, []);

  async function saveSource(url: string): Promise<void> {
    try {
      await ipc("update:set-settings", { sourceUrl: url });
      await loadOverview();
    } catch (e) {
      setError(String(e));
    }
  }

  async function toggleAuto(next: boolean): Promise<void> {
    try {
      await ipc("update:set-settings", { autoCheck: next });
      await loadOverview();
    } catch (e) {
      setError(String(e));
    }
  }

  async function doCheck(): Promise<void> {
    setBusy("check");
    setError("");
    setNotice("");
    setResult(null);
    try {
      const r = await ipc<CheckResult>("update:check", { sourceUrl });
      setCheck(r);
      if (!r.ok) setError(r.error ?? "检查失败");
    } catch (e) {
      setError(String(e));
      setCheck(null);
    } finally {
      setBusy("");
    }
  }

  async function doUpdate(): Promise<void> {
    setBusy("run");
    setError("");
    setNotice("");
    try {
      const r = await ipc<UpdateResult>("update:run", { sourceUrl, force });
      setResult(r);
      if (r.error) setError(r.error);
      if (r.updated > 0) setNotice(`已更新 ${r.updated} 个文件，版本 ${r.fromVersion} → ${r.toVersion}`);
      else if (r.ok) setNotice(`已是最新（${r.toVersion}），无需下载`);
      await loadOverview();
      await loadLogs();
      setCheck(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  }

  async function doRollback(name?: string): Promise<void> {
    setBusy("rollback");
    setError("");
    setNotice("");
    try {
      const r = await ipc<{ ok: boolean; backup: string | null; restored: number; removed: number; error: string | null }>(
        "update:rollback",
        name ? { backup: name } : {}
      );
      if (r.ok) setNotice(`已回滚（${r.backup ?? "出厂内置"}）：还原 ${r.restored} 个文件`);
      else setError(r.error ?? "回滚失败");
      await loadOverview();
      await loadLogs();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  }

  const changedFiles = (check?.files ?? []).filter((f) => f.changed);

  return (
    <section id="data-update" className="card card-p">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="title">数据更新</h2>
          <p className="mt-1 sub">
            从更新源拉取规则库 / 知识库 / 模板 / 基础数据的新版本。更新只写入本机用户目录，
            内置资源保持原样，因此随时可以回滚。断网时不影响任何已有功能。
          </p>
        </div>
        {ov && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="chip chip-neutral num">本地版本 {ov.version}</span>
            <span className={`chip ${ov.version === "0" ? "chip-neutral" : "chip-success"}`}>
              {ov.version === "0" ? "出厂内置" : "已更新"}
            </span>
          </div>
        )}
      </div>

      {error && <div className="notice notice-danger mt-4 break-all">{error}</div>}
      {notice && <div className="notice notice-info mt-4 break-all">{notice}</div>}

      {/* 更新源 */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[280px] flex-1">
          <label className="label">更新源（支持 https / 本地目录 / file://）</label>
          <input
            className="input num text-[12px]"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            onBlur={() => void saveSource(sourceUrl)}
            placeholder="https://raw.githubusercontent.com/siyueweiji-commits/xuanshu-data/main"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-[13px] text-ink">
          <input
            type="checkbox"
            className="check"
            checked={ov?.autoCheck ?? true}
            onChange={(e) => void toggleAuto(e.target.checked)}
          />
          启动时自动检查
        </label>
        <button className="btn btn-secondary mb-0.5" onClick={() => void doCheck()} disabled={!!busy}>
          {busy === "check" ? "检查中…" : "检查更新"}
        </button>
        <button className="btn btn-primary mb-0.5" onClick={() => void doUpdate()} disabled={!!busy}>
          {busy === "run" ? "更新中…" : "立即更新"}
        </button>
      </div>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          className="check"
          checked={force}
          onChange={(e) => setForce(e.target.checked)}
        />
        强制重下（即使哈希一致也重新覆盖，用于修复本地文件被改动的情况）
      </label>

      {/* 检查结果 */}
      {check && (
        <div className="mt-4 border-t border-hair pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="eyebrow">检查结果</span>
            <span className="chip chip-neutral num">远端 {check.remoteVersion}</span>
            <span className="chip chip-neutral num">与本地 {check.localVersion} 对比</span>
            <span className={`chip ${check.hasUpdate ? "chip-warn" : "chip-success"}`}>
              {check.hasUpdate ? `有更新（${check.changedCount} 个文件）` : "已是最新"}
            </span>
            <span className="chip chip-neutral num">共 {check.total} 个文件</span>
            {check.sourceKind === "dir" && <span className="chip chip-neutral">本地目录源</span>}
          </div>
          {changedFiles.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-line text-ink-3">
                    <th className="px-2 py-1.5 text-left font-medium">文件</th>
                    <th className="px-2 py-1.5 text-left font-medium">类别</th>
                    <th className="px-2 py-1.5 text-left font-medium">状态</th>
                    <th className="px-2 py-1.5 text-left font-medium">远端哈希</th>
                  </tr>
                </thead>
                <tbody>
                  {changedFiles.map((f) => (
                    <tr key={f.path} className="border-b border-hair last:border-0">
                      <td className="num px-2 py-1.5 text-ink">{f.path}</td>
                      <td className="px-2 py-1.5 text-ink-2">{KIND_CN[f.kind] ?? f.kind}</td>
                      <td className="px-2 py-1.5">
                        {f.isNew ? (
                          <span className="chip chip-accent">新增</span>
                        ) : (
                          <span className="chip chip-warn">有改动</span>
                        )}
                      </td>
                      <td className="num px-2 py-1.5 text-ink-4">{f.remoteHash.slice(7, 19)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 sub">所有文件与远端一致，无需下载。</p>
          )}
        </div>
      )}

      {/* 更新结果 */}
      {result && (
        <div className="mt-4 border-t border-hair pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="eyebrow">更新结果</span>
            <span className={`chip ${result.ok ? "chip-success" : "chip-danger"}`}>
              {result.ok ? "完成" : "失败"}
            </span>
            <span className="chip chip-neutral num">{result.fromVersion} → {result.toVersion}</span>
            <span className="chip chip-neutral num">更新 {result.updated}</span>
            <span className="chip chip-neutral num">跳过 {result.skipped}</span>
            {result.failed > 0 && <span className="chip chip-danger num">失败 {result.failed}</span>}
          </div>
          {result.files.some((f) => f.status === "failed") && (
            <ul className="mt-3 space-y-1.5">
              {result.files
                .filter((f) => f.status === "failed")
                .map((f) => (
                  <li key={f.path} className="rounded-md bg-danger/[0.06] px-3 py-2 text-[12px] text-ink-2">
                    <span className="num text-ink">{f.path}</span>　{f.error}
                  </li>
                ))}
            </ul>
          )}
          {result.backupDir && (
            <p className="num mt-2 text-micro text-ink-4">更新前快照：{result.backupDir}</p>
          )}
        </div>
      )}

      {/* 资源概况 */}
      {ov && (
        <div className="mt-5 border-t border-hair pt-4">
          <div className="eyebrow mb-2">本地资源</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ov.kinds.map((k) => (
              <div key={k.kind} className="rounded-md bg-gray1 px-3 py-2.5">
                <div className="text-[12px] text-ink-3">{KIND_CN[k.kind] ?? k.kind}</div>
                <div className="num mt-1 text-[15px] font-semibold text-ink">{k.builtin}</div>
                <div className="num mt-0.5 text-micro text-ink-4">
                  {k.updated > 0 ? `已更新 ${k.updated} 个` : "使用内置"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 备份与回滚 */}
      <div className="mt-5 border-t border-hair pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="eyebrow">更新前快照（可回滚）</div>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => void doRollback()}
            disabled={!!busy}
          >
            {busy === "rollback" ? "回滚中…" : "回滚到最近快照"}
          </button>
        </div>
        {!ov || ov.backups.length === 0 ? (
          <p className="mt-2 sub">暂无快照。执行一次会改动文件的更新后会自动创建。</p>
        ) : (
          <ul className="mt-2 divide-y divide-hair">
            {ov.backups.slice(0, 8).map((b) => (
              <li key={b.name} className="flex items-center gap-3 py-2">
                <span className="num flex-1 text-[13px] text-ink">{b.name}</span>
                <span className="num text-micro text-ink-4">{b.files} 个文件</span>
                <button className="btn btn-sm btn-plain" onClick={() => void doRollback(b.name)} disabled={!!busy}>
                  回滚到此
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 更新日志 */}
      <div className="mt-5 border-t border-hair pt-4">
        <div className="eyebrow mb-2">更新日志</div>
        {logs.length === 0 ? (
          <p className="sub">暂无日志。</p>
        ) : (
          <ul className="divide-y divide-hair">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className={`chip ${STATUS_CHIP[l.status] ?? "chip-neutral"}`}>
                  {STATUS_CN[l.status] ?? l.status}
                </span>
                <span className="num text-micro text-ink-4">{l.created_at}</span>
                <span className="min-w-0 flex-1 text-[12px] text-ink-2">{l.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
