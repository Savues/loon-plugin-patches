# Douban-Dedup · 豆瓣去广告

> 豆瓣 App 去广告。**去开屏 + 信息流/横幅 + 搜索页预制广告词**。
> 合并 [honue/rules](https://github.com/honue/rules) 与
> [shengrui123/douban-adblock](https://github.com/shengrui123/douban-adblock) 两家，
> 全部改动依据来自 **2026-10-01 的四份真机抓包**。**v1.2**

| | 中文 | English |
|---|---|---|
| 上游 A | [honue/rules](https://github.com/honue/rules) · 480 B（原件留存于 `upstream-honue.plugin`） | honue/rules, 480 B, pristine copy kept |
| 上游 B | [shengrui123/douban-adblock](https://github.com/shengrui123/douban-adblock) · 1552 B（原件留存于 `upstream-shengrui.plugin`） | shengrui123, 1552 B, pristine copy kept |
| 改动 | 清单层重写 + **v1.2 新增一个自研脚本** | Manifest rewritten, plus one self-written script in v1.2 |
| 脚本 | `src/douban-search-ad.js` —— 剥离搜索页预制广告词（**未改动上游任何 JS，两家原本都没有 JS**） | One self-written script; no upstream JS touched |
| 回归测试 | `test/manifest.test.mjs` 77 项 + `test/script.test.mjs` 34 项 | 111 assertions total |

---

## 🆕 v1.2：搜索页预制广告词

抓包发现搜索框滚动广告与「发现」横滚标签里的广告，都来自**搜索接口的响应体**：

```
/api/v2/search/found_words → { words: [...], top_word, cache_timeout }
/api/v2/search/hots        → { roofs: [...], ..., ad_info: {...} }
```

广告条目和真实热搜**混在同一个数组里**，靠字段区分：

| 位置 | 广告条目 | 正常条目 |
|---|---|---|
| `words[]` | `layout:"ad" search_type:"ad_link"` | `layout:"default" search_type:"all"` |
| `roofs[]` | `layout:"ad"` | — |
| `ad_info` | `ad_type:"fake" advertisement_type:43`<br>`unit_name:"dale_app_search_hots_page"`<br>`sdk_list:[{sdk_type:"pangolinSDK"}]` | — |

抓包实测样本：

```jsonc
// words 数组（8 条，只有 [1] 是广告）
[0] {"layout":"default","search_type":"all","title":"《复仇者联盟5》确认引进内地"}
[1] {"layout":"ad","search_type":"ad_link","title":"看视频抽立减金",
     "uri":"https://m.douban.com/cps-spu-page/3/daily-incentive-lottery?source=ad"}
[2] {"layout":"default","search_type":"all","title":"余红旧事"}
...
// top_word（搜索框里滚动的词，本次是正常热搜）
{"title":"《沙丘3》确认引进","search_type":"all","layout":"default"}
```

### 为什么不能直接 reject

真实热搜和广告在同一个数组里。拦掉整个端点 = **搜索联想功能报废**。

所以改用 `script-response-body` **只删广告条目，其余原样返回**。

### 脚本的三条保守原则

1. **只按 `layout` / `search_type` 删**，不按标题关键词删 —— 广告词每天换
2. **任何解析异常一律放行原响应** —— 搜索功能比去广告重要
3. **删空数组时补一个占位条目** —— 避免 App 拿到空列表渲染异常

### ⚠️ 这条规则刻意没有开关

改写响应体只能写在 `[URL Rewrite]` 段，而本仓库**已实测该段尾部的 `enable=` 静默失效**
（PinDuoDuo 二十多条全废的先例）。挂上去就是死开关 —— 用户会以为开关管用。

所以搜索广告**没有开关**，要关只能关掉整个插件。测试里有反向断言钉死这一点。

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Douban-Dedup/Douban-Dedup.lpx
```

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。拉不到时加随机参数：`?cb=2`

---

## 🔴 v1.0 的真机失败（这节是本插件最重要的一页）

v1.0 我把 4 条信息流规则放在 `[Rule]` 段的 `URL-REGEX` 上，**理由是「只有 `[Rule]` 能挂
`enable={}` 开关」**。装上后用户抓包（固件 B）打脸：

| 端点 | 响应头 | 大小 | 结论 |
|---|---|---|---|
| `splash_preload` ×2 | **1** | 2 B (`{}`) | ✅ 拦住 |
| `dale_ad` 素材图 ×5 | **0** | 0 B | ✅ 拦住 |
| `erebor/feed_ad` | 10 | **60908 B** | 🔴 **漏** |
| `movie/ad` ×6 | 16 | 4603 B / 4593 B | 🔴 **漏** |
| `home_ads` | 13 | 24 B | 🔴 漏 |
| `home_banner` | 13 | 2 B | 🔴 漏 |

**根因：`[Rule]` 段的 `URL-REGEX` 不参与 HTTPS 路径改写。**

判定「本地合成 vs 真实回包」靠**响应头数量**——真回包带 `date` / `server: dae` / `x-dae-app`
等 10–16 条响应头，Loon 本地合成的 `reject-dict` 只有 1 条 `content-type`、`reject` 是 0 条。

### 为什么同段的 `IP-CIDR` 却生效了

同一份抓包里 `[Rule]` 的 `IP-CIDR,119.29.29.90` 拦下了 15 次 HTTPDNS 请求。
**所以不是整段失效，是 `URL-REGEX` 这一种规则类型不生效。** 这个区分是定位的关键——
若只看「`[Rule]` 段不工作」就会错误地改掉本来正确的 HTTPDNS 规则。

### 修复与代价

信息流规则全部移回 `[URL Rewrite]`，代价是**挂不上开关**。

因此本版**删掉了 `block_feed_ad` 开关**，只保留 `block_httpdns`（它挂在 `IP-CIDR` 上，真机确认生效）。

> 宁可没有开关，也不要一个假装能关的开关 —— 用户会以为开关管用。
> 这一点在本仓库已犯过三次，见根目录 README。

`test/manifest.test.mjs` 里有**反向断言**钉死：`[Rule]` 段一旦出现 `URL-REGEX` 立刻转红。

### v1.1 同时新增

| 端点 | 来源 |
|---|---|
| `/api/v2/tv/<id>/ad` | 固件 B 新发现的剧集页广告位 |

---

## 抓包证据 · What the captures showed

| 固件 | 来源 | 场景 |
|---|---|---|
| A（218 条） | `shared-5E597331_214_1790793676708.har` · 02:41:20–02:41:50 | 装着上游 honue + shengrui |
| B（249 条） | `shared-16EF1D6F_215_1790796176727.har` · 03:22:59–03:23:32 | 装着本仓库 v1.0 |

两份都压成 `test/fixtures/*.tsv` 入库（已脱敏）。

### 发现 1：两家上游都漏了 59 KB 的信息流广告

| 端点 | 次数 | 响应 | honue | shengrui | 730 |
|---|---|---|---|---|---|
| `erebor/feed_ad` | 2 | **55958 / 60908 B** | ❌ | ❌ | ❌ |
| `movie/ad` | 6 | 4606 / 4603 B | ❌ | ❌ | ❌ |
| `erebor/special_ad` | 1 | `{"ad_info":null}` | ❌ | ❌ | ❌ |
| `home_banner` | 2 | `{}` | ❌ | ❌ | ❌ |
| `home_ads` | 2 | `{"cache_duration":7200}` | ❌ | ❌ | ❌ |
| `api.douban.com/v2/app_ads/splash_preload` | 4 | — | ✅ | ✅ | ✅ |
| `img*.doubanio.com/.../dale_ad/public/*.jpg` | 10 | — | ❌ | ✅ | ✅ |

三家里**只有 730 拦到了 `home_ads` 附近的路径**，但它的 `movie/banner` 写错了词
（真实端点是 `movie/ad`），且 `v\d` 只匹配一位版本号。

### 发现 2：`splash_show` 在 7.135.0 上是死规则

两份抓包里 splash 相关路径**只有 `splash_preload`**，从未出现 `splash_show`。
shengrui 那条「让 App 立即跳过」的规则从未触发。本版保留但标注为跨版本兜底。

### 发现 3：广告素材图才是「跳过倒计时」的真解

```
03:23:31.480  404 hdr=0  img3.doubanio.com/view/dale-online/dale_ad/public/a67d495a10e8da2.jpg
03:23:30.023  404 hdr=0  img3.doubanio.com/.../eba38c8e9667cf7.jpg
03:23:27.261  404 hdr=0  img3.doubanio.com/.../5a316fe086b1ea2.jpg
03:23:27.260  404 hdr=0  img1.doubanio.com/.../320420350d3abdd.jpg
03:23:06.549  404 hdr=0  img3.doubanio.com/.../46420be2b809c28.jpg
```

`hdr=0` + `404` = Loon 本地合成的 reject，素材确实被掐断了。
**这就是 honue 作者那句「后期还要改 duration」的正解** —— 让 SDK 在加载阶段就判定失败退出。

### 发现 4：优量汇广告域名一次都没出现，HTTPDNS 却在狂跑

两份抓包共 42 次 `http://119.29.29.90/d?dn=...`，全部 `200` 但 `size=0`
（响应头只有 `Content-Length: 0` + `Proxy-Connection: close`）。
而 `*qq.com` 请求数为 **0** —— 广告域名在解析阶段就被掐断了。

### 关于本地缓存：`preload_ads`

`splash_preload` 是 **POST**，6423 B 表单体里带着：

```
preload_ads = [{"uniq_id":"46ccd888...","is_valid":1,"is_exposed":"0",
                "price":"IUegRWldRk3eu-f_a5gtyg",
                "time_span":{"start":"1757433600000","end":"1798732740000"},
                "ad_type":"common","ad_id":"268225"}, ...]
```

这是**已缓存在本地的开屏广告对象**，带曝光标记和有效期。

**但实测下来不必删 App**：固件 B 里用户没删 App（`preload_ads` 与固件 A 完全相同），
开屏素材图仍然被拦住 ⇒ **只要网络层拦到素材，SDK 就会走失败跳过。**
这修正了 v1.0 README 里「必须完整删 App 重装」的说法——那个判断过于保守。

---

## 本版改了什么 · Changes

| # | 改动 | 依据 |
|---|---|---|
| 1 | **信息流规则从 `[Rule]` 移回 `[URL Rewrite]`** | 🔴 固件 B：v1.0 一条没拦住 |
| 2 | 删掉 `block_feed_ad` 开关 | 移回 `[URL Rewrite]` 后挂不上 `enable=`，留着就是死开关 |
| 3 | 新增 `/api/v2/tv/<id>/ad` | 固件 B 新发现 |
| 4 | `v2` → `v\d+` | honue 硬编码，豆瓣升版即失效 |
| 5 | `splash_preload` 由 `reject` → `reject-dict` | honue 用 `reject` 返回空体，JSON 接口应返回 `{}` |
| 6 | 新增 `frodo.douban.com` 进 `[MITM]` | 信息流规则改写 HTTPS 路径的前提条件 |
| 7 | `img\d+` 而非 `img\d` | 730 的 `img\d` 漏掉 `img12` 这类分配 |
| 8 | 保留 `splash_show` 但注明是兜底 | 两份抓包证明当前版本不发 |

**没有动的**：honue 原文里那两条注释掉的规则。它们本来就冗余（第一条粗规则已覆盖）。

---

## 开关 · Switches

| 开关 | 默认 | 作用 | 关掉的后果 |
|---|---|---|---|
| `block_httpdns` | 开 | 拦腾讯优量汇 HTTPDNS 旁路 | 优量汇广告可能复活 |

开屏与信息流**没有开关**（无条件生效）—— 见上文「修复与代价」。

### ⚠️ `block_httpdns` 会影响其它 App

优量汇是**腾讯广告的公共 SDK**，本插件 REJECT 的是 `*.gdt.qq.com` / `*.gdtimg.com`。
开着时，**其它使用腾讯广告的 App 也加载不了它们的广告**。在意就关掉。

### 为什么开屏/信息流放 `[URL Rewrite]`，腾讯放 `[Rule]`

| 段 | 规则类型 | 真机状态 |
|---|---|---|
| `[URL Rewrite]` | 整串正则 | ✅ 确认能改写 HTTPS 路径 |
| `[Rule]` | `IP-CIDR` / `DOMAIN*` | ✅ 确认生效 |
| `[Rule]` | `URL-REGEX` | 🔴 **确认不生效**（v1.0 的教训） |
| `[Rule]` | `AND`/`OR`/`NOT` 逻辑规则 | ❌ 尾部 `enable=` 不被解析 |
| `[URL Rewrite]` | 挂 `enable=` | ❌ 本仓库有静默失效先例 |

---

## 误伤验证 · Regression

`test/manifest.test.mjs` 把两份抓包共 467 条真实请求逐条喂给规则。
其中 **reject 类**才算「拦下」，**script 类**只重写 body，不计入拦截：

| 检查项 | 结果 |
|---|---|
| 固件 B 的 `feed_ad`（v1.0 时 60908 B 真回包） | ✅ 拦下 |
| 固件 B 的 `movie/ad` ×6 | ✅ 全拦 |
| 固件 B 的 `home_ads` / `home_banner` | ✅ 全拦 |
| 开屏接口 ×4 | ✅ 全拦（`reject-dict`） |
| 广告素材图 ×10 | ✅ 全拦（`reject`） |
| **非广告图片（两份合计）** | ✅ **零误伤** |
| 搜索端点 | ✅ 走脚本改写，**零 reject** |
| 正文接口 `elendil/recommend_feed` | 未拦 |
| 人物头像 / 海报 / 剧照 | 零拦截 |
| 用户 / 影视 / 剧集 / 小组 / 搜索 / 通知 | 零拦截 |
| 埋点 `athena`、会员商品 `halfhill` | 未拦 |
| 跨版本 | `v3/app_ads/splash_preload`、`img12.doubanio.com` 均命中 |
| 边界 | `/api/v2/tv/<id>`（剧集本体）、`/api/v2/movie/recommend` 均不误伤 |

---

## 文件 · Files

| 文件 | 用途 |
|---|---|
| [Douban-Dedup.lpx](Douban-Dedup.lpx) | 插件清单 |
| [upstream-honue.plugin](upstream-honue.plugin) | honue 原件，逐字节留存（SHA256 钉死） |
| [upstream-shengrui.plugin](upstream-shengrui.plugin) | shengrui 原件，逐字节留存（SHA256 钉死） |
| [src/douban-search-ad.js](src/douban-search-ad.js) | v1.2 自研脚本：剥离搜索页预制广告词 |
| [test/manifest.test.mjs](test/manifest.test.mjs) | 77 项断言（`node test/manifest.test.mjs`） |
| [test/script.test.mjs](test/script.test.mjs) | 34 项断言（`node test/script.test.mjs`） |
| [test/fixtures/found_words.json](test/fixtures/found_words.json) | 真机响应原样留存（含广告条目） |
| [test/fixtures/search_hots.json](test/fixtures/search_hots.json) | 真机响应原样留存 |
| [test/fixtures/douban-7.135.0.har-urls.tsv](test/fixtures/douban-7.135.0.har-urls.tsv) | 固件 A · 218 条 |
| [test/fixtures/douban-7.135.0-v10.har-urls.tsv](test/fixtures/douban-7.135.0-v10.har-urls.tsv) | 固件 B · 249 条（v1.0 真机） |
| [icon.png](icon.png) | 图标（取自 honue 仓库） |

---

## 致谢 · Credits

- [honue/rules](https://github.com/honue/rules) —— 原始思路与首条规则
- [shengrui123/douban-adblock](https://github.com/shengrui123/douban-adblock) —— 素材图规则与 HTTPDNS 拦截

本版是这两者的合并与重写，改动依据全部来自上文的真机抓包。
