import { app, BrowserWindow, Menu } from "electron";
import fs from "node:fs";
import path from "node:path";
import { initDatabase } from "./db/database";
import { registerIpcHandlers } from "./ipc";
import { builtinDir } from "./services/dataPaths";

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

/**
 * 打包产物自检（`XuanShu.exe --self-test`）。
 *
 * 为什么需要它：asar 打包后「文件路径 / 原生模块 / 内置资源」三件事都换了运行环境，
 * 开发期全绿不代表安装包里能跑。这个模式不开窗口，只把关键前提逐项验一遍，
 * 打印 JSON 后按结果设置退出码，便于本地与 CI 直接判定安装包是否可用。
 */
const SELF_TEST = process.argv.includes("--self-test");

let mainWindow: BrowserWindow | null = null;

async function runSelfTest(): Promise<void> {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  const record = (name: string, fn: () => string): void => {
    try {
      checks.push({ name, ok: true, detail: fn() });
    } catch (e) {
      checks.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  };

  record("app:getAppPath", () => app.getAppPath());
  record("app:resourcesPath", () => app.getAppPath().includes("app.asar") ? "asar 内运行" : "非 asar（dev）");

  // 1) 渲染产物
  record("renderer:index.html", () => {
    const p = path.join(__dirname, "../dist/index.html");
    if (!fs.existsSync(p)) throw new Error(`缺失：${p}`);
    return `${fs.statSync(p).size} bytes`;
  });

  // 2) 内置资源（asar 内可读性）——路径统一走 dataPaths，别在 main 里另算一份
  record("resources:rules", () => {
    const files = fs.readdirSync(builtinDir("rules"));
    if (!files.length) throw new Error("resources/rules 为空");
    return `${files.length} 个文件：${files.join(",")}`;
  });
  record("resources:knowledge", () => fs.readdirSync(builtinDir("knowledge")).join(","));
  record("resources:templates", () => fs.readdirSync(builtinDir("templates")).join(","));
  record("resources:data", () => fs.readdirSync(builtinDir("data")).join(","));

  // 3) 原生模块（asarUnpack 后必须能真正 dlopen）
  record("native:better-sqlite3", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db = new Database(":memory:");
    const row = db.prepare("SELECT sqlite_version() AS v").get() as { v: string };
    db.close();
    return `sqlite ${row.v}`;
  });

  // 4) 数据库落地
  record("db:init", () => {
    const db = initDatabase();
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{
        name: string;
      }>
    ).map((t) => t.name);
    const need = ["profiles", "charts", "daily_fortunes", "divinations", "feedbacks", "settings", "update_logs", "reports"];
    const missing = need.filter((t) => !tables.includes(t));
    if (missing.length) throw new Error(`缺表：${missing.join(",")}`);
    return `${tables.length} 张表，路径 ${db.name}`;
  });

  // 5) 服务层端到端（含规则匹配，防止「规则静默失效」）
  record("services:bazi+ziwei+meihua+liuyao", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { calcBazi } = require("./services/bazi") as typeof import("./services/bazi");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { calcZiwei } = require("./services/ziwei") as typeof import("./services/ziwei");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { qigua: meihuaQigua } = require("./services/meihua") as typeof import("./services/meihua");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { qigua: liuyaoQigua } = require("./services/liuyao") as typeof import("./services/liuyao");
    const bz = calcBazi({ gender: "男", year: 1990, month: 1, day: 1, hour: 12, minute: 30 });
    const zw = calcZiwei({ gender: "男", year: 1990, month: 1, day: 1, timeIndex: 6, calendar: "solar" });
    const mh = meihuaQigua({ mode: "numbers", num1: 3, num2: 7 });
    const ly = liuyaoQigua({ mode: "manual", manualLines: [1, 1, 1, 1, 1, 1].map((v) => ({ value: v })) });
    return `八字 ${bz.pillars.map((p) => p.ganzhi).join(" ")}｜紫微 ${zw.palaces.length} 宫｜梅花 ${mh.original.name}｜六爻 ${ly.original.name}`;
  });

  record("services:daily+report（规则必须命中）", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildReport } = require("./services/report") as typeof import("./services/report");
    const r = buildReport({ scope: "daily", date: "2026-09-30" });
    const ruleHits = r.daily?.advice.filter((a) => a.system === "rule").length ?? 0;
    if (!r.contentMd) throw new Error("报告为空");
    if (ruleHits === 0) throw new Error("规则库一条都没命中（规则键与事实键可能对不上）");
    return `报告 ${r.contentMd.length} 字，规则命中 ${ruleHits} 条，${r.sections.length} 段`;
  });

  record("services:updater", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const up = require("./services/updater") as typeof import("./services/updater");
    const ov = up.dataOverview();
    return `本地版本 ${ov.version}，四类资源 ${ov.kinds.map((k) => k.kind + "=" + k.builtin).join(" ")}`;
  });

  // 自检也会开一个隐藏窗口加载界面，渲染层（initTheme / 免责声明 / 首页档案列表）
  // 会走 IPC，不注册就会在主进程打一堆 "No handler registered" 报错，污染自检输出。
  registerIpcHandlers();

  // 6) 界面真的能渲染（这一步只有真开窗口才能验：dist 产物 + preload + React 挂载）
  await (async () => {
    const errors: string[] = [];
    let win: BrowserWindow | null = null;
    try {
      win = new BrowserWindow({
        width: 1280,
        height: 820,
        show: false,
        backgroundColor: "#f5f5f7",
        webPreferences: {
          preload: path.join(__dirname, "preload.js"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false
        }
      });
      win.webContents.on("console-message", (_e, level, msg) => {
        if (level >= 2 && !msg.includes("Content-Security-Policy")) errors.push(msg);
      });
      win.webContents.on("render-process-gone", (_e, d) =>
        errors.push("render-process-gone " + JSON.stringify(d))
      );

      await win.loadFile(path.join(__dirname, "../dist/index.html"));
      await new Promise((r) => setTimeout(r, 900));

      const probe = (await win.webContents.executeJavaScript(
        `(() => {
           const root = document.getElementById("root");
           const nav = document.querySelectorAll("nav a, aside a").length;
           const btns = document.querySelectorAll("button").length;
           const bridge = typeof window.xuanshu === "object" && typeof window.xuanshu.invoke === "function";
           return { mounted: !!(root && root.children.length), nav, btns, bridge,
                    text: root ? root.innerText.slice(0, 60).replace(/\\s+/g, " ") : "" };
         })()`
      )) as { mounted: boolean; nav: number; btns: number; bridge: boolean; text: string };

      if (!probe.mounted) throw new Error("React 未挂载（#root 为空）");
      if (probe.nav < 8) throw new Error(`侧边导航项过少：${probe.nav}`);
      if (!probe.bridge) throw new Error("preload 未注入 window.xuanshu");
      if (errors.length) throw new Error(`渲染层报错：${errors.slice(0, 2).join(" | ")}`);

      checks.push({
        name: "renderer:窗口渲染",
        ok: true,
        detail: `导航 ${probe.nav} 项 / 按钮 ${probe.btns} 个 / 文案「${probe.text}…」`
      });
    } catch (e) {
      checks.push({
        name: "renderer:窗口渲染",
        ok: false,
        detail: e instanceof Error ? e.message : String(e)
      });
    } finally {
      win?.destroy();
    }
  })();

  const failed = checks.filter((c) => !c.ok);
  const out = {
    ok: failed.length === 0,
    appVersion: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform}-${process.arch}`,
    packaged: app.isPackaged,
    checks
  };
  console.log("XUANSHU_SELF_TEST " + JSON.stringify(out, null, 2));

  // Windows 下 GUI 子系统的程序，其 stdout/stderr 无法被 spawnSync 捕获，
  // 所以额外把结果落到文件，供 pack-dir.cjs 读取（手动跑仍可看控制台输出）。
  const outFile = process.env.XUANSHU_SELF_TEST_OUT;
  if (outFile) {
    try {
      fs.writeFileSync(outFile, "XUANSHU_SELF_TEST " + JSON.stringify(out, null, 2), "utf-8");
    } catch {
      /* 写不进就忽略，不影响退出码 */
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    (require("./db/database") as typeof import("./db/database")).closeDatabase();
  } catch {
    /* ignore */
  }
  app.exit(failed.length === 0 ? 0 : 1);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 660,
    title: "玄枢 XuanShu",
    backgroundColor: "#f5f5f7",
    autoHideMenuBar: true,
    // 无边框标题栏：隐藏原生标题栏，右侧保留系统窗口控件（最小化 / 最大化 / 关闭），
    // 渲染层用 .titlebar-drag 划出可拖拽区域。
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#ffffff",
      symbolColor: "#3c3c43",
      height: 38
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (DEV_SERVER_URL) {
    void mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// 单实例锁：避免多开导致 SQLite 锁冲突
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);

    // 打包产物自检：不开窗口，验完直接退出
    if (SELF_TEST) {
      await runSelfTest();
      return;
    }

    initDatabase();
    registerIpcHandlers();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
