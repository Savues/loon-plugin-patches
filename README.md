# Loon 插件修改合集 · Loon Plugin Patches

> 个人使用的 Loon 插件修改版合集。
> A personal collection of patched Loon plugins.

修改范围以**清单层**为主 —— MitM 域名、`[Argument]` 参数、`[Script]` / `[Rewrite]` 规则条目。
个别插件额外托管了脚本：或只改托管位置与标识符，或在上游解析不了某个端点时**另写一个自研脚本**顶上，
或完全自研（无上游代码）。**任何情况下都不修改上游 JavaScript 的任何一行。**

Scope is **manifest-layer first** — MITM hostnames, `[Argument]` params, `[Script]`/`[Rewrite]` rules.
Some plugins additionally ship scripts: some only relocate or rename upstream code, some add
scripts of our own for endpoints upstream can no longer parse, and one is written from scratch
(no upstream code at all). **Upstream JavaScript is never modified.**

---

## 插件列表 · Plugins

| 插件 Plugin | 用途 Purpose | 状态 Status |
|---|---|---|
| [Bilibili-Dedup](plugins/Bilibili-Dedup/) | B 站去广告 · 大会员伪装 · 漫画净化<br>Bilibili ad-block · VIP spoof · comics | **v7.12** |
| [Bilibili-UI](plugins/Bilibili-UI/) | 首页标签页 / 底栏真开关<br>Home tabs & bottom nav switches | **v3.1** |
| [GeoFix](plugins/GeoFix/) | 网络定位重定向 · 完全本地 · 短地址 savues.com<br>Network-location redirect · fully self-contained | **v1.2** |
| [YouTube-Dedup](plugins/YouTube-Dedup/) | 消除与 blockAds 的重复改写 · 修 config 崩溃<br>Dedupe against blockAds · config parse fix | **v5.1** |
| [YouTube-Test](plugins/YouTube-Test/) | 去广告 + 双语字幕合订 · 脚本全托管<br>Ad-block + bilingual subs, self-hosted | **v1.0** |
| [PinDuoDuo](plugins/PinDuoDuo/) | 拼多多去广告 · 底栏可自定义 · 百亿补贴搜索框无推广 · 拦截全可关<br>Ad-block · custom bottom bar · clean subsidy search box · all stubs switchable | **v1.75** |
| [QuarkCheckIn](plugins/QuarkCheckIn/) | 夸克网盘每日签到领空间 · 无 MITM<br>Quark Drive daily check-in · no MITM | **v1.1** |
| [AgentRouter](plugins/AgentRouter/) | AgentRouter 签到 · 自动签到默认关闭 · 通知三层重排 + 公告<br>AgentRouter check-in · cron off by default · 3-tier layout + announcements | **v1.9** |
| [AntiRevoke](plugins/AntiRevoke/) | 屏蔽证书吊销状态检查 · 6 组开关可关<br>Cut certificate revocation checks · 6 group switches | **v1.0** |
| [Forward](plugins/Forward/) | 订阅凭据转发 · 零脚本一行 Rewrite<br>Credential forward · one-line rewrite | **1.3.13** |
| [Reven-Mirror](plugins/Reven-Mirror/) | 订阅 SDK 劫持脚本托管 · 4 个开关默认全开<br>Subscription-SDK plugin, script hosted, 4 switches on by default | **v1.1** |
| [AdGuard-Spoof](plugins/AdGuard-Spoof/) | 收据校验回包本地伪造 · 零外部依赖 · 端点已真机验证<br>Receipt response forged locally · zero external deps · endpoint verified live | **v1.01** |
| [iTunes-Spoof](plugins/iTunes-Spoof/) | iOS 收据校验转发 · 脚本逐字节等于上游 · 真机验证通过 · 仍有 Worker 依赖<br>iOS receipt forwarding · script byte-identical to upstream · Worker dep remains | **v1.02** ✅ |
| [BlockAds-Patched](plugins/BlockAds-Patched/) | 合集 B 站 + YouTube + Spotify + 拼多多 部分整体退场<br>Bilibili + YouTube + Spotify + PinDuoDuo removal from the big collection | 自动 Auto |
| [Spotify-Dedup](plugins/Spotify-Dedup/) | Spotify 去广告 · 三来源合并 · 35 项账号属性 + 5 条 Rewrite<br>Spotify ad-block, three sources merged, 35 properties and 5 rewrites | **v1.4** |
| [Douban-Dedup](plugins/Douban-Dedup/) | 豆瓣去开屏 + 信息流 + 搜索页广告词 · 五份真机抓包逐条回放<br>Douban splash, feed and search ad-block, five real captures replayed | **v1.3** |

### 托管了脚本的插件

> 各插件的具体清单见上方表格「脚本」列 —— **这个数字随插件增删变化，请勿手写**，
> 由 `find plugins -name '*.js'` 得出（2026-09-30：12 个插件带 JS）。

`Bilibili-UI` —— 上游 Enhanced 的脚本只接受**单个字符串**作为设置，而 Loon 无法把多个开关拼成一个值传入，
因此真开关必须改取参逻辑。改动仅两处 IIFE + 四处去 BoxJS，**业务逻辑逐字节未动**。

`GeoFix` —— 走的是另一条路：**不改逻辑，只改托管位置和字符串**。
上游三个脚本原本从作者站点 `script-path` 拉取，站点一旦消失，已导入的插件会直接加载失败；
本仓库把它们收进 `plugins/GeoFix/src/`，并做了一轮标识符与虚拟端点改名。
移植前后的逻辑等价性由 `smoke.test.mjs` 的 28 个用例覆盖（含一次真实 protobuf 改写），
逐条改动见 [GeoFix/UPSTREAM.md](plugins/GeoFix/UPSTREAM.md)。

`PinDuoDuo` —— 沿用 YouTube-Test 的做法托管上游脚本，另有一个自研脚本。
修掉了两个上游缺陷（切断了消息推送 WebSocket、jq 空值崩溃），依据是一份未开插件的基线 HAR。
上游脚本里还硬编码了一个 kelee.one 的 chunk 地址（会把官方 JS 换成第三方版本），已连同 chunk 一并收进仓库。
`src/homepage.response.js` 是自研的：底栏按钮可自定义、jq 空值安全、同一 URL 只留一条处理规则。

⚠️ **本插件装上还不够，blockAds 合集必须用退场版**。合集里那两条拼多多
`[Rewrite]`（开屏 `cappuccino/splash`、会场 `hungary/global/homepage`）在
**请求阶段**就返回假响应，比本插件的响应体脚本早一步，`api_stub` / `chat_stub` /
`order_stub` 三个开关对这两个端点**完全失效** —— 2026-09-30 两台真机抓包里
这些记录的 `script` 字段一律为空。已在 [patches/README.md](patches/README.md) 里退场。

`YouTube-Dedup` —— 第三条路：**上游解析不了某个端点时，另写自研脚本顶上**。
上游给 `config` 响应的 `ColdConfigGroup` 写的是空 schema，解析必然崩溃（2026-09-29 真机抓包证实），
`src/config-onesie.js` 只用公开可观测的 protobuf 字段编号把 UMP onesie 密钥取出来。
该脚本不含上游代码，有 16 个回归用例。

`QuarkCheckIn` —— 第四种情况：**完全自研，无任何上游代码**。脚本从真机抓包逆向得到，
2.3 KB 单文件，24 个回归用例（含 7 条清单结构断言）。它只用 `$httpClient` 主动发请求，不涉及 `[MITM]`，
因此不用装根证书、与其他插件零冲突。

`Reven-Mirror` —— **只托管，不改一个字**。上游脚本 98 行全是 `$httpClient` 透明转发，
伪造的订阅回包在作者自己的 Cloudflare Worker 里生成，客户端没有逻辑可改。
托管只把「设备上跑谁家的代码」变成可 diff 的固定文件；**运行时依赖作者域并未消除**，
README 里用对照表把这一点写在最前面，不含糊过去。

`Spotify-Dedup` —— **纯合订，清单层为主 + 一次有真机依据的脚本增强**。同一批 Spotify 端点
在 kelee 的插件和 blockAds 合集里各有一份，Loon first-match-wins 先加载的赢。
本插件把两边能力收成一份（730 独有的 `gae2` 老端点拦截 + kelee 独有的 QUIC 封锁），
blockAds 那份同步退场。托管的是 **kelee 那份脚本而不是 730 指向的** ——
后者在 2026-07-26 重构后改走 `new Request/Response` 的 fetch 重写，
`$argument` 出现 **0 次**，即声明了 `tab`/`useractivity` 两个开关却一个都不读。

v1.2 起脚本不再是逐字节副本：2026-09-30 的真机抓包（86 秒 601 条，走完「已登录 → 退出 → 重新登录」）
证明 kelee 版只写 10 个 `accountAttributes`，**去广告有效但解锁维度基本没生效**
（`catalogue=free`、`audio-quality=0`、`high-bitrate=false`、`offline-backup=DISABLED`…）。
本版把 001ProMax 现役脚本的 36 项属性并进来（+ kelee 独有的 2 项），
**protobuf 读写器与开关逻辑一行未动**，改动由 `patch/merge-crack-dev.py` 幂等生成。
用同一份真机响应体回放验证：21 项翻转 + 5 项新增。
这次也钉住了一个坏消息：`tab_configuration` 属性已从服务端消失，**该开关当前无效**，
而 Amlabort 最新脚本里那段 JSON 也是注释掉的 —— 同一个结论，两处独立来源。

**v1.3 补两条 Rewrite**：`watch-feed-entrypoints`（播放页「探索」，实测 iPad ×18 / iPhone ×4）
与 `pam-view-service`（设置页返回明文 `Spotify Free`）—— 这两个是**独立端点，
38 项属性表管不到**。同时**刻意不加** `/ads/` 与 `aet.spotify.com`：
前者实测已是空 marquee（脚本把 `ads` 置 false 后服务端本就不下发），
拦 `ads/v2/config` 只会打断 ad-logic 状态机；后者两平台都返回 0 字节。
「拦已经没有广告的端点」是负收益，理由写进了 lpx 与 README。

**v1.4 是修自己引入的 bug** —— v1.3 用户报「拖进度条跳歌 + 部分歌播不了」，
查到是 v1.2 并入的 `high-bitrate` / `libspotify` / `audio-quality` 三项。
用户做了一次对照实验（关脚本 → 重新登录 → 音质改回默认 → 开脚本 → 重新登录），
把服务端对**免费账号**真实下发的值照了出来：**三项全是 false/「0」，从来没给过**。
脚本硬写 true ⇒ 客户端去请求 `storage-resolve` 的 `interactive/2`（24-bit 无损）⇒
`playplay` 全部 403 ⇒ 拿不到播放密钥 ⇒ 跳歌。相关性 32 次请求零例外。
**结论：向客户端声称服务端不认的权限，比不写更糟** —— 不写只是没这个功能，
写 true 则会让功能进入「请求了但必然被拒」的状态。属性表 38 → 35，
测试加了 7 条断言钉住「必须保持服务端原值」。

**v1.3**（同一批抓包驱动）补了两条 Rewrite：`watch-feed-entrypoints`（播放页「探索」，
实测 iPad ×18 / iPhone ×4）与 `pam-view-service`（设置页返回明文 `Spotify Free`）——
这两个是**独立端点，38 项属性表管不到**。同时**刻意不加** `/ads/` 与 `aet.spotify.com`：
前者实测已是空 marquee（脚本把 `ads` 置 false 后服务端本就不下发），
拦 `ads/v2/config` 只会打断 ad-logic 状态机；后者两平台都返回 0 字节。
「拦已经没有广告的端点」是负收益，理由写进了 lpx 与 README。

**v1.2 复测还定位了一个此前误判的根因**：v1.1 时 pendragon 完全不生效，
而 v1.2 生效了 —— 但两版的 `[Rewrite]` **逐字节相同**，唯一变的是脚本。
结论是 `[Rewrite]` 与 `[Script]` 属**同一个解析单元**，
换脚本内容会让 Loon 重新解析整个 lpx，`[Rewrite]` 随之恢复。
已写进 README「已知问题」：以后遇到「Rewrite 突然不生效」，先怀疑解析状态，别改正则。

`AdGuard-Spoof` —— 第五种情况：**去混淆等价重写**。上游是 1905 B 的单行混淆（字符串表 + 移位自解机），
本仓库把它还原成 9 行可读脚本，解码表在 `UPSTREAM.md` 里逐项列出。
「等价」不是自称 —— 测试把**上游混淆原件和重写版喂同一批 10 组输入，逐字节比对 `$done` 产物**，
等价性由上游说了算。顺带修掉一处真实缺陷：上游那次 `JSON.parse` 的结果从未被读取，
唯一作用是在非 JSON 响应上抛异常导致请求卡死。
它是本仓库**运行时外部依赖为零**的插件（脚本不含 `$httpClient`/`fetch`/`eval`，测试逐一断言）——
与 Reven-Mirror 那种「把依赖从 A 挪到 B」不同，这里是真的没有 B。
✅ `status.html` 那个端点**没拦，实测也确认不用拦** —— 解锁正常。

`AgentRouter` —— **脚本托管 + 修一个真机实测出来的 bug**。清单层只改了一处：cron 挂上默认关闭的开关
（开关只拦自动调度，cron 本身仍可在插件页手动触发）。
托管脚本的理由跟 Reven-Mirror 一样：作者的个人仓库不是长期承诺的 CDN。
但脚本不是纯托管 —— 真机跑通后发现通知里奖励金额一直显示「金额未识别」，
根因是服务端返回的金额符号是**全角 `＄`（U+FF04）**而上游正则只认半角 `$`，
字符类改成 `[$＄]` 修掉了。个人自用，所以也去掉了 `maskAccount()` 账号打码
（代价是通知里会出现完整邮箱，锁屏可见 —— 已在插件 README 写明）。
通知按 iOS 的三层（副标题 / 标题 / 正文 4 行）重排过：顶栏放身份信息、
标题把签到金额合并进去、正文首行挤下余额/已用/请求数、剩下 3 行留给公告
（只在有新公告时占行，靠 persistentStore 记 id）。
原件另存 `src/upstream-agentrouter.js`。23 个结构用例 + 21 个纯函数用例。逐条依据见 [AgentRouter/UPSTREAM.md](plugins/AgentRouter/UPSTREAM.md)。
曾一度怀疑解锁不完整（收据端点已伪造，`status.html` 仍在报 `status: FREE`），
真机实测排除：**AdGuard 4.5.23 的会员态由收据校验结果决定，不读那个端点**。
这印证了当初不拦它是对的 —— 手上只有 `status: FREE` 一份样本，
若靠猜字段伪造付费回包，等于拿一个能用的插件去冒 App 崩的风险。
另：实测只需装上跑一次即可，之后可关开关，插件不卸载就一直是会员。

> v5.2～v6.0 曾附带自研的 `src/feed-gaming.js`（清除首页「游戏大本营」）与一批清单改动，
> 已于 2026-09-29 整体回退到 v5.1；代码仍留在 git 历史里，需要时可按提交取回。

`Douban-Dedup` —— **以清单层为主，测试用真机抓包做全量回放，且被真机打脸过一次**。合并了
[honue/rules](https://github.com/honue/rules)（480 B）与
[shengrui123/douban-adblock](https://github.com/shengrui123/douban-adblock)（1552 B）两家，
两家原件逐字节留存并用 SHA256 钉死。测试把两份 HAR（218 + 249 条）压成 URL 清单逐条喂规则，
判「本地合成 vs 真实回包」靠**响应头数量**（真回包 10–16 条，本地合成 0–1 条）。

🔴 **v1.0 的失败值得单独记**：我为了给信息流规则挂 `enable={}` 开关，把它们从
`[URL Rewrite]` 挪到了 `[Rule]` 的 `URL-REGEX` 上。真机抓包证明**一条都没拦住** ——
`feed_ad` 仍下发 60908 B 带 16 条真实响应头。根因是 **`[Rule]` 段的 `URL-REGEX`
不参与 HTTPS 路径改写**。

定位的关键在于**同段的 `IP-CIDR` 生效了**（15 次 HTTPDNS 全拦）。所以不是整段失效，
是这一种规则类型不生效 —— 若只看「`[Rule]` 不工作」就会误改掉本来正确的 HTTPDNS 规则。
代价是信息流挂不上开关，因此**直接删掉了那个开关**：宁可没有开关，
也不要一个假装能关的开关。测试里有反向断言钉死「`[Rule]` 段零 `URL-REGEX`」。

第三份抓包还修正了 v1.0 一个过于保守的说法：README 原先写「必须完整删 App 重装」
（依据是 `splash_preload` 的 POST 体里有 `preload_ads` 本地缓存），但实测**不必删** ——
素材图被拦住后 SDK 就会走失败跳过。三份抓包也确认了两家上游都漏了
`frodo.douban.com` 上的信息流广告（单条 59 KB），而 shengrui 那条「让 App 立即跳过」的
`splash_show` 规则在 7.135.0 上**一次都没触发**。

**v1.2 加了本仓库第一个「自研脚本」**（`src/douban-search-ad.js`，v1.3 改挂 `[Script]` 段）：搜索框滚动广告与
「发现」横滚标签里的广告，都在 `search/found_words` 的 `words[]` 与 `search/hots` 的
`roofs[]` 里，与真实热搜**混在同一个数组**，只能靠 `layout:"ad"` 区分。
直接 reject 会让搜索联想报废，所以改用 `script-response-body` 只删广告条目。
v1.2 把它挂在 `[URL Rewrite]` 的 `script-response-body=` 上，**真机实测一次都没执行**。
查官方手册 `docs/cn/rewrite.md` 才发现 `[Rewrite]` 只支持 URL/Header 改写、302/307
与 5 种 reject，**根本没有响应体改写**；正解是 `[Script]` 段的
`http-response` + **`requires-body=true`**（漏掉它 `$response.body` 恒为 undefined）。
改挂 `[Script]` 后 `enable={}` 也名正言顺了 —— 官方 `docs/cn/script.md` 的示例里就有。

**v1.3 移除了 `img*.doubanio.com`**：它原本只为拦 5 张开屏广告素材图，
但真机实测在个人主页/小组页引发**连接池排队** —— 17 并发时 5~6 张头像瞬时失败
（`status=0`），33~42 ms 后重试全部成功，且失败时刻与 HTTPDNS 请求精确同刻。
用户症状「前几次能开、后来不行、重启就好」正是连接池被填满的典型表现。
代价是开屏素材图放行，但 `splash_preload` 接口仍被拒，App 拿不到新广告对象。

🔴 **三次「凭印象写 Loon 语法」的教训**：本仓库已经栽了三次 ——
`[Rule]` 的 `URL-REGEX` 不参与 HTTPS 改写、`[Rewrite]` 挂 `enable=` 静默失效、
`[Rewrite]` 的 `script-response-body=` 根本不存在。**用没验证过的语法前先查官方手册。**

Several plugins ship scripts: `Bilibili-UI` changes argument parsing because the upstream
accepts a single string. `GeoFix` changes nothing but hosting and strings: the upstream
fetched its three scripts from the author's site, so the plugin would break outright if
that site disappeared. `YouTube-Test` and `PinDuoDuo` host the upstream scripts and add
purpose-built ones for endpoints upstream breaks on. `YouTube-Dedup` takes a further
route — a script for an endpoint upstream cannot parse (`config`) — covered by 16 tests.
`Reven-Mirror` hosts a script it does not touch at all: the upstream file is a pure
pass-through and the response forging lives in the author's own Worker, so there was
nothing to change — only a URL to relocate. The README says so plainly rather than
implying the author's domain is now gone.
`QuarkCheckIn` is a further case still: written entirely from scratch off a real packet
capture, 2.3 KB, 24 tests, and no `[MITM]` at all.
`AdGuard-Spoof` is the one plugin whose script was **deobfuscated and rewritten**: equivalence
is proved by feeding the upstream original and the rewrite the same 10 inputs and diffing
`$done` byte for byte. It also has **zero runtime external dependencies** — though its
real-world effectiveness is explicitly unverified.
`AgentRouter` is vendored **and patched**: the live test showed the reward line always
reading "amount not recognised", because the server returns a **full-width `＄` (U+FF04)**
while the upstream regex only accepts a half-width `$`. The character class is now `[$＄]`.
`maskAccount()` is dropped for personal use — the cost, a full e-mail visible on the
lock screen, is stated in the plugin README. The notification was then rebuilt
around iOS's three tiers (subtitle / title / 4 body lines): identity on top,
the reward amount in the title, balance+spent+requests squeezed onto one body
line, and the last three lines reserved for announcements (only when a new one
exists, tracked via persistentStore). The pristine original is kept alongside;
44 tests across two files cover structure and the pure layout functions.

`iTunes-Spoof` is pure hosting: the 374 KB upstream script runs **byte-for-byte unchanged**.
Two earlier versions tried to "fix" what I believed was a broken argument connection, and both
broke the plugin — a diagnostic plugin showed the truth, that Loon passes `$argument` as an
*object* whose keys are exactly `Enabled`/`Expires`/`Country`, so upstream was never broken
and my "fix" was the only thing preventing the forward. The repo keeps the diagnostic plugin
and pins the measured shape in tests, so nobody repeats the mistake.

`Douban-Dedup` is manifest-first, replays real packet captures end to end —
and the second one caught v1.0. It merges honue/rules (480 B) and
shengrui123/douban-adblock (1552 B), both kept byte-for-byte and pinned by SHA256.
The two HARs (218 + 249 requests) are compressed into URL fixtures and fed through the
rules one at a time; "synthesised locally vs. real response" is decided by **response
header count** — a real reply carries 10–16 headers, a local reject carries 0–1.

🔴 **The v1.0 failure is worth recording on its own**: so the feed-ad rules could carry an
`enable={}` switch, I moved them out of `[URL Rewrite]` into `[Rule]` as `URL-REGEX`.
The capture proved **not one of them fired** — `feed_ad` still delivered 60,908 bytes behind
16 real response headers. The cause is that **`URL-REGEX` in `[Rule]` does not participate
in HTTPS path rewriting**.

The key to the diagnosis is that **`IP-CIDR` in that same section did work** (15 HTTPDNS
requests all blocked). So the section wasn't dead — that one rule *type* was. Had I stopped
at "`[Rule]` doesn't work" I would have broken the HTTPDNS rules that were already correct.
Since the feed rules can no longer carry a switch, **the switch was deleted outright**: no
switch beats a switch that pretends to work. A reverse assertion pins "`[Rule]` contains
zero `URL-REGEX`".

The same capture also corrected an over-cautious claim in v1.0: the README had said the app
must be fully deleted and reinstalled, based on `preload_ads` cached in the POST body of
`splash_preload`. Empirically **it needn't be** — once the asset image is blocked the SDK
takes the load-failure path and skips. The captures also confirm that both upstreams miss
the feed ads on `frodo.douban.com` (59 KB in a single response), and that shengrui's
`splash_show` rule — the one that makes the app skip immediately — **never fires at all**
on 7.135.0.

**v1.2 adds this repo's first self-written script** (`src/douban-search-ad.js`;
rehomed into `[Script]` in v1.3). The
scrolling ad in the search box and the ad tags in the horizontal strip both live inside
`words[]` of `search/found_words` and `roofs[]` of `search/hots` — **mixed into the same
arrays as the real hot searches**, separable only by `layout:"ad"`. Rejecting the endpoint
would break search suggestions outright, so the script deletes just the ad entries via
`script-response-body`. v1.2 put it on `[URL Rewrite]`, and **it never ran once** — the
capture still showed a 13-header real reply with `ad_info` intact. The official manual
(`docs/cn/rewrite.md`) settled it: `[Rewrite]` only does URL/Header rewrites, 302/307 and
five reject variants — **there is no response-body rewrite at all**. The correct form is
`http-response` in `[Script]` with **`requires-body=true`** (without it `$response.body` is
permanently `undefined`). Rehomed into `[Script]`, the `enable={}` switch is legitimate too,
since the official `docs/cn/script.md` examples use it.

**v1.3 drops `img*.doubanio.com`** from `[MITM]`. It was only there to block five splash
ad images, but on real devices it caused **connection-pool queuing** on profile and group
pages: with 17 concurrent requests, five or six avatars fail instantly (`status=0`) and
succeed on retry 33–42 ms later, at exactly the moment a HTTPDNS request lands. The user's
own symptom — "works the first few times, then stops; restarting the app fixes it" — is the
textbook signature of a saturated pool. The cost is that splash creatives are no longer
blocked, but `splash_preload` still is, so the app gets no fresh ad object.

🔴 **Three strikes for writing Loon syntax from memory**: `[Rule]`'s `URL-REGEX` does not
participate in HTTPS rewriting; `enable=` on `[Rewrite]` fails silently; and
`script-response-body=` on `[Rewrite]` does not exist. **Read the official manual before
using syntax you have not verified.**

---

## 收录原则 · Principles

| # | 中文 | English |
|---|---|---|
| 1 | 优先只改清单层 | Prefer manifest-layer changes |
| 2 | 确需改脚本时，仅限取参、远程配置依赖与标识符 | When a script must change, limit to argument parsing, remote config and identifiers |
| 3 | 每条改动注明依据 | Document the reasoning for every change |
| 4 | 保留上游署名与许可 | Preserve upstream attribution and licensing |
| 5 | 公开仓库不带上游产品名，出处改记在 `UPSTREAM.md` | Keep upstream product names out of a public repo; preserve attribution in `UPSTREAM.md` |
| 6 | 改过脚本的插件必须带可运行的回归测试 | Any plugin shipping modified scripts ships a runnable regression test |
| 7 | 结论须有基线抓包支撑，猜不得 | Conclusions need baseline-capture evidence, not guesswork |
| 8 | 踩坑记录进迭代文档，不留在插件 README | Keep post-mortems in the iteration log, not plugin READMEs |
| 9 | **每次改动都必须升版本号，步长 +0.01**（1.7 → 1.71），并同步 `#!name`、插件 README、顶层 README 三处 | **Every change bumps the version by +0.01**, kept in sync across `#!name`, the plugin README and this table |

> 原则是用来防「顺手改出乱子」的，不是用来卡人的。**打破原则时，把破在哪、为什么破，写进对应插件的 `UPSTREAM.md`。**
> 目前两处已知破例：
> - `AdGuard-Spoof` 破 #2 —— 脚本不只是改取参，而是整体去混淆重写。**破例的前提是等价性被测试钉死**（上游原件与重写版逐字节比对），不是「我觉得意思一样」。
> - `AdGuard-Spoof` 同时破 #5 —— 目录名与清单 `#!name` 都直接用了上游产品名。理由：它的全部功能就是针对这一个 App，去掉名字反而看不懂，且与插件实际行为不符。

Principles guard against careless changes; they are not a gate. When one is broken,
say so in that plugin's `UPSTREAM.md`. `AdGuard-Spoof` is a known exception to #2
(whole-script deobfuscation, admitted only because byte-level equivalence is test-pinned)
and to #5 (upstream product name kept in the directory and `#!name`).

---

## 🔄 自动同步 · Auto Sync

`BlockAds-Patched` 由 GitHub Actions **每 6 小时同步上游并重施退场补丁**（B 站 + YouTube + Spotify + 拼多多）
Synced upstream every 6 hours, with the Bilibili + YouTube + Spotify + PinDuoDuo removal patch re-applied.

[`.github/workflows/sync-blockads.yml`](.github/workflows/sync-blockads.yml)

| 特性 | Feature |
|---|---|
| 无变化不提交 | No commit when upstream is unchanged |
| 退场不完整则**报错终止** | **Fails hard** if the removal is incomplete |
| 产物不是插件（上游返回错误页）则**报错终止** | **Fails hard** if the artifact isn't a valid plugin |
| 补丁不可重放则**报错终止** | **Fails hard** if the patch isn't idempotent |
| push 撞车自动 rebase 重试 | Auto rebase-and-retry on push conflict |
| 可手动触发 | Manual trigger supported |

> ⚠️ GitHub 的定时任务实际执行常延迟 **1–6 小时**，不是 cron 写的那样准点。
>
> Scheduled runs on GitHub are commonly delayed by 1–6 hours.

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。
> 拉不到新版时在订阅地址末尾加随机参数：`?cb=2`
>
> CDN cache may lag up to 24h. Append a random param to force refresh: `?cb=2`

---

## 📖 开发记录 · Development

| 文档 | 内容 |
|---|---|
| [BILIBILI-ITERATION.md](BILIBILI-ITERATION.md) | 49 次提交的完整复盘 · Full post-mortem of 49 commits |
| [patches/README.md](patches/README.md) | 退场范围与判定依据 · Removal scope and detection rules |
| [tools/README.md](tools/README.md) | `har-diff.py` 抓包对比工具 · HAR diff tool |
| [GeoFix/UPSTREAM.md](plugins/GeoFix/UPSTREAM.md) | 定位插件的出处与移植逐条对照 · Provenance & porting diff |
| [GeoFix/ITERATION.md](plugins/GeoFix/ITERATION.md) | 定位插件 18 次提交的完整复盘 · Full post-mortem |
| [YouTube-Dedup/ITERATION.md](plugins/YouTube-Dedup/ITERATION.md) | 去广告插件 config 崩溃的定位过程 · How the config parse crash was found |
| [PinDuoDuo/UPSTREAM.md](plugins/PinDuoDuo/UPSTREAM.md) | 拼多多插件的出处与逐条改动依据 · Provenance & per-change reasoning |
| [QuarkCheckIn/README.md](plugins/QuarkCheckIn/README.md) | 夸克签到插件：逆向结论 + 四次踩坑记录 · Check-in plugin: reverse-engineering notes & post-mortems |
| [AgentRouter/UPSTREAM.md](plugins/AgentRouter/UPSTREAM.md) | AgentRouter 签到的开关改造依据 · Why the cron is now off by default |
| [AntiRevoke/README.md](plugins/AntiRevoke/README.md) | 证书吊销屏蔽插件：ppq 域名查证 + MITM 为何无必要 · Revocation-block plugin: ppq findings & why MITM is pointless |
| [Reven-Mirror/UPSTREAM.md](plugins/Reven-Mirror/UPSTREAM.md) | 托管脚本的出处、外部资源审计与实测记录 · Provenance, resource audit & measurements |
| [AdGuard-Spoof/UPSTREAM.md](plugins/AdGuard-Spoof/UPSTREAM.md) | 混淆脚本的去混淆过程、逐句对照与变异测试 · Deobfuscation walkthrough, statement map & mutation tests |
| [tools/README.md](tools/README.md#external-watchpy--外部资源巡检--external-resource-watch) | `external-watch.py`：盯 `script-path` 等现取资源是否被静默改动 · Watches remotely-fetched resources for silent changes |
| [`docs/`](https://github.com/Savues/loon-plugin-patches/tree/main/docs) | GeoFix 网页版设置界面（GitHub Pages 托管，可选）· Web UI |

---

## 免责声明 · Disclaimer

- 仅供个人学习研究 · For personal study and research
- 收录不代表推荐或背书 · Inclusion is not an endorsement
- 上游作者不愿收录请提 issue 即下架 · Open an issue to opt out

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
