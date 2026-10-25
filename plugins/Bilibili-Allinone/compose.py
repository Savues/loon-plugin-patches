#!/usr/bin/env python3
"""compose.py — 从四个旧 lpx 程序化拼装 Bilibili-Allinone.lpx
规则行/参数行一律原文搬运(只换 URL 与探针), 避免手抄长行出错。"""
import re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
PLUG = ROOT.parent
def read(p): return (PLUG / p).read_text(encoding='utf-8')

dedup = read('Bilibili-Dedup/Bilibili-Dedup.lpx')
ui    = read('Bilibili-UI/Bilibili-UI.lpx')
air   = read('Bilibili-Airborne/Bilibili-Airborne.lpx')
spl   = read('Splash-Festival/Splash-Festival.lpx')

def section(txt, name):
    m = re.search(r'^\[' + name + r'\]\n(.*?)(?=^\[|\Z)', txt, re.M | re.S)
    return m.group(1).rstrip() + '\n'

def arglines(txt):
    out = []
    for ln in section(txt, 'Argument').splitlines():
        t = ln.strip()
        if t and not t.startswith('#'):
            out.append(ln)
    return out

URLMAP = [
    ('main/plugins/Bilibili-Dedup/',        'main/plugins/Bilibili-Allinone/scripts/'),
    ('main/plugins/Bilibili-UI/',           'main/plugins/Bilibili-Allinone/scripts/'),
    ('main/plugins/Splash-Festival/',       'main/plugins/Bilibili-Allinone/scripts/'),
    ('main/plugins/Bilibili-Airborne/',     'main/plugins/Bilibili-Allinone/scripts/'),
]
def reurl(line):
    for a, b in URLMAP: line = line.replace(a, b)
    return line

# ---- 参数分组 ----
dedup_args = arglines(dedup)                 # 22 (含 LogLevel 与 logLevel)
ui_args    = [l for l in arglines(ui)  if not l.startswith('LogLevel')]      # 19
air_args   = [l for l in arglines(air) if not l.startswith('logLevel')]      # 20
spl_args   = arglines(spl)                   # 6
total = len(dedup_args) + len(ui_args) + len(air_args) + len(spl_args)
assert total == 67, f'参数总数 {total} != 67'

# ---- Script 行 ----
dedup_script = []
for ln in section(dedup, 'Script').splitlines():
    t = ln.strip()
    if not t or t.startswith('#'): continue
    ln = reurl(ln)
    # grpc 总线规则: argument 注入 chronos 开关(阶段2 的 ii() 读它); request/response 两条 bundle 规则都挂
    if '{purifyComment}' in ln and 'protobuf.response' in ln:
        ln = ln.replace('argument=[{displayUpList}, {purifyComment}, {logLevel}]',
                        'argument=[{displayUpList}, {purifyComment}, {chronos}, {logLevel}]')
        ln = ln.replace('argument=[{purifyComment}, {logLevel}]',
                        'argument=[{purifyComment}, {chronos}, {logLevel}]')
    dedup_script.append(ln)
assert any('{chronos}' in l for l in dedup_script), 'chronos 注入失败'
ui_script  = [reurl(l) for l in section(ui,  'Script').splitlines() if l.strip() and not l.strip().startswith('#')]
spl_script = [reurl(l) for l in section(spl, 'Script').splitlines() if l.strip() and not l.strip().startswith('#')]
air_script = [reurl(l) for l in section(air, 'Script').splitlines()
              if l.strip() and 'ViewProgress' not in l]   # ViewProgress 交 ii(), 不挂独立规则

out = f'''#!name=B站四合一(去广告+界面+空降+开屏) v8.0.0
#!desc=Bilibili-Allinone: 四插件合体 — ①去广告+会员伪装+漫画净化(Bilibili-Dedup) ②首页标签页/底栏(Bilibili-UI) ③空降助手 SponsorBlock(Bilibili-Airborne) ④开屏节日定制(Splash-Festival)。参数 67 个按 tag 分组; ViewProgress 由 bundle 单管线处理(清洗+chronos 重签), 消除跨插件规则互抢。
#!author=@Savues <https://github.com/Savues>
#!tag=去广告,Bilibili,Allinone
#!system=iOS, iPadOS
#!system_version=15
#!loon_version=3.4.0(962)
#!homepage=https://github.com/Savues/loon-plugin-patches
#!icon=https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Allinone/icon.png?v=2
#!date=2026-10-26 00:30:00

[Argument]
# ======== 去广告 / 会员伪装 (原 Bilibili-Dedup v7.45) ========
''' + '\n'.join(dedup_args) + '''
# ======== 界面增强 (原 Bilibili-UI v3.6.0; LogLevel 与上面共用) ========
''' + '\n'.join(ui_args) + '''
# ======== 空降助手 (原 Bilibili-Airborne v1.60; logLevel 与 kokoryh 共用) ========
''' + '\n'.join(air_args) + '''
# ======== 开屏节日 (原 Splash-Festival v40.3) ========
''' + '\n'.join(spl_args) + '''

[Rule]
''' + section(dedup, 'Rule') + '''
[Rewrite]
# 版本探针 v2 (version-probe.sh 用, 勿删)
request if ${{url}} ~= /^https?:\\/\\/line3-h5-mobile-api\\.biligame\\.com\\/gw\\/loon-sim\\.probe\\/bilibili_allinone/i then reject(200, "8.0.0")

''' + section(dedup, 'Rewrite') + '''
[Script]
# -- 去广告/会员伪装 (原 Dedup; ViewProgress 的 chronos 重签已并入 protobuf.response.js 的 ii()) --
''' + '\n'.join(dedup_script) + '''
# -- 界面增强 (原 UI; LogLevel 共用) --
''' + '\n'.join(ui_script) + '''
# -- 空降助手 (原 Airborne; ViewProgress 重签走 ii()) --
''' + '\n'.join(air_script) + '''
# -- 开屏节日 (原 Splash) --
''' + '\n'.join(spl_script) + '''

[Mitm]
# 并集 = Dedup 5 域 + app.biliapi.net (Airborne 规则匹配该 host; 当前被上面 [Rule] REJECT, 保留以备规则调整)
hostname=line3-h5-mobile-api.biligame.com, app.bilibili.com, api.bilibili.com, grpc.biliapi.net, api.live.bilibili.com, app.biliapi.net
h2 = true
'''
(ROOT / 'Bilibili-Allinone.lpx').write_text(out, encoding='utf-8')
print(f'Bilibili-Allinone.lpx 写入完成: 参数 {total}, Dedup脚本{len(dedup_script)} UI{len(ui_script)} Air{len(air_script)} Spl{len(spl_script)}')
