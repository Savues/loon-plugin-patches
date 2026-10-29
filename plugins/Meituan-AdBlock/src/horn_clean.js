// 美团 horn 远程配置清洗: 广告/弹窗开关键反转 (portal-portm/h.meituan.com 的 horn_ios/mergeRequest)
// horn = 全 App 配置主干道 (169 模块), 只做键级反转不动结构
// 2026-10-25 清数据冷启动 HAR 实证键 (retail 模块):
//   com.meituan.retail.should_show_group_supermarket_guide_popup: "true" → "false" (闪购超市引导弹窗)
//   com.meituan.retail.maicai_splash_hidden: false → true (买菜开屏隐藏)
//   com.meituan.retail.splash_vap: true → false (开屏 VAP 动画)
//   com.meituan.retail.splash_video_disabled: false → true (开屏视频禁用)
//   pt_business_mine_popup_enable: true → false (我的页弹窗, 沙盒horn实证)
// 2026-10-25 v0.8: 全量 169 模块 751KB 二次盘点, 补 29 个漏网键
// 2026-10-25 v0.9: 广告系统模块深挖 (mt_ad_common_strategy/mt_bb_ad_config/adp_pagasus), 补 10 个
// 2026-10-29 v0.9.0: 169 模块深度二次扫描 (开屏时长/promo/券列表/首页营销卡片频控/拼好饭弹窗), 补 13 个
// 2026-10-29 v1.0.0: 全量 2655 叶子键穷举 — 字符串内嵌 JSON 盲区 (rec_config 3个广告位) + 增长业务 + CPC广告, 补 3 个
// 2026-10-29 v1.1.0: 隐私/遥测/内部测试 (截图上传/设备指纹/Beacon+WiFi采集/请求异常上报/Logan+Raptor/midas监控/酒店mock), 补 16 个
// 2026-10-29 v1.2.0: 真机 703KB 全量漏网扫描 — 位置监控/采样上报/首页漏斗速度/FeedRaptor/图片流量日志/酒店Pike/AB白名单/流量测试/调试信息/公交原生测试, 补 14 个
// 2026-10-29 v1.3.1: AB实验分组 + 图标Babel上报, 补 2 个
// (原 v1.3.0 的 3 条测试环境 URL 改写已按用户要求移除 — 不动 deeplink/SSR 配置)
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
  // --- v0.8: 169 模块全量二次盘点 (751KB), 29 个漏网键 ---
  // 插屏广告 (最重要)
  [/("interstitialUseBridge"\s*:\s*)true/g, '$1false'],
  // 推送族
  [/("(?:miaowaPush|metpush_categories_enable|iOS_enablePushFilterMultiple|order_new_push_list)"\s*:\s*)true/g, '$1false'],
  // 任务列表 (抢任务/任务中心)
  [/("gb_tasklist_mrn_on"\s*:\s*)true/g, '$1false'],
  [/("isGrabTaskListPikeOn[^"]*"\s*:\s*)true/g, '$1false'],
  // 透明活动 / 浮层冲突
  [/("(?:check_transparent_activity|resolve_touch_matrix_and_hi_float_conflict)"\s*:\s*)true/g, '$1false'],
  // 券/折扣列表族 (mrn 页面 + 订单页)
  [/("(?:mrn_voucher_list|order_voucherlist_isEnabled|mrn_hotel_coupon_detail_page)"\s*:\s*)true/g, '$1false'],
  // 酒店营销族 (券/红包/推广订单)
  [/("(?:mrn_hotel_deal_voucher_list|mrn_hotel_order_fill_discount_list|mrn_hotel_order_fill_voucher_list|mrn_hotel_preload_poidetail_not_use_activity|mrn_hotel_promote_order_detail)"\s*:\s*)true/g, '$1false'],
  [/("(?:rn_hotel_deal_coupon_detail_enable|rn_hotel_promote_orderdetail|rn_hotel_homepage_tex_redpacket_enable|rn_submit_order_discount_list_is_enable)"\s*:\s*)true/g, '$1false'],
  // 引导动画族 (数值 → 0 禁用)
  [/("(?:show_anim_guide_cold_start|show_anim_guide_has_visit|show_anim_guide_no_visit|show_anim_guide_return_homepage|show_immersive_anim_guide_max_count|show_market_anim_guide_max_count)"\s*:\s*)[1-9]\d*/g, '$10'],
  // 首页/位置引导 (数值 → 0)
  [/("(?:homepage_travel_guide_cell|location_guide_daily_show_times)"\s*:\s*)[1-9]\d*/g, '$10'],
  // --- v0.9: 广告系统模块深挖 (mt_ad_common_strategy / mt_bb_ad_config / adp_pagasus) ---
  // 灵犀广告 + midas 广告上报 (mt_ad_common_strategy)
  [/("ad_lingxi_config"\s*:\s*)true/g, '$1false'],
  [/("(?:use_midas_4_ad|midas_is_open_wm_params|midas_mrnbridge_invokemsi_strategy)"\s*:\s*)true/g, '$1false'],
  // 团购广告系统 (mt_bb_ad_config): 快手广告SDK适配器 + 广告上报 + 强制依赖请求
  [/("(?:openKSAdapter|babelReportSwitch|forceRequestAdDependentInfo)"\s*:\s*)true/g, '$1false'],
  // 搜索关键词监控 (adp_pagasus_render_monitor, iOS)
  [/("mt_clcad_search_keywords_monitor_switch_ios"\s*:\s*)true/g, '$1false'],
  // 夜间签到营销样式 + 搜索页直播 (false → true = 禁用)
  [/("(?:disableMiddleNightCheckinStyle|disable_live_pike)"\s*:\s*)false/g, '$1true'],
  // --- v0.9.0: 169 模块深度二次扫描 (时长/频控/promo/券列表) ---
  // 开屏启动图显示时长 (5 秒 → 0, 开屏停留归零; 若异常可改回 1)
  [/("startup_picture_duration"\s*:\s*)[1-9]\d*/g, '$10'],
  // promo 列表 native→mrn 切换 (美团 iOS 侧)
  [/("meituan_ios"\s*:\s*)true/g, '$1false'],
  // 二层引导左右展示次数
  [/("show_count_(?:left|right)"\s*:\s*)[1-9]\d*/g, '$10'],
  // 酒店团购券列表页
  [/("hotel_rn_group_voucherlist_ios"\s*:\s*\{\s*"data"\s*:\s*\{\s*"customer"\s*:\s*\{\s*"isEnabled"\s*:\s*)true/g, '$1false'],
  // 首页营销卡片频控 (pfb_module_frequency_control): 点击/曝光次数归零 = 不再展示
  [/("(?:financeRepaymentCard|headUnitSmartCard|memberBirthdayCard|ticketAttractionCard)"[\s\S]{0,200}?"clickCount"\s*:\s*\{\s*"clickCount"\s*:\s*)[1-9]\d*/g, '$10'],
  [/("(?:chronicDiseaseDynamicCard|travelPredictionCard)"[\s\S]{0,300}?"coldStartViewCount"\s*:\s*)[1-9]\d*/g, '$10'],
  [/("remoteThemedCard"[\s\S]{0,300}?"hourViewCount"\s*:\s*)[1-9]\d*/g, '$10'],
  // 拼好饭小程序弹窗请求
  [/("sendPopupRequestConfig"\s*:\s*\{\s*"shouldSend"\s*:\s*)true/g, '$1false'],
  // --- v1.0.0: 字符串内嵌 JSON 盲区 + 增长业务 (全量 2655 叶子键扫描) ---
  // 推荐流信息流广告位 (mt_rec_blue_config.rec_config 是字符串化 JSON, 内含 3 个 ad_feed_poi_deal 广告位)
  [/("rec_config"\s*:\s*)"((?:[^"\\]|\\.)*ad_feed_poi_deal(?:[^"\\]|\\.)*)"/g, '$1"{\\"count\\":0,\\"data\\":[]}"'],
  // 增长业务 (拉新/促活营销) + 预热
  [/("(?:enableGrowthBusiness|enable_preheat)"\s*:\s*)true/g, '$1false'],
  // 旅行 CPC 广告禁用 (false → true = 禁用)
  [/("isCPCAdDisabled"\s*:\s*)false/g, '$1true'],
  // --- v1.1.0: 隐私 / 遥测 / 内部测试 (用户裁决: 涉及隐私的全部关闭) ---
  // 截图上传 (screenshot_info_upload 模块的 enable, 用模块名锚定避免误伤 22 处同名键)
  [/("screenshot_info_upload"\s*:\s*\{\s*"data"\s*:\s*\{\s*"customer"\s*:\s*\{\s*"enable"\s*:\s*)true/g, '$1false'],
  // 截屏后总是推荐 (capture_screen_upload_config)
  [/("alwaysReco"\s*:\s*)true/g, '$1false'],
  // 设备指纹
  [/("needFingerprint"\s*:\s*)true/g, '$1false'],
  // iBeacon / WiFi 采集上限归零
  [/("(?:beacon|wifi)"\s*:\s*)[1-9]\d*/g, '$10'],
  // 火车票隐私参数 RN 化
  [/("train_param_privacy_rn"\s*:\s*)true/g, '$1false'],
  // 遥测: 请求上报 / 异常上报 (phoenix)
  [/("iOS_enable(?:RequestReport|TrycatchExceptionReport)"\s*:\s*)true/g, '$1false'],
  // 遥测: Babel / Logan / Raptor 上报族 (dianping_tos_report_config + MTLive_Log_Config)
  [/("enableReport(?:Babel|Logan|RaptorCommand|RaptorCustom)"\s*:\s*)true/g, '$1false'],
  // 遥测: midas 监控 (广告 SDK 埋点)
  [/("midas_(?:android|ios|harmony)_monitor_config"\s*:\s*\{\s*"is_open_monitor"\s*:\s*)true/g, '$1false'],
  // 内部测试: 酒店首页 mock 数据
  [/("hotel_homepage_inland_mock_data_enable"\s*:\s*)true/g, '$1false'],
  // 内部测试: 播放器调试面板 (enable 关; allowShow 按用户要求打开)
  [/("enablePlayerDebugBoard"\s*:\s*)true/g, '$1false'],
  [/("allowShowDebugBoard"\s*:\s*)false/g, '$1true'],
  // --- v1.2.0: 真机 703KB 全量响应的漏网扫描 (隐私/遥测/灰度/测试) ---
  // 隐私: 位置监控
  [/("location_monitor_switch"\s*:\s*)true/g, '$1false'],
  // 遥测: 采样上报 / 推荐 FS 指标 / 首页漏斗+速度 / Feed Raptor / 指标 v2 / 图片流量日志 / 代码日志采样
  [/("(?:enableSample|recommend_fs_metrics_report|hp_funnel_load_report|hp_speed_new_report|need_report_feed_request_raptor|metrics_speed_report_v2|trafficLogEnable)"\s*:\s*)true/g, '$1false'],
  [/("codeLogSamplingRate"\s*:\s*)[1-9]\d*/g, '$10'],
  // 灰度: 酒店 Pike (AB 实验平台) + 播放器 AB 白名单
  [/("isOpeniOS"\s*:\s*)true/g, '$1false'],
  [/("enableABTestWhitelist"\s*:\s*)true/g, '$1false'],
  // 内部测试: 播放器流量测试 bid / 调试信息升级 / 公交首页原生测试
  [/("enable_flow_rate_test_bid"\s*:\s*)\{([^}]*?:\s*1[^}]*)\}/g, '$1{"JUMP_MTNativeShortVideo":0,"MRNGameVideo":0,"MTNativeShortVideo":0}'],
  [/("(?:enableDebugInfoUpgrade|bus_home_native_test)"\s*:\s*)[1-9]\d*/g, '$10'],
  // --- v1.3.0: 开发者测试遗留清理 (测试环境 URL 指向生产) + AB 实验 + 图标上报 ---
  // AB 实验分组 (图片服务 UGC 新星人) — 关闭后走默认逻辑
  [/("ab_IOS_ugc_nvstarman"\s*:\s*)true/g, '$1false'],
  // 图标字体 Babel 上报 (遥测)
  [/("enableBabelReport"\s*:\s*)true/g, '$1false'],
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
