import { useState } from "react";
import { ipc } from "../lib/ipc";

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
    <div className="mx-auto max-w-2xl space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">梅花易数</h2>
        <div className="mb-4 flex gap-2 text-sm">
          {(["time", "numbers"] as const).map((m) => (
            <button key={m}
              className={`rounded-lg px-3 py-1.5 ${mode === m ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`}
              onClick={() => setMode(m)}>
              {m === "time" ? "时间起卦" : "数字起卦"}
            </button>
          ))}
        </div>
        {mode === "numbers" && (
          <div className="mb-4 flex items-center gap-3 text-sm">
            <input type="number" min={1} className="w-24 rounded-lg border border-neutral-300 px-3 py-2"
              value={nums.num1} onChange={(e) => setNums({ ...nums, num1: +e.target.value })} />
            <span className="text-neutral-400">/</span>
            <input type="number" min={1} className="w-24 rounded-lg border border-neutral-300 px-3 py-2"
              value={nums.num2} onChange={(e) => setNums({ ...nums, num2: +e.target.value })} />
          </div>
        )}
        {mode === "time" && (
          <p className="mb-4 text-xs text-neutral-400">
            当前版本按固定农历分量演示；M2 接入历法后将自动取起卦时刻的农历年月日时。
          </p>
        )}
        <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          onClick={() => void qiGua()}>
          起卦
        </button>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </section>

      {result && (
        <section className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <div className="text-3xl font-bold tracking-wide">{result.hexagram}</div>
          <p className="mt-2 text-sm text-neutral-500">
            上卦 {result.upperName} ｜ 下卦 {result.lowerName} ｜ 动爻 第{result.movingLine}爻
          </p>
          <p className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm">{result.bodyUseRelation}</p>
          <p className="mt-3 text-xs text-neutral-400">{result.source} · {result.disclaimer}</p>
        </section>
      )}
    </div>
  );
}
