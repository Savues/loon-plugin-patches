# Zepp-AdBlock

Zepp (华米, com.huami.watch) 去广告 Loon 插件。

## 订阅

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Zepp-AdBlock/Zepp-AdBlock.lpx
```

## 覆盖 (v1.3.0)

| 广告形态 | 接口 | 处置 |
|---------|------|------|
| 开屏广告 (LaunchAd 体系: LaunchAdManager/Network/Cache, bg_img_url/ad_type/showCount) | `cards/startpage_ad` | reject_dict(200) |
| 首页广告/弹窗 (二进制常量区同族: startpage_ad/homepage_ad/homepage_popup 同组) | `cards/(homepage_ad\|homepage_popup)` | reject_dict(200) |
| 公告板/运营卡 (用户裁决: 怀疑即拦) | `cards/(home_bulletin_board\|home_page_promotion)` | reject_dict(200) |
| 设备页推广 (device_page_promotion) | `cards/device_page_promotion` | reject_dict(200) |
| 推广入口卡 (运动周月报, HAR 实证 delivery_type:"promotion"+"真实用户投放") | `cards/sport_page_entrance` | reject_dict(200) |
| 运动页横幅 (HMSportAdvertisementManager, advertId/advert_second) | `discovery/sport_ad` | reject_dict(200) |
| 运动摘要广告 | `discovery/sport_summary_ad` | reject_dict(200) |
| 训练视频广告 | `discovery/training_video_ad` | reject_dict(200) |
| 高德广告/追踪 SDK | adiu.amap.com / logs.amap.com | [Rule] REJECT |

## MITM

api-mifit-cn{,2,3}.zepp.com · api-mifit{,-us}.zepp.com

## 判定方法论 (沉淀)

- **卡片命名规律**: `discovery/watch/cards/<name>` 统一模式下, `*_ad / *_popup / *_promotion / *_entrance` 为运营位族; `home_food_camera_shown / hyrox_trainningPlans_courses / discover_tab` 等为功能卡 (放行)
- **投放卡内容判定**: 看 body 的 `delivery_type` 字段 (`promotion` = 推广位, 如 sport_page_entrance 实投放 "运动周月报" 538B)
- **新卡片接口**: 先查二进制常量区 (strings 89493-89497 一带: startpage_ad/homepage_ad/homepage_popup/sport_summary_ad 同组) 判断族属

## 版本历史

| 版本 | 内容 | 实证 |
|------|------|------|
| v1.0.0 | 开屏 + 运动横幅 + 训练视频广告 + 高德 SDK | HAR(44条) 三接口活跃请求, 逆向 10.10.0 |
| v1.1.0 | + homepage_ad/homepage_popup/sport_summary_ad | HAR(92条) v1.0.0 全部 size=2 生效; 二进制常量区同族实证 |
| v1.2.0 | + 公告板/运营卡 (怀疑即拦) | 模拟器命中验证 |
| v1.3.0 | + sport_page_entrance(运动周月报推广卡)/device_page_promotion | HAR(103条) 发现实投放; HAR(77条) 验证 size 3→2 全生效 |

## 依据

- 逆向 Zepp 10.10.0 (decrypted ipa, 247MB 主二进制): HMAccountServices/LaunchShow 全套类 (LaunchAdManager/Network/CacheManager/ExposureManager/AnimationView+Ad) + 广告模型字段 (target/bg_img_url/bg_video_url/ad_type/delivery_type/showCount/showTime)
- 四份 HAR 共 316 条请求实证: 广告接口发现 → 拦截 → 逐版验证闭环
- 规则域名族 `api-mifit(-cn\d?)?\.zepp\.com` 覆盖 cn/cn2/cn3/us 变体 (二进制 strings 提取)
- 空响应安全: App 日志 "datas is not array / is empty" 按无广告处理

## 边界 (已知不可拦)

- 开屏素材预下载缓存: 首次冷启动可能有一次残留 (LaunchAdCacheManager 预下载机制, 二次冷启动消失)
- 广告素材走任意 CDN (resourceURLString), 配置接口已断 → 无新素材, 不需逐素材拦
- img-cdn.zepp.com/badges/* 为成就徽章功能素材, 不可拦
