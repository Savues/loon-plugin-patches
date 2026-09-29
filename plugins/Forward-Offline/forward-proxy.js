/*
 * forward-proxy.js — Forward 订阅凭据转发
 *
 * App 的请求转给作者的 mock 服务器，响应原样送回。
 * 密钥与加解密全在服务器侧，客户端不做任何密码学操作。
 *
 * 转发 App 的全部请求头，不做筛选。理由（2026-09-29 实测）：
 *   - 只有 X-Auth-Key 是必需的，x-signature / x-timestamp / Authorization
 *     传不传都能拿到凭据（编造的 UUID 也可以）。
 *   - 但【筛选会改变响应形态】：只发 X-Auth-Key + content-type 时，
 *     mock 返回 450 字节单层 base64（336 字节密文）；
 *     转发全部头时返回 632 字节双层（352 字节密文）。
 *     两者前缀相同、载荷长度差 16 字节，App 认哪个未经证实。
 *     ⇒ 既然原版（URL 改写，隐式转发全部头）是可用的，就照它的行为转发。
 *
 * 不转发 accept-encoding：gzip/br 会改变 body 的字节形态。
 * 不转发 content-length：body 未改动，由运行时重算。
 *
 * 不要与原版 Forward.lpx 同时启用 —— 两条规则会争同一个请求。
 */

const TARGET = "https://mock.forward1.workers.dev/forward/v1/purchase/iap/subscription";

const SKIP = new Set([
  "accept-encoding",   // 压缩改变 body 形态
  "content-length",    // body 未改，由运行时重算
  "host",              // 目标主机不同
  "connection",
]);

const headers = {};
for (const k in $request.headers) {
  if (!SKIP.has(k.toLowerCase())) headers[k] = $request.headers[k];
}
if (!Object.keys(headers).some(k => k.toLowerCase() === "content-type")) {
  headers["Content-Type"] = "application/json";
}

$httpClient
  .fetch({
    url: TARGET,
    method: "POST",
    headers: headers,
    body: $request.body || "",
    timeout: 15,
  })
  .then((res) => {
    const st = res.status || 0;
    // 非 2xx 一律放行：mock 的降级响应（386 字节）是一份解不开的凭据，
    // App 拿到它与「未订阅」表现完全相同，不如让请求照常打到真实服务器。
    if (st < 200 || st >= 300) { $done({}); return; }
    $done({
      response: {
        status: st,
        headers: {
          "content-type": (res.headers && res.headers["content-type"]) ||
                          "application/json; charset=utf-8",
        },
        body: res.body || "",
      },
    });
  })
  .catch(() => $done({}));   // 转发失败也放行：App 至少能拿到合法的未订阅响应
