// GeoFix 本地解析器测试：node 里模拟 Loon 运行时（$request / $done / $httpClient）
//   node parse.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src');

function call(u, httpStub) {
  let out = null;
  const sandbox = {
    $loon: {},
    $request: { url: 'https://gs-loc.apple.com/geo-parse?u=' + encodeURIComponent(u) },
    $done: (v) => { out = v.response; },
    URL: globalThis.URL,
  };
  if (httpStub) sandbox.$httpClient = { get: (o, cb) => httpStub(o, cb) };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(SRC, 'geo-control.js'), 'utf8'), sandbox, { filename: 'geo-control.js' });
  if (!out) throw new Error('脚本没有调用 $done');
  return { status: out.status, body: JSON.parse(out.body) };
}

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? '✔' : '✘'} ${name}${extra ? '\n      ' + extra : ''}`);
};
const near = (a, b, eps = 2e-3) => Math.abs(a - b) < eps;

const CASES = [
  ['31.230416,121.473701', '裸坐标原样', 31.230416, 121.473701, 'WGS84'],
  ['https://maps.apple.com/?ll=31.230416,121.473701&z=17', '苹果 ?ll= 原样（上游会偏 482m）', 31.230416, 121.473701, 'WGS84'],
  ['https://maps.apple.com/place/Tokyo Tower/@139.745435,35.658581,17z', '苹果 /place/ @lon,lat', 35.658581, 139.745435, 'WGS84'],
  ['https://www.google.com/maps/@37.795490,-122.393700,15z', 'Google @lat,lon', 37.79549, -122.3937, 'WGS84'],
  ['https://www.google.com/maps/place/x/!3d37.795490!4d-122.393700', 'Google !3d!4d', 37.79549, -122.3937, 'WGS84'],
  ['https://uri.amap.com/marker?position=121.473701,31.230416&name=X', '高德 marker → 换算', 31.232345, 121.469163, 'GCJ-02'],
  ['https://uri.amap.com/marker?position=116.397428,39.90923&name=天安门', '高德 北京 → 换算', 39.907829, 116.391187, 'GCJ-02'],
  ['https://www.amap.com/detail/B0FFH3Z4XC/@121.473701,31.230416,17z', '高德 @lon,lat', 31.232345, 121.469163, 'GCJ-02'],
  ['https://uri.amap.com/marker?position=139.745435,35.658581&name=东京塔', '境外不套国内偏移', 35.658581, 139.745435, 'GCJ-02'],
  ['https://map.baidu.com/poi/天安门/@110507394,50853266,19z', '百度墨卡托 → 落回 POI 本体', 39.9078, 116.3912, 'BD-09'],
  // ↓ 用户实测的苹果地图 App 真实分享格式（原先没认 coordinate，直接 422）
  ['https://maps.apple.com/place?address=%E6%B3%95%E5%9B%BD&auid=4983140303602022410&coordinate=46.263615,2.178741&lsp=7618&name=%E6%B3%95%E5%9B%BD&map=explore',
   '苹果 place?coordinate=（真机分享）', 46.263615, 2.178741, 'WGS84'],
  ['https://maps.apple.com/place?address=北京&coordinate=39.9078,116.3912&name=北京', '苹果 place?coordinate= 简化版', 39.9078, 116.3912, 'WGS84'],
];

console.log('─── 解析用例 ───');
for (const [input, desc, eLat, eLon, eSys] of CASES) {
  const r = call(input);
  const j = r.body;
  const ok = r.status === 200 && near(j.lat, eLat) && near(j.lon, eLon) && j.originalSystem === eSys;
  ok ? pass++ : fail++;
  console.log(`${ok ? '✔' : '✘'} [${r.status}] ${desc}\n     ${input}\n     → ${j.lat}, ${j.lon} (${j.originalSystem}) name=${JSON.stringify(j.name)}`);
}

console.log('\n─── 分享脏输入：前缀/尾随文字 ───');
{
  const L = 'https://maps.apple.com/place?address=%E6%B3%95%E5%9B%BD&coordinate=46.263615,2.178741&name=%E6%B3%95%E5%9B%BD';
  const cases = [
    ['纯链接', L, 46.263615, 2.178741],
    ['前置中文（用户实测）', '日内瓦地图项目' + L, 46.263615, 2.178741],
    ['前置 + 空格', '  日内瓦地图项目 ' + L + '  ', 46.263615, 2.178741],
    ['前置 + 尾随文字', '我的收藏·日内瓦 ' + L + ' 来自地图', 46.263615, 2.178741],
    ['尾随中文标点', L + '。', 46.263615, 2.178741],
    ['高德链接带前缀', '常去的地方' + 'https://uri.amap.com/marker?position=116.397428,39.90923', 39.907829, 116.391187],
    ['名称 + 裸坐标', '公司 31.230416,121.473701', 31.230416, 121.473701],
  ];
  for (const [name, input, eLat, eLon] of cases) {
    const j = call(input).body;
    const ok = j.lat !== undefined && near(j.lat, eLat) && near(j.lon, eLon);
    ok ? pass++ : fail++;
    console.log(`${ok ? '✔' : '✘'} ${name.padEnd(20)} → ${j.lat}, ${j.lon}${j.input ? '　(input 已回传清洗结果)' : ''}`);
  }
  // 纯链接不该被改动
  const clean = call(L).body;
  t('纯链接原样回传（不产生多余 input 字段）', clean.input === undefined, JSON.stringify(clean.input));
}

console.log('\n─── 名称提取 ───');
{
  const j = call('https://maps.apple.com/place?address=%E6%B3%95%E5%9B%BD&coordinate=46.263615,2.178741&name=%E6%B3%95%E5%9B%BD').body;
  t('苹果 place 链接取到 name 参数', j.name === '法国', JSON.stringify(j.name));
}

console.log('\n─── 拒绝 / 报错 ───');
for (const [input, why] of [
  ['https://maps.apple.com/?q=天安门', '苹果 ?q= 无坐标'],
  ['https://example.com/nothing', '无关页面'],
  ['http://169.254.169.254/latest/meta-data/', '云元数据地址'],
  ['http://localhost:8080/x', 'localhost'],
  ['', '空输入'],
]) {
  // 这些链接没有坐标，会走短链展开分支，所以要提供 $httpClient 桩
  const stub = (o, cb) => cb(null, { headers: {} }, '跳转后正文里也没有坐标');
  let r;
  try { r = call(input, stub); } catch (e) { r = { status: 0, body: { error: e.message } }; }
  const ok = r.status === 422 && !!r.body.error;
  ok ? pass++ : fail++;
  console.log(`${ok ? '✔' : '✘'} [${r.status}] ${why} → ${r.body.error || '(无错误信息)'}`);
}

console.log('\n─── 短链展开 ───');
{
  // 完整链接即使没坐标也不该发请求出去
  let fetched = 0;
  const spy = (o, cb) => { fetched++; cb(null, { headers: {} }, ''); };
  const r = call('https://maps.apple.com/place?foo=1&bar=2', spy);
  t('完整链接不触发网络抓取', fetched === 0, 'fetched=' + fetched + ' status=' + r.status);
  t('完整链接直接 422', r.status === 422, r.body.error);
}
{
  const stub = (o, cb) => cb(null, { headers: {} }, '页面源码 <a href="https://maps.apple.com/?ll=35.658581,139.745435">这里</a>');
  const r = call('https://t.example/short123', stub);
  const ok = r.status === 200 && near(r.body.lat, 35.658581) && (r.body.warnings || []).some((w) => w.includes('短链'));
  ok ? pass++ : fail++;
  console.log(`${ok ? '✔' : '✘'} 从正文里捞到坐标 → ${r.status} ${JSON.stringify(r.body).slice(0, 130)}`);
}
{
  const stub = (o, cb) => cb(null, { headers: {} }, '什么都没有');
  const r = call('https://t.example/short123', stub);
  const ok = r.status === 422;
  ok ? pass++ : fail++;
  console.log(`${ok ? '✔' : '✘'} 短链里也没有坐标 → ${r.status} ${r.body.error}`);
}
{
  const stub = (o, cb) => cb(new Error('network down'));
  const r = call('https://t.example/short123', stub);
  const ok = r.status === 422 && /短链展开失败/.test(r.body.error);
  ok ? pass++ : fail++;
  console.log(`${ok ? '✔' : '✘'} 短链请求失败 → ${r.status} ${r.body.error}`);
}

console.log('\n─── 关键回归 ───');
{
  const bare = call('31.230416,121.473701').body;
  const apple = call('https://maps.apple.com/?ll=31.230416,121.473701').body;
  const ok = bare.lat === apple.lat && bare.lon === apple.lon;
  ok ? pass++ : fail++;
  console.log(`${ok ? '✔' : '✘'} 苹果 ?ll= 与裸坐标必须一致 → ${apple.lat},${apple.lon}`);
}
{
  const amap = call('https://uri.amap.com/marker?position=121.473701,31.230416').body;
  const bare = call('31.230416,121.473701').body;
  const off = Math.hypot((amap.lat - bare.lat) * 111320, (amap.lon - bare.lon) * 111320 * Math.cos(31.23 * Math.PI / 180));
  const ok = off > 400 && off < 700;
  ok ? pass++ : fail++;
  console.log(`${ok ? '✔' : '✘'} 高德 GCJ-02 必须被换算 → 偏移 ${off.toFixed(1)}m（期望 400–700）`);
}
{
  const jp = call('https://uri.amap.com/marker?position=139.745435,35.658581').body;
  const ok = near(jp.lat, 35.658581, 1e-4);
  ok ? pass++ : fail++;
  console.log(`${ok ? '✔' : '✘'} 境外坐标不套国内偏移 → ${jp.lat},${jp.lon}`);
}

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
