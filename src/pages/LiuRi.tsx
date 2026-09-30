import { useEffect, useMemo, useState } from "react";
import { ipc } from "../lib/ipc";
import PageHead from "../components/PageHead";
import { IconChevron, IconPin } from "../components/icons";

/* ---------------- 类型 ---------------- */

type AdviceLevel = "info" | "caution" | "warning";
type AdviceGroup = "事业" | "财运" | "人际" | "健康" | "出行";

interface AdviceItem {
  id: string;
  text: string;
  group: AdviceGroup;
  level: AdviceLevel;
  weight: number;
  system: string;
  source: string;
}

interface HuangliTime {
  index: number;
  label: string;
  zhi: string;
  ganZhi: string;
  tianShen: string;
  tianShenType: string;
  tianShenLuck: string;
  yi: string[];
  ji: string[];
  chongShengXiao: string;
  sha: string;
  naYin: string;
  minHm: string;
  maxHm: string;
  positionCai: string;
  positionXi: string;
  positionFu: string;
}

interface Huangli {
  date: string;
  dateCn: string;
  lunarDate: string;
  lunarDateCn: string;
  week: number;
  weekCn: string;
  xingZuo: string;
  yearInGanZhi: string;
  monthInGanZhi: string;
  dayInGanZhi: string;
  timeInGanZhi: string;
  shengXiao: string;
  dayShengXiao: string;
  season: string;
  jieQi: {
    today: string | null;
    prev: { name: string; date: string } | null;
    next: { name: string; date: string } | null;
  };
  yi: string[];
  ji: string[];
  jiShen: string[];
  xiongSha: string[];
  chong: { zhi: string; desc: string; gan: string; shengXiao: string; sha: string };
  pengZu: { gan: string; zhi: string };
  zhiXing: string;
  xiu: { name: string; luck: string; song: string };
  tianShen: { name: string; type: string; luck: string };
  liuYao: string;
  yueXiang: string;
  gong: string;
  shou: string;
  naYin: string;
  wuXing: string;
  dayLu: string;
  xunKong: string;
  nineStar: string;
  taiSui: string;
  positions: {
    xi: string;
    xiDesc: string;
    cai: string;
    caiDesc: string;
    fu: string;
    fuDesc: string;
    yangGui: string;
    yinGui: string;
  };
  festivals: string[];
  otherFestivals: string[];
  times: HuangliTime[];
  auspiciousHours: string[];
  luckyHourCount: number;
  disclaimer: string;
}

interface BaziFacts {
  dayMaster: string;
  dayMasterWuXing: string;
  season: string;
  level: string;
  favorable: string[];
  unfavorable: string[];
  missing: string[];
  summary: string;
}

interface ZiweiScope {
  index: number;
  name: string;
  heavenlyStem: string;
  earthlyBranch: string;
  mutagen: string[];
  landedPalace: string;
}

interface ZiweiDaily {
  targetDate: string;
  solarDate: string;
  lunarDate: string;
  nominalAge: number;
  decadal: ZiweiScope;
  yearly: ZiweiScope;
  monthly: ZiweiScope;
  daily: ZiweiScope;
  hourly: ZiweiScope;
  mutagenStars: { lu: string; quan: string; ke: string; ji: string };
  mutagenPalaces: { lu: string[]; quan: string[]; ke: string[]; ji: string[] };
  soulStars: string[];
  palaceStars: Record<string, string[]>;
  palaceDailyStars: Record<string, string[]>;
  palaceOriginName: Record<string, string>;
  palaceMutagen: Record<string, Array<{ star: string; mutagen: string }>>;
}

interface DailyResult {
  date: string;
  huangli: Huangli;
  bazi: BaziFacts | null;
  ziwei: ZiweiDaily | null;
  personal: { shengXiao: string; clashToday: boolean } | null;
  advice: AdviceItem[];
  groups: Record<AdviceGroup, AdviceItem[]>;
  disclaimer: string;
}

interface CityInfo {
  name: string;
  province: string;
  longitude: number;
}

/* ---------------- 常量 ---------------- */

const GROUPS: AdviceGroup[] = ["事业", "财运", "人际", "健康", "出行"];

const LEVEL_BAR: Record<AdviceLevel, string> = {
  info: "bg-accent",
  caution: "bg-warning",
  warning: "bg-danger"
};
const LEVEL_TEXT: Record<AdviceLevel, string> = {
  info: "text-accent",
  caution: "text-warning",
  warning: "text-danger"
};

/** 流日十二宫传统排序 */
const PALACE_ORDER = [
  "命宫",
  "兄弟",
  "夫妻",
  "子女",
  "财帛",
  "疾厄",
  "迁移",
  "仆役",
  "交友",
  "官禄",
  "田宅",
  "福德",
  "父母"
];

const EL_CLS: Record<string, string> = {
  木: "text-elm-mu",
  火: "text-elm-huo",
  土: "text-elm-tu",
  金: "text-elm-jin",
  水: "text-elm-shui"
};

/** 宫名补「宫」后缀（「命宫」已带则不加） */
function palaceLabel(name: string): string {
  return !name ? "—" : name.endsWith("宫") ? name : `${name}宫`;
}

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function shiftDate(s: string, delta: number): string {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/* ---------------- 页面 ---------------- */

export default function LiuRi() {
  const [date, setDate] = useState(todayStr());

  // 个人命盘（可选）
  const [withBirth, setWithBirth] = useState(false);
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

  const [result, setResult] = useState<DailyResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showXiuSong, setShowXiuSong] = useState(false);

  useEffect(() => {
    void ipc<CityInfo[]>("calendar:cities")
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  const [y, m, d] = date.split("-").map(Number);

  async function run(): Promise<void> {
    setError("");
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { year: y, month: m, day: d };
      if (withBirth) {
        payload.birth = {
          ...form,
          city: useTrueSolar ? city : undefined,
          useTrueSolar
        };
      }
      setResult(await ipc<DailyResult>("daily:fortune", payload));
    } catch (e) {
      setError(String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  // 首次进入自动查当天
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const h = result?.huangli;

  const palaceList = useMemo(() => {
    const zw = result?.ziwei;
    if (!zw) return [];
    return PALACE_ORDER.filter((p) => zw.palaceStars[p]).map((p) => ({
      name: p,
      stars: zw.palaceStars[p],
      dailyStars: zw.palaceDailyStars[p] ?? [],
      origin: zw.palaceOriginName[p] ?? "",
      mutagen: zw.palaceMutagen[p] ?? [],
      /** 流日十二宫中的「命宫」即流日命宫 */
      isSoul: p === "命宫"
    }));
  }, [result]);

  return (
    <div className="page">
      <PageHead
        title="流日 · 黄历"
        desc="当日干支宜忌、冲煞建除、二十八宿与逐时辰吉凶；叠加生辰可得八字与紫微流日的个性化提示。"
      />

      {/* ---------- 日期选择 ---------- */}
      <section className="card card-p">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">日期</label>
            <input
              type="date"
              className="input num w-[168px]"
              value={date}
              onChange={(e) => setDate(e.target.value || todayStr())}
            />
          </div>
          <div className="flex gap-1.5 pb-0.5">
            <button className="btn btn-sm btn-secondary" onClick={() => setDate(shiftDate(date, -1))}>
              前一天
            </button>
            <button className="btn btn-sm btn-secondary" onClick={() => setDate(todayStr())}>
              今天
            </button>
            <button className="btn btn-sm btn-secondary" onClick={() => setDate(shiftDate(date, 1))}>
              后一天
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2 pb-0.5">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                className="check"
                checked={withBirth}
                onChange={(e) => setWithBirth(e.target.checked)}
              />
              叠加个人命盘
            </label>
            <button className="btn btn-primary" onClick={() => void run()} disabled={loading}>
              {loading ? "查询中…" : "查询"}
            </button>
          </div>
        </div>

        {withBirth && (
          <div className="mt-5 border-t border-hair pt-4">
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
              {(["year", "month", "day", "hour", "minute"] as const).map((k) => (
                <div key={k}>
                  <label className="label">
                    {{ year: "年", month: "月", day: "日", hour: "时", minute: "分" }[k]}
                  </label>
                  <input
                    type="number"
                    className="input num"
                    value={form[k]}
                    onChange={(e) => setForm({ ...form, [k]: +e.target.value })}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
                <input
                  type="checkbox"
                  className="check"
                  checked={useTrueSolar}
                  onChange={(e) => setUseTrueSolar(e.target.checked)}
                />
                启用真太阳时校正
              </label>
              <div className="w-52">
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
              <span className="text-xs text-ink-4">按出生地经度 + 均时差校正时柱</span>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      </section>

      {h && result && (
        <>
          {/* ---------- 日期概览 ---------- */}
          <section className="card card-p">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="flex items-end gap-3">
                  <div className="text-[30px] font-semibold leading-none tracking-tightest text-ink">
                    {h.lunarDate}
                  </div>
                  <div className="chip chip-accent">{h.season}</div>
                </div>
                <div className="mt-2 text-[13px] text-ink-2">
                  {h.dateCn}
                  <span className="mx-2 text-ink-4">·</span>
                  {h.xingZuo}座
                  <span className="mx-2 text-ink-4">·</span>
                  生肖{h.shengXiao}
                  {h.jieQi.today && (
                    <>
                      <span className="mx-2 text-ink-4">·</span>
                      <span className="font-medium text-accent">今日交{h.jieQi.today}</span>
                    </>
                  )}
                </div>
                {(h.festivals.length > 0 || h.otherFestivals.length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[...h.festivals, ...h.otherFestivals].map((f) => (
                      <span key={f} className="chip chip-warn">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <span className="chip chip-neutral">建除 · {h.zhiXing}日</span>
                <span className={`chip ${h.xiu.luck === "吉" ? "chip-success" : "chip-danger"}`}>
                  星宿 · {h.xiu.name}（{h.xiu.luck}）
                </span>
                <span className={`chip ${h.tianShen.type === "黄道" ? "chip-success" : "chip-danger"}`}>
                  {h.tianShen.name} · {h.tianShen.type}
                </span>
                <span className="chip chip-neutral">六曜 · {h.liuYao}</span>
                <span className="chip chip-neutral">月相 · {h.yueXiang}</span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-x-8 sm:grid-cols-4">
              <Pillar label="年柱" value={h.yearInGanZhi} />
              <Pillar label="月柱" value={h.monthInGanZhi} />
              <Pillar label="日柱" value={h.dayInGanZhi} />
              <Pillar label="纳音" value={h.naYin} />
            </div>

            {result.personal && (
              <p className="notice notice-info mt-5">
                已叠加个人命盘：生肖{result.personal.shengXiao}
                {result.personal.clashToday
                  ? `，今日与您相冲（${result.personal.shengXiao} ↔ ${h.chong.shengXiao}），宜静守少动。`
                  : `，今日不冲（当日冲${h.chong.shengXiao}，与您无碍）。`}
                {result.ziwei &&
                  ` 流日命宫落本命${palaceLabel(result.ziwei.daily.landedPalace)}，主星${
                    result.ziwei.soulStars.join("、") || "无"
                  }。`}
              </p>
            )}
          </section>

          {/* ---------- 今日注意事项 ---------- */}
          <section className="card card-p">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="title">今日注意事项</h2>
              <span className="text-micro text-ink-4">
                共 {result.advice.length} 条 · 按事业 / 财运 / 人际 / 健康 / 出行分类
              </span>
            </div>

            <div className="mt-4 space-y-5">
              {GROUPS.map((g) => {
                const list = result.groups[g] ?? [];
                if (list.length === 0) return null;
                return (
                  <div key={g}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[13px] font-semibold tracking-tightest text-ink">{g}</span>
                      <span className="text-micro text-ink-4">{list.length} 条</span>
                    </div>
                    <ul className="space-y-1.5">
                      {list.map((a) => (
                        <li
                          key={a.id}
                          className="flex gap-3 rounded-lg bg-gray2 px-3.5 py-2.5"
                        >
                          <span className={`mt-[3px] w-[3px] shrink-0 self-stretch rounded-full ${LEVEL_BAR[a.level]}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] leading-relaxed text-ink">{a.text}</span>
                            <span className="mt-1 block text-micro text-ink-4">{a.source}</span>
                          </span>
                          {a.level !== "info" && (
                            <span className={`shrink-0 text-micro font-semibold ${LEVEL_TEXT[a.level]}`}>
                              {a.level === "warning" ? "留意" : "注意"}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---------- 宜 / 忌 ---------- */}
          <section className="card card-p">
            <h2 className="title">宜 · 忌</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-success text-[10px] font-bold leading-none text-white">
                    宜
                  </span>
                  <span className="text-micro text-ink-3">今日所宜</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {h.yi.length ? (
                    h.yi.map((x) => (
                      <span key={x} className="chip chip-success">
                        {x}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-ink-4">—</span>
                  )}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-danger text-[10px] font-bold leading-none text-white">
                    忌
                  </span>
                  <span className="text-micro text-ink-3">今日所忌</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {h.ji.length ? (
                    h.ji.map((x) => (
                      <span key={x} className="chip chip-danger">
                        {x}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-ink-4">—</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ---------- 黄历细目 ---------- */}
          <section className="card card-p">
            <h2 className="title">黄历细目</h2>
            <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-0 sm:grid-cols-4">
              <Field label="冲煞" value={`冲${h.chong.shengXiao}（${h.chong.desc}）煞${h.chong.sha}`} span2 />
              <Field label="日肖" value={h.dayShengXiao} />
              <Field label="日柱五行" value={h.wuXing} />
              <Field label="太岁方位" value={h.taiSui} />
              <Field label="旬空" value={h.xunKong} />
              <Field label="九星" value={h.nineStar} />
              <Field label="日禄" value={h.dayLu} />
              <Field label="彭祖百忌" value={`${h.pengZu.gan}；${h.pengZu.zhi}`} span2 />
              <Field label="财神方位" value={`${h.positions.cai}（${h.positions.caiDesc}）`} />
              <Field label="喜神方位" value={`${h.positions.xi}（${h.positions.xiDesc}）`} />
              <Field label="福神方位" value={h.positions.fu} />
              <Field label="阳贵 / 阴贵" value={`${h.positions.yangGui} / ${h.positions.yinGui}`} />
              <Field
                label="上一节气"
                value={h.jieQi.prev ? `${h.jieQi.prev.name}　${h.jieQi.prev.date.slice(0, 16)}` : "—"}
                span2
              />
              <Field
                label="下一节气"
                value={h.jieQi.next ? `${h.jieQi.next.name}　${h.jieQi.next.date.slice(0, 16)}` : "—"}
                span2
              />
            </div>

            <div className="mt-5 grid gap-4 border-t border-hair pt-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-micro text-ink-3">吉神宜趋（{h.jiShen.length}）</div>
                <div className="flex flex-wrap gap-1.5">
                  {h.jiShen.map((x) => (
                    <span key={x} className="chip chip-success">
                      {x}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-micro text-ink-3">凶煞宜忌（{h.xiongSha.length}）</div>
                <div className="flex flex-wrap gap-1.5">
                  {h.xiongSha.map((x) => (
                    <span key={x} className="chip chip-danger">
                      {x}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-hair pt-4">
              <button
                className="btn btn-sm btn-quiet inline-flex"
                onClick={() => setShowXiuSong((v) => !v)}
              >
                <IconChevron className={`transition-transform duration-200 ${showXiuSong ? "rotate-90" : ""}`} />
                {showXiuSong ? "收起" : "展开"}星宿歌诀（{h.xiu.name}宿 · {h.xiu.luck}）
              </button>
              {showXiuSong && (
                <p className="mt-3 rounded-lg bg-gray2 px-3.5 py-3 text-xs leading-relaxed text-ink-2">
                  {h.xiu.song}
                </p>
              )}
            </div>
          </section>

          {/* ---------- 十二时辰吉凶 ---------- */}
          <section className="card card-p">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="title">十二时辰吉凶</h2>
              <span className="text-micro text-ink-4">
                吉时 {h.luckyHourCount} / 12
                {h.auspiciousHours.length > 0 && ` · ${h.auspiciousHours.join("、")}`}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {h.times.map((t) => {
                const good = t.tianShenLuck === "吉";
                return (
                  <div
                    key={t.index}
                    className={`rounded-lg px-3 py-2.5 ${
                      good ? "bg-success/[0.10]" : "bg-gray2"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-[13px] font-medium tracking-tightest text-ink">
                        {t.label}
                      </span>
                      <span
                        className={`text-micro font-semibold ${good ? "text-success" : "text-ink-4"}`}
                      >
                        {t.tianShenLuck}
                      </span>
                    </div>
                    <div className="num mt-1 text-micro text-ink-3">
                      {t.minHm}–{t.maxHm}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-micro text-ink-4">
                      <span className="num">{t.ganZhi}</span>
                      <span>{t.tianShen}</span>
                      <span>冲{t.chongShengXiao}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---------- 八字 / 紫微流日 ---------- */}
          {(result.bazi || result.ziwei) && (
            <section className="card card-p">
              <h2 className="title">个人命盘叠加</h2>

              {result.bazi && (
                <div className="mt-4">
                  <div className="mb-2 flex flex-wrap items-baseline gap-2">
                    <span className="text-[13px] font-semibold tracking-tightest text-ink">
                      八字
                    </span>
                    <span className={`text-[13px] ${EL_CLS[result.bazi.dayMasterWuXing] ?? "text-ink"}`}>
                      日主{result.bazi.dayMaster}（{result.bazi.dayMasterWuXing}）
                    </span>
                    <span className="chip chip-neutral">{result.bazi.level}</span>
                    <span className="chip chip-neutral">生于{result.bazi.season}季</span>
                  </div>
                  <p className="rounded-lg bg-gray2 px-3.5 py-3 text-xs leading-relaxed text-ink-2">
                    {result.bazi.summary}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                    <span className="text-ink-3">
                      喜用：
                      {result.bazi.favorable.map((e) => (
                        <span key={e} className={`ml-1 font-medium ${EL_CLS[e] ?? ""}`}>
                          {e}
                        </span>
                      ))}
                    </span>
                    <span className="text-ink-3">
                      忌神：
                      {result.bazi.unfavorable.map((e) => (
                        <span key={e} className="ml-1 text-ink-2">
                          {e}
                        </span>
                      ))}
                    </span>
                    {result.bazi.missing.length > 0 && (
                      <span className="text-ink-3">
                        缺：
                        <span className="ml-1 text-ink-2">{result.bazi.missing.join("、")}</span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {result.ziwei && (
                <div className="mt-6 border-t border-hair pt-5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[13px] font-semibold tracking-tightest text-ink">
                      紫微流日
                    </span>
                    <span className="text-[13px] text-ink-2">{result.ziwei.solarDate}</span>
                    <span className="text-micro text-ink-4">
                      （{result.ziwei.lunarDate} · 虚岁 {result.ziwei.nominalAge}）
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-0 sm:grid-cols-4">
                    <Field
                      label="流日命宫"
                      value={`${palaceLabel(result.ziwei.daily.landedPalace)} · ${result.ziwei.soulStars.join("、") || "无主星"}`}
                    />
                    <Field
                      label="流日干支"
                      value={`${result.ziwei.daily.heavenlyStem}${result.ziwei.daily.earthlyBranch}`}
                    />
                    <Field label="大限落宫" value={palaceLabel(result.ziwei.decadal.landedPalace)} />
                    <Field label="流年落宫" value={palaceLabel(result.ziwei.yearly.landedPalace)} />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-0 sm:grid-cols-4">
                    {(["禄", "权", "科", "忌"] as const).map((k) => {
                      const key = ({ 禄: "lu", 权: "quan", 科: "ke", 忌: "ji" } as const)[k];
                      const star = result.ziwei!.mutagenStars[key];
                      const palaces = result.ziwei!.mutagenPalaces[key];
                      return (
                        <div key={k} className="py-[5px]">
                          <div className="text-micro text-ink-3">化{k}</div>
                          <div className="mt-0.5 truncate text-[13px] text-ink" title={palaces.map(palaceLabel).join("、")}>
                            {star || "—"}
                            {palaces.length > 0 && (
                              <span className="ml-1.5 text-ink-4">
                                → {palaces.map(palaceLabel).join("、")}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {palaceList.map((p) => (
                      <div
                        key={p.name}
                        className={`rounded-lg px-3 py-2.5 ${
                          p.isSoul ? "bg-accent/[0.08]" : "bg-gray2"
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-[13px] font-medium tracking-tightest text-ink">
                            {palaceLabel(p.name)}
                            {p.isSoul && <IconPin className="text-accent" />}
                          </span>
                          <span className="shrink-0 text-micro text-ink-4">
                            本命{palaceLabel(p.origin)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                          {p.stars.length ? (
                            p.stars.map((s) => {
                              const mu = p.mutagen.find((x) => x.star === s);
                              return (
                                <span key={s} className="text-[13px] text-ink">
                                  {s}
                                  {mu && (
                                    <span
                                      className={`ml-0.5 text-micro ${
                                        mu.mutagen === "忌" ? "text-danger" : "text-success"
                                      }`}
                                    >
                                      {mu.mutagen}
                                    </span>
                                  )}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-micro text-ink-4">无主星</span>
                          )}
                        </div>
                        {p.dailyStars.length > 0 && (
                          <div className="mt-1 text-micro text-ink-4">{p.dailyStars.join("、")}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          <p className="px-1 text-micro leading-relaxed text-ink-4">{result.disclaimer}</p>
        </>
      )}
    </div>
  );
}

/* ---------------- 局部组件 ---------------- */

function Pillar({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray2 px-3 py-2.5">
      <div className="text-micro text-ink-3">{label}</div>
      <div className="num mt-0.5 text-[15px] font-medium tracking-tightest text-ink">{value}</div>
    </div>
  );
}

function Field({ label, value, span2 }: { label: string; value: string; span2?: boolean }) {
  return (
    <div className={`${span2 ? "col-span-2" : ""} py-[5px]`}>
      <div className="text-micro text-ink-3">{label}</div>
      <div className="mt-0.5 truncate text-[13px] text-ink" title={value}>
        {value}
      </div>
    </div>
  );
}
