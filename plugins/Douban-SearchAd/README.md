# Douban-SearchAd · 豆瓣搜索页广告词屏蔽

> 只做一件事：剥掉搜索框滚动广告与「发现」横滚标签里的预制广告词。
> 开屏拦截沿用 [honue/rules](https://github.com/honue/rules) 原版那条规则，逐字未改。

## 订阅

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Douban-SearchAd/Douban-SearchAd.lpx
```

> CDN 缓存最长约 24h。拉不到时加随机参数：`?cb=2`

---

## ⚠️ 这个开关不是「绝对」的

Loon 的 `[MITM]` 段没有参数化机制（官方手册 `docs/cn/plugin.md` 只有 `hostname=` 和 `h2=`），
`[Argument]` 的 `switch` 挂不到 `[MITM]`。

| | 开关开 | 开关关 |
|---|---|---|
| `frodo.douban.com` 解密 | ✅ | ⚠️ **仍然解密** |
| 脚本执行 | ✅ | ❌ |

关掉开关省下的只是脚本执行，省不下 TLS 开销。**想要「绝对干净」的版本用
[Douban-Dedup](../Douban-Dedup/)**（honue 原版纯移植，MITM 只有 1 个域名）。

开屏那条规则**没有开关** —— `[URL Rewrite]` 尾部的 `enable=` 在本仓库已实测静默失效。
要去开屏请直接注释掉那一行。

---

## 与 Douban-Dedup 二选一

| | [Douban-Dedup](../Douban-Dedup/) | 本插件 |
|---|---|---|
| 开屏 | ✅ | ✅ 同一条，逐字相同 |
| 搜索页广告词 | ❌ | ✅ |
| MITM 域名 | 1 个 | 2 个（+`frodo`） |

⚠️ 不要同时装（规则重复、MITM 叠加）。

---

## 它做什么

抓包（豆瓣 7.135.0，8 份 HAR）显示搜索广告都在接口响应体里：

```
/api/v2/search/found_words → { words:[...], top_word, cache_timeout }
/api/v2/search/hots        → { roofs:[...], ..., ad_info:{...} }
```

广告与真实热搜混在同一个数组里，靠字段区分：

| 位置 | 广告条目 | 正常条目 |
|---|---|---|
| `words[]` | `layout:"ad" search_type:"ad_link"` | `layout:"default" search_type:"all"` |
| `roofs[]` | `layout:"ad"` | — |
| `ad_info` | `ad_type:"fake"` `unit_name:"dale_app_search_hots_page"` `sdk_type:"pangolinSDK"` | — |

不能直接 reject 这两个端点 —— 真实热搜在里面，拦掉等于搜索联想报废。
所以用 `http-response` 只删广告条目。

### `top_word` 为什么只能整字段删

它是搜索框滚动词，也是「搜索词投放」广告的落点，但**与真实热搜完全同形**。
跨 8 份抓包 12 个不同的 `top_word`，没有一个带广告标记：

| `top_word` | 实际 |
|---|---|
| 《沙丘3》确认引进 | 🔴 广告 |
| 女生独闯肯尼亚safari | 🔴 广告 |
| **《Girls》主创Lena Dunham代孕** | ✅ **明显是真热搜** |

三个判据全部失效：`layout`/`search_type` 无差别；URI 的话题 `#xxx#` 形式正常热搜也在用；
含英文字母的那个反而是真的。这是该类广告的固有做法——**刻意伪装成普通热搜**。

代价：搜索框不再显示滚动词，**搜索功能不受影响**。

---

## 语法依据

响应体改写只能写在 `[Script]` 段（[`docs/cn/script.md`](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/script.md)）：

```ini
http-response ^...$ script-path=..., requires-body=true, timeout=10, enable={block_search_ad}
```

`requires-body=true` 是硬性要求，漏掉它 `$response.body` 恒为 `undefined`。
手册还保证 `$done({body})` 会自动重算 `content-length` 与 `content-encoding`，gzip 不用管。

`[URL Rewrite]` **没有** `script-response-body` 语法（[`docs/cn/rewrite.md`](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/rewrite.md)）——
v1.x 写过，真机一次没跑。

---

## 真机验证

```
04:53:37.534  /api/v2/search/found_words  hdr=12 sz=1471
   顶层键: words, cache_timeout          ← top_word 已删
   words: 7 条, layout 全是 default       ← 广告已清，真实热搜保留
```

改动前 `hdr=13`（含 `content-encoding: gzip`）、体积 4600→1471。

---

## 已知问题

**「浏览几个个人主页/小组页后无法加载」这个问题没有解决。**
本插件解密范围比 Douban-Dedup 更大（多 `frodo.douban.com`），
所以纯移植版若仍有问题，本插件大概率也会。

**建议顺序**：先验证 Douban-Dedup（纯移植）能否解决；能解决再用本插件换回搜索广告。

---

## 文件

| 文件 | 用途 |
|---|---|
| [Douban-SearchAd.lpx](Douban-SearchAd.lpx) | 插件清单 |
| [src/douban-search-ad.js](src/douban-search-ad.js) | 广告剥离脚本 |
| [test/manifest.test.mjs](test/manifest.test.mjs) | 清单接线回归 |
| [test/script.test.mjs](test/script.test.mjs) | 脚本行为回归 |
| [test/fixtures/](test/fixtures/) | 真机响应固件（已脱敏） |
| 上游原件 | [`../Douban-Dedup/upstream-honue.plugin`](../Douban-Dedup/upstream-honue.plugin)（两个插件共用一份） |

## 致谢

[honue/rules](https://github.com/honue/rules) —— 开屏规则的作者。
战史（三次返工的经过）记在仓库根 README，本文件不重复。
