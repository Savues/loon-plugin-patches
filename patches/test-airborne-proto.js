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
inject(after.elems, segs, arg);
ck('注入后 elems 从 2 条变 5 条', after.elems.length === 5, String(after.elems.length));

const rt = _e.fromBinary(_e.toBinary(after));
ck('序列化→反序列化后仍是 5 条', rt.elems.length === 5, String(rt.elems.length));
const fake = rt.elems.filter(x => x.midHash === '1948dd5d');
ck('假弹幕往返后仍可按 midHash 认出', fake.length === 3, String(fake.length));
ck('文案往返无损', fake[0].content === '跳过恰饭 00:00→00:42 省43s', fake[0].content);
ck('action 往返无损', fake[0].action === 'airborne:42900', fake[0].action);
ck('progress 往返无损', fake[1].progress === 65500, String(fake[1].progress));
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
  argument: { airCategories: 'sponsor', airActions: 'skip', airMinDuration: 8, airMode: 'jump', airNotice: '空指部已就位' },
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

// 🔴 只提醒档必须「借用真实弹幕的样式」：实测 App 会丢弃
// midHash=1948dd5d（空降标志）但 action 为空的弹幕，整条不显示。
const donorMsg = _e.fromBinary(_e.toBinary(_e.create({ elems: [
  { id: 9, progress: 10, midHash: '741886e', attr: 1048576, mode: 1, fontsize: 25,
    content: '真实弹幕', ctime: '1700000000', dmFrom: 2 },
]})));
inject(donorMsg.elems,
  [[0, 42.9, 'sponsor', 'skip', 191, 1], [0, 0, 'sponsor', 'full', 191, 0]],
  { airCategories: 'sponsor', airFullMode: 'notice', airActions: 'skip' });
const dAuto = donorMsg.elems[1], dNote = donorMsg.elems[2];
ck('借用样式：自动档仍是空降 midHash', dAuto.midHash === '1948dd5d', dAuto.midHash);
ck('借用样式：自动档保留 action', dAuto.action === 'airborne:42900', dAuto.action);
ck('借用样式：只提醒档用真实 midHash', dNote.midHash === '741886e', dNote.midHash);
ck('借用样式：只提醒档用真实 mode', dNote.mode === 1, String(dNote.mode));
ck('借用样式：只提醒档用真实 fontsize', dNote.fontsize === 25, String(dNote.fontsize));
ck('借用样式：只提醒档没有 action', !dNote.action, dNote.action);

// 没有可借的真实弹幕时退回普通样式
const bareMsg = _e.fromBinary(_e.toBinary(_e.create({ elems: [
  { id: 9, progress: 10, midHash: '1948dd5d', attr: 1310724, mode: 5, fontsize: 50,
    content: 'x', ctime: '1700000000', dmFrom: 2 },
]})));
inject(bareMsg.elems, [[0, 0, 'sponsor', 'full', 191, 0]], {});
ck('借不到样本时退回普通样式', bareMsg.elems[1].midHash === '46813211', bareMsg.elems[1].midHash);

// 优先借「顶部」样式的真实弹幕（滚动样式混在几百条里看不见）
const topMsg = _e.fromBinary(_e.toBinary(_e.create({ elems: [
  { id: 1, progress: 10, midHash: 'aaa111', attr: 1048576, mode: 1, fontsize: 25, content: '滚动', ctime: '1700000000', dmFrom: 2 },
  { id: 2, progress: 20, midHash: 'bbb222', attr: 1048576, mode: 5, fontsize: 25, content: '顶部', ctime: '1700000000', dmFrom: 2 },
]})));
inject(topMsg.elems, [[0, 0, 'sponsor', 'full', 191, 0]], { airFullMode: 'notice' });
ck('优先借顶部样式的真实弹幕', topMsg.elems[2].midHash === 'bbb222', topMsg.elems[2].midHash);
ck('提醒默认延后到第 8 秒', topMsg.elems[2].progress === 8000, String(topMsg.elems[2].progress));
ck('提醒时机可配', (() => {
  const m = _e.fromBinary(_e.toBinary(_e.create({ elems: [
    { id: 1, progress: 10, midHash: 'aaa111', attr: 1048576, mode: 5, fontsize: 25, content: 'x', ctime: '1700000000', dmFrom: 2 }] })));
  inject(m.elems, [[30, 0, 'sponsor', 'full', 191, 0]], { airFullMode: 'notice', airInfoDelay: 20 });
  return m.elems[1].progress === 50000;
})());
ck('自动档时机不受提醒延后影响', (() => {
  const m = _e.fromBinary(_e.toBinary(_e.create({ elems: [
    { id: 1, progress: 10, midHash: 'aaa111', attr: 1048576, mode: 1, fontsize: 25, content: 'x', ctime: '1700000000', dmFrom: 2 }] })));
  inject(m.elems, [[150, 166, 'sponsor', 'skip', 191, 1]], { airInfoDelay: 20 });
  return m.elems[1].progress === 152000;
})());

// 同样走真实调用点，但响应里已经有本脚本注入过的弹幕 → 幂等
const ctx2 = mkCtx(_e.toBinary(after));
try { $t(ctx2, () => {}); } catch (e) { ck('幂等路径不抛异常', false, e.message); }
ck('响应里已有本脚本弹幕时不再重复注入',
   _e.fromBinary(ctx2.response.bodyBytes).elems.length === 5,
   String(_e.fromBinary(ctx2.response.bodyBytes).elems.length));

console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);