#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""merge-crack-dev.py —— 把 001ProMax 现役脚本的 36 个 accountAttributes 并进
本仓库托管的 kelee 版脚本，同时保留 kelee 版的 $argument 开关机制。

背景
----
仓库里托管的是 kelee 托管版（基于 001ProMax/Surge 8986b9b9 改造，$argument 出现 4 次），
它只写 10 个 accountAttributes。而 001ProMax 现役的 `Script/Spotify.Crack.Dev.js`
（2026-07-26 重构，commit 2e3eb28d）写了 36 个 —— 但那份 `$argument` 出现 0 次，
两个开关形同虚设。

真机抓包（2026-09-30 19:33 HAR，601 条）实测：交付给 App 的响应里
catalogue=free / audio-quality=0 / high-bitrate=false / smart-shuffle=UNAVAILABLE /
mixing-tools=VIEW / offline-backup=DISABLED / subscription-enddate 缺失 ……
即「去广告」有效，「解锁」维度基本没生效。

本脚本的取舍：取 crack-dev 的属性表（36 个）+ kelee 独有的 2 个
（publish-playlist、financial-product），protobuf 编解码与开关逻辑一行不动。

用法
----
    python3 patch/merge-crack-dev.py            # 原地改写 src/spotify.response.js
    python3 patch/merge-crack-dev.py --check     # 只检查是否已是新版，退出码 1 = 需要跑

幂等：已打过补丁的文件不会被二次改写。
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, '..', 'src', 'spotify.response.js')

# ── 旧属性表（kelee 原版，10 个）────────────────────────────────────────────
OLD = ('{ads:{boolValue:!1},"com.spotify.madprops.use.ucs.product.state":{boolValue:!0},'
       '"nft-disabled":{stringValue:"1"},offline:{boolValue:!0},'
       '"player-license":{stringValue:"premium"},"streaming-rules":{stringValue:""},'
       'type:{stringValue:"premium"},"publish-playlist":{boolValue:!1},'
       'name:{stringValue:"Spotify Premium"},"financial-product":{stringValue:"pr:premium,tc:0"}}')

# ── 新属性表 ────────────────────────────────────────────────────────────────
# 顺序逐条抄自 001ProMax/Surge Script/Spotify.Crack.Dev.js 的 A() 函数。
# w = subscription-enddate / product-expiry 的动态值（当前时间 +1 个月，沿用上游语义）。
NEW = ('{"subscription-enddate":{stringValue:w},"product-expiry":{stringValue:w},'
       '"smart-shuffle":{stringValue:"AVAILABLE"},"is-euterpe":{boolValue:!0},'
       '"has-audiobooks-subscription":{boolValue:!0},type:{stringValue:"premium"},'
       '"payments-initial-campaign":{stringValue:"prepaid"},'
       '"social-session-free-tier":{boolValue:!1},can_use_superbird:{boolValue:!0},'
       '"jam-social-session":{stringValue:"EXPANDED"},offline:{boolValue:!0},'
       '"audio-quality":{stringValue:"1"},"shuffle-algorithm":{stringValue:"RANDOM"},'
       '"is-thalia":{boolValue:!0},shuffle:{boolValue:!1},"is-pigeon":{boolValue:!0},'
       '"nft-disabled":{stringValue:"1"},libspotify:{boolValue:!0},'
       '"high-bitrate":{boolValue:!0},unrestricted:{boolValue:!0},'
       'catalogue:{stringValue:"premium"},"your-library-tags":{boolValue:!0},'
       'ads:{boolValue:!1},"on-demand":{boolValue:!0},name:{stringValue:"Spotify Premium"},'
       '"loudness-levels":{stringValue:"1:-5.0,0.0,3.0:-2.0"},'
       '"social-session":{boolValue:!0},"pick-and-shuffle":{boolValue:!1},'
       '"offline-backup":{stringValue:"UNRESTRICTED"},"lyrics-offline":{boolValue:!0},'
       '"streaming-rules":{stringValue:""},"mixing-tools":{stringValue:"EDIT"},'
       'mobile:{boolValue:!0},"player-license":{stringValue:"premium"},'
       '"com.spotify.madprops.use.ucs.product.state":{boolValue:!0},'
       '"com.spotify.madprops.delivered.by.ucs":{boolValue:!0},'
       # kelee 独有，crack-dev 没写，保留
       '"publish-playlist":{boolValue:!1},"financial-product":{stringValue:"pr:premium,tc:0"}}')

# 函数头：插入到期日计算。变量名 r / w 刻意避开 A() 内已有的 e t i l
OLD_HEAD = 'function A(e,t){for(let i of('
NEW_HEAD = ('function A(e,t){let r=new Date;r.setMonth(r.getMonth()+1);'
            'let w=r.toISOString().split(".")[0]+"Z";for(let i of(')


def main():
    check = '--check' in sys.argv
    p = os.path.abspath(TARGET)
    if not os.path.exists(p):
        print('找不到 %s' % p)
        return 2
    s = open(p, encoding='utf-8').read()

    if NEW_HEAD in s and NEW in s:
        print('已是新版（属性表 38 条 + 到期日计算），无需改动')
        return 0 if check else 0

    if OLD_HEAD not in s:
        print('锚点 function A(e,t){for(let i of( 未找到 —— 上游结构可能变了，'
              '不要盲改，请人工核对 src/spotify.response.js')
        return 2
    if OLD not in s:
        print('锚点旧属性表（10 条）未找到 —— 可能已被手工改过，请人工核对')
        return 2

    if check:
        print('需要跑：src/spotify.response.js 仍是 kelee 原版（10 条属性）')
        return 1

    out = s.replace(OLD_HEAD, NEW_HEAD, 1).replace(OLD, NEW, 1)
    assert out != s
    open(p, 'w', encoding='utf-8').write(out)

    n_new = out.count('boolValue') + out.count('stringValue')
    print('已改写 %s' % p)
    print('  函数头插入到期日计算：+1 个月（沿用 crack-dev 语义）')
    print('  属性表 10 → 38（crack-dev 36 + kelee 独有 2）')
    # 用字节数而非字符数 —— 文件里有 5 个 U+FFFD（UTF-8 三字节），两者不等
    print('  文件大小 %d → %d B' % (os.path.getsize(p) - (len(out) - len(s)), os.path.getsize(p)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
