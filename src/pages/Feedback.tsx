import { useEffect, useMemo, useState } from "react";
import { ipc } from "../lib/ipc";
import PageHead from "../components/PageHead";
import { IconDownload } from "../components/icons";

/* ---------------- 类型 ---------------- */

interface EventTypeMeta {
  key: string;
  group: string | null;
  polarity: "good" | "bad" | "neutral";
  desc: string;
}

interface FeedbackRow {
  id: number;
  profile_id: number | null;
  date: string;
  event_type: string;
  description: string | null;
  created_at: string;
  polarity: "good" | "bad" | "neutral";
  group: string | null;
  typeDesc: string;
}

interface EventHitView {
  id: number;
  eventType: string;
  polarity: "good" | "bad" | "neutral";
  group: string | null;
  matched: Array<{ id: string; text: string; level: string }>;
  hit: boolean | null;
  description: string;
}

interface BacktestDayRow {
  date: string;
  weekday: string;
  adviceCount: number;
  groups: Record<string, number>;
  topLevel: string;
  events: EventHitView[];
  allHit: boolean;
  allMiss: boolean;
}

interface BacktestResult {
  dateFrom: string;
  dateTo: string;
  profileId: number | null;
  summary: {
    days: number;
    eventDays: number;
    scoredEvents: number;
    hitEvents: number;
    hitRate: number;
    byType: Array<{ eventType: string; total: number; hit: number; rate: number }>;
    byGroup: Array<{ group: string; eventCount: number; hitCount: number; rate: number }>;
    quietDays: number;
    quietWarningDays: number;
    ruleTop: Array<{ id: string; days: number; text: string }>;
  };
  rows: BacktestDayRow[];
  disclaimer: string;
}

interface ProfileRow {
  id: number;
  name: string;
  gender: string;
  birth_time: string;
}

/* ---------------- 工具 ---------------- */

function today(): string {
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

const POLARITY_CHIP: Record<string, string> = {
  good: "chip-success",
  bad: "chip-danger",
  neutral: "chip-neutral"
};

const POLARITY_TEXT: Record<string, string> = {
  good: "吉",
  bad: "凶",
  neutral: "中"
};

const LEVEL_BAR: Record<string, string> = {
  info: "bg-accent",
  caution: "bg-warning",
  warning: "bg-danger"
};

/* ---------------- 页面 ---------------- */

export default function Feedback() {
  const [types, setTypes] = useState<EventTypeMeta[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [list, setList] = useState<FeedbackRow[]>([]);

  const [form, setForm] = useState({ date: today(), eventType: "破财", description: "", profileId: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [range, setRange] = useState({ from: shiftDate(today(), -29), to: today() });
  const [withBirth, setWithBirth] = useState(false);
  const [birth, setBirth] = useState({ gender: "男", year: 1990, month: 1, day: 1, hour: 12, minute: 0 });
  const [bt, setBt] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadList(): Promise<void> {
    try {
      setList(await ipc<FeedbackRow[]>("feedback:list", { limit: 300 }));
    } catch {
      setList([]);
    }
  }

  useEffect(() => {
    void ipc<EventTypeMeta[]>("feedback:types")
      .then(setTypes)
      .catch(() => setTypes([]));
    void ipc<ProfileRow[]>("profile:list")
      .then(setProfiles)
      .catch(() => setProfiles([]));
    void loadList();
  }, []);

  const byDate = useMemo(() => {
    const m = new Map<string, FeedbackRow[]>();
    for (const f of list) {
      const arr = m.get(f.date) ?? [];
      arr.push(f);
      m.set(f.date, arr);
    }
    return m;
  }, [list]);

  async function addEvent(): Promise<void> {
    setError("");
    setNotice("");
    try {
      await ipc("feedback:create", {
        date: form.date,
        eventType: form.eventType,
        description: form.description,
        profileId: form.profileId ? Number(form.profileId) : null
      });
      setForm({ ...form, description: "" });
      setNotice("已记录");
      await loadList();
    } catch (e) {
      setError(String(e));
    }
  }

  async function removeEvent(id: number): Promise<void> {
    setError("");
    try {
      await ipc("feedback:delete", { id });
      await loadList();
    } catch (e) {
      setError(String(e));
    }
  }

  function birthPayload(): Record<string, unknown> | undefined {
    if (!withBirth) return undefined;
    return {
      gender: birth.gender,
      year: birth.year,
      month: birth.month,
      day: birth.day,
      hour: birth.hour,
      minute: birth.minute,
      timeIndex: Math.min(12, Math.floor((birth.hour + 1) / 2))
    };
  }

  async function runBacktest(): Promise<void> {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { dateFrom: range.from, dateTo: range.to };
      const b = birthPayload();
      if (b) payload.birth = b;
      setBt(await ipc<BacktestResult>("feedback:backtest", payload));
    } catch (e) {
      setError(String(e));
      setBt(null);
    } finally {
      setLoading(false);
    }
  }

  async function exportCsv(): Promise<void> {
    setError("");
    setNotice("");
    try {
      const payload: Record<string, unknown> = { dateFrom: range.from, dateTo: range.to };
      const b = birthPayload();
      if (b) payload.birth = b;
      const r = await ipc<{ path: string }>("feedback:export", payload);
      setNotice(`已导出：${r.path}`);
    } catch (e) {
      setError(String(e));
    }
  }

  const s = bt?.summary;
  // 只显示有事件的行 + 出现 warning 的行（避免 365 行把页面撑爆）
  const rows = useMemo(
    () => (bt ? bt.rows.filter((r) => r.events.length > 0 || r.topLevel === "warning") : []),
    [bt]
  );

  return (
    <div className="page">
      <PageHead
        title="反馈与回测"
        desc="记录实际发生的事（破财 / 争吵 / 生病 / 好事…），再让规则库回去对账：当日注意事项有没有提前警示到。数据仅存本机。"
      />

      {/* ---------- 记录事件 ---------- */}
      <section className="card card-p">
        <h2 className="title">记录事件</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="label">日期</label>
            <input
              type="date"
              className="input num w-[168px]"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value || today() })}
            />
          </div>
          <div>
            <label className="label">事件类型</label>
            <select
              className="select w-[144px]"
              value={form.eventType}
              onChange={(e) => setForm({ ...form, eventType: e.target.value })}
            >
              {types.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.key}（{POLARITY_TEXT[t.polarity]}）
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">关联档案（可选）</label>
            <select
              className="select w-[176px]"
              value={form.profileId}
              onChange={(e) => setForm({ ...form, profileId: e.target.value })}
            >
              <option value="">不关联</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="label">说明（可选）</label>
            <input
              className="input"
              placeholder="如：追尾被罚 200"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <button className="btn btn-primary" onClick={() => void addEvent()}>
            记录
          </button>
        </div>
        <p className="mt-2 text-micro text-ink-4">
          凶性事件（破财 / 争吵 / 生病…）由当日同分类下的「提示 / 谨慎 / 警示」条目判定是否命中；「其他」不参与命中率统计。
        </p>

        {error && <div className="notice notice-danger mt-4">{error}</div>}
        {notice && <div className="notice notice-info mt-4 break-all">{notice}</div>}
      </section>

      {/* ---------- 历史记录 ---------- */}
      <section className="card card-p">
        <div className="flex items-center justify-between">
          <h2 className="title">历史记录</h2>
          <span className="sub num">{list.length} 条</span>
        </div>
        {list.length === 0 ? (
          <p className="mt-3 sub">暂无记录。上面添加事件后即会出现在这里。</p>
        ) : (
          <ul className="mt-3 divide-y divide-hair">
            {list.slice(0, 60).map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2.5">
                <div className="num w-[92px] shrink-0 text-[13px] text-ink">{f.date}</div>
                <span className={`chip shrink-0 ${POLARITY_CHIP[f.polarity]}`}>{f.event_type}</span>
                <div className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
                  {f.description || <span className="text-ink-4">—</span>}
                </div>
                <span className="num shrink-0 text-micro text-ink-4">{f.group ?? "不分类"}</span>
                <button className="btn btn-sm btn-danger shrink-0" onClick={() => void removeEvent(f.id)}>
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
        {list.length > 60 && <p className="mt-2 text-micro text-ink-4">仅显示最近 60 条。</p>}
        <p className="mt-3 text-micro text-ink-4">
          共涉及 {byDate.size} 个日期。
        </p>
      </section>

      {/* ---------- 回测 ---------- */}
      <section className="card card-p">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="title">回测</h2>
            <p className="mt-1 sub">
              把区间内每天记录的事件，与该日规则引擎给出的注意事项逐条对照，统计命中率。
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">起</label>
              <input
                type="date"
                className="input num w-[150px]"
                value={range.from}
                onChange={(e) => setRange({ ...range, from: e.target.value || today() })}
              />
            </div>
            <div>
              <label className="label">止</label>
              <input
                type="date"
                className="input num w-[150px]"
                value={range.to}
                onChange={(e) => setRange({ ...range, to: e.target.value || today() })}
              />
            </div>
            <div className="flex gap-1.5 pb-0.5">
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setRange({ from: shiftDate(today(), -29), to: today() })}
              >
                近 30 天
              </button>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setRange({ from: shiftDate(today(), -89), to: today() })}
              >
                近 90 天
              </button>
            </div>
            <button className="btn btn-primary" onClick={() => void runBacktest()} disabled={loading}>
              {loading ? "计算中…" : "开始回测"}
            </button>
          </div>
        </div>

        <div className="mt-4 border-t border-hair pt-4">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              className="check"
              checked={withBirth}
              onChange={(e) => setWithBirth(e.target.checked)}
            />
            回测时叠加个人命盘（让当日注意事项包含八字与紫微流日的个性化条目）
          </label>
          {withBirth && (
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
              <div>
                <label className="label">性别</label>
                <select
                  className="select"
                  value={birth.gender}
                  onChange={(e) => setBirth({ ...birth, gender: e.target.value })}
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
                    value={birth[k]}
                    onChange={(e) => setBirth({ ...birth, [k]: +e.target.value })}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {s && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="回测天数" value={String(s.days)} />
              <Metric label="有事件天数" value={String(s.eventDays)} />
              <Metric
                label="命中率"
                value={`${(s.hitRate * 100).toFixed(1)}%`}
                sub={`${s.hitEvents} / ${s.scoredEvents}`}
                tone={s.hitRate >= 0.5 ? "good" : "plain"}
              />
              <Metric
                label="无事件日中出警示"
                value={`${s.quietWarningDays}`}
                sub={`共 ${s.quietDays} 个无事件日`}
              />
            </div>

            {s.byType.length > 0 && (
              <div className="mt-5">
                <div className="eyebrow mb-2">按事件类型</div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[400px] border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-line text-ink-3">
                        <th className="px-2 py-1.5 text-left font-medium">类型</th>
                        <th className="px-2 py-1.5 text-right font-medium">记录数</th>
                        <th className="px-2 py-1.5 text-right font-medium">命中</th>
                        <th className="px-2 py-1.5 text-right font-medium">命中率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.byType.map((t) => (
                        <tr key={t.eventType} className="border-b border-hair last:border-0">
                          <td className="px-2 py-1.5 text-ink">{t.eventType}</td>
                          <td className="num px-2 py-1.5 text-right text-ink-2">{t.total}</td>
                          <td className="num px-2 py-1.5 text-right text-ink-2">{t.hit}</td>
                          <td className="num px-2 py-1.5 text-right text-ink">
                            {(t.rate * 100).toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {s.ruleTop.length > 0 && (
              <div className="mt-5">
                <div className="eyebrow mb-2">命中频次最高的规则（出现天数）</div>
                <ul className="space-y-1.5">
                  {s.ruleTop.slice(0, 8).map((r) => (
                    <li key={r.id} className="flex items-baseline gap-3 rounded-md bg-gray1 px-3 py-2">
                      <span className="num w-10 shrink-0 text-right text-[13px] text-accent">
                        {r.days}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-ink">{r.text}</p>
                        <p className="num text-micro text-ink-4">{r.id}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="eyebrow">逐日对照（有事件或当日出现「警示」的日期）</div>
                <button className="btn btn-sm btn-secondary" onClick={() => void exportCsv()}>
                  <IconDownload className="h-[13px] w-[13px]" />
                  导出 CSV
                </button>
              </div>
              {rows.length === 0 ? (
                <p className="mt-2 sub">区间内没有事件记录，也没有出现警示级条目。</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {rows.slice(0, 40).map((r) => (
                    <li key={r.date} className="rounded-md bg-gray1 px-3.5 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="num text-[13px] font-medium text-ink">{r.date}</span>
                        <span className="num text-micro text-ink-4">周{r.weekday}</span>
                        <span className="chip chip-neutral num">事项 {r.adviceCount}</span>
                        {r.topLevel !== "info" && (
                          <span className={`chip ${r.topLevel === "warning" ? "chip-danger" : "chip-warn"}`}>
                            {r.topLevel === "warning" ? "有警示" : "有谨慎"}
                          </span>
                        )}
                        {r.allHit && <span className="chip chip-success">全部命中</span>}
                        {r.allMiss && <span className="chip chip-danger">全部未命中</span>}
                      </div>
                      {r.events.length > 0 && (
                        <ul className="mt-2 space-y-1.5">
                          {r.events.map((e) => (
                            <li key={e.id} className="flex flex-wrap items-baseline gap-2">
                              <span className={`chip ${POLARITY_CHIP[e.polarity]}`}>{e.eventType}</span>
                              <span className="text-[12px] text-ink-2">
                                {e.hit === null ? "不计分" : e.hit ? "命中" : "未命中"}
                              </span>
                              {e.description && (
                                <span className="text-[12px] text-ink-3">{e.description}</span>
                              )}
                              {e.matched.map((m) => (
                                <span
                                  key={m.id}
                                  className="flex w-full items-baseline gap-2 rounded bg-white px-2.5 py-1.5 text-[12px] text-ink-2"
                                >
                                  <span
                                    className={`mt-[5px] h-3 w-[3px] shrink-0 rounded-full ${
                                      LEVEL_BAR[m.level] ?? "bg-accent"
                                    }`}
                                  />
                                  <span className="min-w-0">{m.text}</span>
                                </span>
                              ))}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {rows.length > 40 && (
                <p className="mt-2 text-micro text-ink-4">
                  仅显示前 40 天，完整数据请导出 CSV。
                </p>
              )}
            </div>

            <p className="mt-4 sub">{bt.disclaimer}</p>
          </>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "plain";
}) {
  return (
    <div className="rounded-md bg-gray1 px-3.5 py-3">
      <div className="eyebrow">{label}</div>
      <div
        className={`num mt-1 text-[20px] font-semibold leading-none tracking-tightest ${
          tone === "good" ? "text-success" : "text-ink"
        }`}
      >
        {value}
      </div>
      {sub && <div className="num mt-1 text-micro text-ink-4">{sub}</div>}
    </div>
  );
}
