"""为 Electron 补齐原生依赖（better-sqlite3）的预编译二进制。

背景
----
`npm install` 只会给「当前 Node」装 better-sqlite3，天然不含 Electron ABI 的
二进制；而 `npx electron-builder install-app-deps` 会去 GitHub Releases 下载
prebuild，在部分网络环境下会被代理阻断（socket hang up / 502）。

本脚本改走 npmmirror 的二进制镜像，不需要编译器，也不需要能连通 GitHub。
装完即可 `npm run dev`。

用法
----
    python scripts/fetch-native-deps.py
"""

from __future__ import annotations

import json
import os
import pathlib
import ssl
import subprocess
import sys
import tarfile
import urllib.request

MIRROR = "https://registry.npmmirror.com/-/binary"

ROOT = pathlib.Path(__file__).resolve().parent.parent
PKG = "better-sqlite3"


def electron_abi() -> tuple[str, str]:
    """返回 (electron 版本, ABI 版本号)，如 ("31.7.7", "125")"""
    exe = str(ROOT / "node_modules" / "electron" / "dist" / "electron.exe")
    if not os.path.exists(exe):
        # 退化为读取 package.json 声明版本
        pkg = json.loads((ROOT / "node_modules" / "electron" / "package.json").read_text("utf-8"))
        return pkg["version"], ""

    out = subprocess.run(
        [exe, "-p", "process.versions.modules"],
        capture_output=True,
        text=True,
        env={k: v for k, v in os.environ.items() if k != "ELECTRON_RUN_AS_NODE"},
        timeout=60,
    )
    modules = out.stdout.strip() or "?"
    pkg = json.loads((ROOT / "node_modules" / "electron" / "package.json").read_text("utf-8"))
    return pkg["version"], modules


def installed_version() -> str:
    pkg = json.loads((ROOT / "node_modules" / PKG / "package.json").read_text("utf-8"))
    return pkg["version"]


def bootstrap_electron() -> None:
    """electron 二进制没下载成功时（postinstall 被跳过）补装"""
    dist = ROOT / "node_modules" / "electron" / "dist"
    if dist.exists():
        return
    print("[deps] electron 二进制缺失，先补装…")
    subprocess.run(
        [sys.executable, str(ROOT / "node_modules" / "electron" / "install.js")],
        cwd=str(ROOT),
        env={**os.environ, "ELECTRON_MIRROR": "https://npmmirror.com/mirrors/electron/"},
        check=True,
    )


def main() -> int:
    # 镜像直连即可，走代理反而 502
    for key in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "all_proxy"):
        os.environ.pop(key, None)

    if not (ROOT / "node_modules" / PKG).exists():
        print(f"[deps] 未找到 node_modules/{PKG}，请先执行 npm install")
        return 1

    bootstrap_electron()

    abi = os.environ.get("XUANSHU_ELECTRON_ABI", "125")
    try:
        version, detected = electron_abi()
        if detected and detected != "?":
            abi = detected
    except Exception as exc:  # noqa: BLE001
        version = "?"
        print(f"[deps] 探测 Electron ABI 失败（{exc}），使用默认 v{abi}")

    pkg_ver = installed_version()
    name = f"{PKG}-v{pkg_ver}-electron-v{abi}-win32-x64.tar.gz"
    url = f"{MIRROR}/{PKG}/v{pkg_ver}/{name}"

    print(f"[deps] Electron {version} · ABI v{abi} · {PKG} {pkg_ver}")
    print(f"[deps] 下载 {url}")

    ctx = ssl.create_default_context()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "xuanshu-setup"})
        with urllib.request.urlopen(req, timeout=180, context=ctx) as resp:
            blob = resp.read()
    except Exception as exc:  # noqa: BLE001
        print(f"[deps] 下载失败：{exc!r}")
        print("[deps] 可改为在有网环境执行： npx electron-builder install-app-deps")
        return 1

    mod = ROOT / "node_modules" / PKG
    tmp = mod / "_prebuild.tar.gz"
    tmp.write_bytes(blob)
    print(f"[deps] 已下载 {len(blob) / 1024:.0f} KB，解压中…")

    with tarfile.open(tmp, "r:gz") as tf:
        try:
            tf.extractall(mod, filter="data")
        except TypeError:  # Python < 3.12 无 filter 参数
            tf.extractall(mod)
    tmp.unlink(missing_ok=True)

    target = mod / "build" / "Release" / "better_sqlite3.node"
    if not target.exists():
        print(f"[deps] 解压后未找到 {target}")
        return 1

    print(f"[deps] 完成 → {target}（{target.stat().st_size / 1024:.0f} KB）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
