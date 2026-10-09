#!/usr/bin/env python3
"""
patch-airborne.py —— 把 kokoryh 空降助手改成「类别 / 动作 / 时长 / 文案」可配置

为什么需要
----------
bsbsb.top（浏览器扩展 hanydd/BilibiliSponsorBlock 的服务端）的片段类别有 11 种，
但 Loon 侧只有 kokoryh/Sparkle 的 dist/bilibili.protobuf.request.js 能用，
而它把查询类别**硬编码**在脚本里：

    src/service/sponsor-block.service.ts
      url: `https://bsbsb.top/api/skipSegments?videoID=..&cid=..&category=sponsor`
      过滤: actionType === "skip" && (end - start) >= 8

清单层（.lpx）只能传 argument，改不了上面这两处，所以「让用户自己选类别」
只能改脚本。本补丁器改的是**构建产物**，不是手改：

  1. 上游 dist 每 6 小时被重新拉取
  2. 按下面 8 处锚点做精确替换（任一锚点找不到 / 出现多次 → 直接报错，不产出坏文件）
  3. 产物提交进仓库，插件引用本仓库 raw 地址

上游一旦改了这些代码，Actions 会失败并提示需要更新锚点——这是刻意的：
宁可同步失败，也不要静默生成一个「用户改了参数却没生效」的脚本。

默认值只写在注入的工具函数里（__airVal），不去改上游的默认值对象，
避免同一个默认值存在两处、日后改漏一处。

与其它插件共存
--------------
注入的弹幕带一个固定签名（ctime=1735660800 & dmFrom=1）。补丁加了幂等守卫：
同一个响应里已有本脚本注入的弹幕就不再注入，所以与 Bilibili-Dedup 的
`空降助手` 同时开启也不会跳两次（但两边类别设置各管各的，见插件 README）。

用法
----
    python3 patch-airborne.py                       # 拉上游并打补丁
    python3 patch-airborne.py src.js -o out.js      # 对已下载文件打补丁
    python3 patch-airborne.py --dry-run -o /dev/null
"""
import argparse, pathlib, re, subprocess, sys

UPSTREAMS = [
    'https://raw.githubusercontent.com/kokoryh/Sparkle/refs/heads/master/dist/bilibili.protobuf.request.js',
    'https://raw.githubusercontent.com/kokoryh/Sparkle/master/dist/bilibili.protobuf.request.js',
]
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'

# ---- 注入到脚本头部的小工具 ----------------------------------------------------
# 名字全部带 __air 前缀，避免与上游压缩后的单字母变量冲突。
HELPERS = r'''
/* ==== Savues/loon-plugin-patches · 空降助手可配置补丁 ==== */
var __airVal = (a, k, d) => {
    if (!a) return d;
    var v = a[k];
    if (v == null || v === "") {          // 容错：参数名首字母大小写不一致时也能认
        for (var key in a) { if (key.toLowerCase() === k.toLowerCase()) { v = a[key]; break; } }
    }
    return (v == null || v === "") ? d : v;
};
var __airSplit = v => String(v).split(/[,，、\s]+/).filter(Boolean);
/** __airCats(a,0)=自动跳列表（airCategories）；__airCats(a,1)=只提醒列表（airNoticeCategories） */
var __airCats = function (a, which) {
    var v = which === 1
        ? __airVal(a, "airNoticeCategories", "exclusive_access,poi_highlight,preview,filler,music_offtopic")
        : __airVal(a, "airCategories", "sponsor,selfpromo,interaction,intro,outro,padding");
    // 关掉这一档的写法：off / none / no / 0 / 空（大小写不敏感，填 "OFF" 也认）
    return __airSplit(v).map(function (x) { return x.toLowerCase(); })
        .filter(function (x) { return x && x !== "off" && x !== "none" && x !== "no" && x !== "0"; });
};
var __airAny = function (a) {
    return __airCats(a, 0).concat(__airCats(a, 1)).filter(function (x, i, s) { return s.indexOf(x) === i; });
};
var __airQS = a => "categories=" + encodeURIComponent(JSON.stringify(__airAny(a)));
function __airOK(a, t, r, n, d) {
    // 整篇即此类（segment 是 [0,0]，全靠 videoDuration 定位）：独立于类别列表，由 airFullMode 决定
    if (t === "full") {
        var fm = String(__airVal(a, "airFullMode", "notice"));
        return fm !== "off" && Number(d) > 0;
    }
    r = String(r).toLowerCase();          // 与 __airCats 的归一化保持一致
    t = String(t).toLowerCase();
    var auto = __airCats(a, 0).indexOf(r) >= 0;   // 自动跳列表
    var info = __airCats(a, 1).indexOf(r) >= 0;   // 只提醒列表
    if (!auto && !info) return false;                      // 两个列表都没收录
    if (info) {                                             // 只提醒档：不跳，动作对它没有意义
        if (t === "skip" && n < Number(__airVal(a, "airMinDuration", 8))) return false;
        return true;
    }
    if (__airSplit(__airVal(a, "airActions", "skip")).map(function (x) { return x.toLowerCase(); })
        .indexOf(t) < 0) return false;
    if (t !== "skip") return true;                          // poi 等时间点：长度天然为 0
    return n >= Number(__airVal(a, "airMinDuration", 8));
}
/** 这条片段要不要带空降动作 */
function __airIsAuto(a, t, r) {
    if (t === "full") return String(__airVal(a, "airFullMode", "notice")) === "jump";
    if (__airCats(a, 1).indexOf(String(r).toLowerCase()) >= 0) return false;   // 提醒档优先：同一类在两档时以提醒为准
    return __airCats(a, 0).indexOf(String(r).toLowerCase()) >= 0;
}
function __airEnd(seg) {   // 空降目标（秒）
    return seg[3] === "full" ? Number(seg[4]) : seg[1];
}
var __airColors = {
    sponsor: 0xFF5C5C, selfpromo: 0xFFB400, interaction: 0x5CC8FF, intro: 0xB4B4B4,
    outro: 0xB4B4B4, exclusive_access: 0xC08CFF, poi_highlight: 0xFFD100, preview: 0xFF8FC7,
    filler: 0x6EE7C8, padding: 0x8C8C8C, music_offtopic: 0x9BE15D
};
var AIR_SUMMARY_COLOR = 0xFF5C5C;   // 片头汇总用红色
function __airColor(cat) {
    return __airColors[cat] == null ? 0xFFFFFF : __airColors[cat];
}
function __airSegText(seg) {
    var n = __airNames[seg[2]] || seg[2] || "";
    if (seg[3] === "full") return n + " 整篇";                       // 整篇即此类：没有起止时间
    return n + " " + __airFmt(seg[0]) + "–" + __airFmt(__airEnd(seg));
}
function __airFmt(t) {
    t = Math.max(0, Math.floor(t));
    var m = (t / 60) | 0, s = t % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
}
var __airNames = {
    sponsor: "恰饭硬广", selfpromo: "自我推广", exclusive_access: "独家体验",
    interaction: "三连提醒", poi_highlight: "精彩时刻", intro: "开场动画", outro: "片尾",
    preview: "往期回顾", padding: "前黑后黑", filler: "离题闲聊", music_offtopic: "非音乐片段"
};
function __airText(a, seg, list, tpl) {
    // list != null 表示这是「片头汇总」弹幕：没有单一片段，{cat}/{start}/{end}/{dur} 一律渲染为空，
    // 只保留 {list}（以及模板里本来就有的文字）。tpl 可显式指定模板。
    var sum = list != null, e = __airEnd(seg), c = seg[2] || "";
    var t = tpl != null ? tpl
            : __airVal(a, seg[5] ? "airNotice" : "airInfo",
                       seg[5] ? "空指部已就位" : "⚠️ {cat} {start}→{end}");
    var s = String(t)
        .replace(/\{list\}/g, sum ? list : "")
        .replace(/\{catid\}/g, sum ? "" : c)
        .replace(/\{cat\}/g, sum ? "" : (__airNames[c] || c))
        .replace(/\{start\}/g, sum ? "" : __airFmt(seg[0]))
        .replace(/\{end\}/g, sum ? "" : __airFmt(e))
        .replace(/\{dur\}/g, sum ? "" : Math.round(e - seg[0]));
    return sum ? s.replace(/[ \t]*→[ \t]*/g, " ").split("\n")
                    .map(function (x) { return x.trim(); }).filter(Boolean).join("\n") : s;
}
function __airAction(a, seg, l) {
    if (!seg[5]) return "";                                                    // 只提醒档：只出文字
    if (String(__airVal(a, "airMode", "jump")) === "mark") return "";          // 全局降级为只提醒
    return "airborne:" + l;
}
function __airInject(msg, segs, a) {
    var elems = Array.isArray(msg) ? msg : msg && msg.elems;   // 调用点传的是 protobuf 消息对象
    if (!elems || !segs || !segs.length) return;
    // 幂等守卫：本脚本注入的弹幕有固定签名（ctime/dmFrom），已存在就不再注入
    if (elems.some(function (x) { return x && x.ctime === "1735660800" && x.dmFrom === 1; })) return;
    var built = nn(segs, a);
    // 两档都用上游同一样式（mode 5 / 字号 50 / midHash 1948dd5d），提醒档只是不带 action。
    // ⚠️ 曾把提醒档降级成普通滚动弹幕，结论是错的：用户看不到的原因是
    //    App 的「弹幕显示区域」设得太小把顶部裁掉了，不是被 App 丢弃。
    //
    // 但「整篇软广」那条的片段起点是 0，按上游的 +2 秒就落在第 2 秒——那时人眼
    // 还没落到屏幕上。实测其它提醒（片段在视频中段）都能正常看到，只有它不行。
    // 所以提醒档统一改成「片段起点 + airInfoDelay 秒」，让两档的出现时机一致且看得见。
    var delay = Math.max(0, Number(__airVal(a, "airInfoDelay", 3))) * 1000;
    var want = String(__airVal(a, "airInfoMode", "5"));
    var donor = null;
    for (var j = 0; j < elems.length && want !== "5"; j++) {
        var e = elems[j];
        if (e && e.midHash && e.midHash !== "1948dd5d") { donor = [e.midHash, e.attr]; break; }
    }
    for (var i = 0; i < built.length; i++) {
        if (built[i].action) continue;                       // 自动跳那条不动
        built[i].progress = Math.floor(segs[i][0] * 1000) + delay;
        built[i].mode = Number(want) || 5;
        built[i].color = __airColor(segs[i][2]);        // 按类别上色
        // 非顶部样式时不能顶着空降标志：借一条真实弹幕的 midHash/attr 更稳
        if (donor) { built[i].midHash = donor[0]; built[i].attr = donor[1]; }
    }

    // 片头汇总：把这个视频里「会被处理」的所有片段在开头依次列出来。
    // stagger=每段一条错开 4 秒（单条不会太长显示得下）；single=挤成一条；off=不列。
    var sum = String(__airVal(a, "airSummary", "single"));
    if (sum !== "off") {
        var cap = 5;                                            // 一条弹幕装不下太多，硬性截断
        var shown = segs.slice(0, cap);
        var more = segs.length > shown.length ? " 等 " + segs.length + " 处" : "";
        // 段与段之间怎么排：line=每段一行（\n），same=挤一行用 · 分隔
        var join = String(__airVal(a, "airSummaryWrap", "line")) === "same" ? " · " : "\n";
        // 整篇就是恰饭 → 置顶一行明确提示，并从条目里去掉重复的「XX 整篇」
        var hasFullAd = segs.some(function (x) { return x[2] === "sponsor" && x[3] === "full"; });
        var labels = [];
        if (hasFullAd) labels.push("全片恰饭软广");
        for (var kk = 0; kk < shown.length; kk++) {
            if (shown[kk][2] === "sponsor" && shown[kk][3] === "full") continue;
            labels.push(__airSegText(shown[kk]));
        }
        var synth, head;
        if (sum === "single") {
            // 汇总文案复用 airInfo 模板：模板里含 {list} 就用它，否则用内置文案
            var tpl = String(__airVal(a, "airInfo", "")).indexOf("{list}") >= 0
                ? String(__airVal(a, "airInfo", "")) : "⚠️本视频包含⚠️\n{list}";
            synth = [[0, 0, "", "skip", 0, 0]];
            head = nn(synth, a);
            head[0].content = __airText(a, synth[0], labels.join(join) + more, tpl);
            head[0].progress = delay;
        } else {
            synth = labels.map(function () { return [0, 0, "", "skip", 0, 0]; });
            head = nn(synth, a);
            var lbl = String(__airVal(a, "airInfo", "")).indexOf("{list}") >= 0
                ? String(__airVal(a, "airInfo", "")) : "{list}";
            for (var ki = 0; ki < head.length; ki++) {
                head[ki].content = __airText(a, synth[ki], labels[ki] + (ki === 0 ? more : ""), lbl);
                head[ki].progress = delay + ki * 4000;
            }
        }
        for (var kc = 0; kc < head.length; kc++) {
            head[kc].mode = Number(want) || 5;
            // labels[kc] 与 shown[kc] 从 kc>=1 起一一对应（kc=0 是插在最前的「全片恰饭软广」，
            // shown[0] 恰好就是那条整篇恰饭，被上面那个 continue 跳过但没从 shown 里移除）
            head[kc].color = sum === "single" || labels[kc] === "全片恰饭软广"
                ? AIR_SUMMARY_COLOR : __airColor(shown[kc][2]);
            if (donor) { head[kc].midHash = donor[0]; head[kc].attr = donor[1]; }
        }
        built = head.concat(built.filter(function (x, i) {
            return x.action || segs[i][3] !== "full";   // 整篇的独立提醒让位给汇总里那一行
        }));
    }
    elems.push.apply(elems, built);
}
'''

# ---- 锚点：每一处都必须精确命中一次 --------------------------------------------
# (名称, 原文, 替换后)
PATCHES = [
    ('查询参数',
     '`https://bsbsb.top/api/skipSegments?videoID=${e}&cid=${t}&category=sponsor`',
     '`https://bsbsb.top/api/skipSegments?videoID=${e}&cid=${t}&`+__airQS(s.argument)'),

    ('空类别短路',
     'async function en(s,e,t){try{',
     'async function en(s,e,t){if(!__airAny(s.argument).length)return[];try{'),

    ('过滤函数调用',
     'n!==200||!i||i==="[]"?[]:tn(i)',
     'n!==200||!i||i==="[]"?[]:tn(i,s.argument)'),

    ('过滤函数本体',
     'function tn(s){return JSON.parse(s).reduce((e,{actionType:t,segment:n})'
     '=>(t==="skip"&&n[1]-n[0]>=8&&e.push(n),e),[])}',
     'function tn(s,a){return JSON.parse(s).reduce((e,{actionType:t,category:r,segment:n,videoDuration:o})'
     '=>(n&&__airOK(a,t,r,n[1]-n[0],o)&&e.push([n[0],n[1],r,t,o,__airIsAuto(a,t,r)?1:0]),e),[])}'),

    ('注入入口',
     't.elems.push(...nn(s.state.segments))',
     '__airInject(t,s.state.segments,s.argument)'),

    ('弹幕构造签名',
     'function nn(s){return s.map(',
     'function nn(s,a){return s.map('),

    # 注意：上游把提示文案写成了 \uXXXX 转义序列，不是中文字面量
    ('提示文案',
     'content:"\\u7A7A\\u6307\\u90E8\\u5DF2\\u5C31\\u4F4D"',
     'content:__airText(a,t)'),

    ('空降落点',
     ',l=Math.floor(t[1]*1e3)',
     ',l=Math.floor(__airEnd(t)*1e3)'),

    ('空降动作',
     'action:`airborne:${l}`',
     'action:__airAction(a,t,l)'),
]


def fetch(url, timeout=40):
    import urllib.request
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'replace')


def download():
    err = []
    for u in UPSTREAMS:
        try:
            s = fetch(u)
            print(f'  上游 {u}')
            return s
        except Exception as e:                      # 上游换地址 / 网络抖动
            err.append(f'{u}: {e}')
    sys.exit('::error::拉取上游失败\n' + '\n'.join(err))


def patch(src):
    # 头插工具函数：插在第一行 // Built at 注释之后
    nl = src.find('\n')
    if nl < 0:
        sys.exit('::error::上游文件不像脚本（找不到换行）')
    out = src[:nl + 1] + HELPERS + src[nl + 1:]

    for name, old, new in PATCHES:
        n = out.count(old)
        if n != 1:
            sys.exit(f'::error::锚点「{name}」命中 {n} 次（应为 1 次）。'
                     f'上游结构可能已变，需要更新 patches/patch-airborne.py。\n'
                     f'         锚点原文: {old[:90]}')
        out = out.replace(old, new)
        print(f'  ✓ {name}')
    return out


def main():
    ap = argparse.ArgumentParser(description='给 Sparkle 的空降助手打可配置补丁')
    ap.add_argument('src', nargs='?', help='已下载的上游脚本；省略则联网拉取')
    ap.add_argument('-o', '--out', default='plugins/Bilibili-Airborne/bilibili.airborne.js')
    ap.add_argument('--dry-run', action='store_true', help='只做替换与校验，不写文件')
    a = ap.parse_args()

    print('读取本地文件…' if a.src else '拉取上游…')
    src = pathlib.Path(a.src).read_text(encoding='utf-8') if a.src else download()
    m = re.search(r'^// Built at: .*$', src, re.M)
    print(f'  上游构建: {m.group(0) if m else "未知"}')

    out = patch(src)
    print(f'补丁完成：{len(PATCHES)} 处锚点全部命中，注入 {len(HELPERS)} 字节工具代码')
    if a.dry_run:
        print('dry-run，未写文件')
        return
    p = pathlib.Path(a.out)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(out, encoding='utf-8')
    print(f'写入 {p}（{len(out)} 字节）')
    # 顺手做个语法体检：node 在就跑，跑不了也不阻塞
    try:
        subprocess.run(['node', '--check', str(p)], check=True,
                       capture_output=True, timeout=30)
        print('node --check 通过')
    except FileNotFoundError:
        pass
    except subprocess.CalledProcessError as e:
        sys.exit('::error::语法检查失败\n' + e.stderr.decode('utf-8', 'replace'))
    except Exception:
        pass


if __name__ == '__main__':
    main()