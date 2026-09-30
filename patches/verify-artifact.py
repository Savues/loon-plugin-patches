#!/usr/bin/env python3
"""
verify-artifact.py —— 对已生成的产物做「退场完整性 + 结构合法性」双重校验

CI（sync-blockads.yml）里跑的就是这份逻辑的等价物，但本地能跑、能改、
能对着具体行数调试，比埋在 YAML heredoc 里好维护。

用法：python3 patches/verify-artifact.py <产物路径>
"""
import pathlib
import re
import sys

# 与 patch-blockads.py 保持一致。放在这里而不是 import，是为了让校验脚本
# 在「补丁器本身写坏了」时仍能独立跑 —— 两边用同一份正则，就等于没有校验。
BILI = re.compile(
    r'(bilibili\.com|biliapi\.net|biliapi\.com|biligame\.com'
    r'|hdslb\.com|manhuaren)', re.I)
YT = re.compile(r'(youtube|googlevideo|youtu\.be|ytimg)', re.I)
SPOTIFY = re.compile(r'spotify', re.I)
PDD = re.compile(r'(pinduoduo|yangkeduo|pddpic)', re.I)

RULE_SECTS = ('REWRITE', 'SCRIPT', 'RULE')
REMOVALS = (('B 站', BILI), ('YouTube', YT), ('Spotify', SPOTIFY), ('拼多多', PDD))


def norm(t):
    return t.replace('\\/', '/').replace('\\.', '.')


def section(text, name):
    m = re.search(r'^\[' + name + r'\][ \t]*$([\s\S]*?)(?=^\[[A-Za-z]|\Z)', text, re.M)
    return m.group(1) if m else None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--min-lines=')]
    min_lines = 8000
    for a in sys.argv[1:]:
        if a.startswith('--min-lines='):
            min_lines = int(a.split('=', 1)[1])
    path = args[0] if args else \
        'plugins/BlockAds-Patched/BlockAds.patched.plugin'
    s = pathlib.Path(path).read_text(encoding='utf-8', errors='ignore')
    bad = []

    # ---- 1. 退场完整性 -------------------------------------------------
    sec, live = None, []
    for ln in s.splitlines():
        t = ln.strip()
        m = re.match(r'^\[([A-Za-z ]+)\]', t)
        if m:
            sec = m.group(1).upper()
        if sec in RULE_SECTS and t and not t.startswith('#'):
            for name, rx in REMOVALS:
                if rx.search(norm(t)):
                    live.append((name, t))

    mitm = section(s, 'MITM')
    if mitm is None:
        bad.append('找不到 [MITM] 段（段标题必须独占一行，不能粘着 hostname）')
        mitm = ''
    for name, rx in REMOVALS:
        for h in re.split(r'[,\s]+', mitm):
            if h and rx.search(h):
                bad.append(f'[MITM] 残留 {name} 域名: {h}')

    for name, t in live:
        bad.append(f'残留 {name} 规则: {t[:100]}')

    # ---- 2. 结构合法性 -------------------------------------------------
    # 上游若返回 404/限流 HTML 页，体积也能过 1000 B 的下载下限，
    # 而 HTML 里没有 bilibili.com，内容检查照样全绿。只有结构检查拦得住。
    if not s.startswith('#!name='):
        bad.append('首行不是 #!name= —— 这不是 Loon 插件（上游可能返回了错误页）')
    for need in ('Argument', 'Rule', 'Rewrite', 'Script', 'MITM'):
        if section(s, need) is None:
            bad.append(f'缺少 [{need}] 段')
    if mitm and not re.match(r'^\s*hostname\s*=', mitm):
        bad.append('[MITM] 段第一行不是 hostname = ...')
    if len(s.splitlines()) < min_lines:
        # 只是「不是错误页」的粗筛，真正的判据是上面那几条结构检查。
        # 默认阈值定得很低，好让小样本 fixture 也能过；真实产物有 8000+ 行。
        bad.append(f'总行数只有 {len(s.splitlines())}，低于下限 {min_lines}')

    # ---- 3. 报告 -------------------------------------------------------
    nb = s.count('[bilibili-removed]')
    ny = s.count('[youtube-removed]')
    ns = s.count('[spotify-removed]')
    np_ = s.count('[pinduoduo-removed]')
    if bad:
        for b in bad:
            print('::error::' + b)
        print('::error::退场或结构校验未通过，不要推送这个产物')
        return 1
    print(f'::notice::通过 —— B 站已注释 {nb} 条、YouTube {ny} 条、Spotify {ns} 条、'
          f'拼多多 {np_} 条，MITM 无残留，{len(s.splitlines())} 行 / {len(s.encode())} B')
    return 0


if __name__ == '__main__':
    sys.exit(main())
