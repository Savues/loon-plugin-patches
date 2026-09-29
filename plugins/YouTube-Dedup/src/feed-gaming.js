/*
 * YouTube 去广告 · 信息流清理（browse / next）
 *
 * 做两件事：清信息流广告、清「游戏大本营」。
 *
 * 判据：列表项（同一父消息里出现 >=2 次的字段号）的内容里出现
 *      mini_app_panel / FEmini_apps_saved -> 整项删；删空后父消息跟着删，向上收敛。
 *      不认任何 protobuf schema，只认「结构 + 内容」。
 *
 * ⚠ 为什么必须先建索引再遍历（这是实测踩出来的）
 *   早先的写法是「每进入一层就把这段字节用 contains() 全量扫一遍」。
 *   一次首页响应有约 8 层单例嵌套、每层都是 MB 量级，同一批字节在每层被重扫 4 遍：
 *   1.3 MB 的响应要 14 秒、2.9 MB 的要 60 秒以上 —— 直接撞穿 Loon 的 10 秒脚本超时，
 *   规则等于没生效（用户看到的现象就是「模块还在」）。
 *   现在改成：开头做一遍扫描，把判据串的命中位置记成有序数组，
 *   之后每次「这段里有没有 X」都对数组做二分查找。整条响应只扫一遍。
 *
 * 误伤防护（2026-09-29 抓包实测）
 *   只用面板级标识 mini_app_panel / FEmini_apps_saved。
 *   不用 mini_game_card —— 它会出现在普通视频卡的模板清单里，删了等于拿掉一个正常视频；
 *   不用 FEmini_app_destination / FEmini_app —— 会连带删掉 more_drawer_button（更多按钮）
 *   和 channel_action_buttons（订阅按钮）。绝不用「游戏大本营」这种本地化文案。
 *
 * 其他安全边界
 *   任何解析异常 -> 原样放行；输出会变成 0 字节 -> 放弃改写，不下发空 body。
 */

(function () {
  'use strict';

  // 判据：pagead（YouTube 内部广告标识，与上游 ni() 同一个）
  // 或 EML 名 inline_injection_entrypoint_layout（上游 blackEml 的默认值）。
  // pagead 在六份旧抓包里一次都没出现过，在新抓包里只出现在广告段里 ——
  // 实测广告段 赞助x3、/vi/ 0~1 个；正常段 赞助x0、/vi/ 15 个。
  // 上游的 >=1000 字节门槛是加在「未知字段」上的，不是加在整个列表项上；
  // 我先前错加在整项上，导致 next（信息流续页）里的小广告项删不掉。
  var MAX_DEPTH = 20;      // 面板实测在 6~12 层，20 层足够；再深只会拖慢
  var MAX_CUTS = 256;
  var hitPanel = [];       // 游戏大本营判据命中位置（升序）
  var hitAd = [];          // 广告判据命中位置（升序）
  var ncuts = 0;

  function argOn(name, def) {
    try {
      var a = $argument;
      if (a === undefined || a === null) return def;
      if (typeof a === 'string') {
        if (a.indexOf('{{{') === 0) return def;
        try { a = JSON.parse(a); } catch (e) { return def; }
      }
      var v = a[name];
      if (v === undefined || v === null) return def;
      if (typeof v === 'string') return v !== 'false' && v !== '0' && v !== '';
      return !!v;
    } catch (e) { return def; }
  }

  function toBytes(body) {
    if (!body) return null;
    if (body instanceof Uint8Array) return body;
    if (body instanceof ArrayBuffer) return new Uint8Array(body);
    if (typeof body === 'string') {
      var o = new Uint8Array(body.length);
      for (var i = 0; i < body.length; i++) o[i] = body.charCodeAt(i) & 0xff;
      return o;
    }
    return null;
  }

  // ---- 单遍扫描：记录两个判据串的起点 ----
  var H1 = 109, H2 = 70;   // 'm' / 'F'
  function buildHits(b) {
    hitPanel = []; hitAd = [];
    for (var i = 0; i < b.length; i++) {
      var c = b[i];
      // 'm' -> mini_app_panel      'F' -> FEmini_apps_saved
      // 'p' -> pagead              'i' -> inline_injection_entrypoint_layout
      // 's' -> shorts（只是候选，还要在 EML 模板名上确认）
      if (c === 109) { if (b[i+1]===105&&b[i+2]===110&&b[i+3]===105&&b[i+4]===95&&b[i+5]===97&&b[i+6]===112&&b[i+7]===112&&b[i+8]===95&&b[i+9]===112) hitPanel.push(i); }
      else if (c === 70) { if (b[i+1]===69&&b[i+2]===109&&b[i+3]===105&&b[i+4]===110&&b[i+5]===105&&b[i+6]===95&&b[i+7]===97&&b[i+8]===112&&b[i+9]===112&&b[i+10]===115) hitPanel.push(i); }
      else if (c === 112) { if (b[i+1]===97&&b[i+2]===103&&b[i+3]===101&&b[i+4]===97&&b[i+5]===100) hitAd.push(i); }
      else if (c === 105) { if (b[i+1]===110&&b[i+2]===108&&b[i+3]===105&&b[i+4]===110&&b[i+5]===101&&b[i+6]===95&&b[i+7]===105&&b[i+8]===106) hitAd.push(i); }
    }
  }

  function hasAny(arr, start, end, len) {
    var limit = end - len;
    if (limit < start) return false;
    var lo = 0, hi = arr.length;
    while (lo < hi) { var m = (lo + hi) >> 1; if (arr[m] < start) lo = m + 1; else hi = m; }
    return lo < arr.length && arr[lo] <= limit;
  }

  function hasPanel(start, end) {
    return opt.blockGaming && hasAny(hitPanel, start, end, 10);   // 两个串长度 >= 10
  }
  /** 这一段里有没有视频 id（'/vi/'）——用来区分「纯广告项」和「带广告的正常推荐」 */
  function hasVideo(b, start, end) {
    for (var i = start; i + 3 < end; i++) {
      if (b[i] === 47 && b[i+1] === 118 && b[i+2] === 105 && b[i+3] === 47) return true;
    }
    return false;
  }

  function hasAd(start, end) {
    if (!opt.blockAds || end - start < 64) return false;          // 别删掉裸字符串
    return hasAny(hitAd, start, end, 6) || hasAny(hitAd, start, end, 30);
  }


  function readVarint(b, pos, end) {
    var r = 0, s = 0, c;
    do {
      if (pos >= end) return null;
      c = b[pos++]; r += (c & 0x7f) * Math.pow(2, s); s += 7;
      if (s > 63) return null;
    } while (c & 0x80);
    return [r, pos];
  }

  function parseFields(b, start, end) {
    var list = [], pos = start;
    while (pos < end) {
      var fs = pos;
      var tag = readVarint(b, pos, end);
      if (!tag) break;
      pos = tag[1];
      var no = Math.floor(tag[0] / 8), wire = tag[0] & 7, te = pos;
      if (no === 0 || wire === 3 || wire === 4 || wire === 6 || wire === 7) break;
      if (wire === 0) {
        var v = readVarint(b, pos, end); if (!v) break;
        list.push({ no: no, wire: wire, fs: fs, te: te, ps: v[1], pe: v[1], fe: v[1] });
        pos = v[1];
      } else if (wire === 1) {
        if (pos + 8 > end) break;
        list.push({ no: no, wire: wire, fs: fs, te: te, ps: pos, pe: pos + 8, fe: pos + 8 }); pos += 8;
      } else if (wire === 5) {
        if (pos + 4 > end) break;
        list.push({ no: no, wire: wire, fs: fs, te: te, ps: pos, pe: pos + 4, fe: pos + 4 }); pos += 4;
      } else if (wire === 2) {
        var l = readVarint(b, pos, end); if (!l) break;
        var q = l[1];
        if (q + l[0] > end) break;
        list.push({ no: no, wire: wire, fs: fs, te: te, ps: q, pe: q + l[0], fe: q + l[0] }); pos = q + l[0];
      } else break;
    }
    return list;
  }

  // ---- cuts：按文档顺序追加的「整条删除」区间 ----
  function plan(b, start, end, depth, opt) {
    if (depth > MAX_DEPTH || ncuts >= MAX_CUTS) return false;
    var fields = parseFields(b, start, end);
    if (fields.length === 0) return false;
    var counts = {};
    for (var c = 0; c < fields.length; c++) { var n = fields[c].no; counts[n] = (counts[n] || 0) + 1; }
    var changed = false;
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.wire !== 2) continue;
      // 这段里一处判据都没有 -> 整棵子树不可能被删，直接跳过，不递归。
      // hasHit 是对已排序命中位置做二分查找，等于白拿。
      // 少了这一句，同一批字节会在每层单例嵌套里被重新 parse 一遍，
      // 2.9 MB 的首页响应要 11 秒。
      var ad = hasAd(f.ps, f.pe);
      if (!hasPanel(f.ps, f.pe) && !ad) continue;
      if (counts[f.no] > 1) {
        cuts[ncuts++] = f.fs; cuts[ncuts++] = f.fe;
        changed = true;
        continue;
      }
      // 单例字段：只有「有广告标识、且一个视频都没有」才删。
      // next（信息流续页）里的广告 pod 就是这种形态 —— 顶层字段 15/37/42，
      // 各含 pagead/aclk/赞助，但 /vi/ 为 0；而正常推荐（字段 14）带真实视频 ID，
      // 哪怕也带着广告点击 URL 也不动。
      if (ad && !hasVideo(b, f.ps, f.pe)) {
        cuts[ncuts++] = f.fs; cuts[ncuts++] = f.fe;
        changed = true;
        continue;
      }
      if (plan(b, f.ps, f.pe, depth + 1, opt)) changed = true;
    }
    // 收敛：本层若一个字段都不剩，整层并入删除集合
    // （面板容器可能是单例字段、里面套重复列表，只删列表项会留下空壳）
    if (changed) {
      var alive = 0;
      for (var a = 0; a < fields.length; a++) {
        var f2 = fields[a];
        var whole = false;
        for (var j = ncuts - 2; j >= 0; j -= 2) {
          if (cuts[j] <= f2.fs) { whole = cuts[j + 1] >= f2.fe; break; }
          if (cuts[j] < f2.fs) break;
        }
        if (!whole) alive++;
      }
      if (alive === 0 && fields.length > 0) {
        cuts[ncuts++] = fields[0].fs;
        cuts[ncuts++] = fields[fields.length - 1].fe;
      }
    }
    return changed;
  }

  function cutCovers(fs, fe) {
    for (var j = ncuts - 2; j >= 0; j -= 2) {
      if (cuts[j] <= fs) return cuts[j + 1] >= fe;
      if (cuts[j] < fs) return false;
    }
    return false;
  }

  function cutInside(fs, fe) {
    for (var j = 0; j < ncuts; j += 2) if (cuts[j] > fs && cuts[j] < fe) return true;
    return false;
  }

  function writeVarint(n, out) {
    while (n > 127) { out.push((n & 127) | 128); n = Math.floor(n / 128); }
    out.push(n);
  }

  function rebuild(b, start, end) {
    var fields = parseFields(b, start, end);
    // 整段拷贝用 subarray + set（memcopy），不要 out.push(b[i]) 逐字节推 ——
    // 2.9 MB 的响应光这一项就要好几秒。
    var parts = [], total = 0;
    function keep(from, to) {
      var s = b.subarray(from, to);
      parts.push(s); total += s.length;
    }
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (cutCovers(f.fs, f.fe)) continue;
      if (f.wire !== 2 || !cutInside(f.fs, f.pe)) { keep(f.fs, f.fe); continue; }
      var inner = rebuild(b, f.ps, f.pe);
      keep(f.fs, f.te);
      var lenBytes = [];
      writeVarint(inner.length, lenBytes);
      for (var L = 0; L < lenBytes.length; L++) parts.push(Uint8Array.from([lenBytes[L]]));
      parts.push(inner);
      total += lenBytes.length + inner.length;
    }
    var res = new Uint8Array(total), off = 0;
    for (var j = 0; j < parts.length; j++) { res.set(parts[j], off); off += parts[j].length; }
    return res;
  }

  function run(opt) {
    if (!opt.blockGaming && !opt.blockAds) return 'off';
    var b = toBytes($response && $response.body);
    if (!b || b.length < 64) return 'tiny';
    buildHits(b);
    if (hitPanel.length === 0 && hitAd.length === 0) return 'clean';
    cuts = [];
    plan(b, 0, b.length, 0, opt);
    if (ncuts === 0) return 'nomatch';
    var out = rebuild(b, 0, b.length);
    if (out.length === 0) return 'allgaming';
    $done({ body: out });
    return 'done';
  }

  var cuts = [];
  var opt = { blockGaming: argOn('blockGaming', true), blockAds: argOn('blockAds', true) };
  var result = 'error';
  try { result = run(opt); } catch (e) { result = 'error'; }

  // 首次成功清理后弹一次「已生效 vX」的通知。
  // 目的：让「代码到底更新没更新」不用再靠猜 —— 连着四轮「改了还是不行」，
  // 每轮都分不清是代码不对、规则没跑、还是新脚本根本没送达。
  // 装上新版后下拉刷新首页看到这条，就说明跑的就是这一版；没看到就是没换上。
  var VER = '5.8';
  if (result === 'done') {
    try {
      if ($persistentStore.read('YouTubeDedupFeedCleanerVer') !== VER) {
        $persistentStore.write('YouTubeDedupFeedCleanerVer', VER);
        $notification.post('YouTube 去广告', '游戏大本营 · 已生效',
          '脚本 v' + VER + '，本次删除 ' + (ncuts / 2) + ' 项 / ' + (hitPanel.length + hitAd.length) + ' 处判据');
      }
    } catch (e) { /* noop */ }
  }

  if (argOn('debug', false)) {
    try {
      $notification.post('YouTube 去广告', '游戏大本营 v' + VER + ' · ' + result,
        result === 'done' ? '已删除 ' + (ncuts / 2) + ' 项 / ' + (hitPanel.length + hitAd.length) + ' 处判据'
        : result === 'clean' ? '本条响应没有游戏大本营'
        : result === 'nomatch' ? '看到判据但没能整项删除'
        : result === 'allgaming' ? '整条都是游戏内容，放弃改写以免弄坏首页'
        : result === 'off' ? 'blockGaming 已关闭'
        : '未改动（' + result + '）');
    } catch (e) { /* noop */ }
  }
  if (result !== 'done') $done({});
})();
