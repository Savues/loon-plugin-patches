#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""run_all.py — 跑本仓库全部可运行的回归测试

用法：python3 tools/run_all.py
任一测试失败则整体退出码非 0。
"""
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (相对路径, 说明, 解释器)  —— 解释器缺省按 .py / .mjs 后缀判断
TESTS = [
    ("plugins/AdGuard-Spoof/test/equivalence.test.mjs", "AdGuard-Spoof 去混淆等价性"),
    ("plugins/AntiRevoke/test/manifest.test.mjs", "AntiRevoke 清单"),
    ("plugins/Reven-Mirror/test/manifest.test.mjs", "Reven-Mirror 托管正确性"),
    ("plugins/Bilibili-Dedup/vip.test.mjs", "Bilibili-Dedup VIP 伪装"),
    ("plugins/GeoFix/parse.test.mjs", "GeoFix 链接解析"),
    ("plugins/GeoFix/ui.test.mjs", "GeoFix 网页界面"),
    ("plugins/GeoFix/smoke.test.mjs", "GeoFix 冒烟"),
    ("plugins/GeoFix/manifest.test.mjs", "GeoFix 清单"),
    ("plugins/YouTube-Dedup/test/feed-gaming.test.mjs", "YouTube-Dedup 自研脚本"),
    ("plugins/YouTube-Test/test/shorts-arg.test.mjs", "YouTube-Test shorts 参数"),
    ("plugins/YouTube-Test/test/argument-wiring.test.mjs", "YouTube-Test 开关接线"),
    ("plugins/PinDuoDuo/test/manifest.test.mjs", "PinDuoDuo 清单 + 版本号守卫"),
    ("plugins/Spotify-Dedup/test/manifest.test.mjs", "Spotify-Dedup 合订清单 + 开关接线"),
    ("patches/test-patch-blockads.py", "blockAds 退场补丁器", "python3"),
]

failed, skipped = [], []

for entry in TESTS:
    rel, desc = entry[0], entry[1]
    runner = entry[2] if len(entry) > 2 else ("python3" if rel.endswith(".py") else "node")
    path = os.path.join(REPO, rel)
    if not os.path.exists(path):
        skipped.append((rel, "文件不存在"))
        continue
    try:
        p = subprocess.run([runner, path], capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        failed.append((rel, desc, "超时"))
        print(f"✗ {desc}\n    超时")
        continue
    if p.returncode != 0:
        tail = [l for l in p.stdout.splitlines() if "✗" in l or l.startswith("Error")]
        failed.append((rel, desc, tail))
        print(f"✗ {desc}")
        for l in tail[:6]:
            print("    " + l.strip())
        err = [l for l in p.stderr.splitlines() if l.strip() and "Warning" not in l]
        if err:
            print("    " + err[-1].strip())
    else:
        m = [l for l in p.stdout.splitlines()
             if l.startswith("通过") or " 条断言" in l]
        print(f"✓ {desc}" + (f"  ({m[-1].strip()})" if m else ""))

print()
print(f"共 {len(TESTS)} 项，失败 {len(failed)}，跳过 {len(skipped)}")
for rel, why in skipped:
    print(f"  跳过 {rel} —— {why}")
sys.exit(1 if failed else 0)
