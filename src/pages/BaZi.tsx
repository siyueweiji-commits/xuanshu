import { useEffect, useMemo, useState } from "react";
import { ipc } from "../lib/ipc";
import PageHead from "../components/PageHead";
import { IconChevron } from "../components/icons";

/* ---------------- 类型 ---------------- */

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

interface Pillar {
  key: "year" | "month" | "day" | "time";
  label: string;
  ganzhi: string;
  gan: string;
  zhi: string;
  ganWuXing: string;
  zhiWuXing: string;
  ganShiShen: string;
  zhiHideGan: string[];
  zhiShiShen: string[];
  naYin: string;
  diShi: string;
  xunKong: string;
}

interface WuXingStat {
  element: string;
  score: number;
  percent: number;
  ganCount: number;
  zhiScore: number;
  sameKind: boolean;
  missing: boolean;
}

interface ShenShaItem {
  name: string;
  kind: "吉" | "凶" | "中性";
  basis: string;
  positions: string[];
  desc: string;
  hit: boolean;
}

interface LiuNianItem {
  year: number;
  age: number;
  ganZhi: string;
  ganShiShen: string;
  xunKong: string;
  liuYue?: Array<{ month: string; ganZhi: string; ganShiShen: string }>;
}

interface DaYunItem {
  index: number;
  ganZhi: string;
  startAge: number;
  endAge: number;
  startYear: number;
  endYear: number;
  xunKong: string;
  ganShiShen: string;
  liuNian: LiuNianItem[];
}

interface BaziResult {
  solar: string;
  lunar: string;
  yearInGanZhi: string;
  yearShengXiao: string;
  pillars: Pillar[];
  dayMaster: string;
  dayMasterWuXing: string;
  dayMasterYinYang: string;
  taiYuan: string;
  taiYuanNaYin: string;
  mingGong: string;
  mingGongNaYin: string;
  shenGong: string;
  shenGongNaYin: string;
  taiXi: string;
  taiXiNaYin: string;
  wuXing: {
    stats: WuXingStat[];
    sameScore: number;
    otherScore: number;
    ratio: number;
    level: string;
    deLing: boolean;
    deDi: boolean;
    deShi: boolean;
    summary: string;
    missing: string[];
    favorable: string[];
    unfavorable: string[];
  };
  shiShenCount: Array<{ name: string; count: number; kind: string }>;
  shenSha: ShenShaItem[];
  yun: { startAgeText: string; startSolar: string; direction: string; forward: boolean };
  daYun: DaYunItem[];
  focusYear: number;
  disclaimer: string;
  meta?: { birth: BirthMeta };
}

interface CityInfo {
  name: string;
  province: string;
  longitude: number;
}

/* ---------------- 五行取色 ---------------- */

const EL_FG: Record<string, string> = {
  木: "text-elm-mu",
  火: "text-elm-huo",
  土: "text-elm-tu",
  金: "text-elm-jin",
  水: "text-elm-shui"
};
const EL_BG: Record<string, string> = {
  木: "bg-elm-mu",
  火: "bg-elm-huo",
  土: "bg-elm-tu",
  金: "bg-elm-jin",
  水: "bg-elm-shui"
};
const EL_SOFT: Record<string, string> = {
  木: "bg-elm-mu/10",
  火: "bg-elm-huo/10",
  土: "bg-elm-tu/10",
  金: "bg-elm-jin/10",
  水: "bg-elm-shui/10"
};

const KIND_CHIP: Record<string, string> = {
  吉: "chip-success",
  凶: "chip-danger",
  中性: "chip-neutral"
};

const THIS_YEAR = new Date().getFullYear();

export default function BaZi() {
  const [form, setForm] = useState({
    gender: "男",
    year: 1990,
    month: 1,
    day: 1,
    hour: 12,
    minute: 0
  });
  const [useTrueSolar, setUseTrueSolar] = useState(false);
  const [city, setCity] = useState("孝感");
  const [cities, setCities] = useState<CityInfo[]>([]);
  const [result, setResult] = useState<BaziResult | null>(null);
  const [focusYear, setFocusYear] = useState(THIS_YEAR);
  const [activeDaYun, setActiveDaYun] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void ipc<CityInfo[]>("calendar:cities")
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  // 起局默认（M10）：读取设置页保存的真太阳时 / 默认城市作为初始值
  useEffect(() => {
    void ipc<{ useTrueSolar?: boolean; defaultCity?: string }>("app:prefs")
      .then((p) => {
        if (p?.useTrueSolar) setUseTrueSolar(true);
        if (p?.defaultCity) setCity(p.defaultCity);
      })
      .catch(() => {});
  }, []);

  async function paiPan(year = focusYear) {
    setError("");
    setLoading(true);
    try {
      const r = await ipc<BaziResult>("chart:bazi", {
        ...form,
        city: useTrueSolar ? city : undefined,
        useTrueSolar,
        focusYear: year
      });
      setResult(r);
      setActiveDaYun(r.daYun.find((d) => d.startYear <= year && d.endYear >= year)?.index ?? null);
    } catch (e) {
      setError(String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const birth = result?.meta?.birth;
  const activeYun = useMemo(
    () => result?.daYun.find((d) => d.index === activeDaYun) ?? null,
    [result, activeDaYun]
  );
  const activeLiuNian = activeYun?.liuNian.find((n) => n.year === focusYear) ?? null;
  const shenShaHits = result?.shenSha.filter((s) => s.hit) ?? [];

  return (
    <div className="page">
      <PageHead
        title="八字排盘"
        desc="四柱干支、十神藏干、五行旺衰与喜忌、大运流年流月、神煞。"
      />

      {/* ---------- 排盘表单 ---------- */}
      <section className="card card-p">
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
          <div>
            <label className="label">年</label>
            <input
              type="number"
              className="input num"
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
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-hair pt-4">
          <label className="flex cursor-pointer items-center gap-2 pb-2 text-[13px] text-ink">
            <input
              type="checkbox"
              className="check"
              checked={useTrueSolar}
              onChange={(e) => setUseTrueSolar(e.target.checked)}
            />
            启用真太阳时校正
          </label>
          <div className="w-56">
            <select
              className="select"
              value={city}
              disabled={!useTrueSolar}
              onChange={(e) => setCity(e.target.value)}
            >
              {cities.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}（{c.longitude}°E）
                </option>
              ))}
            </select>
          </div>
          <span className="pb-2 text-xs text-ink-4">按出生地经度 + 均时差校正时柱（可能跨日）</span>
        </div>

        {error && <p className="mt-3 text-xs text-danger">{error}</p>}

        <button className="btn btn-primary mt-4" onClick={() => void paiPan()} disabled={loading}>
          {loading ? "排盘中…" : "排盘"}
        </button>
      </section>

      {result && (
        <>
          {/* ---------- 性别/时间概要 ---------- */}
          <section className="card card-p">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip chip-neutral">公历 {result.solar}</span>
              <span className="chip chip-neutral">农历 {result.lunar}</span>
              <span className="chip chip-neutral">
                {result.yearInGanZhi}年 · 属{result.yearShengXiao}
              </span>
              <span className="chip chip-accent">
                {result.dayMasterYinYang}
                {result.dayMasterWuXing}日主 · {result.dayMaster}
              </span>
            </div>

            <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-2">
              <Meta label="胎元" value={`${result.taiYuan}（${result.taiYuanNaYin}）`} />
              <Meta label="命宫" value={`${result.mingGong}（${result.mingGongNaYin}）`} />
              <Meta label="身宫" value={`${result.shenGong}（${result.shenGongNaYin}）`} />
              <Meta label="胎息" value={`${result.taiXi}（${result.taiXiNaYin}）`} />
            </dl>

            {birth?.applied && birth.trueSolarTime && (
              <div className="notice notice-warn mt-4">
                真太阳时校正：<span className="num">{birth.clockTime}</span> →{" "}
                <span className="num font-medium">{birth.trueSolarTime}</span>
                {birth.cityName ? `（${birth.cityName} ${birth.longitude}°E）` : ""}，偏移{" "}
                <span className="num">{birth.offsetMinutes}</span> 分钟
              </div>
            )}
          </section>

          {/* ---------- 四柱 ---------- */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {result.pillars.map((p) => (
              <div
                key={p.key}
                className={`rounded-xl border p-4 ${
                  p.key === "day" ? "border-accent/35 bg-accent/[0.03]" : "border-hair bg-surface shadow-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="eyebrow">{p.label}</span>
                  {p.key === "day" && <span className="chip chip-accent">日主</span>}
                </div>

                <div className="mt-3 flex items-center justify-center gap-2">
                  <BigChar char={p.gan} wx={p.ganWuXing} />
                  <BigChar char={p.zhi} wx={p.zhiWuXing} />
                </div>

                <div className="mt-3 space-y-1">
                  <MiniKV k="天干十神" v={p.ganShiShen} />
                  <div className="pt-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="shrink-0 text-micro text-ink-3">藏干</span>
                      <span className="num text-right text-xs text-ink">
                        {p.zhiHideGan.join(" ") || "—"}
                      </span>
                    </div>
                    <div className="num mt-px text-right text-micro text-ink-4">
                      {p.zhiShiShen.join(" ")}
                    </div>
                  </div>
                  <MiniKV k="纳音" v={p.naYin} />
                  <MiniKV k="地势" v={p.diShi} />
                  <MiniKV k="空亡" v={p.xunKong} />
                </div>
              </div>
            ))}
          </section>

          {/* ---------- 五行力量 + 日主强弱 ---------- */}
          <section className="grid gap-3 lg:grid-cols-5">
            <div className="card card-p lg:col-span-3">
              <div className="flex items-center justify-between">
                <h2 className="title">五行力量</h2>
                <span className="sub">天干 1.0 / 地支年时 1.0·月 1.6·日 1.2，藏干按本中余气分摊</span>
              </div>

              <div className="mt-5 space-y-2.5">
                {result.wuXing.stats.map((s) => (
                  <div key={s.element} className="flex items-center gap-3">
                    <span className={`w-4 text-center text-[13px] font-semibold ${EL_FG[s.element]}`}>
                      {s.element}
                    </span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray3">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${EL_BG[s.element]}`}
                        style={{ width: `${Math.max(s.percent, 1.2)}%` }}
                      />
                    </div>
                    <span className="num w-24 shrink-0 text-right text-xs text-ink-3">
                      {s.score} · {s.percent}%
                    </span>
                    <span className="w-16 shrink-0 text-right">
                      {s.missing ? (
                        <span className="chip chip-danger">缺</span>
                      ) : s.sameKind ? (
                        <span className="chip chip-accent">同党</span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-5 border-t border-hair pt-4">
                <div className="flex items-center justify-between text-xs text-ink-3">
                  <span>
                    同党（比劫+印）
                    <span className="num ml-1.5 text-[13px] font-semibold text-ink">
                      {result.wuXing.sameScore}
                    </span>
                  </span>
                  <span>
                    异党（食伤+财+官杀）
                    <span className="num ml-1.5 text-[13px] font-semibold text-ink">
                      {result.wuXing.otherScore}
                    </span>
                  </span>
                </div>
                <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-gray3">
                  <div
                    className="h-full bg-accent transition-all duration-500"
                    style={{ width: `${result.wuXing.ratio * 100}%` }}
                  />
                </div>
                <div className="num mt-1.5 text-right text-xs text-ink-3">
                  同党占比 {(result.wuXing.ratio * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="card card-p lg:col-span-2">
              <h2 className="title">日主旺衰与喜忌</h2>

              <div className="mt-4 flex items-baseline gap-3">
                <span className="text-[30px] font-semibold leading-none tracking-tightest text-ink">
                  {result.wuXing.level}
                </span>
                <span className="sub">简化扶抑模型</span>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <Tone on={result.wuXing.deLing} label="得令" hint="月令" />
                <Tone on={result.wuXing.deDi} label="得地" hint="日支" />
                <Tone on={result.wuXing.deShi} label="得势" hint="月时干" />
              </div>

              <div className="mt-5 space-y-3 border-t border-hair pt-4">
                <div>
                  <div className="eyebrow">喜用五行</div>
                  <div className="mt-1.5 flex gap-1.5">
                    {result.wuXing.favorable.map((e) => (
                      <span
                        key={e}
                        className={`grid h-7 w-7 place-items-center rounded-lg text-[13px] font-semibold ${EL_FG[e]} ${EL_SOFT[e]}`}
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="eyebrow">忌神五行</div>
                  <div className="mt-1.5 flex gap-1.5">
                    {result.wuXing.unfavorable.map((e) => (
                      <span
                        key={e}
                        className="grid h-7 w-7 place-items-center rounded-lg bg-gray3 text-[13px] font-semibold text-ink-3"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <p className="notice notice-quiet mt-5">{result.wuXing.summary}</p>
            </div>
          </section>

          {/* ---------- 十神分布 ---------- */}
          <section className="card card-p">
            <h2 className="title">十神分布</h2>
            <p className="mt-1 sub">按四柱天干与地支藏干统计（不含日主本身）。</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {result.shiShenCount.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center gap-2 rounded-lg border border-hair bg-gray2 px-3 py-1.5"
                >
                  <span className="text-[13px] font-medium text-ink">{s.name}</span>
                  <span className="chip chip-neutral">{s.kind}</span>
                  <span className="num text-[13px] font-semibold text-ink-2">×{s.count}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ---------- 神煞 ---------- */}
          <section className="card card-p">
            <div className="flex items-center justify-between">
              <h2 className="title">神煞</h2>
              <span className="sub">
                共查 {result.shenSha.length} 项，命中 {shenShaHits.length} 项
              </span>
            </div>

            {shenShaHits.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-line px-4 py-7 text-center text-xs text-ink-4">
                本命未见常见神煞
              </div>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {shenShaHits.map((s) => (
                  <div key={s.name} className="rounded-lg border border-hair bg-gray2 px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-ink">{s.name}</span>
                      <span className={`chip ${KIND_CHIP[s.kind]}`}>{s.kind}</span>
                      <span className="ml-auto flex gap-1">
                        {s.positions.map((p) => (
                          <span key={p} className="chip chip-neutral">
                            {p}
                          </span>
                        ))}
                      </span>
                    </div>
                    <p className="mt-1.5 text-micro leading-relaxed text-ink-3">{s.desc}</p>
                  </div>
                ))}
              </div>
            )}

            <details className="group mt-4">
              <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-3 transition-colors hover:text-ink">
                <IconChevron className="transition-transform duration-200 group-open:rotate-90" />
                查看全部 {result.shenSha.length} 项查法
              </summary>
              <div className="mt-3 grid gap-x-8 gap-y-1 rounded-lg bg-gray2 p-4 sm:grid-cols-2">
                {result.shenSha.map((s) => (
                  <div key={s.name} className="flex items-baseline justify-between gap-3 py-0.5">
                    <span className={`shrink-0 text-xs ${s.hit ? "font-medium text-ink" : "text-ink-4"}`}>
                      {s.name}
                    </span>
                    <span className="num truncate text-right text-micro text-ink-3">{s.basis}</span>
                  </div>
                ))}
              </div>
            </details>
          </section>

          {/* ---------- 大运 ---------- */}
          <section className="card card-p">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="title">大运</h2>
              <div className="flex items-center gap-2">
                <span className="chip chip-neutral">{result.yun.direction}</span>
                <span className="sub">
                  出生后 {result.yun.startAgeText} 起运 · {result.yun.startSolar}
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-10">
              {result.daYun.map((d) => {
                const active = d.index === activeDaYun;
                return (
                  <button
                    key={d.index}
                    onClick={() => {
                      setActiveDaYun(d.index);
                      const first = d.liuNian[0]?.year;
                      if (first) {
                        setFocusYear(first);
                        void paiPan(first);
                      }
                    }}
                    className={`rounded-lg border px-2 py-2 text-left transition ${
                      active
                        ? "border-accent/40 bg-accent/[0.07]"
                        : "border-hair bg-gray2 hover:bg-gray3"
                    }`}
                  >
                    <div className="num text-[13px] font-semibold text-ink">{d.ganZhi}</div>
                    <div className="text-micro text-ink-3">{d.ganShiShen}</div>
                    <div className="num text-micro text-ink-4">
                      {d.startAge}–{d.endAge}岁
                    </div>
                  </button>
                );
              })}
            </div>

            {activeYun && (
              <div className="mt-5 border-t border-hair pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="title-sm">
                    {activeYun.ganZhi} 大运 · 流年
                    <span className="num ml-2 font-normal text-ink-3">
                      {activeYun.startYear}–{activeYun.endYear}
                    </span>
                  </h3>
                  <span className="sub">点击年份查看该年流月</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {activeYun.liuNian.map((n) => (
                    <button
                      key={n.year}
                      onClick={() => {
                        setFocusYear(n.year);
                        void paiPan(n.year);
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-left transition ${
                        n.year === focusYear
                          ? "border-accent/40 bg-accent/[0.07]"
                          : "border-hair bg-gray2 hover:bg-gray3"
                      }`}
                    >
                      <div className="num text-[13px] font-medium text-ink">
                        {n.year}
                        <span className="ml-1.5 text-micro text-ink-3">{n.ganZhi}</span>
                      </div>
                      <div className="text-micro text-ink-3">
                        {n.ganShiShen} · 虚岁 {n.age}
                      </div>
                    </button>
                  ))}
                </div>

                {activeLiuNian?.liuYue && activeLiuNian.liuYue.length > 0 && (
                  <div className="mt-5">
                    <h3 className="title-sm">
                      {activeLiuNian.year} 年流月
                      <span className="ml-2 text-micro font-normal text-ink-3">
                        流年 {activeLiuNian.ganZhi} · {activeLiuNian.ganShiShen}
                      </span>
                    </h3>
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                      {activeLiuNian.liuYue.map((m) => (
                        <div
                          key={m.month}
                          className="rounded-lg border border-hair bg-gray2 px-3 py-2"
                        >
                          <div className="text-micro text-ink-3">{m.month}</div>
                          <div className="num mt-0.5 text-[13px] font-semibold text-ink">
                            {m.ganZhi}
                          </div>
                          <div className="text-micro text-ink-4">{m.ganShiShen}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <p className="sub">{result.disclaimer}</p>
        </>
      )}
    </div>
  );
}

/* ---------------- 局部组件 ---------------- */

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-micro text-ink-3">{label}</dt>
      <dd className="num mt-0.5 text-[13px] font-medium text-ink">{value}</dd>
    </div>
  );
}

function BigChar({ char, wx }: { char: string; wx: string }) {
  return (
    <div
      className={`grid h-14 w-14 place-items-center rounded-xl text-[30px] font-semibold leading-none ${EL_FG[wx]} ${EL_SOFT[wx]}`}
      title={wx}
    >
      {char}
    </div>
  );
}

function MiniKV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-micro text-ink-3">{k}</span>
      <span className="num truncate text-right text-xs text-ink" title={v}>
        {v}
      </span>
    </div>
  );
}

function Tone({ on, label, hint }: { on: boolean; label: string; hint: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        on ? "bg-success/15 text-mark-success" : "bg-gray3 text-ink-3"
      }`}
    >
      {label}
      <span className="text-micro opacity-70">{hint}</span>
    </span>
  );
}
