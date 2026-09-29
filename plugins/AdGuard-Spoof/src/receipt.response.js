/*
 * AdGuard-Spoof · iOS 收据校验响应改写
 *
 * 上游：AdGuardProCrack.js（混淆单行，1905 B，作者 Passer_by_yun / 分发 yqc007）
 * 本文件是它的**等价去混淆重写**，逻辑逐句一一对应，见 UPSTREAM.md 的对照表。
 *
 * ── 它做什么 ────────────────────────────────────────────────
 * 命中 ios_validate_receipt 时，把服务器返回的收据校验结果整个丢弃，
 * 换成本地伪造的一份「你买过终身版，且当前有效」。
 * 纯本地生成，不请求任何第三方 —— 与 Reven-Mirror 那种「转发到作者 Worker」
 * 的镜像不同，这里没有任何运行时外部依赖。
 *
 * ── 为什么不需要读原响应 ──────────────────────────────────────
 * 上游有一行 `JSON.parse($response.body)`，但解析结果 obj 随即被整个覆盖，
 * 从未被读取 —— 它唯一的作用是在服务端返回非 JSON（错误页 / 空体）时抛异常，
 * 导致 $done 不执行、脚本卡到超时。本重写删掉了这次无用的解析。
 *
 * ── 边界 ────────────────────────────────────────────────────
 * 脚本只改 body，不碰 status / headers —— 与上游一致。
 * 服务端仍认为未购买；本插件不解锁服务端侧的任何功能。
 */

// 上游硬编码的终身版商品 ID 与激活状态。改这里等于改伪造的凭据内容。
const PRODUCT_ID = "com.adguard.lifetimePurchase";
const PREMIUM_STATUS = "ACTIVE";

$done({
  body: JSON.stringify({
    products: [
      { product_id: PRODUCT_ID, premium_status: PREMIUM_STATUS }
    ]
  })
});
