/*
 * subsidy_popup.response.js —— 屏蔽首页「直播购物补贴」弹窗（自研脚本）
 *
 * 挂载：https://api.pinduoduo.com/api/aquarius/hungary/global/homepage
 *
 * 取证（2026-11-01 HAR shared-6BE310EC_16_1793551183474）
 *   响应 list[0] = {
 *     module:      "ddvideo_shopping_subsidy_payment_0118_v5_wd",
 *     render_id:   10,             ← 首页弹窗位
 *     biz_domain:  "ddvideo",
 *     display:     1,
 *     priority:    350,
 *     occasion:    [1],
 *     start_time:  1754200417,     ← 2025-08-03
 *     end_time:    1825087186,     ← 2027-11-01
 *     data.jump_url: alive_shopping_allowance.html?page_from=6021192...
 *   }
 *   弹窗内容：江苏专属补贴 ¥16.80 / 发放渠道 多多视频 / 下单可部分抵扣
 *   图片：promotion.pddpic.com/promo/pddvideo/ce77bd16-...png.slim.png（750×936）
 *
 *   AB 候选（algo_rec_ab.sort_list）：
 *     ddvideo_shopping_subsidy_payment_0118_v5_wd   ← 本次下发
 *     ddvideo_shopping_subsidy_payment_0118_v6_wd
 *     ddvideo_shopping_subsidy_payment_0118_v8_wd
 *   所以按【module 前缀】匹配，不写死 v5。
 *
 * 做法：只删除 list 中匹配的弹窗项，不 reject 整个接口
 *   —— 该接口是首页弹窗/全局配置容器，reject 可能影响其他下发。
 *
 * 开关：subsidy_popup（默认开）
 */

const A = (function (raw) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = {}; } }
  if (Array.isArray(v)) {
    const merged = {};
    for (let i = 0; i < v.length; i++) {
      const it = v[i];
      if (it && typeof it === 'object' && !Array.isArray(it)) for (const k in it) merged[k] = it[k];
    }
    v = merged;
  }
  return (v && typeof v === 'object') ? v : {};
})($argument);
const on = (v) => v === true || v === 1 || v === 'true' || v === '1' || v === 'on' || v === 'ON';

const KILL = (A.subsidy_popup === undefined || A.subsidy_popup === null || A.subsidy_popup === '')
  ? true : on(A.subsidy_popup);

// 前缀族：覆盖 v5 / v6 / v8 等所有 AB 变体
const PREFIX = 'ddvideo_shopping_subsidy_payment';

try {
  if (!KILL) { $done({}); return; }

  const raw = $response.body;
  if (!raw) { $done({}); return; }

  let root = null;
  try { root = JSON.parse(raw); } catch (e) { root = null; }
  if (!root || typeof root !== 'object' || !Array.isArray(root.list)) { $done({}); return; }

  const kept = [];
  let killed = 0;
  for (let i = 0; i < root.list.length; i++) {
    const it = root.list[i];
    const mod = (it && typeof it.module === 'string') ? it.module : '';
    if (mod.indexOf(PREFIX) === 0) { killed++; continue; }
    kept.push(it);
  }

  if (!killed) { $done({}); return; }

  root.list = kept;
  $done({ body: JSON.stringify(root) });
} catch (e) {
  // 兜底：出错一律放行
  $done({});
}
