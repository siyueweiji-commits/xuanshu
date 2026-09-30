/**
 * 应用自检入口（开发态）：剥离 ELECTRON_RUN_AS_NODE 后以真正的 Electron 启动 `--self-test`。
 *
 * 本机环境变量 ELECTRON_RUN_AS_NODE=1 会让 `electron .` 退化成纯 Node，
 * 于是 better-sqlite3 加载不了、也没有 BrowserWindow，自检会全线报错。
 * 直接 `npm run self-test` 因此不可靠，这里统一用子进程剥离该变量。
 *
 * 用法：npm run self-test
 */
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

if (process.versions.electron && !("ELECTRON_RUN_AS_NODE" in process.env)) {
  // 已经在真 Electron 里（理论上不会走到这里）
  process.exit(0);
}

const exe = require("electron");
if (typeof exe !== "string") {
  console.error("[self-test] 无法定位 electron 可执行文件，请先 npm install");
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// 沙箱/工具链可能塞了 --require 垫片，打包与自检场景下会打 ERROR 干扰输出
delete env.NODE_OPTIONS;

const ret = spawnSync(exe, [ROOT, "--self-test"], { stdio: "inherit", env, cwd: ROOT });
process.exit(ret.status ?? 1);
