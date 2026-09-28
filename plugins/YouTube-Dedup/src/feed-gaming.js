/*
 * YouTube 去广告 · 首页「游戏大本营 / YouTube Playables」模块清除
 *
 * 现象
 *   首页（browseId=FEwhat_to_watch）会插一个 61 KB 的「YouTube 游戏大本营」模块，
 *   还有一个 60 格的游戏卡片货架（browseId=FEmini_app_destination）。用户要求去掉。
 *
 * 它长什么样
 *   它不是普通视频，而是 YouTube 的「mini app」体系（EML 渲染）喂给前端的一个面板。
 *   抓包里三种形态都带同一批技术标识：
 *     · mini_game_card.eml-fe|998e208b2b3ddc1   每张游戏卡的 EML 模板 id
 *     · youtube_outline_experimental/playables_*  实验开关名
 *     · FEmini_app_destination / FEmini_apps_saved  前端功能 key
 *   2026-09-29 抓包实测：首页 15~16 个 feed section 里各命中 1 个；
 *   游戏大本营页 1 条 response 里 60 张卡全部命中；其余 browse/next/get_watch/reel 命中 0 个。
 *
 * 怎么删
 *   不认任何 schema，只认「结构 + 内容」：
 *     1. 自上而下遍历 protobuf，凡是「同一父消息里出现 ≥2 次的字段号」的元素，
 *        就是列表里的一项（feed 卡片 / 货架格子 / section）；
 *     2. 该元素的内容里出现上面任一标识 → 整项删掉；
 *     3. 删完如果某个父消息一项都不剩 → 它自己也删掉，依次向上收敛。
 *   判据是内容而不是字段号，所以 YouTube 换 schema、换 A/B 分桶都不用改。
 *
 * 安全边界
 *   · 只用技术标识，**不使用「游戏大本营」这种本地化文案**（可能出现在正常视频标题里）
 *   · 任何解析异常 → 原样放行，绝不改坏响应
 *   · 有最大递归深度和最大删除数
 *   · 响应体没变化就 $done({})，一个字节都不动
 *
 * 挂在 youtubei/v1/{browse,next} 上。搜索页、频道页、订阅页也会走这里，
 * 但没有标识就不会动。
 */

(function () {
  'use strict';

  // 只认「面板级」标识。实测（两份抓包 25 条响应）过一遍 marker 精度：
  //   mini_app_panel / FEmini_apps_saved  → 每次恰好命中 1 个元素，就是游戏大本营本身，
  //                                          频道页/订阅页/媒体库/搜索页命中 0 个
  //   mini_game_card                       → 会连带删掉 error_message 占位卡，
  //                                          极端情况下连带 channel_action_buttons（订阅按钮）
  //   FEmini_app_destination / FEmini_app   → 会连带删掉 more_drawer_button（更多按钮）
  // 所以只留最保守的两个，绝不用「游戏大本营」这种本地化文案。
  var MARKERS = ['mini_app_panel', 'FEmini_apps_saved'];
  var MAX_DEPTH = 32;
  var MAX_DROPS = 512;
  var store = { dropped: 0, bytes: 0 };

  // ---------- 参数：blockGaming 默认开 ----------
  function argOn(name, def) {
    try {
      var a = $argument;
      if (a === undefined || a === null) return def;
      if (typeof a === 'string') {
        if (a.indexOf('{{{') === 0) return def;      // Loon 没传参
        try { a = JSON.parse(a); } catch (e) { return def; }
      }
      var v = a[name];
      if (v === undefined || v === null) return def;
      if (typeof v === 'string') return v !== 'false' && v !== '0' && v !== '';
      return !!v;
    } catch (e) {
      return def;
    }
  }

  // ---------- 字节工具 ----------
  function toBytes(body) {
    if (!body) return null;
    if (body instanceof Uint8Array) return body;
    if (body instanceof ArrayBuffer) return new Uint8Array(body);
    if (typeof body === 'string') {
      var out = new Uint8Array(body.length);
      for (var i = 0; i < body.length; i++) out[i] = body.charCodeAt(i) & 0xff;
      return out;
    }
    return null;
  }

  function readVarint(b, pos, end) {
    var result = 0, shift = 0, byte;
    do {
      if (pos >= end) return null;
      byte = b[pos++];
      result += (byte & 0x7f) * Math.pow(2, shift);
      shift += 7;
      if (shift > 63) return null;
    } while (byte & 0x80);
    return [result >>> 0, pos];
  }

  // 解析 [start,end) 内的字段。遇到非法 tag 立即放弃（返回已解析的部分）
  function parseFields(b, start, end) {
    var list = [];
    var pos = start;
    while (pos < end) {
      var fstart = pos;
      var tag = readVarint(b, pos, end);
      if (!tag) break;
      pos = tag[1];
      var no = Math.floor(tag[0] / 8);
      var wire = tag[0] & 7;
      var tagEnd = pos;
      if (no === 0 || wire === 3 || wire === 4 || wire === 6 || wire === 7) break;
      if (wire === 0) {
        var v = readVarint(b, pos, end);
        if (!v) break;
        pos = v[1];
        list.push({ no: no, wire: wire, fs: fstart, te: tagEnd, ps: pos, pe: pos, fe: pos });
      } else if (wire === 1) {
        if (pos + 8 > end) break;
        list.push({ no: no, wire: wire, fs: fstart, te: tagEnd, ps: pos, pe: pos + 8, fe: pos + 8 });
        pos += 8;
      } else if (wire === 5) {
        if (pos + 4 > end) break;
        list.push({ no: no, wire: wire, fs: fstart, te: tagEnd, ps: pos, pe: pos + 4, fe: pos + 4 });
        pos += 4;
      } else if (wire === 2) {
        var len = readVarint(b, pos, end);
        if (!len) break;
        var pstart = len[1];
        if (pstart + len[0] > end) break;
        list.push({ no: no, wire: wire, fs: fstart, te: tagEnd, ps: pstart, pe: pstart + len[0], fe: pstart + len[0] });
        pos = pstart + len[0];
      } else {
        break;
      }
    }
    return list;
  }

  function hasMarker(b, start, end) {
    for (var m = 0; m < MARKERS.length; m++) {
      var s = MARKERS[m];
      var first = s.charCodeAt(0);
      var limit = end - s.length;
      for (var i = start; i <= limit; i++) {
        if (b[i] !== first) continue;
        var ok = true;
        for (var j = 1; j < s.length; j++) {
          if (b[i + j] !== s.charCodeAt(j)) { ok = false; break; }
        }
        if (ok) return true;
      }
    }
    return false;
  }

  function writeVarint(n, out) {
    while (n > 127) { out.push((n & 127) | 128); n = Math.floor(n / 128); }
    out.push(n);
  }

  // ---------- 递归清理 ----------
  // 返回 { changed, empty, bytes }，bytes 为 null 表示「没动」
  function scrub(b, start, end, depth) {
    if (depth > MAX_DEPTH || store.dropped >= MAX_DROPS) return { changed: false };
    var fields = parseFields(b, start, end);
    if (fields.length === 0) return { changed: false };

    var counts = {};
    for (var c = 0; c < fields.length; c++) {
      var n = fields[c].no;
      counts[n] = (counts[n] || 0) + 1;
    }

    var out = [];
    var outLen = 0;
    var changed = false;

    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.wire !== 2) {
        for (var p = f.fs; p < f.fe; p++) out.push(b[p]);
        outLen += f.fe - f.fs;
        continue;
      }
      // 列表里的一项，且内容带标识 → 整项删掉
      if (counts[f.no] > 1 && hasMarker(b, f.ps, f.pe)) {
        changed = true;
        if (globalThis.__DROP) globalThis.__DROP('DROP depth=' + depth + ' f' + f.no + ' len=' + (f.pe - f.ps));
        store.dropped++;
        store.bytes += f.pe - f.ps;
        continue;
      }
      var sub = scrub(b, f.ps, f.pe, depth + 1);
      if (sub.changed) {
        changed = true;
        if (sub.empty) {                       // 子消息被删空 → 本字段也删
          if (globalThis.__DROP) globalThis.__DROP('PRUNE depth=' + depth + ' f' + f.no + ' len=' + (f.pe - f.ps));
          store.dropped++;
          store.bytes += f.pe - f.ps;
          continue;
        }
        for (var q = f.fs; q < f.te; q++) out.push(b[q]);   // 只复制 tag
        outLen += f.te - f.fs;
        var before = out.length;
        writeVarint(sub.bytes.length, out);
        outLen += out.length - before;
        for (var r = 0; r < sub.bytes.length; r++) out.push(sub.bytes[r]);
        outLen += sub.bytes.length;
        continue;
      }
      for (var s = f.fs; s < f.fe; s++) out.push(b[s]);
      outLen += f.fe - f.fs;
    }

    if (!changed) return { changed: false };
    var res = new Uint8Array(outLen);
    for (var t = 0; t < outLen; t++) res[t] = out[t];
    return { changed: true, empty: outLen === 0, bytes: res };
  }

  // ---------- 入口 ----------
  // sawMarker=true 但一个字节没改，是「规则在跑、但这次没东西可删」。
  // debug 模式下要能把这两种情况区分开，否则「规则根本没跑」和「规则跑了但没删掉」
  // 在外面看一模一样，只能靠猜。
  function run() {
    if (!argOn('blockGaming', true)) return 'off';
    var b = toBytes($response && $response.body);
    if (!b || b.length < 32) return 'tiny';
    if (!hasMarker(b, 0, b.length)) return 'clean';
    var r = scrub(b, 0, b.length, 0);
    if (!r.changed || !r.bytes) return 'nomatch';
    // 整条响应被判为游戏内容时不要下发空 body —— 那会让 App 直接报错。
    // 这种情况下宁可原样放行（用户还能看见模块），也不能把首页弄坏。
    if (r.bytes.length === 0) return 'allgaming';
    $done({ body: r.bytes });
    return 'done';
  }

  function debugOn() {
    try {
      var a = $argument;
      if (a === undefined || a === null) return false;
      if (typeof a === 'string') {
        if (a.indexOf('{{{') === 0) return false;
        try { a = JSON.parse(a); } catch (e) { return false; }
      }
      return !!a.debug;
    } catch (e) {
      return false;
    }
  }

  var result = 'error';
  try {
    result = run();
  } catch (e) {
    result = 'error';
  }

  if (debugOn()) {
    try {
      var note = result === 'done' ? '已删除 ' + store.dropped + ' 项 / ' + store.bytes + ' 字节'
        : result === 'clean' ? '本条响应没有游戏大本营'
        : result === 'nomatch' ? '检测到标识但未能整项删除'
        : result === 'allgaming' ? '整条响应都是游戏内容，已放弃改写以免弄坏首页'
        : result === 'off' ? 'blockGaming 已关闭'
        : '未改动（' + result + '）';
      $notification.post('YouTube 去广告', '游戏大本营 · ' + result, note);
    } catch (e) { /* noop */ }
  }

  // $done 只在 run() 里真的改了响应时已经调用过；其余情况原样放行
  if (result !== 'done') $done({});
})();
