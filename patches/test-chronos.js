// test-chronos.js —— 用真实抓包的 ViewProgress 响应验证 chronos.js
// 判定标准：输出必须与 Bilibili-Dedup 实际产出的那份**逐字节相同**
const fs = require('fs'), zlib = require('zlib'), path = require('path');

const DIR = path.resolve(__dirname, 'fixtures');
const SRC = path.resolve(__dirname, '../plugins/Bilibili-Airborne/chronos.js');
let fail = 0;
const ck = (n, c, x = '') => { console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '  → ' + x)); if (!c) fail++; };

function run(body, ua) {
  let out = null;
  global.$response = { body: new Uint8Array(body) };
  global.$request = { headers: { 'user-agent': ua || 'Mozilla/5.0 bili-android' } };
  global.$done = (o) => { out = o; };
  global.$utils = { ungzip: (b) => new Uint8Array(zlib.gunzipSync(Buffer.from(b))) };
  (0, eval)(fs.readFileSync(SRC, 'utf8'));
  return out && out.response ? Buffer.from(out.response.body) : null;
}

const raw = fs.readFileSync(path.join(DIR, 'viewprogress-raw.bin'));
const expect = fs.readFileSync(path.join(DIR, 'viewprogress-resigned.bin'));

const got = run(raw);
ck('chronos.js 返回了 response', !!got);
if (!got) process.exit(1);
ck('输出与 Dedup 实测结果逐字节一致', got.equals(expect),
   '长度 ' + got.length + ' vs 期望 ' + expect.length);

const text = Buffer.from(got.subarray(5)).toString('latin1');
ck('chronos#1 已改写为表里的 md5', text.includes('932002070dc1b51241198a074d2279fc'));
ck('chronos#2 指向本仓库 zip',
   text.includes('/plugins/Bilibili-Airborne/chronos/932002070dc1b51241198a074d2279fc.zip'));
ck('chronos#3 sign 已删除', !text.includes('WdqW4FW96F1BimY8V0yGT3MBdtEUpDnDbULF5yrEbrmhi2vsa97QXFvkq0rK'));
ck('帧头改成未压缩(0x00)', got[0] === 0x00, String(got[0]));
ck('长度字段正确', got.readUInt32BE(1) === got.length - 5);

// 已经指向本仓库 zip 的数据，再次执行必须原样放行（不再改写）
const again = run(got);
ck('已重签的数据再次执行不再改写', again === null, again ? '又改了一遍' : '');

const noChronos = Buffer.concat([Buffer.from([0, 0, 0, 0, 2]), Buffer.from([0x18, 0x01])]);
ck('结构不认识时原样放行', run(noChronos) === null);
ck('空 body 不崩', (() => { try { run(Buffer.alloc(0)); return true; } catch (e) { return false; } })());

// gzip 帧：首字节 0x01，第 2-5 字节是长度
const gz = zlib.gzipSync(raw.subarray(5));
const framed = Buffer.concat([Buffer.from([0x01, 0, 0, 0, 0]), gz]);
framed.writeUInt32BE(gz.length, 1);
const outGz = run(framed);
ck('gzip 帧也能重签且结果与未压缩时相同', outGz && outGz.equals(expect),
   outGz ? '长度 ' + outGz.length : '无输出');

// 🔴 未知字段必须逐字节保留：ViewProgress 的章节按钮（原理解析/正片/中插/结尾）
// 存在字段 #4（重复 4 次），而上游 Sparkle 的 schema 只声明了 #1 video_guide 和 #2 chronos，
// 也就是说章节属于 protobuf 的未知字段。chronos.js 要拆开再拼回顶层消息，
// 一旦处理不当章节就会消失 —— 这个测试就是防这个的。
const chap = fs.readFileSync(path.join(DIR, 'viewprogress-chapters.bin'));
const splitPb = (buf) => {
  const rd = (b, i) => { let r = 0, s = 0, x; do { x = b[i++]; r += (x & 0x7f) * Math.pow(2, s); s += 7; } while (x & 0x80); return [r, i]; };
  const out = []; let i = 0;
  while (i < buf.length) {
    const [k, p] = rd(buf, i); i = p;
    const no = Math.floor(k / 8), wt = k % 8; let st = i;
    if (wt === 0) i = rd(buf, i)[1];
    else if (wt === 2) { const [n, q] = rd(buf, i); st = q; i = q + n; }
    else if (wt === 1) i += 8;
    else if (wt === 5) i += 4;
    else break;
    out.push({ no, payload: buf.subarray(st, i) });
  }
  return out;
};
const mkFrame = (payload) => { const b = Buffer.concat([Buffer.from([0, 0, 0, 0, 0]), payload]); b.writeUInt32BE(payload.length, 1); return b; };
let chapOut = null;
global.$done = (o) => { chapOut = o; };
global.$response = { body: new Uint8Array(mkFrame(chap)) };
global.$request = { headers: {} };
(0, eval)(fs.readFileSync(path.resolve(__dirname, '../plugins/Bilibili-Airborne/chronos.js'), 'utf8'));
ck('含章节的响应确实被处理了', !!(chapOut && chapOut.response));
if (chapOut && chapOut.response) {
  const before = splitPb(chap);
  const after = splitPb(Buffer.from(chapOut.response.body).subarray(5));
  ck('字段数量不变', before.length === after.length,
    before.map(x => x.no).join(',') + ' → ' + after.map(x => x.no).join(','));
  const group = (arr) => arr.reduce((g, x) => ((g[x.no] = g[x.no] || []).push(x.payload), g), {});
  const gb = group(before), ga = group(after);
  ck('未知字段 #4（章节）逐字节保留',
    (gb[4] || []).length === (ga[4] || []).length &&
    (gb[4] || []).every((p, i) => p.equals(ga[4][i])),
    '章节条数 ' + (ga[4] || []).length);
  ck('其它未知字段 #1/#3/#6 也逐字节保留',
    [1, 3, 6].every(f => (gb[f] || []).length === (ga[f] || []).length &&
      (gb[f] || []).every((p, i) => p.equals(ga[f][i]))));
  ck('章节名还在', Buffer.concat(after.map(x => x.payload)).includes(Buffer.from('正片', 'utf8')));
  ck('只有 chronos(#2) 被改写',
    !(gb[2] || []).every((p, i) => p.equals((ga[2] || [])[i])));
}

// 🔴 回归（2026-10-09 代码审查新增）：解析不完整时必须**整条原样放行**。
// 旧实现 split() 遇到不认识的 wire type 就 `return out`（返回"已解析的那几个"），
// 主流程拿它去 join() 重新序列化 —— 末尾字段被静默丢弃，App 收到一个
// "合法但字段残缺"的响应：不报错、不空屏、$done({response}) 还让重签报成功。
const mkVarint = (n) => { const o = []; do { let x = n % 128; n = Math.floor(n / 128); if (n) x |= 128; o.push(x); } while (n); return Buffer.from(o); };
const chronosField = splitPb(raw.subarray(5)).find(x => x.no === 2);
ck('夹具里能取出 chronos(#2) 字段', !!chronosField);
if (chronosField) {
  const withUnknownTail = Buffer.concat([
    Buffer.from(mkVarint((2 << 3) | 2)), mkVarint(chronosField.payload.length), chronosField.payload,
    Buffer.from(mkVarint((5 << 3) | 3)), Buffer.from([0xff, 0xff, 0xff])   // wire type 3：解析器不认识
  ]);
  ck('末尾是未知 wire type 时整条原样放行', run(mkFrame(withUnknownTail)) === null);

  const withChapterTail = Buffer.concat([
    Buffer.from(mkVarint((2 << 3) | 2)), mkVarint(chronosField.payload.length), chronosField.payload,
    Buffer.from(mkVarint((4 << 3) | 2)), mkVarint(200), Buffer.from([0xff, 0xff, 0xff])  // 声称 200 字节，实际只剩 3
  ]);
  ck('末尾字段声明的长度超出实际时整条原样放行', run(mkFrame(withChapterTail)) === null);

  const zeroLen = Buffer.concat([
    Buffer.from(mkVarint((2 << 3) | 2)), mkVarint(chronosField.payload.length), chronosField.payload,
    Buffer.from(mkVarint((6 << 3) | 0)), Buffer.from([0x80])   // varint 未写完就到底
  ]);
  ck('varint 截断时整条原样放行', run(mkFrame(zeroLen)) === null);
}

// 不完整的数据不得被"改坏"：只要解析器放弃过，输出就必须与输入完全一致
const halves = [raw.subarray(5).subarray(0, 20), raw.subarray(5).subarray(0, 37)];
ck('任意前缀的残缺 payload 都不会产出 response',
   halves.every(h => run(mkFrame(h)) === null));

// 🔴 http-response 脚本不保证有 $request，直接 $request.headers 会抛 TypeError
let noReqOut = null, threw = null;
try {
  global.$done = (o) => { noReqOut = o; };
  global.$response = { body: new Uint8Array(raw) };
  delete global.$request;
  (0, eval)(fs.readFileSync(SRC, 'utf8'));
} catch (e) { threw = e; }
ck('$request 缺失时不抛异常', !threw, threw && threw.message);
ck('$request 缺失时仍能重签（退回 universal）', !!(noReqOut && noReqOut.response));
global.$request = { headers: { 'user-agent': 'Mozilla/5.0 bili-android' } };

// 服务端换了 chronos zip、表里没有这条映射 → 退回按 UA 取默认值，并打出 warn。
// 日志是这条链路唯一的可观测信号（改 MAP 补映射就靠它），必须有。
const mkStr = (no, s) => {
  const b = Buffer.from(s, 'latin1');
  return Buffer.concat([Buffer.from(mkVarint((no << 3) | 2)), mkVarint(b.length), b]);
};
const inner2 = Buffer.concat([
  mkStr(1, 'deadbeefdeadbeefdeadbeefdeadbeef'), mkStr(2, 'http://i0.hdslb.com/bfs/x.zip'), mkStr(3, 'SIGNTOKEN')
]);
const logged = [];
const realLog = console.log;
console.log = (m) => logged.push(String(m));
global.$argument = { logLevel: 'warn' };
const fallbackOut = run(mkFrame(Buffer.concat([mkStr(2, inner2.toString('latin1'))])));
console.log = realLog;
global.$argument = undefined;
ck('表里没有的 md5 仍会重签（退回 universal）', !!fallbackOut);
ck('退回时恰好打一条 warn（debug 行不能顶替它）',
   logged.length === 1 && logged[0].includes('不在映射表'), logged.join(' / ') || '一条日志都没有');
global.$argument = undefined;

// logLevel=off 时必须安静
const logged2 = [];
console.log = (m) => logged2.push(String(m));
global.$argument = { logLevel: 'off' };
run(raw);
console.log = realLog;
global.$argument = undefined;
ck('logLevel=off 时不打任何日志', logged2.length === 0, logged2.join(' / '));


// 🔴🔴 真实回归（2026-10-10 用户反馈「BV1EDHC6CEDJ 不自动跳，另一个视频可以」）：
// 同一份抓包里两个 ViewProgress，BV1PyHi6vEpA 的被重签了、BV1EDHC6CEDJ 的没有。
// 差别在 BV1EDHC6CEDJ 那份 payload 开头是 `0a 00` —— 字段 #1 是**零长度**字段。
// 旧判据 `if (!(p > start) || p > b.length) return null;` 把零长度当成解析失败，
// split() 返回 null → 整个脚本 $done({}) 原样放行 → chronos 没重签 →
// App 降级成「弹幕能看能点但不会自动跳」，而且**全程不报任何错**。
// 这份 body 就是抓包里的原件，作为夹具钉死这个行为。
const zeroField = fs.readFileSync(path.join(DIR, 'viewprogress-zero-field.bin'));
ck('夹具确实是 gzip 帧，且解压后开头是零长度字段 #1',
   zeroField[0] === 0x01 && zeroField[5] === 0x1f &&
   zlib.gunzipSync(Buffer.from(zeroField.subarray(5))).subarray(0, 2).toString('hex') === '0a00',
   zeroField.subarray(5, 9).toString('hex') + ' (gzip 魔数)');
const zfPayload = zlib.gunzipSync(Buffer.from(zeroField.subarray(5)));
const zfOut = run(zeroField);
ck('零长度字段不再让整条放弃重签', !!zfOut, '又原样放行了');
if (zfOut) {
  const zt = Buffer.from(zfOut);
  ck('零长度字段那条的 chronos 已改写为表里的 md5',
     zt.toString('latin1').includes('932002070dc1b51241198a074d2279fc'));
  ck('零长度字段那条的 file 指向本仓库 zip', zt.includes('loon-plugin-patches'));
  ck('零长度字段那条的 sign 已删除', !zt.includes('WdqW4FW96F1BimY8V0yGT3MBdtEUpDnDb'));
}
// 零长度字段本身必须原样保留，不能被吞掉
if (zfOut) {
  const before = splitPb(zfPayload);
  const after = splitPb(Buffer.from(zfOut).subarray(5));
  ck('零长度的字段 #1 仍原样保留',
     before.length === after.length && before.some(x => x.no === 1 && x.payload.length === 0),
     before.map(x => x.no + ':' + x.payload.length).join(','));
}

// 判据放宽后，越界与截断仍必须原样放行（这两条是 v1.22 加守卫的目的）
const mkStr2 = (no, s2) => {
  const bb = Buffer.from(s2, 'latin1');
  return Buffer.concat([Buffer.from(mkVarint((no << 3) | 2)), mkVarint(bb.length), bb]);
};
const inner3 = Buffer.concat([mkStr2(1, 'deadbeefdeadbeefdeadbeefdeadbeef'), mkStr2(2, 'http://x/y.zip')]);
ck('零长度字段 + 后面跟长度越界的字段 → 整条原样放行',
   run(mkFrame(Buffer.concat([Buffer.from([0x0a, 0x00]), mkStr2(2, inner3.toString('latin1')),
                              Buffer.from(mkVarint((4 << 3) | 2)), mkVarint(200), Buffer.from([1, 2, 3])]))) === null);

console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);