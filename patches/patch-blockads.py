#!/usr/bin/env python3
"""
patch-blockads.py —— 把 blockAds.plugin 的【B 站部分】整体退场

为什么需要
----------
fmz200/wool_scripts 的 blockAds.plugin 由 tools/splitRules/mergeLoon.js 从
db/inaisi.db（3.2MB 二进制规则库）自动生成，跟踪 main 分支，无 tag/release。
无法固定版本引用，只能本地生成打过补丁的副本。

B 站部分的三个问题
------------------
1. **内置重复脚本**：kokoryh 的 bilibili.protobuf.*.js 与独立去广告插件同源，
   同一逻辑对同一响应改写两遍
2. **参数降级**：[Argument] 缺 displayUpList / purifyComment / optimizeRequest 声明，
   脚本内置默认值被 undefined 覆盖；optimizeRequest 未声明还导致
   enable={optimizeRequest} 的规则永不执行
3. **跨插件冲突**：show/tab/v2、account/mine、feed/index 三个端点与
   Biliverse Enhanced / ADBlock 直接打架，后执行者覆盖前者

本补丁
------
**把 blockAds 的 B 站相关规则整体注释掉**，B 站能力由独立插件承担：

  [Rewrite]  23 条  → 注释
  [Script]    8 条  → 注释
  [Rule]      5 条  → 注释
  [MITM]      6 个域名 → 移除

其余 700+ App 的规则逐字节保持原样。

用法
----
    python3 patch-blockads.py -o blockAds.patched.plugin
    python3 patch-blockads.py --dry-run blockAds.plugin -o /dev/null
"""
import argparse, difflib, os, pathlib, re, subprocess, sys, tempfile

UPSTREAM = 'https://github.com/fmz200/wool_scripts/raw/main/Loon/plugin/blockAds.plugin'
UA = 'Loon/765 CFNetwork/1568.0.3 Darwin/23.5.0'

# 判定「属于 B 站」的域名片段。规则行里是转义形式（bilibili\.com），先归一化再匹配
BILI = re.compile(r'(bilibili\.com|biliapi\.net|biliapi\.com|biligame\.com)', re.I)
SKIP_SECT = {'ARGUMENT', 'GENERAL', 'MITM'}   # MITM 由 strip_mitm 单独处理


def norm(t):
    return t.replace('\\/', '/').replace('\\.', '.')


def is_bili(line):
    return bool(BILI.search(norm(line)))


def fetch(url):
    fd, tmp = tempfile.mkstemp(suffix='.plugin'); os.close(fd)
    try:
        r = subprocess.run(['curl', '-sL', '--max-time', '90', '-A', UA, '-o', tmp, url],
                           capture_output=True)
        if r.returncode != 0 or os.path.getsize(tmp) < 1000:
            raise RuntimeError(f'下载失败: {url}')
        return pathlib.Path(tmp).read_text(encoding='utf-8', errors='ignore')
    finally:
        os.unlink(tmp)


def comment_out_rules(text):
    """在 [Rewrite] / [Script] / [Rule] 段内，注释掉含 B 站域名的规则行"""
    lines = text.splitlines()
    out, sec, hit = [], None, []
    for ln in lines:
        t = ln.strip()
        m = re.match(r'^\[([A-Za-z ]+)\]', t)
        if m:
            sec = m.group(1).upper()
        if sec not in SKIP_SECT and t and not t.startswith('#') and is_bili(t):
            out.append('# [bilibili-removed] ' + ln)
            hit.append((sec, norm(t)[:70]))
        else:
            out.append(ln)
    return '\n'.join(out) + ('\n' if text.endswith('\n') else ''), hit


def strip_mitm(text):
    """从 [MITM] hostname 列表中移除 B 站域名"""
    m = re.search(r'^(\[MITM\]|\[MitM\])[ \t]*$([\s\S]*?)(?=^\[[A-Za-z]|\Z)', text, re.M)
    if not m:
        return text, []
    body = m.group(2)
    toks = re.split(r'([,\s]+)', body)
    removed = []
    keep = []
    for t in toks:
        if t and t.strip() and not t.strip().lower().startswith('hostname') and is_bili(t):
            removed.append(t.strip())
        else:
            keep.append(t)
    new = ''.join(keep)
    new = re.sub(r'[ \t]*\n[ \t]*', '\n', new)
    new = re.sub(r'^[ \t]*\n', '', new)
    new = re.sub(r',\s*,', ',', new)
    return text[:m.start(2)] + new + text[m.end(2):], removed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input', nargs='?')
    ap.add_argument('-o', '--out', required=True)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--keep-mitm', action='store_true',
                    help='只注释规则，保留 MITM 域名（用于仍需解密 B 站流量的场景）')
    a = ap.parse_args()

    src = pathlib.Path(a.input) if a.input else None
    s = src.read_text(encoding='utf-8', errors='ignore') if src else fetch(UPSTREAM)
    before = s
    print(f'输入: {"本地" if src else "上游"}  {len(before.encode())} B')

    s, hits = comment_out_rules(s)
    by = {}
    for sec, t in hits:
        by[sec] = by.get(sec, 0) + 1
    print('  已注释规则: ' + (', '.join(f'{k} {v} 条' for k, v in sorted(by.items())) or '无'))

    removed = []
    if not a.keep_mitm:
        s, removed = strip_mitm(s)
    print(f'  已移除 MITM 域名: {len(removed)} 个' + (f'  {removed}' if removed else ''))
    print(f'输出: {len(s.encode())} B  ({len(s.splitlines())-len(before.splitlines()):+d} 行)')

    if a.dry_run:
        print('\n--- 差异预览 ---')
        shown = 0
        for l in difflib.unified_diff(before.splitlines(), s.splitlines(), lineterm='', n=0):
            if l.startswith(('+++', '---')):
                continue
            print('  ' + l[:130]); shown += 1
            if shown > 40:
                print('  ... (略)'); break
    else:
        pathlib.Path(a.out).write_text(s, encoding='utf-8')
        print(f'已写入 {a.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
