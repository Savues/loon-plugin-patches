/**
 * GeoFix 配套的地图链接解析 Worker —— 上游那个第三方 Worker 的自建替代。
 *
 * 与上游的关键差异（都是上游实测出来的 bug）：
 *   1. 苹果地图 / Google 地图本来就是 WGS84，上游却对 maps.apple.com/?ll=
 *      套了 GCJ-02→WGS84 偏移，导致同一对数字走不同入口结果差 482m。
 *      本实现按 provider 判定坐标系，苹果/Google 一律不偏移。
 *   2. 上游对百度 @x,y 的换算结果与 POI 名称能差 1000+ km 且仍返回 200
 *      零告警。本实现在结果可疑时往 warnings 里塞明确警告。
 *
 * 坐标系：
 *   WGS84  苹果地图 / Google 地图 / 裸坐标
 *   GCJ-02 高德（uri.amap.com/marker、@lon,lat,z）
 *   BD-09  百度（@x,y,z 墨卡托）
 *
 * 部署：Cloudflare Workers（免费额度够用），见同目录 wrangler.toml / README.md
 */

const A = 6378245.0;                 // 克拉索夫斯基椭球长半轴
const EE = 0.00669342162296594323;   // 偏心率平方
const PI = Math.PI;
const X_PI = (PI * 3000.0) / 180.0;

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });

// ── 坐标系换算 ────────────────────────────────────────────────────────────

/** 中国境外；也是"国内偏移换算只在大陆境内做"的判定 */
const inChina = (lat, lon) => lon > 73.66 && lon < 135.05 && lat > 3.86 && lat < 53.55;

function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLon(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

function wgs84ToGcj02(lon, lat) {
  if (!inChina(lat, lon)) return [lon, lat];
  let dLat = transformLat(lon - 105.0, lat - 35.0);
  let dLng = transformLon(lon - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = ((dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI));
  dLng = ((dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI));
  return [lon + dLng, lat + dLat];
}

/** 迭代求逆，6 轮足够收敛到厘米级 */
function gcj02ToWgs84(lon, lat) {
  if (!inChina(lat, lon)) return [lon, lat];
  let wLon = lon, wLat = lat;
  for (let i = 0; i < 6; i++) {
    const [gLon, gLat] = wgs84ToGcj02(wLon, wLat);
    wLon += lon - gLon;
    wLat += lat - gLat;
  }
  return [wLon, wLat];
}

function bd09ToGcj02(lon, lat) {
  const x = lon - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
  return [z * Math.cos(theta), z * Math.sin(theta)];
}

/** 球面墨卡托归一化 y → 纬度 */
function mercYToLat(y) {
  return (Math.atan(Math.sinh(PI * (1 - 2 * y))) * 180.0) / PI;
}

// ── 解析 ──────────────────────────────────────────────────────────────────

const validCoord = (lat, lon) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

const round6 = (n) => Math.round(n * 1e6) / 1e6;

/** 最终统一输出 WGS84 */
function toWgs84(lat, lon, system, warnings, source) {
  if (!validCoord(lat, lon)) throw new Error('坐标超出合法范围');
  let outLat = lat, outLon = lon;
  if (system === 'BD-09') {
    [outLon, outLat] = bd09ToGcj02(lon, lat);
    [outLon, outLat] = gcj02ToWgs84(outLon, outLat);
    warnings.push('BD-09 → GCJ-02 → WGS84 双重换算，累计误差可达数米');
  } else if (system === 'GCJ-02') {
    [outLon, outLat] = gcj02ToWgs84(lon, lat);
  } else if (system !== 'WGS84') {
    throw new Error('未知坐标系 ' + system);
  }
  if (system !== 'WGS84' && !inChina(lat, lon)) {
    warnings.push('境外坐标仍套用了国内偏移，结果可能有偏差');
  }
  return {
    lat: round6(outLat),
    lon: round6(outLon),
    system: 'WGS84',
    originalSystem: system,
    source,
    confidence: system === 'WGS84' ? 0.95 : 0.85,
    warnings,
    checkedAt: Date.now(),
  };
}

function nameFromPath(u) {
  // 1) 显式命名参数最可靠
  for (const k of ['name', 'q', 'query', 'wd', 'keyword', 'title']) {
    const v = u.searchParams.get(k);
    if (v) return decodeURIComponent(v).trim();
  }
  // 2) /place/<名称>/ 或 /poi/<名称>/ 里的路径段
  const segs = decodeURIComponent(u.pathname).split('/').filter(Boolean);
  for (const s of segs) {
    if (/^(poi|place|search|detail|m|marker|addr|address|results|list)$/i.test(s)) continue;
    if (/^@?\d/.test(s) || /^!3d/.test(s)) continue;
    const cleaned = s.replace(/!3d.*$/, '').replace(/[@,].*$/, '').replace(/[-_+]/g, ' ').trim();
    if (cleaned) return cleaned;
  }
  return '';
}

/** 抓短链展开。带最小 SSRF 防护：只允许 http/https，拦掉内网/元数据地址，限跳数。 */
async function expandShortLink(u) {
  const BLOCK = /^(localhost$|.*\.local$|.*\.internal$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0$|\[?::1\]?$)/i;
  let cur = u.href;
  for (let i = 0; i < 3; i++) {
    let next;
    try {
      next = new URL(cur);
    } catch {
      throw new Error('短链展开失败：URL 非法');
    }
    if (!/^https?:$/.test(next.protocol)) throw new Error('短链展开失败：只允许 http/https');
    if (BLOCK.test(next.hostname)) throw new Error('短链展开失败：目标地址被拒绝');
    const res = await fetch(next.toString(), {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      cf: { cacheTtl: 0 },
    });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      cur = new URL(loc, next).toString();
      continue;
    }
    return next;
  }
  throw new Error('短链重定向层数过多');
}

function parseFromUrl(u, warnings) {
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const q = u.searchParams;
  const name = nameFromPath(u);

  // 1) 裸经纬度 query：任何来源都优先认
  const ll = q.get('ll') || q.get('latlon') || q.get('center') || q.get('location');
  if (ll && /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(ll.replace(/%2C/gi, ','))) {
    const [a, b] = ll.split(',').map(Number);
    // ll 一律按 WGS84（苹果/Google 都是 WGS84）
    return toWgs84(a, b, 'WGS84', warnings, host);
  }

  // 2) 路径里的 @x,y,zoomz
  //    各家的经纬顺序并不统一（苹果/高德 @lon,lat，Google @lat,lon），
  //    用「绝对值 > 90 的那个一定是经度」来消歧，只有两者都 ≤90 时才退回按域名判断。
  const at = u.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+)z?)?/);
  if (at) {
    const a = Number(at[1]), b = Number(at[2]);

    if (host.includes('baidu')) {
      // 百度 @x,y 是墨卡托网格：x→经度，y→纬度
      const z = Number(at[3] || 19);
      const W = 256 * 2 ** z;
      const lon = (a / W) * 360 - 180;
      const lat = mercYToLat(b / W);
      if (!inChina(lat, lon)) warnings.push('百度墨卡托换算结果落在中国境外，请人工复核');
      return toWgs84(lat, lon, 'BD-09', warnings, host);
    }

    const isAmap = host.includes('amap') || host.includes('gaode');
    let lat, lon;
    if (Math.abs(a) > 90) { lon = a; lat = b; }
    else if (Math.abs(b) > 90) { lat = a; lon = b; }
    else { lat = isAmap ? b : a; lon = isAmap ? a : b; }

    return toWgs84(lat, lon, isAmap ? 'GCJ-02' : 'WGS84', warnings, host);
  }

  // 3) Google !3d!4d
  const g = u.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (g) return toWgs84(Number(g[1]), Number(g[2]), 'WGS84', warnings, host);

  // 4) 高德 marker：position=lon,lat
  const pos = q.get('position') || q.get('poi') || q.get('lnglat');
  if (pos && /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(pos)) {
    const [a, b] = pos.split(',').map(Number);
    const sys = host.includes('amap') || host.includes('gaode') ? 'GCJ-02' : 'WGS84';
    return toWgs84(b, a, sys, warnings, host);
  }

  // 5) 单独的 lat / lon / lng query
  const lat = q.get('lat') ?? q.get('latitude');
  const lon = q.get('lon') ?? q.get('lng') ?? q.get('longitude');
  if (lat && lon) return toWgs84(Number(lat), Number(lon), 'WGS84', warnings, host);

  throw new Error('未能从链接中解析出经纬度');
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === '/api/health' || url.pathname === '/health') {
      return json({
        ok: true,
        name: 'geofix-parse-worker',
        version: '1.0.0',
        origin: 'self-hosted mirror',
        // 上游用于快捷指令识别的字段
        moduleVersion: '1.1.1',
        features: ['parse', 'gcj02', 'bd09', 'wgs84', 'shortlink'],
        now: Date.now(),
      });
    }

    if (url.pathname !== '/api/parse' && url.pathname !== '/parse') {
      return json({ ok: false, error: 'not found' }, 404);
    }

    const raw = url.searchParams.get('u') || url.searchParams.get('url') || '';
    if (!raw) return json({ error: '缺少参数 u' }, 422);
    if (raw.length > 4096) return json({ error: '输入过长（上限 4096 字符）' }, 422);

    const warnings = [];
    try {
      let u;
      try {
        u = new URL(raw.trim());
      } catch {
        // 裸坐标 "lat,lon"
        const m = raw.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)$/);
        if (!m) throw new Error('既不是合法 URL，也不是裸坐标');
        const out = toWgs84(Number(m[1]), Number(m[2]), 'WGS84', warnings, 'raw');
        out.name = '';
        return json(out);
      }

      if (!/^https?:$/.test(u.protocol)) throw new Error('只支持 http/https 链接');

      // 短链：没有明显坐标参数就展开重定向
      const looksHasCoord = /[?&](ll|latlon|center|position|poi|lat|lon|lng)=|[@!]3d|@\d/.test(u.href);
      if (!looksHasCoord) {
        const before = u.href;
        u = await expandShortLink(u);
        if (u.href !== before) warnings.push('输入是短链，已跟随重定向展开');
      }

      const out = parseFromUrl(u, warnings);
      out.name = nameFromPath(u);
      return json(out);
    } catch (err) {
      return json({ error: String(err && err.message ? err.message : err), warnings }, 422);
    }
  },
};
