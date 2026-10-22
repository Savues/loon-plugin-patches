#!/usr/bin/env python3
"""
Alibaba-AdBlock 规则自检工具

检查 [Script] 段每条规则的 `{${开关名}}` 参数, 是否完整覆盖
bundle.js 中对应处理分支里所有 isEnabled("...") 用到的开关。

背景 (v3.37.5 事故):
  规则传 {fishRemovePopup}, 但代码判断 isEnabled("removePopWindow")
  → key 不匹配 → 过滤器从不执行 → 广告照常显示, 且无任何报错

用法:  python3 tools/check_switch_keys.py
退出码: 0=通过, 1=发现缺口
"""
import re
import sys
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LPX = os.path.join(ROOT, 'Alibaba-AdBlock.lpx')
JS = os.path.join(ROOT, 'src', 'bundle.js')


def arg_keys(line):
    """从规则行提取 {${a}, ${b}} 中的开关名"""
    j = line.find('then script("')
    if j < 0:
        return []
    p = line.find('"', j + 13)
    k = line.find(', {', p)
    if k < 0:
        return []
    start, depth = k + 2, 0
    for i in range(start, len(line)):
        if line[i] == '{':
            depth += 1
        elif line[i] == '}':
            depth -= 1
            if depth == 0:
                return re.findall(r'\$\{(\w+)\}', line[start:i])
    return []


def body_of(js, fn):
    s = js.find('function ' + fn + '(')
    if s < 0:
        return ''
    e = js.find('\nfunction ', s + 10)
    return js[s: e if e > 0 else len(js)]


MOON_PREFIX = ['mtop.alimama.', 'mtop.etao.', 'mtop.alimusic.',
               'mtop.taobao.union.', 'mtop.tmall.tac.', 'mtop.tmall.jiuxi.']


def branch_keys(js, api):
    """判定请求走哪个 handler, 并汇总该分支用到的 isEnabled keys"""
    if any(api.startswith(p) for p in MOON_PREFIX):
        h = 'handleMoonResponse'
    elif 'goofish' in api:
        h = 'handleXianyuResponse'
    else:
        h = 'handleTaobaoResponse'
    b = body_of(js, h)
    ks = set()
    for m in re.finditer(r'if \(([^)]*?url\.includes\("([^"]+)"\)[^)]*)\)\s*\{', b):
        k = m.group(2).replace('\\', '')
        if k in api or api.startswith(k):
            st, depth, i = m.end(), 1, m.end()
            while i < len(b) and depth > 0:
                if b[i] == '{':
                    depth += 1
                elif b[i] == '}':
                    depth -= 1
                i += 1
            code = b[st:i - 1]
            ks |= set(re.findall(r'isEnabled\("(\w+)"\)', code))
            for c in set(re.findall(r'(?:return\s+)?(filter\w+)\(', code)):
                ks |= set(re.findall(r'isEnabled\("(\w+)"\)', body_of(js, c)))
    return h, ks


def main():
    lpx = open(LPX, encoding='utf-8').read()
    js = open(JS, encoding='utf-8').read()

    rules = []
    for line in lpx.split('\n'):
        if ' then script(' not in line:
            continue
        i, j = line.find('~= '), line.find(' then script(')
        rx = line[i + 3:j]
        m = re.findall(r'mtop[.\\a-z0-9_]+', rx)
        api = m[0].replace('\\', '') if m else rx[:60]
        rules.append((api, arg_keys(line)))

    bad = 0
    for api, keys in rules:
        h, need = branch_keys(js, api)
        miss = need - set(keys)
        if miss:
            bad += 1
            print(f'❌ [{h}] {api[:60]}')
            print(f'   代码需要: {sorted(need)}')
            print(f'   规则参数: {keys}')
            print(f'   ★ 缺 key: {sorted(miss)}')

    print(f'\n检查 {len(rules)} 条 Script 规则, 缺口 {bad} 条')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
