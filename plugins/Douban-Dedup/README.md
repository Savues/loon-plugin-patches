# Douban-Dedup · 豆瓣去广告

> **以 honue 原版为基线**，只追加一个「搜索页预制广告词」剥离脚本。**v2.0**
>
> 原版 480 B，1 条 Rewrite、1 个域名。本版只多了 1 条 `[Script]` 和 1 个域名。

| | 中文 | English |
|---|---|---|
| 上游 | [honue/rules](https://github.com/honue/rules) · 480 B（原件逐字节留存于 `upstream-honue.plugin`） | honue/rules, 480 B, pristine copy kept |
| 脚本 | `src/douban-search-ad.js` —— 自研，剥离搜索页预制广告词 | One self-written script |
| 回归测试 | `test/manifest.test.mjs` 43 项 + `test/script.test.mjs` 46 项 | 89 assertions |

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Douban-Dedup/Douban-Dedup.lpx
```

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。拉不到时加随机参数：`?cb=2`

---

## 相对原版改了什么 · Changes

**只改了三处，其中两处是等价修正。**

| # | 改动 | 依据 |
|---|---|---|
| 1 | `v2` → `v\d+` | 原版硬编码 `v2`，豆瓣升到 v3 即失效 |
| 2 | `reject` → `reject-dict` | JSON 接口该返回 `{}`；原版返回空响应体，真机抓包看到 App 5 秒后原样重试 |
| 3 | `[MITM]` 加 `frodo.douban.com` | 脚本生效的前提 —— 响应体改写必须解密该域名 |

新增的唯一功能是那条 `[Script]` 规则。

**没有加**：信息流/横幅拦截、腾讯优量汇 HTTPDNS、`img*.doubanio.com`、任何 `[Rule]`。
这些在 v1.x 里都试过，详见下方「为什么回退到原版基线」。

---

## 🆕 搜索页预制广告词（唯一新增功能）

抓包（豆瓣 7.135.0 / iPadOS 18.7.3，8 份 HAR）显示搜索框滚动广告与「发现」横滚标签广告
都来自搜索接口的响应体：

```
/api/v2/search/found_words → { words:[...], top_word, cache_timeout }
/api/v2/search/hots        → { roofs:[...], ..., ad_info:{...} }
```

广告与真实热搜**混在同一个数组里**：

| 位置 | 广告条目 | 正常条目 |
|---|---|---|
| `words[]` | `layout:"ad" search_type:"ad_link"` | `layout:"default" search_type:"all"` |
| `roofs[]` | `layout:"ad"` | — |
| `ad_info` | `ad_type:"fake"` `unit_name:"dale_app_search_hots_page"` `sdk_type:"pangolinSDK"` | — |

实测样本：

```jsonc
// words 数组（8 条，只有 [1] 是广告）
[0] {"layout":"default","search_type":"all","title":"《复仇者联盟5》确认引进内地"}
[1] {"layout":"ad","search_type":"ad_link","title":"看视频抽立减金",
     "uri":"https://m.douban.com/cps-spu-page/3/daily-incentive-lottery?source=ad"}
[2] {"layout":"default","search_type":"all","title":"余红旧事"}
```

### 为什么不能直接 reject

真实热搜和广告在同一个数组里。拦掉整个端点 = **搜索联想功能报废**。

所以用 `script-response-body` 语义（实际挂 `[Script]` 的 `http-response`）
**只删广告条目，其余原样返回**。

### `top_word` 只能整字段删除

它是搜索框里滚动的那个词，也是「搜索词投放」广告的落点。
v1.2/v1.3 我都判定「它标 `default` 所以是正常热搜」，**真机证明那是错的**。

跨 8 份抓包 12 个不同的 `top_word`，**没有一个带广告标记**：

| `top_word` | 实际 |
|---|---|
| 《沙丘3》确认引进 | 🔴 广告 |
| 女生独闯肯尼亚safari | 🔴 广告 |
| **《Girls》主创Lena Dunham代孕** | ✅ **明显是真热搜** |

三个判据全部失效：

| 判据 | 失效原因 |
|---|---|
| `layout` / `search_type` | 12 个样本全是 `default`/`all` |
| URI 是话题 `#xxx#` 还是裸词 | 正常热搜也用话题：`#林诗栋4:0击败王楚钦亚运夺冠#` |
| 标题含英文字母 | `《Girls》主创Lena Dunham代孕` 含字母**却是真的** |

⇒ 这是「搜索词投放」广告的固有做法：**刻意伪装成普通热搜**。
协议层无解，只能整字段删除。代价是搜索框不再显示滚动词，**搜索功能不受影响**。

### 脚本的三条保守原则

1. **只按 `layout` / `search_type` 删**，不按标题关键词 —— 广告词每天换
2. **任何解析异常一律放行原响应** —— 搜索功能比去广告重要
3. **删空数组时补占位条目** —— 避免 App 拿到空列表渲染异常

### ⚠️ 语法依据

响应体改写只能写在 `[Script]` 段，语法来自 Loon 官方手册
[`docs/cn/script.md`](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/script.md)：

```ini
http-response ^...$ script-path=..., requires-body=true, timeout=10, enable={block_search_ad}
```

`requires-body=true` 是**硬性要求** —— 手册明确「如果响应带有 body，
并且 `requires-body = true` 时此参数才有值」。漏掉它 `$response.body` 恒为 `undefined`，
脚本永远走放行分支。

手册还保证 `$done({body})` 会**自动重算 `content-length` 与 `content-encoding`**，
所以服务端的 gzip 不需要手动处理。真机验证：`content-encoding: gzip` 响应头在改写后消失。

`[URL Rewrite]` **没有** `script-response-body` 这个语法
（见 [`docs/cn/rewrite.md`](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/rewrite.md)，
它只支持 URL/Header 改写、302/307 与 5 种 reject）。v1.2 写过，真机一次没跑。

---

## 为什么回退到原版基线

v1.0–v1.4 逐步加了很多规则，结果引入了用户报告的问题：
**浏览几个个人主页/小组页后无法加载，重启 App 才能恢复。**

抓包里能看到并发下的瞬时排队（v1.4 那份，21 并发窗口）：

```
04:49:32.401  img3.doubanio.com/icon/…    🔴 status=0
04:49:32.401  img9.doubanio.com/icon/…    🔴 status=0
…
04:49:32.431  ↑ 10 ms 后全部重试成功，hdr=14~20 真回包
```

但同一份抓包里**豆瓣侧零失败** —— 8 个主页接口全部 `200`。

**我不能证明是本插件造成的** —— 移除 `img*.doubanio.com`（v1.3）后照样复现。
怀疑过是连接池被挤满（每个解密请求多一次 TLS 握手），但那只是推测，没有证据。
但可以确定的是：**honue 原版没有这个问题**（用户实测），而 v1.x 有。

v2.0 的取舍因此很明确：**放弃未经充分验证的收益，换取已验证的稳定。**

`test/manifest.test.mjs` 里有反向断言钉死这一点 ——
`[Rule]` 段必须为空、`[URL Rewrite]` 只能有 1 条、不许出现 `erebor` / `IP-CIDR` / `dale_ad`。
以后想加东西，得先想清楚为什么上次加了会出问题。

---

## 已知未解决

**「浏览几个个人主页后无法加载」在 v2.0 未做验证。**

我此前把这个归因于 `img*.doubanio.com` 和 HTTPDNS 规则，两次都被真机证伪
（移除后仍复现）。v2.0 已把这两个变量都去掉了，**但需要用户实测确认问题是否消失**。

如果 v2.0 仍然复现，那说明原因在 Loon 本身或豆瓣侧，与本插件无关。

---

## 误伤验证

`test/script.test.mjs` 46 项断言，固件是真实抓包的响应体（已脱敏）：

| 检查项 | 结果 |
|---|---|
| 广告词「看视频抽立减金」被删 | ✅ |
| 广告词「抽10元支付宝立减金」被删 | ✅ |
| `ad_info` 整块删除 | ✅ |
| `top_word` 整字段删除 | ✅ |
| `roofs` 删空后补占位 | ✅ |
| 真实热搜 7 条全部保留 | ✅ |
| `hot_search_board` / `subjects` / `top_groups` 保留 | ✅ |
| 幂等（再跑一次不重写） | ✅ |
| 非 JSON / 空 body / 数组根 / null 全部放行 | ✅ |
| 不含 eval / fetch / `$httpClient` | ✅ |

---

## 文件 · Files

| 文件 | 用途 |
|---|---|
| [Douban-Dedup.lpx](Douban-Dedup.lpx) | 插件清单 |
| [src/douban-search-ad.js](src/douban-search-ad.js) | 搜索页广告剥离脚本 |
| [upstream-honue.plugin](upstream-honue.plugin) | honue 原件，逐字节留存（SHA256 钉死） |
| [upstream-shengrui.plugin](upstream-shengrui.plugin) | shengrui 原件留存（v1.x 的来源，v2.0 未使用） |
| [test/manifest.test.mjs](test/manifest.test.mjs) | 清单回归 43 项 |
| [test/script.test.mjs](test/script.test.mjs) | 脚本回归 46 项 |
| [test/fixtures/found_words.json](test/fixtures/found_words.json) | 真机响应固件（已脱敏） |
| [test/fixtures/search_hots.json](test/fixtures/search_hots.json) | 真机响应固件（已脱敏） |

---

## 致谢 · Credits

- [honue/rules](https://github.com/honue/rules) —— 基线，本版主体来自它
- [shengrui123/douban-adblock](https://github.com/shengrui123/douban-adblock) —— v1.x 的另一来源，v2.0 未采用
