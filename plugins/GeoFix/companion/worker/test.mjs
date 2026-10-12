// 用 node 直接跑 Worker 源码做单元测试（不依赖 CF 运行时）
//   node test.mjs
import worker from './src/index.js';

const CASES = [
  ['31.230416,121.473701', '裸坐标 → 原样 WGS84', 31.230416, 121.473701],
  ['https://maps.apple.com/?ll=31.230416,121.473701&z=17', '苹果 ?ll= → 原样（上游会偏 482m）', 31.230416, 121.473701],
  ['https://maps.apple.com/place/Tokyo Tower/@139.745435,35.658581,17z', '苹果 /place/…/@lon,lat,z', 35.658581, 139.745435],
  ['https://maps.apple.com/place/X/@35.658581,139.745435,17z', '苹果 @lat,lon,z（顺序写反也能消歧）', 35.658581, 139.745435],
  ['https://www.google.com/maps/@37.795490,-122.393700,15z', 'Google @lat,lon,z', 37.79549, -122.3937],
  ['https://www.google.com/maps/place/X/!3d37.795490!4d-122.393700', 'Google !3d!4d', 37.79549, -122.3937],
  ['https://uri.amap.com/marker?position=121.473701,31.230416&name=陆家嘴', '高德 marker lon,lat → 应 -482m', 31.232345, 121.469163],
  ['https://uri.amap.com/marker?position=116.397428,39.90923&name=天安门', '高德 marker 北京 → 应 -555m', 39.907829, 116.391187],
  ['https://www.amap.com/detail/B0FFH3Z4XC/@121.473701,31.230416,17z', '高德 @lon,lat', 31.232345, 121.469163],
  ['https://uri.amap.com/marker?position=139.745435,35.658581&name=东京塔', '高德境外 → 境内判定外不偏移', 35.658581, 139.745435],
  ['https://map.baidu.com/poi/天安门/@110507394,50853266,19z', '百度墨卡托 @x,y,19z（真·BD-09 输入）', 39.9078, 116.3912],
  ['https://example.com/nothing', '无坐标 → 422', null, null],
  ['https://maps.apple.com/?q=天安门', '苹果 ?q= → 422（上游也不支持）', null, null],
  ['http://169.254.169.254/latest/meta-data/', '云元数据地址 → 拒绝', null, null],
  ['http://localhost:8080/x', 'localhost → 拒绝', null, null],
];

const get = (q) => worker.fetch(new Request('https://x.test/api/parse?' + new URLSearchParams({ u: q }).toString()));

let pass = 0, fail = 0;
console.log('─── 解析用例 ───');
for (const [input, desc, eLat, eLon] of CASES) {
  const res = await get(input);
  const j = await res.json();
  let ok, why = '';
  if (eLat === null) {
    ok = res.status === 422 && !!j.error;
    why = j.error;
  } else {
    const dLat = Math.abs(j.lat - eLat), dLon = Math.abs(j.lon - eLon);
    ok = res.status === 200 && dLat < 2e-3 && dLon < 2e-3;
    why = `得到 ${j.lat},${j.lon} 期望 ≈${eLat},${eLon}  name=${JSON.stringify(j.name)}`;
  }
  ok ? pass++ : fail++;
  console.log(`${ok ? '✔' : '✘'} [${res.status}] ${desc}\n     ${input}\n     ${why}`);
}

console.log('\n─── 关键回归 ───');
const bare = await (await get('31.230416,121.473701')).json();
const apple = await (await get('https://maps.apple.com/?ll=31.230416,121.473701')).json();
const r1 = bare.lat === apple.lat && bare.lon === apple.lon;
r1 ? pass++ : fail++;
console.log(`${r1 ? '✔' : '✘'} 苹果 ?ll= 与裸坐标必须一致（上游在这里差 482m）→ ${apple.lat},${apple.lon}`);

const amap = await (await get('https://uri.amap.com/marker?position=121.473701,31.230416')).json();
const off = Math.hypot((amap.lat - bare.lat) * 111320, (amap.lon - bare.lon) * 111320 * Math.cos(31.23 * Math.PI / 180));
const r2 = off > 400 && off < 700;
r2 ? pass++ : fail++;
console.log(`${r2 ? '✔' : '✘'} 高德 GCJ-02 必须被换算 → 偏移 ${off.toFixed(1)}m（期望 400–700）`);

const jp = await (await get('https://uri.amap.com/marker?position=139.745435,35.658581&name=东京塔')).json();
const r3 = Math.abs(jp.lat - 35.658581) < 1e-4;
r3 ? pass++ : fail++;
console.log(`${r3 ? '✔' : '✘'} 境外坐标不套国内偏移 → ${jp.lat},${jp.lon}（应≈原值）`);

const h = await (await worker.fetch(new Request('https://x.test/api/health'))).json();
const r4 = h.ok === true && h.name === 'geofix-parse-worker';
r4 ? pass++ : fail++;
console.log(`${r4 ? '✔' : '✘'} /api/health → ${JSON.stringify(h)}`);

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
