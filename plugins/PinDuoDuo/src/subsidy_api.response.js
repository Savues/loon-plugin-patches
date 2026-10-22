/*
 * subsidy_api.response.js —— 百补列表「上拉加载」分页接口的广告角标（自研脚本）
 *
 * 端点：POST /api/brand-sega/special-sale-coupon/goods_list
 *   响应：{ server_time, server_time_ms, success, result: { goods_list: [...], has_more } }
 *   字段是 **snake_case**（goods_id / goods_flag_icon / ad / lt_icon ...），
 *   与服务端渲染的 HTML（camelCase）不是同一套。
 *
 * 为什么需要单独一个脚本（2026-10-22 真机抓包 383_1792646492521 定位）：
 *   首屏商品在 m.pinduoduo.net/tandy_vase.html 的 window.rawData 里（HTML 通道，
 *   subsidy.response.js 负责）；**上拉加载的后续商品走这个 JSON 接口** ——
 *   实测该接口一次返回 20 条，其中 10 条带 `ad`（bkfl=1 + join_id + pkinfo，
 *   与信息流/百补 HTML 的广告判据完全同构）。旧版本只改 HTML，
 *   所以手机上往下翻的广告商品**一条角标都没有**。
 *
 * 落点：写 `lt_icon`。
 *   H5 的 snake→camel 映射函数里有 `ltIcon: r.lt_icon || ""`，
 *   商品图组件拿到字符串型 ltIcon 就渲染成左上角角标
 *   （CSS .ilx1YR3r{height:.52rem;width:.46rem} ≈46×52px，官方角标位）。
 *   data URI 不会被动 CDN 参数破坏：PDD 图片组件的 URL 构造函数
 *   `FT()` 开头就判 `indexOf("http")||indexOf("//")`，非 http 直接原样返回。
 *
 * 同时把广告商品的 goods_id 并进 pddAdGoodsIds 名单，
 * 让详情页（detail.response.js）也能自动打标。
 *
 * 开关：feed_ad（与信息流/详情页/百补 HTML 同一开关）。
 */

const A = (typeof $argument === 'string' ? {} : $argument) || {};
const on = (v) => v === true || v === 1 || v === 'true' || v === '1' || v === 'on' || v === 'ON';

const AD_KEY = 'pddAdGoodsIds';
const AD_CAP = 200;

// 竖版角标（184×208，比例 0.885 = 0.46rem/0.52rem 官方角标槽）
// 生成脚本：plugins/PinDuoDuo/tools/make-badge.py corner
const AD_BADGE_URL = 'data:image/png;base64,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';

// ── $persistentStore 名单合并（write(value, key)，值在前——仓库踩过的坑）──
function mergeIds(newIds) {
  try {
    let prev = [];
    try {
      const raw = $persistentStore.read(AD_KEY);
      const arr = raw ? JSON.parse(String(raw)) : [];
      if (Array.isArray(arr)) prev = arr.map(String);
    } catch (e) { prev = []; }
    const now = [];
    for (const id of newIds) if (now.indexOf(id) === -1) now.push(id);
    for (const id of prev) if (now.indexOf(id) === -1 && now.length < AD_CAP) now.push(id);
    $persistentStore.write(JSON.stringify(now), AD_KEY);
  } catch (e) { /* 存储不可用不阻断 */ }
}

// 判据与服务端广告系统一致：ad 非空对象（bkfl=1）即广告
function isAd(item) {
  if (!item || typeof item !== 'object') return false;
  const a = item.ad;
  if (!a) return false;
  if (typeof a === 'string') return a.length > 2 && a !== '{}' && a !== 'null';
  if (typeof a === 'object') return Object.keys(a).length > 0;
  return false;
}

try {
  if (!on(A.feed_ad)) {
    $done({});
  } else {
    const raw = $response.body;
    let changed = false;
    let out = raw;
    if (typeof raw === 'string' && raw.length) {
      let j = null;
      try { j = JSON.parse(raw); } catch (e) { j = null; }
      const list = j && j.result && Array.isArray(j.result.goods_list) ? j.result.goods_list : null;
      if (list) {
        const ids = [];
        for (const it of list) {
          if (!isAd(it)) continue;
          if (it.lt_icon !== AD_BADGE_URL) { it.lt_icon = AD_BADGE_URL; changed = true; }
          if (it.goods_id != null) ids.push(String(it.goods_id));
        }
        if (ids.length) mergeIds(ids);
        if (changed) out = JSON.stringify(j);
      }
    }
    $done(changed ? { body: out } : {});
  }
} catch (e) {
  // 兜底：出错一律放行，绝不因脚本问题让百补列表刷不出商品
  $done({});
}
