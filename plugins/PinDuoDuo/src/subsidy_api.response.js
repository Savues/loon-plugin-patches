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
