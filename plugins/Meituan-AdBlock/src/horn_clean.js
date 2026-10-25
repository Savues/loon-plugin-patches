// 美团 horn 远程配置清洗: 广告/弹窗开关键反转 (portal-portm/h.meituan.com 的 horn_ios/mergeRequest)
// horn = 全 App 配置主干道 (169 模块), 只做键级反转不动结构
// 2026-10-25 清数据冷启动 HAR 实证键 (retail 模块):
//   com.meituan.retail.should_show_group_supermarket_guide_popup: "true" → "false" (闪购超市引导弹窗)
//   com.meituan.retail.maicai_splash_hidden: false → true (买菜开屏隐藏)
//   com.meituan.retail.splash_vap: true → false (开屏 VAP 动画)
//   com.meituan.retail.splash_video_disabled: false → true (开屏视频禁用)
//   pt_business_mine_popup_enable: true → false (我的页弹窗, 沙盒horn实证)
const REVERSES = [
  [/("com\.meituan\.retail\.should_show_group_supermarket_guide_popup"\s*:\s*)"?true"?/g, '$1"false"'],
  [/("com\.meituan\.retail\.maicai_splash_hidden"\s*:\s*)false/g, '$1true'],
  [/("com\.meituan\.retail\.splash_vap"\s*:\s*)true/g, '$1false'],
  [/("com\.meituan\.retail\.splash_video_disabled"\s*:\s*)false/g, '$1true'],
  [/("pt_business_mine_popup_enable"\s*:\s*)true/g, '$1false'],
  // --- v0.5: horn 650 配置全量盘点新增 (沙盒实证) ---
  // 通用弹窗/推送弹窗
  [/("general_popup_enable"\s*:\s*)true/g, '$1false'],
  [/("popup_service_switch"\s*:\s*)true/g, '$1false'],
  [/("sharkpush_MTPushPopupMessage"\s*:\s*)true/g, '$1false'],
  [/("rn_hotel_homepage_popup"\s*:\s*)true/g, '$1false'],
  // 引导浮层
  [/("recommend_guide_layer_switch"\s*:\s*)true/g, '$1false'],
  [/("iOS_enableShowDirectSaleGuide"\s*:\s*)true/g, '$1false'],
  // 横幅
  [/("benefit_banner_animation"\s*:\s*)true/g, '$1false'],
  [/("cashback_banner_enable"\s*:\s*)true/g, '$1false'],
  // 小说阅读器广告族 (readerMSCToMRN): 章节末/段末/插页/解锁广告/金币 全关
  [/("adPageBanner"\s*:\s*)1/g, '$10'],
  [/("adParaEnd"\s*:\s*)1/g, '$10'],
  [/("adInsertPage"\s*:\s*)1/g, '$10'],
  [/("adChapterUnLock"\s*:\s*)1/g, '$10'],
  [/("adChapterEnd"\s*:\s*)1/g, '$10'],
  [/("adParaGoldCoin"\s*:\s*)1/g, '$10'],
  [/("openScreen"\s*:\s*)1/g, '$10'],
  [/("fullScreen"\s*:\s*)1/g, '$10'],
  // --- v0.6: 高嫌疑开关 (用户拍板: 有嫌疑就加, 26个) ---
  // 悬浮窗/浮层
  [/("floatWindow(?:AB|MGC)"\s*:\s*)true/g, '$1false'],
  [/("(?:channel_float_refresh_open|showTopFloatLayer_single|msi_showFloatLayer_onMainThread|coupons_float_layer_get_sharedStorage|sharkpush_meishi_float_picasso|gc_poidetail_float_video)"\s*:\s*)true/g, '$1false'],
  // 券/优惠弹层
  [/("(?:head_coupon_ios|head_coupon_layer_ios|coupon_dialog_is_open_by_url|receiveCoupon|iOS_enableHostSendCoupon|findCouponUpgradeEnable|enable_coupon_detail_pre_request)"\s*:\s*)true/g, '$1false'],
  // 横幅
  [/("(?:traffic_platform_banner_switch|open_banner_optimized|updateNewMliveBanner|is_fix_banner_promotion|enable_city_commerce_activity)"\s*:\s*)true/g, '$1false'],
  // 引导/运营
  [/("(?:iOS_enableGuideComment|guide_detail|guide_page_preload_result_page|enable_live_activity_pike|enableMannulReceiveOperational|popupLimitStatus)"\s*:\s*)true/g, '$1false'],
];

let body = $response.body;
if (typeof body === 'string' && body.length > 1000) {
  let changed = false;
  for (const [re, rep] of REVERSES) {
    if (re.test(body)) { body = body.replace(re, rep); changed = true; }
    re.lastIndex = 0;
  }
  if (changed) { $done({ body }); return; }
}
$done({});
