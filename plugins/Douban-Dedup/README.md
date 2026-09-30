# Douban-Dedup · 豆瓣去广告

> 豆瓣 App 去广告合并版。**去开屏 + 去信息流/横幅**，两处干扰可关。
> 在 [honue/rules](https://github.com/honue/rules) 与
> [shengrui123/douban-adblock](https://github.com/shengrui123/douban-adblock)
> 两家基础上，按 **2026-10-01 用户真机抓包**（豆瓣 7.135.0 / iPadOS 18.7.3 / 218 条请求）重写。

| | 中文 | English |
|---|---|---|
| 上游 A | [honue/rules](https://github.com/honue/rules) · `Douban.plugin` 480 B（原件逐字节留存于 `upstream-honue.plugin`） | honue/rules, 480 B, pristine copy kept |
| 上游 B | [shengrui123/douban-adblock](https://github.com/shengrui123/douban-adblock) · `Douban_AdBlock.plugin` 1552 B（原件留存于 `upstream-shengrui.plugin`） | shengrui123, 1552 B, pristine copy kept |
| 改动 | 清单层重写，**未改动上游任何一行 JavaScript**（两家原本都没有 JS） | Manifest rewritten; no upstream JS touched (neither had any) |
| 脚本 | 无（本插件不含任何 JavaScript） | None |
| 回归测试 | `test/manifest.test.mjs` —— 拿真机抓包的 218 条请求逐条回放 | Replays all 218 real captured requests |

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Douban-Dedup/Douban-Dedup.lpx
```

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。拉不到时在地址末尾加随机参数：`?cb=2`

---

## 🔴 安装前必读：必须删掉 App 重装

**只装插件不够。** 抓包显示豆瓣把开屏广告**缓存在本地**，`splash_preload` 的 POST 体里带着：

```
preload_ads = [{"uniq_id":"46ccd888...","is_valid":1,"is_exposed":"0",
                "price":"IUegRWldRk3eu-f_a5gtyg",
                "time_span":{"start":"1757433600000","end":"1798732740000"},
                "ad_type":"common","ad_id":"268225"}, ...]
```

这是**已经缓存好的广告对象**，带曝光标记和有效期。网络层拦接口拦不到它。

| 步骤 | 操作 |
|---|---|
| 1 | 更新并启用本插件 |
| 2 | **完整删除豆瓣 App** —— 不要选「保留 App 数据」的卸载方式 |
| 3 | 重新安装，首次启动 |

不做第 2 步，你看到的仍是本地缓存的旧开屏。

---

## 抓包证据 · What the capture showed

抓包文件 `shared-5E597331_214_1790793676708.har`（8.6 MB / 218 条 / 02:41:20–02:41:50），
压成 `test/fixtures/douban-7.135.0.har-urls.tsv` 入库。判定「是否被本地合成」的依据是
**响应头数量为 0 且状态码 404** —— 真实网络往返不可能在 9 ms 内完成。

### 关键发现 1：两个上游当时都装着，且都在生效

```
02:41:20.180  404  hdr=0  POST https://api.douban.com/v2/app_ads/splash_preload
02:41:25.183  404  hdr=0  POST https://api.douban.com/v2/app_ads/splash_preload   ← 相隔 5 秒重试
02:41:25.183  404  hdr=0  GET  img3.doubanio.com/view/dale-online/dale_ad/public/eba38c8e9667cf7.jpg
```

第一条是 honue 规则命中，第二条是 shengrui 规则命中。**两版规则同时作用于同一批请求。**

### 关键发现 2：两版作者都漏了 56 KB 的信息流广告

| 端点 | 次数 | 响应 | 两版是否覆盖 |
|---|---|---|---|
| `/api/v2/erebor/feed_ad` | 2 | **55958 / 59871 B** | ❌ ❌ |
| `/api/v2/movie/ad` | 3 | 4606 B（含 `"ad_expose_time_ms": 600`） | ❌ ❌ |
| `/api/v2/home_banner` | 1 | `{}` | ❌ ❌ |
| `/api/v2/home_ads` | 1 | `{"cache_duration": 7200}` | ❌ ❌ |

这四个都在 **`frodo.douban.com`**，而 honue 的 `[MITM]` 只有 `api.douban.com` —— 连解密都没做。

### 关键发现 3：`splash_show` 在 7.135.0 上是死规则

整个抓包里 `splash` 相关路径**只有 `splash_preload`**，从未出现 `splash_show`。
shengrui 插件里那条「展示阶段直接失败让 App 跳过」的规则，在当前版本上从不触发。
本版保留它，但标注为**跨版本兜底**，不是当前版本的有效规则。

### 关键发现 4：优量汇广告域名一次都没出现，HTTPDNS 却在狂跑

27 次 `http://119.29.29.90/d?dn=...` 全部 `200` 但 `size=0`（响应头只有
`Content-Length: 0` + `Proxy-Connection: close`，典型本地合成）→ shengrui 的 `IP-CIDR` 规则在拦。
而 `*qq.com` 请求数为 **0**，说明广告域名在解析阶段就被掐断了。

---

## 本版改了什么 · Changes

| # | 改动 | 依据 |
|---|---|---|
| 1 | `v2` → `v\d+` | honue 硬编码 `v2`，豆瓣升版即失效 |
| 2 | `splash_preload` 由 `reject` → `reject-dict` | honue 用 `reject` 返回空体，JSON 接口应返回 `{}` 防止反复重试 |
| 3 | **新增** `frodo.douban.com` 进 `[MITM]` + 4 条信息流规则 | 抓包实测 8 条请求、59 KB 广告数据，两版都漏 |
| 4 | 信息流规则放 `[Rule]` 的 `URL-REGEX` 而非 `[URL Rewrite]` | **只有 `[Rule]` 能挂 `enable=`**，见下方「开关」一节 |
| 5 | 新增 `block_feed_ad` / `block_httpdns` 两个开关 | shengrui 的腾讯段 REJECT 的是**公共域名**，会影响其它 App |
| 6 | `img*.doubanio.com` 精确到 `/view/dale-online/dale_ad/public/` | 抓包 76 张正常图零误伤 |
| 7 | 保留 `splash_show` 但注明是兜底 | 抓包证明当前版本不发 |

**没有动的**：honue 原文里那两条注释掉的规则。它们本来就是冗余的（第一条粗规则已覆盖），
本版不保留冗余行。

---

## 开关 · Switches

| 开关 | 默认 | 作用 | 关掉的后果 |
|---|---|---|---|
| `block_feed_ad` | 开 | 拦首页/影视页信息流与横幅 | 恢复信息流广告 |
| `block_httpdns` | 开 | 拦腾讯优量汇 HTTPDNS 旁路 | 优量汇广告可能复活 |

### ⚠️ `block_httpdns` 会影响其它 App

优量汇是**腾讯广告的公共 SDK**，本插件 REJECT 的是 `*.gdt.qq.com` / `*.gdtimg.com` 等域名。
开着时，**其它使用腾讯广告的 App 也加载不了它们的广告**。

只用豆瓣、不介意别的 App 少广告 → 保持默认开。
在意的话 → 关掉这个开关，代价是豆瓣的优量汇广告拦不干净。

### 关于 `enable=` 的可靠性

`[Rule]` 段挂 `enable={}` 在本仓库已有真机验证先例（AntiRevoke 17 条、PinDuoDuo 8 条）。
`[URL Rewrite]` 段则**没有** —— 本仓库曾给 `[Rewrite]` 批量挂 `enable=`，真机实测**全部静默失效**。

因此本版的分工是：

- **可关的部分全放 `[Rule]`**（信息流、腾讯）→ 挂在 `URL-REGEX` / `DOMAIN*` / `IP-CIDR` 上
- **不可关的部分放 `[URL Rewrite]`**（开屏接口、开屏素材）→ 无条件，这是插件的核心功能

`test/manifest.test.mjs` 里有**反向断言**钉死这一点：`[URL Rewrite]` 段一旦出现 `enable=` 就转红。

> 装好后请在 Loon 参数页确认两个开关**确实渲染出来了**。若不显示，说明 `[Argument]` 段没被识别。

---

## 误伤验证 · Regression against the real capture

`test/manifest.test.mjs` 把 218 条真实请求逐条喂给规则：

```
拦下 15 条 / 放过 203 条
```

| 检查项 | 结果 |
|---|---|
| 开屏接口 | 2 条全拦（`reject-dict`） |
| 广告素材图 | 5 张全拦（`reject`） |
| 信息流/横幅/影视页 | 8 条全拦 |
| **正常图片** | **76 / 76 全部放过，零误伤** |
| 正文接口 `elendil/recommend_feed` | 未拦 |
| 用户/影视/小组/搜索/通知 | 零拦截 |
| 埋点 `athena`、会员商品 `halfhill` | 未拦 |
| 跨版本 | `v3/app_ads/splash_preload` 同样命中 |

被拦的 15 条全部是广告，无一条业务请求。

---

## 文件 · Files

| 文件 | 用途 |
|---|---|
| [Douban-Dedup.lpx](Douban-Dedup.lpx) | 插件清单 |
| [upstream-honue.plugin](upstream-honue.plugin) | honue 原件，逐字节留存 |
| [upstream-shengrui.plugin](upstream-shengrui.plugin) | shengrui 原件，逐字节留存 |
| [test/manifest.test.mjs](test/manifest.test.mjs) | 回归测试（`node test/manifest.test.mjs`） |
| [test/fixtures/douban-7.135.0.har-urls.tsv](test/fixtures/douban-7.135.0.har-urls.tsv) | 抓包固件 218 行 |
| [icon.png](icon.png) | 图标（取自 honue 仓库） |

---

## 致谢 · Credits

- [honue/rules](https://github.com/honue/rules) —— 原始思路与首条规则
- [shengrui123/douban-adblock](https://github.com/shengrui123/douban-adblock) —— 素材图规则与 HTTPDNS 拦截

本版是这两者的合并与重写，改动依据全部来自上文的真机抓包。
