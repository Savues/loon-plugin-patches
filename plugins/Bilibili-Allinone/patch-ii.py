#!/usr/bin/env python3
"""patch-ii.py — 把 chronos 重签移植进 protobuf.response.js 的 ii()（锚点式，宁可失败不静默）
唯一功能改动：替换 ii() 函数体 + Ti() MAP（旧 MAP 指向已删除的 zip = 404 事故源）。
其余 bundle 内容零改动。"""
import pathlib, re, sys

P = pathlib.Path(__file__).resolve().parent / 'scripts' / 'protobuf.response.js'
s = P.read_text(encoding='utf-8')
fail = []
def anchor(desc, old, new, expect=1):
    global s
    n = s.count(old)
    if n != expect:
        fail.append(f'{desc}: 命中 {n} 次 (期望 {expect})'); return
    s = s.replace(old, new)

# ① ii() 重写：清洗逻辑在调用方，这里只做 chronos 重签（md5/file/sign 是已解析的 typed 字段）
anchor('ii() 替换',
'''function ii(a,e){T.warn("[Bilibili-Dedup] chronos 引擎包劫持已停用(修复弹幕404), 交由官方包/Bilibili-Airborne 插件处理");return;}''',
'''function ii(a,e){if(!a)return;var r=Ti(),n=r[a.md5];if(!n){var u=xi(e||{}),g=r[u];if(!g){T.warn("[Bilibili-Allinone] chronos md5 "+a.md5+" 与 UA 变体 "+u+" 均不在映射表("+Object.keys(r).length+"条), 原样放行");return}n=g,T.warn("[Bilibili-Allinone] chronos md5 "+a.md5+" 不在映射表("+Object.keys(r).length+"条), 按 UA 回退 "+u)}if(a.md5===n)return;a.md5=n,a.file="https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Allinone/chronos/"+n+".zip",a.sign=void 0,T.info("[Bilibili-Allinone] chronos 重签 → "+n)}''')


# ② Ti() MAP：换成 chronos.js 权威表（全部目标在 chronos/ 目录内，杜绝 404）
anchor('Ti() MAP 替换',
'function Ti(){return{universal:"e5a968f1a5055bbe5c12e67b100a6dcb",hd:"f993a054969a4f6ae6b20a65f1292e47",inter:"8c3feda2e92bf60e8a7aeade1a231586","45b564f5ba1fdd3746406937059addd8":"e5a968f1a5055bbe5c12e67b100a6dcb",c29bd8f2b64a8f57f49c3622c0f763db:"ecca73e42e160074e0caf4b3ddb54a52",c218977c14e5dfdafd51edf3ae49ed02:"f993a054969a4f6ae6b20a65f1292e47","8232ffb6ee43b687b5fe5add5b3e97de":"feaca416bbc1174b8e935cf87ff8f0b5","325e7073ffc6fb5263682fecdcd1058f":"932002070dc1b51241198a074d2279fc","3a14beddd23328eaddfe9f0eb048d713":"8c3feda2e92bf60e8a7aeade1a231586"}}',
'function Ti(){return{universal:"c0765d8cf4fb56c8a901226e05795c4a",hd:"8b0ed90623941b6b19ddf838a225419d",inter:"c9940a255224fb5ab2829f0c87df71c9","45b564f5ba1fdd3746406937059addd8":"c0765d8cf4fb56c8a901226e05795c4a",c29bd8f2b64a8f57f49c3622c0f763db:"7e7f5a132eff729936b17c35cafda14a",c218977c14e5dfdafd51edf3ae49ed02:"8b0ed90623941b6b19ddf838a225419d","8232ffb6ee43b687b5fe5add5b3e97de":"1903c8e4308a9d33dbce98fb711a1e0d","325e7073ffc6fb5263682fecdcd1058f":"7d0a357c92ee4a002c0970e88d1b38b6","3a14beddd23328eaddfe9f0eb048d713":"c9940a255224fb5ab2829f0c87df71c9"}}')

P.write_text(s, encoding='utf-8')
print('✓ ii() 与 Ti() 已替换')
