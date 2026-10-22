#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成拼多多百补页「广告」角标 PNG。

用法:
    python3 tools/make-badge.py corner   # 184×208 画布 + 居中横排「广告」块

输入: src/assets/ad-badge-src.png —— 用户自备的原始横幅图（530×150，半透明黑底 + 白字「广告」）
输出: src/assets/ad-badge.png —— 角标槽专用资产（184×208）

槽位与比例（2026-10-22 真机证据）:
  · 商品图左上角角标槽 ltIcon → CSS `.ilx1YR3r{height:.52rem;width:.46rem}`
    0.46×0.52rem ≈ 46×52px，官方角标位；宽高比 0.46/0.52 = 0.885
  · 画布必须保持 0.885，否则 img 会被拉变形（默认 object-fit: fill）
  · 标题旗标槽 goodsFlagIcon 只有 0.15rem ≈ 15px 高，横幅字被压到 10px → 手机看不见

为什么内容是「横排 + 居中 + 留白」:
  · 用户要求横排（竖排 46×52 的黑块太重、太大）
  · 但画布是 0.885 的竖向比例，横排字若铺满画布会变形；
    所以只把用户原图里那块「黑底 + 横排广告」整体缩放到 150px 宽，
    居中放进 184×208 画布，四周留透明 —— 屏幕上表现为角标位置一条
    横向的小黑标（约 37×23 px），不遮商品图。
  · 字形与底色/字色 alpha 全部沿用用户原图，不重新排字体。
"""
import os
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "src", "assets")
SRC = os.path.join(ASSETS, "ad-badge-src.png")
OUT = os.path.join(ASSETS, "ad-badge.png")

CW, CH = 184, 208      # 画布 = 角标槽比例 0.885（必须，否则会被拉变形）
BLOCK_W = 150          # 内容块宽度（px），缩放后居中


def _block_bbox(src_path):
    """用户原图里「黑底 + 字」整块的包围盒（按 alpha>40 判定）。"""
    im = Image.open(src_path).convert("RGBA")
    w, h = im.size
    px = im.load()
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 40:
                xs.append(x); ys.append(y)
    if not xs:
        raise SystemExit("原图里没找到内容：%s" % src_path)
    return im, (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def make_corner(src_path=SRC, out_path=OUT):
    im, box = _block_bbox(src_path)
    block = im.crop(box)
    scale = BLOCK_W / float(block.size[0])
    block = block.resize((BLOCK_W, max(1, int(round(block.size[1] * scale)))), Image.LANCZOS)
    canvas = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    x = (CW - block.size[0]) // 2
    y = (CH - block.size[1]) // 2
    canvas.alpha_composite(block, (x, y))
    canvas.save(out_path, "PNG", optimize=True)
    return canvas.size


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "corner"
    os.makedirs(ASSETS, exist_ok=True)
    if mode != "corner":
        raise SystemExit("用法: make-badge.py [corner]")
    size = make_corner()
    print("生成 ad-badge.png %dx%d (%d B)" % (size[0], size[1], os.path.getsize(OUT)))
