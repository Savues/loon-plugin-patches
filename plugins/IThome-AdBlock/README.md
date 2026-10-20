# IThome-AdBlock · IT之家去广告（修复版）

上游：`https://kelee.one/Tool/Loon/Lpx/IThome_remove_ads.lpx`（可莉 / luestr，`#!date=2026-10-02`）
版本：**v1.0**（清单层修复，**上游 JavaScript 一行未改**）

## 修了什么

只补 `Script` 规则的正则 —— 原规则漏了 **App 默认首页** 用的 feed 端点：

```
原：/^https:\/\/napi\.ithome\.com\/api\/(news\/indexv2\/iphone\/\d+|topmenu\/getfeeds\?)/i
```

`topmenu/getfeeds?`（关注）与 `topmenu/gethomefeeds?`（首页）只差三个字母，正则锚定后不匹配。

补全为：

```
news\/indexv2\/iphone\/\d+ | news\/gethotbang\/\d+
| topmenu\/(getfeeds\?|gethomefeeds\?|getmenufeeds\/\d+\/\d+\/iphone\/\d+)
| newsevent\/geteventfeed\?
```

## 影响范围（实测 ITHomeClient 9.50 / iOS 26.4.2）

`GET api/topmenu/gethomefeeds?topmenuId=101` 的 `data.list`：

| 项 | feedType | 说明 |
|---|---|---|
| `[0]` | 10002 | 顶部轮播图（`focusNewsData`，含 `isAd` 广告位） |
| `[1]` | 10003 | 置顶文章 |
| `[8]` | 10004 | **双11红包**等活动的 WebView 卡片 → `img.ithome.com/zuihuimai/static/s11/2026-1111/hongbao.html` |
| `[12]` `[23]` | 10000 | 信息流广告（`flag=2` / `smallTags=["广告"]`） |

这些在首页**全部**未被处理；修复后随 feed 过滤一并移除。

> 上游 JS 本身已有 `feedType === 10004` / `flag === 2` / `isAd` / `smallTags` 广告 的过滤逻辑，
> 用 node 回放验证确实会删 —— 问题 1000% 出在规则没匹配到端点。

## 导入

把 `IThome-AdBlock.lpx` 放到任意可访问 URL（如本仓库 raw）后，在 Loon 里「添加插件」粘贴即可。

## 其它观察（未改）

* `knicks.jd.com/log/server` —— 京东开普勒埋点（红包点击/曝光上报），无规则。
* `img.ithome.com/zuihuimai/*` —— 红包 WebView 本体与素材；`img.ithome.com` 不在 MitM 列表，且该域承载全部新闻配图，MitM 它代价较高，故未启用。
* MitM 里的 `api.zuihuimai.com` 与实际使用的 `hwapi.zuihuimai.com`（好物 API）不符，属上游笔误。

---

# 使用说明 · 开关

| 开关 | 默认 | 作用 |
|---|---|---|
| `removeAllBanners` | 关 | 移除整个轮播图（`feedType 10002`） |
| `removePinnedArticles` | 关 | 移除置顶文章（`feedType 10003`） |

`feedType 10004`（活动 WebView 卡片）、`flag=2`、`smallTags=["广告"]`、轮播图内 `isAd=true` 为**无条件过滤**，与上游行为一致。

## 端点速查

| 端点 | 界面 |
|---|---|
| `api/news/indexv2/iphone/950` | 「最新」 |
| `api/topmenu/gethomefeeds?topmenuId=101` | **首页（默认）** |
| `api/topmenu/getfeeds?topmenuid=167` | 「关注」 |
| `api/topmenu/getmenufeeds/{id}/0/iphone/950` | 各频道（评测/现场/IT号/…） |
| `api/news/gethotbang/1` | 「热榜」 |
| `api/newsevent/geteventfeed` | 「事件」 |
