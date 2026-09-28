# YouTube-Dedup · 哔哩哔哩同源去重版

> 消除与 blockAds 的重复改写，收敛 MitM 范围；v5.1 修 config 解析崩溃，v5.2 清除首页「游戏大本营」，
> v5.4 修好了让 v5.2 一直没生效的那个 bug：Loon 的 Script 是 first-match-wins。
> Dedupe against blockAds; v5.1 fixes a config parse crash, v5.2 drops the Gaming Hub module,
> v5.4 fixes why v5.2 never actually ran.

**v5.7.0** · 3 个变体 · 3 variants

---

## ⚠️ 如果「游戏大本营」怎么都删不掉

**多半是 `blockAds` 合集的 YouTube 规则排在了本插件前面。**

合集里有一条同源的 `http-response`，命中 `browse|next|player|...` —— 和本插件完全同一批 URL。
Loon 的 `[Script]` 是 **first-match-wins**，谁在前谁赢，后一条永不执行。
合集赢的时候：游戏大本营删不掉，但去广告照常工作（合集自己在做），所以「其他功能都正常」，
极具迷惑性 —— 2026-09-29 就这么排查了五轮。

**已经并进仓库了。** 从 v5.6 起，[BlockAds-Patched](../BlockAds-Patched/)
会把合集里的 YouTube 部分一并退场（脚本规则 + `initplayback` 拦截 + 死开关 `youtube_enable`），
由 GitHub Actions 每 6 小时自动同步重施。改用那个订阅地址即可，
**不用再手动去合集里关开关**。

补丁器带自检：产物里只要还剩未注释的 YouTube 脚本/复写规则就直接报错退出，
自动同步的 Action 随之变红，不会把坏产物推上去。

---

## v5.7.0：合集退场后广告反弹，补上广告判据

2026-09-29 07:31 的抓包证实：合集 YouTube 规则退场后**首页广告暴涨**。
那些广告是**整段的 feed section**（140~180 KB，含 `pagead` 与「赞助」标签，每段 3 条广告素材），
而 `browse/next` 当时只由「清游戏大本营」的脚本处理，它不删广告 —— 全部漏网。

自研脚本现在同时清两样，两类判据**共用开头那一遍扫描**（`hitPanel` / `hitAd` 两个有序数组），
所以加广告判据几乎不花时间：

| 判据 | 内容 | 开关 |
|---|---|---|
| 游戏大本营 | `mini_app_panel` / `FEmini_apps_saved` | `blockGaming`（默认开） |
| 信息流广告 | `pagead`（与上游 `ni()` 同一个）/ EML 名 `inline_injection_entrypoint_layout` | `blockAds`（默认开） |

**判据精度（实测）**：广告段 `赞助`×3、`/vi/` 0~1 个（那是广告素材自己的 ID）；
正常段 `赞助`×0、`/vi/` 15 个。`pagead` 在前六份抓包里一次都没出现过。

七份抓包共 68 条 `browse/next` 全部重跑：`pagead`+`赞助` 出现次数 **73 → 25**，
上游脚本能解析全部 68 条输出。回归测试 31 例。

### 删掉了一版规则：Shorts 过滤

中途试过把上游的 Shorts 过滤（EML 名匹配 `/shorts(?!_pivot_item)/`）也补进来。
**实测它把正常视频卡也删了** —— 从 EML 名字节往回反查 64 字节太松，会撞上普通卡片里
恰好列出的模板名。已经整条删掉。宁可少删，不可误伤。

### 还没覆盖：`next`（信息流续页）里的广告

那里的广告不是「重复列表项」，而是**单例**顶层字段（每条 `next` 响应 2 个，字段号 14/15，
里面各塞 3~5 条广告素材）。现有判据只删重复元素，够不着。
这 5 条 `next` 响应里 39 处判据未被清除。要做需要单独处理单例容器，
风险是误删同一容器里的正常内容，不在本次范围。

---

## v5.5.0：脚本自己跑不完，等于规则没生效

连续几轮「改了还是不行」，最后一层原因在脚本本身。

v5.2~v5.4 的 `feed-gaming.js` 是「每进入一层嵌套，就用 `contains()` 把这段字节全量扫一遍」。
一次首页响应有约 8 层单例嵌套、每层都是 MB 量级，同一批字节在每层被重扫 4 遍。
**在用户真机那份 2919476 B 的首页响应上实测：跑满 60 秒仍未结束** —— 远超 Loon 的
10 秒脚本超时，脚本被杀掉，响应原样放行，模块自然还在。

现在改成三件事：

1. 开头做**一遍**扫描，把判据串的命中位置记成有序数组 —— 整条响应只扫一遍
2. 遍历时「这段里一处判据都没有」就整棵子树跳过，不再 parse
3. 重建用 `subarray` + `set`（memcpy），不再 `out.push(b[i])` 逐字节推

同一份 2919476 B 响应：**>60 s（超时）→ 11 s**。

> 那 11 s 是在一个被限速的沙盒里测的 —— 那边跑一个 2.4 M 次的空循环要 7.3 s，
> 比真机慢两到三个数量级。真机上就是一次线性扫描的量级。

三份抓包共 33 条 `browse/next` 全部重跑：8 条改写、25 条逐字节未动；
改写后 `mini_app_panel` / `FEmini_apps_saved` 归零；`/vi/` 计数全部不变
（52→52、49→49、55→55、270→270、519→519 …）；上游脚本能解析全部 33 条输出。回归测试 29 例。

### 会员试用弹窗：不是回归，这次没做

`premium_upsell` 只出现在 `youtubei/v1/get_watch`（每条 2~3 处），**不在信息流里**。
它在第二、三份抓包里就有（9 处 / 6 处），这次是 17 处 —— 是 A/B 实验投放变多，
**不是 v5.4 改动引起的回归**；上游去广告脚本从来也不处理会员推销。

试过用同一个判据方案删它：标识能扫到，但它不在任何「重复列表项」里，按现有删除规则够不着。
要做需要单独定位推销弹窗的渲染器，超出本次范围。

## v5.4.0：为什么 v5.2 一直没生效

用户反馈「游戏大本营还是没有去处」。查下来不是代码不对，是**规则根本没被调用**。

**Loon 的 `[Script]` 是 first-match-wins**：同一个 URL 只执行第一条完整命中的 `http-response` 规则，
后面的不再执行，也不会把前一条的输出喂给后一条。官方新版 Script 文档
（<https://loon0x00.github.io/docs/Script/script_v2>）写得很明确：

> Response Script … 始终按照原配置顺序选择**第一条最终条件为 true 的规则**
> Request 和 Response 分别最多选择一条

**链式执行只存在于 `[Rewrite]`**（3.2.3 起专门加的特性），脚本从来没有这个特性。
搜索引擎上「Loon 多条脚本按顺序依次执行」的说法，是把 Rewrite 的语义错套到了 Script 上。

v5.2 把「清除游戏大本营」排在去广告规则**后面**，两条正则都匹配 `browse|next` → 后一条从未执行。
本版把它提到**最前**，并从上游规则里移除 `browse|next`。

### 一个附带的好处：这一版不再依赖「到底是哪种语义」

新版 Script 文档写死了第一条命中，但**旧语法页面对此没有明文**（只对 `network-changed` 写过
「有多个这种类型的脚本，只会调用配置文件中的第一个」）。而 v5.4 的三条 `http-response` 规则
按 URL 完全互斥：

| 端点 | 规则 | 脚本 |
|---|---|---|
| `browse` `next` | 1 | `feed-gaming.js`（自研） |
| `player` `search` `reel_watch_sequence` `guide` `account/get_setting` `get_watch` | 2 | 上游 `youtube.response.js` |
| `config` | 3 | `config-onesie.js`（自研） |

用三份真机抓包共 16 条真实 URL 逐条核对：**重叠 0**。
所以无论 Loon 走「第一条命中」还是「全部执行」，v5.4 的结果完全一样 ——
不再把正确性押在一条只有新版文档写死的语义上。

### 代价（如实说明）

`browse/next` 不再走上游脚本，于是丢掉了上游在信息流上的 **Shorts 过滤**
（`Fi()` 里的 `/shorts(?!_pivot_item)/`）。`player` / `search` / `guide` /
`account/get_setting` / `get_watch` / `reel_watch_sequence` 仍然走上游脚本，去广告不受影响。

上游另外两条信息流判据（未知字段含 `pagead`、EML 名为 `inline_injection_entrypoint_layout`）
在三份真机抓包共 25 条 `browse/next` 里一次都没出现过，上游自己也一次都没改过信息流响应 ——
丢不丢没有实际区别。

### 还没做完：把 Shorts 过滤补回来自研脚本

已经写出来并**验证正确**（三份抓包 25 条：游戏面板清零、`/vi/` 计数全部不变、
上游脚本能解析全部输出），但 1.2 MB 以上的响应要 5~40 秒，**远超 Loon 的 10 秒脚本超时**，
所以没有发出来。慢的原因是「每层嵌套都把这批字节重新扫一遍」，而信息流有约 8 层单例嵌套。
方向已经明确：开头做一遍扫描把判据命中位置建成有序索引，之后每次判定走二分查找。

## v5.3.0：给「清除游戏大本营」加诊断

**为什么要加**：2026-09-29 04:13 的第三份抓包里，游戏大本营仍然存在。逐条核对后确认 ——
**那份抓包是在 v5.2 推送后第 2 分钟导出的**（v5.2 commit 时间 `04:11:10`，抓包覆盖 `04:13:28`–`04:14:49`），
设备上跑的还是没有这条规则的旧插件；再加上 `raw.githubusercontent` 的 CDN 缓存最长 24 小时。
把那份抓包的 13 条 browse 响应逐条喂给当前脚本离线重跑：4 条改写、9 条逐字节不动，
视频条目数完全一致，上游脚本能解析全部输出 —— **代码本身没问题，是版本没换上**。

但「规则没跑」和「规则跑了却没删掉」在外面看一模一样，只能靠猜。所以加了诊断：

| 开关 `debug` 打开后下拉刷新首页 | 含义 |
|---|---|
| `游戏大本营 · done` | 规则在跑，删掉了 N 项 / M 字节 |
| `游戏大本营 · clean` | 规则在跑，这条响应里本来就没有 |
| `游戏大本营 · nomatch` | 看到标识但没能整项删除 → 结构变了，需要重新定位 |
| `游戏大本营 · off` | `blockGaming` 被关掉了 |
| **完全没有通知** | **规则没被执行** → 插件是旧版本，或同一 URL 上有更靠前的规则抢先 |

---

## v5.2.0：清除首页「游戏大本营」

依据：2026-09-29 第二份真机 Loon 抓包（253 条，03:13:14–03:14:25，含 `player` 响应）。
回归测试 `node test/feed-gaming.test.mjs`（29 例全过）。

首页（`browseId=FEwhat_to_watch`）会插一个 **61342 字节**的「YouTube 游戏大本营」模块。
它不是视频，而是 YouTube 的 **mini app（EML 渲染）面板**；另有一个 `browseId=FEmini_app_destination`
的游戏货架页，里面是 60 张游戏卡。

新脚本 `src/feed-gaming.js` 挂在 `browse|next` 上，**不认任何 protobuf schema**，只认「结构 + 内容」：

1. 自上而下遍历；「同一父消息里出现 ≥2 次的字段号」的元素 = 列表里的一项
   （feed 卡片 / 货架格子 / section）
2. 该元素内容里出现 marker → 整项删掉
3. 删空后父消息若也不剩内容，一并收敛

| 响应 | 大小 | 删掉 | 保留 |
|---|---|---|---|
| `browse` 首页（HAR2 #240） | 399608 B | 游戏面板 61372 B | 52 个视频条目**一个不少** |
| `browse` 首页续页（#33） | 224289 B | 61342 B | 49 个视频条目 |
| `browse` 游戏货架页（#15） | 587223 B | 570257 B | —（整页都是游戏） |
| 其余 21 条 browse/next/get_watch/player/reel/guide | — | **0** | 逐字节未动 |

第三份抓包（HAR3，13 条 browse）重跑同样通过：4 条改写、9 条逐字节不动，
`/vi/` 计数全部保持（55→55、49→49、96→96、270→270、519→519 …）。

### 清除之后**故意保留**的那一项

HAR3 里，清除后仍会剩下一个元素，它的模板清单长这样：

```
chip_bar_collection_with_controller.eml-fe
mini_app_game_info.eml-fe
mini_app_splash_screen.eml-fe
%mini_game_card.eml-fe|998e208b2b3ddc1
*more_drawer_button.eml-fe|f8bc3d9f67dab8ec
7channel_action_buttons_phone.eml-js-fe
```

**它是一个普通视频卡**，只是这张卡的模板清单里恰好列了游戏相关模板。
拿 `mini_game_card` 当 marker 就会把它删掉 —— 那等于从首页拿掉一个正常视频。
这条已写成回归测试（`误伤防护：只带游戏模板名的普通视频卡必须保留`）。

### marker 选型（做过精度评估，结论是只用最保守的两个）

| 候选 | 命中 | 连带误删 |
|---|---|---|
| `mini_app_panel` / `FEmini_apps_saved` | 每次恰好 1 个元素，就是面板本身 | **无** |
| `mini_game_card` | 多命中 | `error_message` 占位卡；极端情况连带 `channel_action_buttons`（**订阅按钮**） |
| `FEmini_app_destination` / `FEmini_app` | 多命中 | `more_drawer_button`（**更多按钮**） |
| `playables_` | 命中 get_watch 等无关响应 | 误伤面太大 |
| `游戏大本营`（本地化文案） | — | **绝不使用**：正常视频标题里可能出现 |

### 开关

`[Argument] blockGaming`，**默认开**。关掉后脚本对任何响应都是逐字节原样放行（有测试钉死）。

> 该规则写在去广告规则**之后**。Loon 会按书写顺序依次执行匹配的规则（后一条拿到前一条的输出），
> 所以顺序颠倒也能工作；但这样排，万一 Loon 只跑第一条，受影响的也只是游戏模块，去广告不会失效。

---

## v5.1.0 改了什么

依据：2026-09-29 第一份真机 Loon 抓包（YouTube 21.39.4 / iPadOS 18.7.3，冷启动 64 条，02:45:52–02:45:58）。
复现材料在 `test/fixtures/`，回归测试 `node test/config-onesie.test.mjs`（16 例全过）。

| # | 现象（抓包证据） | 原因 | 处理 |
|---|---|---|---|
| 1 | `youtubei/v1/config` 响应（80364 B）解析必崩，`TypeError: The encoded data was not valid for encoding utf-8` | 上游给 `GlobalConfigGroup.coldConfigGroup` 写的是**空 schema**，其 `internalBinaryRead` 直接 `return`、一字节不消费。YouTube 现在必定下发该字段（实测 42 KB），reader 整体错位，随后把一个 298 字节的嵌套 protobuf 当成 field 4 的 string 解码 | config 端点改由本仓库 `src/config-onesie.js` 处理，沿固定字段路径取密钥，不改响应体 |
| 2 | 崩溃的连带后果：UMP onesie 的 `clientKey`/`encryptKey` 永远采集不到，于是 `*_request.js` 每次 `log_event` 都要**删掉** `x-youtube-hot-hash-data` 头 | 同上，config 处理器根本跑不到 | 同上；修复后该请求头被保留 |
| 3 | `youtubei/v1/log_event` 响应是 `content-type: image/gif`、42 字节 `GIF89a` | 上游把 `log_event` 和 `config` 映射到同一个 `Config` 消息类型；GIF 首字节 `0x47` = tag(field 8 / wire 7)，必然抛 `illegal tag` | 从 **http-response** 正则里删掉 `log_event`（onesie 密钥只存在于 config 响应，log_event 响应从来给不出它）。**http-request 的 log_event 规则保留** |
| 4 | 每次启动都发 `www.google.com/ads/on-device/{clicks,conversions}`（`api_version=3&oda_eid=0.0.0`） | 插件完全没覆盖 | **不内置**，见下方「可选」 |

`config-onesie.js` 与上游 `ri()` 处理器行为等价：相同则不写、只更新变化的一侧、Music UA 写
`youtubeMusic` 键、保留另一平台已存的密钥。测试用「打了补丁的上游脚本在同一份 fixture 上的输出」当真值比对。

---

## 抓包里出现、但**故意不拦**的端点

上游脚本内部用 `url.includes(path)` 匹配端点，它的表只有：
`browse / next / player / search / reel_watch_sequence / guide / get_setting / get_watch / config / log_event`。

| 端点 | 抓包次数 | 不拦的原因 |
|---|---|---|
| `youtubei/v1/att/get` | 3 | 不在表里，拦了只会不停弹「脚本需要更新」 |
| `youtubei/v1/mdx/handoff` | 1 | 同上 |
| `youtubei/v1/notification_registration/set_registration` | 1 | 同上 |
| `youtubei/v1/notification_registration/get_settings` | 1 | ⚠️ URL 含子串 `get_setting`，拦了会被误判成 `youtube.response.setting.Setting` 并**改写响应体**。正则里的 `account\/get_setting` 正是挡住它的锚点，**不要放宽** |
| `youtubei.googleapis.com/generate_204` | 1 | HEAD 连通性探测，拦了会误判断网 |
| `redirector.googlevideo.com/initplayback` | 1 | 推荐版不解密 googlevideo |
| `s.youtube.com/api/stats/{qoe,watchtime}` | 4 | 播放质量/观看时长上报，非广告 |

---

## 可选：拦掉广告归因埋点

Loon 的 `[Rewrite]` **只对 http 和已解密的 https 生效**，而 `www.google.com` 不在本插件的 MitM 列表里。
若你的主配置**已经**解密了 `*.google.com`，可在主配置的 `[Rewrite]` 里加：

```
^https:\/\/www\.google\.com\/ads\/on-device\/(clicks|conversions) reject-dict
```

为此把 `www.google.com` 加进 MitM 并不划算（要解密整个 Google 主域），故插件不内置。

---

## 适用场景 · Use case

同时启用 `blockAds` 与本插件会导致 YouTube 响应被改写两遍。
Use both blockAds and this plugin → the YouTube response is rewritten twice.

---

## 冲突分析 · Conflict analysis

| # | 冲突 | 说明 |
|---|---|---|
| 1 | **同一份脚本跑两遍** | blockAds 内置 Maasea 的 `youtube.response.js`，与 kelee 的版本**字节级相同**（Build 注释后逐字节一致） |
| 2 | **`initplayback` 被无条件拦截** | blockAds 有一条 `reject` 规则，**无 `enable` 保护**，会拦掉字幕翻译所依赖的端点 |
| 3 | **`*.youtube.com` 被解密** | 字幕翻译插件声明解密主域，每个静态资源多一次 TLS 握手 |

---

## 改动对照 · What changed

| | 原版 v5.0.0 | 本插件 v5.4.0 |
|---|---|---|
| `[MitM]` | `*.googlevideo.com` + `youtubei.googleapis.com` | 仅 `youtubei.googleapis.com` |
| `captionLang` | 6 个选项 | **移除**（依赖被拦截的 initplayback） |
| `googlevideo` 规则 | 有 | **移除**（仅 Debug 变体保留） |
| config 端点 | 交给上游脚本 → **解析崩溃** | 本仓库 `src/config-onesie.js` → 正常采集密钥 |
| http-response 覆盖端点 | 含 `log_event`（实为 GIF，必崩） | 已移除 |
| 覆盖端点 | 含 `log_event` / `config` | `browse` `next`（自研）+ `player` `search` `reel_watch_sequence` `guide` `account/get_setting` `get_watch`（上游）+ `config`（自研） |
| 信息流 Shorts 过滤 | 由上游脚本负责 | **暂无**（见「代价」） |
| 游戏大本营 | 无处理 | **`blockGaming` 开关，默认开** |
| 去广告 / 画中画 / 后台播放 | ✅ | ✅ **完整保留** |

---

## 文件 · Files

| 文件 | 用途 | Purpose |
|---|---|---|
| `YouTube-Dedup.lpx` | **推荐** | 仅解密 youtubei |
| `YouTube-Dedup-Slim.lpx` | 保留 captionLang | 供不装合集的用户 |
| `YouTube-Dedup-Debug.lpx` | 完整功能 + debug 默认开 | Full + debug on |
| `src/config-onesie.js` | v5.1 新增，自研 | 从 config 响应采集 UMP onesie 密钥 |
| `src/feed-gaming.js` | v5.2 新增，自研 | 清除首页「游戏大本营」模块 |
| `test/config-onesie.test.mjs` | v5.1 新增 | 16 例回归测试 |
| `test/feed-gaming.test.mjs` | v5.2 新增 | 22 例回归测试 |
| `test/fixtures/config-response.bin` | 抓包响应体 | 80364 B，已确认不含任何令牌 |
| `test/fixtures/log_event-response.bin` | 抓包响应体 | 42 B GIF89a |
| `test/fixtures/feed-with-gaming.bin` | 抓包响应体 | 81588 B，3 个真实 feed section（1 个游戏面板 + 2 个普通视频） |

---

## 安装 · Install

1. 导入对应 `.lpx`
2. 确认 **MitM over HTTP/2** 与 **QUIC 回退保护** 已开启
3. 字幕交由 YouTube 双语翻译插件处理（不使用 googlevideo）
4. 重启 Loon

> 脚本托管在 `raw.githubusercontent.com`，CDN 缓存约 24h。拉不到时在 URL 后加 `?cb=2`。

---

## ⚠️ 已知限制

- YouTube **PO Token** 机制：player 接口对未完成 BotGuard 挑战的客户端返回
  `400 FAILED_PRECONDITION`，属服务端要求，**脚本层无解**
- 完整约 60 个标签页类的配置走 App 内原生功能，脚本只能提供常用项
- 「游戏大本营」只在 `browse` / `next` 上拦。若 YouTube 把它塞进别的端点（例如 `guide` 侧边栏），
  当前规则不会命中 —— 判据是内容标识，届时脚本会自动跟上，无需改清单
- **Debug 变体**的 `initplayback` 规则依赖 v5.1 修复后采集到的 onesie 密钥；
  密钥命中时会把 UMP 请求重定向到 `https://init-stream.maasea.workers.dev/`（第三方）。
  推荐版不含该规则，不涉及

---

## 致谢 · Credits

- **Maasea** <https://github.com/Maasea> — 脚本作者
- **VirgilClyne**、**Choler**、**DivineEngine**、**app2smile** — 改进
- 上游分发 <https://kelee.one/>

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.

`src/config-onesie.js` 与 `src/feed-gaming.js` 均为本仓库自研：前者只按公开可观测的 protobuf 字段编号
取密钥，后者只按「结构 + 内容」删列表项，都不含上游代码，许可同本仓库 LICENSE。

`test/fixtures/*.bin` 是抓包响应体，已逐字节确认不含 `ya29` / `Bearer` / `AIza` / visitor-id。
