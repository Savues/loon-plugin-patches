#!/usr/bin/env python3
"""vendor-check.py —— 校验托管脚本的完整性。

为什么需要
----------
托管的意义是「上游没了也能用」，但托管之后上游会继续更新。
本脚本回答一个问题：**本地这份有没有被人动过？**
内容比对交给 `git diff` 与 `external-audit.mjs`，本脚本只管指纹。

用法
----
    python3 tools/vendor-check.py --manifest   # 重新生成 manifest.json
    python3 tools/vendor-check.py --hash       # 校验本地完整性（离线，退出码 1 = 被改过）

上游有新版本时：跑 external-audit.mjs 审一遍外发域名，确认干净再 --manifest 重生成。
"""
import argparse, hashlib, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'plugins/YouTube-Test/manifest.json'

# 相对仓库根的路径 -> 上游地址（出处记录；脚本按 URL 到本仓库取，不直接访问上游）
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


def sha256(p: pathlib.Path) -> str:
    with p.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--hash', action='store_true', help='校验本地完整性')
    g.add_argument('--manifest', action='store_true', help='重新生成 manifest.json')
    a = ap.parse_args()

    if a.manifest:
        src = {rel: {'upstream': url,
                     'bytes': (ROOT / rel).stat().st_size,
                     'sha256': sha256(ROOT / rel)}
               for rel, url in SOURCES.items()}
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
    for rel in SOURCES:
        p = ROOT / rel
        name = rel.split('/')[-1]
        if not p.exists():
            print('❌ %s: 本地缺失' % name)
            bad += 1
            continue
        got, exp = sha256(p), (want.get(rel) or {}).get('sha256')
        ok = got == exp
        print('%s %s  %7d B  %s…' % ('✅' if ok else '⚠️ ', name, p.stat().st_size, got[:16]))
        if not ok:
            print('    期望 %s… —— 本地与 manifest 不符' % (exp or '?')[:16])
            bad += 1
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
