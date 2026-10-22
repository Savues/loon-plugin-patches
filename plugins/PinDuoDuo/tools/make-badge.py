#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成拼多多百补页「广告」角标 PNG。

用法:
    python3 tools/make-badge.py corner   # 184×208 竖版角标（商品图左上角槽位，v1.94 起）

输入: src/assets/ad-badge-src.png —— 用户自备的原始横幅图（530×150，半透明黑底 + 白字「广告」）
输出: src/assets/ad-badge.png —— 角标槽专用资产（184×208）

为什么要重排（2026-10-22 真机证据）:
  · 标题旗标槽 goodsFlagIcon → CSS `.aFOWVd6O{height:.15rem}`
    0.15rem ≈ 15px（375pt 手机）→ 横幅「广告」被压到 10px 高，手机上根本看不清
    （iPad 上 rem 更大，所以 iPad 看得见 —— 这就是「手机看不到/iPad 能看到」的原因）
  · 商品图左上角角标槽 ltIcon → CSS `.ilx1YR3r{height:.52rem;width:.46rem}`
    0.46×0.52rem ≈ 46×52px，官方角标位
  横幅图（宽高比 3.53）直接塞进这个近方形槽会被拉变形，所以从原图里
  **取出用户自己的字形**（两字原样，不重新排字体），竖排叠进 184×208 画布：
  字形保持原始 81×82 尺寸，间距 14，整体居中。
  底色沿用原图的 (0,0,0,134)，白字 alpha 沿用原图。
"""
import os
import sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "src", "assets")
SRC = os.path.join(ASSETS, "ad-badge-src.png")
OUT = os.path.join(ASSETS, "ad-badge.png")

BG = (0, 0, 0, 134)        # 半透明黑底（与用户原图一致）
CW, CH = 184, 208          # 角标槽比例 0.46/0.52 = 0.885


def _chars(src_path):
    """从原图里切出两个字的 (灰度层, 高度)。灰度层用白字重绘，去掉原底色。"""
    im = Image.open(src_path).convert("RGBA")
    w, h = im.size
    px = im.load()
    colink = []
    for x in range(w):
        colink.append(any(px[x, y][0] > 170 and px[x, y][3] > 100 for y in range(h)))
    runs, inrun = [], False
    for x in range(w):
        if colink[x] and not inrun:
            st, inrun = x, True
        elif not colink[x] and inrun:
            runs.append((st, x - 1)); inrun = False
    if inrun:
        runs.append((st, w - 1))
    out = []
    for (a, b) in runs:
        ys = [y for y in range(h) for x in range(a, b + 1)
              if px[x, y][0] > 170 and px[x, y][3] > 100]
        y0, y1 = min(ys), max(ys)
        layer = Image.new("L", (b - a + 1, y1 - y0 + 1), 0)
        lp = layer.load()
        for y in range(y0, y1 + 1):
            for x in range(a, b + 1):
                r, g, bl, al = px[x, y]
                lp[x - a, y - y0] = int(r * al / 255.0)   # 白色层，alpha 沿用原图
        out.append((layer, y1 - y0 + 1))
    return out


def make_corner(src_path=SRC, out_path=OUT):
    chars = _chars(src_path)
    if len(chars) < 2:
        raise SystemExit("原图里没找到两个「广告」字形：%s" % src_path)
    im = Image.new("RGBA", (CW, CH), BG)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, CW - 1, CH - 1], fill=BG)
    gap = 14
    total = sum(c[1] for c in chars[:2]) + gap * (len(chars[:2]) - 1)
    y = (CH - total) // 2
    for layer, ch in chars[:2]:
        cw = layer.size[0]
        x = (CW - cw) // 2
        white = Image.new("RGBA", layer.size, (255, 255, 255, 255))
        white.putalpha(layer)
        im.alpha_composite(white, (x, y))
        y += ch + gap
    im.save(out_path, "PNG", optimize=True)
    return im.size


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "corner"
    os.makedirs(ASSETS, exist_ok=True)
    if mode != "corner":
        raise SystemExit("用法: make-badge.py [corner]")
    size = make_corner()
    print("生成 ad-badge.png %dx%d (%d B)" % (size[0], size[1], os.path.getsize(OUT)))
