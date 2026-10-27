/*
 * popup_kill.response.js —— 消费券/月卡页「弹窗类」总开关（自研脚本）
 *
 * 挂载：
 *   POST /api/pinduoduo.com/api/wizard/gather/common/page   抽奖弹窗配置
 *   POST /api/pinduoduo.com/api/wizard/gather/homepage      月卡首页/续费页数据
 *
 * 背景（2026-10-28 抓包 shared-40E3ABB7_19 定位）
 *   进 hub_renew_manage.html 会弹全屏「抽奖」动效，按一下才继续。
 *   前几版分别改过 gather/homepage 的：
 *     · gift_cash.hit_enhance_renew_remind        → 无效
 *     · card_goods.renewal_activity.renew_page_popup.show_popup → 无效
 *   真正的触发点在 gather/common/page：
 *     presend_cpn.guide_style = 80003
 *   80003 = 前端枚举 PT.DRAW_TWICE（见 hub_coupon_send_precoupon_*.js @9158）：
 *     { isActive: v && (f === PT.DRAW_TWICE || f === PT.DRAW_TWICE_80503_style4),
 *       getPopup: { popupKey: showDrawTwicePopup } }
 *   前端错误上报也印证：pagePath=/hub_renew_manage.html,
 *     errorMsg=monthly_card_popup, extras.skey=showDrawTwicePopup
 *
 * ⚠️ 不同账号可能下发不同的 guide_style（实测枚举里 80000~80042 全是弹窗类），
 *    所以【不枚举固定值】，改为按范围判断 + 全树遍历：
 *
 *    guide_style / guideStyle ∈ [80000, 90000)  → 置 0
 *    guide_pop   / guidePop   === true          → false
 *    hit_enhance_renew_remind === 1             → 0
 *    renew_page_popup.show_popup === true       → false
 *    renewal_activity.show_popup / has_popup_toady / show_popup_v2 === true → false
 *
 *   遍历时不绑路径，任何层级命中都处理 —— 兼容不同账号/不同组件版本。
 *
 * 开关：hub_anim（默认开 = 屏蔽弹窗；关 = 原样放行）
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

// 默认开：不传时也屏蔽
const KILL = (A.hub_anim === undefined || A.hub_anim === null || A.hub_anim === '')
  ? true
  : on(A.hub_anim);

// guide_style 在 [80000, 90000) 区间 = 弹窗引导类型（实测枚举 80001~80042）
const isPopupStyle = (v) => {
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return isFinite(n) && n >= 80000 && n < 90000;
};

try {
  if (!KILL) { $done({}); return; }

  const raw = $response.body;
  if (!raw) { $done({}); return; }

  let root = null;
  try { root = JSON.parse(raw); } catch (e) { root = null; }
  if (!root || typeof root !== 'object') { $done({}); return; }

  let changed = 0;
  const seen = [];   // 防环（正常 JSON 不会有，但 JSON.parse 结果可能是共享引用）

  function walk(node, depth) {
    if (!node || typeof node !== 'object' || depth > 12) return;
    if (seen.indexOf(node) !== -1) return;
    seen.push(node);

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) walk(node[i], depth + 1);
      return;
    }

    for (const k in node) {
      const v = node[k];

      if (k === 'guide_style' || k === 'guideStyle') {
        if (isPopupStyle(v)) { node[k] = 0; changed++; continue; }
      }
      if (k === 'guide_pop' || k === 'guidePop') {
        if (v === true) { node[k] = false; changed++; continue; }
      }
      if (k === 'hit_enhance_renew_remind') {
        if (v === 1 || v === true) { node[k] = 0; changed++; continue; }
      }
      if (k === 'renew_page_popup' && v && typeof v === 'object') {
        if (v.show_popup === true) { v.show_popup = false; changed++; }
      }
      if (k === 'renewal_activity' && v && typeof v === 'object') {
        for (const f of ['show_popup', 'has_popup_toady', 'show_popup_v2']) {
          if (v[f] === true) { v[f] = false; changed++; }
        }
      }

      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  }

  walk(root, 0);

  if (!changed) { $done({}); return; }
  $done({ body: JSON.stringify(root) });
} catch (e) {
  // 兜底：出错一律放行，绝不因脚本问题让页面打不开
  $done({});
}
