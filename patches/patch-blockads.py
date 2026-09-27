#!/usr/bin/env python3
"""
patch-blockads.py —— 为 blockAds.plugin 施加声明式补丁

背景
----
fmz200/wool_scripts 的 blockAds.plugin 由 tools/splitRules/mergeLoon.js 从
db/inaisi.db（3.2MB 二进制规则库）自动生成，直接跟踪 main 分支，无 tag/release。
无法手工编辑上游文件，只能在本地生成一份打过补丁的副本。

补丁设计原则
------------
* **声明式**：按参数名/规则特征定位，不依赖行号 —— 上游插入/删除行后补丁仍能重放
* **幂等**：已打过补丁的版本再跑一次不会重复插入
* **最小改动**：只增删必要条目，其余内容逐字节保持原样

用法
----
    # 拉取上游最新版并打补丁
    python3 patch-blockads.py -o out.plugin

    # 对已有文件打补丁
    python3 patch-blockads.py local.plugin -o out.plugin

    # 只看会改什么，不写文件
    python3 patch-blockads.py --dry-run local.plugin
"""
import argparse, pathlib, re, subprocess, sys, tempfile, os

UPSTREAM = 'https://github.com/fmz200/wool_scripts/raw/main/Loon/plugin/blockAds.plugin'
UA = 'Loon/765 CFNetwork/1568.0.3 Darwin/23.5.0'


# ---------- 工具 ----------

def fetch(url):
    with tempfile.NamedTemporaryFile(suffix='.plugin', delete=False) as f:
        tmp = f.name
    try:
        r = subprocess.run(['curl', '-sL', '--max-time', '60', '-A', UA, '-o', tmp, url],
                           capture_output=True)
        if r.returncode != 0 or os.path.getsize(tmp) < 1000:
            raise RuntimeError(f'下载失败: {url}')
        return pathlib.Path(tmp).read_text(encoding='utf-8', errors='ignore')
    finally:
        os.unlink(tmp)


def arg_section(s):
    m = re.search(r'^\[Argument\][ \t]*\n', s, re.M)
    if not m:
        raise RuntimeError('未找到 [Argument] 段')
    e = re.search(r'^\[[A-Za-z]', s[m.end():], re.M)
    return m.end(), (m.end() + e.start() if e else len(s))


def patch_add_argument(s, name, decl):
    """在 [Argument] 段末新增参数；已存在则跳过（幂等）"""
    if re.search(rf'^{re.escape(name)}\s*=', s, re.M):
        return s, False
    st, en = arg_section(s)
    body = s[st:en]
    pos = st + body.rstrip().rfind('\n') + 1
    return s[:pos] + decl + '\n' + s[pos:], True


def patch_comment_rule(s, url_re, why):
    """把命中的规则行注释掉"""
    out, n = [], 0
    for ln in s.splitlines():
        if url_re in ln and not ln.strip().startswith('#'):
            out.append('# [patched] ' + ln); n += 1
        else:
            out.append(ln)
    return '\n'.join(out) + ('\n' if s.endswith('\n') else ''), n


# ---------- 补丁集 ----------

PATCHES = [
    dict(id='P001', name='补齐 kokoryh 脚本引用的 3 个未定义参数',
         why=('blockAds 的 [Script] 段调用 kokoryh 的 bilibili.protobuf.response.js，'
              '脚本内置默认值 {displayUpList:"show", purifyComment:true, sponsorBlock:true}，'
              '但 blockAds 的 [Argument] 未声明 displayUpList / purifyComment / optimizeRequest，'
              '传入的 undefined 会经 Object.assign 覆盖掉脚本默认值；'
              '其中 optimizeRequest 未定义还导致 enable={optimizeRequest} 的规则永不生效。'),
         apply=lambda s: _p001(s)),

    # P002 预置但默认关闭：需要顶栏自定义时把 --with-tab-jq-block 打开
    dict(id='P002', name='[可选] 让 show/tab/v2 的 jq 失效',
         why=('这两条 jq（show/tab/v2 与 account/mine）会整体重写响应体，'
              '与 Biliverse Enhanced 等改写同一端点的插件冲突，后执行者覆盖前者。'
              '本补丁将规则行注释掉，规则保留在文件中可随时还原。'),
         opt_in='--with-tab-jq-block',
         apply=lambda s: _p002(s)),
]


def _p001(s):
    for n, d in [
        ('displayUpList',
         'displayUpList=select,"show","hide","auto",tag=[bilibili] 最常访问显示方式,desc=show:始终显示;hide:隐藏;auto:仅直播时显示'),
        ('purifyComment',
         'purifyComment=switch,true,false,tag=[bilibili] 移除评论区置顶广告,desc=补齐原缺失声明，否则脚本收到 undefined 导致电商广告过滤被跳过'),
        ('optimizeRequest',
         'optimizeRequest=switch,true,false,tag=[bilibili] 优化评论区加载异常,desc=原缺失声明导致 enable 规则永不生效'),
    ]:
        s, _ = patch_add_argument(s, n, d)
    return s


def _p002(s):
    # 把引用 kokoryh jq 的规则行注释掉（保留原文，加 [patched] 前缀）
    s, n = patch_comment_rule(s, 'kokoryh/Sparkle/refs/heads/master/jq', '')
    print(f'        P002 命中 {n} 条规则并注释')
    return s


# ---------- 主流程 ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input', nargs='?', help='本地 .plugin（省略则拉取上游）')
    ap.add_argument('-o', '--out', required=True)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--with-tab-jq-block', action='store_true',
                    help='额外应用 P002：让 blockAds 的 tab jq 失效（会让顶栏/标签栏/底部导航不可自定义）')
    a = ap.parse_args()

    src = pathlib.Path(a.input) if a.input else None
    s = src.read_text(encoding='utf-8', errors='ignore') if src else fetch(UPSTREAM)
    origin = '本地' if src else '上游'
    before = s
    print(f'输入: {origin}  {len(before.encode())} B')

    for p in PATCHES:
        if 'opt_in' in p and not getattr(a, p['opt_in'].lstrip('-').replace('-', '_')):
            print(f"  [{p['id']}] 跳过（需 {p['opt_in']}）: {p['name']}")
            continue
        s2 = p['apply'](s)
        changed = s2 != s
        s = s2
        print(f"  [{p['id']}] {'已应用' if changed else '无变化'}: {p['name']}")

    d = s.count('\n') - before.count('\n')
    print(f'输出: {len(s.encode())} B  ({d:+d} 行)')

    if a.dry_run:
        print('\n--- 预览差异 ---')
        import difflib
        for l in list(difflib.unified_diff(before.splitlines(), s.splitlines(),
                                           lineterm='', n=0))[:60]:
            if l.startswith(('+++', '---')):
                continue
            print('  ' + l[:150])
    else:
        pathlib.Path(a.out).write_text(s, encoding='utf-8')
        print(f'已写入 {a.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
