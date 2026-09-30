/**
 * 端到端校验「真实主进程」路径（不依赖任何模拟）：
 *   1) better-sqlite3 原生模块能否在 Electron ABI 下加载
 *   2) titleBarStyle: hidden + titleBarOverlay 是否被接受
 *   3) 真实 preload 白名单 + 真实 IPC handler 能否跑通
 *   4) 渲染层是否报错
 *
 * 用法：npm run verify:main
 * 产物：.uishot/real-main.png、.uishot/verify-main.json
 *
 * 本机 ELECTRON_RUN_AS_NODE=1 会让 electron 退化成纯 Node，脚本会自动剥离该变量重启自己。
 */
const path = require("node:path");
const fs = require("node:fs");

if (!process.versions.electron || "ELECTRON_RUN_AS_NODE" in process.env) {
  const { spawnSync } = require("node:child_process");
  const exe = require("electron");
  if (typeof exe !== "string") {
    console.error("[verify:main] 无法定位 electron 可执行文件，请先 npm install");
    process.exit(1);
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const ret = spawnSync(exe, [__filename], { stdio: "inherit", env });
  process.exit(ret.status ?? 1);
}

const { app, BrowserWindow, ipcMain, Menu } = require("electron");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, ".uishot");
const report = {};

function step(name, fn) {
  try {
    report[name] = { ok: true, value: fn() };
    console.log(`[verify:main] ${name}: OK`);
  } catch (e) {
    report[name] = { ok: false, error: String(e && e.message ? e.message : e) };
    console.log(`[verify:main] ${name}: FAIL ${report[name].error}`);
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  // 1) SQLite（Electron ABI）
  step("sqlite", () => {
    const Database = require("better-sqlite3");
    const dir = path.join(app.getPath("userData"), "data");
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, "xuanshu-verify.db"));
    db.pragma("journal_mode = WAL");
    const row = db.prepare("SELECT sqlite_version() AS v").get();
    db.close();
    return { sqlite: row.v, dir };
  });

  // 2) 真实 IPC handler 注册
  step("ipc", () => {
    const { registerIpcHandlers } = require(path.join(ROOT, "dist-electron", "ipc", "index.js"));
    registerIpcHandlers();
    return "registered";
  });

  // 3) 窗口（与 electron/main.ts 保持一致）
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 660,
    title: "玄枢 XuanShu",
    backgroundColor: "#f5f5f7",
    autoHideMenuBar: true,
    show: false,
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#ffffff", symbolColor: "#3c3c43", height: 38 },
    webPreferences: {
      preload: path.join(ROOT, "dist-electron", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  step("window", () => {
    if (!win.isResizable()) throw new Error("窗口不可调整大小");
    if (typeof win.setTitleBarOverlay !== "function") throw new Error("缺少 setTitleBarOverlay API");
    return win.getBounds();
  });

  const rendererErrors = [];
  win.webContents.on("console-message", (_e, level, msg) => {
    // 开发期（未打包）的 CSP 提示属正常，不算错误
    if (level >= 2 && !msg.includes("Content-Security-Policy")) rendererErrors.push(msg);
  });
  win.webContents.on("render-process-gone", (_e, d) =>
    rendererErrors.push("render-process-gone " + JSON.stringify(d))
  );

  await win.loadFile(path.join(ROOT, "dist", "index.html"));
  await new Promise((r) => setTimeout(r, 900));

  // 4) 走真实 preload + 真实 IPC 拉一轮数据
  const probe = await win.webContents
    .executeJavaScript(`(async () => {
      const out = {};
      const call = async (ch, p) => { try { return await window.xuanshu.invoke(ch, p); } catch (e) { return { ok:false, error:String(e) }; } };
      out.profiles = (await call("profile:list")).ok;
      out.appInfo  = (await call("app:info")).ok;
      const bz = await call("chart:bazi", { gender: "男", year: 1990, month: 1, day: 1, hour: 12, minute: 30 });
      out.bazi = bz.ok ? (bz.data.pillars || []).map((p) => p.ganzhi).join(" ") + " | " + bz.data.wuXing.level : bz.error;
      const ts = await call("calendar:truesolar", { year: 1990, month: 1, day: 1, hour: 12, minute: 30, city: "乌鲁木齐" });
      out.trueSolar = ts.ok ? ts.data.trueSolarTime : ts.error;
      const zw = await call("chart:ziwei", { gender: "男", year: 1990, month: 1, day: 1, timeIndex: 0 });
      out.ziwei = zw.ok ? (zw.data.palaces || []).length + " 宫 / " + zw.data.fiveElementsClass : zw.error;
      const hs = await call("chart:ziwei-horoscope", { gender: "男", year: 1990, month: 1, day: 1, timeIndex: 0, targetYear: 2026, targetMonth: 9, targetDay: 30 });
      out.horoscope = hs.ok ? hs.data.decadal.heavenlyStem + hs.data.decadal.earthlyBranch + " / 大限 " + hs.data.decadalList.length + " 个 / 流月 " + (hs.data.monthly.mutagen || []).join("") : hs.error;
      const li = await call("calendar:convert", { year: 1990, month: 1, day: 1, hour: 12, minute: 30 });
      out.calendar = li.ok ? li.data.lunar + " / " + li.data.ganZhi.year : li.error;

      // M4 流日：纯黄历
      const d1 = await call("daily:fortune", { year: 2026, month: 9, day: 30 });
      out.dailyPlain = d1.ok
        ? [d1.data.huangli.dayInGanZhi, d1.data.huangli.zhiXing + "日", d1.data.huangli.xiu.name + "宿",
           "吉时" + d1.data.huangli.luckyHourCount, "事项" + d1.data.advice.length].join(" / ")
        : d1.error;
      out.dailyPlainGroups = d1.ok
        ? Object.entries(d1.data.groups).map(([k, v]) => k + ":" + v.length).join(" ")
        : "-";

      // M4 流日：叠加个人命盘（走真太阳时）
      const d2 = await call("daily:fortune", {
        year: 2026, month: 9, day: 30,
        birth: { gender: "男", year: 1990, month: 1, day: 1, hour: 12, minute: 30, city: "孝感", useTrueSolar: true }
      });
      out.dailyPersonal = d2.ok
        ? ["生肖" + d2.data.personal.shengXiao, "冲煞=" + d2.data.personal.clashToday,
           "日主" + d2.data.bazi.dayMaster + d2.data.bazi.dayMasterWuXing,
           "流日命宫" + d2.data.ziwei.daily.landedPalace + "宫",
           "化忌" + d2.data.ziwei.mutagenStars.ji,
           "事项" + d2.data.advice.length].join(" / ")
        : d2.error;
      out.dailyPersonalMeta = d2.ok && d2.data.meta ? d2.data.meta.birth.trueSolarTime : null;
      out.dailyRuleHits = d2.ok
        ? d2.data.advice.filter((a) => a.system === "rule").map((a) => a.source).join(",")
        : "-";
      return out;
    })()`)
    .catch((e) => ({ probeError: String(e) }));

  report.probe = probe;
  console.log("[verify:main] 真实 IPC 探测:", JSON.stringify(probe));

  fs.mkdirSync(OUT, { recursive: true });
  try {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, "real-main.png"), img.toPNG());
    console.log("[verify:main] 截图 → .uishot/real-main.png");
  } catch (e) {
    console.log("[verify:main] 截图失败:", String(e));
  }

  report.rendererErrors = rendererErrors;
  console.log(
    "[verify:main] 渲染层错误:",
    rendererErrors.length ? JSON.stringify(rendererErrors) : "无"
  );
  fs.writeFileSync(path.join(OUT, "verify-main.json"), JSON.stringify(report, null, 2));

  const failed = Object.entries(report)
    .filter(([, v]) => v && typeof v === "object" && v.ok === false)
    .map(([k]) => k);
  console.log(failed.length ? `[verify:main] 未通过：${failed.join(", ")}` : "[verify:main] 全部通过");
  app.exit(failed.length ? 1 : 0);
});
