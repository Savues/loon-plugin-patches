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
const AD_BADGE_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALgAAADQCAYAAAC0lKvwAAAACXBIWXMAAAsTAAALEwEAmpwYAAAGa0lEQVR4nO3dXUhUaRzH8WeZaMQYy0aw0RRmx0FpS0wQxGSTOBtIyywUhhdLRolEFwq9TRB4UUQOQdHNErFRXQQxF4YDEfTKIqXi4lS0NmZwIhtfYswcqRhoYK8kyTPqOHPOnHP8fi6fx+P5O/w4npfn/EcIAAAAAAAAAAAAAAAAAAAAAAAAANr5KcXtVwkhHOkoBKoaE0J8y3QRmbAqxe2zhRAN6SgEqvpbCBHNdBGZkGrAAV0j4DA1Ag5TI+AwNQIOUyPgMDUCDlMj4DA1wwdckqS8SCQSe/bs2Uyma1EiSVLe+vXrrT+OB4PBqeHh4S+ZqGklMVTAKyoqbHV1dfmlpaV5brc73+l0FgohhCzLYUmSurSoQZKkvD179pT09vaO3rhx491iP3/y5Mlts3XOdeXKlUc+ny+kTpWYZZiA7927t/DcuXN/KM05nc7CiooKmxZH8ebm5vKqqqqynTt3Vra3twtZlsPBYHDk9u3b8tOnT6fU3j+SY5iA+/3+8LFjx6bsdnuu0vyBAwfKWltb+9Wswe12Z1dWVpbMHXM6nYVOp7MwHA5HCbj+GCbgQghx//79/xobG2uV5qqrq0uEEKoGfP/+/SUWi2XeZxaLxWJXr16V1dw3lsdQAb9+/fqbhoaGaqWQ2e32XI/Hkx8IBCbU2n99fX250nhPT09oZmYmrtZ+sXyprgfPEUI0J7PBrVu3dlRVVZWluN+0c7lcfy00f+jQIefx48frleYmJyenotGo4h2RgoKCPKvVOu8uykLbLKajo+PJgwcPIklswnJZLGzXrl2liebsdntuomuDdG4zS+m2I5QR8CVoamoq3rRp08+ZrgPJI+CLcDgc1qNHj+7IdB1YHgK+iIsXL25bs2ZNdqbrwPLoJuCyLIcHBwdHM13HXE1NTcWJLohfv3797tq1a8HFfkdbW9u2DRs25P04fu/evYHHjx+PLKeu7u7uZC4wVzTdBHxwcHBU7Qc1ybDZbJa2trZflebi8fi31tbWR0tZS9LS0hJTGn/79u0nv98fTrVOLEw3Adebw4cPu9euXZujNNfV1fUvC6WMgYAn4PP5Qq9evZryer3b555ijI+PR06fPv08k7Vh6Qj4AgKBwEQgEPC3t7f/0tjYWG21Wq0+n+8fnloah26eZN65c6dfL+fgXq+3rKWlRfe3BpNYJsyTTMCMCDhMjYDD1Ag4TI2AK+js7Hwny7Im73im4uPHj4oPkfCdbgIei8V0c+tteHj4Cw9yzEHzgK9evdqiNB6JRAgU0k7zgOfk5BhyZd758+crt27dWpTJGrRqjWEmujlFkWVZl417ZhUVFa1T6m8CfeMIDlPTNOA2m82S6D1E7ghADZoGfMuWLYrLT4UQoq+vj6Y5SDtNA15eXr5OaXxycnLKqCv0+vv7Qx8+fEjr9YMkSeVKrSaQPE0D7nK5FE9PJiYmDHv07uzsHEr3mzkDAwOlBDw9NA345s2bC5TG379//0nLOrByaBZwh8NhdblcigEfGhriJVqoQrOA79u3z6nUU1AIIV6+fMkRHKrQLOB1dXUlSuPT09PRJPvsAUumScDdbnd2otOTvr6+N1rUoJbdu3eX1tbWKv5ty5WVlcUFZppoEvAzZ84otjwWQoi7d+8auq+2Hjvl4jvVA+7xePIThWB6ejqqZj9vQPWAe73e7YnmjH56Av1TPeChUCis1JsvHo9/u3Dhwgu194+VTfWAHzx48MnZs2dnfvxunYcPH74ww1sz4+Pjka9fv6Z1oVhxcXF+omsWJEeTD/HUqVMvRkZGZo4cOfKbxWJZ9fnz5y8nTpzQRZOfVF26dOmJCo/q/0zUFxHJ0ewocfnyZXl0dLSro6Pj95s3b/YadXEVjEXz1m01NTW5Rvw+yZqamtyNGzfOe1mju7s7MjY2ltZTFI/Hk5+VlTXv4JPCf4oV27pN84AjI1ZswLmQgakRcJgaAYepEXCYGgGHqRFwmBoBh6kRcJgaAYeppRrwmBCiJx2FQFW0xQMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfPc/QbDUM1TZnXQAAAAASUVORK5CYII=';

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
