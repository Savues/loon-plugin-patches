/*
 * hub_anim.response.js —— 省钱月卡 H5 屏蔽「强化续费提醒」全屏动效（自研脚本）
 *
 * 端点：POST /api/pinduoduo.com/api/wizard/gather/homepage
 *   页面：m.pinduoduo.net/hub_renew_manage.html（月卡续费管理）、
 *         hub_monthly_card.html（月卡首页）
 *
 * 背景（2026-10-28 抓包 shared-F85762F4_484 定位）
 *   进页面会弹一个全屏 Lottie 动效（「抽奖」观感），必须按一下才继续，
 *   把用户硬控几秒。抓包证实：按那一下【不发任何网络请求】——
 *   /api/wizard/jaina/* 一条都没有，券在进页面时服务端就已下发
 *   （coupon_stats.daily_lottery_coupon.claim_type=0 且 coupon_list 已有券）。
 *   所以它是纯前端动画。
 *
 *   为什么原有的 auto_skip（hub_skip.response.js）没生效：
 *   那个脚本找的是「跳过」按钮（文本节点 或 sc-zpklgs 的 ::after 伪元素）。
 *   但本页全部响应里 zpklgs / skip-text 出现 0 次 —— 这个动效压根没有
 *   跳过按钮，是要按「抽奖」。目标不存在，不是脚本写错。
 *
 *   真正的开关（扫了 gather/homepage 全部 39 个 popup 字段，只有它开着）：
 *     .gift_cash.hit_enhance_renew_remind = 1        ← 强化续费提醒
 *     .gift_cash.renewal_status.popups_type = 0
 *   配套 i18n 资源 mobile-hub.csp.lottie_emphasize73598_img_{3,5,7}
 *   → promotion.pddpic.com/promo/hub_monthly_card/20251205/172902/lottie/images/
 *   「emphasize」= 强调提醒，与 hit_enhance_renew_remind 语义吻合。
 *
 * 做法：把 hit_enhance_renew_remind 置 0，让前端不播这个动效。
 *   只改这一个字段，不动 homepage_meta.cards（移除卡片更激进，会改变页面布局）。
 *
 * 开关：hub_anim（默认开，= 屏蔽动效）。
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

try {
  if (!KILL) { $done({}); return; }

  const raw = $response.body;
  if (!raw) { $done({}); return; }

  let j = null;
  try { j = JSON.parse(raw); } catch (e) { j = null; }
  if (!j || typeof j !== 'object') { $done({}); return; }

  let changed = false;

  // ① 强化续费提醒动效（本页唯一开着的 popup 标志）
  const gc = j.gift_cash;
  if (gc && typeof gc === 'object') {
    if (gc.hit_enhance_renew_remind !== 0) {
      gc.hit_enhance_renew_remind = 0;
      changed = true;
    }
    // 续费弹层类型：0 已是「不弹」，防御性兜底
    const rs = gc.renewal_status;
    if (rs && typeof rs === 'object' && rs.popups_type !== 0) {
      rs.popups_type = 0;
      changed = true;
    }
  }

  // ② 兜底：清掉其他已知的「强化/引导」类弹层（只动 true 的）
  const killTrue = (obj, keys) => {
    if (!obj || typeof obj !== 'object') return;
    for (const k of keys) {
      if (obj[k] === true) { obj[k] = false; changed = true; }
    }
  };
  killTrue(j.cash, ['popup_activity_remind', 'popup_cash_upgrade']);
  killTrue(j.subsidy, ['ten_inspirit_popup', 'order_wrap_popup', 'show_ten_popup_v2',
                       'respected_popup', 'ten_subsidy_red_dot_popup',
                       'fifty_subsidy_red_dot_popup', 'ten_guarantee_popup']);
  killTrue(j.free_order, ['show_teacher_popups']);
  killTrue(j.bank_mission, ['show_popups', 'show_popups_v2']);
  killTrue(j.cash_mission, ['popup_back_retain', 'popup_multi_reward_tomorrow']);
  killTrue(j.misc && j.misc.guide_clearance_v2, ['guide_seckill_popup', 'guide9_k9_popup']);
  killTrue(j.coupon_stats && j.coupon_stats.common_page_claim_coupon, ['show_guide_popup']);
  killTrue(j.coupon_stats && j.coupon_stats.mark_type_info, ['show_cash_coupon_popup']);
  killTrue(j.card_goods && j.card_goods.renew_tip && j.card_goods.renew_tip.renewal_activity,
           ['show_popup', 'has_popup_toady', 'show_popup_v2']);

  // ③ 续费页弹窗（v2.33 修正）：真实路径是 card_goods.renewal_activity.renew_page_popup
  //    v2.32 只处理了 card_goods.renew_tip.renewal_activity，漏了这一层，
  //    导致 renew_page_popup.show_popup=true 一直生效（popup_id=157）。
  const ra = j.card_goods && j.card_goods.renewal_activity;
  if (ra && typeof ra === 'object') {
    killTrue(ra, ['show_popup', 'has_popup_toady', 'show_popup_v2']);
    const rpp = ra.renew_page_popup;
    if (rpp && typeof rpp === 'object' && rpp.show_popup === true) {
      rpp.show_popup = false;
      changed = true;
    }
  }
  // ④ 顶层同名兜底
  killTrue(j.renewal_activity, ['show_popup', 'has_popup_toady', 'show_popup_v2']);
  if (j.renewal_activity && j.renewal_activity.renew_page_popup
      && j.renewal_activity.renew_page_popup.show_popup === true) {
    j.renewal_activity.renew_page_popup.show_popup = false;
    changed = true;
  }

  if (!changed) { $done({}); return; }
  $done({ body: JSON.stringify(j) });
} catch (e) {
  // 兜底：出错一律放行，绝不因脚本问题让月卡页打不开
  $done({});
}
