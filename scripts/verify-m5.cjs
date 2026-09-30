/**
 * M5 服务层校验：模板引擎 / 报告生成 / 规则库管理。
 *
 * 用法：npm run build:electron && npm run verify:m5
 *
 * 服务层依赖 Electron 的 `app.getPath("userData")`，纯 Node 下不存在，
 * 这里劫持模块解析注入一个最小 stub（用户数据目录指向仓库内 .verify-userdata）。
 */
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");

const ROOT = path.join(__dirname, "..");
const STUB = path.join(__dirname, ".electron-stub.cjs");
const USER_DATA = path.join(ROOT, ".verify-userdata");

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "electron") return STUB;
  return origResolve.call(this, request, ...args);
};
require.cache[STUB] = {
  id: STUB,
  filename: STUB,
  loaded: true,
  exports: {
    app: {
      getPath: () => USER_DATA,
      getName: () => "XuanShu",
      getVersion: () => "0.0.0"
    }
  }
};

const SVC = path.join(ROOT, "dist-electron", "services");
const tpl = require(path.join(SVC, "template.js"));
const report = require(path.join(SVC, "report.js"));
const rules = require(path.join(SVC, "rules.js"));

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

// 清掉上次跑残留的用户规则，保证从干净状态开始
fs.rmSync(USER_DATA, { recursive: true, force: true });

/* ================= A. 模板引擎 ================= */
head("A. 模板引擎");
{
  const v = {
    name: "玄枢",
    n: 3,
    zero: 0,
    empty: "",
    list: ["甲", "乙", "丙"],
    emptyList: [],
    rows: [
      { k: "事业", v: "推进" },
      { k: "财运", v: "守成" }
    ],
    groups: [{ g: "事业", items: [{ t: "a" }, { t: "b" }] }]
  };

  /** 模板渲染结果统一以单个换行结尾，比较时先归一 */
  const R = (src, vars) => tpl.renderTemplate(src, vars).replace(/\n+$/, "");

  check(R("你好 {{name}}，共 {{n}} 条", v) === "你好 玄枢，共 3 条", "标量插值");
  check(tpl.renderTemplate("缺失={{nope}} 空={{empty}}", v).includes("缺失=—"), "缺失变量渲染为「—」");
  check(tpl.renderTemplate("空={{empty}}", v).includes("空=—"), "空字符串渲染为「—」");
  check(tpl.renderTemplate("零={{zero}}", v).includes("零=0"), "数字 0 正常保留");
  check(tpl.renderTemplate("数组={{list}}", v).includes("数组=甲、乙、丙"), "数组按「、」连接");

  const block = R("{{#list}}[{{.}}]{{/list}}", v);
  check(block === "[甲][乙][丙]", "区块按数组重复", `区块输出异常：${block}`);

  const rows = R("{{#rows}}{{k}}:{{v}}\n{{/rows}}", v);
  check(rows === "事业:推进\n财运:守成", "区块按对象字段取值", `输出异常：${JSON.stringify(rows)}`);

  const inverted = R("{{^emptyList}}没有数据{{/emptyList}}", v);
  check(inverted === "没有数据", "反向区块在空数组时渲染", `输出异常：${JSON.stringify(inverted)}`);

  const invertedSkip = R("{{^list}}不应出现{{/list}}", v);
  check(invertedSkip === "", "反向区块在非空时略去", `输出异常：${JSON.stringify(invertedSkip)}`);

  const nested = R("{{#groups}}{{g}}:{{#items}}{{t}} {{/items}}\n{{/groups}}", v);
  check(nested === "事业:a b", "嵌套区块", `输出异常：${JSON.stringify(nested)}`);

  // standalone：区块独占一行时不留空行
  const standalone = tpl.renderTemplate("头部\n{{#list}}\n- {{.}}\n{{/list}}\n尾部\n", v);
  check(
    standalone === "头部\n- 甲\n- 乙\n- 丙\n尾部\n",
    "独占一行的标签不留空行",
    `输出异常：${JSON.stringify(standalone)}`
  );

  let threw = false;
  try {
    tpl.renderTemplate("{{#list}}没闭合", v);
  } catch {
    threw = true;
  }
  check(threw, "未闭合区块抛错");

  threw = false;
  try {
    tpl.renderTemplate("{{/list}}", v);
  } catch {
    threw = true;
  }
  check(threw, "孤立闭合标签抛错");

  const vars = tpl.collectTemplateVars("{{a}} {{#b}}{{c}}{{/b}}");
  check(vars.join(",") === "a,b,c", "变量收集", `实际：${vars.join(",")}`);
}

/* ================= B. 模板文件与变量对齐 ================= */
head("B. 模板文件与变量对齐");
{
  const metas = report.listTemplates();
  check(metas.length === 2, `模板清单 2 个（实际 ${metas.length}）`);
  for (const m of metas) {
    console.log(`  · ${m.id} / ${m.name} / ${m.scope} / ${m.file}`);
  }

  // 渲染后不允许残留未替换的 {{ }}
  const noBirth = {
    scope: "daily",
    date: "2026-09-30",
    templateId: "daily_report",
    profileName: "验证档案"
  };
  const r = report.buildReport(noBirth);
  check(!/\{\{[^}]+\}\}/.test(r.contentMd), "单日报告无未替换占位符");
  check(r.hasDisclaimer, "单日报告含免责声明");
  check(r.sections.length >= 4, `单日报告切段 ${r.sections.length} 段（≥4）`);
  check(
    r.sections.every((s) => s.title && s.body.length > 0),
    "每段都有标题与正文"
  );

  const r2 = report.buildReport({
    scope: "range",
    date: "2026-09-28",
    days: 7,
    templateId: "range_report",
    profileName: "验证档案"
  });
  check(!/\{\{[^}]+\}\}/.test(r2.contentMd), "区间报告无未替换占位符");
  check(r2.hasDisclaimer, "区间报告含免责声明");
  check(r2.dateTo === "2026-10-04", `区间末日 = 2026-10-04（实际 ${r2.dateTo}）`);
}

/* ================= C. 单日报告内容 ================= */
head("C. 单日报告内容（2026-09-30 · 1990-1-1 12:30 男）");
{
  const birth = { gender: "男", year: 1990, month: 1, day: 1, hour: 12, minute: 30, timeIndex: 6 };
  const r = report.buildReport({
    scope: "daily",
    date: "2026-09-30",
    profileId: 1,
    profileName: "验证档案",
    birth
  });

  const md = r.contentMd;
  const must = [
    "2026-09-30 星期三",
    "丁未",
    "建除十二神",
    "二十八宿",
    "今日注意事项",
    "分类速览",
    "命盘要点",
    "不构成任何医疗、法律、投资或驾驶安全建议"
  ];
  for (const k of must) {
    check(md.includes(k), `报告含「${k}」`, `报告缺少「${k}」`);
  }

  check(md.includes("太阴"), "报告含流日命宫主星释义（太阴）");
  check(r.daily.advice.length >= 3 && r.daily.advice.length <= 10, `注意事项 ${r.daily.advice.length} 条（3～10）`);
  check(r.title.includes("2026-09-30"), `标题含日期：${r.title}`);

  const sectTitles = r.sections.map((s) => s.title).join(" | ");
  console.log(`  段落：${sectTitles}`);

  console.log("\n  ── 报告全文（前 60 行）──");
  md.split("\n").slice(0, 60).forEach((l) => console.log("  " + l));
}

/* ================= D. 区间报告内容 ================= */
head("D. 区间报告内容（2026-09-28 起 7 天）");
{
  const birth = { gender: "女", year: 1988, month: 6, day: 18, hour: 8, minute: 0, timeIndex: 4 };
  const r = report.buildReport({
    scope: "range",
    date: "2026-09-28",
    days: 7,
    profileName: "区间验证",
    birth
  });
  const st = r.range;
  check(st.days === 7, "区间天数 7");
  check(st.rows.length === 7, "逐日行 7 条");
  check(st.rows.every((x) => x.date && x.dayGanZhi && x.count > 0), "每行日期/日柱/条数齐备");
  const sum = Object.values(st.byGroup).reduce((a, b) => a + b, 0);
  check(sum === st.totalAdvice, `分类合计 ${sum} = 总条数 ${st.totalAdvice}`);
  console.log(`  重点日 ${st.keyDays.length} 天：${st.keyDays.map((d) => d.date).join("、") || "无"}`);
  console.log(`  高频提示 ${st.adviceTop.length} 条，Top1: ${st.adviceTop[0]?.text.slice(0, 30)}…`);
  console.log(`  分类分布 ${JSON.stringify(st.byGroup)}`);

  const tableLines = r.contentMd.split("\n").filter((l) => l.startsWith("| 2026-"));
  check(tableLines.length === 7, `Markdown 表格含 7 行日数据（实际 ${tableLines.length}）`);
}

/* ================= E. 规则库管理 ================= */
head("E. 规则库管理");
{
  const ov1 = rules.rulesOverview();
  console.log(
    `  内置文件 ${ov1.builtinFiles.length} 个 / 用户文件 ${ov1.userFiles.length} 个 / 规则 ${ov1.total} 条 / 生效 ${ov1.enabled} 条`
  );
  check(ov1.total > 20, `规则总数 ${ov1.total} 条（>20）`);
  check(ov1.userFiles.length === 0, "初始无用户规则文件");
  check(ov1.builtinFiles.every((f) => f.count > 0 && f.version), "内置文件均带版本与条数");

  const targetId = "huangli_yi_huiqinyou";
  const before = rules.rulesOverview().rules.find((r) => r.id === targetId);
  check(Boolean(before) && before.enabledFinal, `目标规则 ${targetId} 初始为启用`);

  // 禁用 → 立即不命中
  const day = { year: 2026, month: 9, day: 30 };
  const hitBefore = rules.matchRules(rules.listRules(), require(path.join(SVC, "daily.js"))
    .calcDaily(day).facts).some((r) => r.id === targetId);
  check(hitBefore, "禁用前该规则命中");

  check(rules.setRuleEnabled(targetId, false), "禁用返回 true");
  const afterOv = rules.rulesOverview();
  const after = afterOv.rules.find((r) => r.id === targetId);
  check(after && !after.enabledFinal, "禁用后 enabledFinal = false");
  check(after && after.disabledByUser, "禁用后 disabledByUser = true");
  const merged = rules.listRules().find((r) => r.id === targetId);
  check(merged && merged.enabled === false, "合并结果里该规则 enabled = false（UI 可显示为已禁用）");
  check(afterOv.userFiles.length === 1, "用户规则文件已生成");

  const facts = require(path.join(SVC, "daily.js")).calcDaily(day).facts;
  const hitAfter = rules.matchRules(rules.listRules(), facts).some((r) => r.id === targetId);
  check(!hitAfter, "禁用后不再命中（立即生效）");

  // 删除用户覆盖 → 内置恢复
  check(rules.removeUserRule(targetId), "删除用户覆盖返回 true");
  const restored = rules.rulesOverview().rules.find((r) => r.id === targetId);
  check(restored && restored.enabledFinal, "删除覆盖后恢复启用");
  check(rules.rulesOverview().userFiles.length === 0, "用户规则文件已清空");

  // 新增用户规则
  rules.createRule({
    id: "user_test_rule",
    system: "custom",
    condition: { 日柱: "丁未" },
    advice: "验证用规则：命中即说明用户规则热生效。",
    weight: 0.9,
    level: "info",
    tags: ["事业"],
    label: "自定义·验证"
  });
  const custom = rules.rulesOverview().rules.find((r) => r.id === "user_test_rule");
  check(Boolean(custom) && !custom.builtin, "新增用户规则出现在概览");
  const hitCustom = rules.matchRules(rules.listRules(), facts).some((r) => r.id === "user_test_rule");
  check(hitCustom, "用户规则立即参与匹配");

  // 校验失败路径
  let threw = false;
  try {
    rules.createRule({ id: "", system: "custom", condition: {}, advice: "x" });
  } catch {
    threw = true;
  }
  check(threw, "缺 id 的规则被拒");

  threw = false;
  try {
    rules.createRule({ id: "x", system: "custom", condition: {}, advice: "  " });
  } catch {
    threw = true;
  }
  check(threw, "缺 advice 的规则被拒");

  // 导出 / 导入往返
  const exported = rules.exportRules("huangli");
  const parsed = JSON.parse(exported);
  check(parsed.count > 0 && Array.isArray(parsed.rules), `导出 huangli 规则 ${parsed.count} 条`);

  rules.removeUserRule("user_test_rule");
  const imp = rules.importRules(exported, "merge");
  check(imp.imported === parsed.count, `导入往返 ${imp.imported} 条`);
  const firstId = parsed.rules[0].id;
  const importedRule = rules.rulesOverview().rules.find((r) => r.id === firstId);
  check(
    Boolean(importedRule) && importedRule.userOverride && importedRule.label === parsed.rules[0].label,
    `导入生成用户覆盖且内容一致（${firstId}）`
  );
  check(
    rules.matchRules(rules.listRules(), facts).some((r) => r.id === firstId) ===
      parsed.rules[0].enabled,
    "导入后启用状态沿用导出值"
  );

  const imp2 = rules.importRules(
    JSON.stringify({ rules: [{ id: "ok_1", system: "custom", condition: {}, advice: "正常" }, { nope: 1 }] }),
    "merge"
  );
  check(imp2.imported === 1 && imp2.skipped === 1, `导入过滤非法项（导入 ${imp2.imported} / 跳过 ${imp2.skipped}）`);

  for (const bad of ["不是 json", '{"nope":1}', "[]"]) {
    threw = false;
    try {
      rules.importRules(bad, "merge");
    } catch {
      threw = true;
    }
    check(threw, `非法导入被拒：${bad.slice(0, 16)}`);
  }

  // cleanup：删掉本次跑出来的全部用户规则文件
  const dir = path.join(USER_DATA, "data", "rules");
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(USER_DATA, { recursive: true, force: true });
  check(rules.rulesOverview().userFiles.length === 0, "清理后无用户规则残留");
}

/* ================= F. 压测 ================= */
head("F. 压测：区间报告 30 天 + 连续 20 组参数");
{
  const birth = { gender: "男", year: 1979, month: 12, day: 31, hour: 23, minute: 30, timeIndex: 12 };
  let errs = 0;
  let noDisclaimer = 0;
  let leftover = 0;
  let minSec = 1e9;
  let totalSec = 0;

  const t0 = Date.now();
  const r = report.buildReport({
    scope: "range",
    date: "2026-01-01",
    days: 30,
    profileName: "压测",
    birth
  });
  const ms30 = Date.now() - t0;
  console.log(`  30 天区间报告耗时 ${ms30} ms，行数 ${r.range.rows.length}，总条数 ${r.range.totalAdvice}`);
  if (r.range.rows.length !== 30) fail("30 天行数不为 30");
  if (!r.hasDisclaimer) fail("30 天报告缺免责声明");
  if (/\{\{[^}]+\}\}/.test(r.contentMd)) fail("30 天报告有未替换占位符");

  // 连续日期覆盖（含跨月、跨年）
  for (let i = 0; i < 20; i += 1) {
    const d = new Date(2026, i, 1 + (i % 27));
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    try {
      const one = report.buildReport({ scope: "daily", date: ymd, profileName: "压测", birth });
      if (!one.hasDisclaimer) noDisclaimer += 1;
      if (/\{\{[^}]+\}\}/.test(one.contentMd)) leftover += 1;
      minSec = Math.min(minSec, one.sections.length);
      totalSec += one.sections.length;
      if (one.daily.advice.length < 3 || one.daily.advice.length > 10) {
        errs += 1;
        console.log(`    !! ${ymd} 条数越界 ${one.daily.advice.length}`);
      }
    } catch (e) {
      errs += 1;
      console.log(`    !! ${ymd} 抛错 ${e.message}`);
    }
  }
  console.log(`  20 组单日报告：段落数 ${minSec}~${(totalSec / 20).toFixed(1)}(均)`);
  check(errs === 0, "20 组单日报告无异常且条数合规");
  check(noDisclaimer === 0, "全部含免责声明");
  check(leftover === 0, "无未替换占位符");
}

console.log("\n" + "=".repeat(72));
console.log(failed ? `未通过项：${failed}` : "全部通过");
process.exit(failed ? 1 : 0);
