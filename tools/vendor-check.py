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
    # PinDuoDuo 的上游原件放 src/upstream/，src/ 下那份改了远程 URL，不参与漂移比对
    'plugins/PinDuoDuo/src/upstream/PinDuoDuo_remove_ads.js':
        'https://kelee.one/Resource/JavaScript/PinDuoDuo/PinDuoDuo_remove_ads.js',
    'plugins/PinDuoDuo/src/chunks/9410-b8806e870a26db7d.js':
        'https://kelee.one/Resource/JavaScript/PinDuoDuo/9410-b8806e870a26db7d.js',
    # Reven-Mirror：清单原件与脚本原件一并托管，脚本本身逐字节未改
    'plugins/Reven-Mirror/src/loon-redirect.js':
        'https://reven.jsforbaby.workers.dev/reven/loon-redirect.js',
    'plugins/Reven-Mirror/upstream-Reven.lpx':
        'https://reven.jsforbaby.workers.dev/reven/reven.lpx',
    # AgentRouter：上游原件存 src/upstream-，src/ 下那份改了奖励正则，
    # 不参与漂移比对（同 PinDuoDuo 的做法）
    'plugins/AgentRouter/src/upstream-agentrouter.js':
        'https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/main/app/agentrouter/agentrouter.js',
    'plugins/AgentRouter/upstream-agentrouter.lpx':
        'https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/main/app/agentrouter/agentrouter.lpx',
}

# 自研脚本：无上游，不做漂移比对，但登记 sha256 以便查本地完整性
OWN_SCRIPTS = {
    'plugins/PinDuoDuo/src/homepage.response.js': 'plugins/PinDuoDuo/manifest.json',
    'plugins/PinDuoDuo/src/stub.response.js': 'plugins/PinDuoDuo/manifest.json',
}

# 改过上游脚本的副本：无上游，不做漂移比对，但登记 sha256 以便查本地完整性
# 值 = (登记到哪个 manifest, 它基于哪个上游原件)
PATCHED = {
    'plugins/AgentRouter/src/agentrouter.js':
        ('plugins/AgentRouter/manifest.json', 'plugins/AgentRouter/src/upstream-agentrouter.js'),
}

# 源文件登记在哪个 manifest.json（显式列出，不按目录推导：
# YouTube-Dedup 的脚本历史上就登记在 YouTube-Test 的 manifest 里）
MANIFEST_OF = {
    **{r: 'plugins/YouTube-Test/manifest.json' for r in SOURCES
       if r.startswith('plugins/YouTube-')},
    'plugins/PinDuoDuo/src/upstream/PinDuoDuo_remove_ads.js': 'plugins/PinDuoDuo/manifest.json',
    'plugins/PinDuoDuo/src/chunks/9410-b8806e870a26db7d.js': 'plugins/PinDuoDuo/manifest.json',
    **{r: 'plugins/Reven-Mirror/manifest.json' for r in SOURCES
       if r.startswith('plugins/Reven-Mirror/')},
    **{r: 'plugins/AgentRouter/manifest.json' for r in SOURCES
       if r.startswith('plugins/AgentRouter/')},
}


def sha256(p: pathlib.Path) -> str:
    with p.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


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
    g.add_argument('--hash', action='store_true', help='校验本地完整性')
    g.add_argument('--manifest', action='store_true', help='重新生成 manifest.json')
    g.add_argument('--diff', action='store_true', help='拉上游比大小+sha256')
    a = ap.parse_args()

    if a.manifest:
        for mf in sorted({*MANIFEST_OF.values(), *OWN_SCRIPTS.values(),
                    *(m for m, _ in PATCHED.values())}):
            src = {}
            for rel, url in SOURCES.items():
                if MANIFEST_OF.get(rel) != mf:
                    continue
                p = ROOT / rel
                src[rel] = {'upstream': url, 'bytes': p.stat().st_size, 'sha256': sha256(p)}
            for rel, m in OWN_SCRIPTS.items():
                if m != mf:
                    continue
                p = ROOT / rel
                src[rel] = {'upstream': None, 'origin': 'self-authored',
                            'bytes': p.stat().st_size, 'sha256': sha256(p)}
            for rel, (m, base) in PATCHED.items():
                if m != mf:
                    continue
                p = ROOT / rel
                src[rel] = {'upstream': None, 'origin': 'patched-upstream', 'based-on': base,
                            'bytes': p.stat().st_size, 'sha256': sha256(p)}
            doc = {'_comment': 'Vendored upstream scripts, byte-for-byte. See UPSTREAM.md. '
                               'Regenerate with: python3 tools/vendor-check.py --manifest',
                   'sources': src}
            (ROOT / mf).write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n',
                                   encoding='utf-8')
            print('已写入 %s（%d 个文件）' % (mf, len(src)))
        return 0

    bad = 0
    for mf in sorted({*MANIFEST_OF.values(), *OWN_SCRIPTS.values(),
                    *(m for m, _ in PATCHED.values())}):
        mp = ROOT / mf
        if not mp.exists():
            print('缺少 %s，先跑 --manifest 生成' % mf, file=sys.stderr)
            bad += 1
            continue
        want = json.loads(mp.read_text(encoding='utf-8'))['sources']
        for rel in [r for r in SOURCES if MANIFEST_OF.get(r) == mf] \
                 + [r for r, m in OWN_SCRIPTS.items() if m == mf] \
                 + [r for r, (m, _) in PATCHED.items() if m == mf]:
            p = ROOT / rel
            name = rel.split('/')[-1]
            own = rel in OWN_SCRIPTS
            patched = rel in PATCHED
            if not p.exists():
                print('❌ %s: 本地缺失' % name)
                bad += 1
                continue
            got, exp = sha256(p), (want.get(rel) or {}).get('sha256')
            if a.diff and not own:
                remote = fetch(SOURCES[rel])
                if remote is None:
                    print('⚠️  %s 上游拉取失败，跳过' % name)
                    continue
                if hashlib.sha256(remote).hexdigest() == got:
                    print('✅ %s %7d B  与上游一致' % (name, len(remote)))
                else:
                    print('🔄 %s 上游 %7d B（本地 %d B）已漂移'
                          % (name, len(remote), p.stat().st_size))
                    bad += 1
                continue
            ok = got == exp
            tag = '  (自研)' if own else '  (改自上游)' if patched else ''
            print('%s %s  %7d B  %s…%s' % ('✅' if ok else '⚠️ ', name, p.stat().st_size,
                                           got[:16], tag))
            if not ok:
                print('    期望 %s… —— 本地与 manifest 不符' % (exp or '?')[:16])
                bad += 1
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
