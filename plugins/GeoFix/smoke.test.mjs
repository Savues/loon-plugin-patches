// GeoFix 脚本冒烟测试：在 Node 里模拟 Loon 运行时（$request / $response / $persistentStore / $done / $loon）
// 移植到本仓库时只做了字符串改名，这里逐条验证改名没有改坏行为。
//   node smoke.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src');

// ── Loon 运行时模拟 ────────────────────────────────────────────────────────
function makeRuntime({ store = {}, request = null, response = null } = {}) {
  const doneCalls = [];
  const sandbox = {
    $loon: {},
    $persistentStore: {
      read: (k) => (k in store ? store[k] : null),
      write: (v, k) => { store[k] = v; return true; },
    },
    $request: request,
    $response: response,
    $done: (v) => doneCalls.push(v),
    Date, Math, JSON, BigInt, Object, Array, String, Number, Boolean, RegExp, Error,
    isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    URL, atob, btoa, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer,
    atob, btoa, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer,
  };
  sandbox.globalThis = sandbox;
  return { sandbox, doneCalls, store };
}

function run(file, opts) {
  const rt = makeRuntime(opts);
  const code = fs.readFileSync(path.join(SRC, file), 'utf8');
  vm.createContext(rt.sandbox);
  vm.runInContext(code, rt.sandbox, { filename: file });
  return rt;
}

const body = (rt) => JSON.parse(rt.doneCalls[0].response.body);
const GS = 'https://gs-loc.apple.com';
let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? '✔' : '✘'} ${name}${extra ? '\n      ' + extra : ''}`);
};

console.log('─── Bridge：写 / 查 / 清 ───');
{
  const rt = run('geo-control.js', {
    request: { url: `${GS}/geo-settings/save?lat=31.230416&lon=121.473701&acc=25&name=LuJiaZui` },
  });
  t('save 返回 ok', body(rt).ok === true);
  t('持久化 key 改为 geo_settings', 'geo_settings' in rt.store, Object.keys(rt.store).join(','));
  const st = rt.store.geo_settings && JSON.parse(rt.store.geo_settings);
  t('坐标写入正确', st && st.lat === 31.230416 && st.lon === 121.473701, rt.store.geo_settings);
  t('source 字段已改名', st && st.source === 'geofix-bridge', st && st.source);
  t('事件类型已改名', JSON.parse(rt.store.geo_events)[0].type === 'settings_saved');
}
{
  const rt = run('geo-control.js', { request: { url: `${GS}/geo-settings/status` } });
  t('无坐标时 mode = passthrough', body(rt).mode === 'passthrough', body(rt).mode);
  t('签名已改名', body(rt).signature === 'geofix-control', body(rt).signature);
}
{
  const rt = run('geo-control.js', { request: { url: `${GS}/geo-settings/save?lat=999&lon=999` } });
  t('非法坐标被拒（422）', rt.doneCalls[0].response.status === 422);
}
{
  const store = {};
  run('geo-control.js', { store, request: { url: `${GS}/geo-settings/save?lat=31&lon=121` } });
  const rt = run('geo-control.js', { store, request: { url: `${GS}/geo-settings/clear` } });
  t('clear 写墓碑并置 enabled=false', JSON.parse(store.geo_settings).enabled === false);
  t('clear 后 mode 回到 passthrough', body(rt).mode === 'passthrough');
}

console.log('\n─── Response：无坐标时透传 ───');
{
  const store = {};
  const res = { status: 200, headers: { 'Content-Encoding': 'gzip' }, body: new Uint8Array([1, 2, 3]) };
  run('geo-response.js', { store, response: res });
  t('未设坐标 → 不改写 body', res.body[0] === 1 && res.body[1] === 2);
  t('事件类型改为 geofix_passthrough', JSON.parse(store.geo_events)[0].type === 'geofix_passthrough');
}

console.log('\n─── Response：真实 protobuf 改写 ───');
{
  // 手工造一个 Apple 风格回包：8 字节头 + 2 字节大端长度 + 根 protobuf
  const encV = (n) => { const o = []; let v = BigInt(n); while (v >= 128n) { o.push(Number((v & 127n) | 128n)); v >>= 7n; } o.push(Number(v)); return o; };
  const fld = (no, bytes) => [...encV(no * 8 + 2), ...encV(bytes.length), ...bytes];
  const varField = (no, n) => [...encV(no * 8), ...encV(n)];
  const loc = [...varField(1, 31123456), ...varField(2, 121469163), ...varField(3, 25)];
  const recMsg = [...fld(1, [...Buffer.from('aa:bb:cc:dd:ee:ff', 'utf8')]), ...fld(2, loc)];
  const root = fld(2, recMsg);
  const frame = [0, 0, 0, 0, 0, 0, 0, 0, (root.length >> 8) & 255, root.length & 255, ...root];

  const store = { geo_settings: JSON.stringify({ enabled: true, lat: 39.907829, lon: 116.391187, accuracy: 30 }) };
  const res = { status: 200, headers: { 'Content-Encoding': 'gzip', 'Content-Length': '999' }, body: new Uint8Array(frame) };
  run('geo-response.js', { store, response: res });

  const s = Array.from(res.body).join(',');
  const hasSeq = (arr) => arr.every((b, i) => s.includes(arr.slice(i, i + arr.length).join(',')));
  t('状态码强制 200', res.status === 200);
  t('Content-Encoding 头被删除', !('Content-Encoding' in res.headers));
  t('Content-Length 已同步', res.headers['Content-Length'] === String(res.body.length));
  t('旧纬度 31123456 已消失', !s.includes(encV(31123456).join(',')));
  t('新纬度 3990782900 已写入（39.907829 × 1e8）', hasSeq(encV(3990782900)));
  t('新经度 11639118700 已写入（116.391187 × 1e8）', hasSeq(encV(11639118700)));
  const diag = JSON.parse(store.geo_diag);
  t('patchStats.wifi = 1', diag.patchStats && diag.patchStats.wifi === 1, JSON.stringify(diag.patchStats));
  t('mode = active', diag.mode === 'active');
  t('lastError 为空', diag.lastError === null, String(diag.lastError));
}

console.log('\n─── 一键形态 save?u=（不经过页面 JS） ───');
{
  const rt = run('geo-control.js', {
    store: {},
    request: { url: `${GS}/geo-settings/save?u=${encodeURIComponent('日内瓦地图项目https://maps.apple.com/place?coordinate=39.907829,116.391187&name=天安门')}&acc=30` },
  });
  const r = body(rt);
  t('链接进来直接写入', r.ok === true && r.mode === 'active', JSON.stringify(r).slice(0, 110));
  t('坐标解析正确', r.current.lat === 39.907829 && r.current.lon === 116.391187);
  t('名称也带上了', r.current.name === '天安门', r.current.name);
  t('精度可调', r.current.accuracy === 30, String(r.current.accuracy));
  t('存进 geo_settings', JSON.parse(rt.store.geo_settings).lat === 39.907829);
  t('事件带上了名称与坐标', /天安门.*39\.907829/.test(JSON.parse(rt.store.geo_events)[0].message), JSON.parse(rt.store.geo_events)[0].message);

  const short = run('geo-control.js', { store: {}, request: { url: `${GS}/geo-settings/save?u=${encodeURIComponent('https://t.example/abc')}` } });
  t('短链给明确提示（同步链路展开不了）', short.doneCalls[0].response.status === 422
    && /短链/.test(JSON.parse(short.doneCalls[0].response.body).error), JSON.parse(short.doneCalls[0].response.body).error);
}

console.log('\n─── Route：存 / 播 / 停 ───');
{
  const store = {};
  const payload = Buffer.from(JSON.stringify({
    id: 'r1', name: 'T1', state: 'idle', acc: 25,
    pts: [[39.9, 116.39, 0], [39.91, 116.4, 60]], totalDurationSec: 60,
  })).toString('base64url');

  let rt = run('geo-route.js', { store, request: { url: `${GS}/geo-route/save?payload=${payload}&autostart=1` } });
  t('route save 成功', body(rt).ok === true);
  t('持久化 key 改为 geo_route_session', 'geo_route_session' in store, Object.keys(store).join(','));

  rt = run('geo-route.js', { store, request: { url: `${GS}/geo-route/status` } });
  const st = body(rt).route;
  t('state = running', st.state === 'running', st.state);
  t('进度可计算', typeof st.progress === 'number' && st.progress >= 0, `progress=${st.progress}`);
  t('current 坐标插值合理', st.current.lat >= 39.9 && st.current.lat <= 39.91, JSON.stringify(st.current));

  rt = run('geo-route.js', { store, request: { url: `${GS}/geo-route/pause` } });
  t('pause 生效', JSON.parse(store.geo_route_session).state === 'paused');

  rt = run('geo-route.js', { store, request: { url: `${GS}/geo-route/clear` } });
  t('clear 生效', !store.geo_route_session);
}

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
