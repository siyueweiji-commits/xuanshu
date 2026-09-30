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
| 梅花易数 | 🚧 M1 骨架 | 时间起卦 / 数字起卦 |
| 六爻 | 🚧 M1 骨架 | 铜钱模拟起卦 |
| 流日运势 | 🔜 M4 | 黄历宜忌 + 规则引擎注意事项 |
| 报告生成 | 🔜 M5 | 模板拼接 + 规则库约束 |
| 反馈回测 | 🔜 M7 | 事件记录 + 命中率统计 |
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
npm run shot       # 用 Electron 真实渲染各路由并截图到 .uishot/
npm run dist:win   # 打包 Windows 安装包
```

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
