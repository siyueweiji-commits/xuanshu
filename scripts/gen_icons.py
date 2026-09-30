#!/usr/bin/env python3
"""生成应用图标（build/icon.png / icon.ico / icon.icns）。

设计：Apple 风圆角方块 + 系统蓝渐变 + 白色「玄」字，
与界面左上角 logo（19px 蓝底白字「玄」）保持同一视觉语言。

用法：
    python scripts/gen_icons.py

产出：
    build/icon.png    1024×1024（Linux 与通用源图）
    build/icon.ico    16/24/32/48/64/128/256 多尺寸（内嵌 PNG，Windows Vista+ 支持）
    build/icon.icns   macOS 图标（ic07/ic08/ic09/ic10/ic11/ic12/ic13/ic14 尺寸集）

不依赖 ImageMagick，只用 Pillow + 手写容器格式，避免 CI 上另装工具。
"""
from __future__ import annotations

import struct
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("需要 Pillow：pip install pillow", file=sys.stderr)
    raise SystemExit(1)

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"

# 与 tailwind.config.js 的 accent 色一致
BLUE_TOP = (0x3D, 0x9B, 0xFF)
BLUE_BOTTOM = (0x00, 0x69, 0xDC)
RADIUS_RATIO = 0.2237  # Apple 圆角方块 ≈ 22.37%

# 优先中文字体（玄 需要 CJK 字形）
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\msjhbd.ttc",
    r"/System/Library/Fonts/PingFang.ttc",
    r"/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    r"/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
]


def find_font() -> str | None:
    for p in FONT_CANDIDATES:
        if Path(p).is_file():
            return p
    return None


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def render(size: int) -> Image.Image:
    ss = 4  # 超采样，先大后缩，边缘更干净
    w = size * ss
    img = Image.new("RGBA", (w, w), (0, 0, 0, 0))

    # 竖向渐变
    grad = Image.new("RGBA", (1, w))
    for y in range(w):
        grad.putpixel((0, y), lerp(BLUE_TOP, BLUE_BOTTOM, y / max(w - 1, 1)) + (255,))
    grad = grad.resize((w, w))

    # 圆角遮罩
    mask = Image.new("L", (w, w), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, w - 1], radius=int(w * RADIUS_RATIO), fill=255)
    img.paste(grad, (0, 0), mask)

    # 白色「玄」字
    font_path = find_font()
    if font_path:
        font = ImageFont.truetype(font_path, int(w * 0.60))
        d = ImageDraw.Draw(img)
        box = d.textbbox((0, 0), "玄", font=font)
        tw, th = box[2] - box[0], box[3] - box[1]
        d.text(((w - tw) / 2 - box[0], (w - th) / 2 - box[1] - w * 0.015), "玄", font=font, fill=(255, 255, 255, 255))
    else:
        # 找不到 CJK 字体时退化为几何图形，避免产出空白图标
        d = ImageDraw.Draw(img)
        pad = w * 0.28
        d.rounded_rectangle([pad, pad, w - pad, w - pad], radius=int(w * 0.06), outline=(255, 255, 255, 235), width=int(w * 0.035))
        d.line([w * 0.5, pad, w * 0.5, w - pad], fill=(255, 255, 255, 200), width=int(w * 0.028))

    return img.resize((size, size), Image.LANCZOS)


# ---------------------------------------------------------------- ICO

def write_ico(sizes: list[int], out: Path) -> None:
    """ICO 容器：每个条目直接内嵌 PNG（Vista+ 支持），无需 BMP 编码。"""
    import io

    entries, blobs = [], []
    for s in sizes:
        buf = io.BytesIO()
        render(s).save(buf, format="PNG", optimize=True)
        data = buf.getvalue()
        blobs.append(data)
        dim = 0 if s >= 256 else s  # 256 在 ICO 里记为 0
        entries.append((dim, dim, len(data)))

    header = struct.pack("<HHH", 0, 1, len(entries))
    offset = len(header) + 16 * len(entries)
    body = b""
    for (w, h, size), data in zip(entries, blobs):
        body += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, size, offset)
        offset += size
    out.write_bytes(header + body + b"".join(blobs))


# --------------------------------------------------------------- ICNS

ICNS_TYPES = [
    (b"ic07", 128),
    (b"ic08", 256),
    (b"ic09", 512),
    (b"ic10", 1024),
    (b"ic11", 32),
    (b"ic12", 64),
    (b"ic13", 256),
    (b"ic14", 512),
]


def write_icns(out: Path) -> None:
    import io

    chunks = b""
    for code, size in ICNS_TYPES:
        buf = io.BytesIO()
        render(size).save(buf, format="PNG", optimize=True)
        data = buf.getvalue()
        chunks += code + struct.pack(">I", len(data) + 8) + data
    out.write_bytes(b"icns" + struct.pack(">I", len(chunks) + 8) + chunks)


def main() -> int:
    BUILD.mkdir(parents=True, exist_ok=True)

    main_png = render(1024)
    main_png.save(BUILD / "icon.png", format="PNG", optimize=True)
    print(f"  build/icon.png    1024×1024（{find_font() or '无 CJK 字体，已退化'}）")

    write_ico([16, 24, 32, 48, 64, 128, 256], BUILD / "icon.ico")
    print("  build/icon.ico    16/24/32/48/64/128/256")

    write_icns(BUILD / "icon.icns")
    print("  build/icon.icns   128/256/512/1024 + 32/64")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
