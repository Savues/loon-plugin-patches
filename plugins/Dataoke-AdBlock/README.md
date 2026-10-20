# Dataoke-AdBlock

大淘客联盟 / 易店长 去广告插件

## 功能特性

| 功能 | 开关 | 默认 | 说明 |
|------|------|------|------|
| **开屏广告** | `removeSplashAd` | ✅ 开启 | 拦截 `all-config.advanced_strategy`、`get-index-topic-config topic_type=4` |
| **首页顶部 Banner** | `removeTopBanner` | ❌ 关闭 | 拦截 `get-index-topic-config`、`app-index-topic` 中 `banner` 字段非空的项 |
| **首页运营位** | `removeIndexBanner` | ✅ 开启 | 拦截 `topic_type=2`、`jump`、`is_hot=1` 等普通运营位 |
| **信息流广告** | `removeAdList` | ✅ 开启 | 拦截 `dtk-ad-list` / `dtk-ad-banner-list` / `dtk-search-ad-list` / `search-v2` |
| **新用户红包** | `removeNewUserGuide` | ✅ 开启 | 屏蔽新用户红包引导弹窗 |
| **埋点上报** | `blockTracking` | ✅ 开启 | 拦截 `logcoll-v2.ffquan.cn` 行为埋点 |
| **推送标签** | `blockPushTags` | ✅ 开启 | 拦截阿里云推送 `bind-tag` / `list-tag` |

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

### 1. 开屏广告 (`all-config` / `get-index-topic-config`)
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
同时，`get-index-topic-config` 接口也会下发 `topic_type=4` 的开屏类运营位。插件将 `switch` 改为 `0`，清空 `pic` 和 `text`，并过滤 `topic_type=4` 的条目。

### 2. 首页顶部 Banner (`get-index-topic-config` / `app-index-topic`)
首页下拉刷新请求相关接口，响应中 `banner` 字段非空的为顶部轮播图广告。插件清空 `banner`、`goods_pic` 等字段。

### 3. 首页运营位 (`get-index-topic-config` / `app-index-topic`)
包含 `topic_type=2`（运营活动）、`jump` 跳转链接、`is_hot=1`（热门标记）等特征的运营位。插件过滤这些条目，保留纯分类导航。

### 4. 显式广告列表
三个接口返回广告数据：
- `/dtk-ad-banner-list` - 横幅广告
- `/dtk-ad-list` - 信息流广告
- `/dtk-search-ad-list` - 搜索结果广告
- `/search-v2` / `/go_getway/proxy/search-v2` - 推荐流中的纯推广商品 (`is_pure_push=1`)

插件将广告数组置空或过滤 `is_pure_push=1` 的商品。

### 5. 新用户红包
`/new-user-excitation-guide/red-packet-info` 返回红包信息，插件返回 `data: null`。

## 注意事项

1. **商品图片域名 `img.alicdn.com` 不拦截** —— 为业务必需，仅在数据层删除广告条目
2. **`removeTopBanner` 默认关闭** —— 避免误伤首页正常轮播图，如需拦截请手动开启
3. **如遇接口变更** —— 请抓包提供 HAR，我会及时更新规则

## 验证方法

1. 启用插件，核心开关全开（`removeTopBanner` 可选）
2. 杀进程重启 App → 无开屏广告图、无"新手淘客金牌辅助"引导
3. 首页下拉刷新 → 顶部/中部/底部无运营位 Banner，分类导航正常
4. 搜索商品 → 搜索结果无 `is_pure_push=1` 广告条目
5. 信息流列表 → 无广告卡片
6. 正常功能验证：商品详情、链接转换、订单查询、高佣授权均正常

## 逆向工程文档

详细的反编译分析、接口字段映射、HERMES 字节码反编译过程见：
👉 **[ios-reverse-engineering/Dataoke-Union](https://github.com/Savues/ios-reverse-engineering/tree/main/Dataoke-Union)**

包含：
- IPA 解包与 Hermes 字节码反编译步骤
- 核心 API 端点完整清单 (70+ 端点)
- 广告投放字段定位过程
- 关键响应结构文档

## 更新日志

### v1.4.2 (2026-10-20)
- 新增 `removeTopBanner` 独立开关，默认关闭
- `removeSplashAd`、`removeIndexBanner`、`removeAdList`、`removeNewUserGuide`、`blockTracking`、`blockPushTags` 默认开启
- 支持三层首页广告分类拦截：开屏/顶部Banner/普通运营位
- 修复网关代理版 `search-v2` (`go_getway/proxy/search-v2`) 响应结构差异
- 新增 `get-all-market` 运营位图片清洗

### v1.3.3 (2026-10-20)
- `get-index-topic-config` 中 `topic_type=4` 开屏类广告改由 `removeSplashAd` 控制

### v1.3.2 (2026-10-20)
- 显式处理 `get-index-topic-config` 中 `topic_type=4` 和 `topic_img` 字段

### v1.3.1 (2026-10-20)
- 所有 6 个开关默认全开

### v1.3 (2026-10-20)
- 修复 `go_getway/proxy/search-v2` 响应结构 (`data.search.list`)
- 新增 `get-all-market` 处理

### v1.2 (2026-10-20)
- 添加 `go_getway/proxy/search-v2` 到正则
- 新增 `get-all-market` 处理

### v1.1 (2026-10-20)
- 添加缺失端点 `app-index-topic`、`search-v2`

### v1.0 (2026-10-20)
- 初版发布

---

# Dataoke-AdBlock (English)

Ad-block plugin for **Dataoke Union / 易店长** (com.dataoke.union)

## Features

| Feature | Switch | Default | Description |
|---------|--------|---------|-------------|
| **Splash Ad** | `removeSplashAd` | ON | Blocks `advanced_strategy` in `all-config`, `topic_type=4` in `get-index-topic-config` |
| **Home Top Banner** | `removeTopBanner` | OFF | Blocks items with `banner` field in `get-index-topic-config`/`app-index-topic` |
| **Home Ops Items** | `removeIndexBanner` | ON | Blocks `topic_type=2`, `jump`, `is_hot=1` regular ops items |
| **Feed Ads** | `removeAdList` | ON | Blocks `dtk-ad-list`, `dtk-ad-banner-list`, `dtk-search-ad-list`, `search-v2` |
| **New User Red Packet** | `removeNewUserGuide` | ON | Hides new user red packet guide popup |
| **Tracking** | `blockTracking` | ON | Blocks `logcoll-v2.ffquan.cn` analytics |
| **Push Tags** | `blockPushTags` | ON | Blocks Aliyun push `bind-tag`/`list-tag` |

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

1. **Splash Ad** (`all-config` + `get-index-topic-config`): Sets `advanced_strategy.switch = 0`, filters `topic_type=4`
2. **Home Top Banner** (`get-index-topic-config`/`app-index-topic`): Clears `banner`/`goods_pic` fields
3. **Home Ops Items** (`get-index-topic-config`/`app-index-topic`): Filters `topic_type=2`/`jump`/`is_hot=1`
4. **Feed Ads** (`dtk-ad-*`/`search-v2`): Empties `data.list` or filters `is_pure_push=1`
5. **New User Guide**: Returns `data: null` for red packet endpoint

## Notes

- `img.alicdn.com` (product images) is **never blocked** — only ad items removed at data layer
- `removeTopBanner` defaults **OFF** to avoid false positives on normal carousel
- If API changes, provide HAR for rule update

## Reverse Engineering Docs

👉 **[ios-reverse-engineering/Dataoke-Union](https://github.com/Savues/ios-reverse-engineering/tree/main/Dataoke-Union)**

## Changelog

### v1.4.2 (2026-10-20)
- New `removeTopBanner` switch (default OFF)
- Core switches default ON
- Three-tier home ad filtering: Splash / Top Banner / Regular Ops
- Fixed gateway `search-v2` response structure
- Added `get-all-market` ops image cleanup

### v1.3.3 (2026-10-20)
- `topic_type=4` splash ads controlled by `removeSplashAd`

### v1.3.2 (2026-10-20)
- Explicit `topic_type=4` and `topic_img` handling

### v1.3.1 (2026-10-20)
- All 6 switches default ON

### v1.3 (2026-10-20)
- Fixed `go_getway/proxy/search-v2` (`data.search.list`)
- Added `get-all-market` handling

### v1.2 (2026-10-20)
- Added `go_getway/proxy/search-v2` to regex
- Added `get-all-market` handling

### v1.1 (2026-10-20)
- Added missing endpoints `app-index-topic`, `search-v2`

### v1.0 (2026-10-20)
- Initial release