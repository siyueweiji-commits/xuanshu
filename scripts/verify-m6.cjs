/**
 * M6 服务层校验：卦象基础 / 梅花易数 / 六爻装卦。
 *
 * 用法：npm run build:electron && npm run verify:m6
 *
 * 大量断言是**对照标准六爻卦表手工核验**的期望值（京房纳甲、六亲、六神、世应、伏神），
 * 这类表最容易「看起来对、实际全错」，必须逐项钉死。
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
const bg = require(path.join(SVC, "bagua.js"));
const mh = require(path.join(SVC, "meihua.js"));
const ly = require(path.join(SVC, "liuyao.js"));
const kn = require(path.join(SVC, "knowledge.js"));
const calendar = require(path.join(SVC, "calendar.js"));

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

fs.rmSync(USER_DATA, { recursive: true, force: true });

/* ================= A. 八卦与六十四卦基础 ================= */
head("A. 八卦 / 六十四卦基础");
{
  // 八卦三爻与先天数一一对应
  const expectedLines = {
    1: [1, 1, 1],
    2: [1, 1, 0],
    3: [1, 0, 1],
    4: [1, 0, 0],
    5: [0, 1, 1],
    6: [0, 1, 0],
    7: [0, 0, 1],
    8: [0, 0, 0]
  };
  let trigramOk = true;
  for (const [num, lines] of Object.entries(expectedLines)) {
    const t = bg.TRIGRAMS[Number(num)];
    if (!t || JSON.stringify(t.lines) !== JSON.stringify(lines)) trigramOk = false;
  }
  check(trigramOk, "八卦三爻阴阳与先天数一一对应");

  // 64 卦名表：数量、无空值、全部唯一
  const names = bg.allHexagramNames();
  check(names.length === 64, `卦名表 64 条（实际 ${names.length}）`);
  check(new Set(names).size === 64, `卦名全部唯一（去重后 ${new Set(names).size}）`);
  check(names.every((n) => typeof n === "string" && n.length > 0), "无空卦名");

  // 上下卦 ↔ 六爻 双向往返
  let roundTrip = true;
  for (let u = 1; u <= 8; u += 1) {
    for (let l = 1; l <= 8; l += 1) {
      const lines = bg.upperLowerToLines(u, l);
      const back = bg.linesToUpperLower(lines);
      if (back.upper !== u || back.lower !== l) roundTrip = false;
    }
  }
  check(roundTrip, "上下卦 → 六爻 → 上下卦 全部往返一致");

  check(bg.hexagramName(1, 1) === "乾为天", "上乾下乾 = 乾为天");
  check(bg.hexagramName(8, 7) === "地山谦", "上坤下艮 = 地山谦");
  check(bg.hexagramName(6, 4) === "水雷屯", "上坎下震 = 水雷屯");

  // 六爻长度校验
  let threw = false;
  try {
    bg.linesToUpperLower([1, 0, 1]);
  } catch {
    threw = true;
  }
  check(threw, "非 6 爻数组被拒绝");
}

/* ================= B. 卦变（互 / 变 / 错 / 综）================= */
head("B. 卦变：互卦 / 变卦 / 错卦 / 综卦");
{
  // 乾为天：互错综皆为本卦
  const qian = [1, 1, 1, 1, 1, 1];
  check(bg.hexagramOfLines(bg.mutualLines(qian)).name === "乾为天", "乾为天互卦仍是乾为天");
  check(bg.hexagramOfLines(bg.oppositeLines(qian)).name === "坤为地", "乾为天错卦是坤为地");
  check(bg.hexagramOfLines(bg.reversedLines(qian)).name === "乾为天", "乾为天综卦仍是乾为天");

  // 坤为地：错卦乾为天
  const kun = [0, 0, 0, 0, 0, 0];
  check(bg.hexagramOfLines(bg.oppositeLines(kun)).name === "乾为天", "坤为地错卦是乾为天");
  check(bg.hexagramOfLines(bg.mutualLines(kun)).name === "坤为地", "坤为地互卦仍是坤为地");

  // 水雷屯（下震上坎）互卦 → 山地剥（标准答案）
  const zhun = bg.upperLowerToLines(6, 4); // [1,0,0, 0,1,0]
  const mutualZhun = bg.hexagramOfLines(bg.mutualLines(zhun)).name;
  check(mutualZhun === "山地剥", `水雷屯互卦 = 山地剥（实际 ${mutualZhun}）`);

  // 变卦：乾为天初爻动 → 天风姤
  check(
    bg.hexagramOfLines(bg.changedLines(qian, [1])).name === "天风姤",
    "乾为天初爻动 → 天风姤"
  );
  // 乾为天六爻全动 → 坤为地
  check(
    bg.hexagramOfLines(bg.changedLines(qian, [1, 2, 3, 4, 5, 6])).name === "坤为地",
    "乾为天六爻全动 → 坤为地"
  );

  // 综卦：地山谦 ↔ 雷地豫？用标准例子：泽天夬 的综卦是 天风姤
  const guai = bg.upperLowerToLines(2, 1); // 泽天夬
  const zongGuai = bg.hexagramOfLines(bg.reversedLines(guai)).name;
  check(zongGuai === "天风姤", `泽天夬综卦 = 天风姤（实际 ${zongGuai}）`);

  // 五行关系
  check(bg.relation("金", "木") === "体克用", "金 vs 木 = 体克用");
  check(bg.relation("木", "金") === "用克体", "木 vs 金 = 用克体");
  check(bg.relation("金", "水") === "体生用", "金 vs 水 = 体生用");
  check(bg.relation("水", "金") === "用生体", "水 vs 金 = 用生体");
  check(bg.relation("火", "火") === "比和", "火 vs 火 = 比和");
}

/* ================= C. 京房八宫 / 世应 ================= */
head("C. 八宫卦序与世应");
{
  const total = bg.PALACE_HEXAGRAMS.reduce((n, g) => n + g.hexagrams.length, 0);
  check(total === 64, `八宫共 64 卦（实际 ${total}）`);
  const allNames = bg.PALACE_HEXAGRAMS.flatMap((g) => g.hexagrams);
  check(new Set(allNames).size === 64, "八宫卦名无重复");

  // 八纯卦世在六爻、应在三爻
  for (const g of bg.PALACE_HEXAGRAMS) {
    const pure = bg.hexagramMeta(g.hexagrams[0]);
    if (pure.shi !== 6 || pure.ying !== 3) fail(`${g.hexagrams[0]} 世应应为 6/3`);
  }
  ok("八纯卦世 6 应 3");

  const cases = [
    ["乾为天", "乾", "金", "本宫", 6, 3],
    ["天风姤", "乾", "金", "一世", 1, 4],
    ["天山遁", "乾", "金", "二世", 2, 5],
    ["天地否", "乾", "金", "三世", 3, 6],
    ["风地观", "乾", "金", "四世", 4, 1],
    ["山地剥", "乾", "金", "五世", 5, 2],
    ["火地晋", "乾", "金", "游魂", 4, 1],
    ["火天大有", "乾", "金", "归魂", 3, 6],
    ["水雷屯", "坎", "水", "二世", 2, 5],
    ["地天泰", "坤", "土", "三世", 3, 6],
    ["水火既济", "坎", "水", "三世", 3, 6],
    ["雷泽归妹", "兑", "金", "归魂", 3, 6]
  ];
  let allOk = true;
  for (const [name, palace, wx, slot, shi, ying] of cases) {
    const m = bg.hexagramMeta(name);
    if (m.palace !== palace || m.palaceWuxing !== wx || m.slotName !== slot || m.shi !== shi || m.ying !== ying) {
      allOk = false;
      fail(`${name}: 期望 ${palace}宫${wx}/${slot}/世${shi}应${ying}，实际 ${m.palace}宫${m.palaceWuxing}/${m.slotName}/世${m.shi}应${m.ying}`);
    }
  }
  check(allOk, "12 个代表卦的宫位 / 位次 / 世应全部符合京房八宫表");
}

/* ================= D. 纳甲 / 六亲 / 六神 ================= */
head("D. 纳甲 / 六亲 / 六神");
{
  // 乾为天完整装卦（标准表）
  const expect = [
    { pos: 1, gz: "甲子", wx: "水", qin: "子孙", shen: "青龙" },
    { pos: 2, gz: "甲寅", wx: "木", qin: "妻财", shen: "朱雀" },
    { pos: 3, gz: "甲辰", wx: "土", qin: "父母", shen: "勾陈" },
    { pos: 4, gz: "壬午", wx: "火", qin: "官鬼", shen: "腾蛇" },
    { pos: 5, gz: "壬申", wx: "金", qin: "兄弟", shen: "白虎" },
    { pos: 6, gz: "壬戌", wx: "土", qin: "父母", shen: "玄武" }
  ];
  const r = ly.qigua({
    mode: "manual",
    manualLines: [1, 1, 1, 1, 1, 1].map((v) => ({ value: v })),
    dayGan: "甲",
    dayGanZhi: "甲子"
  });
  check(r.original.name === "乾为天", `乾为天装卦：卦名（实际 ${r.original.name}）`);
  check(r.shi === 6 && r.ying === 3, "乾为天 世 6 应 3");
  check(r.meta.palace === "乾" && r.meta.palaceWuxing === "金", "乾为天 属乾宫金");
  check(!r.changed, "静卦无变卦");
  check(r.isChong && !r.isHe, "乾为天为六冲卦、非六合卦");

  let tableOk = true;
  expect.forEach((e, i) => {
    const l = r.lines[i];
    const got = `${l.ganZhi}/${l.wuxing}/${l.liuQin}/${l.liuShen}`;
    const want = `${e.gz}/${e.wx}/${e.qin}/${e.shen}`;
    if (got !== want) {
      tableOk = false;
      fail(`乾为天 第${e.pos}爻 期望 ${want}，实际 ${got}`);
    }
  });
  check(tableOk, "乾为天六爻纳甲 / 六亲 / 六神 与标准表完全一致");
  check(r.lines[5].isShi && r.lines[2].isYing, "世应标记落在正确爻位");

  // 坤为地（标准表）
  const rKun = ly.qigua({
    mode: "manual",
    manualLines: new Array(6).fill(0).map((v) => ({ value: v })),
    dayGan: "甲",
    dayGanZhi: "甲子"
  });
  const kunExpect = ["乙未/土/兄弟", "乙巳/火/父母", "乙卯/木/官鬼", "癸丑/土/兄弟", "癸亥/水/妻财", "癸酉/金/子孙"];
  const kunGot = rKun.lines.map((l) => `${l.ganZhi}/${l.wuxing}/${l.liuQin}`);
  check(
    JSON.stringify(kunGot) === JSON.stringify(kunExpect),
    `坤为地纳甲六亲符合标准表（实际 ${kunGot.join(" ")}）`
  );

  // 六神随日干轮转：丙日起朱雀
  const rBing = ly.qigua({
    mode: "manual",
    manualLines: [1, 1, 1, 1, 1, 1].map((v) => ({ value: v })),
    dayGan: "丙",
    dayGanZhi: "丙寅"
  });
  check(rBing.lines[0].liuShen === "朱雀", `丙日初爻起朱雀（实际 ${rBing.lines[0].liuShen}）`);
  check(rBing.lines[5].liuShen === "青龙", `丙日上爻为青龙（实际 ${rBing.lines[5].liuShen}）`);

  // 旬空：甲子旬空戌亥；甲戌旬空申酉
  check(ly.xunKongOf("甲子").join("") === "戌亥", `甲子旬空戌亥（实际 ${ly.xunKongOf("甲子").join("")}）`);
  check(ly.xunKongOf("甲戌").join("") === "申酉", `甲戌旬空申酉（实际 ${ly.xunKongOf("甲戌").join("")}）`);
  check(ly.xunKongOf("丁未").join("") === "寅卯", `丁未（甲辰旬）空寅卯（实际 ${ly.xunKongOf("丁未").join("")}）`);
  check(ly.xunKongOf("").length === 0, "空日干支返回空旬空");
}

/* ================= E. 伏神 ================= */
head("E. 伏神（本宫首卦补缺）");
{
  // 水雷屯（震下坎上）：坎宫二世，卦中无妻财 → 三爻伏 妻财戊午
  const r = ly.qigua({
    mode: "manual",
    manualLines: [1, 0, 0, 0, 1, 0].map((v) => ({ value: v })),
    dayGan: "甲",
    dayGanZhi: "甲子"
  });
  check(r.original.name === "水雷屯", `第六组爻得到水雷屯（实际 ${r.original.name}）`);
  const fu = r.lines.filter((l) => l.fuShen);
  check(fu.length === 1, `只伏一个缺失六亲（实际 ${fu.length}）`);
  check(
    fu.length === 1 && fu[0].position === 3 && fu[0].fuShen.liuQin === "妻财" && fu[0].fuShen.ganZhi === "戊午",
    `水雷屯三爻伏 妻财戊午（实际 ${fu.map((l) => l.position + "爻" + l.fuShen.liuQin + l.fuShen.ganZhi).join(",") || "无"}）`
  );
  check(r.liuQinCount["妻财"] === 0, "水雷屯卦中无妻财（六亲统计为 0）");
  check(r.facts["缺妻财"] === true, "facts 标记「缺妻财」");

  // 六亲齐备的卦不应有伏神
  const r2 = ly.qigua({
    mode: "manual",
    manualLines: [1, 1, 1, 1, 1, 1].map((v) => ({ value: v })),
    dayGan: "甲",
    dayGanZhi: "甲子"
  });
  check(r2.lines.every((l) => !l.fuShen), "乾为天六亲齐备、无伏神");
  check(r2.facts["六亲齐备"] === true, "乾为天 facts 标记六亲齐备");
}

/* ================= F. 六冲 / 六合 / 动爻 / 变卦 ================= */
head("F. 六冲六合 / 动爻 / 变卦装卦");
{
  const chong = ["乾为天", "坤为地", "震为雷", "巽为风", "坎为水", "离为火", "艮为山", "兑为泽", "天雷无妄", "雷天大壮"];
  const he = ["天地否", "地天泰", "雷地豫", "地雷复", "火山旅", "山火贲", "水泽节", "泽水困"];
  let chongOk = true;
  for (const n of chong) {
    const lines = hexLinesOf(n);
    const r = ly.qigua({ mode: "manual", manualLines: lines.map((v) => ({ value: v })), dayGan: "甲", dayGanZhi: "甲子" });
    if (!r.isChong) {
      chongOk = false;
      fail(`${n} 应判为六冲卦`);
    }
  }
  check(chongOk, `10 个六冲卦全部正确识别`);

  let heOk = true;
  for (const n of he) {
    const lines = hexLinesOf(n);
    const r = ly.qigua({ mode: "manual", manualLines: lines.map((v) => ({ value: v })), dayGan: "甲", dayGanZhi: "甲子" });
    if (!r.isHe) {
      heOk = false;
      fail(`${n} 应判为六合卦`);
    }
  }
  check(heOk, `8 个六合卦全部正确识别`);

  // 动爻 → 变卦装卦
  const r = ly.qigua({
    mode: "manual",
    manualLines: [1, 1, 1, 1, 1, 1].map((v, i) => ({ value: v, changing: i === 0 })),
    dayGan: "甲",
    dayGanZhi: "甲子"
  });
  check(r.movingLines.length === 1 && r.movingLines[0] === 1, "初爻记为一爻独发");
  check(r.changed && r.changed.name === "天风姤", `乾为天初爻动变天风姤（实际 ${r.changed && r.changed.name}）`);
  check(r.changedMeta && r.changedMeta.palace === "乾" && r.changedMeta.slotName === "一世", "变卦装卦：天风姤属乾宫一世");
  check(r.lines[0].changedYang === false, "动爻标记变为阴");

  // 动爻数量规则命中
  const rMany = ly.qigua({
    mode: "manual",
    manualLines: [1, 0, 1, 0, 1, 0].map((v) => ({ value: v, changing: true })),
    dayGan: "甲",
    dayGanZhi: "甲子"
  });
  check(rMany.advice.some((a) => a.id === "liuyao_many_moving_lines"), "六爻全动命中「多爻乱动」规则");
  check(rMany.facts["动爻数量"] === 6, "facts 动爻数量 = 6");
}

/** 由卦名反查六爻（供校验脚本用） */
function hexLinesOf(name) {
  for (let u = 1; u <= 8; u += 1) {
    for (let l = 1; l <= 8; l += 1) {
      if (bg.GUA_NAMES[u][l] === name) return bg.upperLowerToLines(u, l);
    }
  }
  throw new Error(`未知卦名：${name}`);
}

/* ================= G. 梅花易数：三种起卦法 ================= */
head("G. 梅花易数：时间 / 数字 / 报数起卦");
{
  // 时间起卦：年支序 7（午）+ 农历 8 月 + 20 日 = 35；35 % 8 = 3 → 上卦离
  //           35 + 时辰序 8 = 43；43 % 8 = 3 → 下卦离；43 % 6 = 1 → 初爻动
  const t = mh.qigua({ mode: "time", yearZhiIndex: 7, lunarMonth: 8, lunarDay: 20, hourIndex: 8, question: "测试" });
  check(t.original.name === "离为火", `时间起卦 上离下离 = 离为火（实际 ${t.original.name}）`);
  check(t.movingLine === 1, `动爻 = 43 % 6 = 1（实际 ${t.movingLine}）`);
  check(t.facts["来源"] === "时间起卦", "facts 来源标记正确");

  // 数字起卦：3 / 7 → 上离(3) 下艮(7)，动爻 (3+7)%6 = 4
  const n = mh.qigua({ mode: "numbers", num1: 3, num2: 7 });
  check(n.original.name === "火山旅", `数字起卦 3/7 = 火山旅（实际 ${n.original.name}）`);
  check(n.movingLine === 4, `动爻 (3+7)%6 = 4（实际 ${n.movingLine}）`);

  // 报数起卦：数一 5 数二 8 数三 3 → 上巽(5) 下坤(8)，动爻 3
  const b = mh.qigua({ mode: "baoshu", num1: 5, num2: 8, num3: 3 });
  check(b.original.name === "风地观", `报数起卦 5/8/3 = 风地观（实际 ${b.original.name}）`);
  check(b.movingLine === 3, `报数动爻 = 3（实际 ${b.movingLine}）`);

  // 余数取整：8 的倍数应取坤(8)；6 的倍数应取上爻(6)
  const z = mh.qigua({ mode: "numbers", num1: 8, num2: 16 });
  check(z.original.upper === 8 && z.original.lower === 8, "8 的倍数取坤（余 0 → 8）");
  const z6 = mh.qigua({ mode: "baoshu", num1: 8, num2: 8, num3: 12 });
  check(z6.movingLine === 6, `动爻余 0 → 上爻 6（实际 ${z6.movingLine}）`);

  // 非法输入
  let e1 = false;
  try {
    mh.qigua({ mode: "numbers", num1: 0, num2: 5 });
  } catch {
    e1 = true;
  }
  check(e1, "数字 0 被拒绝");
  let e2 = false;
  try {
    mh.qigua({ mode: "baoshu", num1: 1, num2: 2 });
  } catch {
    e2 = true;
  }
  check(e2, "报数缺第三数被拒绝");
}

/* ================= H. 梅花：体用与四卦 ================= */
head("H. 梅花：体用定则 / 互变错综 / 规则解读");
{
  // 动爻在下卦（1-3）→ 下卦为「用」、上卦为「体」
  const lowerMoving = mh.qigua({ mode: "baoshu", num1: 1, num2: 8, num3: 2 }); // 上乾 下坤，动爻 2
  check(lowerMoving.original.name === "天地否", `上乾下坤 = 天地否（实际 ${lowerMoving.original.name}）`);
  check(lowerMoving.usePart === "下卦", `动爻 2 在用卦位置=下卦（实际 ${lowerMoving.usePart}）`);
  check(
    lowerMoving.body.name === "乾" && lowerMoving.use.name === "坤",
    `动爻在下卦时 体=上卦乾、用=下卦坤（实际 体${lowerMoving.body.name} 用${lowerMoving.use.name}）`
  );

  // 动爻在上卦（4-6）→ 上卦为「用」、下卦为「体」
  const upperMoving = mh.qigua({ mode: "baoshu", num1: 1, num2: 8, num3: 5 }); // 上乾 下坤，动爻 5
  check(upperMoving.usePart === "上卦", `动爻 5 在用卦位置=上卦（实际 ${upperMoving.usePart}）`);
  check(
    upperMoving.body.name === "坤" && upperMoving.use.name === "乾",
    `动爻在上卦时 体=下卦坤、用=上卦乾（实际 体${upperMoving.body.name} 用${upperMoving.use.name}）`
  );
  check(
    upperMoving.relation.kind === "体生用",
    `土生金 → 体生用（实际 ${upperMoving.relation.kind}）`
  );

  // 四卦齐备且互相自洽
  const r = mh.qigua({ mode: "numbers", num1: 3, num2: 7 });
  const names = [r.original.name, r.mutual.name, r.changed.name, r.opposite.name, r.reversed.name];
  check(names.every((n) => typeof n === "string" && n.length > 0), "本卦/互卦/变卦/错卦/综卦齐备");
  check(r.opposite.name === bg.hexagramOfLines(bg.oppositeLines(r.original.lines)).name, "错卦 = 六爻全变");
  check(r.reversed.name === bg.hexagramOfLines(bg.reversedLines(r.original.lines)).name, "综卦 = 六爻颠倒");
  check(r.changed.name === bg.hexagramOfLines(bg.changedLines(r.original.lines, r.movingLines)).name, "变卦 = 动爻翻变");
  check(r.yaos.length === 6 && r.yaos.filter((y) => y.changing).length === 1, "六爻明细且仅一动爻");
  check(r.yaos[0].title.startsWith("初"), `初爻称谓以「初」开头（实际 ${r.yaos[0].title}）`);
  check(r.yaos[5].title.startsWith("上"), `上爻称谓以「上」开头（实际 ${r.yaos[5].title}）`);

  // 规则解读：至少命中一次（体用关系 + 动爻 + 体五行 都应有对应规则）
  check(r.advice.length >= 2, `梅花解读至少 2 条（实际 ${r.advice.length}）`);
  check(r.advice.some((a) => a.id.startsWith("meihua_relation_")), "命中体用关系规则");
  check(r.advice.some((a) => a.id.startsWith("meihua_line_")), "命中动爻位规则");
  check(r.advice.some((a) => a.id.startsWith("meihua_body_")), "命中体卦五行规则");
  check(r.advice.every((a) => a.text && a.source), "每条解读都有文案与来源标签");
}

/* ================= I. 时间起卦接入真实历法 ================= */
head("I. 时间起卦接入真实历法（divinationTimeParts）");
{
  const parts = calendar.divinationTimeParts({ year: 2026, month: 9, day: 30, hour: 14, minute: 30 });
  check(parts.date === "2026-09-30", `公历日期回读（实际 ${parts.date}）`);
  check(parts.lunarMonth === 8 && parts.lunarDay === 20, `农历 八月二十（实际 ${parts.lunarMonth}/${parts.lunarDay}）`);
  check(parts.yearZhiIndex === 7, `2026 丙午年 年支序 7（实际 ${parts.yearZhiIndex}）`);
  check(parts.hourZhi === "未" && parts.hourIndex === 8, `14:30 属未时、时辰序 8（实际 ${parts.hourZhi}/${parts.hourIndex}）`);
  check(parts.dayGanZhi.length === 2 && parts.monthGanZhi.length === 2, `日/月干支齐备（${parts.dayGanZhi} / ${parts.monthGanZhi}）`);

  // 用真实分量起卦，验证与手算一致
  const r = mh.qigua({
    mode: "time",
    yearZhiIndex: parts.yearZhiIndex,
    lunarMonth: parts.lunarMonth,
    lunarDay: parts.lunarDay,
    hourIndex: parts.hourIndex
  });
  check(r.original.name === "离为火" && r.movingLine === 1, `2026-09-30 14:30 时间起卦 = 离为火·初爻动（实际 ${r.original.name}·第${r.movingLine}爻）`);

  // 不同时刻应得到不同卦（避免「永远同一个卦」的静默失效）
  const set = new Set();
  for (let h = 0; h < 24; h += 2) {
    const p = calendar.divinationTimeParts({ year: 2026, month: 9, day: 30, hour: h, minute: 0 });
    const q = mh.qigua({
      mode: "time",
      yearZhiIndex: p.yearZhiIndex,
      lunarMonth: p.lunarMonth,
      lunarDay: p.lunarDay,
      hourIndex: p.hourIndex
    });
    set.add(q.original.name);
  }
  check(set.size >= 4, `同日 12 个时辰得到 ≥4 种卦（实际 ${set.size} 种）`);
}

/* ================= J. 六爻：手动录入边界 / 铜钱起卦 ================= */
head("J. 六爻：手动录入边界与铜钱模拟");
{
  let e1 = false;
  try {
    ly.qigua({ mode: "manual", manualLines: [{ value: 1 }, { value: 0 }] });
  } catch {
    e1 = true;
  }
  check(e1, "手动录入不足 6 爻被拒绝");

  let e2 = false;
  try {
    ly.qigua({ mode: "manual", manualLines: [1, 1, 1, 1, 1, 2].map((v) => ({ value: v })) });
  } catch {
    e2 = true;
  }
  check(e2, "手录入含非 0/1 值被拒绝");

  // 铜钱起卦：1000 次全部合法
  let bad = 0;
  const dist = { 老阳: 0, 少阳: 0, 少阴: 0, 老阴: 0 };
  for (let i = 0; i < 1000; i += 1) {
    const r = ly.qigua({ question: "压测" });
    if (r.lines.length !== 6) bad += 1;
    if (r.lines.some((l) => !l.ganZhi || !l.liuQin || !l.liuShen)) bad += 1;
    if (!r.original.name || r.original.name === "未知卦") bad += 1;
    if (!r.dayGanZhi || r.xunKong.length !== 2) bad += 1;
    for (const l of r.lines) {
      // nature 形如「老阳（动）」，按前缀归类
      for (const key of Object.keys(dist)) {
        if (l.nature.startsWith(key)) dist[key] += 1;
      }
    }
  }
  check(bad === 0, `1000 次铜钱起卦全部合法（异常 ${bad} 次）`);
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  const ratio = Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, ((v / total) * 100).toFixed(1) + "%"]));
  console.log(`  爻性分布：${JSON.stringify(ratio)}`);
  // 三背（老阳）与三字（老阴）各应占 1/8，少阳/少阴各 3/8（容差 ±3%）
  check(
    Math.abs(dist.老阳 / total - 0.125) < 0.03 &&
      Math.abs(dist.老阴 / total - 0.125) < 0.03 &&
      Math.abs(dist.少阳 / total - 0.375) < 0.04 &&
      Math.abs(dist.少阴 / total - 0.375) < 0.04,
    "铜钱概率分布接近 1/8 · 3/8"
  );
}

/* ================= K. 知识库（64 卦释义）================= */
head("K. 知识库：六十四卦释义");
{
  const stats = kn.knowledgeStats();
  check(stats.hexagrams === 64, `卦释义 64 条（实际 ${stats.hexagrams}）`);
  check(stats.stars > 0, `主星释义 ${stats.stars} 条`);

  // 知识库必须覆盖全部 64 卦名（不能有漏）
  const missing = bg.allHexagramNames().filter((n) => !kn.guaBrief(n));
  check(missing.length === 0, `64 卦全部有释义（缺失 ${missing.length} 个：${missing.join("、")}）`);

  const g = kn.guaBrief("乾为天");
  check(g && g.brief.length > 8, `乾为天释义已加载：${g ? g.brief.slice(0, 20) : "-"}…`);
  check(kn.guaBrief("不存在的卦") === null, "未知卦名返回 null");
}

/* ================= L. 压测 ================= */
head("L. 压测：梅花 500 组 + 六爻 500 组");
{
  const t0 = Date.now();
  let bad = 0;
  const mhNames = new Set();
  // 用随机参数保证覆盖面（确定性参数会因相关性只覆盖少数卦）
  for (let i = 0; i < 500; i += 1) {
    const mode = ["time", "numbers", "baoshu"][i % 3];
    const rnd = (n) => Math.floor(Math.random() * n) + 1;
    const r =
      mode === "time"
        ? mh.qigua({ mode, yearZhiIndex: rnd(12), lunarMonth: rnd(12), lunarDay: rnd(30), hourIndex: rnd(12) })
        : mode === "numbers"
        ? mh.qigua({ mode, num1: rnd(9999), num2: rnd(9999) })
        : mh.qigua({ mode, num1: rnd(9999), num2: rnd(9999), num3: rnd(9999) });
    mhNames.add(r.original.name);
    if (!r.original.name || r.original.name.startsWith("未知")) bad += 1;
    if (r.advice.length === 0) bad += 1;
    if (!r.relation.kind || !r.body.wuxing || !r.use.wuxing) bad += 1;
    if (r.yaos.length !== 6) bad += 1;
  }
  const mhMs = Date.now() - t0;
  check(bad === 0, `梅花 500 组全部合格（异常 ${bad}）`);
  check(mhNames.size >= 40, `覆盖 ≥40 种卦（实际 ${mhNames.size} 种）`);

  const t1 = Date.now();
  let bad2 = 0;
  const lyNames = new Set();
  for (let i = 0; i < 500; i += 1) {
    const lines = Array.from({ length: 6 }, (_, k) => ({ value: (i >> k) & 1, changing: ((i >> (k + 3)) & 1) === 1 }));
    const r = ly.qigua({ mode: "manual", manualLines: lines, dayGanZhi: "甲子" });
    lyNames.add(r.original.name);
    if (r.lines.length !== 6) bad2 += 1;
    if (r.lines.some((l) => l.liuQin === undefined || l.liuShen === undefined)) bad2 += 1;
    if (r.shi < 1 || r.shi > 6 || r.ying < 1 || r.ying > 6) bad2 += 1;
    if (r.shi === r.ying) bad2 += 1;
    if (r.advice.length === 0) bad2 += 1;
    if (r.movingLines.length > 0 && !r.changed) bad2 += 1;
    if (r.movingLines.length === 0 && r.changed) bad2 += 1;
  }
  const lyMs = Date.now() - t1;
  check(bad2 === 0, `六爻 500 组全部合格（异常 ${bad2}）`);
  check(lyNames.size >= 55, `覆盖 ≥55 种卦（实际 ${lyNames.size} 种）`);
  console.log(`  梅花 500 组 ${mhMs} ms｜六爻 500 组 ${lyMs} ms`);
}

/* ================= 收尾 ================= */
console.log("\n" + "=".repeat(72));
if (failed === 0) {
  console.log("全部通过");
} else {
  console.log(`未通过：${failed} 项`);
}
console.log("=".repeat(72));
fs.rmSync(USER_DATA, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
