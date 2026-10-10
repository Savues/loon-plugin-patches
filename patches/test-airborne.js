// test-airborne.js —— 对打好的产物跑一遍关键逻辑，不联网
// 用法: node patches/test-airborne.js plugins/Bilibili-Airborne/bilibili.airborne.js
const fs = require('fs');

const file = process.argv[2] || 'plugins/Bilibili-Airborne/bilibili.airborne.js';
const src = fs.readFileSync(file, 'utf8');
const a = src.indexOf('/* ==== Savues');
const b = src.indexOf('var C=');
if (a < 0 || b < 0) { console.error('::error::没找到注入的工具代码，补丁可能没打上'); process.exit(1); }
globalThis.nn = (segs) => segs.map(() => ({ ctime: '1735660800', dmFrom: 1 }));  // nn 的桩
eval(src.slice(a, b));   // 注入的 __air* 全部进作用域

let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  期望 ${JSON.stringify(want)} 实际 ${JSON.stringify(got)}`}`);
};
const ok = (arg, t, c, d, vd) => __airOK(arg, t, c, d, vd);

// 类别解析
eq('默认自动跳类别', __airCats({}, 0), ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'padding']);
eq('默认只提醒类别=其余全部', __airCats({}, 1), ['exclusive_access', 'poi_highlight', 'preview', 'filler', 'music_offtopic']);
eq('两档并集正好是全部 11 类', __airAny({}).sort(),
   ['exclusive_access','filler','interaction','intro','music_offtopic','outro','padding','poi_highlight','preview','selfpromo','sponsor'].sort());
eq('两档没有重叠', __airAny({}).length, 11);
eq('off 关闭', __airCats({ airCategories: 'off' }, 0), []);
eq('关档写法大小写不敏感（OFF/None/no/0）',
   ['OFF', 'None', 'no', '0'].map(v => __airCats({ airCategories: v }, 0).length), [0, 0, 0, 0]);
eq('类别大小写不敏感：填 Sponsor 也能命中',
   ok({ airCategories: 'Sponsor' }, 'skip', 'sponsor', 60), true);
eq('动作大小写不敏感：填 FULL 也能命中',
   ok({ airCategories: 'sponsor,exclusive_access', airActions: 'FULL' }, 'full', 'exclusive_access', 0, 191), true);
eq('查询串一律发小写（bsbsb 的 id 就是小写）',
   decodeURIComponent(__airQS({ airCategories: 'Sponsor,Intro', airNoticeCategories: 'off' })),
   'categories=["sponsor","intro"]');
eq('参数名大小写容错', __airCats({ AirCategories: 'intro' }, 0), ['intro']);
eq('逗号+空格+中文逗号', __airCats({ airCategories: 'sponsor, intro，outro' }), ['sponsor', 'intro', 'outro']);
eq('查询串覆盖全部 11 类', JSON.parse(decodeURIComponent(__airQS({}).slice('categories='.length))).length, 11);
eq('查询串只发自定义并集', decodeURIComponent(__airQS({ airCategories: 'intro', airNoticeCategories: 'outro' })), 'categories=["intro","outro"]');

// ---- 汇总锚点：用户实测「开头有自动跳就看不到片头汇总」----
const land = (segs, a) => __airLand(Object.assign({ airMode: 'jump' }, a), segs);
// 真实案例 BV1PyHi6vEpA：bsbsb 返回 intro[0,32.005]，自动跳在第 2 秒 seek 到 32 秒，
// 汇总若钉在第 3 秒就落在被跳过的 29 秒里（用户 HAR 实测：注入的汇总 progress=3000）
eq('真实案例：落点 = 片段终点 32.005', land([[0, 32.005, 'intro', 'skip', 1784, 1]]), 32.005);
eq('开头没有片段 → 落点 0（行为与以前完全一致）',
   land([[600, 640, 'sponsor', 'skip', 1784, 1]]), 0);
eq('连锁：落在 10s 时 [12,20] 仍会在 14s 拽走，要跟到 20',
   land([[0, 10, 'intro', 'skip', 600, 1], [12, 20, 'sponsor', 'skip', 600, 1]]), 20);
eq('相距太远的片段不跟（[60,70] 不会影响 10s 的落点）',
   land([[0, 10, 'intro', 'skip', 600, 1], [60, 70, 'sponsor', 'skip', 600, 1]]), 10);
eq('重叠片段不会死循环', land([[0, 50, 'intro', 'skip', 600, 1],
                              [10, 30, 'sponsor', 'skip', 600, 1],
                              [20, 90, 'outro', 'skip', 600, 1]]), 90);
eq('只提醒档不触发 seek，落点仍是 0', land([[0, 30, 'intro', 'skip', 600, 0]]), 0);
eq('airMode=mark 全局不跳 → 落点 0', land([[0, 32.005, 'intro', 'skip', 1784, 1]], { airMode: 'mark' }), 0);
eq('整篇即同类 + 开空降 → 落点 = 片长',
   land([[0, 0, 'sponsor', 'full', 100, 1]], { airFullMode: 'jump' }), 100);
// seg[5] 在生产里是 __airIsAuto() 推导出来的（见 tn()），夹具也走同一条路，
// 否则手写 seg[5]=1 却传 airFullMode=notice 是自相矛盾的输入
const seg5 = (a, t, r) => (__airIsAuto(a, t, r) ? 1 : 0);
eq('整篇 notice（不跳）→ 落点 0',
   land([[0, 0, 'sponsor', 'full', 100, seg5({ airFullMode: 'notice' }, 'full', 'sponsor')]],
        { airFullMode: 'notice' }), 0);
eq('落点越过片尾 → 汇总不注入',
   __airLandPast({ airMode: 'jump', airFullMode: 'jump' }, [[0, 0, 'sponsor', 'full', 100, 1]]), true);
eq('正常情况不算越过片尾',
   __airLandPast({ airMode: 'jump' }, [[0, 32.005, 'intro', 'skip', 1784, 1]]), false);

// 过滤：类别 / 动作 / 时长
eq('sponsor+skip+42.9s 自动档通过', ok({}, 'skip', 'sponsor', 42.9), true);
eq('intro 现在默认就在自动档', ok({}, 'skip', 'intro', 42.9), true);
eq('padding 默认也在自动档', ok({}, 'skip', 'padding', 42.9), true);
eq('selfpromo 现在默认在自动档', ok({}, 'skip', 'selfpromo', 24), true);
eq('interaction 现在默认在自动档', ok({}, 'skip', 'interaction', 20), true);
eq('filler 现在在只提醒档', ok({}, 'skip', 'filler', 40), true);
eq('exclusive_access 现在在只提醒档', ok({}, 'full', 'exclusive_access', 0, 890), true);
eq('mute 默认被拒', ok({}, 'mute', 'sponsor', 60), false);
eq('提醒档不受动作白名单约束', ok({ airNoticeCategories: 'interaction' }, 'skip', 'interaction', 20), true);
eq('提醒档也要过最小时长', ok({ airNoticeCategories: 'interaction' }, 'skip', 'interaction', 3), false);

eq('7.9s 被时长滤掉', ok({}, 'skip', 'sponsor', 7.9), false);
eq('时长可调到 3s', ok({ airMinDuration: 3 }, 'skip', 'sponsor', 2.9), false);
eq('时长 0 = 不限', ok({ airMinDuration: 0 }, 'skip', 'sponsor', 0.1), true);
eq('类别关掉后全拒', ok({ airCategories: 'off', airNoticeCategories: 'off' }, 'skip', 'sponsor', 60), false);

// 文案占位符
const seg = [75.073, 113.139, 'sponsor', 'skip', 161, 1];
eq('默认文案（自动档）', __airText({}, seg), '空指部已就位');
eq('默认文案（提醒档）', __airText({}, [0, 42.9, 'interaction', 'skip', 300, 0]), '⚠️ 三连提醒 00:00→00:42');
eq('提醒档需显式开启才走 mark', __airAction({ airNoticeCategories: 'interaction' }, [0, 42.9, 'interaction', 'skip', 300, 0], 42900), '');
eq('{cat} 渲染成中文名', __airText({ airInfo: '{cat}' }, [0, 42.9, 'selfpromo', 'skip', 300, 0]), '自我推广');
eq('interaction→三连提醒 / intro→开场动画 / preview→往期回顾',
  [__airText({airInfo:'{cat}'},[0,42.9,'interaction','skip',300,0]),
   __airText({airInfo:'{cat}'},[0,42.9,'intro','skip',300,0]),
   __airText({airInfo:'{cat}'},[0,42.9,'preview','skip',300,0])].join('/'),
  '三连提醒/开场动画/往期回顾');
eq('{catid} 拿到原始 id', __airText({ airInfo: '{catid}' }, [0, 42.9, 'selfpromo', 'skip', 300, 0]), 'selfpromo');
eq('未知类别原样输出', __airText({ airInfo: '{cat}' }, [0, 42.9, 'brand_new', 'skip', 300, 0]), 'brand_new');
eq('提醒档文案可自定义', __airText({ airInfo: '{cat}@{start}' }, [0, 42.9, 'interaction', 'skip', 300, 0]), '三连提醒@00:00');
eq('占位符', __airText({ airNotice: '跳过{cat} {start}→{end} 省{dur}s' }, seg), '跳过恰饭内容 01:15→01:53 省38s');
eq('自定义文案', __airText({ airNotice: 'AD' }, seg), 'AD');

// 动作
eq('jump 模式（自动档）', __airAction({ airMode: 'jump' }, seg, 113139), 'airborne:113139');
eq('mark 模式不跳', __airAction({ airMode: 'mark' }, seg, 113139), '');
eq('提醒档永远不带动作', __airAction({ airMode: 'jump' }, [0, 42.9, 'selfpromo', 'skip', 300, 0], 113139), '');

// full / poi：片段长度天然为 0，不能被最小时长误杀
const full = [0, 0, 'exclusive_access', 'full', 1016.469, 1];
const poi = [183, 183, 'poi_highlight', 'poi', 876.113, 1];
eq('full 默认是 notice（放行）', ok({}, 'full', 'exclusive_access', 0, 1016.469), true);
eq('full 的 off 档不处理', ok({ airFullMode: 'off' }, 'full', 'exclusive_access', 0, 1016), false);
eq('full 缺总时长不放行（任何档位）', ok({}, 'full', 'sponsor', 0, 0), false);
eq('full 不受动作白名单约束', ok({ airActions: 'skip' }, 'full', 'sponsor', 0, 191), true);
eq('full 不受类别列表约束', ok({ airCategories: 'off', airNoticeCategories: 'off' }, 'full', 'exclusive_access', 0, 890), true);

eq('full 默认 notice → 不带动作', __airIsAuto({}, 'full', 'exclusive_access'), false);
eq('full jump 档 → 带动作', __airIsAuto({ airFullMode: 'jump' }, 'full', 'exclusive_access'), true);
eq('full off 档 → 不带动作（但已被过滤）', __airIsAuto({ airFullMode: 'off' }, 'full', 'sponsor'), false);
eq('普通段仍按类别列表决定', __airIsAuto({}, 'skip', 'sponsor'), true);
eq('普通段在只提醒档不带动作', __airIsAuto({ airNoticeCategories: 'sponsor' }, 'skip', 'sponsor'), false);

eq('full 跳到整段末尾', __airEnd(full), 1016.469);
eq('full 提醒文案含全片时长', __airText({ airInfo: '{cat} 全长{end}' }, [0, 0, 'sponsor', 'full', 1016.469, 0]), '恰饭内容 全长16:56');
eq('full 提醒出现在第 2 秒', __airText({ airInfo: '{start}' }, [0, 0, 'sponsor', 'full', 191, 0]), '00:00');
eq('poi 加进自动档后通过（不受 8s 影响）', ok({ airCategories: 'poi_highlight', airActions: 'poi' }, 'poi', 'poi_highlight', 0, 876), true);
eq('poi 落点就是那个时间点', __airEnd(poi), 183);
eq('skip 仍受 8s 约束', ok({ airActions: 'skip,full' }, 'skip', 'sponsor', 5, 300), false);
eq('full 的文案 end 是片尾', __airText({ airNotice: '{start}→{end} 省{dur}s' }, full), '00:00→16:56 省1016s');
eq('full 的 {cat} 是独家体验', __airText({ airNotice: '{cat}' }, full), '独家体验');

// 幂等守卫：同一个响应注入两次，只应有一条
const elems = [];
__airInject(elems, [seg], {});
const once = elems.length;
__airInject(elems, [seg], {});
eq('重复注入不再增加（幂等）', elems.length, once);
eq('空片段不注入', (() => { const e = []; __airInject(e, [], {}); return e.length; })(), 0);

// ---- 汇总按类别折叠（用户实测：BV1VeHQ6tEaS 两段恰饭，原先显示两行「恰饭内容」）----
// 数据直接取自该 HAR：sponsor [2095.833,2111.833] 与 [3151.633,3160.366]
const G = (segs) => __airGroups(segs).map(x => x.text);
eq('同类折叠成一行：只列起点 + 总时长',
   G([[2095.833, 2111.833, 'sponsor', 'skip', 3465.633, 1],
      [3151.633, 3160.366, 'sponsor', 'skip', 3465.633, 1]]),
   ['恰饭内容 ×2 · 34:55、52:31（共25s）']);
eq('单段保持完整区间不变',
   G([[2095.833, 2111.833, 'sponsor', 'skip', 3465.633, 1]]),
   ['恰饭内容 · 34:55–35:11']);
eq('起点最多列 2 个，超出用 …（共XXs 仍算全部段）',
   G([[10, 20, 'sponsor', 'skip', 600, 1], [30, 40, 'sponsor', 'skip', 600, 1],
      [50, 60, 'sponsor', 'skip', 600, 1], [70, 80, 'sponsor', 'skip', 600, 1]]),
   ['恰饭内容 ×4 · 00:10、00:30…（共40s）']);
eq('单段不写 ×1',
   G([[150, 166, 'intro', 'skip', 600, 1]]), ['开场动画 · 02:30–02:46']);
eq('不同类各占一行，顺序按片段出现顺序',
   G([[150, 200, 'sponsor', 'skip', 600, 1], [0, 32, 'intro', 'skip', 600, 1],
      [300, 330, 'filler', 'skip', 600, 0]]),
   ['恰饭内容 · 02:30–03:20', '开场动画 · 00:00–00:32', '离题闲聊 · 05:00–05:30']);
eq('整篇恰饭不参与折叠（由汇总的独立置顶行表达）',
   G([[0, 0, 'sponsor', 'full', 600, 0], [200, 230, 'sponsor', 'skip', 600, 1]]),
   ['恰饭内容 · 03:20–03:50']);
eq('整篇独家保持老文案「XX 整篇」',
   G([[300, 330, 'exclusive_access', 'full', 600, 0]]), ['独家体验 整篇']);
eq('混进整篇标记时退回列区间（整篇算不进总时长）',
   G([[10, 20, 'exclusive_access', 'skip', 600, 1], [30, 40, 'exclusive_access', 'skip', 600, 1],
      [0, 0, 'exclusive_access', 'full', 600, 0]]),
   ['独家体验 ×3 · 00:10–00:20、00:30–00:40、整篇']);
// 🔴 回归：顶部弹幕(mode 5 / 字号 50)在竖屏手机上只放得下约 32~40 显示列。
// 逐段列完整区间时三段同类就到 53 列必然被 App 截断，所以这里把宽度本身钉成断言。
eq('无论多少段，汇总一行的显示列都不超过 40',
   [1, 2, 3, 4, 8, 20].every(n =>
     __airGroups(Array.from({ length: n }, (_, i) => [i * 600, i * 600 + 8.7, 'sponsor', 'skip', 9000, 1]))
       .every(g => [...g.text].reduce((k, c) => k + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0) <= 40)),
   true);

// ---- 时间格式：超过 1 小时 ----
eq('1 小时以内仍是 mm:ss', __airFmt(2095.833), '34:55');
eq('正好 1 小时补上小时段', __airFmt(3600), '1:00:00');
eq('两小时', __airFmt(7200), '2:00:00');
eq('两小时零一分', __airFmt(7260), '2:01:00');
eq('负数归零', __airFmt(-5), '00:00');

console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);
