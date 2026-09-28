/**
 * GeoFix 控制端点 —— 桥接 + 解析 + 一键定位，合成一个脚本。
 *
 *   /geo-settings/*         写坐标 / 查状态 / 恢复
 *   /geo-settings/save?u=…  一键：传地图链接进来，脚本自己解析并写入
 *   /geo-parse?u=…          只解析，返回 JSON
 *
 * 为什么要合成一个：save?u= 得用到解析的坐标系换算。拆成两个远程脚本就只能
 * 靠 $httpClient 再打一次自己的端点（没在真机上验证过），不如合成一个，
 * 同步算完，Node 里也能全量测。
 *
 * 合并自 geo-bridge.js 与 geo-parse.js，只重排结构，逻辑逐字保留。
 */
(() => {
  const VERSION = "1.8.0";
  const SIGNATURE = "geofix-control";
  const MAX_INPUT = 4096;
  const MAX_REDIRECTS = 3;
  const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const SETTINGS_SCHEMA_VERSION = 2;
  const SETTINGS_KEY = "geo_settings";
  const ROUTE_KEY = "geo_route_session";
  const DIAG_KEY = "geo_diag";
  const EVENTS_KEY = "geo_events";
  const env = detectEnv();
  const A = 6378245.0;
  const EE = 0.00669342162296594323;
  const PI = Math.PI;
  const X_PI = (PI * 3000.0) / 180.0;

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
      if (chain > MAX_REDIRECTS) { fail("短链重定向层数过多", warns); return; }
      chain += 1;
      if (err || !resp) { fail("短链展开失败：" + message(err), warns); return; }
      warns.push("输入是短链，已跟随跳转展开");
      const body = String(data || "");
      const direct = tryParse(rawUrl, warns);
      if (direct) { finish(direct, 200, warns); return; }
      const found = fromBody(body, warns);
      if (found) { finish(found, 200, warns); return; }
      fail("短链跳转后仍没找到坐标", warns);
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
  function fail(msg, warns) { respond({ ok: false, error: msg, warnings: warns || [] }, 422); }
  // input 字段：只有发生清洗时才带上，页面据此把输入框改写成干净版本
  function finish(payload, status, warns) {
    respond(Object.assign({ ok: true, signature: SIGNATURE, version: VERSION, checkedAt: Date.now() }, payload),
            status || 200);
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

  const requestUrl = (typeof $request !== "undefined" && $request.url) || "";


  function resolveStaticSettings() {
    const raw = readItem(SETTINGS_KEY);
    if (raw !== null && raw !== undefined && raw !== "") {
      let stored;
      try {
        stored = JSON.parse(raw);
      } catch {
        return { source: "invalid", current: null };
      }
      if (stored && typeof stored === "object" && stored.enabled === false) {
        return { source: "disabled", current: null };
      }
      const current = normalizeStaticSettings(stored, 25);
      return current
        ? { source: "stored", current }
        : { source: "invalid", current: null };
    }

    const fallback = normalizeStaticSettings({
      latitude: args.latitude,
      longitude: args.longitude,
      accuracy: args.accuracy
    }, 25);
    return fallback
      ? { source: "module", current: fallback }
      : { source: "none", current: null };
  }

  function normalizeStaticSettings(value, defaultAccuracy) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const latitude = num(value.latitude ?? value.lat, NaN);
    const longitude = num(value.longitude ?? value.lon, NaN);
    if (!validCoord(latitude, longitude)) return null;
    return Object.assign({}, value, {
      lat: latitude,
      lon: longitude,
      latitude,
      longitude,
      accuracy: clampInt(num(value.accuracy, defaultAccuracy), 5, 200)
    });
  }

  function num(value, fallback) {
    if (value === null || value === undefined) return fallback;
    if (typeof value !== "number" && typeof value !== "string") return fallback;
    if (typeof value === "string" && value.trim() === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const args = parseQuery(typeof $argument === "string" ? $argument : "");
  const query = parseQuery(requestUrl.split("?")[1] || "");

  // 一键形态：https://savues.com/g/<原始地图链接>
  // 链接原样放在路径里 —— 不编码、不加任何后缀参数，这里同步解析并写入。
  // 必须由脚本做完：快捷指令的「获取 URL 内容」不执行页面里的 JavaScript。
  const gHit = requestUrl.match(/\/g\/([\s\S]*)$/);
  const oneShot = !!gHit;
  if (gHit) {
    let link = gHit[1].trim();
    if (!/^https?:\/\//i.test(link) && /%3A%2F%2F/i.test(link)) {
      try { link = decodeURIComponent(link); } catch (e) { /* 用原样 */ }
    }
    query.u = link;
    if (!query.acc) query.acc = "25";
  }

  const action = oneShot ? "save" : actionFromURL(requestUrl, query);

  try {
    // /geo-parse —— 只解析，返回 JSON。合并后的统一入口。
    if (action === "__parse") {
      const raw = String(query.u || query.url || "");
      if (!raw) { respond({ ok: false, error: "缺少参数 u" }, 422); return; }
      if (raw.length > MAX_INPUT) { respond({ ok: false, error: "输入过长（上限 " + MAX_INPUT + " 字符）" }, 422); return; }
      const warnings = [];
      const cleaned = extractUrl(raw);
      let parsed = null;
      try {
        parsed = parseInput(cleaned, warnings);
      } catch (err) {
        // 短链展开是异步的，只能在这个独立端点上做
        if (canExpand(cleaned, err)) { expandThenParse(cleaned, warnings); return; }
        respond({ ok: false, error: message(err), warnings }, 422);
        return;
      }
      respond(Object.assign({ ok: true, signature: SIGNATURE, version: VERSION, checkedAt: Date.now() },
                            cleaned !== raw ? { input: cleaned } : {}, parsed), 200);
      return;
    }
    if (action === "ping") {
      respond({
        ok: true,
        signature: SIGNATURE,
        moduleVersion: VERSION,
        tool: env,
        features: ["ping", "status", "save", "clear", "export", "diag", "route"],
        now: Date.now()
      });
      return;
    }

    if (action === "save") {
      // 一键形态：传地图链接进来，脚本自己解析并写入。
      // 快捷指令的「获取 URL 内容」不执行 JS，所以这一步必须在脚本里做完。
      if (query.u || query.url) {
        const cleaned = extractUrl(String(query.u || query.url));
        const warnings = [];
        // 短链展开是异步的，而这里是同步链路，只能提前拒绝并说清怎么办
        let looksShort = false;
        try {
          const u = new URL(cleaned);
          looksShort = /^https?:$/.test(u.protocol) && !u.search
                       && u.pathname.split("/").filter(Boolean).length <= 1;
        } catch (e) { /* 不是 URL，交给下面 parseInput 报错 */ }
        if (looksShort) throw new Error("这是短链，一键形态只认完整链接；请在浏览器里打开短链、复制展开后的完整地址");
        const parsed = parseInput(cleaned, warnings);
        query.lat = String(parsed.lat);
        query.lon = String(parsed.lon);
        if (!query.name && parsed.name) query.name = parsed.name;
      }
      const lat = Number(query.lat || query.latitude);
      const lon = Number(query.lon || query.lng || query.longitude);
      const accuracy = clampInt(Number(query.accuracy || query.acc || args.accuracy || 25), 5, 200);
      if (!validCoord(lat, lon)) throw new Error("invalid lat/lon");
      const previousSettingsRaw = readItem(SETTINGS_KEY);
      const writtenAt = Date.now();
      const current = {
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        enabled: true,
        lat, lon, latitude: lat, longitude: lon, accuracy,
        source: query.source || "geofix-bridge",
        name: query.name || "",
        updatedAt: writtenAt
      };
      if (writeJSON(SETTINGS_KEY, current) === false) throw new Error("settings storage write failed");
      const persistedCurrent = readJSON(SETTINGS_KEY, null);
      if (!persistedCurrent
          || persistedCurrent.enabled === false
          || Number(persistedCurrent.lat) !== lat
          || Number(persistedCurrent.lon) !== lon
          || Number(persistedCurrent.accuracy) !== accuracy) {
        if (restoreItem(SETTINGS_KEY, previousSettingsRaw) === false) {
          throw new Error("settings storage readback failed; settings rollback failed");
        }
        throw new Error("settings storage readback failed");
      }
      const diag = readDiag();
      diag.mode = "active";
      diag.moduleVersion = VERSION;
      diag.tool = env;
      diag.lastSettingsWriteAt = writtenAt;
      diag.lastError = null;
      diag.updatedAt = Date.now();
      if (writeJSON(DIAG_KEY, diag) === false) {
        if (restoreItem(SETTINGS_KEY, previousSettingsRaw) === false) {
          throw new Error("settings diagnostic write failed; settings rollback failed");
        }
        throw new Error("settings diagnostic write failed");
      }
      const persistedDiag = readDiag();
      if (Number(persistedDiag.lastSettingsWriteAt) !== writtenAt) {
        if (restoreItem(SETTINGS_KEY, previousSettingsRaw) === false) {
          throw new Error("settings diagnostic readback failed; settings rollback failed");
        }
        throw new Error("settings diagnostic readback failed");
      }
      appendEvent("settings_saved", (query.name ? query.name + " — " : "") + lat + "," + lon + " acc=" + accuracy);
      respond(statusPayload(true));
      return;
    }

    if (action === "clear") {
      const previousSettingsRaw = readItem(SETTINGS_KEY);
      const clearedAt = Date.now();
      const tombstone = {
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        enabled: false,
        clearedAt,
        updatedAt: clearedAt
      };
      if (writeJSON(SETTINGS_KEY, tombstone) === false) {
        throw new Error("settings disable write failed");
      }
      const persistedTombstone = readJSON(SETTINGS_KEY, null);
      if (!persistedTombstone
          || Number(persistedTombstone.schemaVersion) !== SETTINGS_SCHEMA_VERSION
          || persistedTombstone.enabled !== false
          || Number(persistedTombstone.clearedAt) !== clearedAt) {
        if (restoreItem(SETTINGS_KEY, previousSettingsRaw) === false) {
          throw new Error("settings disable readback failed; settings rollback failed");
        }
        throw new Error("settings disable readback failed");
      }
      const diag = readDiag();
      diag.mode = activeRoute(readJSON(ROUTE_KEY, null)) ? "route" : "passthrough";
      diag.moduleVersion = VERSION;
      diag.tool = env;
      diag.lastClearAt = clearedAt;
      diag.lastError = null;
      diag.updatedAt = Date.now();
      if (writeJSON(DIAG_KEY, diag) === false) throw new Error("clear diagnostic write failed");
      appendEvent("settings_cleared", "Static coordinate override disabled");
      respond(statusPayload(true));
      return;
    }

    if (action === "export" || action === "diag") {
      respond({
        ok: true,
        signature: SIGNATURE,
        settings: readJSON(SETTINGS_KEY, null),
        diag: readDiag(),
        events: readJSON(EVENTS_KEY, [])
      });
      return;
    }

    respond(statusPayload(true));
  } catch (error) {
    const diag = readDiag();
    diag.lastError = String(error && error.message ? error.message : error);
    diag.updatedAt = Date.now();
    writeJSON(DIAG_KEY, diag);
    respond({ ok: false, error: diag.lastError, moduleVersion: VERSION, tool: env, checkedAt: Date.now() }, 422);
  }


  function statusPayload(ok) {
    const staticState = resolveStaticSettings();
    const current = staticState.current;
    const route = routeStatus(readJSON(ROUTE_KEY, null));
    const diag = readDiag();
    const routeActive = route && (route.state === "running" || route.state === "paused");
    const effectiveCurrent = routeActive && route.current ? route.current : current;
    return {
      ok,
      signature: SIGNATURE,
      moduleVersion: VERSION,
      tool: env,
      mode: routeActive ? "route" : (current ? "active" : "passthrough"),
      current: effectiveCurrent,
      route,
      lastSettingsWriteAt: diag.lastSettingsWriteAt || null,
      lastClearAt: diag.lastClearAt || null,
      lastGeoHitAt: diag.lastGeoHitAt || null,
      lastPatchAt: diag.lastPatchAt || null,
      lastPassthroughAt: diag.lastPassthroughAt || null,
      lastRouteWriteAt: diag.lastRouteWriteAt || null,
      lastRoutePatchAt: diag.lastRoutePatchAt || null,
      patchCount: diag.patchCount || 0,
      passthroughCount: diag.passthroughCount || 0,
      lastError: diag.lastError || null,
      warnings: diag.warnings || [],
      checkedAt: Date.now()
    };
  }

  function readDiag() {
    const staticState = resolveStaticSettings();
    const mode = activeRoute(readJSON(ROUTE_KEY, null)) ? "route" : (staticState.current ? "active" : "passthrough");
    const diag = Object.assign({
      moduleVersion: VERSION,
      tool: env,
      mode,
      lastSettingsWriteAt: null,
      lastClearAt: null,
      lastGeoHitAt: null,
      lastPatchAt: null,
      lastPassthroughAt: null,
      lastRouteWriteAt: null,
      lastRoutePatchAt: null,
      patchCount: 0,
      passthroughCount: 0,
      lastError: null,
      warnings: [],
      updatedAt: Date.now()
    }, readJSON(DIAG_KEY, {}) || {});
    diag.mode = mode;
    return diag;
  }

  function appendEvent(type, message) {
    const events = readJSON(EVENTS_KEY, []);
    events.unshift({ type, time: Date.now(), message });
    writeJSON(EVENTS_KEY, events.slice(0, 20));
  }

  function actionFromURL(url, query) {
    if (/\/geo-parse\b/.test(String(url))) return "__parse";
    if (query.action) return String(query.action).toLowerCase();
    const path = String(url).split("?")[0] || "";
    const match = path.match(/\/geo-settings\/([^/?#]+)/);
    if (match && match[1]) return match[1].toLowerCase();
    return "status";
  }

  function detectEnv() {
    if (typeof $task !== "undefined") return "Quantumult X";
    if (typeof $loon !== "undefined") return "Loon";
    if (typeof $rocket !== "undefined") return "Shadowrocket";
    if (typeof Egern !== "undefined") return "Egern";
    if (typeof $environment !== "undefined" && $environment["surge-version"]) return "Surge";
    if (typeof $environment !== "undefined" && $environment["stash-version"]) return "Stash";
    return "Unknown";
  }

  function parseQuery(raw) {
    const out = {};
    String(raw || "").replace(/^\?/, "").split("&").forEach(part => {
      if (!part) return;
      const index = part.indexOf("=");
      const key = decode(index >= 0 ? part.slice(0, index) : part);
      const value = decode(index >= 0 ? part.slice(index + 1) : "");
      if (!(key in out)) out[key] = value;
    });
    return out;
  }

  function readJSON(key, fallback) {
    const raw = readItem(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function writeJSON(key, value) {
    return writeItem(key, JSON.stringify(value));
  }

  function readItem(key) {
    if (typeof $persistentStore !== "undefined") return $persistentStore.read(key);
    if (typeof $prefs !== "undefined") return $prefs.valueForKey(key);
    return null;
  }

  function writeItem(key, value) {
    if (typeof $persistentStore !== "undefined") return $persistentStore.write(value, key);
    if (typeof $prefs !== "undefined") return $prefs.setValueForKey(value, key);
    return false;
  }

  function removeItem(key) {
    if (typeof $persistentStore !== "undefined") return $persistentStore.write(null, key);
    if (typeof $prefs !== "undefined") return $prefs.removeValueForKey(key);
    return false;
  }

  function restoreItem(key, raw) {
    return raw === null || raw === undefined
      ? removeItem(key)
      : writeItem(key, raw);
  }

  function respond(body, status) {
    const response = {
      status: status || 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify(body)
    };
    if (env === "Quantumult X") {
      response.status = "HTTP/1.1 " + (status || 200) + " OK";
      $done(response);
    } else {
      $done({ response });
    }
  }

  function validCoord(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  }

  function clampInt(value, min, max) {
    value = Math.round(Number.isFinite(value) ? value : min);
    return Math.max(min, Math.min(max, value));
  }

  function routeStatus(route) {
    if (!route || !Array.isArray(route.pts) || route.pts.length < 2) return null;
    const current = routeCoordinate(route, Date.now());
    const elapsed = routeElapsed(route, Date.now());
    const duration = Number(route.totalDurationSec || route.pts[route.pts.length - 1][2] || 0);
    return {
      id: route.id || null,
      name: route.name || "Route",
      state: route.state || "idle",
      current: current ? { lat: current.lat, lon: current.lon, latitude: current.lat, longitude: current.lon, accuracy: clampInt(Number(route.acc || route.accuracy || 25), 5, 200) } : null,
      progress: duration > 0 ? Math.max(0, Math.min(1, normalizeElapsed(elapsed, route) / duration)) : 0,
      elapsedSec: Math.max(0, normalizeElapsed(elapsed, route)),
      totalDurationSec: duration,
      totalDistanceM: Number(route.totalDistanceM || 0),
      updatedAt: Date.now()
    };
  }

  function activeRoute(route) {
    return route && (route.state === "running" || route.state === "paused") && Array.isArray(route.pts) && route.pts.length >= 2;
  }

  function routeCoordinate(route, now) {
    if (!route || !Array.isArray(route.pts) || route.pts.length < 1) return null;
    const elapsed = normalizeElapsed(routeElapsed(route, now), route);
    const pts = route.pts;
    if (elapsed <= Number(pts[0][2] || 0)) return { lat: Number(pts[0][0]), lon: Number(pts[0][1]) };
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const at = Number(a[2] || 0);
      const bt = Number(b[2] || 0);
      if (elapsed <= bt) {
        const ratio = Math.max(0, Math.min(1, (elapsed - at) / Math.max(0.001, bt - at)));
        return { lat: Number(a[0]) + (Number(b[0]) - Number(a[0])) * ratio, lon: Number(a[1]) + (Number(b[1]) - Number(a[1])) * ratio };
      }
    }
    const last = pts[pts.length - 1];
    return { lat: Number(last[0]), lon: Number(last[1]) };
  }

  function routeElapsed(route, now) {
    if (!route) return 0;
    if (route.state === "running" && route.startedAt) return Math.max(0, (now - Number(route.startedAt)) / 1000) * Number(route.speedMultiplier || 1);
    if (route.state === "paused") return Math.max(0, Number(route.elapsedBeforePauseSec || 0));
    if (route.state === "finished") return Number(route.totalDurationSec || 0);
    return 0;
  }

  function normalizeElapsed(elapsed, route) {
    const duration = Number(route.totalDurationSec || (route.pts && route.pts.length ? route.pts[route.pts.length - 1][2] : 0) || 0);
    if (duration <= 0) return 0;
    if (route.loop) {
      const cycle = Math.floor(elapsed / duration);
      const remainder = elapsed % duration;
      if (route.reverseOnLoop && cycle % 2 === 1) return duration - remainder;
      return remainder;
    }
    return Math.max(0, Math.min(duration, elapsed));
  }

  function decode(value) {
    try { return decodeURIComponent(String(value).replace(/\+/g, " ")); } catch { return String(value); }
  }
})();
