#!/usr/bin/env python3
"""
patch-blockads.py —— 把 blockAds.plugin 的【B 站 / YouTube / Spotify / 拼多多】部分整体退场

为什么需要
----------
fmz200/wool_scripts 的 blockAds.plugin 由 tools/splitRules/mergeLoon.js 从
db/inaisi.db（3.2MB 二进制规则库）自动生成，跟踪 main 分支，无 tag/release。
无法固定版本引用，只能本地生成打过补丁的副本。

退场的四块
----------
**B 站**（与 Bilibili-Dedup 重复）
1. **内置重复脚本**：kokoryh 的 bilibili.protobuf.*.js 与独立去广告插件同源，
   同一逻辑对同一响应改写两遍
2. **参数降级**：[Argument] 缺 displayUpList / purifyComment / optimizeRequest 声明，
   脚本内置默认值被 undefined 覆盖；optimizeRequest 未声明还导致
   enable={optimizeRequest} 的规则永不执行
3. **跨插件冲突**：show/tab/v2、account/mine、feed/index 三个端点与
   Biliverse Enhanced / ADBlock 直接打架，后执行者覆盖前者

**YouTube**（与 YouTube-Dedup 重复）
4. **同一批 URL 抢 first-match**：合集的 youtube.response.js 匹配
   browse|next|player|search|reel_watch_sequence|guide|account/get_setting|get_watch，
   与 YouTube-Dedup 完全一致。Loon first-match-wins，谁在前面谁生效。
5. **无 enable 保护的 Rewrite**：rr*.googlevideo.com/initplayback reject-dict
   两条常无 enable 保护，会打断 UMP 与字幕翻译。

**Spotify**（与 Spotify-Dedup 重复）
6. 同一批 pendragon / bootstrap / gae2-spclient 端点与 Spotify-Dedup 重复，
   两份 rewrite 抢同一条 URL，参数（tab / useractivity）也归它管。

**拼多多**（与 PinDuoDuo 冲突，而且更严重）
7. **合集无条件，且抢在用户插件之前**：合集里
   `api.(pinduoduo|yangkeduo).com/api/cappuccino/splash` → reject(404)、
   `api.pinduoduo.com/api/aquarius/hungary/global/homepage?` → reject-dict
   都是 [Rewrite] **请求阶段**就返回假响应。请求阶段先结束，
   响应体脚本根本没有机会跑 —— 2026-09-30 两台真机抓包里这批记录的
   `script` 字段一律为空，而 PinDuoDuo 的 api_stub / chat_stub / order_stub
   开关对这两个端点**完全失效**，用户在参数页怎么调都没用。
8. 其余 7 条（t-dsp / images.pinduoduo / video-dsp.pddpic / 多多严选）虽是纯广告
   端点，但同属一个 App，一并退场，免得日后上游再加新的进来。

本补丁
------
把这四块的规则整体注释掉，能力交给本仓库的独立插件承担：

  [Rewrite]  四块 → 注释
  [Script]   四块 → 注释
  [Rule]     四块 → 注释
  [MITM]     四块用到的域名 → 移除

拼多多那 6 个 MITM 域名（api.pinduoduo.com / api.yangkeduo.com /
mobile.yangkeduo.com / t-dsp.pinduoduo.com / images.pinduoduo.com /
video-dsp.pddpic.com）移除后不影响 PinDuoDuo —— 它自带 [MitM]。

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
# 只匹配主域名会漏掉这 6 条规则 —— 这是实际踩过的坑。
BILI = re.compile(
    r'(bilibili\.com|biliapi\.net|biliapi\.com|biligame\.com'
    r'|hdslb\.com|manhuaren)', re.I)
# 判定「属于 YouTube」。刻意用宽匹配（youtube / googlevideo / youtu.be / ytimg）
# 而不是逐个列主域名：上游随时可能加新端点，宁可多注释一条也不要漏。
# 注意 ads.youtube.com 的 REJECT 也在这个范围内，会一并退场 —— YouTube 的广告
# 由本仓库的 YouTube-Dedup 负责，本插件不再插手。
YT = re.compile(r'(youtube|googlevideo|youtu\.be|ytimg)', re.I)
# 判定「属于 Spotify」。能力交给本仓库的 Spotify-Dedup 承担
# （那一份合了 kelee 的开关版脚本、730 的 gae2 老端点规则与 QUIC 拦截）。
SPOTIFY = re.compile(r'spotify', re.I)
# 判定「属于拼多多」。能力交给本仓库的 PinDuoDuo 承担。
# ⚠️ 这三条实测是「抢在用户插件之前、且无法用任何开关关掉」的：
#   2026-09-30 两台真机抓包确认，合集里
#     api.(pinduoduo|yangkeduo).com/api/cappuccino/splash        reject
#     api.pinduoduo.com/api/aquarius/hungary/global/homepage?  reject-dict
#   都是 [Rewrite] **请求阶段**直接返回假响应，
#   于是 PinDuoDuo 自己的 stub.response.js 根本没机会跑（Loon 记录里 script:[] 为证），
#   api_stub / chat_stub / order_stub 等开关对这两个端点**完全失效**。
#   pddpic.com 是拼多多的图片/素材 CDN，只此一家，不会有别的 App 用。
PDD = re.compile(r'(pinduoduo|yangkeduo|pddpic)', re.I)
SKIP_SECT = {'ARGUMENT', 'GENERAL', 'MITM'}   # MITM 由 strip_mitm 单独处理

# (名字, 注释标记, 域名正则)
REMOVALS = (
    ('B 站', 'bilibili-removed', BILI),
    ('YouTube', 'youtube-removed', YT),
    ('Spotify', 'spotify-removed', SPOTIFY),
    ('拼多多', 'pinduoduo-removed', PDD),
)


def norm(t):
    return t.replace('\\/', '/').replace('\\.', '.')


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


def comment_out_rules(text, rx, tag):
    """在 [Rewrite] / [Script] / [Rule] 段内，注释掉命中 rx 的规则行"""
    lines = text.splitlines()
    out, sec, hit = [], None, []
    for ln in lines:
        t = ln.strip()
        m = re.match(r'^\[([A-Za-z ]+)\]', t)
        if m:
            sec = m.group(1).upper()
        if sec not in SKIP_SECT and t and not t.startswith('#') and rx.search(norm(t)):
            out.append(f'# [{tag}] ' + ln)
            hit.append((sec, norm(t)[:70]))
        else:
            out.append(ln)
    return '\n'.join(out) + ('\n' if text.endswith('\n') else ''), hit


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


def strip_mitm(text, targets):
    """从 [MITM] hostname 列表中移除命中任一 rx 的域名。

    targets: [(名字, 正则), ...] —— 必须一次遍历处理完所有正则。
    分多次调用是危险的：本函数会重排段体，第二次调用可能因为段标题已被
    改动而匹配不到，整轮静默失效（这正是 YouTube 域名一度没被移除的原因）。
    """
    m = re.search(r'^(\[MITM\]|\[MitM\])[ \t]*$([\s\S]*?)(?=^\[[A-Za-z]|\Z)', text, re.M)
    if not m:
        return text, {name: [] for name, _ in targets}
    body = m.group(2)
    toks = re.split(r'([,\s]+)', body)
    removed = {name: [] for name, _ in targets}
    keep = []
    for t in toks:
        if t and t.strip() and not t.strip().lower().startswith('hostname'):
            hit = next((n for n, rx in targets if rx.search(t)), None)
            if hit is not None:
                removed[hit].append(t.strip())
                continue
        keep.append(t)
    new = ''.join(keep)
    new = re.sub(r'[ \t]*\n[ \t]*', '\n', new)
    # ⚠️ 这里原来还有一句 re.sub(r'^[ \t]*\n', '', new)，它吃掉的是 [MITM] 与
    # hostname 行之间的换行，会把段标题粘到内容上（发布过的产物里就是这样）。
    #
    # 删掉域名会在列表里留下 ", , " 这种空洞（相邻两个分隔符 token）。
    # 必须折叠到不动点，一轮 sub 只能消掉不重叠的匹配，不收敛就会破坏幂等
    # —— 第二遍跑产物还会再变一次，Actions 的「无变化不提交」也就失效了。
    # 用 [ \t] 而不是 \s：\s 会吃掉换行，把 MITM 的多行结构并成一行。
    while True:
        folded = re.sub(r',[ \t]*,', ',', new)
        if folded == new:
            break
        new = folded
    return text[:m.start(2)] + new + text[m.end(2):], removed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input', nargs='?')
    ap.add_argument('-o', '--out', required=True)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--keep-mitm', action='store_true',
                    help='只注释规则，保留 MITM 域名（用于仍需解密这两块流量的场景）')
    a = ap.parse_args()

    src = pathlib.Path(a.input) if a.input else None
    s = src.read_text(encoding='utf-8', errors='ignore') if src else fetch(UPSTREAM)
    before = s
    print(f'输入: {"本地" if src else "上游"}  {len(before.encode())} B')

    for name, tag, rx in REMOVALS:
        s, hits = comment_out_rules(s, rx, tag)
        by = {}
        for sec, t in hits:
            by[sec] = by.get(sec, 0) + 1
        detail = ', '.join(f'{k} {v} 条' for k, v in sorted(by.items())) or '无'
        print(f'  [{name}] 已注释 {len(hits)} 条: {detail}')

    if not a.keep_mitm:
        s, rm = strip_mitm(s, [(n, rx) for n, _, rx in REMOVALS])
        for name, _, _ in REMOVALS:
            got = rm[name]
            print(f'  [{name}] 已移除 MITM 域名: {len(got)} 个' + (f'  {got}' if got else ''))
    else:
        print('  [--keep-mitm] 保留 MITM 域名')

    # 删除因退场而失活的参数
    # ⚠️ tab / useractivity 这两个名字很通用，但 730 里它们是 Spotify 专用的：
    #    [Argument] 段各只有一条定义，唯一的引用就是那条 Spotify 脚本行
    #    （argument=[{tab},{useractivity}]）。删之前先确认这个前提仍成立。
    dead = ['bilimanhua_enable', 'sponsorBlock', 'logLevel', 'flightradar24_enable',
            'youtube_enable', 'tab', 'useractivity']
    s, dn = drop_dead_params(s, dead)
    print(f'  已删除失活参数: {dn}/{len(dead)}  {dead[:dn]}')
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
