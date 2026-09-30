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
| 数据更新 | 🔜 M8 | manifest + sha256 校验 + 回滚 |

## 设计

界面采用 **Apple 简约风**：设计令牌集中在 `tailwind.config.js`，可复用组件类集中在
`src/index.css` 的 `@layer components`（`.card` / `.input` / `.select` / `.btn-*` /
`.seg` / `.nav-item` / `.chip` / `.notice` 等），页面不再各自拼写样式字符串。

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
npm run shot       # 用 Electron 真实渲染各路由并截图到 .uishot/
npm run dist:win   # 打包 Windows 安装包
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

## 目录结构

```
xuanshu/
├─ electron/        # 主进程：main / preload / ipc / db / services
├─ src/             # React 前端：pages / lib
├─ resources/       # 内置规则库 / 知识库 / 模板 / 数据
├─ docs/            # PRD 等文档
└─ .github/         # CI / Release workflows
```

## 里程碑

M1 骨架 → M2 历法+紫微 → M3 八字 → M4 流日+黄历 → M5 规则引擎+报告 → M6 梅花+六爻 → M7 反馈回测 → M8 更新模块 → M9 打包分发 → M10 优化发布

## 许可证

[MIT](./LICENSE)
