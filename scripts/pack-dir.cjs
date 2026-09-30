/**
 * 打包目录版并自检（M9）。
 *
 * 为什么不用 `npm run dist:win`：
 *   1. electron-builder 默认会清空已存在的输出目录，而本机沙箱的删除垫片会拦掉这一步，
 *      于是「复用同一个输出目录」必然失败；这里改为**每次打包到全新的时间戳目录**，
 *      既绕开限制，又天然保留历次产物便于对比。
 *   2. 打完包必须**真的跑一遍**才叫验证通过——asar / 原生模块 / 内置资源三件事
 *      在打包后都换了运行环境，`npm run build` 通过不等于安装包可用。
 *      这里直接执行产物 `XuanShu.exe --self-test`，解析 JSON 并据此设置退出码。
 *
 * 用法：
 *   node scripts/pack-dir.cjs                 # 当前平台，目录版
 *   node scripts/pack-dir.cjs --win           # 指定 Windows
 *   node scripts/pack-dir.cjs --no-selftest   # 只打包不自检
 */
const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const argv = process.argv.slice(2);
const platform = argv.includes("--mac") ? "mac" : argv.includes("--linux") ? "linux" : "win";
const runSelfTest = !argv.includes("--no-selftest");

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 每次都用没人用过的新目录，避免触发「清空目录」 */
const outDir = `release/dir-${stamp()}`;

/** 本机 electron-builder 会去 GitHub 下载 Electron；若本地已有 dist 就直接用 */
function localElectronDist() {
  const p = path.join(ROOT, "node_modules", "electron", "dist");
  return fs.existsSync(path.join(p, "electron.exe")) || fs.existsSync(path.join(p, "electron")) ? p : null;
}

console.log(`[pack] 平台=${platform} 输出=${outDir}`);

const cli = path.join(ROOT, "node_modules", "electron-builder", "cli.js");
if (!fs.existsSync(cli)) {
  console.error("[pack] 找不到 electron-builder，请先 npm install");
  process.exit(1);
}

const args = [cli, `--${platform}`, "--dir", `--config.directories.output=${outDir}`];
const dist = localElectronDist();
if (dist) {
  args.push(`--config.electronDist=${path.relative(ROOT, dist)}`);
  console.log(`[pack] 使用本地 Electron 分发目录：${dist}`);
}

const build = spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit" });
if (build.status !== 0) {
  console.error(`[pack] 打包失败，退出码 ${build.status}`);
  process.exit(build.status ?? 1);
}

const unpacked = path.join(ROOT, outDir, platform === "mac" ? "mac" : platform === "linux" ? "linux-unpacked" : "win-unpacked");
const exeName = platform === "win" ? "XuanShu.exe" : platform === "mac" ? "XuanShu.app" : "xuanshu";
const exe = path.join(unpacked, exeName);

if (!fs.existsSync(exe)) {
  console.error(`[pack] 未找到产物可执行文件：${exe}`);
  process.exit(1);
}

// 统计体积
const sizeOf = (p) => {
  let total = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else {
        try {
          total += fs.statSync(full).size;
        } catch {
          /* 忽略读不到的文件 */
        }
      }
    }
  };
  if (fs.statSync(p).isFile()) return fs.statSync(p).size;
  walk(p);
  return total;
};
const mb = (n) => (n / 1024 / 1024).toFixed(1) + " MB";
console.log(`[pack] 产物：${exe}`);
console.log(`[pack] 体积：可执行 ${mb(sizeOf(exe))}｜整包 ${mb(sizeOf(unpacked))}`);

// asar 结构检查（原生模块必须解包，内置资源必须在 asar 内）
const asar = path.join(unpacked, "resources", "app.asar");
const unpackedDir = path.join(unpacked, "resources", "app.asar.unpacked");
console.log(`[pack] app.asar ${fs.existsSync(asar) ? mb(sizeOf(asar)) : "缺失！"}`);
const nodeBins = [];
if (fs.existsSync(unpackedDir)) {
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".node")) nodeBins.push(path.relative(unpackedDir, full));
    }
  };
  walk(unpackedDir);
}
console.log(`[pack] asar.unpacked 原生模块：${nodeBins.length ? nodeBins.join(", ") : "无（若应用用到原生模块则异常）"}`);

if (!runSelfTest) process.exit(0);

// 跑产物自检
console.log("[pack] 执行产物自检：--self-test");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// 沙箱会往 NODE_OPTIONS 里塞 --require 垫片，打包后的应用不认这个变量并会打一行 ERROR
delete env.NODE_OPTIONS;
// Windows 的 GUI 程序 stdout 无法被 spawnSync 捕获，让自检把 JSON 落到文件再读回
const outFile = path.join(unpacked, "selftest.json");
env.XUANSHU_SELF_TEST_OUT = outFile;
// 刚打完包的 exe 可能被 Windows Defender / 索引服务短暂锁定（spawnSync 报 EBUSY），加重试。
let st = { error: null, stdout: "", stderr: "" };
for (let attempt = 1; attempt <= 5; attempt += 1) {
  st = spawnSync(exe, ["--self-test"], { cwd: unpacked, env, encoding: "utf-8", timeout: 120000 });
  if (!st.error) break;
  if (attempt === 5) break;
  console.log(`[pack] 自检进程启动失败（${st.error.code}），3 秒后重试（${attempt + 1}/5）...`);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
}
if (st.error) {
  console.error(`[pack] 自检进程启动失败（${st.error.code}，已重试 5 次）：${st.error.message}`);
  process.exit(1);
}
let out = `${st.stdout ?? ""}${st.stderr ?? ""}`;
try {
  out = `${fs.readFileSync(outFile, "utf-8")}\n${out}`;
} catch {
  /* 文件没生成就退回 stdout/stderr */
}

/** 从混合输出里抠出第一个完整的 JSON 对象（产物尾部常有 Chromium 日志行） */
function extractJson(text) {
  const marker = text.indexOf("XUANSHU_SELF_TEST");
  if (marker < 0) return null;
  const start = text.indexOf("{", marker);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

const raw = extractJson(out);
if (!raw) {
  console.error("[pack] 自检未产出可解析结果，原始输出：");
  console.error(out.slice(0, 4000));
  process.exit(1);
}

let report;
try {
  report = JSON.parse(raw);
} catch (e) {
  console.error("[pack] 自检 JSON 解析失败：", String(e));
  process.exit(1);
}

for (const c of report.checks) {
  console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}：${c.detail}`);
}
console.log(
  `[pack] electron ${report.electron} / chrome ${report.chrome} / node ${report.node} / ${report.platform} / packaged=${report.packaged}`
);

const failed = report.checks.filter((c) => !c.ok);
if (!report.ok || failed.length) {
  console.error(`[pack] 产物自检未通过：${failed.map((c) => c.name).join(", ")}`);
  process.exit(1);
}
console.log("[pack] 产物自检全部通过");
