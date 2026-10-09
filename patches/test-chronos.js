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

console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);