// test-airborne-proto.js —— 整份产物能否在 Loon 式全局下加载；注入的弹幕能否 protobuf 往返
const fs = require('fs');
const ART = require('path').resolve(__dirname, '../plugins/Bilibili-Airborne/bilibili.airborne.js');
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
               'nn:(typeof nn==="undefined"?null:nn),inject:(typeof __airInject==="undefined"?null:__airInject)};';
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
const segs = [[0, 42.9, 'sponsor'], [63.5, 105.733, 'intro'], [63.5, 105.733, 'intro']];
const arg = { airNotice: '跳过{cat} {start}→{end} 省{dur}s', airMode: 'jump' };

const injected = nn(segs, arg);
ck('nn 生成 3 条弹幕', injected.length === 3);
ck('文案模板已渲染', injected[1].content === '跳过intro 01:03→01:45 省42s', injected[1].content);

const after = _e.fromBinary(beforeBytes);
inject(after.elems, segs, arg);
ck('注入后 elems 从 2 条变 5 条', after.elems.length === 5, String(after.elems.length));

const rt = _e.fromBinary(_e.toBinary(after));
ck('序列化→反序列化后仍是 5 条', rt.elems.length === 5, String(rt.elems.length));
const fake = rt.elems.filter(x => x.midHash === '1948dd5d');
ck('假弹幕往返后仍可按 midHash 认出', fake.length === 3, String(fake.length));
ck('文案往返无损', fake[0].content === '跳过sponsor 00:00→00:42 省43s', fake[0].content);
ck('action 往返无损', fake[0].action === 'airborne:42900', fake[0].action);
ck('progress 往返无损', fake[1].progress === 65500, String(fake[1].progress));
ck('原弹幕未被破坏', rt.elems.slice(0, 2).map(x => x.content).join(',') === '原弹幕A,原弹幕B',
   rt.elems.slice(0, 2).map(x => x.content).join(','));

const marked = _e.fromBinary(_e.toBinary(_e.create({ elems: nn(segs, { airMode: 'mark' }) })));
ck('mark 模式往返后没有 action', marked.elems.every(x => !x.action));

const again = _e.fromBinary(_e.toBinary(after));
inject(again.elems, segs, arg);
ck('往返后再注入仍是 5 条（幂等守卫在真 protobuf 上生效）', again.elems.length === 5, String(again.elems.length));

console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);