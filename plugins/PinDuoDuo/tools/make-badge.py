#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成拼多多百补页「广告」角标 PNG。

用法:
    python3 tools/make-badge.py corner

输入: src/assets/ad-badge-src.png —— 美术源（当前是用户直接提供的最终角标图，184×208）
输出: src/assets/ad-badge.png —— 提交进仓库的资产（会被 data URI 内联进两个脚本）

v1.97 起：用户直接提供最终角标图，脚本退化为「校验 + 复制」。
（v1.94~v1.96 时这里做的是重排：从用户 530×150 横幅里取出字形，
  竖排/横排叠进 184×208 画布 —— 那两步已被用户自己的成品图取代。）

槽位与比例（2026-10-22 真机证据，改图前务必先看）:
  · 商品图左上角角标槽 ltIcon → CSS `.ilx1YR3r{height:.52rem;width:.46rem}`
    0.46×0.52rem ≈ 46×52px，官方角标位；宽高比 0.46/0.52 = 0.885
  · img 默认 object-fit:fill → **资产宽高比必须 = 0.885**，否则字被拉变形
  · 标题旗标槽 goodsFlagIcon 只有 0.15rem ≈ 15px 高，横幅字压到 10px → 手机看不见
"""
import os
import shutil
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "src", "assets")
SRC = os.path.join(ASSETS, "ad-badge-src.png")
OUT = os.path.join(ASSETS, "ad-badge.png")

CW, CH = 184, 208      # 角标槽比例 0.885（被 CSS 锁死，不能随便改）


def make_corner(src_path=SRC, out_path=OUT):
    im = Image.open(src_path)
    if im.format != "PNG":
        raise SystemExit("美术源必须是 PNG：%s" % src_path)
    if im.size != (CW, CH):
        raise SystemExit(
            "尺寸必须是 %dx%d（角标槽比例 0.885），实际 %dx%d —— 比例不对会被拉变形"
            % (CW, CH, im.size[0], im.size[1]))
    shutil.copyfile(src_path, out_path)
    return (CW, CH)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "corner"
    os.makedirs(ASSETS, exist_ok=True)
    if mode != "corner":
        raise SystemExit("用法: make-badge.py [corner]")
    size = make_corner()
    print("生成 ad-badge.png %dx%d (%d B)" % (size[0], size[1], os.path.getsize(OUT)))
