/**
 * UI 截图验证：用 Electron 真实渲染 dist/ 产物，逐路由截图落盘到 .uishot/。
 *
 * 用法：
 *   npm run shot                # 全部页面（先自动 npm run build）
 *   npm run shot -- ziwei bazi  # 只截指定页面
 *
 * 本机环境变量 ELECTRON_RUN_AS_NODE=1 会让 electron 退化成纯 Node，
 * 因此脚本会自动剥离该变量并以子进程方式重启自己，无需手工处理。
 */
const path = require("node:path");
const fs = require("node:fs");

/* ---------- 0. 环境自举：确保真的跑在 Electron 里 ---------- */
const inRealElectron = Boolean(process.versions.electron) && !("ELECTRON_RUN_AS_NODE" in process.env);

if (!inRealElectron) {
  const { spawnSync } = require("node:child_process");
  const electronExe = require("electron");
  if (typeof electronExe !== "string") {
    console.error("[ui-shot] 无法定位 electron 可执行文件，请先 npm install");
    process.exit(1);
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const ret = spawnSync(electronExe, [__filename, ...process.argv.slice(2)], {
    stdio: "inherit",
    env
  });
  process.exit(ret.status ?? 1);
}

const { app, BrowserWindow } = require("electron");

/* ---------- 1. 配置 ---------- */
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, ".uishot");
const INDEX = path.join(ROOT, "dist", "index.html");
const PRELOAD = path.join(__dirname, "ui-shot-preload.cjs");

const VIEW_W = 1280;
const VIEW_H = 820;
const MAX_STRIPS = 6;

/**
 * click：加载后要点的按钮文字（触发真实排盘 / 起卦）
 * pre ：点击之前执行的额外脚本
 */
const PAGES = [
  { key: "home", hash: "#/", title: "首页" },
  { key: "liuri", hash: "#/liuri", title: "流日黄历" },
  {
    key: "liuri-personal",
    hash: "#/liuri",
    title: "流日黄历·叠加命盘",
    pre: `(() => { const c = [...document.querySelectorAll('input[type=checkbox]')].find(x => x.parentElement.textContent.includes('叠加个人命盘')); c && c.click(); return 'ok'; })()`,
    click: "查询"
  },
  { key: "lifa", hash: "#/lifa", title: "历法转换", click: "换算" },
  {
    key: "ziwei",
    hash: "#/ziwei",
    title: "紫微斗数",
    pre: `document.querySelector('input[type=checkbox]')?.click()`,
    click: "排盘"
  },
  { key: "bazi", hash: "#/bazi", title: "八字", click: "排盘" },
  { key: "meihua", hash: "#/meihua", title: "梅花易数", click: "起卦" },
  {
    key: "meihua-baoshu",
    hash: "#/meihua",
    title: "梅花·报数起卦",
    pre: `(() => { const s = [...document.querySelectorAll('.seg-item')].find(x => x.textContent.trim() === '报数起卦'); s && s.click(); return 'ok'; })()`,
    click: "起卦"
  },
  { key: "liuyao", hash: "#/liuyao", title: "六爻", click: "掷铜钱起卦" },
  {
    key: "liuyao-manual",
    hash: "#/liuyao",
    title: "六爻·手动录入",
    pre: `(() => { const s = [...document.querySelectorAll('.seg-item')].find(x => x.textContent.trim() === '手动录入'); s && s.click();
      return 'ok'; })()`,
    click: "按录入装卦"
  },
  { key: "report", hash: "#/report", title: "报告·单日", click: "生成报告" },
  {
    key: "report-range",
    hash: "#/report",
    title: "报告·区间含命盘",
    pre: `(() => { const s = [...document.querySelectorAll('.seg-item')].find(x => x.textContent.trim() === '区间'); s && s.click();
      const c = [...document.querySelectorAll('input[type=checkbox]')].find(x => x.parentElement.textContent.includes('叠加个人命盘')); c && c.click();
      return 'ok'; })()`,
    click: "生成报告"
  },
  { key: "feedback", hash: "#/feedback", title: "反馈与回测", click: "开始回测" },
  { key: "settings", hash: "#/settings", title: "设置" }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 等合成器真正把这一帧画完（隐藏窗口下 resize 后会出现陈旧帧） */
async function settle(win, extra = 160) {
  await win.webContents
    .executeJavaScript(
      `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))`
    )
    .catch(() => {});
  await sleep(extra);
}

/** 截图：先丢弃一帧已规避合成器陈旧画面，再取磁盘落盘 */
async function shoot(win, file) {
  await settle(win);
  await win.webContents.capturePage();
  await sleep(140);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(file, img.toPNG());
}

function clickByText(text) {
  return `(() => {
    const t = ${JSON.stringify(text)};
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === t);
    if (!b) return "NOT_FOUND:" + t;
    b.click();
    return "CLICKED:" + t;
  })()`;
}

/* ---------- 2. 主流程 ---------- */
async function main() {
  if (!fs.existsSync(INDEX)) {
    console.error(`[ui-shot] 未找到构建产物：${INDEX}\n请先执行 npm run build`);
    app.exit(1);
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });

  // argv[0]=electron，argv[1]=本脚本路径，其余才是页面名
  const only = process.argv.slice(1).filter((a) => !a.startsWith("-") && !a.endsWith(".cjs"));
  const pages = only.length ? PAGES.filter((p) => only.includes(p.key)) : PAGES;
  if (!pages.length) {
    console.error(`[ui-shot] 未匹配到页面，可选：${PAGES.map((p) => p.key).join(", ")}`);
    app.exit(1);
    return;
  }

  const win = new BrowserWindow({
    width: VIEW_W,
    height: VIEW_H,
    show: false,
    backgroundColor: "#f5f5f7",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  const logs = [];
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 2) logs.push(`[renderer:${level}] ${message}`);
  });

  await win.loadFile(INDEX);
  await settle(win, 400);

  const results = [];
  for (const page of pages) {
    await win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(page.hash)}; void 0;`);
    await settle(win, 380);

    if (page.pre) {
      await win.webContents.executeJavaScript(page.pre).catch(() => {});
      await sleep(180);
    }

    let action = null;
    if (page.click) {
      action = await win.webContents.executeJavaScript(clickByText(page.click)).catch((e) => String(e));
      await sleep(800);
    }

    // 窗口尺寸全程固定，靠滚动 main 逐屏截图（改尺寸会让合成器出陈旧帧）
    const metrics = await win.webContents
      .executeJavaScript(
        `(() => { const m = document.querySelector("main");
           return m ? { height: Math.ceil(m.scrollHeight), viewport: m.clientHeight } : { height: 0, viewport: 0 }; })()`
      )
      .catch(() => ({ height: 0, viewport: 0 }));

    const strips = Math.max(1, Math.min(Math.ceil(metrics.height / Math.max(metrics.viewport, 1)), MAX_STRIPS));
    const files = [];
    for (let i = 0; i < strips; i += 1) {
      await win.webContents
        .executeJavaScript(`document.querySelector("main").scrollTop = ${i * metrics.viewport}; void 0;`)
        .catch(() => {});
      const file = i === 0 ? `${page.key}.png` : `${page.key}-${i + 1}.png`;
      await shoot(win, path.join(OUT, file));
      files.push(file);
    }
    await win.webContents
      .executeJavaScript(`document.querySelector("main").scrollTop = 0; void 0;`)
      .catch(() => {});

    results.push({
      page: page.key,
      title: page.title,
      action,
      contentHeight: metrics.height,
      shots: files
    });
    console.log(
      `[ui-shot] ${page.key.padEnd(9)} action=${String(action).padEnd(22)} 内容高=${metrics.height} 分屏=${strips}`
    );
  }

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ results, logs }, null, 2));

  if (logs.length) {
    console.log("\n[ui-shot] 渲染层告警/错误：");
    logs.forEach((l) => console.log("  " + l));
  } else {
    console.log("\n[ui-shot] 渲染层无告警/错误。");
  }
  console.log(`[ui-shot] 输出目录：${OUT}`);

  app.exit(0);
}

app.whenReady().then(main);
