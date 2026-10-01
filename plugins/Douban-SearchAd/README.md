# Douban-SearchAd · 豆瓣搜索页广告词屏蔽

> 只做一件事：剥掉搜索框滚动广告与「发现」横滚标签里的预制广告词。
> 开屏拦截沿用 [honue/rules](https://github.com/honue/rules) 原版那条规则，逐字未改。

| | 中文 | English |
|---|---|---|
| 上游 | [honue/rules](https://github.com/honue/rules) · `Douban.plugin`（开屏规则来源，原件留存于 `upstream-honue.plugin`） | honue/rules |
| 脚本 | `src/douban-search-ad.js` —— 自研，剥离搜索页预制广告词 | One self-written script |
| 测试 | `test/manifest.test.mjs` + `test/script.test.mjs` | 两组回归 |

---

## ⚠️ 先读这一段：这个开关不是「绝对」的

你想问的是「能不能做一个绝对可靠的开关来启停搜索广告」——
**能做到的部分做到了，但有一处 Loon 架构上做不到。**

### 做不到的部分：`[MITM]` 无法被开关控制

```
[Argument]
block_search_ad = switch,true,...      ← 能关
...
[MITM]
hostname = api.douban.com, frodo.douban.com    ← 开关管不到
```

Loon 官方手册 `docs/cn/plugin.md` 里，`[MITM]` 段的语法只有
`hostname=` 和 `h2=` 两种，**没有任何参数化机制**。
`[Argument]` 的 `switch` 只能挂在规则行的 `enable={}` 上，**挂不到 `[MITM]`**。

### 这意味着什么

| | 开关开着 | 开关关着 |
|---|---|---|
| `api.douban.com` 解密 | ✅（原版就要） | ✅ |
| `frodo.douban.com` 解密 | ✅ | ⚠️ **仍然解密** |
| 脚本执行 | ✅ | ❌ 不执行 |

**关掉开关省下的只是脚本执行，省不下那份 TLS 解密开销。**

所以本插件无法在「完全等同于原版」和「带搜索广告剥离」之间做到无损切换。
如果你需要那个「绝对干净」的版本，请用 [Douban-Dedup](../Douban-Dedup/)（纯移植版）。

### 做得到的部分

`block_search_ad` 挂在 `[Script]` 段的 `enable={}` 上。这一段有真机验证过的先例：
[Bilibili-Dedup](../Bilibili-Dedup/) 6 条、AdGuard-Spoof、AgentRouter 都在用。

反过来，`[URL Rewrite]` 段的 `enable=` **不要挂**——本仓库已实测它静默失效
（PinDuoDuo 曾给 20 多条 `[Rewrite]` 批量挂上，真机全部无效）。
所以本插件的开屏规则**没有开关**，要去开屏请直接注释掉那一行。
「写一个不生效的开关比不写更糟」——用户会以为它管用。

---

## 与 Douban-Dedup 的分工

两个插件**功能互补，但建议二选一**：

| | [Douban-Dedup](../Douban-Dedup/) | 本插件 |
|---|---|---|
| 开屏 | ✅ honue 原版规则 | ✅ 同一条，逐字相同 |
| 搜索页广告词 | ❌ | ✅ |
| MITM 域名 | `api.douban.com`（1 个） | `api.douban.com, frodo.douban.com`（2 个） |
| 解密范围 | 最小 | 多解密整个豆瓣业务 API |

⚠️ **不建议同时装两个** —— 开屏规则重复，MITM 也会叠加。

**选择依据**：如果 Douban-Dedup（纯移植）解决了你的主页加载问题，就用本插件换回搜索广告；
如果纯移植版仍然有问题，那问题不在本仓库，**本插件也别用**（它解密范围更大）。

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Douban-SearchAd/Douban-SearchAd.lpx
```

> ⚠️ CDN 缓存最长约 24h。拉不到时加随机参数：`?cb=2`

---

## 它做什么

抓包（豆瓣 7.135.0 / iPadOS 18.7.3，8 份 HAR）显示搜索广告都在接口响应体里：

```
/api/v2/search/found_words → { words:[...], top_word, cache_timeout }
/api/v2/search/hots        → { roofs:[...], ..., ad_info:{...} }
```

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
所以用 `http-response` **只删广告条目，其余原样返回**。

### `top_word` 只能整字段删除

它是搜索框滚动词，也是「搜索词投放」广告的落点。
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

⇒ 这是「搜索词投放」广告的固有做法：**刻意伪装成普通热搜**，协议层无解。
代价是搜索框不再显示滚动词，**搜索功能不受影响**。

### 脚本的三条保守原则

1. **只按 `layout` / `search_type` 删**，不按标题关键词 —— 广告词每天换
2. **任何解析异常一律放行原响应** —— 搜索功能比去广告重要
3. **删空数组时补占位条目** —— 避免 App 拿到空列表渲染异常

---

## ⚠️ 语法依据（v1.x 踩过的坑）

响应体改写只能写在 `[Script]` 段，依据官方手册
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
只支持 URL/Header 改写、302/307 与 5 种 reject）。v1.x 写过，真机一次没跑。

---

## 真机验证结果

装上后抓包（豆瓣 7.135.0）：

```
04:53:37.534  /api/v2/search/found_words  hdr=12 sz=1471
   顶层键: words, cache_timeout          ← top_word 已删
   words: 7 条, layout 全是 default       ← 广告已清

10:16:25.546  /api/v2/search/found_words  hdr=12 sz=1255
   words: 7 条, layout 全是 default
10:16:38.528  /api/v2/search/hots         hdr=12 sz=16545
   顶层键: roofs, subjects, top_groups,... ← ad_info 已删
   roofs: 1 条, layout=default            ← 占位生效
```

对比改动前：`hdr=13`（含 `content-encoding: gzip`）、体积 4600→1471、
`words[]` 含广告条目 → 全部清除，真实热搜 7 条完整保留。

---

## 已知问题

**「浏览几个个人主页/小组页后无法加载」这个问题没有解决。**

用户在 Douban-Dedup 的 v1.x–v2.0 上反复遇到这个现象，我两次归因
（`img*.doubanio.com`、HTTPDNS 规则）都被真机证伪。改回纯移植版（v3.0）后
尚未确认是否解决。

**本插件解密范围比 Douban-Dedup 更大**（多 `frodo.douban.com`），
所以如果纯移植版仍然有问题，本插件大概率也会。

**建议顺序**：先验证 Douban-Dedup v3.0（纯移植）能否解决；能解决再用本插件换回搜索广告。

---

## 文件 · Files

| 文件 | 用途 |
|---|---|
| [Douban-SearchAd.lpx](Douban-SearchAd.lpx) | 插件清单 |
| [src/douban-search-ad.js](src/douban-search-ad.js) | 广告剥离脚本 |
| [upstream-honue.plugin](upstream-honue.plugin) | honue 原件逐字节留存（SHA256 钉进测试） |
| [test/manifest.test.mjs](test/manifest.test.mjs) | 清单接线回归 |
| [test/script.test.mjs](test/script.test.mjs) | 脚本行为回归 |
| [test/fixtures/](test/fixtures/) | 真机响应固件（已脱敏） |

---

## 致谢 · Credits

- [honue/rules](https://github.com/honue/rules) —— 开屏规则的作者
