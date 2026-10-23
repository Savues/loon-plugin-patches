#!/usr/bin/env python3
"""version-probe setup — 在插件 [Rewrite] 埋/更新版本探针规则
用法: python3 probe-setup.py <plugin.lpx>
"""
import re, sys

lpx = sys.argv[1]
name = re.sub(r'\.lpx$', '', lpx.split('/')[-1]).lower()
s = open(lpx).read()
m = re.search(r'^#!version=(.+)$', s, re.M)
ver = m.group(1).strip() if m else '0'

pat = re.compile(r'(?:^# 版本探针 \(version-probe\.sh 用, 勿删\)\n)?request if \$\{url\} ~= /probe\\\.' + re.escape(name) + r'[^ ]*?loon-sim\\\.local/ then reject\(200, "[^"]*"\)', re.M)
rule = '# 版本探针 (version-probe.sh 用, 勿删)\nrequest if ${url} ~= /probe\\.' + name + '\\.loon-sim\\.local/ then reject(200, "' + ver + '")'

if pat.search(s):
    s = pat.sub(lambda _: rule, s)
    print(f'✅ 探针规则已更新 → v{ver}')
else:
    # 行首锚定 [Rewrite] 段头 (desc 等文本里的 [Rewrite] 不会被误匹配)
    s2 = re.sub(r'^\[Rewrite\]$', '[Rewrite]\n' + rule, s, count=1, flags=re.M)
    if s2 == s:
        print('❌ 插件无 [Rewrite] 段'); sys.exit(1)
    s = s2
    print(f'✅ 探针规则已埋入 → v{ver}')
open(lpx, 'w').write(s)
