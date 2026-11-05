/**
 * teenagers.js — 复刻全网通用做法：解析 Teenagers/ModeStatus，把
 * mode == "teenagers" 那条的 policy.interval 置 0（BiliUniverse / Keywos 同款）。
 *
 * 与「塞固定 mock」的区别：
 *   - 保留服务端真实的 mid / mode / status / #10(年龄) / lessons 条目
 *   - 只动 policy.interval 一个字段
 *
 * 实现要点：
 *   - gRPC 帧：1 字节压缩标志 + 4 字节大端长度；标志=1 时 payload 是 gzip
 *   - Loon 提供 $utils.ungzip（同步，失败抛异常）
 *   - 输出统一用未压缩帧（标志=0），App 两种都接受
 *   - 任何异常/不符合预期 → $done({}) 原样放行，绝不破坏响应
 */
(function () {
  var DEBUG = false;
  var A = (typeof $argument === 'object' && $argument) ? $argument : {};
  // 强制关闭青少年模式：把 UserModel 的 status(#4) 去掉 = CloseStatus
  // Loon 的 switch 参数可能是布尔 true/false，也可能是字符串 "1"/"0"/"true"/"false"
  var FC = A.teenagerForceClose;
  var FORCE_CLOSE = !(FC === false || FC === 0 ||
                      String(FC) === '0' || String(FC) === 'false');

  function toU8(x) {
    if (!x) return null;
    // 跨 realm 安全：不用 instanceof（vm 沙箱里的 Uint8Array 与宿主 Buffer 不是同一构造器）
    if (typeof x === 'string') {
      var a = new Uint8Array(x.length);
      for (var i = 0; i < x.length; i++) a[i] = x.charCodeAt(i) & 0xff;
      return a;
    }
    if (typeof x.length === 'number' && typeof x.subarray === 'function') {
      // Uint8Array / Buffer / 类数组
      var out = new Uint8Array(x.length);
      for (var j = 0; j < x.length; j++) out[j] = x[j] & 0xff;
      return out;
    }
    if (typeof ArrayBuffer !== 'undefined' && x instanceof ArrayBuffer) {
      return new Uint8Array(x);
    }
    return null;
  }

  function rdVarint(b, p) {
    var r = 0, s = 0, x;
    do {
      if (p >= b.length) return null;
      x = b[p++];
      r += (x & 0x7f) * Math.pow(2, s);
      s += 7;
    } while (x & 0x80);
    return [r, p];
  }

  function wrVarint(n) {
    var out = [];
    while (n > 127) { out.push((n & 0x7f) | 0x80); n = Math.floor(n / 128); }
    out.push(n);
    return out;
  }

  // 切出字段列表: [{no, wire, raw(含 tag+len+value), val(仅 wire2 的内容)}]
  function fields(b) {
    var out = [], p = 0;
    while (p < b.length) {
      var st = p;
      var t = rdVarint(b, p); if (!t) return null;
      var tag = t[0]; p = t[1];
      var no = Math.floor(tag / 8), wire = tag & 7;
      if (wire === 0) {
        var v = rdVarint(b, p); if (!v) return null; p = v[1];
        out.push({ no: no, wire: 0, raw: b.subarray(st, p), val: null });
      } else if (wire === 2) {
        var l = rdVarint(b, p); if (!l) return null; p = l[1];
        var end = p + l[0]; if (end > b.length) return null;
        out.push({ no: no, wire: 2, raw: b.subarray(st, end), val: b.subarray(p, end) });
        p = end;
      } else if (wire === 5) {
        p += 4; if (p > b.length) return null;
        out.push({ no: no, wire: 5, raw: b.subarray(st, p), val: null });
      } else if (wire === 1) {
        p += 8; if (p > b.length) return null;
        out.push({ no: no, wire: 1, raw: b.subarray(st, p), val: null });
      } else {
        return null; // 不认识的 wire type，放弃
      }
    }
    return out;
  }

  function tagOf(no, wire) { return wrVarint(no * 8 + wire); }

  function lenPrefixed(no, payload) {
    var head = tagOf(no, 2).concat(wrVarint(payload.length));
    var out = new Uint8Array(head.length + payload.length);
    out.set(head, 0); out.set(payload, head.length);
    return out;
  }

  function concat(arrs) {
    var n = 0, i;
    for (i = 0; i < arrs.length; i++) n += arrs[i].length;
    var out = new Uint8Array(n), o = 0;
    for (i = 0; i < arrs.length; i++) { out.set(arrs[i], o); o += arrs[i].length; }
    return out;
  }

  function strOf(b) {
    var s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  }

  // 把一个 UserModel 里的 policy(字段5) 的 interval(字段1) 去掉
  function zeroPolicy(modelBytes) {
    var fs = fields(modelBytes); if (!fs) return null;
    var out = [], touched = false;
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i];
      if (f.no === 4 && f.wire === 0) {
        // status(#4)：去掉 = proto3 默认值 0 = CloseStatus
        if (FORCE_CLOSE) { touched = true; continue; }
        out.push(f.raw); continue;
      }
      if (f.no === 5 && f.wire === 2) {
        var pf = fields(f.val); if (!pf) return null;
        var keep = [], hadInterval = false;
        for (var j = 0; j < pf.length; j++) {
          if (pf[j].no === 1 && pf[j].wire === 0) { hadInterval = true; continue; }
          keep.push(pf[j].raw);
        }
        out.push(lenPrefixed(5, concat(keep)));
        if (hadInterval) touched = true;
      } else {
        out.push(f.raw);
      }
    }
    return touched ? concat(out) : null;   // null = 无需修改
  }

  function rewriteReply(payload) {
    var fs = fields(payload); if (!fs) return null;
    var out = [], changed = false;
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i];
      if (f.no === 1 && f.wire === 2) {
        var mf = fields(f.val);
        if (!mf) return null;
        var name = null;
        for (var j = 0; j < mf.length; j++) {
          if (mf[j].no === 2 && mf[j].wire === 2) { name = strOf(mf[j].val); break; }
        }
        if (name === 'teenagers') {
          var nb = zeroPolicy(f.val);
          if (nb) { out.push(lenPrefixed(1, nb)); changed = true; continue; }
        }
        out.push(f.raw);
      } else {
        out.push(f.raw);
      }
    }
    return changed ? concat(out) : null;
  }

  try {
    var body = toU8($response.body);
    if (!body || body.length < 6) { $done({}); return; }

    var flag = body[0];
    var len = ((body[1] << 24) | (body[2] << 16) | (body[3] << 8) | body[4]) >>> 0;
    if (len === 0 || 5 + len > body.length) { $done({}); return; }
    var payload = body.subarray(5, 5 + len);

    if (flag === 1) {
      if (typeof $utils === 'undefined' || typeof $utils.ungzip !== 'function') { $done({}); return; }
      payload = toU8($utils.ungzip(payload));
      if (!payload) { $done({}); return; }
    }

    var out = rewriteReply(payload);
    if (!out) { $done({}); return; }          // 无需修改

    var frame = new Uint8Array(5 + out.length);
    frame[0] = 0;
    frame[1] = (out.length >>> 24) & 255;
    frame[2] = (out.length >>> 16) & 255;
    frame[3] = (out.length >>> 8) & 255;
    frame[4] = out.length & 255;
    frame.set(out, 5);

    $done({ body: frame });
  } catch (e) {
    $done({});
  }
})();
