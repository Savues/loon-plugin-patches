// test-ii.js —— 验证 Allinone bundle 的 ii()（ViewProgress 清洗 + chronos 重签单管线）
// 判定: ①重签=chronos.js 权威表 ②未知字段逐字节保留 ③幂等 ④结构异常原样放行 ⑤UA 回退
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const SRC = path.resolve(__dirname, '../scripts/protobuf.response.js');
let fail = 0;
const ck = (n, c, x = '') => { console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '  → ' + x)); if (!c) fail++; };

// bundle 探针: mn.run() 后导出内部符号
const code = fs.readFileSync(SRC, 'utf8');
const probed = code.replace('mn.run();\n', 'mn.run();\nglobalThis.__T={ti:ti,Qn:Qn,Mt:Mt,pt:pt,ii:ii,Ti:Ti};\n');
if (!probed.includes('__T')) { console.log('✗ 探针注入失败'); process.exit(1); }
const sandbox = {
  $request: { method: 'POST', url: 'https://grpc.biliapi.net/bilibili.app.viewunite.v1.View/ViewProgress', headers: {} },
  $response: { body: new Uint8Array(0) },
  $argument: '{}', $done: () => {}, $persistentStore: { read: () => null, write: () => true },
  $notification: { post: () => {} }, console: { log: () => {} },
  TextDecoder, TextEncoder, setTimeout, Buffer,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext('(()=>{' + probed + '})()', sandbox);
const { ti, Qn, Mt, pt, ii, Ti } = sandbox.globalThis.__T;

const MAP = Ti();
const targets = new Set(Object.values(MAP));
const chronoZips = fs.readdirSync(path.resolve(__dirname, '../chronos')).filter(f => f.endsWith('.zip')).map(f => f.slice(0, -4));
ck('MAP 全部目标存在于 chronos/ 目录（404 防线）', [...targets].every(t => chronoZips.includes(t)),
   JSON.stringify([...targets].filter(t => !chronoZips.includes(t))));

// ── protobuf 微工具 ──
function readVarint(b, p) { let r = 0, s = 0, x; do { x = b[p++]; r += (x & 0x7f) * Math.pow(2, s); s += 7; } while (x & 0x80); return [r, p]; }
function split(b) {
  const out = []; let p = 0;
  while (p < b.length) {
    const k = readVarint(b, p)[0]; p = readVarint(b, p)[1];
    const no = Math.floor(k / 8), wt = k % 8; let start;
    if (wt === 2) { const n = readVarint(b, p); start = n[1]; p = n[1] + n[0]; }
    else { start = p; if (wt === 0) p = readVarint(b, p)[1]; else if (wt === 1) p += 8; else if (wt === 5) p += 4; else return null; }
    if (!(p >= start) || p > b.length) return null;
    out.push({ no, wt, raw: b.subarray(start, p) });
  }
  return out;
}
function chronosOf(pb) {
  const fs2 = split(pb); if (!fs2) return null;
  for (const f of fs2) if (f.no === 2) { const inner = split(f.raw); if (inner) return inner; }
  return null;
}
const sOf = (bytes) => Buffer.from(bytes).toString('latin1');

// ── 夹具: 仓库内置 viewprogress-raw.bin（原为某次真机 HAR 的 entries[36]，已固化为仓库资产，
//    跨设备可跑；含 grpc 5 字节帧头 + viewunite ViewProgressReply）
const fixturePath = path.resolve(__dirname, '../../../patches/fixtures/viewprogress-raw.bin');
const payload = new Uint8Array(fs.readFileSync(fixturePath).slice(5));
const mkCtx = (pb, ua) => ({ argument: { purifyComment: true, sponsorBlock: true },
  request: { headers: { 'user-agent': ua || 'bili-inter/82300200' } }, response: { bodyBytes: pb } });

// ① 端到端: ti 走全链
{
  const ctx = mkCtx(payload);
  ti(ctx, () => {});
  const s = sOf(ctx.response.bodyBytes);
  const inner = chronosOf(ctx.response.bodyBytes.slice(5));
  const text = inner ? sOf(Buffer.concat(inner.filter(f => f.no <= 3).map(f => f.raw))) : '';
  ck('① 端到端: 输出仍为合法 protobuf(裸 payload, 帧由 kn 中间件包)', ctx.response.bodyBytes.length > 10);
  ck('① chronos#1 已改写为去伞版 7d0a357c', s.includes('7d0a357c92ee4a002c0970e88d1b38b6'));
  ck('① 服务端原始 md5 已消失', !s.includes('325e7073ffc6fb5263682fecdcd1058f'));
  ck('① 旧签名已删', !s.includes('WdqW4FW96F1BimY8V0yGT3MBdtEUpDnDbULF5yrEbrmhi2vsa97QXFvkq0'));
  ck('① zip URL 指向 Allinone', s.includes('/plugins/Bilibili-Allinone/chronos/7d0a357c92ee4a002c0970e88d1b38b6.zip'));
}

// ② 幂等: 重签结果再过一遍输出不变
{
  const c1 = mkCtx(payload); ti(c1, () => {});
  const c2 = mkCtx(c1.response.bodyBytes); ti(c2, () => {});
  ck('② 幂等: 二次处理输出逐字节一致',
     Buffer.compare(Buffer.from(c1.response.bodyBytes), Buffer.from(c2.response.bodyBytes)) === 0);
}

// ③ UA 回退: md5 不在表里时按 UA 变体回退
{
  const fake = new Uint8Array(payload);
  // 顶层 #2 chronos 内 #1 md5 改成一个不在表里的 32hex
  const fs2 = split(fake.slice(0));
  const out = [];
  for (const f of fs2) {
    if (f.no === 2) {
      const inner = split(f.raw).map(g => {
        if (g.no === 1) { const v = new Uint8Array(32).fill(0x61); return { no: 1, wt: 2, raw: v }; }
        return g;
      });
      const parts = []; let len = 0;
      for (const g of inner) { len += 1 + g.raw.length + (g.raw.length < 128 ? 1 : 2); }
      const head = new Uint8Array([0x12, len]);
      const body = [];
      for (const g of inner) { body.push((g.no * 8 + g.wt), g.raw.length, ...g.raw); }
      out.push({ no: 2, wt: 2, raw: new Uint8Array([...head.slice(1), ...body]) });
    } else out.push(f);
  }
  // 简化: 直接字符串替换载荷里的 md5 为假 md5(等长)
  let txt = Buffer.from(payload).toString('latin1');
  txt = txt.replace('325e7073ffc6fb5263682fecdcd1058f', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  const fakePayload = new Uint8Array(Buffer.from(txt, 'latin1'));
  const ctx = mkCtx(fakePayload);
  ti(ctx, () => {});
  const s = sOf(ctx.response.bodyBytes);
  ck('③ md5 不在表 → 按 UA 回退到 inter', s.includes('c9940a255224fb5ab2829f0c87df71c9'), s.match(/[0-9a-f]{32}/g)?.slice(0, 2).join(','));
}

// ④ 章节未知字段逐字节保留（view.v1 夹具: 章节在 #4）
{
  const chap = path.resolve(__dirname, '../../../patches/fixtures/viewprogress-chapters.bin');
  if (fs.existsSync(chap)) {
    const orig = new Uint8Array(fs.readFileSync(chap));  // 夹具本身就是裸 payload（无 grpc 帧头）
    const ctx = mkCtx(orig, 'Mozilla/5.0 bili-android');
    Qn(ctx, () => {});
    const a = split(orig).filter(f => f.no === 4).map(f => sOf(f.raw)).join('|');
    const b = split(ctx.response.bodyBytes).filter(f => f.no === 4).map(f => sOf(f.raw)).join('|');
    ck('④ 章节(未知字段#4)逐字节保留', a === b && a.length > 0);
  } else ck('④ 章节夹具存在', false, 'patches/fixtures/viewprogress-chapters.bin 缺失');
}

// ⑤ 结构异常原样放行
{
  const noChronos = new Uint8Array([0x18, 0x01]);
  const ctx = mkCtx(noChronos);
  ti(ctx, () => {});
  ck('⑤ 无 chronos 字段 → 原样放行', ctx.response.bodyBytes.length === 2 && ctx.response.bodyBytes[0] === 0x18);
}

// ⑥ view.v1 变体同样被处理（Qn）
{
  const ctx = mkCtx(payload, 'Mozilla/5.0 bili-android');
  Qn(ctx, () => {});
  const s = sOf(ctx.response.bodyBytes);
  ck('⑥ view.v1 Qn 也会重签 chronos', s.includes('7d0a357c92ee4a002c0970e88d1b38b6'), s.match(/[0-9a-f]{32}/g)?.slice(0,1).join(''));
}

console.log(fail ? `\nFAILED: ${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);
