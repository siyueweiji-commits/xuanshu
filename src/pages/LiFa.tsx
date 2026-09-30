import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";

interface GanZhi {
  year: string;
  month: string;
  day: string;
  time: string;
}

interface CalendarResult {
  solar: string;
  lunar: string;
  lunarFull: string;
  ganZhi: GanZhi;
  shengXiao: string;
  xingZuo: string;
  timeIndex: number;
  timeName: string;
  jieQi: {
    prev: { name: string; date: string } | null;
    next: { name: string; date: string } | null;
    table: Record<string, string>;
  };
}

interface TrueSolarResult {
  cityName: string | null;
  longitude: number;
  longitudeOffsetMinutes: number;
  equationOfTimeMinutes: number;
  totalOffsetMinutes: number;
  clockTime: string;
  trueSolarTime: string;
  dayShift: number;
  timeIndex: number;
  timeName: string;
  note: string;
}

interface CityInfo {
  name: string;
  province: string;
  longitude: number;
}

const now = new Date();

export default function LiFa() {
  const [form, setForm] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    city: "孝感"
  });
  const [cities, setCities] = useState<CityInfo[]>([]);
  const [cal, setCal] = useState<CalendarResult | null>(null);
  const [trueSolar, setTrueSolar] = useState<TrueSolarResult | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void ipc<CityInfo[]>("calendar:cities")
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  async function run() {
    setLoading(true);
    setError("");
    try {
      const base = {
        year: form.year,
        month: form.month,
        day: form.day,
        hour: form.hour,
        minute: form.minute
      };
      const [c, t] = await Promise.all([
        ipc<CalendarResult>("calendar:convert", base),
        ipc<TrueSolarResult>("calendar:truesolar", { ...base, city: form.city })
      ]);
      setCal(c);
      setTrueSolar(t);
    } catch (e) {
      setError(String(e));
      setCal(null);
      setTrueSolar(null);
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "rounded-lg border border-neutral-300 px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold">历法转换</h2>
        <p className="mb-4 text-xs text-neutral-400">
          公历 ↔ 农历 · 干支纪法 · 节气 · 真太阳时校正
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <input type="number" className={inputCls} value={form.year} placeholder="年"
            onChange={(e) => setForm({ ...form, year: +e.target.value })} />
          <input type="number" min={1} max={12} className={inputCls} value={form.month} placeholder="月"
            onChange={(e) => setForm({ ...form, month: +e.target.value })} />
          <input type="number" min={1} max={31} className={inputCls} value={form.day} placeholder="日"
            onChange={(e) => setForm({ ...form, day: +e.target.value })} />
          <input type="number" min={0} max={23} className={inputCls} value={form.hour} placeholder="时"
            onChange={(e) => setForm({ ...form, hour: +e.target.value })} />
          <input type="number" min={0} max={59} className={inputCls} value={form.minute} placeholder="分"
            onChange={(e) => setForm({ ...form, minute: +e.target.value })} />
          <select className={inputCls} value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}>
            <option value="">不校正</option>
            {cities.map((c) => (
              <option key={c.name} value={c.name}>{c.name}（{c.longitude}°E）</option>
            ))}
          </select>
        </div>
        <button
          className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
          onClick={() => void run()} disabled={loading}>
          {loading ? "换算中…" : "换算"}
        </button>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </section>

      {cal && (
        <>
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-neutral-500">历法信息</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              <Field label="公历" value={cal.solar} />
              <Field label="农历" value={cal.lunar} />
              <Field label="生肖" value={cal.shengXiao} />
              <Field label="星座" value={cal.xingZuo} />
              <Field label="年柱" value={cal.ganZhi.year} />
              <Field label="月柱" value={cal.ganZhi.month} />
              <Field label="日柱" value={cal.ganZhi.day} />
              <Field label="时柱" value={cal.ganZhi.time} />
              <Field label="时辰" value={`${cal.timeName}（${cal.timeIndex}）`} />
              <Field label="生肖年" value={cal.ganZhi.year} />
              <Field label="上一节气" value={cal.jieQi.prev ? `${cal.jieQi.prev.name} ${cal.jieQi.prev.date}` : "—"} span2 />
              <Field label="下一节气" value={cal.jieQi.next ? `${cal.jieQi.next.name} ${cal.jieQi.next.date}` : "—"} span2 />
            </div>

            {Object.keys(cal.jieQi.table).length > 0 && (
              <div className="mt-5">
                <button className="text-xs text-neutral-500 underline hover:text-neutral-800"
                  onClick={() => setShowTable((v) => !v)}>
                  {showTable ? "收起" : "展开"}全年节气表（{Object.keys(cal.jieQi.table).length} 个）
                </button>
                {showTable && (
                  <div className="mt-3 grid max-h-64 grid-cols-2 gap-x-6 gap-y-1 overflow-y-auto rounded-lg bg-neutral-50 p-3 text-xs sm:grid-cols-4">
                    {Object.entries(cal.jieQi.table).map(([name, date]) => (
                      <div key={name} className="flex justify-between">
                        <span className="text-neutral-500">{name}</span>
                        <span className="text-neutral-700">{date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {trueSolar && (
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-neutral-500">真太阳时校正</h3>
              <div className="flex items-center gap-4 text-sm">
                <div className="rounded-xl bg-neutral-50 px-4 py-3 text-center">
                  <div className="text-xs text-neutral-400">钟表时间</div>
                  <div className="mt-1 font-mono text-base">{trueSolar.clockTime}</div>
                </div>
                <div className="text-2xl text-neutral-300">→</div>
                <div className="rounded-xl bg-neutral-900 px-4 py-3 text-center text-white">
                  <div className="text-xs text-neutral-400">真太阳时</div>
                  <div className="mt-1 font-mono text-base">{trueSolar.trueSolarTime}</div>
                </div>
                <div className="ml-2 text-sm">
                  <div className="text-neutral-500">
                    校正合计 <span className="font-semibold text-neutral-900">{trueSolar.totalOffsetMinutes}</span> 分钟
                  </div>
                  <div className="mt-1 text-xs text-neutral-400">
                    {trueSolar.cityName ? `${trueSolar.cityName} ` : ""}
                    {trueSolar.longitude}°E · 经度差 {trueSolar.longitudeOffsetMinutes} 分 · 均时差 {trueSolar.equationOfTimeMinutes} 分
                  </div>
                  {trueSolar.dayShift !== 0 && (
                    <div className="mt-1 text-xs text-amber-600">
                      日期偏移 {trueSolar.dayShift > 0 ? "+" : ""}{trueSolar.dayShift} 天
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-4 text-xs text-neutral-400">
                校正后时辰：{trueSolar.timeName}（index={trueSolar.timeIndex}）。{trueSolar.note}
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, value, span2 }: { label: string; value: string; span2?: boolean }) {
  return (
    <div className={span2 ? "col-span-2" : ""}>
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="mt-0.5 text-neutral-900">{value}</div>
    </div>
  );
}
