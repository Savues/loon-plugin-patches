#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""make-fixture.py —— 从真机抓包里取出脚本回归测试用的 fixture，并做脱敏。

为什么要有这个
--------------
2026-09-30 那次真机测试证明了一件事：光靠「读代码判断属性名对不对」不够。
`catalogue` / `audio-quality` 这些值必须拿**真实响应体**喂进脚本再解回来比对，
才能确认写入路径真的通。本脚本把那份 HAR 里两份 83 KB 的 protobuf 响应体
固化成 `test/fixtures/*.bin.gz`，供 `test/script.test.mjs` 反复回放。

脱敏（重要）
------------
原始响应体含用户账号标识，**不能进公开仓库**。这里做等长字节替换 ——
等长是为了不改变 protobuf 的长度前缀，结构完全不变，脚本行为与原响应一致：

    account-id            ntacRhFiBU          ->  0000000000
    strider-key           31ac3313b15         ->  000000000000
    at-signal             3,fc0da25514        ->  3,00000000000
    account-creation-time 2016-11-02T08:52:25Z ->  2000-01-01T00:00:00Z
    feature-set-id-masked e6e77f401d          ->  0000000000

用法
----
    python3 patch/make-fixture.py <HAR 路径>      # 生成 test/fixtures/
"""

import base64
import gzip
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(HERE, '..', 'test', 'fixtures')

# (原字节, 替换字节) —— 长度必须相同
REDACT = [
    (b'ntacRhFiBU', b'0000000000'),
    (b'31ac3313b15', b'00000000000'),
    (b'3,fc0da25514', b'3,0000000000'),
    (b'2016-11-02T08:52:25Z', b'2000-01-01T00:00:00Z'),
    (b'e6e77f401d', b'0000000000'),
]


def redact(b, name):
    for old, new in REDACT:
        assert len(old) == len(new), '替换必须等长：%r' % old
        n = b.count(old)
        if n:
            print('    脱敏 %-22s x%d' % (old.decode(), n))
            b = b.replace(old, new)
    return b


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    har = sys.argv[1]
    if not os.path.exists(har):
        print('找不到 HAR：%s' % har)
        return 2

    print('读取 %s' % har)
    entries = json.load(open(har, encoding='utf-8'))['log']['entries']

    picked = {}
    for e in entries:
        u = e['request']['url']
        if e['response']['status'] != 200:
            continue
        if '/user-customization-service' in u and 'customize' not in picked:
            picked['customize'] = e
        elif '/bootstrap/v1/bootstrap' in u and 'bootstrap' not in picked:
            picked['bootstrap'] = e

    if len(picked) != 2:
        print('只找到 %d 份 200 响应（需要 customize + bootstrap 各一份）' % len(picked))
        return 1

    os.makedirs(FIXTURES, exist_ok=True)
    for name, e in sorted(picked.items()):
        raw = base64.b64decode(e['response']['content']['text'])
        print('  %s: %d B  %s' % (name, len(raw), e['startedDateTime']))
        raw = redact(raw, name)
        out = os.path.join(FIXTURES, '%s.bin.gz' % name)
        with gzip.open(out, 'wb', compresslevel=9) as f:
            f.write(raw)
        print('    -> %s (%d B)' % (os.path.relpath(out, HERE), os.path.getsize(out)))

    print('\n完成。fixture 已脱敏，可安全入库。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
