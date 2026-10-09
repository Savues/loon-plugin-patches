// test-airborne-proto.js —— 整份产物能否在 Loon 式全局下加载；注入的弹幕能否 protobuf 往返
const fs = require('fs');
// 可传 argv[2] 指定别的产物（变异测试用）
const ART = process.argv[2] || require('path').resolve(__dirname, '../plugins/Bilibili-Airborne/bilibili.airborne.js');
let fail = 0;
const ck = (n, c, x = '') => { console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '  → ' + x)); if (!c) fail++; };

global.$task = undefined;                       // 非 QX
global.$done = () => {};
global.$persistentStore = { read: () => null, write: () => {} };
global.$notification = { post: () => {}, read: () => null };
global.$utils = { ungzip: x => x, geturl: () => '', query: () => ({}) };
global.$argument = { airCategories: 'sponsor,intro,outro', airActions: 'skip', airMinDuration: 8, airMode: 'jump', airNotice: 'x', logLevel: 'off' };
global.$httpClient = { fetch: () => Promise.resolve({ status: 200, headers: {}, body: Buffer.alloc(0) }) };

const src = fs.readFileSync(ART, 'utf8');
let loaded = true, err = '';
// 追加一行把内部符号挂到 globalThis（bundle 里是 let/const 声明，模块作用域取不到）
const EXPORT = '\n;globalThis.__X={St:(typeof St==="undefined"?null:St),_e:(typeof _e==="undefined"?null:_e),' +
               'nn:(typeof nn==="undefined"?null:nn),inject:(typeof __airInject==="undefined"?null:__airInject),' +
  't:(typeof $t==="undefined"?null:$t)};';
try { (0, eval)(src + EXPORT); } catch (e) { loaded = false; err = e.message; }
ck('整份产物在 Loon 式全局下加载无异常', loaded, err.slice(0, 200));
if (!loaded) process.exit(1);

const {St, _e, nn, inject} = globalThis.__X;
ck('拿到了 DmSegMobile 的 protobuf 类', typeof St?.toBinary === 'function' && typeof _e?.toBinary === 'function');

const orig = _e.create({ elems: [
  { id: 111, progress: 1000, midHash: '00000000', content: '原弹幕A', mode: 1, ctime: '1700000000', dmFrom: 2 },
  { id: 222, progress: 2000, midHash: '00000000', content: '原弹幕B', mode: 1, ctime: '1700000000', dmFrom: 2 },
]});
const beforeBytes = _e.toBinary(orig);
const segs = [[0, 42.9, 'sponsor', 'skip', 377, 1], [63.5, 105.733, 'intro', 'skip', 377, 1], [63.5, 105.733, 'intro', 'skip', 377, 1]];
const arg = { airNotice: '跳过{cat} {start}→{end} 省{dur}s', airMode: 'jump' };

const injected = nn(segs, arg);
ck('nn 生成 3 条弹幕', injected.length === 3);
ck('文案模板已渲染', injected[1].content === '跳过片头 01:03→01:45 省42s', injected[1].content);

const after = _e.fromBinary(beforeBytes);
inject(after.elems, segs, Object.assign({ airSummary: 'off' }, arg));
ck('注入后 elems 从 2 条变 5 条', after.elems.length === 5, String(after.elems.length));

const rt = _e.fromBinary(_e.toBinary(after));
ck('序列化→反序列化后条数不变', rt.elems.length === after.elems.length, String(rt.elems.length));
const fake = rt.elems.filter(x => x.midHash === '1948dd5d');
ck('假弹幕往返后仍可按 midHash 认出', fake.length === 3, String(fake.length));
ck('文案往返无损', fake.some(x => x.content === '跳过恰饭 00:00→00:42 省43s'), fake.map(x=>x.content).join('|'));
ck('action 往返无损', fake.some(x => x.action === 'airborne:42900'), fake.map(x=>x.action).join('|'));
ck('progress 往返无损', fake.some(x => x.progress === 65500), fake.map(x=>x.progress).join('/'));
ck('原弹幕未被破坏', rt.elems.slice(0, 2).map(x => x.content).join(',') === '原弹幕A,原弹幕B',
   rt.elems.slice(0, 2).map(x => x.content).join(','));

const marked = _e.fromBinary(_e.toBinary(_e.create({ elems: nn(segs, { airMode: 'mark' }) })));
ck('mark 模式往返后没有 action', marked.elems.every(x => !x.action));

const again = _e.fromBinary(_e.toBinary(after));
inject(again.elems, segs, arg);
ck('往返后再注入仍是 5 条（幂等守卫在真 protobuf 上生效）', again.elems.length === 5, String(again.elems.length));

// 🔴 回归：必须走**真实调用点** $t，而不是直接调 __airInject。
// 之前 __airInject 按数组写、调用点传的是消息对象，TypeError 被框架吞掉，
// 表现为「脚本跑了、API 也查了，但永远没有弹幕」——HAR 里完全看不出问题。
const $t = globalThis.__X.t;
ck('产物里能取到响应处理器 $t', typeof $t === 'function');

const base = () => _e.toBinary(_e.create({ elems: [
  { id: 1, progress: 100, midHash: '0', content: '原弹幕', mode: 1, ctime: '1700000000', dmFrom: 2 }] }));
const mkCtx = (bytes) => ({
  request: { bodyBytes: Buffer.alloc(0) },
  response: { bodyBytes: bytes },
  state: { segments: [[0, 42.9, 'sponsor', 'skip', 376.697, 1]] },
  argument: { airSummary: 'off', airCategories: 'sponsor', airActions: 'skip', airMinDuration: 8, airMode: 'jump', airNotice: '空指部已就位' },
});
const ctx = mkCtx(base());
let nexted = false, threw = null;
try { $t(ctx, () => { nexted = true; }); } catch (e) { threw = e; }
ck('$t 不抛异常', !threw, threw && threw.message);
ck('$t 会继续后面的中间件', nexted);
const out = _e.fromBinary(ctx.response.bodyBytes);
ck('$t 走完后弹幕从 1 条变 2 条', out.elems.length === 2, String(out.elems.length));
ck('$t 注入的那条带空降动作', out.elems[1] && out.elems[1].action === 'airborne:42900',
   out.elems[1] && out.elems[1].action);
ck('$t 注入的那条文案是默认「空指部已就位」', out.elems[1] && out.elems[1].content === '空指部已就位',
   out.elems[1] && out.elems[1].content);

// 两档都用上游的顶部大字样式；区别只在 action 有没有
const styleMsg = _e.fromBinary(_e.toBinary(_e.create({ elems: [
  { id: 9, progress: 10, midHash: '741886e', attr: 1048576, mode: 1, fontsize: 25,
    content: '真实弹幕', ctime: '1700000000', dmFrom: 2 },
]})));
inject(styleMsg.elems,
  [[0, 42.9, 'sponsor', 'skip', 191, 1], [0, 0, 'sponsor', 'full', 191, 0]],
  { airSummary: 'off', airCategories: 'sponsor', airFullMode: 'notice', airActions: 'skip' });
const sAuto = styleMsg.elems[1], sNote = styleMsg.elems[2];
ck('自动档是顶部大字 + 有 action',
  sAuto.midHash === '1948dd5d' && sAuto.mode === 5 && sAuto.fontsize === 50 && !!sAuto.action,
  JSON.stringify({ m: sAuto.midHash, mode: sAuto.mode, fs: sAuto.fontsize, a: sAuto.action }));
ck('提醒档同样是顶部大字', sNote.midHash === '1948dd5d' && sNote.mode === 5 && sNote.fontsize === 50,
  JSON.stringify({ m: sNote.midHash, mode: sNote.mode, fs: sNote.fontsize }));
ck('提醒档唯一区别是没有 action', !sNote.action, sNote.action);
// 自动档固定在片段起点 +2 秒；提醒档默认延后到 +8 秒（片头那条起点是 0，2 秒看不见）
ck('自动档是片段起点 + 2 秒', sAuto.progress === 2000, String(sAuto.progress));
ck('提醒档默认延后到 +3 秒', sNote.progress === 3000, String(sNote.progress));
// 片头汇总
const sumArg = { airInfoDelay: 3, airCategories: 'sponsor', airNoticeCategories: 'interaction,exclusive_access',
                  airActions: 'skip', airFullMode: 'notice', airInfo: '{list}', airInfoDelay: 3 };
const sumSegs = [
  [0, 0, 'sponsor', 'full', 191, 0],
  [150, 166, 'sponsor', 'skip', 191, 1],
  [159, 195, 'interaction', 'skip', 191, 0],
  [300, 330, 'exclusive_access', 'full', 191, 0],
];
const sumMsg = _e.fromBinary(_e.toBinary(_e.create({ elems: [
  { id: 1, progress: 10, midHash: '741886e', attr: 1048576, mode: 1, fontsize: 25, content: 'x', ctime: '1700000000', dmFrom: 2 }] })));
inject(sumMsg.elems, sumSegs, Object.assign({ airSummary: 'off' }, sumArg));
ck('airSummary=off 时不产生汇总', sumMsg.elems.length === 5, String(sumMsg.elems.length));

const sumMsg2 = _e.fromBinary(_e.toBinary(_e.create({ elems: [
  { id: 1, progress: 10, midHash: '741886e', attr: 1048576, mode: 1, fontsize: 25, content: 'x', ctime: '1700000000', dmFrom: 2 }] })));
inject(sumMsg2.elems, sumSegs, Object.assign({ airSummary: 'stagger' }, sumArg));
ck('stagger：每段一条，共 4 条汇总 + 4 条原弹幕',
  sumMsg2.elems.length === 9, String(sumMsg2.elems.length));
// elems[0] 是那条真实弹幕，汇总从 index 1 开始
const H2 = sumMsg2.elems.slice(1, 5);
ck('stagger：汇总错开 4 秒',
  H2.map(x => x.progress).join('/') === '3000/7000/11000/15000', H2.map(x => x.progress).join('/'));
ck('stagger：文案带中文类别与时间段',
  H2.map(x => x.content).join(' | ') === '恰饭 整篇 | 恰饭 02:30–02:46 | 一键三连 02:39–03:15 | 独家体验 整篇',
  H2.map(x => x.content).join(' | '));
ck('汇总弹幕都不带 action（不会被跳走）', H2.every(x => !x.action));

const many = sumSegs.concat([[400, 420, 'filler', 'skip', 191, 0], [500, 530, 'preview', 'skip', 191, 0]]);
const sumMsg3 = _e.fromBinary(_e.toBinary(_e.create({ elems: [
  { id: 1, progress: 10, midHash: '741886e', attr: 1048576, mode: 1, fontsize: 25, content: 'x', ctime: '1700000000', dmFrom: 2 }] })));
inject(sumMsg3.elems, many, Object.assign({ airSummary: 'single' }, sumArg));
ck('single：6 段只产生一条汇总（原弹幕1 + 汇总1 + 逐段6）', sumMsg3.elems.length === 8, String(sumMsg3.elems.length));
ck('single：默认每段一行（换行符分隔）',
  sumMsg3.elems[1].content === '恰饭 整篇\n恰饭 02:30–02:46\n一键三连 02:39–03:15\n独家体验 整篇\n离题闲聊 06:40–07:00 等 6 处',
  JSON.stringify(sumMsg3.elems[1].content));
ck('single：可改成挤一行用 · 分隔', (() => {
  const m = _e.fromBinary(_e.toBinary(_e.create({ elems: [
    { id: 1, progress: 10, midHash: '741886e', attr: 1048576, mode: 1, fontsize: 25, content: 'x', ctime: '1700000000', dmFrom: 2 }] })));
  inject(m.elems, many, Object.assign({ airSummary: 'single', airSummaryWrap: 'same' }, sumArg));
  return m.elems[1].content.indexOf('\n') < 0 && m.elems[1].content.slice(0, 10) === '恰饭 整篇 · 恰饭';
})(), '挤一行');
ck('single：出现在 airInfoDelay 处', sumMsg3.elems[1].progress === 3000, String(sumMsg3.elems[1].progress));

ck('提醒默认是顶部弹幕（时长最短但最显眼）', sNote.mode === 5, String(sNote.mode));
ck('提醒可改成滚动弹幕（停留更久、暂停也保留）', (() => {
  const m = _e.fromBinary(_e.toBinary(_e.create({ elems: [
    { id: 1, progress: 10, midHash: '741886e', attr: 1048576, mode: 1, fontsize: 25, content: 'x', ctime: '1700000000', dmFrom: 2 }] })));
  inject(m.elems, [[150, 166, 'sponsor', 'skip', 191, 1], [150, 190, 'filler', 'skip', 191, 0]],
    { airSummary: 'off', airCategories: 'sponsor', airNoticeCategories: 'filler', airInfoMode: '1' });
  return m.elems[1].mode === 5 && m.elems[2].mode === 1 && m.elems[2].midHash === '741886e';
})());
ck('提醒可改成底部弹幕', (() => {
  const m = _e.fromBinary(_e.toBinary(_e.create({ elems: [
    { id: 1, progress: 10, midHash: '741886e', attr: 1048576, mode: 1, fontsize: 25, content: 'x', ctime: '1700000000', dmFrom: 2 }] })));
  inject(m.elems, [[150, 190, 'filler', 'skip', 191, 0]], { airSummary: 'off', airNoticeCategories: 'filler', airInfoMode: '4' });
  return m.elems[1].mode === 4;
})());
ck('提醒延后可配置', (() => {
  const m = _e.fromBinary(_e.toBinary(_e.create({ elems: [
    { id: 1, progress: 10, midHash: 'aaa111', attr: 1048576, mode: 5, fontsize: 25, content: 'x', ctime: '1700000000', dmFrom: 2 }] })));
  inject(m.elems, [[150, 166, 'sponsor', 'skip', 191, 1], [150, 190, 'filler', 'skip', 191, 0]],
    { airSummary: 'off', airCategories: 'sponsor', airNoticeCategories: 'filler', airInfoDelay: 20 });
  return m.elems[1].progress === 152000 && m.elems[2].progress === 170000;
})());

// 同样走真实调用点，但响应里已经有本脚本注入过的弹幕 → 幂等
const ctx2 = mkCtx(_e.toBinary(after));
try { $t(ctx2, () => {}); } catch (e) { ck('幂等路径不抛异常', false, e.message); }
ck('响应里已有本脚本弹幕时不再重复注入',
   _e.fromBinary(ctx2.response.bodyBytes).elems.length === 5,
   String(_e.fromBinary(ctx2.response.bodyBytes).elems.length));

console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);