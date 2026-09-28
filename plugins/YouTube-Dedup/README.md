# YouTube-Dedup · 哔哩哔哩同源去重版

> 消除与 blockAds 的重复改写，收敛 MitM 范围；v5.1 起按真机抓包修 config 解析崩溃，v5.2 起清除首页「游戏大本营」。
> Removes duplicated rewrites against blockAds; v5.1 fixes a config parse crash, v5.2 drops the Gaming Hub module.

**v5.2.0** · 3 个变体 · 3 variants

---

## v5.2.0：清除首页「游戏大本营」

依据：2026-09-29 第二份真机 Loon 抓包（253 条，03:13:14–03:14:25，含 `player` 响应）。
回归测试 `node test/feed-gaming.test.mjs`（22 例全过）。

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

| | 原版 v5.0.0 | 本插件 v5.2.0 |
|---|---|---|
| `[MitM]` | `*.googlevideo.com` + `youtubei.googleapis.com` | 仅 `youtubei.googleapis.com` |
| `captionLang` | 6 个选项 | **移除**（依赖被拦截的 initplayback） |
| `googlevideo` 规则 | 有 | **移除**（仅 Debug 变体保留） |
| config 端点 | 交给上游脚本 → **解析崩溃** | 本仓库 `src/config-onesie.js` → 正常采集密钥 |
| http-response 覆盖端点 | 含 `log_event`（实为 GIF，必崩） | 已移除 |
| 覆盖端点 | 含 `log_event` / `config` | `browse` `next` `player` `search` `reel_watch_sequence` `guide` `account/get_setting` `get_watch` + `config`（自研脚本） |
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
