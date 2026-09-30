# 玄枢 XuanShu

开箱即用的**离线命理应用**：紫微斗数 / 八字 / 梅花易数 / 六爻 / 流日黄历，一个安装包双击即用，无需服务器、无需数据库配置、无需命令行。

> ⚠️ 免责声明：本应用为文化娱乐工具，不构成任何医疗、法律、投资或驾驶安全建议，不承诺任何预测准确性。所有数据仅保存在本地。

## 特性

- **开箱即用**：Windows `.exe` / macOS `.dmg` / Linux `.AppImage`
- **离线优先**：断网可完整使用
- **联网增强**：有网时从 [`xuanshu-data`](https://github.com/siyueweiji-commits/xuanshu-data) 自动更新历法 / 规则库 / 知识库
- **数据自持**：SQLite 本地存储，不上传云端，可导出 / 可删除
- **规则透明**：规则库 JSON 可查看、可修改、可导入导出

## 功能模块

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 档案管理 | ✅ M1 | 多档案、本地存储 |
| 历法转换 | ✅ M2 | 公农历 / 干支 / 节气 / 真太阳时 |
| 紫微斗数 | ✅ M2 | 十二宫方格盘 / 四化 / 大限流年流月流日流时 / 命盘导出 PNG |
| 八字排盘 | ✅ M3 | 四柱十神 / 藏干纳音地势旬空 / 五行力量与旺衰喜忌 / 大运流年流月 / 神煞 |
| 梅花易数 | ✅ M6 | 时间 / 数字 / 报数三法起卦；本卦·互卦·变卦·错卦·综卦；体用生克 |
| 六爻 | ✅ M6 | 铜钱模拟 / 手动录入；京房纳甲装卦：纳甲·六亲·六神·世应·伏神；动爻变卦 |
| 流日黄历 | ✅ M4 | 干支宜忌 / 冲煞 / 建除十二神 / 二十八宿 / 天神 / 吉神凶煞 / 方位 / 十二时辰吉凶 / 五类注意事项 |
| 规则引擎 | ✅ M5 | 71 条内置规则按事实键值命中；可在设置中逐条启停，支持导入导出 JSON，改完立即生效 |
| 报告生成 | ✅ M5 | 零依赖模板引擎渲染 Markdown；单日 / 区间（1~90 天）报告，可选叠加个人命盘，可存档与导出 .md |
| 反馈回测 | ✅ M7 | 记录破财/争吵/生病/好事等实际事件；与该日注意事项逐条对账，统计规则命中率，可导出 CSV |
| 数据更新 | ✅ M8 | 从更新源拉 manifest → 逐文件 sha256 校验 → 备份后落地 → 失败可回滚；支持 http / 本地目录 / file:// |
| 打包分发 | ✅ M9 | electron-builder 三平台安装包；应用图标；首次启动免责声明；产物自检 `--self-test` |
| 主题与数据管理 | ✅ M10 | 浅色 / 深色 / 跟随系统；起局默认（真太阳时 / 城市）；全量数据导出导入与一键清除（二次确认） |

## 设计

界面采用 **Apple 简约风**：设计令牌集中在 `tailwind.config.js`，可复用组件类集中在
`src/index.css` 的 `@layer components`（`.card` / `.input` / `.select` / `.btn-*` /
`.seg` / `.nav-item` / `.chip` / `.notice` 等），页面不再各自拼写样式字符串。

**深浅色主题**：全部颜色令牌落地为 CSS 变量（`:root` 与 `.dark` 两套），
切换主题只需给 `<html>` 加 / 去 `.dark` 类，组件代码里不写任何 `dark:` 变体。
主题可在设置页选择「跟随系统 / 浅色 / 深色」，切换时同步更新无边框窗口的标题条配色。

窗口为**无边框标题栏**（`titleBarStyle: hidden` + `titleBarOverlay`），
渲染层用 `.titlebar-drag` 划分可拖拽区域，右上角保留系统窗口控件。

## 技术栈

Electron 31 · React 18 · TypeScript 5 · Vite 5 · Tailwind CSS 3 · better-sqlite3 · iztro · lunar-typescript

## 开发

```bash
npm install        # 安装依赖
npm run dev        # 启动开发（Vite + Electron）
npm run typecheck  # 类型检查
npm run build      # 编译主进程 + 渲染进程
npm run verify:main # 真实主进程端到端校验（SQLite ABI / IPC / 窗口配置）
npm run verify:m4  # 流日 + 黄历服务层校验（含 120 天压测）
npm run verify:m5  # 模板引擎 / 报告生成 / 规则库管理校验（含 30 天区间压测）
npm run verify:m6  # 卦象基础 / 梅花三法 / 六爻装卦校验（含标准卦表比对与 1000 次铜钱分布）
npm run verify:m7  # 反馈 CRUD 与回测命中率校验（走 Electron，含 365 天回测压测）
npm run verify:m8  # 数据更新校验（走 Electron，源用本地 xuanshu-data 仓库，含篡改/越界/回滚）
npm run self-test  # 开发态自检：资源 / 原生模块 / 数据库 / 服务层 / 界面渲染
npm run shot       # 用 Electron 真实渲染各路由并截图到 .uishot/
npm run icons      # 生成 build/icon.{png,ico,icns}
npm run pack:dir   # 打包成免安装目录并**自动跑产物自检**（推荐先跑这个）
npm run dist:win   # 打包 Windows 安装包（NSIS）
```

> 新增 IPC 通道时必须同时改三处：`electron/services/*.ts` 实现 →
> `electron/ipc/index.ts` 注册 → `electron/preload.ts` 白名单前缀。
> 白名单是前缀正则，漏改不会在 typecheck / build 阶段报错，只会在运行时抛
> `IPC channel not allowed`。

> **首次启动前**：`npm install` 只给当前 Node 装 `better-sqlite3`，
> 天然不含 Electron ABI 的二进制，直接 `npm run dev` 会报
> `Could not locate the bindings file`。执行一次即可修复：
>
> ```bash
> npm run deps:electron     # 等价于 python scripts/fetch-native-deps.py
> ```
>
> 该脚本走 npmmirror 二进制镜像，不需要编译器，也不需要能连通 GitHub。
> 若本机网络可以直连 GitHub，用官方的 `npx electron-builder install-app-deps` 亦可。

数据目录：`%APPDATA%/xuanshu/`（Windows）。

## 打包与自检

```bash
npm run pack:dir:win    # 打成 win-unpacked 目录，随后自动执行产物自检
npm run pack:dir:mac
npm run pack:dir:linux
npm run dist:win        # 正式 NSIS 安装包
```

`pack:dir` 会做两件容易漏掉的事：

1. **每次输出到全新的时间戳目录**（`release/dir-<时间戳>/`），既避免「清空旧目录」失败，
   又保留历次产物可对比；
2. **打完立刻跑产物自检** —— 执行 `XuanShu.exe --self-test`，在**真实 asar 环境**下逐项验证：

   - `app.getAppPath()` 是否落在 `app.asar` 内
   - 四类内置资源（rules / knowledge / templates / data）在 asar 内是否可读
   - `better-sqlite3` 原生模块（`asarUnpack` 后）能否真正 dlopen 并建表
   - 八字 / 紫微 / 梅花 / 六爻 / 流日报告 是否真能算出来，且**规则至少命中一次**
   - 开一个隐藏窗口加载 `dist/index.html`，确认 React 挂载、侧边导航齐备、preload 已注入

   「`npm run build` 通过」不代表安装包可用；这一步才是发布前的最后一道闸。
   自检输出 `XUANSHU_SELF_TEST { … }` 便于本地与 CI 解析，失败时退出码非 0。

> 本机若已设置 `ELECTRON_RUN_AS_NODE=1`，直接 `electron .` 会退化成纯 Node，
> 因此自检统一走 `npm run self-test`（内部剥离该变量）。
>
> 若本机无法访问 GitHub，electron-builder 会卡在下载 Electron 二进制，
> `pack:dir` 会自动改用本地 `node_modules/electron/dist` 作为分发源。

## 目录结构

```
xuanshu/
├─ electron/        # 主进程：main / preload / ipc / db / services
├─ src/             # React 前端：pages / components / lib
├─ resources/       # 内置规则库 / 知识库 / 模板 / 数据（打包进 asar）
├─ build/           # 应用图标（生成物）
├─ scripts/         # 校验脚本 / 截图 / 打包 / 图标生成
├─ docs/            # PRD 等文档
└─ .github/         # CI / Release workflows
```

## 里程碑

M1 骨架 → M2 历法+紫微 → M3 八字 → M4 流日+黄历 → M5 规则引擎+报告 → M6 梅花+六爻 → M7 反馈回测 → M8 更新模块 → M9 打包分发 → M10 优化发布 —— **全部完成 ✅**

## 许可证

[MIT](./LICENSE)
