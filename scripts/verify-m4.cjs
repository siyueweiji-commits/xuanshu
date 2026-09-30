/**
 * M4 流日服务层校验：直接 require 编译产物，用真实数据核对黄历与注意事项输出。
 *
 * 用法：npm run build:electron && npm run verify:m4
 *
 * 服务层依赖 Electron 的 `app.getPath("userData")`，纯 Node 下不存在，
 * 这里劫持模块解析注入一个最小 stub，让内置规则仍能正常读取。
 */
const path = require("node:path");
const Module = require("node:module");

const ROOT = path.join(__dirname, "..");
const STUB = path.join(__dirname, ".electron-stub.cjs");

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
      getPath: () => path.join(ROOT, ".verify-userdata"),
      getName: () => "XuanShu",
      getVersion: () => "0.0.0"
    }
  }
};

const { calcDaily } = require(path.join(ROOT, "dist-electron/services/daily.js"));
const { getHuangli } = require(path.join(ROOT, "dist-electron/services/huangli.js"));

const GROUPS = ["事业", "财运", "人际", "健康", "出行"];
let failed = 0;
const fail = (msg) => {
  failed += 1;
  console.log(`  ✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

function head(title) {
  console.log("\n" + "=".repeat(72));
  console.log(title);
  console.log("=".repeat(72));
}

/* ---------- A. 纯黄历 ---------- */
head("A. 纯黄历（无生辰）2026-09-30");
{
  const r = calcDaily({ year: 2026, month: 9, day: 30 });
  const h = r.huangli;
  console.log(`公历 ${h.dateCn} · ${h.xingZuo}座 | 农历 ${h.lunarDate} | ${h.season}`);
  console.log(`干支 ${h.yearInGanZhi} ${h.monthInGanZhi} ${h.dayInGanZhi} | 纳音 ${h.naYin} | 五行 ${h.wuXing}`);
  console.log(`冲煞 冲${h.chong.shengXiao}(${h.chong.desc}) 煞${h.chong.sha} | 建除 ${h.zhiXing}日 | 宿 ${h.xiu.name}(${h.xiu.luck})`);
  console.log(`天神 ${h.tianShen.name}(${h.tianShen.type}${h.tianShen.luck}) | 六曜 ${h.liuYao} | 月相 ${h.yueXiang} | 九星 ${h.nineStar}`);
  console.log(`方位 喜${h.positions.xi} 财${h.positions.cai} 福${h.positions.fu} | 彭祖 ${h.pengZu.gan}；${h.pengZu.zhi}`);
  console.log(`宜 ${h.yi.join("、")}`);
  console.log(`忌 ${h.ji.join("、")}`);
  console.log(`吉神 ${h.jiShen.join("、")} | 凶煞 ${h.xiongSha.join("、")}`);
  console.log(`吉时 ${h.luckyHourCount}/12：${h.auspiciousHours.join("、")}`);
  console.log(`十二时辰：${h.times.map((t) => `${t.label}${t.tianShenLuck}`).join(" ")}`);

  // 关键字段与手工核对结果一致（2026-09-30：丁未日 / 开日 / 壁宿 / 天德 / 冲牛 / 天河水 / 火土）
  const expect = {
    dayInGanZhi: () => h.dayInGanZhi,
    zhiXing: () => h.zhiXing,
    xiu: () => h.xiu.name,
    tianShen: () => h.tianShen.name,
    chongShengXiao: () => h.chong.shengXiao,
    naYin: () => h.naYin,
    wuXing: () => h.wuXing
  };
  const wanted = {
    dayInGanZhi: "丁未",
    zhiXing: "开",
    xiu: "壁",
    tianShen: "天德",
    chongShengXiao: "牛",
    naYin: "天河水",
    wuXing: "火土"
  };
  for (const k of Object.keys(wanted)) {
    const actual = expect[k]();
    if (actual === wanted[k]) ok(`${k} = ${wanted[k]}`);
    else fail(`${k} 期望 ${wanted[k]}，实际 ${actual}`);
  }
  if (h.times.length === 12) ok("十二时辰共 12 项");
  else fail(`十二时辰应为 12 项，实际 ${h.times.length}`);

  console.log("注意事项：");
  r.advice.forEach((a) => console.log(`  [${a.group}/${a.level}/${a.weight}] ${a.text}  ← ${a.source}`));
  if (r.advice.length >= 3 && r.advice.length <= 10) ok(`事项 ${r.advice.length} 条（3～10）`);
  else fail(`事项 ${r.advice.length} 条，超出 3～10`);
  for (const g of GROUPS) {
    if (r.groups[g].length > 0) ok(`分类「${g}」${r.groups[g].length} 条`);
    else fail(`分类「${g}」为空`);
  }
}

/* ---------- B. 叠加个人命盘 ---------- */
head("B. 叠加生辰 1990-1-1 12:30 男（不带真太阳时）");
{
  const r = calcDaily({
    year: 2026,
    month: 9,
    day: 30,
    birth: { gender: "男", year: 1990, month: 1, day: 1, hour: 12, minute: 30, timeIndex: 6 }
  });

  if (r.personal && r.personal.shengXiao === "蛇") ok("本人生肖 = 蛇（1990-1-1 尚在己巳年）");
  else fail(`本人生肖期望蛇，实际 ${r.personal && r.personal.shengXiao}`);

  if (r.bazi && r.bazi.dayMaster === "丙" && r.bazi.dayMasterWuXing === "火" && r.bazi.level === "偏强") {
    ok(`八字 日主 ${r.bazi.dayMaster}(${r.bazi.dayMasterWuXing}) ${r.bazi.level}`);
  } else {
    fail(`八字结果异常：${JSON.stringify(r.bazi)}`);
  }

  const zw = r.ziwei;
  if (!zw) {
    fail("紫微流日缺失");
  } else {
    ok(`流日命宫落本命${zw.daily.landedPalace}宫，主星 ${zw.soulStars.join("、")}`);
    ok(`流日四化 禄${zw.mutagenStars.lu} 权${zw.mutagenStars.quan} 科${zw.mutagenStars.ke} 忌${zw.mutagenStars.ji}`);
    const palaces = Object.keys(zw.palaceStars);
    if (palaces.length === 12) ok("流日十二宫齐全");
    else fail(`流日宫位应为 12，实际 ${palaces.length}`);
    if (palaces.some((p) => p === "命宫")) ok("流日宫位含「命宫」");
    else fail("流日宫位缺少「命宫」");
    // 化忌星必须能定位到唯一一个流日宫
    if (zw.mutagenStars.ji && zw.mutagenPalaces.ji.length === 1) {
      ok(`化忌 ${zw.mutagenStars.ji} 定位到流日${zw.mutagenPalaces.ji[0]}宫`);
    } else {
      fail(`化忌定位异常：${JSON.stringify(zw.mutagenPalaces.ji)}`);
    }
  }

  console.log("注意事项：");
  r.advice.forEach((a) => console.log(`  [${a.group}/${a.level}/${a.weight}] ${a.text}  ← ${a.source}`));
  const ruleHits = r.advice.filter((a) => a.system === "rule");
  if (ruleHits.length > 0) ok(`规则库命中 ${ruleHits.length} 条`);
  else fail("规则库一条未命中（事实键可能与规则 condition 不匹配）");
  if (r.advice.some((a) => a.text.includes("宫宫"))) fail("文案出现「宫宫」重复");
  else ok("无「宫宫」重复文案");
}

/* ---------- C. 边界日 ---------- */
head("C. 边界日 2026-02-17（正月初一）");
{
  const h = getHuangli({ year: 2026, month: 2, day: 17 });
  console.log(`农历 ${h.lunarDate} | 日柱 ${h.dayInGanZhi} | 建除 ${h.zhiXing} | 宿 ${h.xiu.name}(${h.xiu.luck})`);
  console.log(`凶煞 ${h.xiongSha.join("、")} | 吉时 ${h.luckyHourCount}/12 | 节气当日 ${h.jieQi.today ?? "无"}`);
  if (h.dayInGanZhi && h.times.length === 12) ok("边界日正常返回");
  else fail("边界日返回不完整");
}

/* ---------- D. 压力测试 ---------- */
head("D. 连续 120 天（叠加生辰）压测");
{
  const miss = {};
  let min = 99;
  let max = 0;
  let bad = 0;
  let errs = 0;
  let dup = 0;
  for (let i = 0; i < 120; i++) {
    const d = new Date(2026, 0, 1 + i);
    let r;
    try {
      r = calcDaily({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
        birth: { gender: "女", year: 1988, month: 6, day: 18, hour: 8, minute: 0, timeIndex: 4 }
      });
    } catch (e) {
      errs += 1;
      console.log(`  !! ${d.toDateString()} 抛错 ${e.message}`);
      continue;
    }
    const n = r.advice.length;
    min = Math.min(min, n);
    max = Math.max(max, n);
    if (n < 3 || n > 10) {
      bad += 1;
      console.log(`  !! ${d.toDateString()} 条数越界 ${n}`);
    }
    if (r.advice.some((a) => a.text.includes("宫宫"))) dup += 1;
    for (const g of GROUPS) if (r.groups[g].length === 0) miss[g] = (miss[g] || 0) + 1;
  }
  console.log(`条数区间 ${min}~${max}｜越界 ${bad} 天｜异常 ${errs} 天｜宫宫重复 ${dup} 天`);
  console.log(`分类缺项天数 ${JSON.stringify(miss)}`);
  if (bad === 0 && errs === 0 && dup === 0 && Object.keys(miss).length === 0) ok("120 天全部合格");
  else fail("压测存在不合格项");
}

console.log("\n" + "=".repeat(72));
console.log(failed ? `未通过项：${failed}` : "全部通过");
process.exit(failed ? 1 : 0);
