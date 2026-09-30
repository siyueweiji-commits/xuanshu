import { useState } from "react";
import { ipc } from "../lib/ipc";

const SHICHEN = [
  "早子时 00:00-01:00", "丑时 01:00-03:00", "寅时 03:00-05:00", "卯时 05:00-07:00",
  "辰时 07:00-09:00", "巳时 09:00-11:00", "午时 11:00-13:00", "未时 13:00-15:00",
  "申时 15:00-17:00", "酉时 17:00-19:00", "戌时 19:00-21:00", "亥时 21:00-23:00",
  "晚子时 23:00-24:00"
];

interface Palace {
  name: string;
  heavenlyStem: string;
  earthlyBranch: string;
  isBodyPalace: boolean;
  majorStars: Array<{ name: string; brightness: string; mutagen: string }>;
  minorStars: Array<{ name: string }>;
}

interface ZiweiChart {
  solarDate: string;
  lunarDate: string;
  chineseDate: string;
  soul: string;
  body: string;
  fiveElementsClass: string;
  palaces: Palace[];
}

export default function ZiWei() {
  const [form, setForm] = useState({ gender: "男", year: 1990, month: 1, day: 1, timeIndex: 0 });
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const [error, setError] = useState("");

  async function paiPan() {
    setError("");
    setChart(null);
    try {
      setChart(await ipc<ZiweiChart>("chart:ziwei", form));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">紫微斗数排盘</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <select
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
          >
            <option value="男">男</option>
            <option value="女">女</option>
          </select>
          <input type="number" min={1900} max={2100} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            value={form.year} onChange={(e) => setForm({ ...form, year: +e.target.value })} placeholder="年" />
          <input type="number" min={1} max={12} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            value={form.month} onChange={(e) => setForm({ ...form, month: +e.target.value })} placeholder="月" />
          <input type="number" min={1} max={31} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            value={form.day} onChange={(e) => setForm({ ...form, day: +e.target.value })} placeholder="日" />
          <select className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            value={form.timeIndex} onChange={(e) => setForm({ ...form, timeIndex: +e.target.value })}>
            {SHICHEN.map((s, i) => (
              <option key={i} value={i}>{s}</option>
            ))}
          </select>
        </div>
        <button className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          onClick={() => void paiPan()}>
          排盘
        </button>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </section>

      {chart && (
        <section className="space-y-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm text-sm">
            <p>公历：{chart.solarDate}｜农历：{chart.lunarDate}｜干支：{chart.chineseDate}</p>
            <p className="mt-1">
              命主：{chart.soul}｜身主：{chart.body}｜五行局：{chart.fiveElementsClass}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {chart.palaces.map((p) => (
              <div key={p.name} className={`rounded-xl border p-3 text-sm shadow-sm ${p.isBodyPalace ? "border-amber-400 bg-amber-50" : "border-neutral-200 bg-white"}`}>
                <div className="font-semibold">
                  {p.name}宫
                  {p.isBodyPalace && <span className="ml-1 text-xs text-amber-600">身宫</span>}
                </div>
                <div className="text-xs text-neutral-400">{p.heavenlyStem}{p.earthlyBranch}</div>
                <div className="mt-2 space-y-0.5">
                  {p.majorStars.map((s) => (
                    <div key={s.name}>
                      {s.name}
                      {s.brightness && <span className="text-xs text-neutral-400"> {s.brightness}</span>}
                      {s.mutagen && <span className="text-xs text-red-500"> [{s.mutagen}]</span>}
                    </div>
                  ))}
                  {p.minorStars.length > 0 && (
                    <div className="text-xs text-neutral-400">{p.minorStars.map((s) => s.name).join(" ")}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-400">本命盘仅供文化娱乐与自省参考，不构成任何专业建议。</p>
        </section>
      )}
    </div>
  );
}
