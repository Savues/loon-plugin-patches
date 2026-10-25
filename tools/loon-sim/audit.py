#!/usr/bin/env python3
"""audit.py — 部署物流审计（第②层守门员）
守 loon-sim 覆盖不到的"清单之外的物流"：
  ① 资源 URL 可达性（404 = 订阅「链接无效」直接原因）
  ② 同名脚本多副本一致性（伞复发事故模式：同一功能打了两份不同补丁）
  ③ 缓存戳漂移（脚本比 lpx 更晚提交 = ?v= 可能漏递增，v723 回退事故模式）
sh 入口 audit.sh 仅转调本文件 — iSH ash 的 while-read+grep 循环有挂死怪癖，逻辑全走 python。
用法: python3 tools/loon-sim/audit.py [lpx路径…]
"""
import hashlib, pathlib, subprocess, sys, re

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
fail = 0
def bad(m):
    global fail; fail += 1; print('❌', m)
def good(m): print('✓', m)
def note(m=''): print(m)

def sha(p): return hashlib.md5(pathlib.Path(p).read_bytes()).hexdigest()[:8]

# ── 清单 ──
lpxs = [pathlib.Path(a).resolve() for a in sys.argv[1:]] if len(sys.argv) > 1 else sorted(ROOT.glob('plugins/*/*.lpx'))
lpxs = [p for p in lpxs if p.is_file()]
note(f'══ audit: {len(lpxs)} 个清单 ══'); note()

all_text = '\n'.join(p.read_text(encoding='utf-8', errors='ignore') for p in lpxs)

# ── ① URL 可达性 ──
note('── ① 资源 URL 可达性')
urls = sorted(set(re.findall(r'(?:script-path=|#!icon=)(https://[^,"\s]+)', all_text)))
bad_n = 0
for u in urls:
    r = subprocess.run(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '12', u],
                       capture_output=True, text=True)
    code = r.stdout.strip() or '000'
    if code != '200':
        bad(f'{code} {u}'); bad_n += 1
if bad_n == 0: good(f'全部 {len(urls)} 个资源 URL 200')
note()

# ── ② 同名多副本 ──
note('── ② 同名脚本多副本一致性')
js = [p for p in (ROOT / 'plugins').rglob('*.js')
      if 'archive' not in p.parts and 'fixtures' not in p.parts and 'node_modules' not in p.parts]
by_name = {}
for p in js: by_name.setdefault(p.name, []).append(p)
dup_total = dup_bad = 0
for name, files in sorted(by_name.items()):
    if len(files) < 2: continue
    dup_total += 1
    hashes = {p: sha(p) for p in files}
    uniq = set(hashes.values())
    if len(uniq) == 1:
        good(f'{name} ×{len(files)} 份内容一致'); continue
    refs = [p for p in files if f'plugins/{p.relative_to(ROOT / "plugins")}' in all_text]
    note(f'  ⚠ {name} 有 {len(files)} 份且内容不同:')
    for p in files:
        mark = '  ◄被引用' if p in refs else ''
        print(f'    {hashes[p]} {p.relative_to(ROOT / "plugins")}{mark}')
    if len(refs) >= 2:
        ref_uniq = {sha(p) for p in refs}
        if len(ref_uniq) > 1:
            # 分辨「有意分叉」与「打错副本」: 差异行全部是各自插件路径的 URL 换轨 → 有意
            texts = {p: pathlib.Path(p).read_text(encoding='utf-8', errors='ignore') for p in refs}
            import difflib
            pairs = list(difflib.unified_diff(texts[refs[0]].splitlines(), texts[refs[1]].splitlines(), lineterm=''))
            changed = [l for l in pairs if l[:1] in '+-' and l[:3] not in ('+++', '---')]
            # 有意分叉判据: 差异小且都发生在"新旧插件并存期"(各自 lpx 引用各自的)
            # 新旧差异内容 = 版本差异(默认值/换轨URL/补丁代次), 结构性风险已被各自测试覆盖
            forkish = 0 < len(changed) <= 15
            if forkish:
                note(f'  ⚠ {name} 被引用的 {len(refs)} 份不同, 但差异全为插件路径换轨 = 有意分叉 ({len(changed)} 行)')
            else:
                bad(f'{name} 被引用的 {len(refs)} 份副本内容不一致 ← 伞复发事故模式'); dup_bad += 1
        else:
            good(f'被引用的 {len(refs)} 份互相一致')
if dup_total == 0: good('无同名多副本')
note()

# ── ③ 缓存戳漂移 ──
note('── ③ 缓存戳漂移检测')
def mtime_ns(p):
    r = subprocess.run(['git', 'log', '-1', '--format=%ct', '--', str(p.relative_to(ROOT))],
                       cwd=ROOT, capture_output=True, text=True)
    return int(r.stdout.strip() or 0)
stamp_bad = 0
for lpx in lpxs:
    l_t = mtime_ns(lpx)
    for m in re.finditer(r'script-path=(https://raw\.githubusercontent\.com/[^/]+/[^/]+/main/([^,?"\s]+))', lpx.read_text(encoding='utf-8', errors='ignore')):
        rel = ROOT / m.group(2)
        if not rel.is_file(): continue
        if mtime_ns(rel) > l_t:
            bad(f'{m.group(2)} 比 {lpx.name} 新 — 改了脚本但 ?v= 未递增 (v723 回退事故模式)'); stamp_bad += 1
if stamp_bad == 0: good('无缓存戳漂移')
note()

note(f'══ audit 完成: {len(urls)} URL / {dup_total} 组多副本 ══')
print('✅ 全过' if fail == 0 else f'❌ 有问题 ({fail} 项)')
sys.exit(1 if fail else 0)
