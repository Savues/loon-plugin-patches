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
const AD_BADGE_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALgAAADQCAYAAAC0lKvwAAAACXBIWXMAAAsTAAALEwEAmpwYAAAFMUlEQVR4nO3dT2hV2QEH4FMSeGh4CdqQRp9VUmoqTiGZkSA4WLSCIgoBhYBQEeIsdJMs3ChCtiqCCxdZ6KbSjUSySGxWyabNn2KmWi0pdsiA1UkmeRgzkzyiZvBBF53Im0xsZuJ79yV3vg+yOPeee85Z/Ljce865LyEAAAAAAAAAAAAAAAAAQF78LM/tfRJCKM9zm2vd3779owhKiz0AKCQBJ9YEnFgTcGJNwIm1VR3w+vr65L59+34xPDz8Ymho6KtC99Xc3LxjoZzJZOYvXrz4z0L2SeGtuoBv3759/bVr1363bdu26rKysvUhhDA0NDQyNDT01/dt+8GDB39Ip9Nfj4yMfNnf3z/e3d2dXjhXW1tbfuTIkYaF8szMzKyAr32rLuCjo6MvU6lU5UK4Qwhh165d25PJ5GAmk8mutN0zZ87UVFRUlFdUVJTX1tZuPXTo0Mvu7u4/5mXQrFqrLuAhhHDv3r3PDx48+NFCOZFIJI4dO5a6devWs5W22djY+EFueXBw8N/vM0bWhkhXMm/fvv37hoaGHe86nw/Hjx//08OHDzO5x+rr65OdnZ0nc49NTk5OvXr1an6hvG7dukR1dXXlQjmbzb559uxZOizj6dOnU6dPnx78P1WsZBbRqryD59u5c+c+XHwsN8xLKSkpKa2pqUkVblREIfYBb2pqSu3Zs+e3xR4HxVHUgL948eKr2dnZl/lsc25u7u2LaDKZLDl//vz+3PNjY2OTjx49+mLxdVVVVcncx6f5+fn5vr6+ZWdRxsfHM8vVoXiKGvDOzs5/XLlypWAve+3t7R9XVFS8fSfIZrNvWltbexc/o4fwvzt9bsBfv34939LS8mmhxkY0Yv2IMjg4+EVdXd2vFqYcu7q6/r5UuImv2Aa8vr4+OT09/U17e/tfTpw48eGGDRvKR0ZGppqampZ8cayrq/t5brm0tLT0XXWX0t/fPzUxMTG/fE2iFNuANzc378hdmQwhhLa2tqM/9PqysrL1ly5davyh9S9cuNDV0dEx/mPGSOHFNuAQgoATc7ENeEtLy6dmQYhtwCGEIgf8yZMnkUzZnTp1auvJkye/t1z/vs6ePds7Ojqa14Uq8ivSgFdWViaj7G9BdXX1+kLsKykrKyvJd5vkV6QBr6qq2pBbHhsbc/ejoCIL+KZNmxK5HzFks9k3hf4M7V1mZmZmp6enf/Tj0ebNmysTiUSiEGOiMCIL+N69e7+zPfX58+dfR9X3YgMDA5+tZIalr6+v0RbatSWygO/fv/+XueV0Ol2Uuzc/LZEFfPfu3b/OLT9+/HjZr2XgfUUS8KamplTuttUQQrhz586TKPpeys6dOzdfv369Yfma37Vx48aizAKxcpEEvLW19ePc8tjY2GQxt63W1NSkPEv/NBQ84G1tbR8s/v5xeHj4P4XuF0KIIOA3b978/MCBA7/ZsmVLdQghzM3Nvbxx44afbCASBQ/4xMTE/NGjR7s6OjoO19bWbr179+6DYi9v9/T0rGgjlmnCtSeSZ/BMJpM9fPjwn69evfrR5cuX/xVFn7nu378/1dPT8zbQAwMDX66knd7e3s9SqdTba9Pp9Df5GB+F41+YFJ4f/iki22WJNQEn1gScWBNwYk3AiTUBBwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIC7+C6+eaEibysy2AAAAAElFTkSuQmCC';

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
