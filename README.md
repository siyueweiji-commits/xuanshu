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
| 历法转换 | 🔜 M2 | 公农历 / 干支 / 节气 / 真太阳时 |
| 紫微斗数 | 🚧 M1 骨架 | 基于 [iztro](https://github.com/SylarLong/iztro) |
| 八字排盘 | 🚧 M1 骨架 | 基于 [lunar-typescript](https://github.com/6tail/lunar-typescript) |
| 梅花易数 | 🚧 M1 骨架 | 时间起卦 / 数字起卦 |
| 六爻 | 🚧 M1 骨架 | 铜钱模拟起卦 |
| 流日运势 | 🔜 M4 | 黄历宜忌 + 规则引擎注意事项 |
| 报告生成 | 🔜 M5 | 模板拼接 + 规则库约束 |
| 反馈回测 | 🔜 M7 | 事件记录 + 命中率统计 |
| 数据更新 | 🔜 M8 | manifest + sha256 校验 + 回滚 |

## 技术栈

Electron 31 · React 18 · TypeScript 5 · Vite 5 · Tailwind CSS 3 · better-sqlite3 · iztro · lunar-typescript

## 开发

```bash
npm install        # 安装依赖
npm run dev        # 启动开发（Vite + Electron）
npm run typecheck  # 类型检查
npm run build      # 编译主进程 + 渲染进程
npm run dist:win   # 打包 Windows 安装包
```

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
