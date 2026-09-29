#!/usr/bin/env python3
"""external-watch.py —— 盯住插件清单里那些「每次联网都现取」的外部资源。

为什么需要它
------------
`script-path=` 指向的 JS 没有哈希锁定，Loon 每次按需拉取。清单本身也可能被改。
于是同一条订阅地址可以在你毫无察觉的情况下换掉内容 —— 而插件已经装在设备上了。
本仓库的 GeoFix 插件踩过同一件事的另一半：站点一消失，已导入的插件直接加载失败。

它管什么
--------
* `script-path=` 的 JS      —— 真代码，最需要盯
* 插件清单 `.lpx`           —— 改这里等于改 MITM 域名 / 参数 / 规则
* `#!icon` 图标             —— 顺手记一下
**不**管 MITM 里的目标域名（那些是 App 自己的服务端，不由作者控制）。

用法
----
    python3 tools/external-watch.py --check          # 比对基线，有漂移退出码 1
    python3 tools/external-watch.py --check --diff    # 顺便把 JS 改了什么打出来
    python3 tools/external-watch.py --pin            # 看过 diff 之后，重建基线

关于 TLS
--------
默认加 `-k`：本机跑 Loon 时出站被 Loon 自己 MITM，证书是 `O=Loon`，
不跳过校验连不上任何外部 https（实测）。判定漂移靠 sha256 比对内容，不依赖证书链。
真要验证书链加 `--strict-tls`。

退出码：0 一致 / 1 有漂移 / 2 拉取失败或用法错误
"""
import argparse, difflib, hashlib, json, os, pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
REG = ROOT / 'tools/external-watch.json'
SNAP = ROOT / 'tools/.snapshots'
UA = 'Loon/765 CFNetwork/1568.0.3 Darwin/23.5.0'


def fetch(url, insecure=True):
    """返回 (bytes, http_code)；拉不到返回 (None, code)。"""
    fd, tmp = tempfile.mkstemp()
    os.close(fd)
    try:
        cmd = ['curl', '-sL', '--max-time', '60', '-A', UA, '-w', '%{http_code}',
               '-o', tmp]
        if insecure:
            cmd.append('-k')
        cmd.append(url)
        r = subprocess.run(cmd, capture_output=True)
        code = r.stdout.decode().strip()[-3:] or '000'
        if code != '200':
            return None, code
        return pathlib.Path(tmp).read_bytes(), code
    finally:
        os.unlink(tmp)


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def load():
    return json.loads(REG.read_text())


def show_diff(res, new):
    """把文本资源的改动按行打出来 —— 只知道「变了」没用，要看得懂变了什么。"""
    snap = SNAP / res['id']
    if not snap.exists():
        print(f'    ⚠ 无基线快照 {snap.name}，先跑一次 --pin')
        return
    old = snap.read_text(errors='replace').splitlines()
    cur = new.decode(errors='replace').splitlines()
    d = list(difflib.unified_diff(old, cur, '基线', '线上', lineterm='', n=1))
    if not d:
        return
    for line in d[:60]:
        print('    ' + line)
    if len(d) > 60:
        print(f'    … 另有 {len(d) - 60} 行')


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--check', action='store_true', help='比对基线')
    g.add_argument('--pin', action='store_true', help='重建基线')
    ap.add_argument('--diff', action='store_true', help='check 时把文本改动打出来')
    ap.add_argument('--strict-tls', action='store_true', help='校验证书链（默认跳过）')
    a = ap.parse_args()

    reg = load()
    SNAP.mkdir(exist_ok=True)
    drift = fetchfail = 0

    for res in reg['resources']:
        body, code = fetch(res['url'], insecure=not a.strict_tls)
        if body is None:
            fetchfail += 1
            print(f"✗ {res['id']:<14} 拉取失败 HTTP {code}  {res['url']}")
            print('    ↑ 站点没了或改了路径。清单层能做的只有撤掉这条依赖或停用该插件。')
            continue

        got = sha256(body)
        if a.pin:
            res['sha256'] = got
            res['bytes'] = len(body)
            if res.get('text'):
                (SNAP / res['id']).write_bytes(body)
            print(f"▌{res['id']:<14} 已重置基线  {len(body):>6} B  {got[:16]}…")
            continue

        if got == res['sha256']:
            print(f"▌{res['id']:<14} 一致        {len(body):>6} B")
            continue

        drift += 1
        print(f"⚠ {res['id']:<14} 已漂移      {len(body):>6} B  ({res['bytes'] or '?'} → {len(body)})")
        print(f"    基线 {res['sha256'][:16]}…  →  线上 {got[:16]}…")
        print(f"    {res.get('note', '')}")
        if a.diff and res.get('text'):
            show_diff(res, body)

    if a.pin:
        REG.write_text(json.dumps(reg, ensure_ascii=False, indent=2) + '\n')
        print(f'\n基线已写回 {REG.relative_to(ROOT)}（含 {len(list(SNAP.iterdir()))} 份文本快照）')
        return 0

    if drift:
        print(f'\n{drift} 个资源漂移。**先看 diff，确认无害再 --pin**；'
              '涉及 script-path 的改动要当上游代码变更对待。')
    if fetchfail:
        print(f'{fetchfail} 个资源拉取失败 —— 拉不到不等于没变，'
              '站点消失本身就是要处理的事故')
    if drift or fetchfail:
        return 1
    print('\n全部与基线一致')
    return 0


if __name__ == '__main__':
    sys.exit(main())
