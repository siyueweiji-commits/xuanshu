import { useState } from "react";
import { ipc } from "../lib/ipc";

interface LiuyaoResult {
  question: string;
  lines: Array<{ position: number; value: number; changing: boolean; coinThrow: string[] }>;
  originalHexagram: string;
  changedHexagram: string | null;
  movingLines: number[];
  disclaimer: string;
}

export default function LiuYao() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<LiuyaoResult | null>(null);
  const [error, setError] = useState("");

  async function qiGua() {
    setError("");
    setResult(null);
    try {
      setResult(await ipc<LiuyaoResult>("divination:liuyao", { question }));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">六爻起卦</h2>
        <input className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          placeholder="所问何事（可选）" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <button className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          onClick={() => void qiGua()}>
          掷铜钱起卦
        </button>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </section>

      {result && (
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="text-center">
            <div className="text-2xl font-bold">{result.originalHexagram}</div>
            {result.changedHexagram && (
              <div className="mt-1 text-sm text-neutral-500">变卦：{result.changedHexagram}</div>
            )}
            <div className="mt-1 text-xs text-neutral-400">问：{result.question}</div>
          </div>
          <ul className="mt-6 space-y-2">
            {[...result.lines].reverse().map((l) => (
              <li key={l.position} className="flex items-center justify-between rounded-lg bg-neutral-50 px-4 py-2 text-sm">
                <span>
                  第{l.position}爻：{l.value ? "━━━━━ 阳爻" : "━━ ━━ 阴爻"}
                  {l.changing && <span className="ml-2 text-red-500">动</span>}
                </span>
                <span className="text-xs text-neutral-400">{l.coinThrow.join(" ")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-neutral-400">{result.disclaimer}</p>
        </section>
      )}
    </div>
  );
}
