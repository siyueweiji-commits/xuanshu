import { useMemo, useState } from "react";
import { ipc } from "../lib/ipc";
import PageHead from "../components/PageHead";

/* ---------------- 类型 ---------------- */

interface LunarCast {
  yearZhi: string;
  yearZhiIndex: number;
  lunarMonth: number;
  lunarMonthCn: string;
  lunarDay: number;
  lunarDayCn: string;
  hourZhi: string;
  hourIndex: number;
  base: number;
  total: number;
}

interface YaoView {
  position: number;
  yang: boolean;
  changing: boolean;
  title: string;
}

interface Bundle {
  name: string;
  upper: number;
  lower: number;
  upperName: string;
  lowerName: string;
  upperSymbol: string;
  lowerSymbol: string;
  lines: number[];
}

interface TrigramRef {
  trigram: number;
  name: string;
  symbol: string;
  wuxing: string;
}

interface Advice {
  id: string;
  text: string;
  level: string;
  weight: number;
  system: string;
  source: string;
}

interface MeihuaResult {
  mode: "time" | "numbers" | "baoshu";
  modeName: string;
  question: string;
  lunar: LunarCast | null;
  numbers: number[];
  original: Bundle;
  mutual: Bundle;
  changed: Bundle;
  opposite: Bundle;
  reversed: Bundle;
  movingLines: number[];
  movingLine: number;
  body: TrigramRef;
  use: TrigramRef;
  usePart: "下卦" | "上卦";
  relation: { kind: string; bodyWuxing: string; useWuxing: string; fortune: string; text: string };
  changedUse: TrigramRef;
  changedRelation: { kind: string; fortune: string; text: string };
  yaos: YaoView[];
  advice: Advice[];
  facts: Record<string, unknown>;
  disclaimer: string;
}

/* ---------------- 常量 / 工具 ---------------- */

const MODES = [
  { key: "time", label: "时间起卦" },
  { key: "numbers", label: "数字起卦" },
  { key: "baoshu", label: "报数起卦" }
] as const;

type ModeKey = (typeof MODES)[number]["key"];

const LEVEL_BAR: Record<string, string> = {
  info: "bg-accent",
  caution: "bg-warning",
  warning: "bg-danger"
};

const FORTUNE_CLS: Record<string, string> = {
  吉: "chip-success",
  平: "chip-neutral",
  凶: "chip-danger"
};

/** 先天数 → 卦名（先天数：乾1 兑2 离3 震4 巽5 坎6 艮7 坤8） */
const TRIGRAM_NAMES: Record<number, string> = {
  1: "乾",
  2: "兑",
  3: "离",
  4: "震",
  5: "巽",
  6: "坎",
  7: "艮",
  8: "坤"
};

function nowLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------------- 卦象绘制 ---------------- */

/** 六爻竖排（上爻在上），动爻以红点标记 */
function HexagramGlyph({
  lines,
  moving,
  size = "md"
}: {
  lines: number[];
  moving?: number[];
  size?: "md" | "sm";
}) {
  const w = size === "sm" ? 58 : 76;
  const h = size === "sm" ? 5 : 6;
  const gap = size === "sm" ? 6 : 8;
  const set = new Set(moving ?? []);
  // 上爻在最上：反向渲染
  const ordered = lines.map((v, i) => ({ v, pos: i + 1 })).reverse();
  return (
    <div className="flex flex-col items-center" style={{ gap: `${gap}px` }}>
      {ordered.map(({ v, pos }) => (
        <div key={pos} className="flex items-center gap-1">
          {v ? (
            <span className="rounded-[2px] bg-ink" style={{ width: `${w}px`, height: `${h}px` }} />
          ) : (
            <>
              <span
                className="rounded-[2px] bg-ink"
                style={{ width: `${(w - 8) / 2}px`, height: `${h}px` }}
              />
              <span style={{ width: "8px" }} />
              <span
                className="rounded-[2px] bg-ink"
                style={{ width: `${(w - 8) / 2}px`, height: `${h}px` }}
              />
            </>
          )}
          <span className="w-3 text-center text-[10px] leading-none">
            {set.has(pos) ? <span className="text-danger">●</span> : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 小型卦牌：卦名 + 卦画 */
function HexCard({
  title,
  bundle,
  moving,
  tone
}: {
  title: string;
  bundle: Bundle;
  moving?: number[];
  tone?: "accent" | "quiet";
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-md px-3 py-2.5 ${
        tone === "accent" ? "bg-accent/[0.06]" : "bg-gray1"
      }`}
    >
      <HexagramGlyph lines={bundle.lines} moving={moving} size="sm" />
      <div className="min-w-0">
        <div className="eyebrow">{title}</div>
        <div className="mt-0.5 truncate text-[14px] font-semibold tracking-tightest text-ink">
          {bundle.name}
        </div>
        <div className="num mt-0.5 text-micro text-ink-3">
          {bundle.upperSymbol}
          {bundle.upperName} / {bundle.lowerSymbol}
          {bundle.lowerName}
        </div>
      </div>
    </div>
  );
}

/* ---------------- 页面 ---------------- */

export default function MeiHua() {
  const [mode, setMode] = useState<ModeKey>("time");
  const [datetime, setDatetime] = useState(nowLocal());
  const [question, setQuestion] = useState("");
  const [nums, setNums] = useState({ num1: 3, num2: 7, num3: 5 });
  const [result, setResult] = useState<MeihuaResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const payload = useMemo(() => {
    const base: Record<string, unknown> = { mode, question };
    if (mode === "time") base.datetime = datetime.replace("T", " ");
    if (mode === "numbers") {
      base.num1 = nums.num1;
      base.num2 = nums.num2;
    }
    if (mode === "baoshu") {
      base.num1 = nums.num1;
      base.num2 = nums.num2;
      base.num3 = nums.num3;
    }
    return base;
  }, [mode, question, datetime, nums]);

  async function qiGua(): Promise<void> {
    setError("");
    setLoading(true);
    try {
      setResult(await ipc<MeihuaResult>("divination:meihua", payload));
    } catch (e) {
      setError(String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const r = result;

  return (
    <div className="page">
      <PageHead
        title="梅花易数"
        desc="时间、数字、报数三法起卦；给出本卦、互卦、变卦、错卦、综卦，按「动爻所在之卦为用、另一卦为体」定体用生克断吉凶。"
      />

      {/* ---------- 起卦 ---------- */}
      <section className="card card-p">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">起卦方式</label>
            <div className="seg">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  className={`seg-item ${mode === m.key ? "seg-item-active" : ""}`}
                  onClick={() => setMode(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {mode === "time" ? (
            <div>
              <label className="label">起卦时刻</label>
              <input
                type="datetime-local"
                className="input num w-[196px]"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value || nowLocal())}
              />
            </div>
          ) : (
            <>
              <div className="w-24">
                <label className="label">{mode === "baoshu" ? "数一（上卦）" : "数一"}</label>
                <input
                  type="number"
                  min={1}
                  className="input num"
                  value={nums.num1}
                  onChange={(e) => setNums({ ...nums, num1: +e.target.value })}
                />
              </div>
              <div className="w-24">
                <label className="label">{mode === "baoshu" ? "数二（下卦）" : "数二"}</label>
                <input
                  type="number"
                  min={1}
                  className="input num"
                  value={nums.num2}
                  onChange={(e) => setNums({ ...nums, num2: +e.target.value })}
                />
              </div>
              {mode === "baoshu" && (
                <div className="w-24">
                  <label className="label">数三（动爻）</label>
                  <input
                    type="number"
                    min={1}
                    className="input num"
                    value={nums.num3}
                    onChange={(e) => setNums({ ...nums, num3: +e.target.value })}
                  />
                </div>
              )}
            </>
          )}

          <div className="min-w-[200px] flex-1">
            <label className="label">所问之事（可选）</label>
            <input
              className="input"
              placeholder="如：此次洽谈能否达成"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>

          <button className="btn btn-primary" onClick={() => void qiGua()} disabled={loading}>
            {loading ? "起卦中…" : "起卦"}
          </button>
        </div>

        {r?.lunar && (
          <div className="notice notice-quiet mt-4 num">
            起卦历法：{r.lunar.yearZhi}年 {r.lunar.lunarMonthCn}月{r.lunar.lunarDayCn}日{" "}
            {r.lunar.hourZhi}时　→　年支序 {r.lunar.yearZhiIndex} + 月 {r.lunar.lunarMonth} + 日{" "}
            {r.lunar.lunarDay} = {r.lunar.base}，加时辰序 {r.lunar.hourIndex} 得 {r.lunar.total}
          </div>
        )}

        {error && <div className="notice notice-danger mt-4">{error}</div>}
      </section>

      {/* ---------- 卦象 ---------- */}
      {r && (
        <section className="card card-p">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="eyebrow">本卦</div>
                <div className="mt-3">
                  <HexagramGlyph lines={r.original.lines} moving={r.movingLines} />
                </div>
                <div className="mt-3 text-[18px] font-semibold leading-none tracking-tightest">
                  {r.original.name}
                </div>
                <div className="mt-1.5 flex items-center justify-center gap-1.5">
                  <span className="chip chip-accent">动爻 第 {r.movingLine} 爻</span>
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="chip chip-neutral">{r.modeName}</span>
                  <span className={`chip ${FORTUNE_CLS[r.relation.fortune] ?? "chip-neutral"}`}>
                    体用{r.relation.kind}（{r.relation.fortune}）
                  </span>
                  <span className="chip chip-neutral">
                    体 {r.body.symbol}
                    {r.body.name}（{r.body.wuxing}）
                  </span>
                  <span className="chip chip-neutral">
                    用 {r.use.symbol}
                    {r.use.name}（{r.use.wuxing}）
                  </span>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
                  {r.question}　·　用卦位于{r.usePart}
                </p>
                <p className="mt-3 max-w-lg rounded-lg bg-gray2 px-3.5 py-3 text-[13px] leading-relaxed text-ink">
                  {r.relation.text}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 border-t border-hair pt-5 sm:grid-cols-2">
            <HexCard title="互卦（事情中段）" bundle={r.mutual} />
            <HexCard title="变卦（事情结果）" bundle={r.changed} moving={r.movingLines} />
            <HexCard title="错卦（对面视角）" bundle={r.opposite} tone="quiet" />
            <HexCard title="综卦（反向视角）" bundle={r.reversed} tone="quiet" />
          </div>

          <div className="mt-4 rounded-md bg-gray1 px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="eyebrow">变卦体用</span>
              <span className={`chip ${FORTUNE_CLS[r.changedRelation.fortune] ?? "chip-neutral"}`}>
                {r.changedRelation.kind}（{r.changedRelation.fortune}）
              </span>
              <span className="chip chip-neutral num">
                用位变为 {r.changedUse.symbol}
                {r.changedUse.name}（{r.changedUse.wuxing}）
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{r.changedRelation.text}</p>
          </div>
        </section>
      )}

      {/* ---------- 逐爻 ---------- */}
      {r && (
        <section className="card card-p">
          <h2 className="title">逐爻明细</h2>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[...r.yaos].reverse().map((y) => (
              <div
                key={y.position}
                className={`rounded-md px-3 py-2.5 text-center ${
                  y.changing ? "bg-danger/[0.07] ring-1 ring-danger/25" : "bg-gray1"
                }`}
              >
                <div className="num text-micro text-ink-3">
                  第 {y.position} 爻 · {y.position <= 3 ? "内" : "外"}
                </div>
                <div className="num mt-1 text-[14px] font-semibold text-ink">{y.title}</div>
                <div className="mt-0.5 text-micro text-ink-3">
                  {y.yang ? "阳" : "阴"}
                  {y.changing ? " · 动" : ""}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 sub">
            内卦（初二三）为{TRIGRAM_NAMES[r.original.lower]}，外卦（四五六）为
            {TRIGRAM_NAMES[r.original.upper]}；动爻所在之卦为「用」，另一卦为「体」。
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
            <p className="mt-3 sub">当前规则库没有命中的条目，可在「设置 · 规则库」中查看或扩充梅花规则。</p>
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
