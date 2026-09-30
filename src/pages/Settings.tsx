import { useEffect, useMemo, useState } from "react";
import { ipc } from "../lib/ipc";
import PageHead from "../components/PageHead";

interface AppInfo {
  appName: string;
  appVersion: string;
  platform: string;
  userDataDir: string;
  dataDir: string;
}

interface RuleFileView {
  file: string;
  system: string;
  version: string;
  count: number;
  builtin: boolean;
}

interface RuleItem {
  id: string;
  system: string;
  label?: string;
  advice: string;
  enabled?: boolean;
  tags?: string[];
  enabledFinal: boolean;
  userOverride: boolean;
  builtin: boolean;
  disabledByUser: boolean;
}

interface RulesOverview {
  total: number;
  enabled: number;
  builtinFiles: RuleFileView[];
  userFiles: RuleFileView[];
  systems: string[];
  rules: RuleItem[];
}

function RuleLib() {
  const [data, setData] = useState<RulesOverview | null>(null);
  const [system, setSystem] = useState("__all__");
  const [keyword, setKeyword] = useState("");
  const [importText, setImportText] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [exportText, setExportText] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load(): Promise<void> {
    try {
      setData(await ipc<RulesOverview>("rules:overview"));
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const shown = useMemo(() => {
    if (!data) return [];
    const kw = keyword.trim().toLowerCase();
    return data.rules.filter(
      (r) =>
        (system === "__all__" || r.system === system) &&
        (!kw ||
          r.id.toLowerCase().includes(kw) ||
          (r.label ?? "").toLowerCase().includes(kw) ||
          r.advice.toLowerCase().includes(kw))
    );
  }, [data, system, keyword]);

  async function toggle(id: string, enabled: boolean): Promise<void> {
    setError("");
    try {
      await ipc("rules:toggle", { id, enabled });
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function restore(id: string): Promise<void> {
    setError("");
    try {
      await ipc("rules:remove", { id });
      await load();
      setNotice(`已删除 ${id} 的用户覆盖，恢复内置默认`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function doExport(): Promise<void> {
    setError("");
    setNotice("");
    try {
      const r = await ipc<{ json: string; count: number; system: string }>("rules:export", {
        system: system === "__all__" ? undefined : system
      });
      setExportText(r.json);
      setNotice(`已导出 ${r.count} 条（${r.system}），可直接复制保存为 .json`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function doImport(): Promise<void> {
    setError("");
    setNotice("");
    if (!importText.trim()) {
      setError("请先粘贴规则 JSON");
      return;
    }
    try {
      const r = await ipc<{ imported: number; skipped: number }>("rules:import", {
        json: importText,
        mode
      });
      setNotice(`导入成功：新增/覆盖 ${r.imported} 条，跳过 ${r.skipped} 条`);
      setImportText("");
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function copyExport(): Promise<void> {
    try {
      await navigator.clipboard.writeText(exportText);
      setNotice("已复制到剪贴板");
    } catch {
      setError("复制失败（剪贴板不可用），可手动全选复制");
    }
  }

  return (
    <section className="card card-p">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="title">规则库</h2>
          <p className="mt-1 sub">
            规则决定「注意事项」如何由黄历、八字、紫微的事实推导出来。内置规则可逐条禁用；禁用与自定义都作为用户覆盖写入本地，立即生效。
          </p>
        </div>
        {data && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="chip chip-neutral num">共 {data.total} 条</span>
            <span className="chip chip-success num">生效 {data.enabled}</span>
            <span className="chip chip-neutral num">内置文件 {data.builtinFiles.length}</span>
            {data.userFiles.length > 0 && (
              <span className="chip chip-warn num">用户文件 {data.userFiles.length}</span>
            )}
          </div>
        )}
      </div>

      {error && <div className="notice notice-danger mt-4">{error}</div>}
      {notice && <div className="notice notice-info mt-4 break-all">{notice}</div>}

      {/* 过滤 */}
      {data && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="label">体系</label>
            <select className="select w-[140px]" value={system} onChange={(e) => setSystem(e.target.value)}>
              <option value="__all__">全部</option>
              {data.systems.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="label">搜索</label>
            <input
              className="input"
              placeholder="规则 id / 名称 / 文案"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <button className="btn btn-sm btn-secondary mb-0.5" onClick={() => void load()}>
            刷新
          </button>
        </div>
      )}

      {/* 规则列表 */}
      {!data ? (
        <p className="mt-3 sub">无法读取规则库（需在 Electron 窗口中运行）。</p>
      ) : shown.length === 0 ? (
        <p className="mt-3 sub">没有匹配的规则。</p>
      ) : (
        <ul className="mt-3 divide-y divide-hair">
          {shown.map((r) => (
            <li key={r.id} className="flex items-start gap-3 py-2.5">
              <input
                type="checkbox"
                className="check mt-[3px]"
                checked={r.enabledFinal}
                onChange={(e) => void toggle(r.id, e.target.checked)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-[13px] font-medium ${r.enabledFinal ? "text-ink" : "text-ink-3 line-through"}`}>
                    {r.label || r.id}
                  </span>
                  <span className="chip chip-neutral">{r.system}</span>
                  {r.userOverride && <span className="chip chip-warn">已覆盖</span>}
                  {r.disabledByUser && <span className="chip chip-danger">已禁用</span>}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{r.advice}</p>
                <p className="num mt-0.5 text-micro text-ink-4">{r.id}</p>
              </div>
              {r.userOverride && (
                <button className="btn btn-sm btn-quiet shrink-0" onClick={() => void restore(r.id)}>
                  恢复默认
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* 导入 / 导出 */}
      <div className="mt-5 border-t border-hair pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="title-sm">导入 / 导出</h3>
          <button className="btn btn-sm btn-secondary" onClick={() => void doExport()}>
            导出为 JSON
          </button>
          {exportText && (
            <button className="btn btn-sm btn-plain" onClick={() => void copyExport()}>
              复制
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <div className="seg">
              {(["merge", "replace"] as const).map((m) => (
                <button
                  key={m}
                  className={`seg-item ${mode === m ? "seg-item-active" : ""}`}
                  onClick={() => setMode(m)}
                >
                  {m === "merge" ? "合并" : "替换"}
                </button>
              ))}
            </div>
            <button className="btn btn-sm btn-primary" onClick={() => void doImport()}>
              导入
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">导出结果</label>
            <textarea
              className="input h-32 resize-y py-2 font-mono text-[11px] leading-relaxed"
              readOnly
              value={exportText}
              placeholder="点击「导出为 JSON」后这里显示内容"
            />
          </div>
          <div>
            <label className="label">粘贴规则 JSON 以导入</label>
            <textarea
              className="input h-32 resize-y py-2 font-mono text-[11px] leading-relaxed"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='{ "rules": [ { "id": "...", "system": "custom", "advice": "..." } ] }'
            />
            <p className="mt-1 text-micro text-ink-4">
              每条规则至少需要 id 与 advice；合并＝同 id 覆盖，替换＝先清空该体系的用户规则。
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Settings() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    ipc<AppInfo>("app:info")
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  return (
    <div className="page">
      <PageHead title="设置" desc="应用信息、规则库管理与合规说明。" />

      <section className="card card-p">
        <h2 className="title">应用信息</h2>
        {info ? (
          <dl className="mt-4">
            <div className="kv">
              <dt className="kv-k">应用</dt>
              <dd className="kv-v">
                {info.appName} <span className="num text-ink-3">v{info.appVersion}</span>
              </dd>
            </div>
            <div className="kv">
              <dt className="kv-k">平台</dt>
              <dd className="kv-v">{info.platform}</dd>
            </div>
            <div className="kv">
              <dt className="kv-k">数据目录</dt>
              <dd className="kv-v num" title={info.dataDir}>
                {info.dataDir}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 sub">无法获取应用信息（需在 Electron 窗口中运行）。</p>
        )}
      </section>

      <RuleLib />

      <section className="card card-p">
        <h2 className="title">免责声明</h2>
        <p className="mt-2 sub">
          玄枢是一款文化娱乐工具，用于个人自省与命理学习研究。所有排盘、卦象、运势与注意事项输出均仅供娱乐参考，不构成任何医疗、法律、投资或驾驶安全建议，不承诺任何预测准确性。请理性看待，切勿据此做出重大决策。
        </p>

        <h2 className="mt-6 title">隐私说明</h2>
        <p className="mt-2 sub">
          所有数据（档案、命盘、报告、卦例、反馈）仅保存在本地数据目录，不上传任何云端服务器。您可随时在数据目录中查看、备份或删除全部数据。具备联网条件时，应用仅从 GitHub 公开仓库拉取规则库与知识库更新，不会上传本地数据。
        </p>
      </section>
    </div>
  );
}
