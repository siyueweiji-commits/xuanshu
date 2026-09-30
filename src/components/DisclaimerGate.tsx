import { useEffect, useState, type ReactNode } from "react";
import { ipc } from "../lib/ipc";
import Markdown from "./Markdown";

interface DisclaimerState {
  accepted: boolean;
  acceptedVersion: string;
  currentVersion: string;
  text: string;
}

/**
 * 首次启动免责声明闸门（PRD 4.12）。
 *
 * - 接受状态按**版本号**记录：升级到新版本后会再次提示一次；
 * - 主进程不可用（纯浏览器预览）时直接放行，不阻塞调试。
 */
export default function DisclaimerGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DisclaimerState | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ipc<DisclaimerState>("app:disclaimer")
      .then((s) => setState(s))
      .catch(() => setState(null))
      .finally(() => setChecked(true));
  }, []);

  async function accept(): Promise<void> {
    setBusy(true);
    try {
      setState(await ipc<DisclaimerState>("app:accept-disclaimer"));
    } catch {
      // 写失败也应放行（下次启动会再提示），不能把用户困在弹窗里
      setState(state ? { ...state, accepted: true } : null);
    } finally {
      setBusy(false);
    }
  }

  const show = checked && state !== null && !state.accepted;

  return (
    <>
      {children}
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 px-6">
          <div className="w-full max-w-[540px] rounded-2xl bg-surface p-6 shadow-pop">
            <div className="flex items-center gap-2.5">
              <span className="grid h-[22px] w-[22px] place-items-center rounded-[6px] bg-accent text-[12px] font-bold leading-none text-white">
                玄
              </span>
              <h2 className="text-[17px] font-semibold tracking-tightest text-ink">
                使用前请阅读
              </h2>
              <span className="num ml-auto text-micro text-ink-4">
                v{state?.currentVersion}
              </span>
            </div>

            <div className="mt-4 rounded-md bg-gray1 px-4 py-3.5">
              <Markdown source={state?.text ?? ""} />
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <span className="text-micro text-ink-4">接受后将不再重复提示</span>
              <button className="btn btn-primary" onClick={() => void accept()} disabled={busy}>
                {busy ? "处理中…" : "我已阅读并接受"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
