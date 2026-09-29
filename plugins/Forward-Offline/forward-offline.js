/*
 * forward-offline.js — Forward 插件的离线替代实现
 *
 * 用途：在原作者的 mock.forward1.workers.dev 失效后，
 *       用本脚本在请求发出前直接伪造订阅凭据响应。
 *
 * 为什么用 http-request 而不是 http-response：
 *   http-request 脚本在请求**离开设备之前**返回假响应，请求根本不会发到
 *   fluxapi.vvebo.vip。所以真实服务器是否存活、是否 403、网络是否可达，
 *   全部不影响结果 —— 这是比原作者「改写到远程 mock」更彻底的离线方案。
 *   （仍需 [Mitm] 声明该域名，因为要看到 https 请求就得先解密。）
 *
 * 挂载方式（Forward-Offline.lpx 里已配好）：
 *   [Script]
 *   mock-subscription = http-request, script-path=forward-offline.js
 *   [Rewrite]
 *   ^https:\/\/fluxapi\.vvebo\.vip\/v1\/purchase\/iap\/subscription mock-subscription
 *   [Mitm]
 *   hostname = fluxapi.vvebo.vip
 *
 * 响应结构（2026-09-29 对线上 worker 采样 6 次、真实站采样 3 次实测得出）：
 *   128 字节固定前缀  +  160 字节随机  →  base64  →  JSON 字符串  →  386 字节
 *   固定前缀在真实站与 mock 站完全一致；随机尾部每次请求都变（250/256 字节取值，
 *   分布接近均匀），说明上游只校验结构、不校验尾部内容。
 */

const PREFIX_HEX =
  "731570b90002b037ecb28b93c9f9e56800e2433a4b8105ba8bdb74b176f0b284" +
  "77f4b4e43f59428f55726af611e1dff61ac322125bd3537fdd6b1573d719771c" +
  "7086cc7a204f7909b34ab2902e0546973941031af766fce853ecedf99b2640f" +
  "4c18960412bb7aa2886c6d40743a29d76447edbe3d803cb0bee8e798d2165cc0c";

const PREFIX_LEN = 128;   // 固定前缀字节数
const RANDOM_LEN = 224;   // 变化段字节数（2026-09-29 实测：有签名时 224，无签名降级时 160）

function randomBytes(n) {
  const out = new Uint8Array(n);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function buildBody() {
  const prefix = hexToBytes(PREFIX_HEX);
  const tail = randomBytes(RANDOM_LEN);
  const full = new Uint8Array(PREFIX_LEN + RANDOM_LEN);
  full.set(prefix, 0);
  full.set(tail, PREFIX_LEN);

  let bin = "";
  for (let i = 0; i < full.length; i++) bin += String.fromCharCode(full[i]);
  const b64 = (typeof btoa === "function")
    ? btoa(bin)
    : Buffer.from(full).toString("base64");

  // 【关键·2026-09-29 修正】线上凭据是【双层 base64】，且外层【不加引号】。
  //
  //   密文 352B(128固定+224变化)
  //     -> base64            = 472 字符
  //     -> 加引号成 JSON 字符串 = 474 字节
  //     -> 再 base64（无引号） = 632 字符  ← 这就是 HTTP 响应体
  //
  // 已用 23 个 HAR 样本逐字节验证：重建值与真实响应体完全相同。
  // 单层只得到 288 字节，App 解不开 —— 这是 v1.0 失效的根因。
  //
  // 注意 Node 的 "binary" 是 latin1 语义，对 ASCII 的 base64 文本会算错长度，
  // 必须用 "utf8"；btoa 则无此问题。
  const inner = JSON.stringify(b64);              // 474 字节，含引号
  const b64b = (typeof btoa === "function")
    ? btoa(inner)
    : Buffer.from(inner, "utf8").toString("base64");

  return b64b;                                    // 632 字符，裸 base64
}

try {
  $done({
    response: {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: buildBody(),
    },
  });
} catch (e) {
  $done({ response: { status: 200, headers: { "content-type": "text/plain" }, body: "mock error: " + e } });
}
