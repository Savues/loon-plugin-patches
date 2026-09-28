#!/usr/bin/env python3
"""
patch-blockads.py —— 把 blockAds.plugin 的【B 站部分】和【YouTube 部分】整体退场

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

YouTube 部分：一条规则就够了，但后果和 B 站一样致命
---------------------------------------------------
Loon 的 [Script] 是 **first-match-wins**：同一个 URL 只执行第一条完整命中的规则，
后一条永不执行（官方 script_v2："始终按照原配置顺序选择第一条最终条件为 true 的规则"）。
blockAds 的这条

    http-response ^https:\\/\\/youtubei\\.googleapis\\.com\\/youtubei\\/v1\\/(browse|next|player|...)  script-path=...youtube.response.js

与本仓库 YouTube-Dedup 的规则命中**同一批 URL**，谁排在前面谁赢。
实测 2026-09-29：blockAds 在前 → YouTube-Dedup 的「清除游戏大本营」规则
**一次都没执行过**，用户连着五轮看到游戏大本营删不掉；
而 blockAds 自己那份脚本与上游同源、去广告照常工作，所以「其他功能都正常」，极具迷惑性。

本补丁
------
**把 blockAds 的 B 站 + YouTube 相关规则整体注释掉**，这两块能力改由独立插件承担：

  B 站：  [Rewrite] 23 条 / [Script] 8 条 / [Rule] 5 条 / [MITM] 6 个域名
  YouTube：
    [SCRIPT]  1 条（youtube.response.js，与 YouTube-Dedup 抢同一批 URL）→ 注释
    [REWRITE] 1 条（rr*.googlevideo.com/initplayback? reject-dict，无 enable 保护，
                   会打断 UMP 与字幕翻译）→ 注释
    [Argument] 1 个（youtube_enable 随之失活）→ 删除

  保留：[Rule] DOMAIN, ads.youtube.com, REJECT —— 纯域名拦截，不碰脚本，无冲突。

其余 700+ App 的规则逐字节保持原样。

用法
----
    python3 patch-blockads.py -o blockAds.patched.plugin
    python3 patch-blockads.py --dry-run blockAds.plugin -o /dev/null
"""
import argparse, difflib, os, pathlib, re, subprocess, sys, tempfile

UPSTREAM = 'https://github.com/fmz200/wool_scripts/raw/main/Loon/plugin/blockAds.plugin'
UA = 'Loon/765 CFNetwork/1568.0.3 Darwin/23.5.0'

# 判定「属于 B 站」的域名片段。规则行里是转义形式（bilibili\.com），先归一化再匹配。
# 注意：B 站漫画走的是 hdslb.com 与 manhuaren.com，不含 bilibili.com，
# 只匹配 bilibili 系域名会漏掉这 6 条规则。
BILI = re.compile(
    r'(bilibili\.com|biliapi\.net|biliapi\.com|bigame\.com'
    r'|hdslb\.com|manhuaren)', re.I)

# YouTube：只要一条 http-response 规则就足以和 YouTube-Dedup 抢同一批 URL
YT = re.compile(r'(youtubei\.googleapis\.com|youtube\.com|googlevideo\.com'
                r'|ytimg\.com|ggpht\.com|youtu\.be)', re.I)
# 纯域名拦截不碰脚本、没有冲突，留着
YT_KEEP = re.compile(r'^\s*DOMAIN\s*,\s*ads\.youtube\.com\s*,', re.I)

SKIP_SECT = {'ARGUMENT', 'GENERAL', 'MITM'}   # MITM 由 strip_mitm 单独处理


def norm(t):
    return t.replace('\\/', '/').replace('\\.', '.')


def is_bili(line):
    return bool(BILI.search(norm(line)))


def is_yt_rule(line):
    """该行是否属于要退场的 YouTube 规则（保留 ads.youtube.com 的纯域名拦截）"""
    return bool(YT.search(norm(line))) and not YT_KEEP.match(line.strip())


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
    """在 [Rewrite] / [Script] / [Rule] 段内，注释掉含 B 站或 YouTube 域名的规则行"""
    lines = text.splitlines()
    out, sec, hit, yhit = [], None, [], []
    for ln in lines:
        t = ln.strip()
        m = re.match(r'^\[([A-Za-z ]+)\]', t)
        if m:
            sec = m.group(1).upper()
        if sec not in SKIP_SECT and t and not t.startswith('#'):
            if is_bili(t):
                out.append('# [bilibili-removed] ' + ln)
                hit.append((sec, norm(t)[:70]))
                continue
            if is_yt_rule(t):
                out.append('# [youtube-removed] ' + ln)
                yhit.append((sec, norm(t)[:70]))
                continue
        out.append(ln)
    return '\n'.join(out) + ('\n' if text.endswith('\n') else ''), hit, yhit


def verify_no_yt_rules(text):
    """自检：产物里不得残留任何未注释的 YouTube 脚本/复写规则。
    上游哪天改了写法，这里会直接报错，绝不会把坏产物推上去。"""
    bad, sec = [], None
    for ln in text.splitlines():
        t = ln.strip()
        m = re.match(r'^\[([A-Za-z ]+)\]', t)
        if m:
            sec = m.group(1).upper()
        if sec in ('SCRIPT', 'REWRITE') and t and not t.startswith('#') and is_yt_rule(t):
            bad.append(t[:100])
    if bad:
        raise SystemExit('自检失败：产物里仍有未退场的 YouTube 规则\n  ' + '\n  '.join(bad))
    return True


def drop_dead_params(text, names):
    """从 [Argument] 段删除指定参数（连同其定义行）"""
    out, n = [], 0
    in_arg = False
    for ln in text.splitlines():
        t = ln.strip()
        if re.match(r'^\[([A-Za-z ]+)\]', t):
            in_arg = t.upper() == '[ARGUMENT]'
        if in_arg and t and not t.startswith('#'):
            nm = t.split('=')[0].strip()
            if nm in names:
                n += 1
                continue
        out.append(ln)
    return '\n'.join(out) + ('\n' if text.endswith('\n') else ''), n


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

    s, hits, yhits = comment_out_rules(s)
    by = {}
    for sec, t in hits:
        by[sec] = by.get(sec, 0) + 1
    print('  已注释 B 站规则: ' + (', '.join(f'{k} {v} 条' for k, v in sorted(by.items())) or '无'))

    yby = {}
    for sec, t in yhits:
        yby[sec] = yby.get(sec, 0) + 1
    print('  已注释 YouTube 规则: ' + (', '.join(f'{k} {v} 条' for k, v in sorted(yby.items())) or '无'))
    for sec, t in yhits:
        print(f'      [{sec}] {t[:90]}')

    removed = []
    if not a.keep_mitm:
        s, removed = strip_mitm(s)
    print(f'  已移除 MITM 域名: {len(removed)} 个' + (f'  {removed}' if removed else ''))

    # 删除因退场而失活的参数
    dead = ['bilimanhua_enable', 'sponsorBlock', 'logLevel', 'flightradar24_enable',
            'youtube_enable']
    s, dn = drop_dead_params(s, dead)
    print(f'  已删除失活参数: {dn}/{len(dead)}  {dead[:dn]}')

    verify_no_yt_rules(s)
    print('  自检: 产物中无未退场的 YouTube 脚本/复写规则 ✔')

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
