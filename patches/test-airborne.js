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
eq('默认类别', __airCats({}), ['sponsor']);
eq('逗号+空格+中文逗号', __airCats({ airCategories: 'sponsor, intro，outro' }), ['sponsor', 'intro', 'outro']);
eq('off 关闭', __airCats({ airCategories: 'off' }), []);
eq('参数名大小写容错', __airCats({ AirCategories: 'intro' }), ['intro']);
eq('查询串', decodeURIComponent(__airQS({ airCategories: 'sponsor,intro' })), 'categories=["sponsor","intro"]');

// 过滤：类别 / 动作 / 时长
eq('sponsor+skip+42.9s 通过', ok({}, 'skip', 'sponsor', 42.9), true);
eq('intro 不在默认白名单', ok({}, 'skip', 'intro', 42.9), false);
eq('加上 intro 后通过', ok({ airCategories: 'sponsor,intro' }, 'skip', 'intro', 42.9), true);
eq('mute 默认被拒', ok({}, 'mute', 'sponsor', 60), false);
eq('加 full 后：有总时长才通过', ok({ airActions: 'skip,full' }, 'full', 'sponsor', 0, 60), true);
eq('加 full 后：无总时长仍拒', ok({ airActions: 'skip,full' }, 'full', 'sponsor', 0, 0), false);
eq('7.9s 被时长滤掉', ok({}, 'skip', 'sponsor', 7.9), false);
eq('时长可调到 3s', ok({ airMinDuration: 3 }, 'skip', 'sponsor', 2.9), false);
eq('时长 0 = 不限', ok({ airMinDuration: 0 }, 'skip', 'sponsor', 0.1), true);
eq('类别关掉后全拒', ok({ airCategories: 'off' }, 'skip', 'sponsor', 60), false);

// 文案占位符
const seg = [75.073, 113.139, 'sponsor'];
eq('默认文案', __airText({}, seg), '空指部已就位');
eq('占位符', __airText({ airNotice: '跳过{cat} {start}→{end} 省{dur}s' }, seg), '跳过sponsor 01:15→01:53 省38s');
eq('自定义文案', __airText({ airNotice: 'AD' }, seg), 'AD');

// 动作
eq('jump 模式', __airAction({ airMode: 'jump' }, 113139), 'airborne:113139');
eq('mark 模式不跳', __airAction({ airMode: 'mark' }, 113139), '');

// full / poi：片段长度天然为 0，不能被最小时长误杀
const full = [0, 0, 'exclusive_access', 'full', 1016.469];
const poi = [183, 183, 'poi_highlight', 'poi', 876.113];
eq('full 默认动作白名单下被拒', ok({}, 'full', 'exclusive_access', 0, 1016.469), false);
eq('full 加进白名单后通过', ok({ airCategories: 'exclusive_access', airActions: 'skip,full' }, 'full', 'exclusive_access', 0, 1016.469), true);
eq('full 缺总时长则不放行', ok({ airCategories: 'exclusive_access', airActions: 'full' }, 'full', 'exclusive_access', 0, 0), false);
eq('full 跳到整段末尾', __airEnd(full), 1016.469);
eq('poi 加进白名单后通过（不受 8s 影响）', ok({ airCategories: 'poi_highlight', airActions: 'poi' }, 'poi', 'poi_highlight', 0, 876), true);
eq('poi 落点就是那个时间点', __airEnd(poi), 183);
eq('skip 仍受 8s 约束', ok({ airActions: 'skip,full' }, 'skip', 'sponsor', 5, 300), false);
eq('full 的文案 end 是片尾', __airText({ airNotice: '{start}→{end} 省{dur}s' }, full), '00:00→16:56 省1016s');

// 幂等守卫：同一个响应注入两次，只应有一条
const elems = [];
__airInject(elems, [seg], {});
__airInject(elems, [seg], {});
eq('重复注入只留一条', elems.length, 1);
eq('空片段不注入', (() => { const e = []; __airInject(e, [], {}); return e.length; })(), 0);

console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);