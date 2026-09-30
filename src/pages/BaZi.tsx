import { useState } from "react";
import { ipc } from "../lib/ipc";

interface BaziResult {
  solar: string;
  lunar: string;
  fourPillars: Record<"year" | "month" | "day" | "time", { ganzhi: string }>;
  dayMaster: string;
  disclaimer: string;
}

const PILLAR_LABELS: Array<["year" | "month" | "day" | "time", string]> = [
  ["year", "年柱"],
  ["month", "月柱"],
  ["day", "日柱"],
  ["time", "时柱"]
];

export default function BaZi() {
  const [form, setForm] = useState({ gender: "男", year: 1990, month: 1, day: 1, hour: 12, minute: 0 });
  const [result, setResult] = useState<BaziResult | null>(null);
  const [error, setError] = useState("");

  async function paiPan() {
    setError("");
    setResult(null);
    try {
      setResult(await ipc<BaziResult>("chart:bazi", form));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">八字排盘</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <select className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="男">男</option>
            <option value="女">女</option>
          </select>
          <input type="number" className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" value={form.year}
            onChange={(e) => setForm({ ...form, year: +e.target.value })} placeholder="年" />
          <input type="number" min={1} max={12} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" value={form.month}
            onChange={(e) => setForm({ ...form, month: +e.target.value })} placeholder="月" />
          <input type="number" min={1} max={31} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" value={form.day}
            onChange={(e) => setForm({ ...form, day: +e.target.value })} placeholder="日" />
          <input type="number" min={0} max={23} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" value={form.hour}
            onChange={(e) => setForm({ ...form, hour: +e.target.value })} placeholder="时" />
          <input type="number" min={0} max={59} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" value={form.minute}
            onChange={(e) => setForm({ ...form, minute: +e.target.value })} placeholder="分" />
        </div>
        <button className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          onClick={() => void paiPan()}>
          排盘
        </button>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </section>

      {result && (
        <section className="space-y-4">
          <div className="rounded-2xl bg-white p-5 text-sm shadow-sm">
            <p>公历：{result.solar}｜农历：{result.lunar}</p>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {PILLAR_LABELS.map(([key, label]) => (
              <div key={key} className="rounded-xl border border-neutral-200 bg-white p-4 text-center shadow-sm">
                <div className="text-xs text-neutral-400">{label}</div>
                <div className="mt-2 text-2xl font-semibold tracking-widest">
                  {result.fourPillars[key].ganzhi}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-400">{result.disclaimer}</p>
        </section>
      )}
    </div>
  );
}
