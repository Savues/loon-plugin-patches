/* 本地模拟：淘宝小镇页的「main.js」——webpack 运行时 + mx 总线
   结构对齐真实包（2026-10-30 从 g.alicdn.com 拉到的 2.6.2 版本）：
     - self.webpackChunk_ali_pegasus_project_taocoin_home 运行时
     - 模块 15280 导出 mx（store / event），对应真实 main.js
   仅用于本地验证插件注入逻辑，不含任何线上代码。 */
(function () {
  var modules = {};
  var cache = {};

  function req(id) {
    if (cache[id]) return cache[id].exports;
    var m = (cache[id] = { exports: {} });
    if (modules[id]) modules[id](m, m.exports, req);
    return m.exports;
  }
  req.m = modules;
  req.c = cache;
  req.d = function (exports, def) {
    for (var k in def) {
      if (!Object.prototype.hasOwnProperty.call(exports, k)) {
        Object.defineProperty(exports, k, { enumerable: true, get: def[k] });
      }
    }
  };
  req.o = function (o, p) { return Object.prototype.hasOwnProperty.call(o, p); };

  /* ---- 模块 15280：mx 总线（真实 main.js 同款导出） ---- */
  modules[15280] = function (e, t, n) {
    var store = {
      data: {},
      get: function (k) { return this.data[k]; },
      update: function (k, v) {
        this.data[k] = v;
        if (window.__mockOnStoreUpdate) window.__mockOnStoreUpdate(k, v);
      }
    };
    var handlers = {};
    var event = {
      on: function (k, fn) { (handlers[k] = handlers[k] || []).push(fn); },
      off: function (k, fn) { handlers[k] = (handlers[k] || []).filter(function (f) { return f !== fn; }); },
      emit: function (k, v) {
        (handlers[k] || []).forEach(function (f) { try { f(v); } catch (e) {} });
        if (window.__mockOnEvent) window.__mockOnEvent(k, v);
      }
    };
    var mx = { store: store, event: event };
    t.mx = mx;
    window.__mockMx = mx;
  };

  var q = (self.webpackChunk_ali_pegasus_project_taocoin_home =
    self.webpackChunk_ali_pegasus_project_taocoin_home || []);

  function chunkCallback(parent, chunk) {
    var more = chunk[1] || {};
    for (var k in more) modules[k] = more[k];
    if (chunk[2]) chunk[2](req);
  }
  q.forEach(chunkCallback.bind(null, 0));
  q.push = chunkCallback.bind(null, q.push.bind(q));

  window.__mockReq = req;
})();
