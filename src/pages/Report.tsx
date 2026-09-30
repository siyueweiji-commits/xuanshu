import { useEffect, useMemo, useState } from "react";
import { ipc } from "../lib/ipc";
import PageHead from "../components/PageHead";
import Markdown from "../components/Markdown";
import { IconDownload } from "../components/icons";

/* ---------------- 类型 ---------------- */

interface TemplateMeta {
  id: string;
  name: string;
  scope: "daily" | "range";
  file: string;
  desc: string;
}

interface CityInfo {
  name: string;
  province: string;
  longitude: number;
}

interface Section {
  key: string;
  title: string;
  body: string;
}

interface BuiltReport {
  templateId: string;
  templateName: string;
  scope: "daily" | "range";
  title: string;
  profileId: number | null;
  profileName: string;
  dateFrom: string;
  dateTo: string;
  contentMd: string;
  daily: { advice: unknown[] } | null;
  range: { days: number; totalAdvice: number; byGroup: Record<string, number> } | null;
  hasDisclaimer: boolean;
  generatedAt: string;
}

interface SavedItem {
  id: number;
  title: string;
  scope: "daily" | "range";
  template_id: string;
  date_from: string;
  date_to: string;
  created_at: string;
  summary: Record<string, unknown>;
}

interface SavedDetail {
  id: number;
  title: string;
  scope: "daily" | "range";
  template_id: string;
  date_from: string;
  date_to: string;
  created_at: string;
  content_md: string;
}

interface View {
  title: string;
  contentMd: string;
  scope: "daily" | "range";
  dateFrom: string;
  dateTo: string;
  savedId: number | null;
  source: string;
}

/* ---------------- 工具 ---------------- */

const SHORT: Record<string, string> = { daily: "单日", range: "区间" };

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function shiftDate(s: string, delta: number): string {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/** 与主进程 splitSections 同规则：按 `## ` 切段，文首归入「报告概览」 */
function splitSections(md: string): Section[] {
  const out: Section[] = [];
  const head: string[] = [];
  let cur: { title: string; lines: string[] } | null = null;

  for (const line of md.split("\n")) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (cur) out.push({ key: "", title: cur.title, body: cur.lines.join("\n").trim() });
      cur = { title: m[1], lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    } else {
      head.push(line);
    }
  }
  if (cur) out.push({ key: "", title: cur.title, body: cur.lines.join("\n").trim() });

  const headText = head.join("\n").trim();
  if (headText) out.unshift({ key: "", title: "报告概览", body: headText });

  return out.map((s, i) => ({ ...s, key: `sec-${i}` }));
}

/* ---------------- 页面 ---------------- */

export default function Report() {
  const [scope, setScope] = useState<"daily" | "range">("daily");
  const [date, setDate] = useState(todayStr());
  const [days, setDays] = useState(7);

  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [templateId, setTemplateId] = useState("");

  const [withBirth, setWithBirth] = useState(false);
  const [form, setForm] = useState({ gender: "男", year: 1990, month: 1, day: 1, hour: 12, minute: 0 });
  const [useTrueSolar, setUseTrueSolar] = useState(false);
  const [city, setCity] = useState("孝感");
  const [cities, setCities] = useState<CityInfo[]>([]);

  const [view, setView] = useState<View | null>(null);
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void ipc<TemplateMeta[]>("templates:list")
      .then((list) => {
        setTemplates(list);
        if (list.length) setTemplateId((prev) => prev || list[0].id);
      })
      .catch(() => setTemplates([]));
    void ipc<CityInfo[]>("calendar:cities")
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  // 模板随范围联动：切换单日/区间时优先选匹配范围的模板
  useEffect(() => {
    const matched = templates.filter((t) => t.scope === scope);
    if (matched.length && !matched.some((t) => t.id === templateId)) setTemplateId(matched[0].id);
  }, [scope, templates, templateId]);

  async function refreshSaved(): Promise<void> {
    try {
      setSaved(await ipc<SavedItem[]>("report:list", { limit: 30 }));
    } catch {
      setSaved([]);
    }
  }

  useEffect(() => {
    void refreshSaved();
  }, []);

  const sections = useMemo(() => (view ? splitSections(view.contentMd) : []), [view]);
  const activeTemplates = templates.filter((t) => t.scope === scope);

  async function build(): Promise<void> {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { scope, date, templateId: templateId || undefined };
      if (scope === "range") payload.days = days;
      if (withBirth) {
        payload.birth = { ...form, city: useTrueSolar ? city : undefined, useTrueSolar };
      }
      const r = await ipc<BuiltReport>("report:build", payload);
      setView({
        title: r.title,
        contentMd: r.contentMd,
        scope: r.scope,
        dateFrom: r.dateFrom,
        dateTo: r.dateTo,
        savedId: null,
        source: withBirth ? "含个人命盘" : "仅黄历"
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function save(): Promise<void> {
    if (!view) return;
    setError("");
    setNotice("");
    try {
      // 只回传落库所需字段，避免把整份 vars / 逐日明细塞进 IPC
      const trimmed = {
        templateId: templateId || activeTemplates[0]?.id || "daily_report",
        scope: view.scope,
        title: view.title,
        profileName: withBirth ? "本人生辰" : "未指定档案",
        dateFrom: view.dateFrom,
        dateTo: view.dateTo,
        contentMd: view.contentMd,
        hasDisclaimer: view.contentMd.includes("不构成任何医疗、法律、投资或驾驶安全建议"),
        generatedAt: new Date().toISOString(),
        daily: null,
        range: null
      };
      const { id } = await ipc<{ id: number }>("report:save", { result: trimmed });
      setView({ ...view, savedId: id });
      setNotice(`已保存到本地资料库（#${id}）`);
      await refreshSaved();
    } catch (e) {
      setError(String(e));
    }
  }

  async function exportMd(): Promise<void> {
    if (!view) return;
    setError("");
    setNotice("");
    try {
      const r = await ipc<{ path: string }>("report:export", {
        contentMd: view.contentMd,
        title: view.title
      });
      setNotice(`已导出：${r.path}`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function copyMd(): Promise<void> {
    if (!view) return;
    try {
      await navigator.clipboard.writeText(view.contentMd);
      setNotice("Markdown 已复制到剪贴板");
    } catch {
      setError("复制失败（剪贴板不可用）");
    }
  }

  async function open(id: number): Promise<void> {
    setError("");
    setNotice("");
    try {
      const d = await ipc<SavedDetail>("report:get", { id });
      setView({
        title: d.title,
        contentMd: d.content_md,
        scope: d.scope,
        dateFrom: d.date_from,
        dateTo: d.date_to,
        savedId: d.id,
        source: "本地存档"
      });
    } catch (e) {
      setError(String(e));
    }
  }

  async function remove(id: number): Promise<void> {
    try {
      await ipc("report:delete", { id });
      if (view?.savedId === id) setView(null);
      await refreshSaved();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="page">
      <PageHead
        title="报告"
        desc="把流日注意事项整理成 Markdown 报告：可单日、可区间，可选叠加个人命盘；生成后可存档到本机资料库或导出为 .md 文件。"
      />

      {/* ---------- 生成条件 ---------- */}
      <section className="card card-p">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">范围</label>
            <div className="seg">
              {(["daily", "range"] as const).map((s) => (
                <button
                  key={s}
                  className={`seg-item ${scope === s ? "seg-item-active" : ""}`}
                  onClick={() => setScope(s)}
                >
                  {SHORT[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">{scope === "range" ? "起始日期" : "日期"}</label>
            <input
              type="date"
              className="input num w-[168px]"
              value={date}
              onChange={(e) => setDate(e.target.value || todayStr())}
            />
          </div>

          {scope === "range" && (
            <div>
              <label className="label">天数</label>
              <input
                type="number"
                min={1}
                max={90}
                className="input num w-[84px]"
                value={days}
                onChange={(e) => setDays(Math.min(90, Math.max(1, +e.target.value || 1)))}
              />
            </div>
          )}

          <div>
            <label className="label">模板</label>
            <select
              className="select w-[184px]"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {activeTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-1.5 pb-0.5">
            <button className="btn btn-sm btn-secondary" onClick={() => setDate(shiftDate(date, -1))}>
              前一天
            </button>
            <button className="btn btn-sm btn-secondary" onClick={() => setDate(todayStr())}>
              今天
            </button>
            <button className="btn btn-sm btn-secondary" onClick={() => setDate(shiftDate(date, 1))}>
              后一天
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2 pb-0.5">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                className="check"
                checked={withBirth}
                onChange={(e) => setWithBirth(e.target.checked)}
              />
              叠加个人命盘
            </label>
            <button className="btn btn-primary" onClick={() => void build()} disabled={loading}>
              {loading ? "生成中…" : "生成报告"}
            </button>
          </div>
        </div>

        {withBirth && (
          <div className="mt-5 border-t border-hair pt-4">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              <div>
                <label className="label">性别</label>
                <select
                  className="select"
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                >
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </div>
              {(["year", "month", "day", "hour", "minute"] as const).map((k) => (
                <div key={k}>
                  <label className="label">
                    {{ year: "年", month: "月", day: "日", hour: "时", minute: "分" }[k]}
                  </label>
                  <input
                    type="number"
                    className="input num"
                    value={form[k]}
                    onChange={(e) => setForm({ ...form, [k]: +e.target.value })}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
                <input
                  type="checkbox"
                  className="check"
                  checked={useTrueSolar}
                  onChange={(e) => setUseTrueSolar(e.target.checked)}
                />
                启用真太阳时校正
              </label>
              <div className="w-52">
                <select
                  className="select"
                  value={city}
                  disabled={!useTrueSolar}
                  onChange={(e) => setCity(e.target.value)}
                >
                  {cities.length === 0 && <option value={city}>{city}</option>}
                  {cities.map((c) => (
                    <option key={`${c.province}-${c.name}`} value={c.name}>
                      {c.province} · {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <span className="sub">校正后时辰若跨时辰，命盘与八字会随之变化。</span>
            </div>
          </div>
        )}

        {error && <div className="notice notice-danger mt-4">{error}</div>}
        {notice && <div className="notice notice-info mt-4 break-all">{notice}</div>}
      </section>

      {/* ---------- 报告正文 ---------- */}
      {view && (
        <section className="card card-p">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="title">{view.title}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="chip chip-accent">{SHORT[view.scope]}</span>
                <span className="chip chip-neutral num">
                  {view.scope === "range" ? `${view.dateFrom} ~ ${view.dateTo}` : view.dateFrom}
                </span>
                <span className="chip chip-neutral">{view.source}</span>
                <span className="chip chip-neutral num">{view.contentMd.length} 字</span>
                {view.savedId !== null && <span className="chip chip-success num">已存档 #{view.savedId}</span>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button className="btn btn-sm btn-secondary" onClick={() => void copyMd()}>
                复制
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => void exportMd()}>
                <IconDownload className="h-[13px] w-[13px]" />
                导出 .md
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => void save()}
                disabled={view.savedId !== null}
              >
                {view.savedId !== null ? "已保存" : "保存"}
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-5 border-t border-hair pt-5">
            {sections.map((s) => (
              <div key={s.key}>
                <div className="eyebrow mb-2">{s.title}</div>
                <div className="rounded-md bg-gray1 px-4 py-3.5">
                  <Markdown source={s.body} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- 本地存档 ---------- */}
      <section className="card card-p">
        <div className="flex items-center justify-between">
          <h2 className="title">本地存档</h2>
          <span className="sub num">{saved.length} 份</span>
        </div>

        {saved.length === 0 ? (
          <p className="mt-3 sub">暂无存档。生成报告后点「保存」即会写入本机数据库。</p>
        ) : (
          <ul className="mt-3 divide-y divide-hair">
            {saved.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink">{it.title}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="chip chip-neutral">{SHORT[it.scope]}</span>
                    <span className="chip chip-neutral num">
                      {it.scope === "range" ? `${it.date_from} ~ ${it.date_to}` : it.date_from}
                    </span>
                    <span className="num text-micro text-ink-4">{it.created_at}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button className="btn btn-sm btn-plain" onClick={() => void open(it.id)}>
                    载入
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => void remove(it.id)}>
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
