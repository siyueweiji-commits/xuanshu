#!/usr/bin/env python3
"""玄枢项目 GitHub 引导脚本
============================

一次做完三件事（全部走你的 PAT，不依赖任何连接器）：
  1. 推送 xuanshu        -> github.com/siyueweiji-commits/xuanshu
  2. 推送 xuanshu-data   -> github.com/siyueweiji-commits/xuanshu-data
  3. 在 xuanshu 创建 M1~M10 共 10 个里程碑 Issue（幂等，重复跑不会建重复的）

用法
----
先准备一个有 repo 权限的 PAT（GitHub -> Settings -> Developer settings ->
Personal access tokens -> Tokens(classic) -> Generate new token，勾选 `repo`），
然后在本文件所在目录执行：

    # Git Bash
    export GITHUB_TOKEN=ghp_xxxxxxxx
    python scripts/bootstrap_github.py

    # Windows CMD
    set GITHUB_TOKEN=ghp_xxxxxxxx
    python scripts/bootstrap_github.py

    # PowerShell
    $env:GITHUB_TOKEN="ghp_xxxxxxxx"
    python scripts/bootstrap_github.py

只想干其中一件事时加参数：
    python scripts/bootstrap_github.py --only push      # 只推代码
    python scripts/bootstrap_github.py --only issues    # 只建 Issue

依赖：仅 Python 标准库，无需 pip 安装。
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

# --------------------------------------------------------------------------
# 配置
# --------------------------------------------------------------------------
OWNER = "siyueweiji-commits"
MAIN_REPO = "xuanshu"
DATA_REPO = "xuanshu-data"
BRANCH = "main"
API = "https://api.github.com"

WORKSPACE = Path(__file__).resolve().parent.parent          # xuanshu/
DATA_DIR = WORKSPACE.parent / DATA_REPO                     # xuanshu-data/

# --------------------------------------------------------------------------
# 里程碑 Issue 内容（依据 docs/PRD.md 第 12 节及各功能模块章节）
# --------------------------------------------------------------------------
ISSUES: list[dict[str, object]] = [
    {
        "title": "M1 项目骨架 + Electron + SQLite",
        "labels": ["milestone:M1", "type:infra"],
        "body": """## 目标

搭建可运行的 Electron 应用骨架，完成 SQLite 建库。**产出：能启动、能建库。**

## 任务清单

- [x] 目录结构：`electron/`（主进程）+ `src/`（React 前端）+ `resources/`（规则/知识库/模板/数据）
- [x] Electron 主进程、预加载脚本、IPC 通道
- [x] React 18 + Vite 5 + Tailwind CSS 3 前端骨架
- [x] better-sqlite3 建库与迁移（`001_init.ts`）
- [x] 基础页面：首页 / 紫微 / 八字 / 梅花 / 六爻 / 设置
- [x] 打包配置 `electron-builder.yml`
- [x] CI/release 工作流骨架
- [x] 内置规则库、知识库、模板、城市经纬度

## 验收标准

- [ ] `npm run dev` 能启动应用窗口
- [ ] `npm run build` 编译主进程 + 渲染进程无错误
- [ ] 首次启动能在用户数据目录创建 SQLite 库（7 张表）
- [ ] `npm run typecheck` 通过

## 数据模型（PRD 第 7 节）

`profiles` / `charts` / `daily_fortunes` / `divinations` / `feedbacks` / `settings` / `update_logs`
""",
    },
    {
        "title": "M2 历法转换 + 紫微排盘",
        "labels": ["milestone:M2", "type:feature"],
        "body": """## 目标

完成历法转换与紫微斗数排盘。**产出：能出命盘。**

## 任务清单

### 历法转换（PRD 4.2）
- [ ] 公历 ↔ 农历互转（lunar-typescript）
- [ ] 干支纪年、纪月、纪日、纪时
- [ ] 节气计算
- [ ] 真太阳时校正（依赖 `resources/data/city_coords.json`）

### 紫微斗数（PRD 4.3）
- [ ] 接入 iztro 排盘
- [ ] 命宫、身宫、十二宫
- [ ] 十四主星、辅星、煞星
- [ ] 四化（禄权科忌）
- [ ] 大限、流年、流月、流日、流时
- [ ] 流日斗君算法
- [ ] 命盘导出（图片 / PDF / JSON）

## 验收标准

- [ ] 输入生辰可正确排出紫微命盘
- [ ] 干支、节气、真太阳时结果与权威历法工具一致
- [ ] 排盘耗时 < 1s（PRD 第 11 节）

## 备注

依赖锁定：`iztro` ^2.0.0、`lunar-typescript` ^1.7.0（PRD 风险 2：锁定版本）
""",
    },
    {
        "title": "M3 八字排盘",
        "labels": ["milestone:M3", "type:feature"],
        "body": """## 目标

完成八字四柱排盘。**产出：能出四柱。**

## 任务清单（PRD 4.4）

- [ ] 四柱排盘（年柱 / 月柱 / 日柱 / 时柱）
- [ ] 十神标注
- [ ] 五行强弱统计
- [ ] 大运推算
- [ ] 流年、流月、流日
- [ ] 神煞
- [ ] 命盘导出

## 验收标准

- [ ] 输入生辰可正确排出四柱
- [ ] 十神、五行统计结果正确
- [ ] 大运起运时间计算正确
- [ ] 排盘耗时 < 1s
""",
    },
    {
        "title": "M4 流日 + 黄历",
        "labels": ["milestone:M4", "type:feature"],
        "body": """## 目标

完成流日运势与黄历展示。**产出：能看每日信息。**

## 任务清单

### 黄历（PRD 4.2）
- [ ] 宜忌
- [ ] 冲煞
- [ ] 彭祖百忌
- [ ] 神煞
- [ ] 建除十二神
- [ ] 二十八宿

### 流日（PRD 4.7）
- [ ] 选择日期查看流日盘
- [ ] 输出流日命宫、四化
- [ ] 黄历宜忌与流日盘整合展示

## 验收标准

- [ ] 任意日期可查看流日盘与黄历
- [ ] 黄历各项数据与权威黄历一致
- [ ] 日报生成耗时 < 3s
""",
    },
    {
        "title": "M5 规则引擎 + 报告生成",
        "labels": ["milestone:M5", "type:feature"],
        "body": """## 目标

规则引擎驱动注意事项输出，模板生成报告。**产出：能出注意事项。**

## 任务清单

### 规则引擎（PRD 第 8 节）
- [ ] 规则匹配引擎（条件匹配 + 权重排序）
- [ ] 规则格式：`id` / `system` / `condition` / `advice` / `weight` / `level` / `tags`
- [ ] 规则库六类：紫微 / 八字 / 梅花 / 六爻 / 黄历 / 通用
- [ ] 用户自定义规则、导入导出、启用禁用

### 流日提醒（PRD 4.7）
- [ ] 输出 3~10 条注意事项
- [ ] 分类：事业 / 财运 / 人际 / 健康 / 出行

### 报告生成（PRD 4.8）
- [ ] 模板拼接生成自然语言报告
- [ ] 报告必须由规则库约束，防止胡说
- [ ] 每次报告附免责声明

## 验收标准

- [ ] 能输出 3~10 条注意事项
- [ ] 修改规则后立即生效
- [ ] 每份报告均含免责声明
- [ ] 规则库可导入导出
""",
    },
    {
        "title": "M6 梅花易数 + 六爻",
        "labels": ["milestone:M6", "type:feature"],
        "body": """## 目标

完成两种起卦与排盘。**产出：能起卦排盘。**

## 任务清单

### 梅花易数（PRD 4.5）
- [ ] 时间起卦
- [ ] 数字起卦
- [ ] 报数起卦
- [ ] 体用分析
- [ ] 互卦、变卦、错卦、综卦
- [ ] 卦象解读（规则库驱动）

### 六爻（PRD 4.6）
- [ ] 铜钱起卦（模拟）
- [ ] 手动录入爻
- [ ] 装卦：纳甲、六亲、六神、世应
- [ ] 动爻、变卦
- [ ] 卦象解读（规则库驱动）

## 验收标准

- [ ] 三种起卦方式均可用
- [ ] 梅花互卦/变卦/错卦/综卦计算正确
- [ ] 六爻装卦（纳甲、六亲、六神、世应）正确
- [ ] 卦象解读由规则库驱动，可维护
""",
    },
    {
        "title": "M7 反馈记录 + 回测",
        "labels": ["milestone:M7", "type:feature"],
        "body": """## 目标

事件记录与规则命中率回测。**产出：能记录事件。**

## 任务清单（PRD 4.9）

- [ ] 用户记录实际事件：罚单、破财、争吵、生病、好事等
- [ ] 事件与日期、档案、命盘关联
- [ ] 回测：规则命中率统计
- [ ] 用户可查看历史记录
- [ ] 数据仅本地存储，可导出可删除

## 验收标准

- [ ] 能提交反馈并查看历史
- [ ] 事件与命盘正确关联
- [ ] 命中率统计结果正确
- [ ] 数据可导出为 JSON
- [ ] 数据全部本地存储，不上传
""",
    },
    {
        "title": "M8 更新模块（联网增强）",
        "labels": ["milestone:M8", "type:feature"],
        "body": """## 目标

从 GitHub 更新源拉取数据并校验。**产出：能联网更新。**

## 任务清单（PRD 4.10 / 第 9 节）

- [ ] 拉取 `manifest.json`，对比本地版本
- [ ] 下载差异文件
- [ ] 逐文件 sha256 校验
- [ ] 写入用户数据目录（不覆盖安装目录）
- [ ] 更新失败回滚
- [ ] 记录更新日志（`update_logs` 表）
- [ ] 手动触发更新
- [ ] 自动更新开关
- [ ] 更新源可配置（默认指向 `xuanshu-data`）
- [ ] 断网时自动跳过，不影响离线使用

## 验收标准

- [ ] 有网时可自动更新规则库 / 知识库 / 模板
- [ ] 哈希校验失败时不写入、正确回滚
- [ ] 关闭自动更新后不发起请求
- [ ] 更新源可改为自定义仓库地址
- [ ] 断网可完整使用，无报错

## 依赖

数据仓库 `siyueweiji-commits/xuanshu-data` 已就绪（manifest + rules/knowledge/templates/data）
""",
    },
    {
        "title": "M9 打包 + 分发",
        "labels": ["milestone:M9", "type:build"],
        "body": """## 目标

打包三平台安装包并配置发布流水线。**产出：出安装包。**

## 任务清单（PRD 第 10 节）

- [ ] electron-builder 配置完善
- [ ] Windows `.exe`（NSIS 安装包）
- [ ] macOS `.dmg`
- [ ] Linux `.AppImage`
- [ ] GitHub Actions：lint / test / build
- [ ] GitHub Actions：release（tag 触发自动出包）
- [ ] 安装包体积 < 150MB

## 验收标准

- [ ] 三平台安装包均可产出
- [ ] 双击安装、打开即用
- [ ] 用户无需 Node.js / Python / 数据库 / 命令行
- [ ] 断网可启动使用
- [ ] 打 tag 后 CI 自动发布 Release
""",
    },
    {
        "title": "M10 优化 + 文档",
        "labels": ["milestone:M10", "type:docs"],
        "body": """## 目标

性能优化、文档完备、发布正式版。**产出：正式版。**

## 任务清单

### 性能（PRD 第 11 节）
- [ ] 排盘 < 1s
- [ ] 日报 < 3s
- [ ] 启动 < 5s

### 合规与体验（PRD 4.11 / 4.12）
- [ ] 首次启动显示免责声明
- [ ] 每次报告附免责声明
- [ ] 隐私政策：数据本地、不上传
- [ ] 数据导出 / 导入 / 清除
- [ ] 主题（浅色 / 深色）
- [ ] 设置项完善（真太阳时开关、自动更新开关、数据目录）

### 文档
- [ ] 用户使用文档
- [ ] 开发文档
- [ ] 规则库编写指南
- [ ] CHANGELOG

## 验收标准

- [ ] 全部 14 项验收标准（PRD 第 14 节）通过
- [ ] 三平台正式版发布 v1.0
- [ ] 文档齐全
""",
    },
]


# --------------------------------------------------------------------------
# 工具函数
# --------------------------------------------------------------------------
def die(msg: str, code: int = 1) -> None:
    print(f"\n[×] {msg}", file=sys.stderr)
    raise SystemExit(code)


def ok(msg: str) -> None:
    print(f"[√] {msg}")


def info(msg: str) -> None:
    print(f"[·] {msg}")


def run(cmd: list[str], cwd: Path | None = None) -> tuple[int, str]:
    """执行外部命令，返回 (returncode, 合并输出)。"""
    try:
        p = subprocess.run(
            cmd, cwd=str(cwd) if cwd else None,
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except FileNotFoundError:
        return 127, f"命令不存在: {cmd[0]}"


def api(token: str, method: str, path: str, payload: dict | None = None) -> tuple[int, object]:
    """调用 GitHub REST API。"""
    url = f"{API}{path}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "xuanshu-bootstrap")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, (json.loads(body) if body else {})
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = {"message": body[:300]}
        return e.code, parsed
    except Exception as e:  # noqa: BLE001
        return 0, {"message": f"{type(e).__name__}: {e}"}


# --------------------------------------------------------------------------
# 步骤 1：推送仓库
# --------------------------------------------------------------------------
def push_repo(name: str, path: Path, token: str) -> bool:
    if not (path / ".git").is_dir():
        print(f"[!] {name}: 不是 git 仓库，跳过（{path}）")
        return False

    code, out = run(["git", "-C", str(path), "rev-parse", "--abbrev-ref", "HEAD"])
    if code != 0:
        print(f"[!] {name}: 无法读取分支 — {out.strip()[:200]}")
        return False
    branch = out.strip() or BRANCH

    code, out = run(["git", "-C", str(path), "log", "--oneline", "-1"])
    if code != 0:
        print(f"[!] {name}: 没有任何提交，跳过")
        return False

    remote_url = f"https://{OWNER}:{token}@github.com/{OWNER}/{name}.git"
    info(f"{name}: 推送 {branch} 分支 ...")
    code, out = run(["git", "-C", str(path), "push", "--quiet", remote_url, f"HEAD:refs/heads/{branch}"])

    # 输出里可能带 token，做一次脱敏
    safe = out.replace(token, "***")
    if code == 0:
        ok(f"{name}: 推送成功")
        return True
    print(f"[×] {name}: 推送失败\n{safe.strip()[:600]}")
    return False


# --------------------------------------------------------------------------
# 步骤 2：创建 Issue（幂等）
# --------------------------------------------------------------------------
def fetch_existing_titles(token: str) -> set[str]:
    titles: set[str] = set()
    page = 1
    while page <= 5:
        code, data = api(token, "GET", f"/repos/{OWNER}/{MAIN_REPO}/issues?state=all&per_page=100&page={page}")
        if code != 200 or not isinstance(data, list) or not data:
            break
        for it in data:
            if isinstance(it, dict) and "title" in it:
                titles.add(str(it["title"]))
        if len(data) < 100:
            break
        page += 1
    return titles


def create_issues(token: str) -> bool:
    info(f"{MAIN_REPO}: 读取已有 Issue ...")
    code, data = api(token, "GET", f"/repos/{OWNER}/{MAIN_REPO}")
    if code != 200:
        msg = data.get("message") if isinstance(data, dict) else data
        print(f"[×] 无法访问仓库 {OWNER}/{MAIN_REPO}（HTTP {code}）：{msg}")
        print("    请确认 PAT 勾选了 `repo`，且仓库名正确。")
        return False

    existing = fetch_existing_titles(token)
    info(f"已有 {len(existing)} 个 Issue，开始创建里程碑 ...")

    created = skipped = failed = 0
    for item in ISSUES:
        title = str(item["title"])
        if title in existing:
            print(f"[=] 已存在，跳过：{title}")
            skipped += 1
            continue
        code, resp = api(token, "POST", f"/repos/{OWNER}/{MAIN_REPO}/issues",
                         {"title": title, "body": item["body"], "labels": item["labels"]})
        if code == 201 and isinstance(resp, dict):
            print(f"[+] #{resp.get('number')}  {title}")
            created += 1
        else:
            msg = resp.get("message") if isinstance(resp, dict) else resp
            print(f"[×] 创建失败：{title} — HTTP {code} {msg}")
            failed += 1

    print(f"\n合计：新建 {created} / 跳过 {skipped} / 失败 {failed}")
    return failed == 0


# --------------------------------------------------------------------------
# 主流程
# --------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description="玄枢项目 GitHub 引导（推送 + 建 Issue）")
    parser.add_argument("--only", choices=["push", "issues"], help="只执行其中一步")
    args = parser.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass

    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if not token:
        die("未找到 GITHUB_TOKEN 环境变量。\n"
            "    Git Bash : export GITHUB_TOKEN=ghp_xxx\n"
            "    CMD      : set GITHUB_TOKEN=ghp_xxx\n"
            "    PowerShell: $env:GITHUB_TOKEN=\"ghp_xxx\"")

    # 先校验 token
    code, me = api(token, "GET", "/user")
    if code != 200:
        die(f"PAT 校验失败（HTTP {code}）：{me.get('message') if isinstance(me, dict) else me}")
    login = me.get("login") if isinstance(me, dict) else "?"
    ok(f"PAT 有效，登录身份：{login}")
    if login != OWNER:
        print(f"[!] 注意：当前 PAT 属于 `{login}`，而目标仓库属于 `{OWNER}`，请确认无误。")

    results: list[tuple[str, bool]] = []

    if args.only != "issues":
        print("\n──── 步骤 1/2：推送仓库 ────")
        results.append((MAIN_REPO, push_repo(MAIN_REPO, WORKSPACE, token)))
        results.append((DATA_REPO, push_repo(DATA_REPO, DATA_DIR, token)))

    if args.only != "push":
        print("\n──── 步骤 2/2：创建里程碑 Issue ────")
        results.append((f"{MAIN_REPO} Issues", create_issues(token)))

    print("\n════════ 结果 ════════")
    for name, good in results:
        print(f"  {'[√]' if good else '[×]'} {name}")

    return 0 if all(g for _, g in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
