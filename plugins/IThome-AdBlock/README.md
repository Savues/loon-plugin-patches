# IThome-AdBlock · IT之家去广告（修复 + 增强）

上游：`https://kelee.one/Tool/Loon/Lpx/IThome_remove_ads.lpx`（可莉 / luestr，`#!date=2026-10-02`）
当前版本：**v1.1**（2026-10-20）

| 文件 | 说明 |
|---|---|
| `IThome-AdBlock.lpx` | **v1.1 增强版（推荐）**：补全端点 + 自研脚本（`src/`），含电商带货文过滤 |
| `IThome-AdBlock.lite.lpx` | **v1.0 纯清单层修复**：只补端点正则，继续用 kelee.one 上游 JS，零托管 |
| `src/IThome_remove_ads.js` | 自研脚本（逻辑重写 + 扩展，**不含上游代码**），node 回放 30 项断言全过 |

---

## v1.0 修了什么（上游仍存在的 bug）

上游 `Script` 规则的正则漏了 **App 默认首页** 用的 feed 端点：

```
原：/^https:\/\/napi\.ithome\.com\/api\/(news\/indexv2\/iphone\/\d+|topmenu\/getfeeds\?)/i
```

`topmenu/getfeeds?`（关注）与 `topmenu/gethomefeeds?`（首页）只差三个字母，锚定后不匹配。
补全为（`lite` 版与此相同）：

```
news\/indexv2\/iphone\/\d+ | news\/gethotbang\/\d+
| topmenu\/(getfeeds\?|gethomefeeds\?|getmenufeeds\/\d+\/\d+\/iphone\/\d+)
| newsevent\/geteventfeed\?
```

实测（ITHomeClient 9.50 / iOS 26.4.2）：`GET api/topmenu/gethomefeeds?topmenuId=101` 的
`data.list` 含 `10002 轮播图 / 10003 置顶 / 10004 双11红包 WebView 卡片 / flag=2 信息流广告`，
原插件在首页**全部放行**。上游 JS 本身有这些过滤逻辑，问题 100% 在规则没匹配到端点。

## v1.1 新增：电商带货文章过滤（自研脚本）

依据 2026-10-20 两份真实 HAR（两个 feed 分页共 41 项）全量对照：9 篇带货文与
正常文在 `feedContent.content`（正文 HTML）上特征分离度极大——

| 特征 | 含义 | 9 篇带货文 | 正常文 |
|---|---|---|---|
| `uland.taobao.com` | 淘宝联盟 coupon | 5 篇命中 | 0 |
| `union_lens=lensId:TAPI@` | 淘宝联盟 union_id | 5 篇 | 0 |
| `u.jd.com` | 京东联盟短链 | 9 篇 | 0 |
| `360buyimg.com` | 京东商品图 CDN | 9 篇 | 0 |
| `class="card main-site"` | 带货商品卡模板 | 9 篇 | 0 |
| `mall-data` / `card-btn-deep` | 带货卡标识/按钮 | 9 篇 | 0 |
| `s.click.taobao.com` / `img.alicdn.com` | 淘宝跳转/阿里商品图 | 9 篇 | 0 |

判定规则：**命中 ≥2 个不同特征 → 判为带货文，整条移除**。
实测 9 篇带货文（WPS 京东PLUS、B站发车、八位堂手柄、达尔优键盘、Bose 耳机、闪迪 SSD、
米家吹风机、致态 PSSD、华为路由）全部命中 6–9 个特征被删；5 篇正常文（微软/马斯克/三星/五菱）零命中全保留。

> ⚠️ 注意：带 JD/淘宝卡片的**数码新品促销文**（如「华为路由预售 478 元」）也会被移除。
> 若想保留这类内容，在 Loon 插件配置里关掉「移除电商带货文章」开关即可（该开关独立，其余过滤不受影响）。

## 开关（v1.1，参数顺序与 `script()` 一致）

| 开关 | 默认 | 作用 |
|---|---|---|
| `removeWebViewCards` | 开 | `feedType 10004` 活动 WebView 卡片（双11红包等）+ 按 URL 兜底 |
| `removeFeedAds` | 开 | `flag=2` / `isAd` / `smallTags=["广告"]` 信息流广告 |
| `removeBannerAds` | 开 | 轮播图 `focusNewsData` 中 `isAd=true` 广告位 |
| `removeEcommerceArticles` | 开 | 电商带货文章（见上） |
| `removeAllBanners` | 关 | 整个轮播图（`10002`） |
| `removePinnedArticles` | 关 | 置顶文章（`10003`） |

## 导入

```
增强版：https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/IThome-AdBlock/IThome-AdBlock.lpx
纯清单：https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/IThome-AdBlock/IThome-AdBlock.lite.lpx
```

脚本带 `?v=11` 版本参数：Loon 按 URL 缓存脚本，改脚本必须同时改此参数。

## 端点速查

| 端点 | 界面 |
|---|---|
| `api/news/indexv2/iphone/950` | 「最新」 |
| `api/topmenu/gethomefeeds?topmenuId=101` | **首页（默认）** |
| `api/topmenu/getfeeds?topmenuid=167` | 「关注」 |
| `api/topmenu/getmenufeeds/{id}/0/iphone/950` | 各频道（评测/现场/IT号/…） |
| `api/news/gethotbang/1` | 「热榜」 |
| `api/newsevent/geteventfeed` | 「事件」 |

## 其它观察（未改）

* `knicks.jd.com/log/server` —— 京东开普勒埋点，v1.1 起在 `[Rule]` 里 REJECT。
* `img.ithome.com/zuihuimai/*` —— 红包 WebView 本体；该域承载全部新闻配图，MitM 代价高，未启用。
* 上游 MitM 写的 `api.zuihuimai.com` 与实际使用的 `hwapi.zuihuimai.com`（好物 API）不符，属上游笔误，原样保留。
