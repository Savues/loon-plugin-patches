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

 本脚本只做一件事：把 INJECT 追加到 bundle 尾部。任何异常都原样放行。
*/

var body = $response.body || '';

// 只处理真正的游戏 bundle；拿不到特征串就放行
if (body.indexOf('webpackChunk_ali_pegasus_project_taocoin_home') === -1) {
  $done({});
} else if (body.indexOf('__TJB_AUTO__') !== -1) {
  $done({}); // 已注入过（避免重复加载时叠加）
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
    gapMs: num(arg.gapMs, 2500),
    idleMs: num(arg.idleMs, 8000),
    maxRounds: num(arg.maxRounds, 30)
  };

  var INJECT = '\n;/*__TJB_AUTO__*/(function(){\n' +
    'if (window.__TJB_AUTO__) return; window.__TJB_AUTO__ = 1;\n' +
    'var CFG = ' + JSON.stringify(CFG) + ';\n' +
    'var TAG = "[TJB]";\n' +
    'function log(){ try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }\n' +

    /* ---------- webpack 运行时 ---------- */
    'function req(){\n' +
    '  if (window.__TJB_REQ) return window.__TJB_REQ;\n' +
    '  var q = self.webpackChunk_ali_pegasus_project_taocoin_home;\n' +
    '  if (!q || !q.push) return null;\n' +
    /* 只推一次：若此刻 main.js 运行时还没接管，push 只是普通数组追加，
       等运行时安装后它会 forEach 处理历史元素，同样能拿到 require */
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
    /* 模块 64003（按导出特征找，不写死 id，抗版本升级） */
    'function api(){ return scan(function (e) { return e && typeof e.lv === "function" && typeof e.YN === "function" && typeof e.a_ === "function"; }); }\n' +
    /* mx 总线（store / event） */
    'function bus(){\n' +
    '  var m = scan(function (e) { return e && e.mx && e.mx.store && typeof e.mx.store.get === "function"; });\n' +
    '  if (m) return m.mx;\n' +
    '  return scan(function (e) { return e && e.store && typeof e.store.get === "function" && e.event && typeof e.event.emit === "function"; });\n' +
    '}\n' +
    'function userInfo(){ var b = bus(); if (!b) return null; try { return b.store.get("UserInfo") || null; } catch (e) { return null; } }\n' +

    /* ---------- 降级动画：用静态图替代 lottie ---------- */
    'if (CFG.liteAnim) {\n' +
    '  try {\n' +
    '    Object.defineProperty(window, "$deviceLevel", {\n' +
    '      configurable: true,\n' +
    '      get: function () { return "low_end"; },\n' +
    '      set: function () {}\n' +
    '    });\n' +
    '  } catch (e) { try { window.$deviceLevel = "low_end"; } catch (e2) {} }\n' +
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
    'var rounds = 0, lastEnergy = -1, stuck = 0, running = false;\n' +
    'function later(ms){ if (CFG.maxRounds > 0 && rounds >= CFG.maxRounds) { log("maxRounds reached"); return; } setTimeout(tick, ms); }\n' +
    'function hdFrom(){ try { return (location.search.match(/[?&]hd_from=([^&]*)/) || [])[1] || ""; } catch (e) { return ""; } }\n' +
    'function tick(){\n' +
    '  if (!CFG.autoFeed || running) return;\n' +
    '  var a = api(), b = bus();\n' +
    '  if (!a || !b) { return later(1000); }\n' +
    '  var ui = userInfo();\n' +
    '  if (!ui) { return later(1500); }\n' +
    '  var energy = Number(ui.toolAmount || 0), cost = Number(ui.singleEnergyCost || 0), max = Number(ui.maxWalkGrids || 0);\n' +
    '  if (!cost || cost <= 0) { return later(2000); }\n' +
    /* 真机模型（2026-10-30 沙盒 SSR）：level<4 时 canBatchWalk=false，长按只能 1 格 SINGLE */
    '  var canBatch = ui.canBatchWalk === true || ui.canBatchWalk === "true";\n' +
    '  var canUp = ui.canUpgrade === true || ui.canUpgrade === "true";\n' +
    '  if (ui.levelFull === true || ui.levelFull === "true") { return later(60000); }\n' +
    /* 经验满 → 先升级（升级接口才是进度推进），否则喂了也白喂 */
    '  if (canUp) {\n' +
    '    if (a.x$) { try { a.x$(); log("upgrade"); } catch (e) {} }\n' +
    '    return later(CFG.gapMs);\n' +
    '  }\n' +
    '  if (energy < cost) {\n' +
    '    if (CFG.drawEnergy) { try { a.YN(); } catch (e) {} }\n' +
    '    return later(CFG.idleMs);\n' +
    '  }\n' +
    '  var n = canBatch ? Math.floor(energy / cost) : 1;\n' +
    '  if (canBatch && max > 0) n = Math.min(n, max);\n' +
    '  if (n < 1) return later(CFG.idleMs);\n' +
    '  var op = canBatch ? "EXHAUST_ENERGY" : "SINGLE";\n' +
    '  if (energy === lastEnergy) { stuck++; } else { stuck = 0; lastEnergy = energy; }\n' +
    '  if (stuck >= 3) { log("energy stuck, backoff"); return later(30000); }\n' +
    '  running = true;\n' +
    '  log("feed", n, "grids | op", op, "| energy", energy, "cost", cost);\n' +
    '  Promise.resolve()\n' +
    '    .then(function () { return a.lv({ walkGridNum: n, operationType: op, displayedSingleEnergyCost: cost, hd_from: hdFrom() }); })\n' +
    '    .then(function (res) {\n' +
    '      var ui2 = res && (res.userInfo || (res.model && res.model.userInfo));\n' +
    '      if (ui2) { try { b.store.update("UserInfo", ui2); } catch (e) {} return; }\n' +
    '      return a.a_().then(function (m) { if (m && m.userInfo) { try { b.store.update("UserInfo", m.userInfo); } catch (e) {} } });\n' +
    '    })\n' +
    '    .catch(function (e) { log("feed err", e && (e.errorCode || e.errorMsg || e.message || e)); })\n' +
    '    .then(function () { running = false; rounds++; later(CFG.gapMs); });\n' +
    '}\n' +
    'setTimeout(tick, 2500);\n' +
    'log("injected", JSON.stringify(CFG));\n' +
    '})();\n';

  $done({ body: body + INJECT });
}
