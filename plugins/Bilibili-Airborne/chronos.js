/**
 * chronos.js —— 重签 B 站 chronos（B 站的时间戳校验文件）
 *
 * 为什么需要它
 * ------------
 * 空降弹幕能被 App 自动执行，**前提**是 App 能正常加载 chronos 校验文件。
 * 校验文件拿不到时 App 会进入降级状态：弹幕里的 `airborne:<毫秒>` 只渲染、不执行
 * —— 弹幕看得见、点了能跳，但不会自动跳。
 *
 * 实测证据（2026-10-09，BV1DjuQ6REQN，消融 D1/S1/S2/U1/V1 逐层定位）：
 *   服务端原始  chronos#1 = 325e7073ffc6fb5263682fecdcd1058f
 *                chronos#2 = http://i0.hdslb.com/bfs/app-static/042de1dc….zip
 *                chronos#3 = 80 字符 token
 *   重签之后    chronos#1 = 932002070dc1b51241198a074d2279fc
 *                chronos#2 = 本仓库托管的 chronos/<md5>.zip
 *                chronos#3 被删除
 *   两次会话注入的空降弹幕响应字节完全相同（HAR md5 6bc9feb4 / 19cdaca0），
 *   唯一差别就是这条 ViewProgress 有没有被重签。
 *
 * 本脚本只做三件事，不依赖上游任何脚本：
 *   chronos#1 md5  → 查表映射
 *   chronos#2 file → 指向本仓库托管的 zip
 *   chronos#3 sign → 删除
 * 其余字段全部逐字节原样保留。
 *
 * 表的 key 是「服务端当前下发的 chronos zip 的 md5」。B 站换版本后若表里没有对应
 * key，会退回按 UA 取默认值并打一条 MD5 mismatch 日志，这时需要补一条新映射。
 * 与 Bilibili-Dedup 里 protobuf.response.js 的那张表保持一致。
 */
(function () {
  var MAP = {
    universal: 'e5a968f1a5055bbe5c12e67b100a6dcb',
    hd: 'f993a054969a4f6ae6b20a65f1292e47',
    inter: '8c3feda2e92bf60e8a7aeade1a231586',
    '45b564f5ba1fdd3746406937059addd8': 'e5a968f1a5055bbe5c12e67b100a6dcb',
    c29bd8f2b64a8f57f49c3622c0f763db: 'ecca73e42e160074e0caf4b3ddb54a52',
    c218977c14e5dfdafd51edf3ae49ed02: 'f993a054969a4f6ae6b20a65f1292e47',
    '8232ffb6ee43b687b5fe5add5b3e97de': 'feaca416bbc1174b8e935cf87ff8f0b5',
    '325e7073ffc6fb5263682fecdcd1058f': '932002070dc1b51241198a074d2279fc',
    '3a14beddd23328eaddfe9f0eb048d713': '8c3feda2e92bf60e8a7aeade1a231586'
  };
  var BASE = 'https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Airborne/chronos/';

  function variant(ua) {
    ua = ua || '';
    if (ua.indexOf('bili-hd') === 0) return 'hd';
    if (ua.indexOf('bili-inter') === 0) return 'inter';
    return 'universal';
  }

  // ---- 极简 protobuf 读写：只解析长度分隔/varint/fixed，其余 wire type 原样搬运 ----
  function readVarint(b, p) {
    var r = 0, s = 0, x;
    do { x = b[p++]; r += (x & 0x7f) * Math.pow(2, s); s += 7; } while (x & 0x80);
    return [r, p];
  }
  function varintBytes(n) {
    var out = [], x;
    do { x = n % 128; n = Math.floor(n / 128); if (n) x |= 128; out.push(x); } while (n);
    return out;
  }
  /**
   * 解析一层 protobuf 字段。**解析不完整时返回 null**（而不是「已解析的那几个」）。
   *
   * ⚠️ 这里曾经写成 `return out`（返回部分结果），主流程拿它去 join() 重新序列化，
   * 末尾所有字段就被静默丢弃 —— App 收到一个"合法但字段残缺"的响应，不报错、
   * 不空屏，只是某些字段悄悄变默认值，而 $done({response}) 还让重签"成功"。
   * 宁可完全不改，也不能改坏：任何一处解析不确定，整个脚本一律原样放行。
   */
  function split(b) {
    var out = [], p = 0, k, n, start;
    while (p < b.length) {
      k = readVarint(b, p)[0]; p = readVarint(b, p)[1];
      var no = Math.floor(k / 8), wt = k % 8;
      if (wt === 2) { n = readVarint(b, p); start = n[1]; p = n[1] + n[0]; }   // raw 不含长度前缀
      else {
        start = p;
        if (wt === 0) p = readVarint(b, p)[1];
        else if (wt === 1) p += 8;
        else if (wt === 5) p += 4;
        else return null;                    // 未知 wire type：无法确定剩余字段的范围
      }
      if (!(p > start) || p > b.length) return null;   // 长度越界 / varint 读出 NaN
      out.push({ no: no, wt: wt, raw: b.subarray(start, p) });
    }
    return out;
  }
  /** raw 一律不含 tag 与长度前缀；wt=2 的长度在这里补上 */
  function join(fields) {
    var bytes = [], i, j;
    fields.forEach(function (f) {
      var head = varintBytes(f.no * 8 + f.wt);
      if (f.wt === 2) head = head.concat(varintBytes(f.raw.length));
      for (i = 0; i < head.length; i++) bytes.push(head[i]);
      for (i = 0; i < f.raw.length; i++) bytes.push(f.raw[i]);
    });
    return new Uint8Array(bytes);
  }
  function utf8Bytes(s) {
    var o = [], c, i;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) o.push(c);
      else if (c < 0x800) o.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else o.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return o;
  }
  function strField(no, s) {
    return { no: no, wt: 2, raw: new Uint8Array(utf8Bytes(s)) };
  }
  function ascii(b) { var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; }

  // ---- 主流程 ----
  var body = $response.body;
  var bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  var compressed = bytes[0] !== 0;
  var payload = bytes.subarray(5);
  if (compressed) {
    try { payload = $utils.ungzip(payload); } catch (e) { $done({}); return; }
  }

  var fields = split(payload);
  if (!fields) { $done({}); return; }        // 解析未完成 → 原样放行，绝不半截改写
  var idx = -1, i, j, k;
  for (i = 0; i < fields.length; i++) {
    if (fields[i].no === 2 && fields[i].wt === 2) { idx = i; break; }
  }
  if (idx < 0) { $done({}); return; }

  var inner = split(fields[idx].raw);
  if (!inner) { $done({}); return; }
  var md5 = '';
  for (j = 0; j < inner.length; j++) {
    if (inner[j].no === 1 && inner[j].wt === 2) md5 = ascii(inner[j].raw);
  }
  if (!/^[0-9a-f]{32}$/.test(md5)) { $done({}); return; }

  var target = MAP[md5] || MAP[variant(($request.headers || {})['user-agent'])];
  if (!target) { $done({}); return; }
  var isOurs = false;
  for (var key in MAP) { if (MAP[key] === md5) { isOurs = true; break; } }
  if (isOurs) { $done({}); return; }           // 已经指向本仓库的 zip，幂等放行

  var rewritten = [];
  for (k = 0; k < inner.length; k++) {
    if (inner[k].no === 1) rewritten.push(strField(1, target));
    else if (inner[k].no === 2) rewritten.push(strField(2, BASE + target + '.zip'));
    else if (inner[k].no === 3) { /* sign：丢弃 */ }
    else rewritten.push(inner[k]);
  }
  fields[idx] = { no: 2, wt: 2, raw: join(rewritten) };

  var out = join(fields);
  var framed = new Uint8Array(out.length + 5);
  framed[0] = 0;                                             // 重签后一律用未压缩帧
  framed[1] = (out.length >>> 24) & 255;
  framed[2] = (out.length >>> 16) & 255;
  framed[3] = (out.length >>> 8) & 255;
  framed[4] = out.length & 255;
  framed.set(out, 5);
  $done({ response: { body: framed } });
})();