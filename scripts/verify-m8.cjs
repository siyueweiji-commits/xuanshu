/**
 * M8 服务层校验：数据更新模块（检测 / 下载校验 / 备份 / 回滚 / 降级）。
 *
 * 用法：npm run build:electron && npm run verify:m8
 *
 * ⚠️ 与 verify:m7 一样必须跑在 **Electron** 里（updater 走 SQLite 记设置与日志，
 * better-sqlite3 是 Electron ABI）。脚本把 userData 隔离到 .verify-userdata-m8。
 *
 * 更新源用**本地目录**（真实仓库 `../xuanshu-data`），因此整条链路可离线端到端验证：
 * 读取 manifest → 比对哈希 → 下载 → 校验 → 备份 → 落地 → 回滚。
 */
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.join(__dirname, "..");
const USER_DATA = path.join(ROOT, ".verify-userdata-m8");
const DATA_REPO = path.join(ROOT, "..", "xuanshu-data");

if (!process.versions.electron || "ELECTRON_RUN_AS_NODE" in process.env) {
  const { spawnSync } = require("node:child_process");
  const exe = require("electron");
  if (typeof exe !== "string") {
    console.error("[verify:m8] 无法定位 electron 可执行文件，请先 npm install");
    process.exit(1);
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const ret = spawnSync(exe, [__filename], { stdio: "inherit", env });
  process.exit(ret.status ?? 1);
}

const { app } = require("electron");
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

app.whenReady().then(async () => {
  const SVC = path.join(ROOT, "dist-electron", "services");
  const up = require(path.join(SVC, "updater.js"));
  const dp = require(path.join(SVC, "dataPaths.js"));
  const rules = require(path.join(SVC, "rules.js"));
  const kn = require(path.join(SVC, "knowledge.js"));
  const report = require(path.join(SVC, "report.js"));
  const { getDb } = require(path.join(ROOT, "dist-electron", "db", "database.js"));
  getDb();

  const userDataRoot = path.join(USER_DATA, "data");

  // 数据版本号以数据仓库的 manifest 为准。
  // 之前这里硬编码 "2026.09.30"，每次数据升版都要连带改测试，
  // 容易漏改而把「版本已正确落地」误判成回归。改为动态读取。
  const DATA_VERSION = JSON.parse(
    fs.readFileSync(path.join(DATA_REPO, "manifest.json"), "utf-8")
  ).version;

  /* ================= A. 更新源解析 ================= */
  head("A. 更新源解析（http / file:// / 本地目录）");
  {
    const http = up.describeSource("https://raw.githubusercontent.com/u/r/main/");
    check(http.kind === "http" && http.base === "https://raw.githubusercontent.com/u/r/main", "http 源规整（去掉尾部斜杠）");

    const fileUrl = up.describeSource("file:///F:/data/repo");
    check(fileUrl.kind === "dir", "file:// 源识别为本地目录");
    check(!/^\/[A-Za-z]:/.test(fileUrl.base), `Windows 盘符前导斜杠已去掉：${fileUrl.base}`);

    const plain = up.describeSource(DATA_REPO);
    check(plain.kind === "dir" && plain.base === DATA_REPO.replace(/\/+$/, ""), "本地目录源直通");

    check(up.DEFAULT_SOURCE.includes("xuanshu-data"), `默认更新源指向 xuanshu-data：${up.DEFAULT_SOURCE}`);
  }

  /* ================= B. 检查更新 ================= */
  head("B. 检查更新（源 = 本地 xuanshu-data 仓库）");
  {
    check(fs.existsSync(path.join(DATA_REPO, "manifest.json")), `数据仓库存在：${DATA_REPO}`);
    const remoteManifest = JSON.parse(fs.readFileSync(path.join(DATA_REPO, "manifest.json"), "utf-8"));

    const c = await up.checkUpdate(DATA_REPO);
    check(c.ok, `检查成功（error=${c.error}）`);
    check(c.sourceKind === "dir", "源类型 = dir");
    check(c.remoteVersion === remoteManifest.version, `远端版本 = ${c.remoteVersion}`);
    check(c.total === remoteManifest.files.length, `文件总数 ${c.total} = manifest ${remoteManifest.files.length}`);
    check(c.localVersion === "0", `未更新过时本地版本为 0（实际 ${c.localVersion}）`);
    check(c.hasUpdate === true, "hasUpdate = true（版本号尚未落地）");
    // 数据仓库刚从 resources 同步过，内置哈希应与远端一致 → 无需下载
    check(c.changedCount === 0, `内置资源与远端一致，无需下载（changed ${c.changedCount}）`);
    check(
      c.files.every((f) => f.kind && ["rules", "knowledge", "templates", "data"].includes(f.kind)),
      "每个文件都归入合法分类"
    );

    // 源不存在 → 明确失败且不抛到调用方外面
    const bad = await up.checkUpdate(path.join(USER_DATA, "no-such-dir"));
    check(bad.ok === false && typeof bad.error === "string" && bad.error.length > 0, `源不存在时返回 ok=false 且带错误信息：${bad.error}`);
    check(bad.files.length === 0, "失败时不返回半截文件列表");
  }

  /* ================= C. 执行更新（无差异 → 跳过） ================= */
  head("C. 执行更新：无差异时应全部跳过");
  {
    const r = await up.runUpdate(DATA_REPO);
    check(r.ok === true, `执行成功（error=${r.error}）`);
    check(r.updated === 0 && r.skipped === r.files.length, `全部跳过（updated ${r.updated} / skipped ${r.skipped}）`);
    check(r.toVersion === DATA_VERSION, `目标版本 ${r.toVersion}`);
    check(up.localVersion() === DATA_VERSION, `本地版本已落地为 ${up.localVersion()}`);
    check(fs.existsSync(path.join(userDataRoot, "manifest.json")), "用户目录已写入 manifest.json");
    check(r.backupDir === null, "无文件落地时不产生备份目录");
  }

  /* ================= D. 强制更新（模拟首次落地） ================= */
  head("D. 强制更新：全部文件落地到用户目录");
  {
    const r = await up.runUpdate(DATA_REPO, { force: true });
    check(r.ok === true, `执行成功（error=${r.error}）`);
    check(r.updated === r.files.length, `全部更新（updated ${r.updated} / ${r.files.length}）`);
    check(!!r.backupDir, `已创建备份目录：${r.backupDir}`);
    // 首次落地时用户目录里原本没有文件，备份目录里应只有旧 manifest
    const backed = fs.existsSync(r.backupDir) ? fs.readdirSync(r.backupDir) : [];
    check(backed.length <= 1, `首次落地的备份只含旧 manifest（实际 ${backed.length} 项）`);

    // 逐文件校验落地内容与远端一致
    let bad = 0;
    for (const f of r.files) {
      const p = path.join(userDataRoot, f.path);
      if (!fs.existsSync(p)) {
        bad += 1;
        continue;
      }
      if (fpHash(p) !== f.hash) bad += 1;
    }
    check(bad === 0, `${r.files.length} 个落地文件哈希与 manifest 完全一致（异常 ${bad}）`);

    // 四类资源都覆盖到了
    for (const kind of ["rules", "knowledge", "templates", "data"]) {
      const dir = path.join(userDataRoot, kind);
      check(fs.existsSync(dir) && fs.readdirSync(dir).length > 0, `用户目录已落地 ${kind}/`);
    }
  }

  /* ================= E. 更新后资源优先读取 ================= */
  head("E. 用户目录优先：更新后各服务读到的是新文件");
  {
    // 规则：更新落地 huangli.json（非 user_ 前缀）应被视为「内置的新版本」
    const ov = rules.rulesOverview();
    check(ov.userFiles.filter((f) => f.file.startsWith("user_")).length === 0, "更新落地文件不计入「用户覆盖」清单");
    check(ov.rules.every((r) => !r.userOverride), "更新后没有规则被误标为「已覆盖」");
    check(ov.total >= 70, `规则总数 ${ov.total}（含 M6 新增）`);

    // 知识库 / 模板 / 城市数据 都能通过 resolveResource 解析到用户目录版本
    const knPath = dp.resolveResource("knowledge", "gua.json");
    check(knPath && knPath.startsWith(userDataRoot), `知识库解析到用户目录：${knPath}`);
    const tplPath = dp.resolveResource("templates", "daily_report.md");
    check(tplPath && tplPath.startsWith(userDataRoot), "模板解析到用户目录");
    const cityPath = dp.resolveResource("data", "city_coords.json");
    check(cityPath && cityPath.startsWith(userDataRoot), "城市数据解析到用户目录");

    check(kn.guaBrief("乾为天") !== null, "更新后卦象知识库仍可读");
    check(report.listTemplates().length >= 2, "更新后模板清单仍可读");
  }

  /* ================= F. 篡改检测：哈希不符不落地 ================= */
  head("F. 篡改检测：哈希校验不过的文件不落地");
  {
    const fixture = path.join(USER_DATA, "fixture-bad");
    const rulesDir = path.join(fixture, "rules");
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.writeFileSync(path.join(rulesDir, "tampered.json"), JSON.stringify({ system: "tampered", rules: [] }), "utf-8");
    fs.writeFileSync(
      path.join(fixture, "manifest.json"),
      JSON.stringify({
        version: "9999.01.01",
        files: [{ path: "rules/tampered.json", hash: "sha256:" + "0".repeat(64) }]
      }),
      "utf-8"
    );

    const r = await up.runUpdate(fixture);
    check(r.failed === 1 && r.updated === 0, `哈希不符被拦下（failed ${r.failed} / updated ${r.updated}）`);
    check(r.files[0] && /哈希校验不通过/.test(r.files[0].error ?? ""), `错误信息明确：${r.files[0] && r.files[0].error}`);
    check(!fs.existsSync(path.join(userDataRoot, "rules", "tampered.json")), "被篡改的文件没有落地");
    check(up.localVersion() === DATA_VERSION, "失败时不推进本地版本号");
  }

  /* ================= G. manifest 越界/非法被拒绝 ================= */
  head("G. manifest 校验：越界路径与非法字段");
  {
    const fixture = path.join(USER_DATA, "fixture-evil");
    fs.mkdirSync(path.join(fixture, "etc"), { recursive: true });
    fs.writeFileSync(path.join(fixture, "etc", "evil.json"), "{}", "utf-8");

    const write = (m) => fs.writeFileSync(path.join(fixture, "manifest.json"), JSON.stringify(m), "utf-8");

    write({ version: "1", files: [{ path: "etc/evil.json", hash: "sha256:" + "a".repeat(64) }] });
    let c = await up.checkUpdate(fixture);
    check(c.ok === false && /越界/.test(c.error ?? ""), `越界目录被拒绝：${c.error}`);

    write({ version: "1", files: [{ path: "rules/../../evil.json", hash: "sha256:" + "a".repeat(64) }] });
    c = await up.checkUpdate(fixture);
    check(c.ok === false, `含 .. 的路径被拒绝：${c.error}`);

    write({ version: "1", files: [{ path: "rules/x.json", hash: "md5:abc" }] });
    c = await up.checkUpdate(fixture);
    check(c.ok === false && /哈希格式非法/.test(c.error ?? ""), `非 sha256 哈希被拒绝：${c.error}`);

    write({ files: [{ path: "rules/x.json", hash: "sha256:" + "a".repeat(64) }] });
    c = await up.checkUpdate(fixture);
    check(c.ok === false && /version/.test(c.error ?? ""), "缺 version 被拒绝");

    write({ version: "1", files: [] });
    c = await up.checkUpdate(fixture);
    check(c.ok === false && /files/.test(c.error ?? ""), "空 files 被拒绝");

    fs.writeFileSync(path.join(fixture, "manifest.json"), "not json at all", "utf-8");
    c = await up.checkUpdate(fixture);
    check(c.ok === false, "非 JSON 的 manifest 被拒绝");
  }

  /* ================= H. 备份 / 回滚 ================= */
  head("H. 备份与回滚");
  {
    // 先改掉一个落地文件，再强制更新，验证备份能把它还原
    const target = path.join(userDataRoot, "rules", "huangli.json");
    const original = fs.readFileSync(target, "utf-8");
    fs.writeFileSync(target, JSON.stringify({ system: "huangli", version: "local-edit", rules: [] }), "utf-8");
    check(fs.readFileSync(target, "utf-8").includes("local-edit"), "已人为改动落地文件（模拟本地漂移）");

    const r = await up.runUpdate(DATA_REPO, { force: true });
    check(r.ok === true && r.updated > 0, `再次强制更新（updated ${r.updated}）`);
    check(!fs.readFileSync(target, "utf-8").includes("local-edit"), "更新已覆盖本地改动");
    check(r.files.find((f) => f.path === "rules/huangli.json").localHashBefore !== null, "更新结果里记录了改动前的哈希");

    const backups = up.listBackups();
    check(backups.length >= 1, `备份列表非空（${backups.length} 个）`);
    check(backups[0].name === r.backupDir.split(/[\\/]/).pop(), "最新备份即本次更新前的快照");

    // 回滚：应把被改动的文件还原成「本地改动版」
    const rb = up.rollback();
    check(rb.ok === true, `回滚成功（error=${rb.error}）`);
    check(rb.restored >= 1, `还原 ${rb.restored} 个文件`);
    check(fs.readFileSync(target, "utf-8").includes("local-edit"), "回滚后本地改动被还原");

    // 回滚到「出厂」：清空用户目录覆盖
    const rb2 = up.rollback("__no_such_backup__");
    check(rb2.ok === false, "指定不存在的备份时回滚失败");

    // 手动删掉所有备份后 rollback() 退化为「回到内置」
    for (const b of up.listBackups()) up.dropBackup(b.name);
    check(up.listBackups().length === 0, "备份已清空");
    const rb3 = up.rollback();
    check(rb3.ok === true, `无备份时回滚成功（error=${rb3.error}）`);
    check(!fs.existsSync(path.join(userDataRoot, "rules")) || fs.readdirSync(path.join(userDataRoot, "rules")).length === 0, "回滚后用户规则目录已清空");
    check(up.localVersion() === "0", "回滚到出厂后本地版本为 0");
    check(!fs.existsSync(path.join(userDataRoot, "manifest.json")), "回滚后本地 manifest 已删除");

    // 回到内置状态后，规则库应仍能读到内置版本（离线可用性）
    const ov = rules.rulesOverview();
    check(ov.total >= 70, `回滚后仍读到内置规则 ${ov.total} 条`);
    check(kn.guaBrief("坤为地") !== null, "回滚后知识库仍可读");
  }

  /* ================= I. 设置与日志 ================= */
  head("I. 设置项与更新日志");
  {
    const def = up.getUpdateSettings();
    check(def.sourceUrl === up.DEFAULT_SOURCE, `默认更新源：${def.sourceUrl}`);
    check(def.autoCheck === true, "默认开启自动检查");

    const s1 = up.setUpdateSettings({ autoCheck: false });
    check(s1.autoCheck === false, "关闭自动检查已持久化");
    const s2 = up.setUpdateSettings({ sourceUrl: DATA_REPO });
    check(s2.sourceUrl === DATA_REPO, "自定义更新源已持久化");
    const s3 = up.setUpdateSettings({ sourceUrl: "" });
    check(s3.sourceUrl === up.DEFAULT_SOURCE, "清空更新源回退到默认值");
    up.setUpdateSettings({ autoCheck: true, sourceUrl: up.DEFAULT_SOURCE });

    const logs = up.updateLogs(100);
    check(logs.length > 0, `更新日志有 ${logs.length} 条`);
    check(logs.some((l) => l.status === "success"), "日志里有成功记录");
    check(logs.some((l) => l.status === "failed"), "日志里有失败记录（篡改 / 越界那几次）");
    check(logs.some((l) => l.source === "rollback"), "回滚也写入了日志");
    check(logs[0].id > logs[logs.length - 1].id, "日志按时间倒序");
    const cleared = up.clearUpdateLogs();
    check(cleared === logs.length, `清空日志 ${cleared} 条`);
    check(up.updateLogs().length === 0, "清空后日志为空");
  }

  /* ================= J. 概况与局部更新 ================= */
  head("J. 数据概况与「只更新某一类」");
  {
    const ov0 = up.dataOverview();
    check(ov0.kinds.length === 4, "概况含四类资源");
    check(
      ov0.kinds.every((k) => k.builtin > 0),
      `内置资源齐备：${ov0.kinds.map((k) => k.kind + "=" + k.builtin).join(" ")}`
    );

    // 只更新 rules
    const r = await up.runUpdate(DATA_REPO, { force: true, only: ["rules"] });
    check(r.ok === true, "局部更新成功");
    check(
      r.files.every((f) => f.path.startsWith("rules/")),
      `只处理了 rules/ 下的文件（共 ${r.files.length} 个）`
    );
    check(r.updated === 5, `更新了 5 个规则文件（实际 ${r.updated}）`);
    check(!fs.existsSync(path.join(userDataRoot, "templates")), "未指定 templates 时不会落地该目录");

    const ov1 = up.dataOverview();
    const rulesKind = ov1.kinds.find((k) => k.kind === "rules");
    check(rulesKind && rulesKind.updated === 5, `概况显示 rules 已更新 ${rulesKind && rulesKind.updated} 个`);

    // 清理
    for (const b of up.listBackups()) up.dropBackup(b.name);
    up.rollback();
  }

  /* ================= K. 离线降级：更新失败不影响既有功能 ================= */
  head("K. 离线降级");
  {
    const before = rules.rulesOverview().total;
    const r = await up.runUpdate("https://127.0.0.1:1/xuanshu-offline-test");
    check(r.ok === false, "不可达的源 → 更新失败");
    check(typeof r.error === "string" && r.error.length > 0, `给出明确错误：${String(r.error).slice(0, 60)}`);
    const after = rules.rulesOverview().total;
    check(after === before, `更新失败后规则库不受影响（${before} → ${after}）`);
    check(kn.guaBrief("离为火") !== null, "更新失败后知识库仍可读");
    check(report.listTemplates().length >= 2, "更新失败后模板仍可读");

    const c = await up.checkUpdate("https://127.0.0.1:1/xuanshu-offline-test");
    check(c.ok === false && c.error !== null, "检查更新失败同样只返回错误，不抛异常");
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

/** 用与客户端相同口径（原始字节 sha256）计算文件哈希 */
function fpHash(file) {
  const crypto = require("node:crypto");
  return "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
