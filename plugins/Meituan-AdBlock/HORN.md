# 美团 horn 远程配置清洗清单

> 配套代码：`src/horn_clean.js` · 生效版本：v1.3.1（2026-10-29）
> 命中接口：`h.meituan.com` / `portal-portm.meituan.com` 的 `horn_ios` 全量（`?id=`）与增量（`/mergeRequest`）

## 一、horn 是什么

horn 是美团版「橙配」——全 App 的远程配置主干道，启动时下发 **169 个模块 / 约 1.1MB** 的配置，控制开屏、弹窗、悬浮窗、券弹层、小说广告、酒店营销等所有功能开关。

**关键约束**：horn 是功能配置载体（支付/定位/IM/登录都靠它），**绝不能整体 reject**（会让 App 瘫痪），只能做**键级反转**。

```
请求  https://h.meituan.com/horn_ios?id=<deviceId>&version=v1
       https://h.meituan.com/horn_ios/mergeRequest?...
响应  ~700KB（h 域） / ~1.1MB（portal-portm 域）JSON
处理  24 条等长正则，把广告/营销键的值反转，其余 95% 配置原样保留
```

**两种接口形态都要覆盖**（2026-10-29 真机 HAR 实证）：

| 接口 | 场景 | 响应 |
|------|------|------|
| `horn_ios?id=...&version=v1` | 全量拉取 | 200 / 304（有缓存时）|
| `horn_ios/mergeRequest?...` | 增量或冷启动全量 | 200，697KB / 1.1MB |

> 304 = App 用本地缓存，脚本无法修改（无 body）。要让新规则生效需删本地缓存（见「五、强制重新下发」）。

---

## 二、清洗清单（134 个键 · 72 条规则）

### ① 开屏族（3 键）

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `com.meituan.retail.maicai_splash_hidden` | `false` → `true` | 买菜开屏隐藏 | retail |
| `com.meituan.retail.splash_vap` | `true` → `false` | 开屏 VAP 动画 | retail |
| `com.meituan.retail.splash_video_disabled` | `false` → `true` | 开屏视频禁用 | retail |

### ② 弹窗族（7 键）

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `com.meituan.retail.should_show_group_supermarket_guide_popup` | `"true"` → `"false"` | 闪购超市引导弹窗 | retail |
| `pt_business_mine_popup_enable` | `true` → `false` | 我的页弹窗 | — |
| `general_popup_enable` | `true` → `false` | 通用弹窗总开关 | — |
| `popup_service_switch` | `true` → `false` | 弹窗服务开关 | `met_popup_service_switch` |
| `sharkpush_MTPushPopupMessage` | `true` → `false` | 推送弹窗消息 | — |
| `rn_hotel_homepage_popup` | `true` → `false` | 酒店首页弹窗 | hotel |
| `popupLimitStatus` | `true` → `false` | 弹窗频控状态 | `hotel_mt_domestic_mrn_switch` |

### ③ 悬浮窗 / 浮层（9 键）

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `floatWindowAB` | `true` → `false` | 悬浮窗 A/B 实验 | — |
| `floatWindowMGC` | `true` → `false` | 悬浮窗（MGC）| — |
| `channel_float_refresh_open` | `true` → `false` | 频道浮层刷新 | — |
| `showTopFloatLayer_single` | `true` → `false` | 顶部浮层（单例）| — |
| `msi_showFloatLayer_onMainThread` | `true` → `false` | 主线程浮层 | — |
| `coupons_float_layer_get_sharedStorage` | `true` → `false` | 券浮层共享存储 | — |
| `sharkpush_meishi_float_picasso` | `true` → `false` | 美食浮窗（Picasso）| — |
| `gc_poidetail_float_video` | `true` → `false` | POI 详情浮动视频 | `MTVodPlayer_SDK_Config` |
| `resolve_touch_matrix_and_hi_float_conflict` | `true` → `false` | 触摸矩阵与高浮层冲突处理 | `hotel_mt_domestic_mrn_switch` |

### ④ 券 / 优惠弹层（10 键）

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `head_coupon_ios` | `true` → `false` | 券头（iOS）| — |
| `head_coupon_layer_ios` | `true` → `false` | 券弹层（iOS）| — |
| `coupon_dialog_is_open_by_url` | `true` → `false` | URL 唤起券弹窗 | — |
| `receiveCoupon` | `true` → `false` | 领券入口 | — |
| `iOS_enableHostSendCoupon` | `true` → `false` | 宿主发放优惠券 | phoenix |
| `findCouponUpgradeEnable` | `true` → `false` | 找券升级 | — |
| `enable_coupon_detail_pre_request` | `true` → `false` | 券详情预请求 | — |
| `mrn_voucher_list` | `true` → `false` | 券列表页 | `mt_food_ios_config` |
| `order_voucherlist_isEnabled` | `true` → `false` | 订单页券列表 | `hotel_mrn` |
| `mrn_hotel_coupon_detail_page` | `true` → `false` | 酒店券详情页 | `hotel_mt_domestic_mrn_switch` |

### ⑤ 横幅（7 键）

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `benefit_banner_animation` | `true` → `false` | 权益横幅动画 | `traffic_skeleton_config` |
| `cashback_banner_enable` | `true` → `false` | 返现横幅 | — |
| `traffic_platform_banner_switch` | `true` → `false` | 流量平台横幅 | `tak_traffic_homepage` |
| `open_banner_optimized` | `true` → `false` | 横幅优化实验 | — |
| `updateNewMliveBanner` | `true` → `false` | 直播新横幅 | — |
| `is_fix_banner_promotion` | `true` → `false` | 固定推广横幅 | — |
| `enable_city_commerce_activity` | `true` → `false` | 城市商业活动 | — |

### ⑥ 小说阅读器广告（8 键，数值 `1` → `0`）

模块：`readerMSCToMRN`

| 键 | 含义 |
|----|------|
| `adPageBanner` | 章节页横幅 |
| `adParaEnd` | 段末广告 |
| `adInsertPage` | 插页广告 |
| `adChapterUnLock` | 章节解锁广告 |
| `adChapterEnd` | 章节末广告 |
| `adParaGoldCoin` | 段末金币 |
| `openScreen` | 开屏（阅读器内）|
| `fullScreen` | 全屏广告 |

### ⑦ 引导 / 运营（14 键）

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `recommend_guide_layer_switch` | `true` → `false` | 推荐引导层 | `mt_recommend_iOS_config` |
| `iOS_enableShowDirectSaleGuide` | `true` → `false` | 直营引导 | phoenix |
| `iOS_enableGuideComment` | `true` → `false` | 引导评论 | phoenix |
| `guide_detail` | `true` → `false` | 引导详情 | `hotel_mt_overseas_mrn_switch` |
| `guide_page_preload_result_page` | `true` → `false` | 引导页预载结果页 | — |
| `enable_live_activity_pike` | `true` → `false` | 直播活动 | — |
| `enableMannulReceiveOperational` | `true` → `false` | 手动领取运营奖励 | — |
| `check_transparent_activity` | `true` → `false` | 透明活动检查 | `homepage_switches_v1` |
| `show_anim_guide_cold_start` | `7` → `0` | 冷启动引导动画 | `pfb_second_floor_guide_config` |
| `show_anim_guide_has_visit` | `14` → `0` | 引导动画（老访客）| 同上 |
| `show_anim_guide_no_visit` | `7` → `0` | 引导动画（新访客）| 同上 |
| `show_anim_guide_return_homepage` | `3` → `0` | 回首页引导动画 | 同上 |
| `show_immersive_anim_guide_max_count` | `1` → `0` | 沉浸式引导最大次数 | 同上 |
| `show_market_anim_guide_max_count` | `3` → `0` | 市集引导最大次数 | 同上 |

### ⑧ 首页 / 位置引导（2 键，数值 → 0）

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `homepage_travel_guide_cell` | `3` → `0` | 首页旅行引导位 | `MTVodPlayer_SDK_Config` |
| `location_guide_daily_show_times` | `2` → `0` | 位置引导每日次数 | `pfb_homepage_address_config` |

### ⑨ 推送（5 键）

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `miaowaPush` | `true` → `false` | 秒哇推送 | `ptim_common_config` |
| `metpush_categories_enable` | `true` → `false` | 推送分类 | `metpushservice_pushconfiguration` |
| `iOS_enablePushFilterMultiple` | `true` → `false` | 多推送过滤 | phoenix |
| `order_new_push_list` | `true` → `false` | 订单新推送列表 | `pfb_message_center_config` |
| `sharkpush_MTPushPopupMessage` | `true` → `false` | 推送弹窗消息（同 ②）| — |

### ⑩ 任务列表（2 键）

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `gb_tasklist_mrn_on` | `true` → `false` | 任务列表（团购）| `ttk_grabticket_rn` |
| `isGrabTaskListPikeOn` | `true` → `false` | 抢任务列表 | `ttk_pioneer_direct` |

### ⑪ 酒店营销（9 键）

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `mrn_hotel_deal_voucher_list` | `true` → `false` | 酒店特惠券列表 | `hotel_mt_domestic_mrn_switch` |
| `mrn_hotel_order_fill_discount_list` | `true` → `false` | 订单填写折扣列表 | 同上 |
| `mrn_hotel_order_fill_voucher_list` | `true` → `false` | 订单填写券列表 | 同上 |
| `mrn_hotel_preload_poidetail_not_use_activity` | `true` → `false` | POI 详情预载（活动）| 同上 |
| `mrn_hotel_promote_order_detail` | `true` → `false` | 推广订单详情 | 同上 |
| `rn_hotel_deal_coupon_detail_enable` | `true` → `false` | 酒店特惠券详情 | `hotel_mrn` |
| `rn_hotel_promote_orderdetail` | `true` → `false` | 推广订单详情（RN）| `hotel_mrn` |
| `rn_hotel_homepage_tex_redpacket_enable` | `true` → `false` | 酒店首页红包 | `hotel_mt_domestic_mrn_switch` |
| `rn_submit_order_discount_list_is_enable` | `true` → `false` | 提交订单折扣列表 | `hotel_mrn` |

### ⑫ 广告系统（8 键，最关键）

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `ad_lingxi_config` | `true` → `false` | **灵犀广告配置**（美团广告投放系统）| `mt_ad_common_strategy` |
| `use_midas_4_ad` | `true` → `false` | midas 广告上报 | `mt_food_ios_config` |
| `midas_is_open_wm_params` | `true` → `false` | midas 外卖参数 | `mt_ad_common_strategy` |
| `midas_mrnbridge_invokemsi_strategy` | `true` → `false` | midas MRN Bridge 策略 | 同上 |
| `openKSAdapter` | `true` → `false` | **快手广告 SDK 适配器** | `mt_bb_ad_config` |
| `babelReportSwitch` | `true` → `false` | 广告上报开关 | `mt_bb_ad_config` |
| `forceRequestAdDependentInfo` | `true` → `false` | 强制请求广告依赖信息 | `mt_bb_ad_config` |
| `interstitialUseBridge` | `true` → `false` | **插屏广告** | `mt_bb_ad_config` |

### ⑬ 其他（3 键）

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `mt_clcad_search_keywords_monitor_switch_ios` | `true` → `false` | 搜索关键词监控（埋点）| `adp_pagasus_render_monitor` |
| `disableMiddleNightCheckinStyle` | `false` → `true` | 夜间签到营销样式 | phoenix |
| `disable_live_pike` | `false` → `true` | 搜索页直播入口 | `mt_search_new_config` |

### ⑭ 时长 / 频控 / 卡片（13 键 · v0.9.0 深度二次扫描新增）

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| **`startup_picture_duration`** | `5` → `0` | **开屏启动图显示时长（5 秒 → 0）** | `homepage_switches_v1` |
| `meituan_ios` | `true` → `false` | promo 列表 native→mrn 切换 | `gc_promo_list_native_to_mrn` |
| `show_count_left` | `1` → `0` | 二层引导左卡展示次数 | `pfb_second_floor_guide_config` |
| `show_count_right` | `3` → `0` | 二层引导右卡展示次数 | 同上 |
| `hotel_rn_group_voucherlist_ios.isEnabled` | `true` → `false` | 酒店团购券列表页 | `hotel_rn_group_voucherlist_ios` |
| `financeRepaymentCard.clickCount` | `1` → `0` | **金融还款卡**（借贷推广）| `pfb_module_frequency_control` |
| `headUnitSmartCard.clickCount` | `2` → `0` | 头部智能卡 | 同上 |
| `memberBirthdayCard.clickCount` | `3` → `0` | 会员生日卡（营销）| 同上 |
| `ticketAttractionCard.clickCount` | `3` → `0` | 门票景点卡 | 同上 |
| `chronicDiseaseDynamicCard.coldStartViewCount` | `3` → `0` | 慢病动态卡 | 同上 |
| `travelPredictionCard.coldStartViewCount` | `7` → `0` | 旅行预测卡 | 同上 |
| `remoteThemedCard.hourViewCount` | `3` → `0` | 远程主题卡（小时曝光）| 同上 |
| `sendPopupRequestConfig.shouldSend` | `true` → `false` | 拼好饭小程序弹窗请求 | `pinhaofan_mp_common` |

> 首页卡片频控的原理：`pfb_module_frequency_control` 里每个卡片有独立的曝光/点击次数上限，把上限改为 0 = 该卡片不再展示。**只影响营销卡片，不影响正常功能模块。**

### ⑮ 字符串内嵌 JSON / 增长业务 / CPC 广告（3 键 · v1.0.0 全量 2655 叶子键穷举）

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| **`rec_config`** | 字符串 JSON → `{"count":0,"data":[]}` | **推荐流信息流广告位**（内含 3 个 `ad_feed_poi_deal` 广告位：slotId 50004 / 50005 / 50023）| `mt_rec_blue_config` |
| `enableGrowthBusiness` | `true` → `false` | 增长业务（拉新/促活营销）| `growthbusiness_ios` |
| `enable_preheat` | `true` → `false` | 增长预热 | 同上 |
| `isCPCAdDisabled` | `false` → `true` | **旅行 CPC 广告禁用**（false = 广告启用）| `mt_travel_mrn` |

> **字符串内嵌 JSON 是一个隐蔽盲区**：`rec_config` 的值是一段字符串化的 JSON，常规的键扫描（只看 JSON 结构）扫不到里面的 `ad_feed_poi_deal`。本规则用 `("rec_config"\s*:\s*)"((?:[^"\\]|\\.)*ad_feed_poi_deal(?:[^"\\]|\\.)*)"` 精确匹配含广告位的整段字符串再整体替换 —— 只在含 `ad_feed_poi_deal` 时触发，保证幂等。

### ⑯ 隐私 / 遥测 / 内部测试（16 键 · v1.1.0，用户裁决「涉及隐私的全部关闭」）

**隐私采集（6 键）**

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `screenshot_info_upload.enable` | `true` → `false` | **截图信息上传** | `screenshot_info_upload` |
| `capture_screen_upload_config.alwaysReco` | `true` → `false` | 截屏后总是推荐（酒店/机票/火车/门票等 7 业务）| `hotel_travel_domestic_config` |
| `needFingerprint` | `true` → `false` | **设备指纹** | `meituan_gc_poi_optimization_switch` |
| `max_count.beacon` | `5` → `0` | iBeacon 采集上限 | `mt_food_home_location` |
| `max_count.wifi` | `30` → `0` | WiFi 采集上限 | 同上 |
| `train_param_privacy_rn` | `true` → `false` | 火车票隐私参数 RN 化 | `ttk_train_config` |

**遥测上报（7 键）**

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `iOS_enableRequestReport` | `true` → `false` | 全量请求上报 | `phoenix` |
| `iOS_enableTrycatchExceptionReport` | `true` → `false` | 异常捕获上报 | `phoenix` |
| `enableReportBabel` | `true` → `false` | Babel 上报 | `dianping_tos_report_config` |
| `enableReportLogan` | `true` → `false`（5 处）| Logan 日志上报（含 MTLive KS/TX 播放日志）| `dianping_tos_report_config` + `MTLive_Log_Config` |
| `enableReportRaptorCommand` | `true` → `false` | Raptor 指令上报 | `dianping_tos_report_config` |
| `enableReportRaptorCustom` | `true` → `false` | Raptor 自定义上报 | 同上 |
| `midas_*_monitor_config.is_open_monitor` | `true` → `false`（5 处）| midas 广告 SDK 监控埋点 | `mt_ad_common_strategy` + `mt_midas_monitor_config` |

**内部测试（3 键）**

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `hotel_homepage_inland_mock_data_enable` | `true` → `false` | **酒店首页 mock 假数据渲染** | `hotel_mt_domestic_mrn_switch` |
| `enablePlayerDebugBoard` | `true` → `false` | 播放器调试面板默认展示 | `MTVodPlayer_SDK_Config` |
| **`allowShowDebugBoard`** | `false` → **`true`** | **允许显示调试面板（用户要求打开）** | `MTVodPlayer_SDK_Config` |

> **注意 `allowShowDebugBoard` 是本次唯一"打开"的键** —— 它是"是否允许展示调试面板"的权限开关，打开后可在播放器界面调出调试信息（逆向/排查用）。配套的 `enablePlayerDebugBoard`（默认是否展示）已关闭，避免默认就弹出。

> **截图上传的锚定**：`enable` 这个键名在 169 个模块里出现 **22 次**，必须用模块名 `screenshot_info_upload` 做锚点匹配，否则会误伤其他 21 处 `enable`。

### ⑰ 真机全量漏网扫描（14 键 · v1.2.0，基于设备 703KB 实际响应）

**隐私（1 键）**

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `location_monitor_switch` | `true` → `false` | **位置监控上报** | `pfb_location_optimization` |

**遥测（8 键）**

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `enableSample` | `true` → `false` | 埋点采样上报总开关（原采样率 0.5）| `tak_sampling_report` |
| `recommend_fs_metrics_report` | `true` → `false` | 推荐流 FS 指标上报 | `mt_recommend_iOS_config` |
| `hp_funnel_load_report` | `true` → `false` | 首页漏斗上报 | `homepage_switches_v1` |
| `hp_speed_new_report` | `true` → `false` | 首页速度上报 | 同上 |
| `need_report_feed_request_raptor` | `true` → `false` | Feed 请求 Raptor 上报 | 同上 |
| `metrics_speed_report_v2` | `true` → `false` | 指标速度上报 v2 | 同上 |
| `trafficLogEnable` | `true` → `false` | 图片流量日志 | `dp_image_service` |
| `codeLogSamplingRate` | `10` → `0` | 图片服务代码日志采样率 | 同上 |

**灰度 / AB 实验（2 键）**

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `isOpeniOS` | `true` → `false` | **酒店业务 Pike 开关**（Pike = 美团直播/房间长连接 SDK，非 AB 平台，见下方说明）| `hotel_pike_switch` |
| `enableABTestWhitelist` | `true` → `false` | 播放器 AB 测试白名单 | `MTVodPlayer_SDK_Config` |

**开发者测试（3 键）**

| 键 | 原值 → 新值 | 含义 | 模块 |
|----|------------|------|------|
| `enable_flow_rate_test_bid` | 3 个子项 `1` → `0` | **播放器流量测试 bid**（JUMP_MTNativeShortVideo / MRNGameVideo / MTNativeShortVideo）| `MTVodPlayer_SDK_Config` |
| `enableDebugInfoUpgrade` | `1` → `0` | 播放器调试信息升级 | 同上 |
| `bus_home_native_test` | `1` → `0` | 公交首页原生测试 | `traffic_bus_config` |

> 本组基于**设备实际下发的 703KB 全量响应**扫描得出（此前基于 751KB 样本，模块集合略有差异）。

**关于 Pike 的实证（原判断已修正）**

初版文档把 Pike 写成「美团 AB 实验平台」，这是**没有证据的猜测，已推翻**。二进制实证（`meituan_strings.txt`）显示 Pike 是**直播 / 房间长连接 SDK**：

```
PikeLiveModuleServiceImpl                        ← PikeLive 模块服务
-[CSCChatWindowContext pikePushReceiveMessage:]  ← 聊天窗口接收 Pike 消息
-[CSCChatWindowViewModel pikeConnectionStatusChanged:forBizID:]
%p joinPikeConnect is not working after calling leaveLiveRoom
%p pike link fail - alias %@ , chatRoomId %lld   ← 聊天室 ID
%p start pike:%p when becoming active - disablePike:%@
%p pause leavePike:%d isSharing:%d
!!! pike live config analyze exception !!!
```

所以：

| 键 | 真实含义 |
|----|---------|
| `hotel_pike_switch.isOpeniOS` | **酒店业务的直播连接开关**（关掉 = 酒店页不建立直播房间连接）|
| `mt_search_new_config.disable_live_pike` | 禁用搜索页的直播（**已覆盖，判断正确**）|
| `enable_live_activity_pike` | 直播活动（**已覆盖，判断正确**）|
| `dead_code_detector.ABPike` | 值为 `false`，未动 |

> 结论：`isOpeniOS` 属于**功能开关**（酒店直播），不是广告/隐私/灰度开关。若不用酒店直播可保留关闭；若可能用到应移除该规则。

**扫描时甄别掉的项目**

| 项 | 为什么不动 |
|----|-----------|
| `phoenix.iOS_enableRemovePrivacyQueryParams` / `iOS_enableRemoveRouterLocationParams` | `true` 是**保护性**的（移除隐私/位置参数），保持开启 |
| `soter_switch.isSoterOpenAndroid` | 仅 Android 生效，iOS 侧 `isSoterOpen` 已是 false |
| `Picasso.JSI_whitelist.*` | JS 引擎白名单，功能必需 |
| `MTVodPlayer_SDK_Config.ab_group_mtlive_provider_config.*` | AB 分组编号（数值），非开关 |
| `pfb_second_floor_guide_config.beta_sign_*` | 「体验版」文案/URL，是显示内容不是开关，改动可能破坏 UI |
| `homepage_switches_v1.enable_tab_ffp` / `tab_refresh_delay` | 首帧绘制/刷新性能优化，非营销 |
| `pfb_met_addresscenter_ability_building.*`（43 键）| 全是 address（地址），被 `ad` 误匹配 |

### ⑱ AB 实验分组 + 图标上报（2 项 · v1.3.1）

| 键 | 原值 → 新值 | 说明 | 模块 |
|----|------------|------|------|
| `ab_IOS_ugc_nvstarman` | `true` → `false` | 图片服务 AB 实验分组（UGC 新星人）。关闭后走默认逻辑 | `dp_image_service` |
| `enableBabelReport` | `true` → `false` | 图标字体 Babel 上报（遥测）| `cipiconfont_config` |

**关于测试环境 URL（已按用户要求不做）**

扫描发现配置里有 3 处测试环境地址，**已确认存在但决定不处理**（避免改动 deeplink / SSR 配置结构）：

| 位置 | 值 | 说明 |
|------|-----|------|
| `deeplink.data[7].url` | `https://i8.test.meituan.com/awp/hfe/block/4323/index.html` | 支付绑定卡测试版（`[6]` 是生产版）|
| `deeplink.data[8].url` | `https://test.i.meituan.com/c/#{id}` | 标题原文「魔方跳转 test」（`[9]` 是生产版）|
| `key_dz_web_ssr_urls.urlList` | 含 2 处 `test-g.meituan.com` | SSR 页面 URL 列表 |

> 这是美团正式下发配置里的开发遗留，仅作记录，插件不改动。

**其他观察**

| 项 | 情况 |
|----|------|
| `ciptestflightkit_config_ios` | 模块 `customer = null`（无配置下发）|
| `CIPABTestHornConfig`（二进制类名）| AB 实验配置类存在，但本份 horn 响应无对应模块 → AB 实验配置走别的通道 |
| 开发者测试类 8 键 | 已全部覆盖（enablePlayerDebugBoard / enableDebugInfoUpgrade / enable_flow_rate_test_bid / bus_home_native_test / hotel_homepage_inland_mock_data_enable / allowShowDebugBoard / enableGetDebugInfoOpt / ios18beta2_decode_fix）|

---

## 三、保守未动的键（有歧义，说明理由）

| 键 | 当前值 | 为什么不动 |
|----|-------|-----------|
| `popupLimitCount` | `3` | 是「弹窗数量限制」，改 0 可能被解释为「无限制」反而更糟 |
| `floatLayerTime` | `3` | 浮层时间配置，改 0 语义不明 |
| `bus_home_use_sharkpush_or_loop` | `2` | 模式选择（非开关）|
| `is_open_monitor` | `true` | 监控埋点，关闭可能影响 App 稳定性判断 |
| `pike` 系列（抢票/订单/火车票）| 多为 `true` | 是功能开关不是广告，动了会坏功能 |
| `enableDspBlackList` | `true` | 开着是好事（DSP 黑名单生效），不能关 |
| `MSCSpeedLaunch` / `iOS_enableNewLaunch` / `enablePreCreatePageForLaunch` | `true` | 启动性能优化，非广告 |
| `anim_guide_showed_since_last_time_*` | `7`/`14` | 是**时间戳**不是次数 —— 改 0 会变成"1970 年展示过"，反而每次必现 |
| `disableModalCache`（航班营销）| `false` | 语义是"禁用模态缓存"（性能），不是禁用营销 |
| `pfb_homepage_t3_config.enabled` | `true` | 首页 t3 配置总开关，可能是核心渲染链路 |
| `share_defined` | `true` | 分享功能，非广告 |
| `mt_iOS_universal_realtime_lingxi_config.lingxi_config` | 含 bids 列表 | 灵犀曝光归因配置（埋点映射），非展示开关；关了会影响正常埋点 |
| `dsp_startup_strategy.*` | 多为 `false` | DSP 在这里是 **DeepLink Service Provider**（深度链接），不是广告 DSP |
| `push_notification_banner_disturb` | 含页面白名单 | 推送横幅**打扰保护**（哪些页面不弹），关了反而更糟 |
| `mt_bb_ad_config.enableBBAdUseOld` | `false` | 用新版团购广告；改 true 反而回退旧广告 |
| `enableDspBlackList` | `true` | DSP 黑名单生效中，关了会放行更多广告 |

---

## 四、验证方法

### 模拟器端到端（真实 horn 响应）

```bash
cd tools/loon-sim
node cli.js run ../../plugins/Meituan-AdBlock/Meituan_remove_ads.lpx \
  --url "https://h.meituan.com/horn_ios/mergeRequest" \
  --phase response --response-file /tmp/horn_merge.json
# 期望: 已修改 · 49 键变化 · JSON 合法 · 幂等（再跑一次 = 未修改）
```

### 真机验证（清数据冷启动后抓包）

1. 清美团数据 → 冷启动（App 拉全量）
2. 抓 HAR，检查 `horn_ios/mergeRequest` 响应
3. 搜关键键（如 `ad_lingxi_config`）应为 `false`

**2026-10-29 真机实证**：697KB（h 域）+ 1.1MB（portal-portm 域）双全量响应，10/10 关键键全部反转，沙盒 616 个落地配置验证一致。

---

## 五、强制重新下发（缓存问题）

horn 全量请求带 `if-none-match`，本地有配置时服务器返回 304（无 body，脚本无法介入）。etag 不落盘（实测全沙盒搜不到），推测由本地配置内容运行时计算。

**要让新规则重新下发，删除以下任一组合：**

### 方案 A：彻底（推荐）

```
Documents/com.cipstorage.archiver/public/sakhorn/sak_horn_file_type_1/*.json   # 616 个模块配置
Documents/com.cipstorage.archiver/public/cache/horn/*.bin                      # horn 元数据
```

代价：首次冷启动配置下发稍慢，功能无影响。

### 方案 B：只删广告模块（最小）

```
1b615ce38e86376516a2c01c60ba3624.json   # mt_bb_ad_config（团购广告）
346863f875f61a47c4e6276bc069cf89.json   # mt_ad_common_strategy（灵犀/midas）
14873876a61191f2d8dfec698179cc76.json   # 插屏配置
b01abd3e5d4a04fa9c4249aee766ebbe.json   # adp_pagasus 渲染监控
```

代价：几乎为零（App 只重新拉这几个模块）。

---

## 六、如何新增 / 回滚

### 新增一个键

1. 从 horn 响应里确认键名与当前值（`rg -o '"键名"\s*:\s*[^,}]+'`）
2. 在 `src/horn_clean.js` 的 `REVERSES` 数组加一行：
   ```js
   [/("你的键名"\s*:\s*)true/g, '$1false'],
   ```
3. 数值型注意用 `[1-9]\d*`（避免重复匹配已改为 0 的值，保证幂等）
4. 跑模拟器端到端验证（见「四」）
5. 更新本文件与 README 版本历史

### 回滚（误伤某功能）

删除对应那一行规则即可，键反转完全可逆 —— 下次拉配置即恢复原值。

---

## 七、已知边界

- **304 缓存**：有本地配置时服务器返回 304，脚本无 body 可改。需清缓存（见「五」）才能让新规则生效
- **长连接配置**：部分模块配置走 TCP 长连接下发，HTTP 层不可达
- **horn 之外的广告**：搜索框热搜/信息流数据（长连接）、原生写死的入口（如市集 tab）不在本清单范围
