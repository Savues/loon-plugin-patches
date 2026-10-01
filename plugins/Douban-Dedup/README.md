# Douban-Dedup · 豆瓣开屏广告屏蔽

> [honue/rules](https://github.com/honue/rules) `Douban.plugin` 的**镜像**。
> 规则正文与上游**逐字节相同**，唯一改动是 `#!homepage` 指向本仓库。

## 订阅

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Douban-Dedup/Douban-Dedup.lpx
```

> CDN 缓存最长约 24h。拉不到时加随机参数：`?cb=2`

---

## 镜像什么

上游那 1 条 Rewrite 逐字保留，连它自己写的两条注释也留着：

```ini
[Rule]

[URL Rewrite]
^https?:\/\/api\.douban\.com\/v2\/app_ads.+ reject
# ^https?:\/\/api\.douban\.com\/v2\/app_ads\/splash_preload reject
# ^https?:\/\/api\.douban\.com\/v2\/app_ads\/splash_show reject

[MITM]
hostname = api.douban.com
```

上游 `#!desc` 自己写着：**「只能屏蔽开屏，后期还要改 duration」**。

那半句是广告存在本地缓存导致的：`splash_preload` 是 POST，6423 B 表单体里带着
`preload_ads` —— 已缓存的开屏广告对象，含曝光标记与有效期。网络层拦不到它。

⚠️ 网络层能做的是让 `app_ads` 接口失败；广告对象若已在本地，最坏是多停 1–2 秒，
而不是完全跳过。

---

## 镜像的验证

`test/manifest.test.mjs` 的核心是一条字节比对：

```js
assert(stripMeta(lpx) === stripMeta(upstream-honue.plugin))
```

外加「元信息只允许 `homepage` 一行不同」和约 20 条反向断言
（不许出现 `[Script]` / `[Argument]` / `enable=` / `IP-CIDR` / `erebor` / `frodo` / `doubanio`）。
以后想加东西，得先说清楚为什么上次加了会出问题。

---

## 已知限制

| 限制 | 说明 |
|---|---|
| 只去开屏 | 信息流、横幅、影视页、剧集页、小组页广告都不拦（上游本来就这样） |
| 搜索页广告词 | 不处理。要去搜索页广告用 [Douban-SearchAd](../Douban-SearchAd/) |
| 本地缓存的开屏 | 网络层无法清除，最多少停 1–2 秒 |
| 作者的 TODO | 上游写着「后期还要改 duration」，尚未实现 |

**与 [Douban-SearchAd](../Douban-SearchAd/) 二选一**，不要同时装。

---

## 文件

| 文件 | 用途 |
|---|---|
| [Douban-Dedup.lpx](Douban-Dedup.lpx) | 插件清单（与上游差 1 行 homepage） |
| [upstream-honue.plugin](upstream-honue.plugin) | 上游原件逐字节留存，SHA256 已钉进测试 |
| [test/manifest.test.mjs](test/manifest.test.mjs) | 镜像校验 |

## 致谢

[honue/rules](https://github.com/honue/rules) —— 全部规则内容的作者。
战史（三次返工的经过）记在仓库根 README，本文件不重复。
