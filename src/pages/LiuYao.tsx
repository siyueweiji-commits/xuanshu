import { useMemo, useState } from "react";
import { ipc } from "../lib/ipc";
import PageHead from "../components/PageHead";

/* ---------------- 类型 ---------------- */

interface Bundle {
  name: string;
  upper: number;
  lower: number;
  upperName: string;
  lowerName: string;
  lines: number[];
}

interface FuShen {
  liuQin: string;
  ganZhi: string;
  wuxing: string;
}

interface YaoDetail {
  position: number;
  nature: string;
  yang: boolean;
  changing: boolean;
  title: string;
  coins: string[] | null;
  gan: string;
  zhi: string;
  ganZhi: string;
  wuxing: string;
  liuQin: string;
  liuShen: string;
  isShi: boolean;
  isYing: boolean;
  fuShen: FuShen | null;
  changedYang: boolean | null;
}

interface Advice {
  id: string;
  text: string;
  level: string;
  weight: number;
  system: string;
  source: string;
}

interface TimeParts {
  date: string;
  time: string;
  monthGanZhi: string;
  dayGanZhi: string;
  lunarText: string;
  hourName: string;
}

interface LiuyaoResult {
  mode: "coins" | "manual";
  question: string;
  thrownAt: string;
  dayGanZhi: string;
  monthGanZhi: string;
  xunKong: string[];
  lines: YaoDetail[];
  original: Bundle;
  changed: Bundle | null;
  changedMeta: { palace: string; palaceWuxing: string; slotName: string; name: string } | null;
  movingLines: number[];
  meta: { palace: string; palaceWuxing: string; slotName: string; name: string };
  shi: number;
  ying: number;
  liuQinCount: Record<string, number>;
  isChong: boolean;
  isHe: boolean;
  shiYingText: string;
  advice: Advice[];
  facts: Record<string, unknown>;
  disclaimer: string;
  timeParts?: TimeParts;
}

/* ---------------- 常量 / 工具 ---------------- */

const SIXIANG = [
  { key: "shao_yang", label: "少阳", value: 1, changing: false },
  { key: "lao_yang", label: "老阳（动）", value: 1, changing: true },
  { key: "shao_yin", label: "少阴", value: 0, changing: false },
  { key: "lao_yin", label: "老阴（动）", value: 0, changing: true }
];

const LEVEL_BAR: Record<string, string> = {
  info: "bg-accent",
  caution: "bg-warning",
  warning: "bg-danger"
};

const LIUQIN_CLS: Record<string, string> = {
  父母: "text-elm-tu",
  兄弟: "text-elm-jin",
  子孙: "text-elm-mu",
  妻财: "text-elm-huo",
  官鬼: "text-elm-shui"
};

function nowLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 爻画（自下而上的单爻） */
function YaoBar({ yang, changed }: { yang: boolean; changed?: boolean | null }) {
  const cls = changed ? "bg-ink-3" : "bg-ink";
  return (
    <span className="inline-flex items-center gap-[3px]">
      {yang ? (
        <span className={`block h-[5px] w-[38px] rounded-[2px] ${cls}`} />
      ) : (
        <>
          <span className={`block h-[5px] w-[17px] rounded-[2px] ${cls}`} />
          <span className={`block h-[5px] w-[17px] rounded-[2px] ${cls}`} />
        </>
      )}
    </span>
  );
}

/* ---------------- 页面 ---------------- */

export default function LiuYao() {
  const [mode, setMode] = useState<"coins" | "manual">("coins");
  const [question, setQuestion] = useState("");
  const [datetime, setDatetime] = useState(nowLocal());
  const [manual, setManual] = useState<(typeof SIXIANG)[number]["key"][]>([
    "shao_yang",
    "shao_yin",
    "shao_yang",
    "shao_yin",
    "shao_yang",
    "shao_yin"
  ]);
  const [result, setResult] = useState<LiuyaoResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const payload = useMemo(() => {
    const base: Record<string, unknown> = { mode, question, datetime: datetime.replace("T", " ") };
    if (mode === "manual") {
      base.manualLines = manual.map((k) => {
        const s = SIXIANG.find((x) => x.key === k) ?? SIXIANG[0];
        return { value: s.value, changing: s.changing };
      });
    }
    return base;
  }, [mode, question, datetime, manual]);

  async function qiGua(): Promise<void> {
    setError("");
    setLoading(true);
    try {
      setResult(await ipc<LiuyaoResult>("divination:liuyao", payload));
    } catch (e) {
      setError(String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const r = result;
  // 装卦表按传统自下而上的卦序显示（上爻在上）
  const ordered = r ? [...r.lines].reverse() : [];

  return (
    <div className="page">
      <PageHead
        title="六爻"
        desc="三枚铜钱模拟或手动录入爻，交由京房纳甲装卦：纳甲、六亲、六神、世应、伏神齐备，动爻自动排出变卦。"
      />

      {/* ---------- 起卦 ---------- */}
      <section className="card card-p">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">起卦方式</label>
            <div className="seg">
              {(["coins", "manual"] as const).map((m) => (
                <button
                  key={m}
                  className={`seg-item ${mode === m ? "seg-item-active" : ""}`}
                  onClick={() => setMode(m)}
                >
                  {m === "coins" ? "铜钱起卦" : "手动录入"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">起卦时刻</label>
            <input
              type="datetime-local"
              className="input num w-[196px]"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value || nowLocal())}
            />
          </div>

          <div className="min-w-[200px] flex-1">
            <label className="label">所问之事（可选）</label>
            <input
              className="input"
              placeholder="如：此笔款项能否按期收回"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>

          <button className="btn btn-primary" onClick={() => void qiGua()} disabled={loading}>
            {loading ? "装卦中…" : mode === "coins" ? "掷铜钱起卦" : "按录入装卦"}
          </button>
        </div>

        {mode === "manual" && (
          <div className="mt-5 border-t border-hair pt-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              {manual.map((key, i) => (
                <div key={i}>
                  <label className="label">第 {i + 1} 爻{i === 0 ? "（初）" : i === 5 ? "（上）" : ""}</label>
                  <select
                    className="select"
                    value={key}
                    onChange={(e) => {
                      const next = [...manual];
                      next[i] = e.target.value as (typeof SIXIANG)[number]["key"];
                      setManual(next);
                    }}
                  >
                    {SIXIANG.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <p className="mt-2 text-micro text-ink-4">
              按「初爻 → 上爻」顺序选择；老阳、老阴为动爻，会翻出变卦。
            </p>
          </div>
        )}

        {r?.timeParts && (
          <div className="notice notice-quiet mt-4 num">
            装卦依据：{r.timeParts.date} {r.timeParts.time}（{r.timeParts.lunarText} {r.timeParts.hourName}）·
            月建 {r.timeParts.monthGanZhi} · 日辰 {r.timeParts.dayGanZhi} · 旬空 {r.xunKong.join("")}
          </div>
        )}

        {error && <div className="notice notice-danger mt-4">{error}</div>}
      </section>

      {/* ---------- 卦象概览 ---------- */}
      {r && (
        <section className="card card-p">
          <div className="flex flex-wrap items-start gap-8">
            <div className="text-center">
              <div className="eyebrow">本卦</div>
              <div className="mt-2 text-[17px] font-semibold leading-none tracking-tightest">
                {r.original.name}
              </div>
              <div className="num mt-1 text-micro text-ink-3">
                {r.original.upperName}上 {r.original.lowerName}下
              </div>
              <div className="mt-3">
                <HexStack lines={r.original.lines} moving={r.movingLines} />
              </div>
            </div>

            {r.changed && (
              <>
                <div className="flex h-[120px] items-center text-2xl text-ink-4">→</div>
                <div className="text-center">
                  <div className="eyebrow">变卦</div>
                  <div className="mt-2 text-[17px] font-semibold leading-none tracking-tightest">
                    {r.changed.name}
                  </div>
                  <div className="num mt-1 text-micro text-ink-3">
                    {r.changedMeta ? `${r.changedMeta.palace}宫${r.changedMeta.slotName}` : ""}
                  </div>
                  <div className="mt-3">
                    <HexStack lines={r.changed.lines} />
                  </div>
                </div>
              </>
            )}

            <div className="min-w-[240px] flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="chip chip-accent num">
                  {r.meta.palace}宫{r.meta.palaceWuxing} · {r.meta.slotName}
                </span>
                <span className="chip chip-neutral num">
                  世 {r.shi} 爻 · 应 {r.ying} 爻
                </span>
                {r.isChong && <span className="chip chip-warn">六冲卦</span>}
                {r.isHe && <span className="chip chip-success">六合卦</span>}
                {r.movingLines.length === 0 && <span className="chip chip-neutral">静卦</span>}
                {r.movingLines.length > 0 && (
                  <span className="chip chip-danger num">
                    动爻 {r.movingLines.join("、")}
                  </span>
                )}
              </div>
              <p className="mt-2 text-[13px] text-ink-2">
                <span className="text-ink-3">所问：</span>
                {r.question}
              </p>
              <p className="num mt-1 text-[12px] text-ink-3">
                月建 {r.monthGanZhi}　日辰 {r.dayGanZhi}　旬空 {r.xunKong.join("、")}
              </p>
              <p className="mt-2 text-[13px] text-ink">{r.shiYingText}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(r.liuQinCount).map(([k, v]) => (
                  <span key={k} className={`chip chip-neutral num ${LIUQIN_CLS[k] ?? ""}`}>
                    {k} ×{v}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ---------- 装卦表 ---------- */}
      {r && (
        <section className="card card-p">
          <h2 className="title">装卦</h2>
          <p className="mt-1 sub">
            自下而上：六神 → 六亲 → 纳甲 → 爻象（世应 / 动爻）→ 变爻；伏神标于缺失六亲所在爻位之下。
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-ink-3">
                  <th className="w-14 px-2 py-2 text-left font-medium">六神</th>
                  <th className="w-16 px-2 py-2 text-left font-medium">六亲</th>
                  <th className="px-2 py-2 text-left font-medium">本卦</th>
                  <th className="w-16 px-2 py-2 text-left font-medium">纳甲</th>
                  <th className="w-14 px-2 py-2 text-left font-medium">五行</th>
                  <th className="w-24 px-2 py-2 text-left font-medium">世应 / 动</th>
                  <th className="w-16 px-2 py-2 text-left font-medium">变爻</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((l) => (
                  <tr key={l.position} className="border-b border-hair last:border-0">
                    <td className="px-2 py-2 text-ink-3">{l.liuShen}</td>
                    <td className={`px-2 py-2 font-medium ${LIUQIN_CLS[l.liuQin] ?? "text-ink"}`}>
                      {l.liuQin}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <YaoBar yang={l.yang} />
                        <span className="num text-micro text-ink-4">{l.nature}</span>
                        {l.coins && (
                          <span className="num text-micro text-ink-4">({l.coins.join("")})</span>
                        )}
                      </div>
                      {l.fuShen && (
                        <div className="mt-1 flex items-center gap-2 text-micro text-ink-3">
                          <span className="num">伏 {l.fuShen.ganZhi}</span>
                          <span>{l.fuShen.liuQin}</span>
                        </div>
                      )}
                    </td>
                    <td className="num px-2 py-2 text-ink">{l.ganZhi}</td>
                    <td className="px-2 py-2 text-ink-3">{l.wuxing}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {l.isShi && <span className="chip chip-accent">世</span>}
                        {l.isYing && <span className="chip chip-neutral">应</span>}
                        {l.changing && <span className="chip chip-danger">动</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      {l.changedYang === null ? (
                        <span className="text-ink-4">—</span>
                      ) : (
                        <YaoBar yang={l.changedYang} changed />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 sub">
            爻位对照：第 1 行是上爻（第 6 爻），向下依次到初爻（第 1 爻）。
          </p>
        </section>
      )}

      {/* ---------- 解读 ---------- */}
      {r && (
        <section className="card card-p">
          <div className="flex items-center justify-between">
            <h2 className="title">卦象解读</h2>
            <span className="sub num">{r.advice.length} 条</span>
          </div>
          {r.advice.length === 0 ? (
            <p className="mt-3 sub">当前规则库没有命中的条目，可在「设置 · 规则库」中查看或扩充六爻规则。</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {r.advice.map((a) => (
                <li key={a.id} className="flex gap-3 rounded-md bg-gray1 px-3.5 py-3">
                  <span
                    className={`mt-[6px] h-4 w-[3px] shrink-0 rounded-full ${
                      LEVEL_BAR[a.level] ?? "bg-accent"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] leading-relaxed text-ink">{a.text}</p>
                    <p className="mt-1 text-micro text-ink-4">{a.source}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 sub">{r.disclaimer}</p>
        </section>
      )}
    </div>
  );
}

/** 六爻竖排（上爻在最上），动爻标红点 */
function HexStack({ lines, moving }: { lines: number[]; moving?: number[] }) {
  const set = new Set(moving ?? []);
  return (
    <div className="flex flex-col items-center gap-1.5">
      {lines
        .map((v, i) => ({ v, pos: i + 1 }))
        .reverse()
        .map(({ v, pos }) => (
          <div key={pos} className="flex items-center gap-1">
            <span className="w-2 text-center text-[10px] leading-none text-danger">
              {set.has(pos) ? "●" : ""}
            </span>
            <YaoBar yang={Boolean(v)} />
          </div>
        ))}
    </div>
  );
}
