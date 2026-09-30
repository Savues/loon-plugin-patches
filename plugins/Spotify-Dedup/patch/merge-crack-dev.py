#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""merge-crack-dev.py —— 把 001ProMax 现役脚本的账号属性并进本仓库托管的 kelee 版脚本，
同时保留 kelee 版的 $argument 开关机制。

背景
----
仓库里托管的是 kelee 托管版（基于 001ProMax/Surge 8986b9b9 改造，$argument 出现 4 次），
它只写 10 个 accountAttributes。001ProMax 现役的 `Script/Spotify.Crack.Dev.js`
（2026-07-26 重构，commit 2e3eb28d）写 36 个 —— 但那份 `$argument` 出现 0 次，
两个开关形同虚设。

v1.2 曾把这 36 项全部并入。**v1.4 起删掉其中 3 项**，理由见下。

删掉的 3 项：high-bitrate / libspotify / audio-quality
---------------------------------------------------------------
2026-09-30 的对照实验（用户关脚本 → 重新登录 → 音质改回默认 → 开脚本 → 重新登录，
抓包 1141 条）暴露了服务端对**免费账号**真实下发的值：

    high-bitrate = false    libspotify = false    audio-quality = "0"

而 v1.2 写的是 high-bitrate=true / libspotify=true / audio-quality="1"。
后果是客户端以为有无损权限，去请求 storage-resolve 的 interactive/2 档
（24-bit 无损），而服务端在 playplay/v1/key/ 阶段直接 **403**：

    storage-resolve 档位   playplay 结果
    interactive/0         200 x 12
    interactive/1         200 x 12
    interactive/2         403 x 7   <- 全部

客户端拿不到播放密钥 => **拖动进度条后自动跳下一首 + 部分歌曲无法播放**。
（客户端随后 5 次 CDN 请求全是 RST:8 CANCEL、time 仅 2-68 ms —— 是它自己放弃的，
不是网络或 CDN 拒绝。）

**这三个是「假权限」**：服务端根本没给，写 true 只是骗客户端去要它不会给的东西。
Amlabort 版同样没写它们。代价是失去音质相关的「解锁」—— 而那本来就是拿不到的。

用法
----
    python3 patch/merge-crack-dev.py            # 原地改写 src/spotify.response.js
    python3 patch/merge-crack-dev.py --check     # 只检查是否已是目标版本，退出码 1 = 需要跑

幂等：已打过补丁的文件不会被二次改写。改属性表后要先把 src/ 恢复成 kelee 原版
（git show a2a0865:plugins/Spotify-Dedup/src/spotify.response.js）再跑本脚本。
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

# ── 目标属性表（crack-dev 36 项 − 3 项假权限 + kelee 独有 2 项 = 35）────────
# 顺序逐条抄自 001ProMax/Surge Script/Spotify.Crack.Dev.js 的 A() 函数。
# w = subscription-enddate / product-expiry 的动态值（当前时间 +1 个月，沿用上游语义）。
#
# 三处刻意留空，不要加回来（加回来会导致部分歌曲无法播放）：
#     "high-bitrate":{boolValue:!0}      -> 服务端给 false
#     "libspotify":{boolValue:!0}        -> 服务端给 false
#     "audio-quality":{stringValue:"1"}  -> 服务端给 "0"
# 见本文件顶部说明。
NEW = ('{"subscription-enddate":{stringValue:w},"product-expiry":{stringValue:w},'
       '"smart-shuffle":{stringValue:"AVAILABLE"},"is-euterpe":{boolValue:!0},'
       '"has-audiobooks-subscription":{boolValue:!0},type:{stringValue:"premium"},'
       '"payments-initial-campaign":{stringValue:"prepaid"},'
       '"social-session-free-tier":{boolValue:!1},can_use_superbird:{boolValue:!0},'
       '"jam-social-session":{stringValue:"EXPANDED"},offline:{boolValue:!0},'
       # audio-quality 在此 —— 不写，见顶部说明
       '"shuffle-algorithm":{stringValue:"RANDOM"},'
       '"is-thalia":{boolValue:!0},shuffle:{boolValue:!1},"is-pigeon":{boolValue:!0},'
       '"nft-disabled":{stringValue:"1"},'
       # libspotify 在此 —— 不写，见顶部说明
       # high-bitrate 在此 —— 不写，见顶部说明
       'unrestricted:{boolValue:!0},'
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

# 绝不能出现的假权限（防以后有人照抄 crack-dev 加回来）
FORBIDDEN = ['high-bitrate', 'libspotify', 'audio-quality']


def main():
    check = '--check' in sys.argv
    p = os.path.abspath(TARGET)
    if not os.path.exists(p):
        print('找不到 %s' % p)
        return 2
    s = open(p, encoding='utf-8').read()

    if NEW_HEAD in s and NEW in s:
        print('已是目标版本（35 项属性，已剔除 high-bitrate/libspotify/audio-quality）')
        return 0

    if OLD_HEAD not in s:
        print('锚点 function A(e,t){for(let i of( 未找到 —— 上游结构可能变了，'
              '不要盲改，请人工核对 src/spotify.response.js')
        return 2
    if OLD not in s:
        print('锚点旧属性表（kelee 原版 10 条）未找到。\n'
              '  src/ 若是上一版产物，先恢复 kelee 原版再跑：\n'
              '    git show a2a0865:plugins/Spotify-Dedup/src/spotify.response.js '
              '> src/spotify.response.js')
        return 2

    if check:
        print('需要跑：src/spotify.response.js 仍是 kelee 原版（10 条属性）')
        return 1

    out = s.replace(OLD_HEAD, NEW_HEAD, 1).replace(OLD, NEW, 1)
    assert out != s
    open(p, 'w', encoding='utf-8').write(out)

    # 自检：产物里绝不能出现那三个假权限
    for f in FORBIDDEN:
        assert f not in out, '致命：产物里仍有 %s' % f
    n = out.count('boolValue') + out.count('stringValue') + out.count('longValue')
    print('已改写 %s' % p)
    print('  函数头插入到期日计算：+1 个月（沿用 crack-dev 语义）')
    print('  属性表 10 -> 35（crack-dev 36 - 3 项假权限 + kelee 独有 2）')
    print('  已剔除 high-bitrate / libspotify / audio-quality（服务端不认的假权限）')
    # 用字节数而非字符数 —— 文件里有 5 个 U+FFFD（UTF-8 三字节），两者不等
    print('  文件大小 %d B，共 %d 处值写入' % (os.path.getsize(p), n))
    return 0


if __name__ == '__main__':
    sys.exit(main())
