import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import { changeTheme, readLocalTheme, THEME_LABELS, ThemeMode } from "../lib/theme";

interface Prefs {
  theme: ThemeMode;
  useTrueSolar: boolean;
  defaultCity: string;
}

/**
 * 偏好设置（M10）：主题 + 起局默认（真太阳时 / 默认城市）。
 * 主题走 theme.ts（localStorage 即时生效 + settings 表持久化）；
 * 起局默认记在 settings 表，供排盘页作为初始值。
 */
export default function PrefsPanel() {
  const [theme, setTheme] = useState<ThemeMode>(readLocalTheme());
  const [useTrueSolar, setUseTrueSolar] = useState(false);
  const [city, setCity] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    ipc<Prefs>("app:prefs")
      .then((p) => {
        setTheme(p.theme ?? "system");
        setUseTrueSolar(p.useTrueSolar);
        setCity(p.defaultCity ?? "");
        setLoaded(true);
      })
      .catch(() => {
        setError("无法读取偏好设置（需在 Electron 窗口中运行）");
        setLoaded(true);
      });
  }, []);

  async function onTheme(mode: ThemeMode): Promise<void> {
    setTheme(mode);
    setError("");
    try {
      await changeTheme(mode);
      setNotice("主题已保存");
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveDefaults(): Promise<void> {
    setError("");
    setNotice("");
    try {
      await ipc("app:set-prefs", { useTrueSolar, defaultCity: city.trim() });
      setNotice("起局默认已保存，下次排盘自动生效");
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section className="card card-p" id="prefs-panel">
      <h2 className="title">外观与起局默认</h2>

      {error && <div className="notice notice-danger mt-4">{error}</div>}
      {notice && <div className="notice notice-info mt-4">{notice}</div>}

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="title-sm">主题</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
            浅色 / 深色即时切换，跟随系统则自动响应系统外观。
          </p>
          <div className="seg mt-3 w-fit">
            {(["system", "light", "dark"] as ThemeMode[]).map((m) => (
              <button
                key={m}
                className={`seg-item ${theme === m ? "seg-item-active" : ""}`}
                onClick={() => void onTheme(m)}
              >
                {THEME_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="title-sm">排盘默认</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
            设定紫微 / 八字排盘页的真太阳时开关与默认城市（仍可在各页面单独调整）。
          </p>
          <label className="mt-3 flex items-center gap-2">
            <input
              type="checkbox"
              className="check"
              checked={useTrueSolar}
              onChange={(e) => setUseTrueSolar(e.target.checked)}
            />
            <span className="text-[13px] text-ink">默认启用真太阳时校正</span>
          </label>
          <div className="mt-2">
            <label className="label">默认城市（用于经度校正）</label>
            <input
              className="input"
              value={city}
              placeholder="如：孝感"
              disabled={!useTrueSolar}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <button className="btn btn-sm btn-primary mt-3" disabled={!loaded} onClick={() => void saveDefaults()}>
            保存默认
          </button>
        </div>
      </div>
    </section>
  );
}
