/**
 * 主题（M10）：localStorage 即时应用 + IPC 持久化。
 *
 * 为什么双写：
 *   - CSS 变量在**首帧之前**就要就位，否则启动瞬间闪错主题；
 *     所以首次进入页面先读 localStorage 立即生效；
 *   - 持久化到 settings 表是为了随数据备份一起走，localStorage 只是启动加速缓存，
 *     不是权威来源。
 */
import { ipc } from "./ipc";
export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const LS_KEY = "xuanshu.theme";
const MODES: ThemeMode[] = ["system", "light", "dark"];

export const THEME_LABELS: Record<ThemeMode, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色"
};

/** 无边框窗口标题条配色（与界面底色一致，避免闪白/闪黑） */
const TITLEBAR: Record<ResolvedTheme, { color: string; symbolColor: string }> = {
  light: { color: "#ffffff", symbolColor: "#3c3c43" },
  dark: { color: "#232325", symbolColor: "#d0d0d0" }
};

export function isThemeMode(v: unknown): v is ThemeMode {
  return typeof v === "string" && MODES.includes(v as ThemeMode);
}

export function readLocalTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(LS_KEY);
    return isThemeMode(v) ? v : "system";
  } catch {
    return "system";
  }
}

export function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

/** 把解析后的主题落到 <html class="dark">，并同步无边框窗口标题条颜色 */
export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  try {
    // 通知主进程更新 titleBarOverlay（打包后 bridge 才存在；纯浏览器预览时跳过）。
    // 必须显式接住 rejection：自检模式 / 旧版主进程未注册该通道时会 reject，
    // 不接住会成为未处理 Promise 拒绝，被自检的 console 监听当成渲染层错误。
    ipc("app:theme-resolved", { theme: resolved }).catch(() => {});
  } catch {
    /* ignore */
  }
  return resolved;
}

let watching = false;
/** 跟随系统模式下监听系统主题变化（只挂一次） */
export function watchSystemTheme(onChange: () => void): void {
  if (watching || !window.matchMedia) return;
  watching = true;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    if (readLocalTheme() === "system") onChange();
  };
  mq.addEventListener?.("change", handler);
}

export interface ThemePrefs {
  theme?: string;
}

/** 启动序列：本地缓存立即生效 → 再向主进程要权威值并落回 */
export async function initTheme(): Promise<ResolvedTheme> {
  const local = readLocalTheme();
  applyTheme(local);
  watchSystemTheme(() => applyTheme(readLocalTheme()));

  try {
    const prefs = (await ipc<ThemePrefs>("app:prefs")) ?? {};
    if (isThemeMode(prefs?.theme) && prefs.theme !== local) {
      localStorage.setItem(LS_KEY, prefs.theme);
      return applyTheme(prefs.theme);
    }
  } catch {
    /* 主进程不可用（纯浏览器预览）时用本地值 */
  }
  return resolveTheme(local);
}

export async function changeTheme(mode: ThemeMode): Promise<ResolvedTheme> {
  if (!isThemeMode(mode)) throw new Error(`未知主题：${String(mode)}`);
  localStorage.setItem(LS_KEY, mode);
  const resolved = applyTheme(mode);
  try {
    await ipc("app:set-prefs", { theme: mode });
  } catch {
    /* 持久化失败不影响即时生效，下次启动会回落到本地缓存 */
  }
  return resolved;
}
