import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";

interface BirthMeta {
  applied: boolean;
  clockTime: string | null;
  trueSolarTime: string | null;
  offsetMinutes: number | null;
  longitude: number | null;
  cityName: string | null;
  timeIndex: number;
  timeName: string;
}

interface BaziResult {
  solar: string;
  lunar: string;
  fourPillars: Record<"year" | "month" | "day" | "time", { ganzhi: string }>;
  dayMaster: string;
  disclaimer: string;
  meta?: { birth: BirthMeta };
}

interface CityInfo {
  name: string;
  province: string;
  longitude: number;
}

const PILLAR_LABELS: Array<["year" | "month" | "day" | "time", string]> = [
  ["year", "年柱"],
  ["month", "月柱"],
  ["day", "日柱"],
  ["time", "时柱"]
];

export default function BaZi() {
  const [form, setForm] = useState({ gender: "男", year: 1990, month: 1, day: 1, hour: 12, minute: 0 });
  const [useTrueSolar, setUseTrueSolar] = useState(false);
  const [city, setCity] = useState("孝感");
  const [cities, setCities] = useState<CityInfo[]>([]);
  const [result, setResult] = useState<BaziResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void ipc<CityInfo[]>("calendar:cities")
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  async function paiPan() {
    setError("");
    setResult(null);
    try {
      const r = await ipc<BaziResult>("chart:bazi", {
        ...form,
        city: useTrueSolar ? city : undefined,
        useTrueSolar
      });
      setResult(r);
    } catch (e) {
      setError(String(e));
    }
  }

  const inputCls = "rounded-lg border border-neutral-300 px-3 py-2 text-sm";
  const birth = result?.meta?.birth;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">八字排盘</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <select className={inputCls} value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="男">男</option>
            <option value="女">女</option>
          </select>
          <input type="number" className={inputCls} value={form.year}
            onChange={(e) => setForm({ ...form, year: +e.target.value })} placeholder="年" />
          <input type="number" min={1} max={12} className={inputCls} value={form.month}
            onChange={(e) => setForm({ ...form, month: +e.target.value })} placeholder="月" />
          <input type="number" min={1} max={31} className={inputCls} value={form.day}
            onChange={(e) => setForm({ ...form, day: +e.target.value })} placeholder="日" />
          <input type="number" min={0} max={23} className={inputCls} value={form.hour}
            onChange={(e) => setForm({ ...form, hour: +e.target.value })} placeholder="时" />
          <input type="number" min={0} max={59} className={inputCls} value={form.minute}
            onChange={(e) => setForm({ ...form, minute: +e.target.value })} placeholder="分" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-neutral-600">
            <input type="checkbox" checked={useTrueSolar}
              onChange={(e) => setUseTrueSolar(e.target.checked)} />
            启用真太阳时校正
          </label>
          <select className={`${inputCls} disabled:opacity-40`} value={city} disabled={!useTrueSolar}
            onChange={(e) => setCity(e.target.value)}>
            {cities.map((c) => (
              <option key={c.name} value={c.name}>{c.name}（{c.longitude}°E）</option>
            ))}
          </select>
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
            {birth?.applied && birth.trueSolarTime && (
              <p className="mt-2 text-xs text-amber-700">
                真太阳时校正：{birth.clockTime} → {birth.trueSolarTime}
                {birth.cityName ? `（${birth.cityName} ${birth.longitude}°E）` : ""}
                ，偏移 {birth.offsetMinutes} 分钟
              </p>
            )}
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
