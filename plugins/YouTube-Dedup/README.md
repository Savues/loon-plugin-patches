# YouTube-Dedup · 哔哩哔哩同源去重版

> 消除与 blockAds 的重复改写，收敛 MitM 范围；v5.1 起按真机抓包修复 config 端点解析崩溃。
> Removes duplicated rewrites against blockAds; v5.1 fixes a config-endpoint parse crash found in a real capture.

**v5.1.0** · 3 个变体 · 3 variants

> v5.2～v6.0 曾加入首页「游戏大本营」/ 信息流广告过滤与一批清单改动，已于 2026-09-29 整体回退到 v5.1。
> 那些代码仍留在 git 历史（`c2fd147` 及更早），需要时按提交取回即可。
> 仓库里现存的 `src/feed-gaming.js` 与其测试已无任何规则引用，属回退残留。

---

## v5.1.0 改了什么

依据：2026-09-29 用户真机 Loon 抓包（YouTube 21.39.4 / iPadOS 18.7.3，冷启动 64 条，02:45:52–02:45:58）。
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

| | 原版 v5.0.0 | 本插件 v5.1.0 |
|---|---|---|
| `[MitM]` | `*.googlevideo.com` + `youtubei.googleapis.com` | 仅 `youtubei.googleapis.com` |
| `captionLang` | 6 个选项 | **移除**（依赖被拦截的 initplayback） |
| `googlevideo` 规则 | 有 | **移除**（仅 Debug 变体保留） |
| config 端点 | 交给上游脚本 → **解析崩溃** | 本仓库 `src/config-onesie.js` → 正常采集密钥 |
| http-response 覆盖端点 | 含 `log_event`（实为 GIF，必崩） | 已移除 |
| 覆盖端点 | 含 `log_event` / `config` | `browse` `next` `player` `search` `reel_watch_sequence` `guide` `account/get_setting` `get_watch` + `config`（自研脚本） |
| 去广告 / 画中画 / 后台播放 | ✅ | ✅ **完整保留** |

---

## 文件 · Files

| 文件 | 用途 | Purpose |
|---|---|---|
| `YouTube-Dedup.lpx` | **推荐** | 仅解密 youtubei。⚠️ 与 `BlockAds-Patched` 的 YouTube 规则命中同一批 URL，Loon 是 first-match-wins，**同一时间只启用一个** |
| `YouTube-Dedup-Slim.lpx` | 保留 captionLang | 供不装合集的用户 |
| `YouTube-Dedup-Debug.lpx` | 完整功能 + debug 默认开 | Full + debug on |
| `src/config-onesie.js` | v5.1 新增，自研 | 从 config 响应采集 UMP onesie 密钥 |
| `test/config-onesie.test.mjs` | v5.1 新增 | 16 例回归测试，跑 `node test/config-onesie.test.mjs` |
| `test/fixtures/config-response.bin` | 抓包响应体 | 80364 B，已确认不含任何令牌 |
| `test/fixtures/log_event-response.bin` | 抓包响应体 | 42 B GIF89a |

---

## ⚠️ 和 BlockAds-Patched 只能二选一

`BlockAds-Patched` 里**保留了 730 的 YouTube 规则**（`youtube.response.js` + `youtube_enable` 开关 +
`initplayback` 拦截 + `rr*.googlevideo.com`），它命中的 URL 与本插件**完全重叠**：
`browse` `next` `player` `search` `reel_watch_sequence` `guide` `account/get_setting` `get_watch`。

而 Loon 的 `[Script]` 是 **first-match-wins** —— 同一个 URL 只执行第一条完整命中的规则。
**两个插件同时开，只有排在前面的那个会跑。**

| 你想要 | 用哪个 |
|---|---|
| 播放器广告清干净（2026-09-29 验证过这套没有广告） | **BlockAds-Patched**（730 的 YouTube 规则） |
| Shorts / 上传按钮 / 选段按钮隐藏 | **本插件**（v5.1 已不含首页广告与游戏大本营过滤） |

---

## 安装 · Install

1. 导入对应 `.lpx`
2. **若同时装了 `BlockAds-Patched`，按上表二选一**
3. 确认 **MitM over HTTP/2** 与 **QUIC 回退保护** 已开启
4. 字幕交由 YouTube 双语翻译插件处理
5. 重启 Loon

> 脚本托管在 `raw.githubusercontent.com`，CDN 缓存约 24h。拉不到时在 URL 后加 `?cb=2`。

---

## ⚠️ 已知限制

- YouTube **PO Token** 机制：player 接口对未完成 BotGuard 挑战的客户端返回
  `400 FAILED_PRECONDITION`，属服务端要求，**脚本层无解**
- 完整约 60 个标签页类的配置走 App 内原生功能，脚本只能提供常用项
- 本次抓包是**冷启动**，没有 `player` 响应，因此**播放页广告未被本次验证覆盖**；
  覆盖到的只有 `browse` / `config` / `guide` / `account/get_setting` 四类

---

## 致谢 · Credits

- **Maasea** <https://github.com/Maasea> — 脚本作者
- **VirgilClyne**、**Choler**、**DivineEngine**、**app2smile** — 改进
- 上游分发 <https://kelee.one/>

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.

`src/config-onesie.js` 为本仓库自研，参照的是 YouTube inner tube 协议公开可观测的字段编号，
不含上游代码，许可同本仓库 LICENSE。
