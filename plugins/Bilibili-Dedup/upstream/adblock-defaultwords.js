/*
 * 搜索框滚动推荐词过滤（Search/DefaultWords，gRPC + protobuf）
 *
 * 响应结构（抓包解包实证）：
 *   f1/f2  未知 ID
 *   f3     嵌套消息，内含占位提示文案（「七工匠 电影」）
 *   f4     **滚动推荐词**（「七工匠电影」）—— 本脚本删的就是它
 *   f5     varint，恒为 1
 *   f6     词条 ID 串，如 64778101_78597101_...
 *
 * 实现要点：protobuf 字段长度可变，删掉一个字段后其余字段的偏移全部变化。
 * 因此不能做字节偏移切片，只能**逐字段重新拼接**：
 *   - 需要跳过的字段（含 tag + value）整体丢弃
 *   - wire type 2（长度分隔）的 value 用 subarray 复制，不解释内容
 *   - 只在最外层删 f4；嵌套消息整块原样搬运，内部不动
 * 这样无论字段顺序如何变化都不会错位。
 *
 * 保留 f3 占位提示，否则搜索框输入区会显示为空。强制生效，不可开关。
 */

function readVarint(b, i) {
  var r = 0, s = 0, c;
  do { c = b[i++]; r += (c & 0x7f) * Math.pow(2, s); s += 7; } while (c & 0x80);
  return [r, i];
}

function concat(segs, n) {
  var out = new Uint8Array(n), p = 0, k;
  for (k = 0; k < segs.length; k++) { out.set(segs[k], p); p += segs[k].length; }
  return out;
}

// skipField: 返回下一个字段的结束偏移；该字段不产出任何字节
function skipField(b, i) {
  var k = readVarint(b, i); i = k[1];
  var w = k[0] & 7;
  if (w === 0) return readVarint(b, i)[1];
  if (w === 2) { var l = readVarint(b, i); return l[1] + l[0]; }
  if (w === 5) return i + 4;
  if (w === 1) return i + 8;
  return -1;  // 未知 wire type，放弃处理
}

function stripWords(buf) {
  var keep = [], n = 0, i = 0, changed = false;
  while (i < buf.length) {
    var k = readVarint(buf, i);
    var field = k[0] >>> 3, wire = k[0] & 7;
    var end = skipField(buf, i);
    if (end < 0 || end > buf.length) {           // 结构异常，原样返回
      var tail = buf.subarray(i); keep.push(tail); n += tail.length; break;
    }
    if (field === 3 || field === 4) { changed = true; }   // 丢弃滚动词（长短两版）
    else { var seg = buf.subarray(i, end); keep.push(seg); n += seg.length; }
    i = end;
  }
  return { buf: concat(keep, n), changed: changed };
}

function frame(buf, flag) {
  var out = new Uint8Array(5 + buf.length);
  out[0] = flag;
  out[1] = (buf.length >>> 24) & 255;
  out[2] = (buf.length >>> 16) & 255;
  out[3] = (buf.length >>> 8) & 255;
  out[4] = buf.length & 255;
  out.set(buf, 5);
  return out;
}

function main() {
  if (!$response.bodyBytes) { $done({}); return; }
  try {
    var b = $response.bodyBytes;
    var flag = b[0];
    var len = (b[1] << 24 | b[2] << 16 | b[3] << 8 | b[4]) >>> 0;
    var body = b.subarray(5, 5 + len);
    var gz = flag === 1;
    if (gz && $utils && $utils.ungzip) { body = $utils.ungzip(body); }

    var r = stripWords(body);
    if (!r.changed) { $done({}); return; }

    if (gz) { $done({ bodyBytes: ($utils && $utils.gzip) ? $utils.gzip(r.buf) : r.buf }); }
    else { $done({ bodyBytes: frame(r.buf, flag) }); }
  } catch (e) { $done({}); }
}

main();
