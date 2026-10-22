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
