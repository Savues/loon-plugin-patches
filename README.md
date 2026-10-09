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
| [Bilibili-Airborne](plugins/Bilibili-Airborne/) | 空降助手独立版 · **跳过类型/动作/时长/文案全可配** · 自动跳靠自带 chronos 重签<br>SponsorBlock standalone · 自动跳/只提醒两档 · 类别中文化 · · 整篇软广单独提醒 · fully configurable | **v1.6** |
| [Bilibili-UI](plugins/Bilibili-UI/) | 首页标签页 / 底栏真开关<br>Home tabs & bottom nav switches | **v3.1** |
| [GeoFix](plugins/GeoFix/) | 网络定位重定向 · 完全本地 · 短地址 savues.com<br>Network-location redirect · fully self-contained | **v1.2** |
| [YouTube-Dedup](plugins/YouTube-Dedup/) | 消除与 blockAds 的重复改写 · 修 config 崩溃<br>Dedupe against blockAds · config parse fix | **v5.1** |
| [YouTube-Test](plugins/YouTube-Test/) | 去广告 + 双语字幕合订 · 脚本全托管<br>Ad-block + bilingual subs, self-hosted | **v1.0** |
| [PinDuoDuo](plugins/PinDuoDuo/) | 拼多多去广告 · 底栏可自定义 · 百亿补贴搜索框无推广 · 拦截全可关<br>Ad-block · custom bottom bar · clean subsidy search box · all stubs switchable | **v1.75** |
| [QuarkCheckIn](plugins/QuarkCheckIn/) | 夸克网盘每日签到领空间 · 无 MITM<br>Quark Drive daily check-in · no MITM | **v1.1** |
| [AgentRouter](plugins/AgentRouter/) | AgentRouter 签到 · 自动签到默认关闭 · 修三处上游缺陷<br>AgentRouter check-in · cron off by default · three upstream bugs fixed | **v1.13** |
| [AntiRevoke](plugins/AntiRevoke/) | 屏蔽证书吊销状态检查 · 6 组开关可关<br>Cut certificate revocation checks · 6 group switches | **v1.0** |
| [Forward](plugins/Forward/) | 订阅凭据转发 · 零脚本一行 Rewrite<br>Credential forward · one-line rewrite | **1.3.13** |
| [Reven-Mirror](plugins/Reven-Mirror/) | 订阅 SDK 劫持脚本托管 · 4 个开关默认全开<br>Subscription-SDK plugin, script hosted, 4 switches on by default | **v1.1** |
| [AdGuard-Spoof](plugins/AdGuard-Spoof/) | 收据校验回包本地伪造 · 零外部依赖 · 端点已真机验证<br>Receipt response forged locally · zero external deps · endpoint verified live | **v1.01** |
| [iTunes-Spoof](plugins/iTunes-Spoof/) | iOS 收据校验转发 · 脚本逐字节等于上游 · 真机验证通过 · 仍有 Worker 依赖<br>iOS receipt forwarding · script byte-identical to upstream · Worker dep remains | **v1.02** ✅ |
| [BlockAds-Patched](plugins/BlockAds-Patched/) | 合集 B 站 + YouTube + Spotify + 拼多多 部分整体退场<br>Bilibili + YouTube + Spotify + PinDuoDuo removal from the big collection | 自动 Auto |
| [Spotify-Dedup](plugins/Spotify-Dedup/) | Spotify 去广告 · 三来源合并 · 35 项账号属性 + 5 条 Rewrite<br>Spotify ad-block, three sources merged, 35 properties and 5 rewrites | **v1.4** |
| [Douban-Dedup](plugins/Douban-Dedup/) | 豆瓣开屏广告屏蔽 · **honue 原版纯移植，零改动**<br>Douban splash ad-block, honue original ported verbatim | **v3.0** |
| [Douban-SearchAd](plugins/Douban-SearchAd/) | 豆瓣搜索页广告词屏蔽 · 与上一条互补 · 开关非绝对<br>Douban search-page ad-word stripping, complements the above | **v1.0** |
| [Locally-HF-Swap](plugins/Locally-HF-Swap/) | Locally 换任意 HF 模型 · 改写下载 URL · 网络层已验证，App 端加载未解决<br>Locally model swap · URL rewrite · network layer verified, App-side load unresolved | **v1.6** ⚠️ |

### 托管了脚本的插件

> 各插件的具体清单见上方表格「脚本」列 —— **这个数字随插件增删变化，请勿手写**，
> 由 `find plugins -name '*.js'` 得出（2026-10-03：14 个插件带 JS）。

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

`Locally-HF-Swap` —— 同样完全自研，脚本从一次完整下载的 15 条抓包逆向得到。
与 `QuarkCheckIn` 不同的是它要改写 App 自己的请求 URL（`$done({url})`），因此需要 `[MITM] huggingface.co`。
**53 个回归用例**覆盖 3 种 URL 形态、sha 缓存、身份字段改回、`usedStorage` 修正，
以及多层安全网。

**网络层已完整验证，App 端加载仍未解决** —— 这是个诚实的结论，不是一个能吹的成果：
真机 14/14 命中脚本，v1.6 交付给 App 的元数据与其期望**逐字节对齐**
（`usedStorage` 与原模型一字不差），文件曾实测完整下载 337,886,921 字节，
**但 App 始终报「请求超时」**。三项网络层指标全部达标而 App 依然失败，
说明其校验还有 HTTP 层观测不到的部分。

真机调试了六轮才把网络层做对，四个坑叠在一起且**全都静默失效**（装得上、开是绿的、
请求正常、日志无报错，就是不生效）。最贵的一条是 `argument="{xxx}"` 语法无效——
我连续三轮在错误方向上加补丁（参数形态兼容、持久化兜底、诊断日志），
**是用户要求「去搜别的插件看规则怎么写」才对上**，GitHub 1316 个 `.lpx` 对照后一次通过。
完整过程见 [EXPERIMENT.md](plugins/Locally-HF-Swap/EXPERIMENT.md)，
其中「判读 Loon HAR 的方法」一节对任何 Loon 排障都适用。

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

`AgentRouter` —— **脚本托管 + 修了三个真机实测出来的 bug**。清单层只改一处：cron 挂上默认关闭的开关
（开关只拦自动调度，cron 本身仍可在插件页手动触发）。托管脚本的理由跟 Reven-Mirror 一样：
作者的个人仓库不是长期承诺的 CDN。

脚本不是纯托管，三处改动都是真机跑出来的：

| # | 症状 | 根因 |
|---|---|---|
| 1 | 奖励金额一直显示「金额未识别」 | 服务端返回**全角 `＄`（U+FF04）**，上游正则只认半角 `$` |
| 2 | 明明签到了却报「签到待确认」 | 签到在 `POST /api/user/login` 时由服务端完成，但 `/api/log/self` 的记录**异步写**，登录后立刻查还查不到 |
| 3 | 通知排版被 iOS 截断 | 副标题右侧被**时间戳**占位，宽度随通知新旧在 11~16 单位间波动 |

连带把通知按 iOS 三层（副标题 / 标题 / 正文 4 行）重排：顶栏放站点名+ID、天数挪到标题
（副标题会被时间戳挤掉）、正文首行放余额+已用、剩下 3 行留给公告（只在有新公告时占行）。
个人自用所以去掉了 `maskAccount()` 账号打码 —— 代价是通知里会出现完整邮箱，锁屏可见，已在插件 README 写明。

原件另存 `src/upstream-agentrouter.js`。24 个结构用例 + 26 个排版纯函数用例 + 5 个竞态用例。
逐条依据见 [AgentRouter/UPSTREAM.md](plugins/AgentRouter/UPSTREAM.md)。
曾一度怀疑解锁不完整（收据端点已伪造，`status.html` 仍在报 `status: FREE`），
真机实测排除：**AdGuard 4.5.23 的会员态由收据校验结果决定，不读那个端点**。
这印证了当初不拦它是对的 —— 手上只有 `status: FREE` 一份样本，
若靠猜字段伪造付费回包，等于拿一个能用的插件去冒 App 崩的风险。
另：实测只需装上跑一次即可，之后可关开关，插件不卸载就一直是会员。

> v5.2～v6.0 曾附带自研的 `src/feed-gaming.js`（清除首页「游戏大本营」）与一批清单改动，
> 已于 2026-09-29 整体回退到 v5.1；代码仍留在 git 历史里，需要时可按提交取回。

`Douban-Dedup` 是**纯移植版** —— [honue/rules](https://github.com/honue/rules) 的
`Douban.plugin` 搬进本仓库，**规则正文逐字节相同**，唯一改动是 `#!homepage` 指向本仓库。
这不是省事，而是**三次返工之后的结论**。

🔴 **为什么退到纯移植**。v1.0–v2.0 逐步加了信息流/横幅/影视页/剧集页/小组页广告拦截、
腾讯优量汇 HTTPDNS、开屏素材图规则，以及一个自研的搜索页广告剥离脚本。
结果用户报告**浏览几个个人主页 / 小组页后无法加载，重启 App 才能恢复**。
我先后把原因归给 `img*.doubanio.com` 和 HTTPDNS 规则，**两次都被真机证伪** ——
移除后照样复现。抓包显示 21 并发时 5~6 张图片瞬时失败（`status=0`），10 ms 内全部重试成功，
豆瓣侧 62 个接口零失败。**无法证明是插件造成的，但能确定：原版没这个问题，加了功能的版本有。**

所以 v3.0 全部撤掉，只留上游原版。搜索页广告那个脚本也删了 —— 它需要
`frodo.douban.com` 进 `[MITM]`，会解密豆瓣全部业务 API。**收益未经验证，风险已经出现，
这不该继续叠加。**

测试因此重写为「零差异校验」：剥离 `#!` 元信息后，正文必须与上游原件逐字节相同，
元信息只允许 `homepage` 一行不同，另有反向断言钉住「没有新增功能」。

⚠️ 该插件后来被明确要求**必须镜像**，所以保留 —— 它的价值正是这条字节比对。
搜索广告功能拆到独立的 `Douban-SearchAd`，两个插件二选一（见下）。

如果之后还想扩展，前置条件是**先解决主页加载问题**并用对照实验确认因果。

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

`Locally-HF-Swap` is also written from scratch, from a 15-request capture of one complete
model download. Unlike `QuarkCheckIn` it rewrites the app's **own** request URLs via
`$done({url})`, so it does need `[MITM] huggingface.co`. 53 tests cover the three URL shapes,
the sha cache, identity-field restoration and `usedStorage` correction, plus several layers of
safety net.

**The network layer is fully verified; the App-side load is not resolved** — stated plainly
because it is the truth, not a boast. On device: 14/14 requests hit the script, the metadata
v1.6 hands the App matches its expectation **byte for byte** (`usedStorage` identical to the
original model), and the weights once downloaded in full at 337,886,921 bytes — **and the App
still reports a request timeout**. All three network-layer metrics pass, so whatever the App
checks must live somewhere HTTP cannot see.

It took six rounds of on-device debugging to get the network layer right, against four traps
that all **fail silently**. The most expensive one: `argument="{xxx}"` is invalid syntax, and
I spent three consecutive rounds patching the wrong thing — argument-shape fallbacks, a
persistent-store fallback, diagnostic logging — until the user said "go look at how other
plugins write it"; 1316 `.lpx` files answered it immediately. The full account is in
[EXPERIMENT.md](plugins/Locally-HF-Swap/EXPERIMENT.md); its section on **reading a Loon HAR**
applies to any Loon troubleshooting, not just this plugin.
`AdGuard-Spoof` is the one plugin whose script was **deobfuscated and rewritten**: equivalence
is proved by feeding the upstream original and the rewrite the same 10 inputs and diffing
`$done` byte for byte. It also has **zero runtime external dependencies** — though its
real-world effectiveness is explicitly unverified.
`AgentRouter` is vendored **and patched** — three bugs, all found by running it on a real device:
the reward line always read "amount not recognised" because the server returns a **full-width
`＄` (U+FF04)** while the upstream regex only accepts a half-width `$`; a successful check-in
was reported as "unconfirmed" because the log record is written **asynchronously** and the script
queried it immediately; and the notification layout was truncated because the **timestamp**
eats into the subtitle's width, which swings between 11 and 16 units as the notification ages.
The notification was rebuilt around iOS's three tiers (subtitle / title / 4 body lines): site + ID
on top, the day count moved into the full-width title, balance+spent on the first body line,
and the last three reserved for announcements. `maskAccount()` is dropped for personal use —
the cost, a full e-mail visible on the lock screen, is stated in the plugin README.
The pristine original is kept alongside; 55 tests across three files cover structure,
the pure layout functions, and the log-write race.

`iTunes-Spoof` is pure hosting: the 374 KB upstream script runs **byte-for-byte unchanged**.
Two earlier versions tried to "fix" what I believed was a broken argument connection, and both
broke the plugin — a diagnostic plugin showed the truth, that Loon passes `$argument` as an
*object* whose keys are exactly `Enabled`/`Expires`/`Country`, so upstream was never broken
and my "fix" was the only thing preventing the forward. The repo keeps the diagnostic plugin
and pins the measured shape in tests, so nobody repeats the mistake.

`Douban-Dedup` is a **verbatim port** of honue/rules' `Douban.plugin` — the rule body is
byte-for-byte identical, and the only change is the `#!homepage` line. That is not laziness
but the conclusion of three failed revisions.

🔴 **Why it fell back to a pure port.** v1.0–v1.9 grew feed/banner/movie/TV/group ad
blocking, Tencent HTTPDNS interception, splash creative rules, and a self-written script for
search-page ads. Users then reported that **after browsing a few profile or group pages the
app stopped loading until restarted**. I blamed `img*.doubanio.com`, then the HTTPDNS rules;
**both guesses were falsified on device** — the problem persisted after removing them. The
capture shows five or six images failing instantly (`status=0`) under 21 concurrent requests,
all succeeding on retry within 10 ms, with all 62 Douban endpoints returning normally.
**I cannot prove the plugin caused it; I can prove the original doesn't have the problem and
the feature-bearing versions do.**

So v3.0 drops everything and keeps only the upstream original. The search-ad script went
too — it needed `frodo.douban.com` in `[MITM]`, which decrypts Douban's entire business API.
**The benefit was unverified while the risk was demonstrated; that should not keep compounding.**

The test was rewritten as a zero-diff check: strip the `#!` metadata and the body SHA256 must
match the pristine upstream copy, with only the `homepage` line allowed to differ. Roughly
twenty further reverse assertions pin down "no new functionality" (no `[Script]` /
`[Argument]`, no `enable=`, no `IP-CIDR`, no `erebor`, no `frodo`, no `doubanio`) — anyone
adding something back has to explain why the last attempt broke things.

The plugin was later explicitly required to stay a **mirror**, so it remains — its value is
exactly that byte comparison. Search-ad stripping was split out into its own
`Douban-SearchAd`; the two are mutually exclusive (see below).

Any future extension is gated on **fixing the profile-loading problem first and establishing
causality with a controlled experiment**.

---

## Douban 两件套怎么选

| | [Douban-Dedup](plugins/Douban-Dedup/) | [Douban-SearchAd](plugins/Douban-SearchAd/) |
|---|---|---|
| 开屏 | ✅ honue 原版规则 | ✅ 同一条，逐字相同 |
| 搜索页广告词 | ❌ | ✅ |
| MITM 域名 | 1 个（`api.douban.com`） | 2 个（+`frodo.douban.com`） |
| 解密范围 | 最小 | 多解密整个豆瓣业务 API |

⚠️ **不建议同时装**（开屏规则重复、MITM 叠加）。**二选一。**

SearchAd 那个开关**不是绝对的**：Loon 的 `[MITM]` 段没有参数化机制
（官方手册 `docs/cn/plugin.md` 只有 `hostname=` 和 `h2=`），
`[Argument]` 的 `switch` 挂不到 `[MITM]`。所以 `block_search_ad` 关掉后
**只是脚本不执行，`frodo.douban.com` 仍然会被解密** —— 省不下那份 TLS 开销。

这也是为什么它被拆成独立插件：**想要「绝对干净」就用 Douban-Dedup 的纯移植版。**

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

## ⚠️ 原则 2 的一处例外 · One documented exception

`Bilibili-Airborne` 把上游脚本里**写死的常量**（查询类别 `category=sponsor`、最短 8 秒、
动作白名单 `skip`、提示文案）改成了 `[Argument]` 可配置项，因此触及了原则 2 的边界。
改动全是「常量 → 参数」，没有新增业务逻辑；唯二的行为增量（空类别短路、注入幂等守卫）
都是防御性的。逐条对照见 [Bilibili-Airborne/UPSTREAM.md](plugins/Bilibili-Airborne/UPSTREAM.md)。

This plugin turns the upstream's hard-coded constants into `[Argument]` options.
That crosses the line drawn by principle 2, deliberately and with full disclosure.

---

## 🔄 自动同步 · Auto Sync

`BlockAds-Patched` 与 `Bilibili-Airborne` 由 GitHub Actions **每 6 小时同步上游并重施补丁**（B 站 + YouTube + Spotify + 拼多多）
Synced upstream every 6 hours, with the Bilibili + YouTube + Spotify + PinDuoDuo removal patch re-applied.
`Bilibili-Airborne` 的脚本每6 小时从 Sparkle 上游重拉并重打 9 处补丁，锚点失配时 **Actions 报错终止**，不会产出「参数不生效」的脚本。

[`.github/workflows/sync-blockads.yml`](.github/workflows/sync-blockads.yml)　[`.github/workflows/sync-airborne.yml`](.github/workflows/sync-airborne.yml)

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
| [Bilibili-Airborne/UPSTREAM.md](plugins/Bilibili-Airborne/UPSTREAM.md) | 空降助手的出处、9 处锚点逐条对照 · Provenance & patch diff |
| [Bilibili-Airborne/ITERATION.md](plugins/Bilibili-Airborne/ITERATION.md) | 空降助手的独立化与**自动跳转九层消融**全过程 · Post-mortem |
| [GeoFix/ITERATION.md](plugins/GeoFix/ITERATION.md) | 定位插件 18 次提交的完整复盘 · Full post-mortem |
| [YouTube-Dedup/ITERATION.md](plugins/YouTube-Dedup/ITERATION.md) | 去广告插件 config 崩溃的定位过程 · How the config parse crash was found |
| [PinDuoDuo/UPSTREAM.md](plugins/PinDuoDuo/UPSTREAM.md) | 拼多多插件的出处与逐条改动依据 · Provenance & per-change reasoning |
| [QuarkCheckIn/README.md](plugins/QuarkCheckIn/README.md) | 夸克签到插件：逆向结论 + 四次踩坑记录 · Check-in plugin: reverse-engineering notes & post-mortems |
| [Locally-HF-Swap/README.md](plugins/Locally-HF-Swap/README.md) | Locally 换模型插件：3 种 URL 形态的实测结论 + 两个正则坑 · Model-swap plugin: measured URL shapes & two regex traps |
| [Locally-HF-Swap/EXPERIMENT.md](plugins/Locally-HF-Swap/EXPERIMENT.md) | **完整实验记录**：四个坑、两处 mock 误判、判读 Loon HAR 的方法，以及为何到此为止<br>Full post-mortem: four traps, two mock mistakes, how to read a Loon HAR, why it stops here |
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
