import { useState } from "react";
import { ipc } from "../lib/ipc";
import PageHead from "../components/PageHead";

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
    <div className="page">
      <PageHead title="六爻起卦" desc="三枚铜钱摇六次，依老阳老阴定动爻，得出本卦与变卦。" />

      <section className="card card-p">
        <label className="label">所问何事（可选）</label>
        <input
          className="input"
          placeholder="如：本次体系外审能否顺利通过"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        <button className="btn btn-primary mt-4" onClick={() => void qiGua()}>
          掷铜钱起卦
        </button>
      </section>

      {result && (
        <section className="card card-p">
          <div className="text-center">
            <div className="eyebrow">本卦</div>
            <div className="mt-2 text-[28px] font-semibold leading-none tracking-tightest">
              {result.originalHexagram}
            </div>
            {result.changedHexagram && (
              <div className="mt-3 text-[13px] text-ink-2">
                变卦 <span className="font-medium text-ink">{result.changedHexagram}</span>
              </div>
            )}
            {result.question && <div className="mt-2 sub">问：{result.question}</div>}
          </div>

          <ul className="mt-6 space-y-1.5">
            {[...result.lines].reverse().map((l) => (
              <li
                key={l.position}
                className="flex items-center justify-between gap-4 rounded-lg bg-gray2 px-4 py-2.5"
              >
                <span className="flex items-center gap-3">
                  <span className="num w-5 shrink-0 text-xs text-ink-3">{l.position}</span>
                  <YaoLine yang={Boolean(l.value)} />
                  {l.changing && <span className="chip chip-danger">动</span>}
                </span>
                <span className="num text-xs text-ink-3">{l.coinThrow.join(" ")}</span>
              </li>
            ))}
          </ul>

          <p className="mt-5 sub">{result.disclaimer}</p>
        </section>
      )}
    </div>
  );
}

/** 爻线：阳爻一整条，阴爻断开两段 */
function YaoLine({ yang }: { yang: boolean }) {
  const bar = "h-[3px] rounded-full";
  return (
    <span className="flex w-16 shrink-0 items-center gap-2" title={yang ? "阳爻" : "阴爻"}>
      {yang ? (
        <span className={`${bar} w-full bg-ink`} />
      ) : (
        <>
          <span className={`${bar} flex-1 bg-ink`} />
          <span className={`${bar} flex-1 bg-ink`} />
        </>
      )}
    </span>
  );
}
