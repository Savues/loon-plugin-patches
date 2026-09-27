#!/usr/bin/env python3
"""
har-diff.py —— 对比两份 HAR，输出插件改了哪些字段

背景
----
Loon 插件的响应体改写，「注入成功」不等于「生效」——
同一份响应里可能有 data.vip 和 data.card.vip 两份，只有 App 真正读取的那份才有效。
本工具用于回答三个问题：

  1. 插件改了哪些字段（原值 → 新值）
  2. 哪些改动可能没被 App 读取（同名字段在多处出现，只有部分被改）
  3. 端点覆盖情况（哪些端点被改、哪些没被改）

用法
----
    # 插件关 vs 插件开
    python3 har-diff.py baseline.har modified.har

    # 列出所有端点，不做对比
    python3 har-diff.py --list modified.har

    # 只看某个端点
    python3 har-diff.py baseline.har modified.har --endpoint /x/v2/space

    # 输出 JSON 供后续处理
    python3 har-diff.py baseline.har modified.har --json
"""
import argparse, base64, json, re, sys
from collections import defaultdict


# ---------- HAR 解析 ----------

def body_text(entry):
    """HAR 的 content.text 可能是 base64，也可能是纯文本"""
    c = entry.get('response', {}).get('content', {})
    t = c.get('text') or ''
    enc = c.get('encoding') or entry.get('response', {}).get('encoding')
    if enc == 'base64' or (t[:1] not in '{[' and len(t) > 40):
        try:
            t = base64.b64decode(t).decode('utf-8', 'ignore')
        except Exception:
            pass
    return t


def load(path):
    """返回 {端点路径: [响应JSON, ...]}"""
    with open(path, encoding='utf-8') as f:
        d = json.load(f)
    out = defaultdict(list)
    for e in d['log']['entries']:
        url = e['request']['url']
        if 'bilistatic' in url or 'hdslb' in url:      # 跳过静态资源
            continue
        p = url.split('?')[0]
        p = re.sub(r'^https?://[^/]+', '', p)
        if not p.startswith('/'):
            continue
        t = body_text(e)
        if not t or t[0] not in '{[':
            continue
        try:
            out[p].append(json.loads(t))
        except Exception:
            continue
    return out


# ---------- 扁平化 ----------

def flatten(obj, prefix=''):
    """把嵌套对象拍平成 {'a.b.c': 值}，便于逐字段对比"""
    out = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            key = f'{prefix}.{k}' if prefix else k
            if isinstance(v, (dict, list)):
                out.update(flatten(v, key))
            else:
                out[key] = v
    elif isinstance(obj, list):
        if not obj:
            out[prefix] = '[]'
        for i, v in enumerate(obj[:40]):
            out.update(flatten(v, f'{prefix}[{i}]'))
    else:
        out[prefix] = obj
    return out


def short(v, n=46):
    s = json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
    return s if len(s) <= n else s[:n] + '…'


# ---------- 差异分析 ----------

def diff_ep(before, after):
    fb, fa = flatten(before), flatten(after)
    added   = {k: v for k, v in fa.items() if k not in fb}
    removed = {k: v for k, v in fb.items() if k not in fa}
    changed = {k: (fb[k], fa[k]) for k in (fb.keys() & fa.keys()) if fb[k] != fa[k]}
    return added, removed, changed


def inconsistent_twins(added, changed, before, after):
    """
    找「同名字段分布在多个容器里，改完之后值不一致」的情况。

    这是插件看似生效实则无效的头号原因：
    data.vip.vipStatus 改成 1，但 data.card.vip.vipStatus 还是 0，
    而 App 读后者 —— 界面毫无变化。

    判据是【改完之后两个容器值是否一致】，
    而不是「是否被碰过」—— 值本来就对、被重复写入同样算一致。
    """
    fb, fa = flatten(before), flatten(after)
    touched = set(changed.keys()) | set(added.keys())
    leaves = {k.split('.')[-1] for k in touched if '.' in k}
    out = []
    for leaf in leaves:
        paths = [k for k in fa if k.split('.')[-1] == leaf]
        for i, k1 in enumerate(paths):
            for k2 in paths[i+1:]:
                c1, c2 = '.'.join(k1.split('.')[:-1]), '.'.join(k2.split('.')[:-1])
                if c1 == c2:
                    continue
                # 只比较「容器末段相同」的孪生字段，如 data.vip ↔ data.card.vip。
                # 否则 text/name 这类叶子会满树误报。
                if c1.split('.')[-1] != c2.split('.')[-1]:
                    continue
                v1, v2 = fa.get(k1), fa.get(k2)
                if json.dumps(v1, ensure_ascii=False) == json.dumps(v2, ensure_ascii=False):
                    continue
                # 至少一边是本次改过的，才值得提示
                if k1 not in touched and k2 not in touched:
                    continue
                out.append((leaf, k1, v1, k2, v2))
    return out


# ---------- 输出 ----------

C_G, C_R, C_Y, C_D = '\033[32m', '\033[31m', '\033[33m', '\033[2m'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('baseline', nargs='?')
    ap.add_argument('modified', nargs='?')
    ap.add_argument('--list', action='store_true', help='只列端点（用法: --list <file.har>）')
    ap.add_argument('--endpoint', help='只看某端点（子串匹配）')
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--no-color', action='store_true')
    a = ap.parse_args()

    if a.list:
        f = a.modified or a.baseline
        if not f:
            ap.error('--list 需要指定文件：--list <file.har>')
        eps = load(f)
        print(f'{len(eps)} 个含 JSON 的端点：')
        for p, rs in sorted(eps.items()):
            print(f'  {p:<46} {len(rs)} 次')
        return 0

    if not (a.baseline and a.modified):
        ap.error('需要 baseline.har 和 modified.har')

    B, M = load(a.baseline), load(a.modified)
    report = {'endpoints': {}, 'warnings': []}

    common = [p for p in (B.keys() & M.keys()) if not a.endpoint or a.endpoint in p]
    only_mod = [p for p in M if p not in B and (not a.endpoint or a.endpoint in p)]

    if only_mod:
        print(f'{C_Y}只在 modified 中出现的端点（{len(only_mod)}）{C_D}'
              f'  —— 两次抓包范围不同，对比结果不可靠{C_R}')
        for p in sorted(only_mod)[:10]:
            print(f'    {p}')
        print()
        report['warnings'].append('端点集合不一致，部分端点无法对比')

    total = {'added': 0, 'removed': 0, 'changed': 0}
    for p in sorted(common):
        for bi, mi in zip(B[p], M[p]):
            added, removed, changed = diff_ep(bi, mi)
            if not (added or removed or changed):
                continue
            total['added'] += len(added)
            total['removed'] += len(removed)
            total['changed'] += len(changed)
            report['endpoints'][p] = {
                'added': added, 'removed': removed,
                'changed': {k: {'before': v[0], 'after': v[1]} for k, v in changed.items()},
            }
            if a.json:
                continue
            print(f'{C_G}▌{p}{C_R}   +{len(added)} -{len(removed)} ~{len(changed)}')
            for k, v in list(changed.items())[:24]:
                print(f'     {C_R}~{C_R} {k}')
                print(f'        {C_D}{short(v[0])}  →  {short(v[1])}{C_R}')
            for k, v in list(added.items())[:8]:
                print(f'     {C_G}+{C_G} {k} = {short(v)}{C_R}')
            for k, v in list(removed.items())[:8]:
                print(f'     {C_Y}-{C_Y} {k} (原 {short(v)}){C_R}')

            # 同名字段只改一处 → 警告
            for leaf, k1, v1, k2, v2 in inconsistent_twins(added, changed, bi, mi):
                report['warnings'].append(f'{p}: {leaf} 在 {k1}={v1} 与 {k2}={v2} 不一致')
                if not a.json:
                    print(f'     {C_Y}⚠ {leaf} 两处不一致：{C_R}')
                    print(f'        {k1} = {short(v1)}   {C_D}(本次已改){C_R}')
                    print(f'        {k2} = {short(v2)}   {C_D}(未跟随){C_R}')
                    print(f'       {C_D}若 App 读后者，前者改动不会生效{C_R}')
            print()

    print(f'{C_D}{"─"*66}{C_R}')
    print(f'  合计  新增 {total["added"]}  删除 {total["removed"]}  修改 {total["changed"]}  端点 {len(report["endpoints"])}')

    if a.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    elif report['warnings']:
        print(f'\n{C_Y}{len(report["warnings"])} 条提示{C_R}')
        for w in report['warnings'][:6]:
            print(f'  · {w}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
