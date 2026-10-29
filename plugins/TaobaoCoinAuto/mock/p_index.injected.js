/* 本地模拟：淘宝小镇页的「p_index.js」——页面业务 bundle
   字段与数值取自真机沙盒 SSR 模型（2026-10-30，iPhone 淘宝 10.68.10）：
     userInfo = { toolAmount:1100, singleEnergyCost:100, maxWalkGrids:50,
                  level:2, canBatchWalk:false, batchWalkMsg:"达到4级后解锁连续升级",
                  canUpgrade:false, levelFull:false }
   模块结构对齐线上 2.6.2：79527(productCode) / 19835(mtop) / 64003(业务) / 9000(UI) */
(self.webpackChunk_ali_pegasus_project_taocoin_home =
  self.webpackChunk_ali_pegasus_project_taocoin_home || []).push(
  [[2767], {
    /* ---- 79527：productCode ---- */
    79527: function (e, t, n) {
      n.d(t, { g: function () { return i; }, U: function () { return o; } });
      var i = "promotion1111";
      var o = "26-11";
    },

    /* ---- 19835：mtop 封装（假网络） ---- */
    19835: function (e, t, n) {
      n.d(t, { yf: function () { return m; }, NG: function () { return f; } });
      function call(api, data) {
        if (window.__mockLog) window.__mockLog("mtop → " + api + " " + JSON.stringify(data));
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(window.__mockNet(api, data)); }, 260);
        });
      }
      function m(api, data) { return call(api, data); }
      function f(api, data) { return call(api, data); }
    },

    /* ---- 64003：游戏业务接口（与线上同名导出） ---- */
    64003: function (e, t, n) {
      n.d(t, {
        V7: function () { return h; }, YN: function () { return N; },
        a_: function () { return f; }, lv: function () { return y; },
        x$: function () { return b; }
      });
      var v = n(79527), p = n(19835);
      function f() { return p.yf("mtop.taobao.ia.foundation.homepage", { productCode: v.g }); }
      function h() { return p.NG("mtop.taobao.ia.foundation.refresh", { productCode: v.g }); }
      function y(o) {
        return p.yf("mtop.taobao.ia.foundation.feed", {
          productCode: v.g,
          bizParams: JSON.stringify({
            walkGridNum: o.walkGridNum,
            operationType: o.operationType,
            displayedSingleEnergyCost: o.displayedSingleEnergyCost,
            hd_from: o.hd_from || ""
          })
        });
      }
      function N() { return p.NG("mtop.taobao.ia.foundation.set", { productCode: v.g, bizInterface: "drawTomEnergy" }); }
      function b() { return p.NG("mtop.taobao.ia.foundation.upgrade", { productCode: v.g }); }
    },

    /* ---- 9000：页面 UI + 假服务端 ---- */
    9000: function (e, t, n) {
      var mx = n(15280).mx;
      var api = n(64003);
      var drawCount = 0;

      /* 真机 SSR 模型同款字段（可用 ?level=&energy=&exp= 覆盖，便于测试不同档位） */
      var qs = {};
      (location.search || "").replace(/[?&]([^=&]+)=([^&]*)/g, function (_, k, v) { qs[k] = decodeURIComponent(v); });
      var startLevel = Number(qs.level) || 2;
      var ui = {
        toolAmount: Number(qs.energy) || 1100, singleEnergyCost: 100, maxWalkGrids: 50,
        level: startLevel, exp: Number(qs.exp) || 0, expMax: 100, coin: 103947,
        canBatchWalk: startLevel >= 4, canUpgrade: false, levelFull: false,
        batchWalkMsg: startLevel >= 4 ? "长按可连续升级" : "达到4级后解锁连续升级"
      };
      mx.store.update("UserInfo", ui);

      function log(s) {
        var el = document.getElementById("log");
        if (!el) return;
        var d = document.createElement("div");
        d.textContent = s;
        el.insertBefore(d, el.firstChild);
        while (el.childNodes.length > 30) el.removeChild(el.lastChild);
      }
      window.__mockLog = log;

      window.__mockNet = function (name, data) {
        if (name.indexOf("foundation.feed") > -1) {
          var bp = {};
          try { bp = JSON.parse(data.bizParams); } catch (e) {}
          var want = Number(bp.walkGridNum) || 0;
          if (!ui.canBatchWalk && want > 1) {
            log("❌ 服务端拒绝：未解锁连续升级（canBatchWalk=false）");
            return { success: false, errorCode: "BIZ_BATCH_WALK_NOT_UNLOCK" };
          }
          var n2 = Math.min(want, Math.floor(ui.toolAmount / ui.singleEnergyCost));
          if (n2 < 1) return { success: false, errorCode: "BIZ_ENERGY_NOT_ENOUGH" };
          ui.toolAmount -= n2 * ui.singleEnergyCost;
          ui.coin += n2 * 2;
          ui.exp += n2;
          if (ui.exp >= ui.expMax && !ui.levelFull) { ui.exp = ui.expMax; ui.canUpgrade = true; }
          mx.store.update("UserInfo", ui);
          log("feed 成功 " + n2 + " 格（" + bp.operationType + "）· 消耗 " + (n2 * ui.singleEnergyCost) + " 能量");
          return { success: true, userInfo: ui };
        }
        if (name.indexOf("foundation.upgrade") > -1) {
          if (!ui.canUpgrade) return { success: false, errorCode: "BIZ_EXP_NOT_FULL" };
          ui.level += 1; ui.exp = 0; ui.canUpgrade = false;
          ui.canBatchWalk = ui.level >= 4;
          ui.batchWalkMsg = ui.canBatchWalk ? "长按可连续升级" : "达到4级后解锁连续升级";
          mx.store.update("UserInfo", ui);
          log("⬆ 升级成功 → Lv." + ui.level + (ui.canBatchWalk ? "（已解锁连续升级）" : ""));
          onLevelUp();
          return { success: true, userInfo: ui };
        }
        if (name.indexOf("foundation.set") > -1) {
          if (drawCount >= 2) { log("drawTomEnergy 今日次数已用完"); return { success: false, errorCode: "BIZ_DRAW_LIMIT" }; }
          drawCount++;
          ui.toolAmount = Math.min(ui.toolAmount + 2000, 20000);
          mx.store.update("UserInfo", ui);
          log("drawTomEnergy +2000（第 " + drawCount + " 次）");
          return { success: true, userInfo: ui };
        }
        if (name.indexOf("foundation.homepage") > -1) return { userInfo: ui };
        return { success: true, userInfo: ui };
      };

      /* ---------- 升级动画浮层（真机：6 秒倒计时 + 跳过按钮） ---------- */
      var upTimer = null;
      function onLevelUp() {
        var layer = document.getElementById("upgradeLayer");
        layer.style.display = "flex";
        clearTimeout(upTimer);
        upTimer = setTimeout(closeUpgrade, 6000);
      }
      function closeUpgrade() {
        var layer = document.getElementById("upgradeLayer");
        if (layer.style.display === "none") return;
        layer.style.display = "none";
        clearTimeout(upTimer);
        log("升级动画结束");
      }
      window.__mockCloseUpgrade = closeUpgrade;

      /* ---------- 主按钮：与线上 he() 同逻辑 ---------- */
      var pressStart = 0, pressed = false;
      function onStart() { pressed = true; pressStart = Date.now(); }
      function onEnd() {
        if (!pressed) return;
        pressed = false;
        var dur = Date.now() - pressStart;
        var cost = ui.singleEnergyCost;
        if (ui.toolAmount < cost) { log("没有能量，快做任务赚能量"); return; }
        var grids = 1, type = "SINGLE";
        if (dur >= 1500 && ui.canBatchWalk) {
          grids = Math.min(Math.floor(ui.toolAmount / cost), ui.maxWalkGrids);
          type = "EXHAUST_ENERGY";
        }
        api.lv({ walkGridNum: grids, operationType: type, displayedSingleEnergyCost: cost })
          .then(function (r) { if (r.userInfo) mx.store.update("UserInfo", r.userInfo); });
      }
      var btn = document.querySelector(".hd_normal_mainbtn");
      btn.addEventListener("touchstart", onStart);
      btn.addEventListener("touchend", onEnd);
      btn.addEventListener("mousedown", onStart);
      btn.addEventListener("mouseup", onEnd);
      document.querySelector(".hd_skip_upgrade_btn").addEventListener("click", function () {
        log("点「跳过」→ 立即结束升级动画");
        closeUpgrade();
      });

      function render() {
        document.getElementById("energy").textContent = ui.toolAmount;
        document.getElementById("level").textContent = "Lv." + ui.level;
        document.getElementById("exp").textContent = ui.exp + " / " + ui.expMax;
        document.getElementById("coin").textContent = ui.coin;
        document.getElementById("state").textContent =
          (ui.canBatchWalk ? "连续升级已解锁" : "连续升级未解锁") + (ui.canUpgrade ? " · 可升级" : "");
      }
      window.__mockRender = render;
      window.__mockOnStoreUpdate = function (k) { if (k === "UserInfo" && window.__mockRender) window.__mockRender(); };
      render();
      log("页面就绪：能量 " + ui.toolAmount + " · 单次消耗 " + ui.singleEnergyCost + " · 上限 " + ui.maxWalkGrids + " 格 · Lv." + ui.level);
    }
  }, function (req) {
    req(9000);
  }]);

;/*__TJB_AUTO__*/(function(){
if (window.__TJB_AUTO__) return; window.__TJB_AUTO__ = 1;
var CFG = {"autoFeed":true,"skipUpgradeAnim":true,"liteAnim":false,"drawEnergy":true,"gapMs":2500,"idleMs":8000,"maxRounds":30};
var TAG = "[TJB]";
function log(){ try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }
function req(){
  if (window.__TJB_REQ) return window.__TJB_REQ;
  var q = self.webpackChunk_ali_pegasus_project_taocoin_home;
  if (!q || !q.push) return null;
  if (!window.__TJB_PUSHED) {
    window.__TJB_PUSHED = 1;
    try { q.push([[Math.floor(Math.random() * 1e9)], {}, function (r) { window.__TJB_REQ = r; }]); }
    catch (e) { log("req err", e); }
  }
  return window.__TJB_REQ || null;
}
function scan(pred){
  var r = req(); if (!r) return null;
  var cache = r.c || {};
  for (var id in cache) {
    var ex; try { ex = cache[id] && cache[id].exports; } catch (e) { continue; }
    if (!ex) continue;
    try { if (pred(ex)) return ex; } catch (e) {}
  }
  return null;
}
function api(){ return scan(function (e) { return e && typeof e.lv === "function" && typeof e.YN === "function" && typeof e.a_ === "function"; }); }
function bus(){
  var m = scan(function (e) { return e && e.mx && e.mx.store && typeof e.mx.store.get === "function"; });
  if (m) return m.mx;
  return scan(function (e) { return e && e.store && typeof e.store.get === "function" && e.event && typeof e.event.emit === "function"; });
}
function userInfo(){ var b = bus(); if (!b) return null; try { return b.store.get("UserInfo") || null; } catch (e) { return null; } }
if (CFG.liteAnim) {
  try {
    Object.defineProperty(window, "$deviceLevel", {
      configurable: true,
      get: function () { return "low_end"; },
      set: function () {}
    });
  } catch (e) { try { window.$deviceLevel = "low_end"; } catch (e2) {} }
}
if (CFG.skipUpgradeAnim) {
  setInterval(function () {
    var els = document.querySelectorAll(".hd_skip_upgrade_btn");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.__tjbClicked) continue;
      var op = 1;
      try { op = parseFloat(getComputedStyle(el).opacity); } catch (e) {}
      if (op > 0.05) { el.__tjbClicked = 1; try { el.click(); log("skip upgrade anim"); } catch (e) {} }
    }
  }, 150);
}
var rounds = 0, lastEnergy = -1, stuck = 0, running = false;
function later(ms){ if (CFG.maxRounds > 0 && rounds >= CFG.maxRounds) { log("maxRounds reached"); return; } setTimeout(tick, ms); }
function hdFrom(){ try { return (location.search.match(/[?&]hd_from=([^&]*)/) || [])[1] || ""; } catch (e) { return ""; } }
function tick(){
  if (!CFG.autoFeed || running) return;
  var a = api(), b = bus();
  if (!a || !b) { return later(1000); }
  var ui = userInfo();
  if (!ui) { return later(1500); }
  var energy = Number(ui.toolAmount || 0), cost = Number(ui.singleEnergyCost || 0), max = Number(ui.maxWalkGrids || 0);
  if (!cost || cost <= 0) { return later(2000); }
  var canBatch = ui.canBatchWalk === true || ui.canBatchWalk === "true";
  var canUp = ui.canUpgrade === true || ui.canUpgrade === "true";
  if (ui.levelFull === true || ui.levelFull === "true") { return later(60000); }
  if (canUp) {
    if (a.x$) { try { a.x$(); log("upgrade"); } catch (e) {} }
    return later(CFG.gapMs);
  }
  if (energy < cost) {
    if (CFG.drawEnergy) { try { a.YN(); } catch (e) {} }
    return later(CFG.idleMs);
  }
  var n = canBatch ? Math.floor(energy / cost) : 1;
  if (canBatch && max > 0) n = Math.min(n, max);
  if (n < 1) return later(CFG.idleMs);
  var op = canBatch ? "EXHAUST_ENERGY" : "SINGLE";
  if (energy === lastEnergy) { stuck++; } else { stuck = 0; lastEnergy = energy; }
  if (stuck >= 3) { log("energy stuck, backoff"); return later(30000); }
  running = true;
  log("feed", n, "grids | op", op, "| energy", energy, "cost", cost);
  Promise.resolve()
    .then(function () { return a.lv({ walkGridNum: n, operationType: op, displayedSingleEnergyCost: cost, hd_from: hdFrom() }); })
    .then(function (res) {
      var ui2 = res && (res.userInfo || (res.model && res.model.userInfo));
      if (ui2) { try { b.store.update("UserInfo", ui2); } catch (e) {} return; }
      return a.a_().then(function (m) { if (m && m.userInfo) { try { b.store.update("UserInfo", m.userInfo); } catch (e) {} } });
    })
    .catch(function (e) { log("feed err", e && (e.errorCode || e.errorMsg || e.message || e)); })
    .then(function () { running = false; rounds++; later(CFG.gapMs); });
}
setTimeout(tick, 2500);
log("injected", JSON.stringify(CFG));
})();
