/**
 * GeoFix 本地地图链接解析器
 *
 * 把 companion/worker/ 里的解析逻辑收进插件，彻底去掉对第三方解析服务的依赖。
 * 完全在设备本地算：WGS84 / GCJ-02 / BD-09 三种坐标系互转都是纯数学。
 * 只有短链需要发一次出站请求（受控、限跳数、拦内网地址）。
 *
 * 端点： GET https://gs-loc.apple.com/geo-parse?u=<URL 编码后的链接或坐标>
 */
(() => {
  const VERSION = "1.4.0";
  const SIGNATURE = "geofix-local-parse";
  const MAX_INPUT = 4096;
  const MAX_REDIRECTS = 3;
  const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

  const A = 6378245.0;
  const EE = 0.00669342162296594323;
  const PI = Math.PI;
  const X_PI = (PI * 3000.0) / 180.0;

  const requestUrl = (typeof $request !== "undefined" && $request.url) || "";
  const query = parseQuery(String(requestUrl).split("?")[1] || "");
  const rawInput = String(query.u || query.url || "").trim();
  const input = extractUrl(rawInput);

  if (!input) { respond({ ok: false, error: "缺少参数 u" }, 422); return; }
  if (input.length > MAX_INPUT) { respond({ ok: false, error: "输入过长（上限 " + MAX_INPUT + " 字符）" }, 422); return; }

  const warnings = [];
  let parsed = null;
  try {
    parsed = parseInput(input, warnings);
  } catch (err) {
    if (!canExpand(input, err)) { respond({ ok: false, error: message(err), warnings }, 422); return; }
    expandThenParse(input, warnings);
    return;
  }
  if (!parsed) { expandThenParse(input, warnings); return; }
  finish(parsed, 200);

  // 只有「链接里确实没有坐标」才值得去展开短链。
  // 协议不支持、目标地址被拒绝、输入过长这些都不行 —— 否则会绕过私网检查。
  function canExpand(raw, err) {
    if (!/^https?:\/\//i.test(raw)) return false;
    if (err && /只支持|被拒绝|过长|缺少|非法/.test(message(err))) return false;
    let u;
    try { u = new URL(raw); } catch (e) { return false; }
    if (isPrivateHost(u.hostname)) return false;
    // 只有「看起来确实像短链」才去抓：路径只有一段、且没有 query。
    // 完整链接（哪怕没解析出坐标）不该发请求出去。
    const segs = u.pathname.split("/").filter(Boolean);
    const looksShort = segs.length <= 1 && !u.search;
    if (!looksShort) return false;
    if (/\.(js|css|json|png|jpg|svg|xml|rss|mp4)$/i.test(u.pathname)) return false;
    return true;
  }

  // ── 短链：受控展开 ──────────────────────────────────────────────────────
  function expandThenParse(rawUrl, warns) {
    let chain = 0;
    $httpClient.get({ url: rawUrl, headers: { "User-Agent": UA }, followRedirect: true }, (err, resp, data) => {
      if (chain > MAX_REDIRECTS) { fail("短链重定向层数过多"); return; }
      chain += 1;
      if (err || !resp) { fail("短链展开失败：" + message(err)); return; }
      warns.push("输入是短链，已跟随跳转展开");
      const body = String(data || "");
      const direct = tryParse(rawUrl, warns);
      if (direct) { finish(direct, 200); return; }
      const found = fromBody(body, warns);
      if (found) { finish(found, 200); return; }
      fail("短链跳转后仍没找到坐标");
    });
  }

  function fromBody(body, warns) {
    const m = body.match(/(https?:\/\/(?:maps\.apple\.com|maps\.google\.com|uri\.amap\.com|www\.amap\.com|map\.baidu\.com)[^\s"'<>\\]*)/i);
    if (m) {
      const hit = tryParse(m[1].replace(/&amp;/g, "&"), warns);
      if (hit) return hit;
    }
    const g = body.match(/[@!]3d(-?\d+(?:\.\d+)?)[,!4d]+(-?\d+(?:\.\d+)?)/);
    if (g) return toWgs84(Number(g[1]), Number(g[2]), "WGS84", warns, "shortlink-body");
    return null;
  }

  // ── 解析 ────────────────────────────────────────────────────────────────
  function parseInput(raw, warns) {
    let u = null;
    try { u = new URL(raw); } catch (e) { u = null; }
    if (!u) {
      const m = raw.match(/^(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)$/);
      if (!m) throw new Error("既不是合法 URL，也不是裸坐标");
      return withName(toWgs84(Number(m[1]), Number(m[2]), "WGS84", warns, "raw"), null);
    }
    if (!/^https?:$/.test(u.protocol)) throw new Error("只支持 http/https 链接");
    if (isPrivateHost(u.hostname)) throw new Error("目标地址被拒绝");
    const r = tryParse(u, warns);
    if (!r) throw new Error("未能从链接中解析出经纬度");
    return r;
  }

  function tryParse(raw, warns) {
    let u;
    try { u = new URL(raw); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol) || isPrivateHost(u.hostname)) return null;
    try {
      const r = parseUrl(u, warns);
      r.name = nameFrom(u);
      return r;
    } catch (e) {
      return null;
    }
  }

  function parseUrl(u, warns) {
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const q = u.searchParams;
    const isBaidu = host.indexOf("baidu") >= 0;
    const isAmap = host.indexOf("amap") >= 0 || host.indexOf("gaode") >= 0;

    // 1) ?ll= / ?latlon= / ?center= / ?location=
    // coordinate 是 Apple 分享链接真正在用的那个：
    //   maps.apple.com/place?address=…&coordinate=46.263615,2.178741&name=…
    const ll = q.get("ll") || q.get("latlon") || q.get("center") || q.get("location")
            || q.get("coordinate") || q.get("coordinates");
    if (ll && /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(ll)) {
      const p = ll.split(",").map(Number);
      return toWgs84(p[0], p[1], "WGS84", warns, host);
    }

    // 2) 路径里的 @x,y,z —— 各家经纬顺序不统一，用「绝对值>90 的是经度」消歧
    const at = u.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+)z?)?/);
    if (at) {
      const a = Number(at[1]), b = Number(at[2]);
      if (isBaidu) {
        const W = 256 * Math.pow(2, Number(at[3] || 19));
        const lon = (a / W) * 360 - 180;
        const lat = mercYToLat(b / W);
        if (!inChina(lat, lon)) warns.push("百度墨卡托换算结果落在中国境外，请人工复核");
        return toWgs84(lat, lon, "BD-09", warns, host);
      }
      let lat, lon;
      if (Math.abs(a) > 90) { lon = a; lat = b; }
      else if (Math.abs(b) > 90) { lat = a; lon = b; }
      else { lat = isAmap ? b : a; lon = isAmap ? a : b; }
      return toWgs84(lat, lon, isAmap ? "GCJ-02" : "WGS84", warns, host);
    }

    // 3) Google !3d!4d
    const g = u.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (g) return toWgs84(Number(g[1]), Number(g[2]), "WGS84", warns, host);

    // 4) 高德 marker：position=lon,lat
    const pos = q.get("position") || q.get("poi") || q.get("lnglat");
    if (pos && /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(pos)) {
      const p = pos.split(",").map(Number);
      return toWgs84(p[1], p[0], isAmap ? "GCJ-02" : "WGS84", warns, host);
    }

    // 5) 单独的 lat / lon
    const lat = q.get("lat") != null ? q.get("lat") : q.get("latitude");
    let lon = q.get("lon") != null ? q.get("lon") : null;
    if (lon == null) lon = q.get("lng") != null ? q.get("lng") : q.get("longitude");
    if (lat && lon) return toWgs84(Number(lat), Number(lon), "WGS84", warns, host);

    throw new Error("链接里没有坐标");
  }

  function withName(result) { return result; }

  function nameFrom(u) {
    const keys = ["name", "q", "query", "wd", "keyword", "title"];
    for (const k of keys) {
      const v = u.searchParams.get(k);
      if (v) { try { return decodeURIComponent(v).trim(); } catch (e) { return v.trim(); } }
    }
    const segs = decodeURIComponent(u.pathname).split("/").filter(Boolean);
    for (const s of segs) {
      if (/^(poi|place|search|detail|m|marker|addr|address|results|list)$/i.test(s)) continue;
      if (/^@?\d/.test(s) || /^!3d/.test(s)) continue;
      const cleaned = s.replace(/!3d.*$/, "").replace(/[@,].*$/, "").replace(/[-_+]/g, " ").trim();
      if (cleaned) return cleaned;
    }
    return "";
  }

  // ── 坐标系 ──────────────────────────────────────────────────────────────
  function inChina(lat, lon) { return lon > 73.66 && lon < 135.05 && lat > 3.86 && lat < 53.55; }

  function transformLat(x, y) {
    let r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
    r += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0) / 3.0;
    r += ((160.0 * Math.sin((y / 12.0) * PI) + 320.0 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
    return r;
  }
  function transformLon(x, y) {
    let r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
    r += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
    r += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
    return r;
  }
  function wgs84ToGcj02(lon, lat) {
    if (!inChina(lat, lon)) return [lon, lat];
    let dLat = transformLat(lon - 105.0, lat - 35.0);
    let dLng = transformLon(lon - 105.0, lat - 35.0);
    const radLat = (lat / 180.0) * PI;
    let magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
    dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
    return [lon + dLng, lat + dLat];
  }
  function gcj02ToWgs84(lon, lat) {
    if (!inChina(lat, lon)) return [lon, lat];
    let wLon = lon, wLat = lat;
    for (let i = 0; i < 6; i++) {
      const g = wgs84ToGcj02(wLon, wLat);
      wLon += lon - g[0];
      wLat += lat - g[1];
    }
    return [wLon, wLat];
  }
  function bd09ToGcj02(lon, lat) {
    const x = lon - 0.0065, y = lat - 0.006;
    const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
    const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
    return [z * Math.cos(theta), z * Math.sin(theta)];
  }
  function mercYToLat(y) { return (Math.atan(Math.sinh(PI * (1 - 2 * y))) * 180.0) / PI; }

  function toWgs84(lat, lon, system, warns, source) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new Error("坐标超出合法范围");
    }
    let outLat = lat, outLon = lon;
    if (system === "BD-09") {
      const g = bd09ToGcj02(lon, lat);
      const w = gcj02ToWgs84(g[0], g[1]);
      outLon = w[0]; outLat = w[1];
      warns.push("BD-09 → GCJ-02 → WGS84 双重换算，累计误差可达数米");
    } else if (system === "GCJ-02") {
      const w = gcj02ToWgs84(lon, lat);
      outLon = w[0]; outLat = w[1];
    } else if (system !== "WGS84") {
      throw new Error("未知坐标系 " + system);
    }
    if (system !== "WGS84" && !inChina(lat, lon)) {
      warns.push("境外坐标仍套用了国内偏移，结果可能有偏差");
    }
    const r6 = (n) => Math.round(n * 1e6) / 1e6;
    return {
      lat: r6(outLat),
      lon: r6(outLon),
      name: "",
      system: "WGS84",
      originalSystem: system,
      source: source || "",
      confidence: system === "WGS84" ? 0.95 : 0.85,
      warnings: warns
    };
  }

  // ── 工具 ────────────────────────────────────────────────────────────────
  function isPrivateHost(host) {
    return /^(localhost$|.*\.local$|.*\.internal$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0$|\[?::1\]?$|metadata\.)/i.test(String(host));
  }
  function message(e) { return String(e && e.message ? e.message : e); }
  function parseQuery(raw) {
    const out = {};
    String(raw || "").replace(/^\?/, "").split("&").forEach(function (part) {
      if (!part) return;
      const i = part.indexOf("=");
      const k = decode(i >= 0 ? part.slice(0, i) : part);
      if (!(k in out)) out[k] = decode(i >= 0 ? part.slice(i + 1) : "");
    });
    return out;
  }
  function decode(v) {
    try { return decodeURIComponent(String(v).replace(/\+/g, " ")); } catch (e) { return String(v); }
  }
  function fail(msg) { respond({ ok: false, error: msg, warnings }, 422); }
  // input 字段：只有发生清洗时才带上，页面据此把输入框改写成干净版本
  function finish(payload, status) {
    respond(Object.assign({ ok: true, signature: SIGNATURE, version: VERSION, checkedAt: Date.now() },
                          input !== rawInput ? { input: input } : {}, payload), status);
  }

  // 地图 App 分享到快捷指令时，经常在链接前面粘一段地点/收藏夹名：
  //   "日内瓦地图项目https://maps.apple.com/place?address=…"
  // 只取从第一个 http 开始的部分，后面第一个空白也切掉（尾随文字同样会污染 query）。
  function extractUrl(raw) {
    const s = String(raw).trim();
    if (/^https?:\/\//i.test(s) || /^-?\d/.test(s)) return s;
    const m = s.match(/https?:\/\//i);
    if (m) {
      return s.slice(m.index).split(/[\s\u3000]+/)[0].replace(/[\uff0c\u3002\u3001,;\uff1b)\uff09\u3011\]\u300d]+\s*$/, "");
    }
    const c = s.match(/(-?\d+(?:\.\d+)?\s*[,，]\s*-?\d+(?:\.\d+)?)/);
    return c ? c[1].replace(/[\s\u3000]/g, "") : s;
  }
  function respond(payload, status) {
    if (typeof $done === "function") {
      $done({
        response: {
          status: status || 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store"
          },
          body: JSON.stringify(payload)
        }
      });
    }
  }
})();
