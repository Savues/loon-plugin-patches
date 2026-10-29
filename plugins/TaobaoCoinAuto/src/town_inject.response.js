/*
 淘金币小镇（双11 小游戏）· 自动喂能量 / 自动跳过升级动画

 通道判定（2026-10-30 取证）：
   - 页面：https://pages-fast.m.taobao.com/wow/z/tmtjb/town/home（淘宝 WebView 内 H5）
   - 前端包：https://g.alicdn.com/code/npm/@ali/pegasus-project-taocoin-home/<ver>/js/p_index.js
   - 喂养接口：mtop.taobao.ia.foundation.feed {productCode:"promotion1111",
               bizParams:{walkGridNum, operationType, displayedSingleEnergyCost, hd_from}}
   - 页面 URL 带 x-sec=wua，请求头 x-sign / x-mini-wua / x-sgext / x-umt 全部由原生安全 SDK 生成
     → Loon 无法伪造签名，纯 HTTP 重放/定时调用必被拒
   → 唯一可行路线：MITM 改写 p_index.js，在页面内调用它自己的封装（签名由 WebView 原生层补）

 本脚本做三件事：
   1. 把 INJECT 追加到 bundle 尾部
   2. 响应头改成 no-store —— WebKit 的 NetworkCache 会长期缓存这个 2.2MB 的 JS，
      不清掉的话下次加载根本不发请求，脚本永远不会执行（2026-10-30 实测）
   3. 注入成功弹通知
 任何异常都原样放行。
*/

var body = $response.body || '';

/* 让 WebKit 不要缓存这个 bundle */
function noStore(extra) {
  var h = {};
  var src = $response.headers || {};
  for (var k in src) {
    var lk = String(k).toLowerCase();
    if (lk === 'cache-control' || lk === 'expires' || lk === 'pragma' || lk === 'etag' || lk === 'last-modified' || lk === 'age') continue;
    h[k] = src[k];
  }
  h['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0';
  h['Pragma'] = 'no-cache';
  if (extra && extra.body !== undefined) h['Content-Length'] = String(extra.body.length);
  var out = { headers: h };
  if (extra && extra.body !== undefined) out.body = extra.body;
  return out;
}

// 只处理真正的游戏 bundle；拿不到特征串就放行
if (body.indexOf('webpackChunk_ali_pegasus_project_taocoin_home') === -1) {
  $done({});
} else if (body.indexOf('__TJB_AUTO__') !== -1) {
  $done(noStore({})); // 已注入过（避免重复加载时叠加），但仍要禁缓存
} else {
  var arg = $argument || {};
  function on(v, dflt) {
    if (v === undefined || v === null || v === '') return dflt;
    return String(v).toLowerCase() === 'true' || String(v) === '1';
  }
  function num(v, dflt) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : dflt;
  }

  var CFG = {
    autoFeed: on(arg.autoFeed, true),
    skipUpgradeAnim: on(arg.skipUpgradeAnim, true),
    liteAnim: on(arg.liteAnim, false),
    drawEnergy: on(arg.drawEnergy, true),
    debugPanel: on(arg.debugPanel, true),
    gapMs: num(arg.gapMs, 2500),
    idleMs: num(arg.idleMs, 8000),
    maxRounds: num(arg.maxRounds, 30)
  };

  var INJECT = '\n;/*__TJB_AUTO__*/(function(){\n' +
    'if (window.__TJB_AUTO__) return; window.__TJB_AUTO__ = 1;\n' +
    'var CFG = ' + JSON.stringify(CFG) + ';\n' +
    'var VERSION = "0.1.2";\n' +
    'var TAG = "[TJB]";\n' +
    'function log(){ try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }\n' +

    /* ---------- 诊断面板 ---------- */
    'var panelEl = null, panelLines = [];\n' +
    'function panel(lines){\n' +
    '  panelLines = lines;\n' +
    '  if (!CFG.debugPanel) return;\n' +
    '  try {\n' +
    '    if (!panelEl || !panelEl.parentNode) {\n' +
    '      panelEl = document.createElement("div");\n' +
    '      panelEl.style.cssText = "position:fixed;left:6px;bottom:6px;z-index:2147483647;max-width:88vw;padding:6px 8px;border-radius:8px;background:rgba(0,0,0,.78);color:#7dff7d;font:10px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap;pointer-events:none;word-break:break-all";\n' +
    '      (document.body || document.documentElement).appendChild(panelEl);\n' +
    '    }\n' +
    '    panelEl.textContent = "TJB v" + VERSION + "\\n" + lines.join("\\n");\n' +
    '  } catch (e) {}\n' +
    '}\n' +

    /* ---------- 信标：状态写进 HAR，肉眼看不到也能取证 ---------- */
    'var beaconAt = 0;\n' +
    'function beacon(state){\n' +
    '  var now = Date.now();\n' +
    '  if (now - beaconAt < 3000) return;\n' +
    '  beaconAt = now;\n' +
    '  try {\n' +
    '    var q = "?v=" + VERSION + "&t=" + now + "&d=" + encodeURIComponent(state);\n' +
    '    fetch("https://g.alicdn.com/gw/loon-sim.probe.taobaocoinauto/beacon" + q, { mode: "no-cors", cache: "no-store" }).catch(function(){});\n' +
    '  } catch (e) {}\n' +
    '}\n' +

    /* ---------- webpack 运行时 ---------- */
    'function req(){\n' +
    '  if (window.__TJB_REQ) return window.__TJB_REQ;\n' +
    '  var q = self.webpackChunk_ali_pegasus_project_taocoin_home;\n' +
    '  if (!q || !q.push) return null;\n' +
    '  if (!window.__TJB_PUSHED) {\n' +
    '    window.__TJB_PUSHED = 1;\n' +
    '    try { q.push([[Math.floor(Math.random() * 1e9)], {}, function (r) { window.__TJB_REQ = r; }]); }\n' +
    '    catch (e) { log("req err", e); }\n' +
    '  }\n' +
    '  return window.__TJB_REQ || null;\n' +
    '}\n' +
    'function scan(pred){\n' +
    '  var r = req(); if (!r) return null;\n' +
    '  var cache = r.c || {};\n' +
    '  for (var id in cache) {\n' +
    '    var ex; try { ex = cache[id] && cache[id].exports; } catch (e) { continue; }\n' +
    '    if (!ex) continue;\n' +
    '    try { if (pred(ex)) return ex; } catch (e) {}\n' +
    '  }\n' +
    '  return null;\n' +
    '}\n' +
    'function api(){ return scan(function (e) { return e && typeof e.lv === "function" && typeof e.YN === "function" && typeof e.a_ === "function"; }); }\n' +
    'function bus(){\n' +
    '  var m = scan(function (e) { return e && e.mx && e.mx.store && typeof e.mx.store.get === "function"; });\n' +
    '  if (m) return m.mx;\n' +
    '  return scan(function (e) { return e && e.store && typeof e.store.get === "function" && e.event && typeof e.event.emit === "function"; });\n' +
    '}\n' +
    'function userInfo(){ var b = bus(); if (!b) return null; try { return b.store.get("UserInfo") || null; } catch (e) { return null; } }\n' +

    /* ---------- 降级动画 ---------- */
    'if (CFG.liteAnim) {\n' +
    '  try { Object.defineProperty(window, "$deviceLevel", { configurable: true, get: function () { return "low_end"; }, set: function () {} }); }\n' +
    '  catch (e) { try { window.$deviceLevel = "low_end"; } catch (e2) {} }\n' +
    '}\n' +

    /* ---------- 自动跳过升级动画 ---------- */
    'if (CFG.skipUpgradeAnim) {\n' +
    '  setInterval(function () {\n' +
    '    var els = document.querySelectorAll(".hd_skip_upgrade_btn");\n' +
    '    for (var i = 0; i < els.length; i++) {\n' +
    '      var el = els[i];\n' +
    '      if (el.__tjbClicked) continue;\n' +
    '      var op = 1;\n' +
    '      try { op = parseFloat(getComputedStyle(el).opacity); } catch (e) {}\n' +
    '      if (op > 0.05) { el.__tjbClicked = 1; try { el.click(); log("skip upgrade anim"); } catch (e) {} }\n' +
    '    }\n' +
    '  }, 150);\n' +
    '}\n' +

    /* ---------- 自动喂能量 ---------- */
    'var rounds = 0, lastEnergy = -1, stuck = 0, running = false, lastErr = "-", mode = "api";\n' +
    'function later(ms){ if (CFG.maxRounds > 0 && rounds >= CFG.maxRounds) { panel(["maxRounds " + rounds + " 已到上限"]); return; } setTimeout(tick, ms); }\n' +
    'function hdFrom(){ try { return (location.search.match(/[?&]hd_from=([^&]*)/) || [])[1] || ""; } catch (e) { return ""; } }\n' +
    'function fireTouch(el, type){\n' +
    '  try {\n' +
    '    var t = new Touch({ identifier: 1, target: el, clientX: 10, clientY: 10, pageX: 10, pageY: 10 });\n' +
    '    var ev = new TouchEvent(type, { touches: type === "touchend" ? [] : [t], targetTouches: [], changedTouches: [t], bubbles: true, cancelable: true });\n' +
    '    el.dispatchEvent(ev); return true;\n' +
    '  } catch (e) { return false; }\n' +
    '}\n' +
    'function domPress(){\n' +
    '  var btn = document.querySelector(".hd_normal_mainbtn");\n' +
    '  if (!btn) { lastErr = "no mainbtn"; return false; }\n' +
    '  fireTouch(btn, "touchstart");\n' +
    '  setTimeout(function () { fireTouch(btn, "touchend"); rounds++; later(CFG.gapMs); }, 1700);\n' +
    '  return true;\n' +
    '}\n' +
    'function tick(){\n' +
    '  if (!CFG.autoFeed || running) return;\n' +
    '  var a = api(), b = bus(), ui = userInfo();\n' +
    '  var st = "req=" + (window.__TJB_REQ ? 1 : 0) + " api=" + (a ? 1 : 0) + " bus=" + (b ? 1 : 0) + " ui=" + (ui ? 1 : 0);\n' +
    '  if (!ui) {\n' +
    '    mode = (a && b) ? "api" : "dom";\n' +
    '    panel([st, "mode=" + mode + " rounds=" + rounds, "err=" + lastErr]);\n' +
    '    beacon(st + "&mode=" + mode);\n' +
    '    if (mode === "dom") { if (domPress()) return; }\n' +
    '    return later(1500);\n' +
    '  }\n' +
    '  var energy = Number(ui.toolAmount || 0), cost = Number(ui.singleEnergyCost || 0), max = Number(ui.maxWalkGrids || 0);\n' +
    '  var canBatch = ui.canBatchWalk === true || ui.canBatchWalk === "true";\n' +
    '  var canUp = ui.canUpgrade === true || ui.canUpgrade === "true";\n' +
    '  panel([st, "e=" + energy + " c=" + cost + " max=" + max, "batch=" + (canBatch ? 1 : 0) + " up=" + (canUp ? 1 : 0) + " lv=" + (ui.level || "-"), "rounds=" + rounds + " err=" + lastErr]);\n' +
    '  beacon(st + "&e=" + energy + "&c=" + cost + "&lv=" + (ui.level || "") + "&r=" + rounds);\n' +
    '  if (!cost || cost <= 0) { return later(2000); }\n' +
    '  if (ui.levelFull === true || ui.levelFull === "true") { return later(60000); }\n' +
    '  if (canUp) {\n' +
    '    if (a && a.x$) { try { a.x$(); log("upgrade"); } catch (e) {} }\n' +
    '    return later(CFG.gapMs);\n' +
    '  }\n' +
    '  if (energy < cost) {\n' +
    '    if (CFG.drawEnergy && a && a.YN) { try { a.YN(); } catch (e) {} }\n' +
    '    return later(CFG.idleMs);\n' +
    '  }\n' +
    '  if (!a) { if (domPress()) return; return later(1500); }\n' +
    '  var n = canBatch ? Math.floor(energy / cost) : 1;\n' +
    '  if (canBatch && max > 0) n = Math.min(n, max);\n' +
    '  if (n < 1) return later(CFG.idleMs);\n' +
    '  var op = canBatch ? "EXHAUST_ENERGY" : "SINGLE";\n' +
    '  if (energy === lastEnergy) { stuck++; } else { stuck = 0; lastEnergy = energy; }\n' +
    '  if (stuck >= 3) { lastErr = "energy stuck"; return later(30000); }\n' +
    '  running = true;\n' +
    '  log("feed", n, "grids | op", op, "| energy", energy, "cost", cost);\n' +
    '  Promise.resolve()\n' +
    '    .then(function () { return a.lv({ walkGridNum: n, operationType: op, displayedSingleEnergyCost: cost, hd_from: hdFrom() }); })\n' +
    '    .then(function (res) {\n' +
    '      var ui2 = res && (res.userInfo || (res.model && res.model.userInfo));\n' +
    '      if (ui2) { try { b.store.update("UserInfo", ui2); } catch (e) {} return; }\n' +
    '      return a.a_().then(function (m) { if (m && m.userInfo) { try { b.store.update("UserInfo", m.userInfo); } catch (e) {} } });\n' +
    '    })\n' +
    '    .catch(function (e) { lastErr = String(e && (e.errorCode || e.errorMsg || e.message || e)).slice(0, 40); log("feed err", lastErr); })\n' +
    '    .then(function () { running = false; rounds++; later(CFG.gapMs); });\n' +
    '}\n' +
    'setTimeout(tick, 2500);\n' +
    'log("injected", VERSION, JSON.stringify(CFG));\n' +
    '})();\n';

  // 注入成功给个通知：真机上唯一能确认「脚本真的跑了」的信号
  try { $notify('淘金币小镇', '注入成功 v0.1.2', 'p_index.js ' + body.length + 'B → 已追加自动化'); } catch (e) {}

  $done(noStore({ body: body + INJECT }));
}
