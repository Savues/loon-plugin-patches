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
   text.includes('/plugins/Bilibili-Dedup/upstream/chronos/932002070dc1b51241198a074d2279fc.zip'));
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

console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);