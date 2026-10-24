# Zepp-AdBlock

Zepp (华米, com.huami.watch) 去广告 Loon 插件。

## 订阅

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Zepp-AdBlock/Zepp-AdBlock.lpx
```

## 覆盖 (v1.0.0)

| 广告形态 | 接口 | 处置 |
|---------|------|------|
| 开屏广告 (LaunchAd 体系: LaunchAdManager/Network/Cache, bg_img_url/ad_type/showCount) | `GET /discovery/watch/cards/startpage_ad` | reject_dict(200) — App 日志 "datas is empty" 按无广告处理, 容忍空响应 |
| 运动页横幅 (HMSportAdvertisementManager, advertId/advert_second) | `GET /discovery/watch/discovery/sport_ad` | reject_dict(200) |
| 训练视频广告 | `GET /discovery/watch/discovery/training_video_ad` | reject_dict(200) |
| 高德广告/追踪 SDK | adiu.amap.com / logs.amap.com | [Rule] REJECT |

## MITM

api-mifit-cn{,2,3}.zepp.com / api-mifit{,-us}.zepp.com

## 依据

- 逆向 Zepp 10.10.0 (decrypted ipa): HMAccountServices/LaunchShow 全套类 + 广告模型字段提取
- HAR 实证 (44 条): 三个广告接口均活跃请求 (当前无投放返回 `[]`, 有投放时为广告数组)
- 规则域名族覆盖 cn/cn2/cn3/us 变体 (二进制 strings 提取)

## 边界 (已知不可拦)

- 开屏素材预下载缓存: 首次冷启动可能有一次残留 (LaunchAdCacheManager 预下载机制, 二次冷启动消失)
- 广告素材走任意 CDN (resourceURLString), 配置接口已断 → 无新素材, 不需逐素材拦
