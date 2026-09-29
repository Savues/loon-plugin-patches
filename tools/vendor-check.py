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
MANIFEST = ROOT / 'plugins/YouTube-Test/manifest.json'
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


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--hash', action='store_true', help='只校验本地完整性')
    g.add_argument('--diff', action='store_true', help='拉上游比对')
    g.add_argument('--manifest', action='store_true', help='重新生成 manifest.json')
    a = ap.parse_args()

    if a.manifest:
        src = {}
        for rel, url in SOURCES.items():
            p = ROOT / rel
            src[rel] = {'upstream': url,
                        'bytes': p.stat().st_size if p.exists() else None,
                        'sha256': sha256(p) if p.exists() else None}
        doc = {'_comment': 'Vendored upstream scripts, byte-for-byte. See UPSTREAM.md. '
                           'Regenerate with: python3 tools/vendor-check.py --manifest',
               'sources': src}
        MANIFEST.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print('已写入 %s（%d 个文件）' % (MANIFEST.relative_to(ROOT), len(src)))
        return 0

    if not MANIFEST.exists():
        print('缺少 manifest.json，先跑 --manifest 生成', file=sys.stderr)
        return 2
    want = json.loads(MANIFEST.read_text(encoding='utf-8'))['sources']

    bad = 0
    for rel, url in SOURCES.items():
        p = ROOT / rel
        name = rel.split('/')[-1]
        if not p.exists():
            print('❌ %s: 本地缺失' % name); bad += 1; continue
        got = sha256(p)
        exp = (want.get(rel) or {}).get('sha256')
        if a.hash:
            ok = got == exp
            print('%s %s  %7d B  %s…' % ('✅' if ok else '⚠️ ', name, p.stat().st_size, got[:16]))
            if not ok:
                print('    期望 %s… —— 本地与 manifest 不符' % (exp or '?')[:16]); bad += 1
            continue
        up = fetch(url)
        if up is None:
            print('⚠️  %s: 上游拉取失败（可能已下线），本地仍可用' % name)
            continue
        uh = hashlib.sha256(up).hexdigest()
        if uh == got:
            print('✅ %s  与上游一致  %7d B' % (name, len(up)))
        else:
            print('⚠️  %s  上游已更新  本地 %d B / 上游 %d B' % (name, p.stat().st_size, len(up)))
            print('    本地 %s…  上游 %s…' % (got[:16], uh[:16]))
            print('    跟之前先跑 external-audit.mjs 对新版本做一次外发审计')
            bad += 1
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
