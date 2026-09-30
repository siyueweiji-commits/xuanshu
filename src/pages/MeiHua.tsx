import { useState } from "react";
import { ipc } from "../lib/ipc";
import PageHead from "../components/PageHead";

interface MeihuaResult {
  hexagram: string;
  upperName: string;
  lowerName: string;
  movingLine: number;
  bodyUseRelation: string;
  source: string;
  disclaimer: string;
}

export default function MeiHua() {
  const [mode, setMode] = useState<"time" | "numbers">("time");
  const [nums, setNums] = useState({ num1: 3, num2: 7 });
  const [result, setResult] = useState<MeihuaResult | null>(null);
  const [error, setError] = useState("");

  async function qiGua() {
    setError("");
    setResult(null);
    try {
      const payload =
        mode === "numbers"
          ? { mode: "numbers", num1: nums.num1, num2: nums.num2 }
          : { mode: "time", yearZhiIndex: 1, lunarMonth: 1, lunarDay: 1, hourIndex: 1 }; // M2 接入历法后自动取当前农历
      setResult(await ipc<MeihuaResult>("divination:meihua", payload));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="page">
      <PageHead title="梅花易数" desc="以时间或数字起卦，看体用生克与动爻所在。" />

      <section className="card card-p">
        <div className="seg">
          {(["time", "numbers"] as const).map((m) => (
            <button
              key={m}
              className={`seg-item ${mode === m ? "seg-item-active" : ""}`}
              onClick={() => setMode(m)}
            >
              {m === "time" ? "时间起卦" : "数字起卦"}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {mode === "numbers" ? (
            <div className="flex items-end gap-3">
              <div className="w-24">
                <label className="label">数一</label>
                <input
                  type="number"
                  min={1}
                  className="input num"
                  value={nums.num1}
                  onChange={(e) => setNums({ ...nums, num1: +e.target.value })}
                />
              </div>
              <div className="w-24">
                <label className="label">数二</label>
                <input
                  type="number"
                  min={1}
                  className="input num"
                  value={nums.num2}
                  onChange={(e) => setNums({ ...nums, num2: +e.target.value })}
                />
              </div>
            </div>
          ) : (
            <div className="notice notice-quiet">
              当前版本按固定农历分量演示；接入历法后将自动取起卦时刻的农历年月日时。
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-danger">{error}</p>}

        <button className="btn btn-primary mt-4" onClick={() => void qiGua()}>
          起卦
        </button>
      </section>

      {result && (
        <section className="card card-p text-center">
          <div className="eyebrow">本卦</div>
          <div className="mt-2 text-[34px] font-semibold leading-none tracking-tightest">
            {result.hexagram}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="chip chip-neutral">上卦 {result.upperName}</span>
            <span className="chip chip-neutral">下卦 {result.lowerName}</span>
            <span className="chip chip-accent">动爻 第 {result.movingLine} 爻</span>
          </div>
          <p className="mx-auto mt-5 max-w-xl rounded-lg bg-gray2 px-4 py-3 text-[13px] text-ink">
            {result.bodyUseRelation}
          </p>
          <p className="mt-4 sub">
            {result.source} · {result.disclaimer}
          </p>
        </section>
      )}
    </div>
  );
}
