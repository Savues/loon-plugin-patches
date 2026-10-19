#!/usr/bin/env python3
"""检测 Little-Data/bili_splash_images 里的新开屏图，入库到 Splash-Festival 插件。

用法:
    python3 patches/sync_splash_images.py --source <bili_splash_images 仓库路径> --plugin <插件目录>

设计要点:
- 源图是 webp、**原样入库**（已验证：插件现有历史图与源文件 MD5 完全一致，无需转码）
- 检测 = MD5 比对：源图 MD5 不在插件 images/ 的 MD5 集合里 → 候选新图
- 键名直接用**中文名**（从文件名提取），免 CN_TO_KEY 映射（normalizeFestival 找不到映射时原样返回）
- 改 3 处：images/ 放图、HISTORICAL_VENDORED 加条目、.lpx 加选项 + 版本号自增
- ⚠️ **不做目视检查** —— 那一步由 PR 的人工合并把关（GitHub PR 的 Files changed 内联渲染图片）

退出码: 0 = 正常（无论有没有新图）；非 0 = 出错（此时 workflow 停，不开 PR）
"""
import argparse, hashlib, os, re, shutil, sys

TS_RE = re.compile(r'_\d{8}_\d{6}$')   # 源文件名里的 _20261018_131647 时间戳后缀


def md5(path):
    h = hashlib.md5()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest()


def extract_name(filename):
    """'2026重阳节_20261018_131647.webp' → '2026重阳节'"""
    stem = filename.rsplit('.', 1)[0]
    name = TS_RE.sub('', stem).strip()
    return name or stem


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', required=True, help='Little-Data/bili_splash_images 仓库路径')
    ap.add_argument('--plugin', required=True, help='Splash-Festival 插件目录')
    a = ap.parse_args()

    images_dir = os.path.join(a.plugin, 'images')
    js_path = os.path.join(a.plugin, 'splash-poc.js')
    lpx_path = os.path.join(a.plugin, 'Splash-Festival.lpx')

    # 1) 现有图的 MD5 集合（含官方 + 历史，已入库的一律跳过）
    existing = {}
    for f in os.listdir(images_dir):
        p = os.path.join(images_dir, f)
        if os.path.isfile(p):
            existing[md5(p)] = f
    print(f'插件现有图片 {len(existing)} 张')

    # 2) 现有键（防新键冲突）
    js_txt = open(js_path, encoding='utf-8').read()
    hist_m = re.search(r'(var HISTORICAL_VENDORED\s*=\s*\{)(.*?)(\n\};)', js_txt, re.S)
    if not hist_m:
        print('::error::找不到 HISTORICAL_VENDORED 定义', file=sys.stderr)
        return 1
    keys = set(re.findall(r'^\s{2}"?([^":]+?)"?\s*:\s*\{', hist_m.group(2), re.M))

    # 3) 遍历源仓库 app_splash/*/ 的 *.webp
    src = os.path.join(a.source, 'app_splash')
    new = []
    if not os.path.isdir(src):
        print(f'::warning::源仓库没有 app_splash 目录（结构变了？）：{src}')
        return 0
    for d in sorted(os.listdir(src)):
        dp = os.path.join(src, d)
        if not os.path.isdir(dp):
            continue
        for f in sorted(os.listdir(dp)):
            if not f.lower().endswith('.webp'):
                continue
            p = os.path.join(dp, f)
            h = md5(p)
            if h in existing:
                continue
            new.append((p, h, extract_name(f)))

    if not new:
        print('::notice::没有新素材')
        return 0

    print(f'发现 {len(new)} 张新图: {[n for _, _, n in new]}')

    # 4) 键去重（同名追加 _2/_3）
    def uniq_key(base):
        if base not in keys:
            return base
        i = 2
        while f'{base}_{i}' in keys:
            i += 1
        return f'{base}_{i}'

    added = []
    for p, h, name in new:
        k = uniq_key(name)
        keys.add(k)
        shutil.copyfile(p, os.path.join(images_dir, k + '.webp'))
        added.append((k, name, h))

    # 5) 改 JS：HISTORICAL_VENDORED 末尾追加
    body = hist_m.group(2).rstrip()
    if not body.endswith(','):
        body += ','
    body += '\n' + ',\n'.join(
        f'  "{k}": {{ file: "{k}.webp", hash: "{h}", name: "{name}" }}' for k, name, h in added
    )
    js_txt = js_txt[:hist_m.start(2)] + body + js_txt[hist_m.end(2):]
    open(js_path, 'w', encoding='utf-8').write(js_txt)

    # 6) 改 .lpx：插选项 + 版本号自增 + 计数
    lpx_txt = open(lpx_path, encoding='utf-8').read()
    opts = ''.join(f',"{k}"' for k, _, _ in added)
    if ',tag=节日皮肤' not in lpx_txt:
        print('::error::找不到 festival select 的 tag=节日皮肤 锚点', file=sys.stderr)
        return 1
    lpx_txt = lpx_txt.replace(',tag=节日皮肤', opts + ',tag=节日皮肤', 1)

    vm = re.search(r'splash-poc\.js\?v=(\d+)\.(\d+)', lpx_txt)
    if not vm:
        print('::error::找不到 script-path 版本号', file=sys.stderr)
        return 1
    v = f'{vm.group(1)}.{int(vm.group(2)) + 1}'
    lpx_txt = lpx_txt.replace(vm.group(0), f'splash-poc.js?v={v}')
    lpx_txt = re.sub(r'(开屏节日定制\(Splash Festival\)\s*v)\d+\.\d+', rf'\g<1>{v}', lpx_txt)

    dm = re.search(r'22官方\+(\d+)历史共(\d+)个', lpx_txt)
    if dm:
        h_n, t_n = int(dm.group(1)) + len(added), int(dm.group(2)) + len(added)
        lpx_txt = lpx_txt[:dm.start()] + f'22官方+{h_n}历史共{t_n}个' + lpx_txt[dm.end():]
    open(lpx_path, 'w', encoding='utf-8').write(lpx_txt)

    print(f'已入库 {len(added)} 张 → 版本 v{v}')
    for k, name, h in added:
        print(f'  {k}  {name}  {h[:12]}…')
    print('::warning::⚠️ 合并前请目视检查 PR 的 Files changed，确认图片不含手机 UI（状态栏/导航条/logo水印）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
