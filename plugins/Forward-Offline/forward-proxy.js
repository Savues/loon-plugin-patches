/*
 * forward-proxy.js — Forward 订阅凭据转发
 *
 * App 的请求转给作者的 mock 服务器，响应原样送回。
 * 密钥与加解密全在服务器侧，客户端不做任何密码学操作。
 *
 * 转发 App 的全部请求头，不做筛选。理由（2026-09-29 实测）：
 *   - 只有 X-Auth-Key 是必需的，x-signature / x-timestamp / Authorization
 *     传不传都能拿到凭据（编造的 UUID 也可以）。
 *   - 照搬作者原版（URL 改写，由 Loon 隐式转发全部头）的行为。
 *
 * 排除 accept-encoding：br/gzip 会改变响应 body 的字节形态。
 * 排除 content-length：body 未改动，由运行时重算。
 *
 * ⚠️ $httpClient 是【回调式】API，不返回 Promise。
 *    写成 $httpClient.fetch(...).then(...) 会在 Loon 上抛错并静默失败
 *    （v1.0 就这么写的，表现为插件完全没生效）。
 *    Promise 风格属于 Surge 的 $task.fetch，不能照抄。
 *
 * 不要与原版 Forward.lpx 同时启用 —— 两条规则会争同一个请求。
 */

const TARGET = "https://mock.forward1.workers.dev/forward/v1/purchase/iap/subscription";

const SKIP = {
  "accept-encoding": 1,   // 压缩改变 body 形态
  "content-length": 1,    // body 未改，由运行时重算
  "host": 1,              // 目标主机不同
  "connection": 1,
};

const headers = {};
for (const k in $request.headers) {
  if (!SKIP[k.toLowerCase()]) headers[k] = $request.headers[k];
}
if (!Object.keys(headers).some(k => k.toLowerCase() === "content-type")) {
  headers["Content-Type"] = "application/json";
}

$httpClient.post({
  url: TARGET,
  headers: headers,
  body: $request.body || "",
  timeout: 15000,
}, function (err, resp, data) {
  // 放行条件：转发失败 / 非 2xx。mock 的降级响应（386 字节）是一份
  // 解不开的凭据，App 拿到它与「未订阅」表现完全相同，
  // 不如让请求照常打到真实服务器，至少拿到合法的未订阅响应。
  if (err) { $done({}); return; }
  const st = (resp && resp.status) || 0;
  if (st < 200 || st >= 300) { $done({}); return; }
  $done({
    response: {
      status: st,
      headers: {
        "content-type": (resp.headers && resp.headers["content-type"]) ||
                        "application/json; charset=utf-8",
      },
      body: data || "",
    },
  });
});
