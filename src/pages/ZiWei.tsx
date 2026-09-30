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

interface HoroscopeScope {
  index: number;
  name: string;
  heavenlyStem: string;
  earthlyBranch: string;
  mutagen: string[];
  landedPalace: string;
}

interface DecadalItem {
  index: number;
  palaceName: string;
  heavenlyStem: string;
  earthlyBranch: string;
  ageRange: number[];
  yearRange: number[];
  mutagen: string[];
}

interface ZiweiHoroscope {
  targetDate: string;
  solarDate: string;
  lunarDate: string;
  nominalAge: number;
  decadal: HoroscopeScope;
  yearly: HoroscopeScope;
  monthly: HoroscopeScope;
  daily: HoroscopeScope;
  hourly: HoroscopeScope;
  decadalList: DecadalItem[];
  disclaimer: string;
}

const SCOPES = [
  { key: "decadal", label: "大限", accent: "bg-amber-50 border-amber-200" },
  { key: "yearly", label: "流年", accent: "bg-sky-50 border-sky-200" },
  { key: "monthly", label: "流月", accent: "bg-emerald-50 border-emerald-200" },
  { key: "daily", label: "流日", accent: "bg-violet-50 border-violet-200" },
  { key: "hourly", label: "流时", accent: "bg-rose-50 border-rose-200" }
] as const;

const today = new Date();

export default function ZiWei() {
  const [form, setForm] = useState({ gender: "男", year: 1990, month: 1, day: 1, timeIndex: 0 });
  const [target, setTarget] = useState({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate()
  });
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const [horoscope, setHoroscope] = useState<ZiweiHoroscope | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function paiPan() {
    setError("");
    setChart(null);
    setHoroscope(null);
    setLoading(true);
    try {
      const c = await ipc<ZiweiChart>("chart:ziwei", form);
      setChart(c);
      await loadHoroscope();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadHoroscope() {
    try {
      const h = await ipc<ZiweiHoroscope>("chart:ziwei-horoscope", {
        ...form,
        targetYear: target.year,
        targetMonth: target.month,
        targetDay: target.day
      });
      setHoroscope(h);
    } catch (e) {
      setError(String(e));
    }
  }

  const inputCls = "rounded-lg border border-neutral-300 px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">紫微斗数排盘</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <select className={inputCls} value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="男">男</option>
            <option value="女">女</option>
          </select>
          <input type="number" min={1900} max={2100} className={inputCls} value={form.year}
            onChange={(e) => setForm({ ...form, year: +e.target.value })} placeholder="年" />
          <input type="number" min={1} max={12} className={inputCls} value={form.month}
            onChange={(e) => setForm({ ...form, month: +e.target.value })} placeholder="月" />
          <input type="number" min={1} max={31} className={inputCls} value={form.day}
            onChange={(e) => setForm({ ...form, day: +e.target.value })} placeholder="日" />
          <select className={inputCls} value={form.timeIndex}
            onChange={(e) => setForm({ ...form, timeIndex: +e.target.value })}>
            {SHICHEN.map((s, i) => (
              <option key={i} value={i}>{s}</option>
            ))}
          </select>
        </div>
        <button
          className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
          onClick={() => void paiPan()} disabled={loading}>
          {loading ? "排盘中…" : "排盘"}
        </button>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </section>

      {chart && (
        <section className="space-y-4">
          <div className="rounded-2xl bg-white p-5 text-sm shadow-sm">
            <p>公历：{chart.solarDate}｜农历：{chart.lunarDate}｜干支：{chart.chineseDate}</p>
            <p className="mt-1">
              命主：{chart.soul}｜身主：{chart.body}｜五行局：{chart.fiveElementsClass}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {chart.palaces.map((p) => (
              <div key={p.name}
                className={`rounded-xl border p-3 text-sm shadow-sm ${
                  p.isBodyPalace ? "border-amber-400 bg-amber-50" : "border-neutral-200 bg-white"
                }`}>
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
                    <div className="text-xs text-neutral-400">
                      {p.minorStars.map((s) => s.name).join(" ")}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 运限（M2） */}
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-neutral-500">运限</h3>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-neutral-400">目标日期</span>
                <input type="number" className="w-20 rounded border border-neutral-300 px-2 py-1"
                  value={target.year} onChange={(e) => setTarget({ ...target, year: +e.target.value })} />
                <input type="number" className="w-14 rounded border border-neutral-300 px-2 py-1"
                  value={target.month} onChange={(e) => setTarget({ ...target, month: +e.target.value })} />
                <input type="number" className="w-14 rounded border border-neutral-300 px-2 py-1"
                  value={target.day} onChange={(e) => setTarget({ ...target, day: +e.target.value })} />
                <button className="rounded bg-neutral-900 px-3 py-1 text-white hover:bg-neutral-700"
                  onClick={() => void loadHoroscope()}>
                  更新
                </button>
              </div>
            </div>

            {horoscope && (
              <>
                <p className="mb-3 text-xs text-neutral-400">
                  {horoscope.solarDate}（农历 {horoscope.lunarDate}）· 虚岁 {horoscope.nominalAge}
                </p>
                <div className="grid gap-3 sm:grid-cols-5">
                  {SCOPES.map(({ key, label, accent }) => {
                    const s = horoscope[key as keyof ZiweiHoroscope] as HoroscopeScope;
                    return (
                      <div key={key} className={`rounded-xl border p-3 text-sm ${accent}`}>
                        <div className="text-xs text-neutral-500">{label}</div>
                        <div className="mt-1 text-base font-semibold">
                          {s.heavenlyStem}{s.earthlyBranch}
                        </div>
                        <div className="mt-2 text-xs text-neutral-600">
                          四化：{s.mutagen.join(" ")}
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
                          命宫 → <span className="font-medium text-neutral-800">{s.landedPalace}宫</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <details className="mt-4">
                  <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-800">
                    大限一览（{horoscope.decadalList.length} 个）
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    {horoscope.decadalList.map((d) => (
                      <div key={d.index}
                        className={`rounded-lg border px-3 py-2 ${
                          d.index === horoscope.decadal.index
                            ? "border-amber-400 bg-amber-50"
                            : "border-neutral-200 bg-neutral-50"
                        }`}>
                        <div className="font-medium">{d.heavenlyStem}{d.earthlyBranch} 限</div>
                        <div className="text-neutral-500">{d.ageRange[0]}–{d.ageRange[1]} 岁</div>
                        <div className="text-neutral-400">{d.yearRange[0]}–{d.yearRange[1]}</div>
                      </div>
                    ))}
                  </div>
                </details>
              </>
            )}
          </div>

          <p className="text-xs text-neutral-400">
            {horoscope?.disclaimer ?? "本命盘仅供文化娱乐与自省参考，不构成任何专业建议。"}
          </p>
        </section>
      )}
    </div>
  );
}
