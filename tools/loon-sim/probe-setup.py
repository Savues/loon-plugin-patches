#!/usr/bin/env python3
"""version-probe setup — 在插件 [Rewrite] 埋/更新版本探针规则 (v2: 借用插件已 MITM 的域名)

v1 缺陷: 自造 .local 域名不在 [Mitm] → Loon 不解密 → [Rewrite] 永远看不到 → 探针失效。
v2 方案: 探针路径挂在插件【已在 MITM 列表】的域名下, 如:
  https://acs.m.taobao.com/gw/loon-sim.probe/<插件名>
[Rewrite] 规则匹配该路径并 reject(200, "版本号")。

用法: python3 probe-setup.py <plugin.lpx>
"""
import re, sys

lpx = sys.argv[1]
name = re.sub(r'\.lpx$', '', lpx.split('/')[-1]).lower()
s = open(lpx).read()
m = re.search(r'^#!version=(.+)$', s, re.M)
ver = m.group(1).strip() if m else '0'

# 从 [Mitm] hostname 列表挑第一个域名做探针宿主
mitm_m = re.search(r'^hostname\s*=\s*(.+)$', s, re.M | re.I)
if not mitm_m:
    print('❌ 插件无 [Mitm] hostname — 探针需借用已 MITM 域名'); sys.exit(1)
host = mitm_m.group(1).split(',')[0].strip()

# v1 .local 探针 (清理旧埋点)
s = re.sub(r'^# 版本探针 \(version-probe\.sh 用, 勿删\)\nrequest if \$\{url\} ~= /probe\\\.[^\n]*\n', '', s, flags=re.M)

probe_base = '/gw/loon-sim\\.probe\\.' + name
probe_path = probe_base + '/i'
pat = re.compile(r'(?:^# 版本探针 v2 \(version-probe\.sh 用, 勿删\)\n)?request if \$\{url\} ~= ' + re.escape(probe_path) + r'[^ ]* then reject\(200, "[^"]*"\)', re.M)
rule = ('# 版本探针 v2 (version-probe.sh 用, 勿删)\n'
        'request if ${url} ~= ' + probe_path + ' then reject(200, "' + ver + '")')

if pat.search(s):
    s = pat.sub(lambda _: rule, s)
    print(f'✅ 探针已更新 → v{ver} @ {host}')
else:
    s2 = re.sub(r'^\[Rewrite\]$', '[Rewrite]\n' + rule, s, count=1, flags=re.M)
    if s2 == s:
        print('❌ 无 [Rewrite] 段'); sys.exit(1)
    s = s2
    print(f'✅ 探针已埋入 → v{ver} @ {host}')

# 写探针 URL 到插件旁 (version-probe.sh 读取)
open(lpx + '.probe', 'w').write(f'https://{host}/gw/loon-sim.probe.{name}\n')
open(lpx, 'w').write(s)
