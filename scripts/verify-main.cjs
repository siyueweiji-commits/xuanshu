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
  //    注意：下面这段是**注入到渲染层执行的字符串**，里面不能出现反引号或 ${}，
  //    否则会截断外层模板字符串（踩过一次），一律用字符串拼接。
  const NO_SOURCE_DIR = path.join(ROOT, ".no-such-update-source");
  const probe = await win.webContents
    .executeJavaScript(`(async () => {
      const NO_SOURCE_DIR = ${JSON.stringify(NO_SOURCE_DIR)};
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

      // M5 规则库管理
      const ro = await call("rules:overview");
      out.rulesOverview = ro.ok
        ? ro.data.total + " 条 / 生效 " + ro.data.enabled + " / 内置文件 " + ro.data.builtinFiles.length + " / 系统 " + ro.data.systems.join(",")
        : ro.error;
      const ex = await call("rules:export", { system: "huangli" });
      out.rulesExport = ex.ok ? ex.data.count + " 条" : ex.error;
      const imp = ex.ok ? await call("rules:import", { json: ex.data.json, mode: "merge" }) : null;
      out.rulesImport = imp ? (imp.ok ? "导入 " + imp.data.imported + " 跳过 " + imp.data.skipped : imp.error) : "-";
      // 导入会写用户覆盖文件，测完逐个删除，避免污染真实用户目录
      if (ex.ok) {
        const ids = (JSON.parse(ex.data.json).rules || []).map((r) => r.id);
        let removed = 0;
        for (const id of ids) {
          const rr = await call("rules:remove", { id });
          if (rr.ok && rr.data.removed) removed += 1;
        }
        const back = await call("rules:overview");
        out.rulesCleanup = removed + " 条覆盖已移除 / 用户文件 " + (back.ok ? back.data.userFiles.length : "?");
      }

      // M5 模板 + 报告
      const tl = await call("templates:list");
      out.templates = tl.ok ? tl.data.map((t) => t.id + ":" + t.scope).join(",") : tl.error;

      const r1 = await call("report:build", { scope: "daily", date: "2026-09-30", profileName: "验证档案" });
      out.reportDaily = r1.ok
        ? r1.data.sections.length + " 段 / " + r1.data.contentMd.length + " 字 / 免责=" + r1.data.hasDisclaimer
        : r1.error;

      const r2 = await call("report:build", {
        scope: "range", date: "2026-09-28", days: 7,
        birth: { gender: "男", year: 1990, month: 1, day: 1, hour: 12, minute: 30, city: "孝感", useTrueSolar: true }
      });
      out.reportRange = r2.ok
        ? r2.data.range.days + " 天 / " + r2.data.range.totalAdvice + " 条 / 重点日 " + r2.data.range.keyDays.length
        : r2.error;

      // 建临时档案 → 落库 → 列表 → 详情 → 导出 → 清理
      const pc = await call("profile:create", { name: "验证档案-M5", gender: "male", birth_time: "1990-01-01T12:30:00" });
      const pid = pc.ok ? pc.data.id : null;
      const d3 = pid ? await call("daily:fortune", {
        year: 2026, month: 9, day: 30, profileId: pid,
        birth: { gender: "男", year: 1990, month: 1, day: 1, hour: 12, minute: 30, city: "孝感", useTrueSolar: true }
      }) : null;
      out.dailyPersist = d3 ? (d3.ok ? "savedId=" + d3.data.savedId : d3.error) : "-";
      const ds = pid ? await call("daily:saved", { profileId: pid, date: "2026-09-30" }) : null;
      out.dailySaved = ds && ds.ok && ds.data ? "回读 " + (ds.data.advice || []).length + " 条建议" : "-";

      const rs = await call("report:save", { result: r1.ok ? r1.data : null });
      const rid = rs.ok ? rs.data.id : null;
      out.reportSave = rs.ok ? "id=" + rid : rs.error;
      const rl = await call("report:list", { limit: 5 });
      out.reportList = rl.ok ? rl.data.length + " 条 / Top1=" + (rl.data[0] ? rl.data[0].title : "-") : rl.error;
      const rg = rid ? await call("report:get", { id: rid }) : null;
      out.reportGet = rg && rg.ok ? rg.data.content_md.length + " 字 / data.summary=" + JSON.stringify(rg.data.data.summary) : (rg ? rg.error : "-");
      const rx = rid ? await call("report:export", { id: rid }) : null;
      out.reportExport = rx && rx.ok ? rx.data.path : (rx ? rx.error : "-");
      const rd = rid ? await call("report:delete", { id: rid }) : null;
      out.reportDelete = rd && rd.ok ? "deleted=" + rd.data.deleted : (rd ? rd.error : "-");
      if (pid) await call("report:clear", { profileId: pid });
      if (pid) await call("profile:delete", { id: pid });

      // M6 梅花：三法起卦
      const m1 = await call("divination:meihua", { mode: "time", datetime: "2026-09-30 14:30" });
      out.meihuaTime = m1.ok
        ? [m1.data.original.name, "动" + m1.data.movingLine, "体" + m1.data.body.name + "用" + m1.data.use.name,
           m1.data.relation.kind, "解读" + m1.data.advice.length,
           "历法" + m1.data.timeParts.lunarText + "/" + m1.data.timeParts.hourName].join(" / ")
        : m1.error;
      const m2 = await call("divination:meihua", { mode: "numbers", num1: 3, num2: 7 });
      out.meihuaNumbers = m2.ok
        ? [m2.data.original.name, "互" + m2.data.mutual.name, "变" + m2.data.changed.name,
           "错" + m2.data.opposite.name, "综" + m2.data.reversed.name].join(" / ")
        : m2.error;
      const m3 = await call("divination:meihua", { mode: "baoshu", num1: 5, num2: 8, num3: 3 });
      out.meihuaBaoshu = m3.ok ? m3.data.original.name + " / 动" + m3.data.movingLine : m3.error;

      // M6 六爻：铜钱 + 手动录入
      const l1 = await call("divination:liuyao", { question: "端到端验证", datetime: "2026-09-30 14:30" });
      out.liuyaoCoins = l1.ok
        ? [l1.data.original.name + (l1.data.changed ? "→" + l1.data.changed.name : "（静）"),
           "世" + l1.data.shi + "应" + l1.data.ying,
           "宫" + l1.data.meta.palace + l1.data.meta.palaceWuxing,
           "日" + l1.data.dayGanZhi, "空" + l1.data.xunKong.join(""),
           "解读" + l1.data.advice.length,
           "首爻" + l1.data.lines[0].liuShen + l1.data.lines[0].liuQin + l1.data.lines[0].ganZhi].join(" / ")
        : l1.error;
      const l2 = await call("divination:liuyao", {
        mode: "manual",
        datetime: "2026-09-30 14:30",
        manualLines: [1, 1, 1, 1, 1, 1].map((v, i) => ({ value: v, changing: i === 0 }))
      });
      out.liuyaoManual = l2.ok
        ? [l2.data.original.name + "→" + l2.data.changed.name, "动爻" + l2.data.movingLines.join(","),
           "六冲" + l2.data.isChong, "世6应3=" + (l2.data.shi === 6 && l2.data.ying === 3),
           "上爻" + l2.data.lines[5].ganZhi].join(" / ")
        : l2.error;
      const l3 = await call("divination:liuyao", {
        mode: "manual",
        datetime: "2026-09-30 14:30",
        manualLines: [1, 0, 0, 0, 1, 0].map((v) => ({ value: v }))
      });
      out.liuyaoFuShen = l3.ok
        ? (l3.data.lines.filter((x) => x.fuShen).map((x) => "第" + x.position + "爻伏" + x.fuShen.liuQin + x.fuShen.ganZhi).join(",") || "无伏神")
        : l3.error;

      // 非法输入应被拒绝（确保错误经 IPC 正确回传，而不是静默成功）
      const bad = await call("divination:meihua", { mode: "numbers", num1: 0, num2: 5 });
      out.meihuaInvalidRejected = bad.ok === false;
      const bad2 = await call("divination:liuyao", { mode: "manual", manualLines: [{ value: 1 }] });
      out.liuyaoInvalidRejected = bad2.ok === false;

      // M7 反馈与回测（只读探测 + 一次可回收的写入）
      const ft = await call("feedback:types");
      out.feedbackTypes = ft.ok ? ft.data.map((t) => t.key).join(",") : ft.error;
      const fc = await call("feedback:create", { date: "2026-09-30", eventType: "好事", description: "端到端探测" });
      const fid = fc.ok ? fc.data.id : null;
      out.feedbackCreate = fc.ok ? "id=" + fid + " group=" + fc.data.group : fc.error;
      const fl = await call("feedback:list", { limit: 5 });
      out.feedbackList = fl.ok
        ? fl.data.length + " 条 / Top1=" + (fl.data[0] ? fl.data[0].date + " " + fl.data[0].event_type : "-")
        : fl.error;
      const bt = await call("feedback:backtest", { dateFrom: "2026-09-28", dateTo: "2026-09-30" });
      out.feedbackBacktest = bt.ok
        ? bt.data.summary.days + " 天 / 计分 " + bt.data.summary.scoredEvents +
          " / 命中 " + bt.data.summary.hitEvents +
          " / 率 " + (bt.data.summary.hitRate * 100).toFixed(0) + "%"
        : bt.error;
      if (fid) await call("feedback:delete", { id: fid });
      out.feedbackCleanup = fid ? "已删除探测记录" : "-";

      // M8 数据更新（只读探测 + 设置项往返；不做真实更新，避免污染真实用户目录）
      const uo = await call("update:overview");
      out.updateOverview = uo.ok
        ? "版本 " + uo.data.version + " / 自动检查 " + uo.data.autoCheck +
          " / 资源 " + uo.data.kinds.map((k) => k.kind + ":" + k.builtin).join(",")
        : uo.error;
      const us0 = await call("update:settings");
      const us1 = await call("update:set-settings", { autoCheck: false });
      const us2 = await call("update:set-settings", { autoCheck: us0.ok ? us0.data.autoCheck : true });
      out.updateSettings = us1.ok && us2.ok ? "读写往返正常（autoCheck=" + us2.data.autoCheck + "）" : "FAIL";
      const uc = await call("update:check", { sourceUrl: NO_SOURCE_DIR });
      out.updateCheckOffline = uc.ok && uc.data && uc.data.ok === false && uc.data.error
        ? "离线优雅降级：" + uc.data.error
        : "FAIL";
      const ub = await call("update:backups");
      out.updateBackups = ub.ok ? ub.data.length + " 个快照" : ub.error;
      const ul = await call("update:logs", { limit: 5 });
      out.updateLogs = ul.ok ? ul.data.length + " 条日志" : ul.error;
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
