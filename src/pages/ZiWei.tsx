import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import { chartToPngDataUrl } from "../lib/chartImage";
import PageHead from "../components/PageHead";
import { IconChevron, IconDownload } from "../components/icons";

const SHICHEN = [
  "早子时 00:00-01:00",
  "丑时 01:00-03:00",
  "寅时 03:00-05:00",
  "卯时 05:00-07:00",
  "辰时 07:00-09:00",
  "巳时 09:00-11:00",
  "午时 11:00-13:00",
  "未时 13:00-15:00",
  "申时 15:00-17:00",
  "酉时 17:00-19:00",
  "戌时 19:00-21:00",
  "亥时 21:00-23:00",
  "晚子时 23:00-24:00"
];

interface Star {
  name: string;
  type: string;
  brightness: string;
  mutagen: string;
}

interface Palace {
  index: number;
  name: string;
  heavenlyStem: string;
  earthlyBranch: string;
  isBodyPalace: boolean;
  isOriginalPalace: boolean;
  majorStars: Star[];
  minorStars: Star[];
  adjectiveStars: Array<{ name: string; type: string }>;
  changsheng12: string;
  decadalRange: number[];
  ages: number[];
}

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

interface ZiweiChart {
  solarDate: string;
  lunarDate: string;
  chineseDate: string;
  time: string;
  timeRange: string;
  sign: string;
  zodiac: string;
  earthlyBranchOfSoulPalace: string;
  earthlyBranchOfBodyPalace: string;
  soul: string;
  body: string;
  fiveElementsClass: string;
  palaces: Palace[];
  meta?: { birth: BirthMeta };
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

interface CityInfo {
  name: string;
  province: string;
  longitude: number;
}

const SCOPES = [
  { key: "decadal", label: "大限", tint: "border-warning/30 bg-warning/[0.06]", ink: "text-mark-warn" },
  { key: "yearly", label: "流年", tint: "border-accent/30 bg-accent/[0.06]", ink: "text-mark-info" },
  { key: "monthly", label: "流月", tint: "border-success/30 bg-success/[0.06]", ink: "text-mark-success" },
  { key: "daily", label: "流日", tint: "border-purple/30 bg-purple/[0.06]", ink: "text-mark-purple" },
  { key: "hourly", label: "流时", tint: "border-danger/30 bg-danger/[0.06]", ink: "text-mark-danger" }
] as const;

const today = new Date();

/** 十二宫传统方位：巳午未申 / 辰·酉 / 卯·戌 / 寅丑子亥，中宫为 2×2 */
const BRANCH_POS: Record<string, [number, number]> = {
  巳: [0, 0], 午: [0, 1], 未: [0, 2], 申: [0, 3],
  辰: [1, 0], 酉: [1, 3],
  卯: [2, 0], 戌: [2, 3],
  寅: [3, 0], 丑: [3, 1], 子: [3, 2], 亥: [3, 3]
};

export default function ZiWei() {
  const [form, setForm] = useState({ gender: "男", year: 1990, month: 1, day: 1, timeIndex: 0 });
  const [target, setTarget] = useState({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate()
  });
  const [useTrueSolar, setUseTrueSolar] = useState(false);
  const [city, setCity] = useState("孝感");
  const [cities, setCities] = useState<CityInfo[]>([]);
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const [horoscope, setHoroscope] = useState<ZiweiHoroscope | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"square" | "list">("square");
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState("");

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

  /** 统一的排盘入参（含真太阳时设置） */
  function payload() {
    return {
      ...form,
      city: useTrueSolar ? city : undefined,
      useTrueSolar
    };
  }

  async function paiPan() {
    setError("");
    setChart(null);
    setHoroscope(null);
    setExportMsg("");
    setLoading(true);
    try {
      const c = await ipc<ZiweiChart>("chart:ziwei", payload());
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
        ...payload(),
        targetYear: target.year,
        targetMonth: target.month,
        targetDay: target.day
      });
      setHoroscope(h);
    } catch (e) {
      setError(String(e));
    }
  }

  async function exportImage() {
    if (!chart) return;
    setExporting(true);
    setExportMsg("");
    try {
      const dataUrl = chartToPngDataUrl(chart, 2);
      const res = await ipc<{ saved: boolean; path: string }>("export:image", {
        dataUrl,
        fileName: `紫微命盘-${chart.solarDate}`
      });
      setExportMsg(`已保存：${res.path}`);
    } catch (e) {
      setExportMsg(`导出失败：${String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  const birth = chart?.meta?.birth;

  return (
    <div className="page">
      <PageHead title="紫微斗数排盘" desc="十二宫安星、四化飞星，以及大限 / 流年 / 流月 / 流日 / 流时运限。" />

      {/* ---------- 排盘表单 ---------- */}
      <section className="card card-p">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
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
              min={1900}
              max={2100}
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
            <label className="label">时辰</label>
            <select
              className="select"
              value={form.timeIndex}
              onChange={(e) => setForm({ ...form, timeIndex: +e.target.value })}
            >
              {SHICHEN.map((s, i) => (
                <option key={i} value={i}>
                  {s}
                </option>
              ))}
            </select>
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

      {chart && (
        <>
          {/* ---------- 命盘概要 ---------- */}
          <section className="card card-p">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip chip-neutral">公历 {chart.solarDate}</span>
                  <span className="chip chip-neutral">农历 {chart.lunarDate}</span>
                  <span className="chip chip-neutral">{chart.chineseDate}</span>
                  <span className="chip chip-neutral">{chart.time} 时</span>
                  {chart.zodiac && <span className="chip chip-neutral">属{chart.zodiac}</span>}
                  {chart.sign && <span className="chip chip-neutral">{chart.sign}</span>}
                </div>
                <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-2">
                  <Meta label="命主" value={chart.soul} />
                  <Meta label="身主" value={chart.body} />
                  <Meta label="五行局" value={chart.fiveElementsClass} />
                  <Meta label="命宫地支" value={chart.earthlyBranchOfSoulPalace} />
                  <Meta label="身宫地支" value={chart.earthlyBranchOfBodyPalace} />
                </dl>
                {birth?.applied && birth.trueSolarTime && (
                  <div className="notice notice-warn mt-4 max-w-3xl">
                    真太阳时校正：<span className="num">{birth.clockTime}</span> →{" "}
                    <span className="num font-medium">{birth.trueSolarTime}</span>
                    {birth.cityName ? `（${birth.cityName} ${birth.longitude}°E）` : ""}，偏移{" "}
                    <span className="num">{birth.offsetMinutes}</span> 分钟，时柱按「
                    {birth.timeName}」计
                  </div>
                )}
              </div>

              <button
                className="btn btn-secondary shrink-0"
                onClick={() => void exportImage()}
                disabled={exporting}
              >
                <IconDownload />
                {exporting ? "导出中…" : "导出命盘图片"}
              </button>
            </div>

            {exportMsg && (
              <p
                className={`mt-3 break-all text-xs ${
                  exportMsg.startsWith("已保存") ? "text-success" : "text-danger"
                }`}
              >
                {exportMsg}
              </p>
            )}
          </section>

          {/* ---------- 十二宫 ---------- */}
          <section className="card card-p">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="title">十二宫</h2>
              <div className="seg">
                {(["square", "list"] as const).map((v) => (
                  <button
                    key={v}
                    className={`seg-item ${view === v ? "seg-item-active" : ""}`}
                    onClick={() => setView(v)}
                  >
                    {v === "square" ? "方格盘" : "列表"}
                  </button>
                ))}
              </div>
            </div>

            {view === "square" ? (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {chart.palaces.map((p) => {
                  const pos = BRANCH_POS[p.earthlyBranch] ?? [0, 0];
                  return (
                    <div
                      key={p.name}
                      className="min-h-[132px]"
                      style={{ gridRow: pos[0] + 1, gridColumn: pos[1] + 1 }}
                    >
                      <PalaceCard p={p} compact />
                    </div>
                  );
                })}

                <div
                  className="hidden rounded-xl border border-hair bg-gray2 px-4 py-5 sm:block"
                  style={{ gridRow: "2 / 4", gridColumn: "2 / 4" }}
                >
                  <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                    <div>
                      <div className="eyebrow">五行局</div>
                      <div className="mt-1 text-[19px] font-semibold tracking-tightest text-ink">
                        {chart.fiveElementsClass}
                      </div>
                    </div>
                    <div className="flex gap-7">
                      <div>
                        <div className="eyebrow">命主</div>
                        <div className="mt-0.5 text-[13px] font-medium text-ink">{chart.soul}</div>
                      </div>
                      <div>
                        <div className="eyebrow">身主</div>
                        <div className="mt-0.5 text-[13px] font-medium text-ink">{chart.body}</div>
                      </div>
                    </div>
                    <div className="space-y-0.5 text-micro leading-relaxed text-ink-3">
                      <div className="num">公历 {chart.solarDate}</div>
                      <div className="num">农历 {chart.lunarDate}</div>
                      <div className="num">{chart.chineseDate}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {chart.palaces.map((p) => (
                  <PalaceCard key={p.name} p={p} />
                ))}
              </div>
            )}
          </section>

          {/* ---------- 运限 ---------- */}
          <section className="card card-p">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="title">运限</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-3">目标日期</span>
                <input
                  type="number"
                  className="input num !h-7 !w-20 !px-2 text-xs"
                  value={target.year}
                  onChange={(e) => setTarget({ ...target, year: +e.target.value })}
                />
                <input
                  type="number"
                  className="input num !h-7 !w-14 !px-2 text-xs"
                  value={target.month}
                  onChange={(e) => setTarget({ ...target, month: +e.target.value })}
                />
                <input
                  type="number"
                  className="input num !h-7 !w-14 !px-2 text-xs"
                  value={target.day}
                  onChange={(e) => setTarget({ ...target, day: +e.target.value })}
                />
                <button className="btn btn-sm btn-secondary" onClick={() => void loadHoroscope()}>
                  更新
                </button>
              </div>
            </div>

            {horoscope && (
              <>
                <p className="mt-4 sub">
                  {horoscope.solarDate}（农历 {horoscope.lunarDate}）· 虚岁{" "}
                  <span className="num">{horoscope.nominalAge}</span>
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
                  {SCOPES.map(({ key, label, tint, ink }) => {
                    const s = horoscope[key as keyof ZiweiHoroscope] as HoroscopeScope;
                    return (
                      <div key={key} className={`rounded-xl border p-3.5 ${tint}`}>
                        <div className={`eyebrow ${ink}`}>{label}</div>
                        <div className="mt-1.5 text-[19px] font-semibold leading-none tracking-tightest text-ink">
                          {s.heavenlyStem}
                          {s.earthlyBranch}
                        </div>
                        <div className="mt-3 space-y-1 text-xs">
                          <div className="text-ink-2">
                            四化 <span className="text-ink">{s.mutagen.join(" ") || "—"}</span>
                          </div>
                          <div className="text-ink-2">
                            命宫 → <span className="font-medium text-ink">{s.landedPalace}宫</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <details className="group mt-5">
                  <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-3 transition-colors hover:text-ink">
                    <IconChevron className="transition-transform duration-200 group-open:rotate-90" />
                    大限一览（{horoscope.decadalList.length} 个）
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-5">
                    {horoscope.decadalList.map((d) => {
                      const active = d.index === horoscope.decadal.index;
                      return (
                        <div
                          key={d.index}
                          className={`rounded-lg border px-3 py-2 ${
                            active
                              ? "border-accent/35 bg-accent/[0.045]"
                              : "border-hair bg-gray2"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="num text-[13px] font-semibold text-ink">
                              {d.heavenlyStem}
                              {d.earthlyBranch}
                            </span>
                            {active && <span className="chip chip-accent">当前</span>}
                          </div>
                          <div className="num mt-0.5 text-micro text-ink-3">
                            {d.ageRange[0]}–{d.ageRange[1]} 岁
                          </div>
                          <div className="num text-micro text-ink-4">
                            {d.yearRange[0]}–{d.yearRange[1]}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </>
            )}
          </section>

          <p className="sub">
            {horoscope?.disclaimer ?? "本命盘仅供文化娱乐与自省参考，不构成任何专业建议。"}
          </p>
        </>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-micro text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-medium text-ink">{value}</dd>
    </div>
  );
}

/** 单宫卡片：方格盘用 compact，列表用常规尺寸 */
function PalaceCard({ p, compact }: { p: Palace; compact?: boolean }) {
  const isMing = p.name === "命宫";
  return (
    <div
      className={`flex h-full flex-col rounded-xl border ${
        compact ? "p-2.5" : "p-3.5"
      } ${
        p.isBodyPalace
          ? "border-accent/40 bg-accent/[0.055]"
          : isMing
            ? "border-accent/25 bg-accent/[0.025]"
            : "border-hair bg-surface shadow-card"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`font-semibold text-ink ${compact ? "text-xs" : "text-[13px]"}`}>
          {p.name}宫
        </span>
        {p.isBodyPalace && <span className="chip chip-accent">身宫</span>}
      </div>

      <div className="num mt-0.5 flex items-baseline justify-between gap-2 text-micro text-ink-3">
        <span>
          {p.heavenlyStem}
          {p.earthlyBranch}
        </span>
        <span title="长生十二神">{p.changsheng12}</span>
      </div>

      <div className={compact ? "mt-1.5 space-y-px" : "mt-2.5 space-y-0.5"}>
        {p.majorStars.map((s) => (
          <div
            key={s.name}
            className={`leading-snug text-ink ${compact ? "text-xs" : "text-[13px]"}`}
          >
            {s.name}
            {s.brightness && <span className="ml-1 text-micro text-ink-3">{s.brightness}</span>}
            {s.mutagen && (
              <span className="ml-1 text-micro font-medium text-danger">[{s.mutagen}]</span>
            )}
          </div>
        ))}

        {p.minorStars.length > 0 && (
          <div className="pt-0.5 text-micro leading-relaxed text-ink-3">
            {p.minorStars
              .map((s) => `${s.name}${s.mutagen ? `[${s.mutagen}]` : ""}`)
              .join(" · ")}
          </div>
        )}

        {p.adjectiveStars.length > 0 && (
          <div
            className={`pt-0.5 text-micro leading-relaxed text-ink-4 ${
              compact ? "line-clamp-2" : ""
            }`}
          >
            {p.adjectiveStars.map((s) => s.name).join(" ")}
          </div>
        )}
      </div>

      {!compact && p.decadalRange.length === 2 && (
        <div className="num mt-auto pt-2.5 text-micro text-ink-4">
          大限 {p.decadalRange[0]}–{p.decadalRange[1]} 岁
        </div>
      )}
    </div>
  );
}
