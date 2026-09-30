import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import PageHead from "../components/PageHead";
import { IconChevron } from "../components/icons";

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

  return (
    <div className="page">
      <PageHead title="历法转换" desc="公历 ↔ 农历 · 干支纪法 · 节气 · 真太阳时校正。" />

      <section className="card card-p">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <div>
            <label className="label">年</label>
            <input
              type="number"
              className="input num"
              placeholder="年"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: +e.target.value })}
            />
          </div>
          <div>
            <label className="label">月</label>
            <input
              type="number"
              min={1}
              max={12}
              className="input num"
              value={form.month}
              onChange={(e) => setForm({ ...form, month: +e.target.value })}
            />
          </div>
          <div>
            <label className="label">日</label>
            <input
              type="number"
              min={1}
              max={31}
              className="input num"
              value={form.day}
              onChange={(e) => setForm({ ...form, day: +e.target.value })}
            />
          </div>
          <div>
            <label className="label">时</label>
            <input
              type="number"
              min={0}
              max={23}
              className="input num"
              value={form.hour}
              onChange={(e) => setForm({ ...form, hour: +e.target.value })}
            />
          </div>
          <div>
            <label className="label">分</label>
            <input
              type="number"
              min={0}
              max={59}
              className="input num"
              value={form.minute}
              onChange={(e) => setForm({ ...form, minute: +e.target.value })}
            />
          </div>
          <div>
            <label className="label">参考城市</label>
            <select
              className="select"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            >
              <option value="">不校正</option>
              {cities.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}（{c.longitude}°E）
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-danger">{error}</p>}

        <button className="btn btn-primary mt-4" onClick={() => void run()} disabled={loading}>
          {loading ? "换算中…" : "换算"}
        </button>
      </section>

      {cal && (
        <>
          <section className="card card-p">
            <h2 className="title">历法信息</h2>

            <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-0.5 sm:grid-cols-4">
              <Field label="公历" value={cal.solar} />
              <Field label="农历" value={cal.lunar} />
              <Field label="生肖" value={cal.shengXiao} />
              <Field label="星座" value={cal.xingZuo} />
              <Field label="年柱" value={cal.ganZhi.year} />
              <Field label="月柱" value={cal.ganZhi.month} />
              <Field label="日柱" value={cal.ganZhi.day} />
              <Field label="时柱" value={cal.ganZhi.time} />
              <Field label="时辰" value={`${cal.timeName}（第 ${cal.timeIndex} 支）`} span2 />
              <Field
                label="上一节气"
                value={cal.jieQi.prev ? `${cal.jieQi.prev.name}　${cal.jieQi.prev.date}` : "—"}
              />
              <Field
                label="下一节气"
                value={cal.jieQi.next ? `${cal.jieQi.next.name}　${cal.jieQi.next.date}` : "—"}
              />
            </div>

            {cal.lunarFull && (
              <p className="mt-4 rounded-lg bg-gray2 px-3 py-2.5 text-xs leading-relaxed text-ink-2">
                {cal.lunarFull}
              </p>
            )}

            {Object.keys(cal.jieQi.table).length > 0 && (
              <div className="mt-5">
                <button
                  className="btn btn-sm btn-quiet inline-flex"
                  onClick={() => setShowTable((v) => !v)}
                >
                  <IconChevron
                    className={`transition-transform duration-200 ${showTable ? "rotate-90" : ""}`}
                  />
                  {showTable ? "收起" : "展开"}全年节气表（{Object.keys(cal.jieQi.table).length} 个）
                </button>
                {showTable && (
                  <div className="mt-3 grid max-h-64 grid-cols-2 gap-x-8 gap-y-0.5 overflow-y-auto rounded-lg bg-gray2 p-4 sm:grid-cols-4">
                    {Object.entries(cal.jieQi.table).map(([name, date]) => (
                      <div key={name} className="flex items-baseline justify-between gap-3 py-0.5">
                        <span className="text-xs text-ink-3">{name}</span>
                        <span className="num text-xs text-ink">{date.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {trueSolar && (
            <section className="card card-p">
              <h2 className="title">真太阳时校正</h2>
              <p className="mt-1 sub">
                钟表时间按出生地经度差与均时差修正后，得到排盘所用的真太阳时。
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-4">
                <div className="rounded-xl bg-gray2 px-5 py-3 text-center">
                  <div className="eyebrow">钟表时间</div>
                  <div className="num mt-1.5 text-lg font-medium">{trueSolar.clockTime}</div>
                </div>

                <IconChevron className="text-ink-4" />

                <div className="rounded-xl bg-accent/[0.09] px-5 py-3 text-center">
                  <div className="eyebrow text-accent">真太阳时</div>
                  <div className="num mt-1.5 text-lg font-medium text-accent">
                    {trueSolar.trueSolarTime}
                  </div>
                </div>

                <div className="ml-1 space-y-1">
                  <div className="text-[13px] text-ink-2">
                    校正合计{" "}
                    <span className="num font-semibold text-ink">
                      {trueSolar.totalOffsetMinutes > 0 ? "+" : ""}
                      {trueSolar.totalOffsetMinutes}
                    </span>{" "}
                    分钟
                  </div>
                  <div className="num text-xs text-ink-3">
                    {trueSolar.cityName ? `${trueSolar.cityName} ` : ""}
                    {trueSolar.longitude}°E · 经度差 {trueSolar.longitudeOffsetMinutes} 分 · 均时差{" "}
                    {trueSolar.equationOfTimeMinutes} 分
                  </div>
                  {trueSolar.dayShift !== 0 && (
                    <div className="chip chip-warn">
                      日期偏移 {trueSolar.dayShift > 0 ? "+" : ""}
                      {trueSolar.dayShift} 天
                    </div>
                  )}
                </div>
              </div>

              <p className="mt-5 sub">
                校正后时辰：{trueSolar.timeName}（第 {trueSolar.timeIndex} 支）。{trueSolar.note}
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
    <div className={`${span2 ? "col-span-2" : ""} py-[5px]`}>
      <div className="text-micro text-ink-3">{label}</div>
      <div className="num mt-0.5 truncate text-[13px] text-ink" title={value}>
        {value}
      </div>
    </div>
  );
}
