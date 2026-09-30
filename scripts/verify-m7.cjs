/**
 * M7 服务层校验：反馈记录 CRUD + 回测命中率统计。
 *
 * 用法：npm run build:electron && npm run verify:m7
 *
 * ⚠️ 本脚本必须跑在 **Electron** 里：feedback 服务要落 SQLite，
 * 而 better-sqlite3 在本项目是按 Electron ABI 编译的，纯 Node 加载不了。
 * 脚本会自动剥离 ELECTRON_RUN_AS_NODE 并以子进程重启自己；
 * 同时把 userData 重定向到仓库内的 .verify-userdata-m7，绝不碰真实数据。
 */
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.join(__dirname, "..");
const USER_DATA = path.join(ROOT, ".verify-userdata-m7");

if (!process.versions.electron || "ELECTRON_RUN_AS_NODE" in process.env) {
  const { spawnSync } = require("node:child_process");
  const exe = require("electron");
  if (typeof exe !== "string") {
    console.error("[verify:m7] 无法定位 electron 可执行文件，请先 npm install");
    process.exit(1);
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const ret = spawnSync(exe, [__filename], { stdio: "inherit", env });
  process.exit(ret.status ?? 1);
}

const { app } = require("electron");
// 必须在 app ready 之前改，确保 getDataDir() 指向隔离目录
fs.rmSync(USER_DATA, { recursive: true, force: true });
app.setPath("userData", USER_DATA);

let failed = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => {
  failed += 1;
  console.log(`  ✗ ${m}`);
};
const check = (cond, good, bad) => (cond ? ok(good) : fail(bad ?? good));

function head(t) {
  console.log("\n" + "=".repeat(72));
  console.log(t);
  console.log("=".repeat(72));
}

app.whenReady().then(() => {
  const SVC = path.join(ROOT, "dist-electron", "services");
  const fb = require(path.join(SVC, "feedback.js"));
  const daily = require(path.join(SVC, "daily.js"));
  const { getDb } = require(path.join(ROOT, "dist-electron", "db", "database.js"));

  // 触发建表
  getDb();

  /* ================= A. 事件类型表 ================= */
  head("A. 事件类型表");
  {
    const types = fb.eventTypes();
    check(types.length === 9, `9 种事件类型（实际 ${types.length}）`);
    const keys = types.map((t) => t.key);
    check(new Set(keys).size === keys.length, "事件类型 key 无重复");
    const expectGroups = {
      好事: "事业",
      进财: "财运",
      破财: "财运",
      罚单: "出行",
      争吵: "人际",
      生病: "健康",
      工作压力: "事业",
      出行不顺: "出行",
      其他: null
    };
    let gOk = true;
    for (const [k, g] of Object.entries(expectGroups)) {
      const t = types.find((x) => x.key === k);
      if (!t || t.group !== g) {
        gOk = false;
        fail(`${k} 的分类应为 ${g}，实际 ${t ? t.group : "缺失"}`);
      }
    }
    check(gOk, "各事件类型的关联分类正确");

    check(fb.eventTypeMeta("生病").polarity === "bad", "生病 = bad");
    check(fb.eventTypeMeta("好事").polarity === "good", "好事 = good");
    check(fb.eventTypeMeta("其他").polarity === "neutral", "其他 = neutral");
    check(fb.eventTypeMeta("不存在").key === "其他", "未知类型兜底为「其他」");
  }

  /* ================= B. CRUD ================= */
  head("B. 反馈记录 CRUD");
  {
    const created = fb.createFeedback({ date: "2026-09-30", eventType: "生病", description: "感冒" });
    check(created.id > 0, `创建记录返回 id=${created.id}`);
    check(created.group === "健康" && created.polarity === "bad", "创建结果带上分类与吉凶");

    check(fb.listFeedbacks().length === 1, "列表返回 1 条");

    // 排序：按日期倒序
    fb.createFeedback({ date: "2026-08-01", eventType: "破财" });
    fb.createFeedback({ date: "2026-10-15", eventType: "争吵" });
    const sorted = fb.listFeedbacks().map((f) => f.date);
    check(
      JSON.stringify(sorted) === JSON.stringify(["2026-10-15", "2026-09-30", "2026-08-01"]),
      `列表按日期倒序（实际 ${sorted.join(",")}）`
    );

    // 校验
    let e1 = false;
    try {
      fb.createFeedback({ date: "2026/09/30", eventType: "生病" });
    } catch {
      e1 = true;
    }
    check(e1, "非法日期格式被拒绝");

    let e2 = false;
    try {
      fb.createFeedback({ date: "2026-09-30", eventType: "瞎填" });
    } catch {
      e2 = true;
    }
    check(e2, "未知事件类型被拒绝");

    // 更新
    const upd = fb.updateFeedback(created.id, { eventType: "好事", description: "改成好事" });
    check(upd && upd.event_type === "好事" && upd.description === "改成好事", "更新记录生效");
    check(fb.updateFeedback(99999, { eventType: "生病" }) === null, "更新不存在的记录返回 null");
    let e3 = false;
    try {
      fb.updateFeedback(created.id, { eventType: "瞎填" });
    } catch {
      e3 = true;
    }
    check(e3, "更新时非法事件类型被拒绝");

    // 按档案过滤
    const p = getDb().prepare("INSERT INTO profiles (name, gender, birth_time) VALUES (?,?,?)").run("测试档案", "male", "1990-01-01 12:30");
    const pid = Number(p.lastInsertRowid);
    fb.createFeedback({ profileId: pid, date: "2026-09-01", eventType: "罚单" });
    check(fb.listFeedbacks(pid).length === 1, "按档案过滤只返回该档案的记录");
    check(fb.listFeedbacks().length === 4, "不过滤时返回全部 4 条");

    // 删除
    check(fb.deleteFeedback(created.id) === true, "删除返回 true");
    check(fb.deleteFeedback(created.id) === false, "重复删除返回 false");

    // 清空（按档案）
    const removed = fb.clearFeedbacks(pid);
    check(removed === 1, `按档案清空删除 1 条（实际 ${removed}）`);
    check(fb.listFeedbacks().length === 2, "清空后剩 2 条");
  }

  /* ================= C. 回测：命中判定 ================= */
  head("C. 回测：命中判定");
  {
    fb.clearFeedbacks();

    // 先扫一段日期，找到「健康组有 caution/warning」的一天与「事业组有 info」的**另一天**
    const scanDays = 60;
    let warnHealthDate = null;
    let infoCareerDate = null;
    const d0 = new Date(2026, 7, 1);
    for (let i = 0; i < scanDays; i += 1) {
      const d = new Date(d0.getTime());
      d.setDate(d.getDate() + i);
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const r = daily.calcDaily({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
      const health = r.groups["健康"] ?? [];
      if (!warnHealthDate && health.some((a) => a.level === "caution" || a.level === "warning")) {
        warnHealthDate = ymd;
      }
      const career = r.groups["事业"] ?? [];
      if (!infoCareerDate && ymd !== warnHealthDate && career.some((a) => a.level === "info")) {
        infoCareerDate = ymd;
      }
    }
    check(!!warnHealthDate, `找到健康组有警示的日期：${warnHealthDate}`);
    check(
      !!infoCareerDate && infoCareerDate !== warnHealthDate,
      `找到另一天事业组有 info 的日期：${infoCareerDate}`
    );

    // 凶性事件命中：在有警示的日子记「生病」
    fb.createFeedback({ date: warnHealthDate, eventType: "生病", description: "回测-应命中" });
    // 凶性事件不命中：在同一天记「破财」，若当日财运组无警示则应不命中
    const warnDay = daily.calcDaily({
      year: +warnHealthDate.slice(0, 4),
      month: +warnHealthDate.slice(5, 7),
      day: +warnHealthDate.slice(8, 10)
    });
    const wealthHasWarn = (warnDay.groups["财运"] ?? []).some(
      (a) => a.level === "caution" || a.level === "warning"
    );
    fb.createFeedback({ date: warnHealthDate, eventType: "破财", description: "回测-财运" });
    // 中性事件
    fb.createFeedback({ date: warnHealthDate, eventType: "其他", description: "回测-不计分" });
    // 吉性事件
    fb.createFeedback({ date: infoCareerDate, eventType: "好事", description: "回测-吉" });

    const r = fb.backtest({ dateFrom: "2026-08-01", dateTo: "2026-09-29" });
    check(r.rows.length === 60, `回测 60 天逐日行（实际 ${r.rows.length}）`);
    check(r.summary.days === 60, "summary.days = 60");

    const warnRow = r.rows.find((x) => x.date === warnHealthDate);
    const illEvent = warnRow.events.find((e) => e.eventType === "生病");
    const wealthEvent = warnRow.events.find((e) => e.eventType === "破财");
    const otherEvent = warnRow.events.find((e) => e.eventType === "其他");
    check(illEvent.hit === true, "「生病」在有健康警示的日子判定命中");
    check(illEvent.matched.length > 0 && illEvent.matched[0].level !== "info", "命中附带具体条目与级别");
    // 当日财运组有警示 → 破财应命中；无警示 → 应不命中
    check(
      wealthEvent.hit === wealthHasWarn,
      `「破财」判定与当日财运组警示一致（当日财运${wealthHasWarn ? "有" : "无"}警示，判定 ${wealthEvent.hit}）`
    );
    check(otherEvent.hit === null, "「其他」不计分（hit = null）");

    const goodRow = r.rows.find((x) => x.date === infoCareerDate);
    const goodEvent = goodRow.events.find((e) => e.eventType === "好事");
    check(goodEvent.hit === true, "「好事」在事业组有 info 的日子判定命中");

    // 统计口径
    check(r.summary.scoredEvents === 3, `计分事件 3 条（实际 ${r.summary.scoredEvents}）`);
    check(r.summary.eventDays === 2, `有事件的天数 2（实际 ${r.summary.eventDays}）`);
    check(
      Math.abs(r.summary.hitRate - r.summary.hitEvents / r.summary.scoredEvents) < 1e-9,
      `hitRate = hit/scored（${r.summary.hitEvents}/${r.summary.scoredEvents} = ${r.summary.hitRate.toFixed(3)}）`
    );
    check(r.summary.quietDays === 58, `无事件天数 58（实际 ${r.summary.quietDays}）`);
    const sumByType = r.summary.byType.reduce((n, t) => n + t.total, 0);
    check(sumByType === 3, `byType 合计 = 计分事件数（${sumByType}）`);
    check(
      r.summary.byType.every((t) => Math.abs(t.rate - t.hit / t.total) < 1e-9),
      "byType 各项 rate 自洽"
    );
    check(r.summary.ruleTop.length > 0, `规则命中频次 Top 非空（${r.summary.ruleTop.length} 条）`);
    check(
      r.summary.ruleTop.every((x) => x.days >= 1 && x.days <= 60),
      "规则命中天数在 [1, 区间天数] 范围内"
    );
    check(
      r.summary.ruleTop[0].days >= r.summary.ruleTop[r.summary.ruleTop.length - 1].days,
      "规则频次按天数降序"
    );

    // 逐日行级别与分组统计自洽
    const sample = r.rows[0];
    const groupSum = Object.values(sample.groups).reduce((a, b) => a + b, 0);
    check(groupSum === sample.adviceCount, `首日分组计数合计 = 事项数（${groupSum} / ${sample.adviceCount}）`);
    check(["info", "caution", "warning"].includes(sample.topLevel), `topLevel 取值合法：${sample.topLevel}`);
  }

  /* ================= D. 回测：边界与异常 ================= */
  head("D. 回测边界");
  {
    let e1 = false;
    try {
      fb.backtest({ dateFrom: "2026-09-30", dateTo: "2026-08-01" });
    } catch {
      e1 = true;
    }
    check(e1, "结束早于开始被拒绝");

    let e2 = false;
    try {
      fb.backtest({ dateFrom: "2020-01-01", dateTo: "2026-01-01" });
    } catch {
      e2 = true;
    }
    check(e2, "区间过长（>400 天）被拒绝");

    let e3 = false;
    try {
      fb.backtest({ dateFrom: "2026/09/30", dateTo: "2026-09-30" });
    } catch {
      e3 = true;
    }
    check(e3, "非法日期格式被拒绝");

    // 单日区间
    const one = fb.backtest({ dateFrom: "2026-09-30", dateTo: "2026-09-30" });
    check(one.rows.length === 1 && one.summary.days === 1, "单日区间可用");
    check(one.summary.quietDays === 1 || one.summary.eventDays === 1, "单日统计口径正确");

    // 无任何事件时应给 0 命中率而不是 NaN
    fb.clearFeedbacks();
    const none = fb.backtest({ dateFrom: "2026-09-01", dateTo: "2026-09-10" });
    check(none.summary.scoredEvents === 0 && none.summary.hitRate === 0, "无事件时 hitRate = 0（不产生 NaN）");

    // 带生辰的回测（走真太阳时的八字 + 紫微流日分支）
    const withBirth = fb.backtest({
      dateFrom: "2026-09-25",
      dateTo: "2026-09-30",
      birth: { gender: "男", year: 1990, month: 1, day: 1, timeIndex: 6, hour: 12, minute: 30 }
    });
    check(withBirth.rows.length === 6, "带生辰回测可正常跑通");
    check(
      withBirth.rows.every((x) => x.adviceCount >= 3 && x.adviceCount <= 10),
      "带生辰时每日事项数仍在 3~10"
    );
  }

  /* ================= E. CSV 导出 ================= */
  head("E. CSV 导出");
  {
    fb.clearFeedbacks();
    fb.createFeedback({ date: "2026-09-20", eventType: "争吵", description: '含"引号"与,逗号' });
    const r = fb.backtest({ dateFrom: "2026-09-18", dateTo: "2026-09-22" });
    const csv = fb.backtestCsv(r);
    const lines = csv.split("\r\n").filter(Boolean);
    check(csv.startsWith("日期,星期,事项数,最高级别,事件,事件类型,是否命中,说明"), "CSV 表头正确");
    check(
      lines.length === 6,
      `表头 1 行 + 数据行 5 行（4 天无事件 + 1 天有事件）= 6（实际 ${lines.length}）`
    );
    check(csv.includes('"争吵"'), "事件类型已加引号");
    check(csv.includes('"含""引号""与,逗号"'), "双引号与逗号已正确转义");
    check(csv.split("\r\n").length >= 2 && csv.endsWith("\r\n"), "使用 CRLF 行尾且以换行收尾");
  }

  /* ================= F. 压测 ================= */
  head("F. 压测：365 天回测");
  {
    fb.clearFeedbacks();
    for (let i = 0; i < 30; i += 1) {
      const d = new Date(2026, 0, 1 + i * 10);
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      fb.createFeedback({ date: ymd, eventType: ["破财", "争吵", "生病", "罚单", "好事"][i % 5] });
    }
    const t0 = Date.now();
    const r = fb.backtest({ dateFrom: "2026-01-01", dateTo: "2026-12-31" });
    const ms = Date.now() - t0;
    check(r.rows.length === 365, `365 天逐日行（实际 ${r.rows.length}）`);
    check(r.summary.eventDays === 30, `有事件天数 30（实际 ${r.summary.eventDays}）`);
    check(
      r.rows.every((x) => x.adviceCount >= 3 && x.adviceCount <= 10 && x.events.every((e) => e.hit !== undefined)),
      "365 天全部合格"
    );
    console.log(`  365 天回测耗时 ${ms} ms，命中 ${r.summary.hitEvents}/${r.summary.scoredEvents}（${(r.summary.hitRate * 100).toFixed(1)}%）`);
  }

  console.log("\n" + "=".repeat(72));
  console.log(failed === 0 ? "全部通过" : `未通过：${failed} 项`);
  console.log("=".repeat(72));

  try {
    getDb().close();
  } catch {
    /* ignore */
  }
  fs.rmSync(USER_DATA, { recursive: true, force: true });
  app.exit(failed === 0 ? 0 : 1);
});
