#!/usr/bin/env python3
"""vendor-check.py —— 校验托管脚本的完整性，并在需要时比对上游是否漂移。

为什么需要
----------
托管的意义是「上游没了也能用」。但托管之后**上游会继续更新**，
于是要能回答两个问题：
  1. 本地这份有没有被人动过？          → --hash
  2. 上游有没有出新版本、值不值得跟？   → --diff

用法
----
    python3 tools/vendor-check.py --manifest   # 重新生成 manifest.json
    python3 tools/vendor-check.py --hash       # 只校验本地完整性（离线）
    python3 tools/vendor-check.py --diff       # 拉上游比大小+sha256

退出码：0 全部一致 / 1 有漂移或改动 / 2 用法错误
"""
import argparse, hashlib, json, pathlib, subprocess, sys, tempfile, os

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = 'Loon/765 CFNetwork/1568.0.3 Darwin/23.5.0'

# 相对仓库根的路径 -> 上游地址
SOURCES = {
    'plugins/YouTube-Test/src/youtube.response.js':
        'https://raw.githubusercontent.com/Maasea/sgmodule/refs/heads/master/Script/Youtube/youtube.response.js',
    'plugins/YouTube-Test/src/YouTube_Subtitles_request.js':
        'https://kelee.one/Resource/JavaScript/YouTube/YouTube_Subtitles_Translate/YouTube_Subtitles_request.js',
    'plugins/YouTube-Test/src/YouTube_Subtitles_response.js':
        'https://kelee.one/Resource/JavaScript/YouTube/YouTube_Subtitles_Translate/YouTube_Subtitles_response.js',
    'plugins/YouTube-Test/src/YouTube_Composite_Subtitles_response.js':
        'https://kelee.one/Resource/JavaScript/YouTube/YouTube_Subtitles_Translate/YouTube_Composite_Subtitles_response.js',
    'plugins/YouTube-Test/src/YouTube_Subtitles_Translate_response.js':
        'https://kelee.one/Resource/JavaScript/YouTube/YouTube_Subtitles_Translate/YouTube_Subtitles_Translate_response.js',
    'plugins/YouTube-Dedup/src/remove-ads-request.js':
        'https://kelee.one/Resource/JavaScript/YouTube/YouTube_remove_ads/YouTube_remove_ads_request.js',
    'plugins/PinDuoDuo/src/upstream/PinDuoDuo_remove_ads.js':
        'https://kelee.one/Resource/JavaScript/PinDuoDuo/PinDuoDuo_remove_ads.js',
    'plugins/PinDuoDuo/src/chunks/9410-b8806e870a26db7d.js':
        'https://kelee.one/Resource/JavaScript/PinDuoDuo/9410-b8806e870a26db7d.js',
}

# 源文件 -> 它登记在哪个 manifest.json 里。
# 显式列出而非按目录推导：YouTube-Dedup 的脚本历史上就登记在 YouTube-Test 的
# manifest 里，挪走会让已有文件凭空多出一次 diff。
#
# 注意 PinDuoDuo 的分工：src/upstream/ 放上游原件（只读，永不打补丁），
# src/ 下的同名副本是实际被 script-path 加载的、允许本仓库改远程依赖 URL。
# 漂移比对只针对 upstream/ 那份，否则改过 URL 的副本会永远报漂移。
MANIFEST_OF = {
    **{r: 'plugins/YouTube-Test/manifest.json' for r in SOURCES
       if r.startswith('plugins/YouTube-')},
    'plugins/PinDuoDuo/src/PinDuoDuo_remove_ads.js': 'plugins/PinDuoDuo/manifest.json',
    'plugins/PinDuoDuo/src/upstream/PinDuoDuo_remove_ads.js': 'plugins/PinDuoDuo/manifest.json',
    'plugins/PinDuoDuo/src/chunks/9410-b8806e870a26db7d.js': 'plugins/PinDuoDuo/manifest.json',
}


def sha256(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def fetch(url):
    fd, tmp = tempfile.mkstemp(suffix='.js')
    os.close(fd)
    try:
        r = subprocess.run(['curl', '-sL', '--max-time', '90', '-A', UA, '-o', tmp, url],
                           capture_output=True)
        if r.returncode != 0 or os.path.getsize(tmp) < 500:
            return None
        return pathlib.Path(tmp).read_bytes()
    finally:
        os.unlink(tmp)


def groups():
    """按 manifest 归组：{manifest 相对路径: [源文件相对路径, ...]}"""
    g = {}
    for rel in SOURCES:
        g.setdefault(MANIFEST_OF[rel], []).append(rel)
    return g


def build_manifest(rel_list):
    src = {}
    for rel in rel_list:
        p = ROOT / rel
        src[rel] = {'upstream': SOURCES[rel],
                    'bytes': p.stat().st_size if p.exists() else None,
                    'sha256': sha256(p) if p.exists() else None}
    return {'_comment': 'Vendored upstream scripts, byte-for-byte. See UPSTREAM.md. '
                         'Regenerate with: python3 tools/vendor-check.py --manifest',
            'sources': src}


def main():
    ap = argparse.ArgumentParser(description='校验 / 比对托管脚本')
    ap.add_argument('--manifest', action='store_true', help='重新生成 manifest.json')
    ap.add_argument('--hash', action='store_true', help='只校验本地 sha256（离线）')
    ap.add_argument('--diff', action='store_true', help='拉上游比大小与 sha256')
    a = ap.parse_args()
    if not (a.manifest or a.hash or a.diff):
        print(__doc__); return 2

    if a.manifest:
        for mf, rels in sorted(groups().items()):
            p = ROOT / mf
            p.write_text(json.dumps(build_manifest(rels), ensure_ascii=False, indent=2) + '\n',
                         encoding='utf-8')
            print('已写入 %s（%d 个文件）' % (mf, len(rels)))
        return 0

    bad = 0
    for mf, rels in sorted(groups().items()):
        mp = ROOT / mf
        if not mp.exists():
            print('❌ 缺少 %s，先跑 --manifest 生成' % mf, file=sys.stderr)
            bad += 1
            continue
        want = json.loads(mp.read_text(encoding='utf-8')).get('sources', {})
        for rel in rels:
            p = ROOT / rel
            name = rel.split('/')[-1]
            if not p.exists():
                print('❌ %s: 本地缺失' % name); bad += 1; continue
            got = sha256(p)
            exp = (want.get(rel) or {}).get('sha256')
            if a.hash:
                ok = exp == got
                print('%s %-38s %7d B  %s…' % ('✅' if ok else '❌', name, p.stat().st_size, got[:16]))
                if not ok:
                    print('    期望 %s —— 本地与 manifest 不符' % (exp[:16] + '…' if exp else '?'))
                    bad += 1
            else:
                remote = fetch(SOURCES[rel])
                if remote is None:
                    print('⚠️  %-38s 上游拉取失败，跳过' % name); continue
                rk = hashlib.sha256(remote).hexdigest()
                if rk == got:
                    print('✅ %-38s %7d B  与本地一致' % (name, len(remote)))
                else:
                    print('🔄 %-38s 上游 %7d B（本地 %d B）已漂移' % (name, len(remote), p.stat().st_size))
                    bad += 1
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
