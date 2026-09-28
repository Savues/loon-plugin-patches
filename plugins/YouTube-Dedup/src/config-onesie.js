/*
 * YouTube 去广告 · UMP onesie 密钥采集（config 端点专用）
 *
 * 存在的理由
 *   上游 YouTube_remove_ads_response.js 会把 youtubei/v1/config 的响应交给
 *   youtube.response.config.Config 解析，并从中取出
 *     response_context(1) → globalConfigGroup(16) → hotConfigGroup(7)
 *       → mediaHotConfig(138536474) → onesieHotConfig(146311580)
 *       → clientKey(1) / encryptKey(2)
 *   存进 persistentStore 的 YouTubeConfig，供同插件的 *_request.js 使用
 *   （它靠这个缓存决定要不要保留 x-youtube-hot-hash-data 头）。
 *
 *   但上游给 youtube.response.config.ColdConfigGroup 写了一个「空 schema」，
 *   它的 internalBinaryRead 直接 return、一个字节都不消费。YouTube 现在
 *   一定会下发 GlobalConfigGroup.coldConfigGroup（实测 42 KB），于是 reader
 *   整体错位，随后把一个 298 字节的嵌套 protobuf 当成 field 4 的 string 解码，
 *   抛出 "The encoded data was not valid for encoding utf-8"。
 *   结果：config 处理器永远跑不到，onesie 密钥永远采集不到。
 *
 *   本脚本只做这一件事，用一条不依赖任何 schema 的定长路径取密钥，
 *   改由本插件的 http-response 规则单独挂载；config 不再交给上游脚本。
 *   响应体一律不改写（$done({})），只写 persistentStore。
 *
 * 字段来源：Maasea/sgmodule 的 youtube.response.js（YouTube 内幕 protobuf）
 * 行为对照：与上游 ri() 处理器等价 —— 相同则不写、只更新变化的一侧。
 */

(function () {
  'use strict';

  var STORE_KEY = 'YouTubeConfig';

  // ---- 极简 protobuf 取值：只找「指定字段号的第一个 length-delimited 子消息」 ----

  function readVarint(bytes, pos) {
    var result = 0;
    var shift = 0;
    while (pos < bytes.length) {
      var byte = bytes[pos++];
      result += (byte & 0x7f) * Math.pow(2, shift);
      if ((byte & 0x80) === 0) return [result, pos];
      shift += 7;
      if (shift > 63) break;
    }
    throw new Error('bad varint');
  }

  // 返回 bytes 中第一个字段号为 fieldNo 的 length-delimited 字段的内容切片
  function dig(bytes, fieldNo) {
    var pos = 0;
    while (pos < bytes.length) {
      var tag = readVarint(bytes, pos);
      pos = tag[1];
      var no = Math.floor(tag[0] / 8);
      var wire = tag[0] & 7;
      if (no === 0 || wire > 5) return null; // 非法 tag，放弃
      if (wire === 0) {
        pos = readVarint(bytes, pos)[1];
      } else if (wire === 1) {
        pos += 8;
      } else if (wire === 5) {
        pos += 4;
      } else if (wire === 2) {
        var len = readVarint(bytes, pos);
        pos = len[1];
        var end = pos + len[0];
        if (end > bytes.length) return null; // 截断，放弃
        if (no === fieldNo) return bytes.subarray(pos, end);
        pos = end;
      } else {
        return null; // group，YouTube inner tube 不会用
      }
      if (pos > bytes.length) return null;
    }
    return null;
  }

  // ---- base64（不依赖 atob/btoa 的存在） ----

  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function base64(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i];
      var b1 = i + 1 < bytes.length ? bytes[i + 1] : NaN;
      var b2 = i + 2 < bytes.length ? bytes[i + 2] : NaN;
      out += B64[b0 >> 2];
      out += B64[((b0 & 3) << 4) | (isNaN(b1) ? 0 : b1 >> 4)];
      out += isNaN(b1) ? '=' : B64[((b1 & 15) << 2) | (isNaN(b2) ? 0 : b2 >> 6)];
      out += isNaN(b2) ? '=' : B64[b2 & 63];
    }
    return out;
  }

  // ---- 运行时适配 ----

  function toBytes(body) {
    if (!body) return null;
    if (body instanceof Uint8Array) return body;
    if (body instanceof ArrayBuffer) return new Uint8Array(body);
    if (typeof body === 'string') {
      // Loon 在 binary-body-mode 下给 Uint8Array；这里只兜底二进制字符串
      var out = new Uint8Array(body.length);
      for (var i = 0; i < body.length; i++) out[i] = body.charCodeAt(i) & 0xff;
      return out;
    }
    return null;
  }

  function header(name) {
    var h = ($request && $request.headers) || {};
    return h[name] != null ? h[name] : h[name.toLowerCase()];
  }

  function readStore() {
    try {
      var raw = $persistentStore.read(STORE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function extract(bytes) {
    var responseContext = dig(bytes, 1);
    if (!responseContext) return null;
    var globalConfigGroup = dig(responseContext, 16);
    if (!globalConfigGroup) return null;
    var hotConfigGroup = dig(globalConfigGroup, 7);
    if (!hotConfigGroup) return null;
    var mediaHotConfig = dig(hotConfigGroup, 138536474);
    if (!mediaHotConfig) return null;
    var onesie = dig(mediaHotConfig, 146311580);
    if (!onesie) return null;
    var clientKey = dig(onesie, 1);
    var encryptKey = dig(onesie, 2);
    if (!clientKey || !encryptKey || clientKey.length === 0 || encryptKey.length === 0) return null;
    return { clientKey: base64(clientKey), encryptKey: base64(encryptKey) };
  }

  function run() {
    try {
      var bytes = toBytes($response && $response.body);
      if (!bytes || bytes.length < 8) return;
      var keys = extract(bytes);
      if (!keys) return;
      var ua = String(header('user-agent') || '');
      var platform = ua.toLowerCase().indexOf('music') >= 0 ? 'youtubeMusic' : 'youtube';
      var config = readStore();
      var current = config[platform];
      if (current && current.clientKey === keys.clientKey && current.encryptKey === keys.encryptKey) return;
      config[platform] = keys;
      $persistentStore.write(STORE_KEY, JSON.stringify(config));
    } catch (e) {
      // 采集失败就什么都不做，绝不影响响应
    }
  }

  try {
    run();
  } catch (e) {
    // noop
  }
  $done({});
})();
