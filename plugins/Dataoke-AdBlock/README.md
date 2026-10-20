# Dataoke-AdBlock

大淘客联盟 / 易店长 去广告插件

## 功能

| 功能 | 开关 | 默认 | 说明 |
|------|------|------|------|
| **开屏广告** | `removeSplashAd` | 开启 | 拦截 `all-config` 接口返回的 `advanced_strategy` 启动页广告 |
| **首页运营位** | `removeIndexBanner` | 开启 | 清空 `get-index-topic-config` 的 `data` 数组中运营位 Banner，保留正常分类导航 |
| **信息流广告** | `removeAdList` | 开启 | 拦截 `dtk-ad-list` / `dtk-ad-banner-list` / `dtk-search-ad-list` 三大广告列表接口 |
| **新用户红包** | `removeNewUserGuide` | 开启 | 屏蔽新用户红包引导弹窗 |
| **埋点上报** | `blockTracking` | 关闭 | 拦截 `logcoll-v2.ffquan.cn` 行为埋点（默认关，避免影响数据统计） |
| **推送标签** | `blockPushTags` | 关闭 | 拦截阿里云推送 `bind-tag` / `list-tag`（默认关） |

## 适用版本

- App: 大淘客联盟 / 易店长 (`com.dataoke.union`)
- 版本: 4.0.42 (build 40042)
- 架构: React Native + Hermes (HBC v96)

## 导入方式

### Loon
```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Dataoke-AdBlock/Dataoke-AdBlock.lpx
```

在 Loon 中：配置 → 插件 → 添加 → 粘贴上述链接 → 启用插件 → 配置开关 → 保存。

### Surge / Quantumult X
脚本逻辑通用，仅需按对应语法转写清单（MITM 域名、Script 匹配规则、开关定义）。

## MITM 域名

请在 Loon 证书信任设置中添加以下域名：
```
dtkapi.ffquan.cn
sr.ffquan.cn
logcoll-v2.ffquan.cn
mpush-api.aliyun.com
yy.ffquan.cn
```

并在 Loon → 配置 → MITM → 主机名 中添加上述域名，并信任 Loon CA 证书。

## 工作原理

### 1. 开屏广告 (`all-config`)
App 冷启动请求 `GET /dtk_go_app_api/v1/all-config`，响应包含：
```json
{
  "code": 1,
  "data": {
    "advanced_strategy": {
      "switch": 1,
      "pic": "https://yy.ffquan.cn/dtk_yunying/...",
      "text": "新手淘客金牌辅助\r\n扫码立即添加"
    }
  }
}
```
插件将 `switch` 改为 `0`，清空 `pic` 和 `text`，客户端不再展示启动页广告。

### 2. 首页运营位 (`get-index-topic-config`)
首页下拉刷新请求 `GET /dtk_go_app_api/v1/get-index-topic-config`，响应结构：
```json
{
  "code": 1,
  "data": [
    {"banner": "...", "jump": "...", "topic_type": 2, "is_hot": 1, ...},
    {"banner": "", "jump": "", "topic_type": 0, ...}
  ]
}
```
插件过滤掉 `banner` 非空、`jump` 非空、`topic_type === 2` (运营活动)、`is_hot === 1` 的条目，仅保留纯分类导航入口。

### 3. 显式广告列表
三个接口返回广告数据：
- `/dtk-ad-banner-list` - 横幅广告
- `/dtk-ad-list` - 信息流广告
- `/dtk-search-ad-list` - 搜索结果广告

插件将 `data.list` 和 `data.banner` 置为空数组。

### 4. 新用户红包
`/new-user-excitation-guide/red-packet-info` 返回红包信息，插件返回 `data: null`。

## 注意事项

1. **商品图片域名 `img.alicdn.com` 不拦截** —— 为业务必需，仅在数据层删除广告条目
2. **埋点/推送开关默认关闭** —— 防止影响官方数据统计与推送送达
3. **如遇接口变更** —— 请抓包提供 HAR，我会及时更新规则

## 验证方法

1. 启用插件，开启所有核心开关
2. 杀进程重启 App → 无开屏广告图、无"新手淘客金牌辅助"引导
3. 首页下拉刷新 → 顶部/中部/底部无运营位 Banner，分类导航正常
4. 搜索商品 → 搜索结果无广告条目
5. 信息流列表 → 无广告卡片
6. 正常功能验证：商品详情、链接转换、订单查询、高佣授权均正常

## 更新日志

### v1.0.1 (2026-10-20)
- 修正 Loon Script 语法：使用 regex pattern、requires-body=1、argument=[{var}]、enable={switch}
- 参数改为 boolean (true/false) 而非中文标签

### v1.0.0 (2026-10-20)
- 初版发布
- 覆盖开屏、首页运营位、信息流、搜索广告、新用户红包五大广告场景
- 提供 6 个独立开关，默认开启核心广告拦截，埋点/推送默认关闭

---

# Dataoke-AdBlock (English)

Ad-block plugin for **Dataoke Union / 易店长** (com.dataoke.union)

## Features

| Feature | Switch | Default | Description |
|---------|--------|---------|-------------|
| **Splash Ad** | `removeSplashAd` | ON | Blocks `advanced_strategy` in `all-config` response |
| **Home Banner** | `removeIndexBanner` | ON | Clears ad items from `get-index-topic-config` data array, keeps category nav |
| **Feed Ads** | `removeAdList` | ON | Blocks `dtk-ad-list`, `dtk-ad-banner-list`, `dtk-search-ad-list` |
| **New User Red Packet** | `removeNewUserGuide` | ON | Hides new user red packet guide popup |
| **Tracking** | `blockTracking` | OFF | Blocks `logcoll-v2.ffquan.cn` analytics (OFF by default) |
| **Push Tags** | `blockPushTags` | OFF | Blocks Aliyun push `bind-tag`/`list-tag` (OFF by default) |

## Supported Version

- App: Dataoke Union / 易店长 (`com.dataoke.union`)
- Version: 4.0.42
- Stack: React Native + Hermes (HBC v96)

## Import (Loon)

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Dataoke-AdBlock/Dataoke-AdBlock.lpx
```

Add in Loon: Config → Plugins → Add → Paste URL → Enable → Configure switches.

## MITM Hostnames

Add to Loon MITM hostnames and trust Loon CA:
```
dtkapi.ffquan.cn
sr.ffquan.cn
logcoll-v2.ffquan.cn
mpush-api.aliyun.com
yy.ffquan.cn
```

## How It Works

1. **Splash Ad** (`all-config`): Sets `advanced_strategy.switch = 0`, clears `pic`/`text`
2. **Home Banners** (`get-index-topic-config`): Filters out items with `banner`/`jump`/`topic_type===2`/`is_hot===1`
3. **Feed Ads** (`dtk-ad-*`): Empties `data.list` and `data.banner` arrays
4. **New User Guide**: Returns `data: null` for red packet endpoint

## Notes

- `img.alicdn.com` (product images) is **never blocked** — only ad items removed at data layer
- Tracking/push switches default **OFF** to avoid side effects
- If API changes, provide HAR for rule update

## Verification

1. Enable plugin with all switches ON
2. Force-restart app → No splash ad, no "new user guide"
3. Pull-to-refresh home → No banner ads, category nav works
4. Search → No ad items in results
5. Feed → No ad cards
6. Core features (product detail, link conversion, orders, high commission) work normally

## Changelog

### v1.0.1 (2026-10-20)
- Fixed Loon Script syntax: regex pattern, requires-body=1, argument=[{var}], enable={switch}
- Arguments now boolean (true/false) instead of Chinese labels

### v1.0.0 (2026-10-20)
- Initial release
- Covers 5 ad scenarios: splash, home banner, feed, search, new user guide
- 6 independent switches, core ads ON by default, tracking/push OFF by default