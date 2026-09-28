# Bilibili-Dedup-lab · 小破站去广告(合并版) 测试版

> **这是测试版，不要与正式版 v7.18 同时启用**（MITM 域名与规则重叠，会重复执行）。
> 先关掉 v7.18 再启用本版；测出问题回滚只需关掉本版、打开 v7.18。
>
> 订阅（仅 `lab` 分支，正式版 `main` 不受影响）：
> ```
> https://raw.githubusercontent.com/Savues/loon-plugin-patches/lab/plugins/Bilibili-Dedup-lab/Bilibili-Dedup-lab.lpx
> ```

> B 站去广告 + 本地会员伪装，与 blockAds 合集去重后独立运行。
> Bilibili ad-block and local-VIP spoofing, de-duplicated from blockAds.

**v7.19-lab4** · 18 参数 / 5 Rule / 18 Rewrite / 7 Script · 更新 `2026-09-29T05:10`

| | 中文 | English |
|---|---|---|
| 端点 | `myinfo`、`account/mine`、`account/mine/ipad`、`x/v2/space`、`x/v2/space/archive/cursor`、`x/v2/space/article` | same |
| 脚本 | 会员伪装 1 个自撰 + 3 个上游镜像 + 6 个引擎包 5.6 MB（镜像仍在 `main` 分支原目录，未复制） | 1 in-house + 3 mirrored + 6 engine bundles |
| 外部依赖 | 仅剩 `bsbsb.top`（广告时间库，无法镜像），见[第七章](#七空降助手机制--sponsorblock-mechanism) | only `bsbsb.top` remains |
| 开关 | `localVIP`、`localVIPSpace` 独立可控 | independently toggleable |
| 历史 | 见 [迭代记录](../../BILIBILI-ITERATION.md) | see the post-mortem |

> 本文描述**当前状态**与上游脚本机制（第六、七章）；踩坑过程 → 迭代记录。

### v7.19-lab 相对 v7.18 的变更

| 变更 | 说明 |
|---|---|
| **移：bundle 规则的 splash 分支（lab4）** | 抓包+离线复现证明：同一端点上 `[Rewrite]` 与 `[Script]` 同时命中时，**Loon 只执行 Rewrite**。bundle 的 splash 分支要 `delete account/event_list/preload/show`，而抓包里这些键全都还在（是 jq 置空的）⇒ 该分支从未执行。splash 一直由 jq 规则处理；`brand/list` 上 bundle 本来就零改动。**行为零变化** |
| **补：`Search/DefaultWords` 的 grpc 路径（lab3）** | 旧 mock 只覆盖 `app.bili*`，而实测 19 次请求里 **13 次走 `grpc.biliapi.net`** ⇒ 搜索框滚动推荐词在主力路径上从未被处理。mock 载荷本身是 gzip 帧，与该主机 `grpc-encoding: gzip` 一致 |
| **修：开关的真值判断（lab3）** | `!!A.vipAllUsers` / `if (A.vipFakeVerify)` 遇到 Loon 传下来的字符串 `"false"` 会当真 —— 关着的「全员大会员」会变成**给所有用户的主页挂伪装牌子**。抽出 `on()` 统一判断，两处都改 |
| **补：`/x/v2/space/article`（lab2）** | 专栏页响应里 `data.item[].author.vip` 用的是**「我的」页** schema，此前顶栏显示伪装、专栏列表显示真实牌子或没有牌子。抓包实证后补上，与顶栏共用 UID 门禁；`/x/v2/space/archive` 无 vip，不需要管 |
| 会员伪装合并为 `vip.js` | 原 `vip-theme.js` + `vip-space.js` 合并（226 行 → 120 行），同一张主题表、同一批牌子图、同一套默认值 |
| 修：个人主页配色漂移 | 旧版空间页的 `bg`/`fg` 硬编码绿鲤鱼配色，选「大会员/年度/百年」时**个人主页是绿底、我的页是粉底**。现已统一为主题配色 |
| 修：两页 `nickname_color` 不一致 | 空间页取用户手填背景色、我的页取主题色；现统一为主题色 |
| 修：会员伪装规则从未命中 | v7.18 第一条 `[Script]` 漏了 `https://` 前缀（`^(grpc\.biliapi\.net\|…`），真实 URL 永远不匹配。合并后已修正，`View/View` 与 `Reply/MainList` 首次真正生效 |
| 4 条 BiliUniverse 规则并 1 条 | 开屏 / 网页端推荐 / 番剧页 / 直播房间 → 1 条 alternation，正则逐条比对等价（见 `lpx-verify.mjs`） |
| `[Rewrite]` / `[Rule]` / `[Mitm]` | **零改动**，逐条字节比对一致 |
| 删 7 张无引用牌子图 | `upstream/vip-assets/` 11 张 → 4 张，省 117 KB |
| 未动 | 3 个彩蛋参数（`vipAllUsers` / `vipTargetMid` / `vipFakeVerify`）全部保留 |

验证：`node vip.test.mjs` 30 例全过（Node vm 模拟 Loon 运行时）；`node lpx-verify.mjs` 25 个 URL 端点逐条比对通过。

### 更新记录 · Changelog

| 时间 | 提交 | 变更 |
|---|---|---|
| `2026-09-29T05:10` | — | **v7.19-lab4** bundle 规则移除 splash 分支（死配置，行为零变化）。依据：同一 URL 上 `[Rewrite]` 与 `[Script]` 冲突时 Loon 只跑 Rewrite —— bundle 会删 `account/event_list/preload/show` 四键，而抓包里四键俱在、`event_list` 值为 `[]`（jq 的手笔）；离线把 bundle 架起来跑同一条载荷，它确实会删这四个键，说明有能力执行只是没被执行 |
| `2026-09-29T04:50` | — | **v7.19-lab3** 补 `Search/DefaultWords` 的 `grpc.biliapi.net`（实测主力路径，13/19 次）；修 `vipAllUsers` / `vipFakeVerify` 把字符串 `"false"` 当真的开关缺陷（用 `on()` 统一，`vip.test.mjs` 27 → 30 例）；`lpx-verify.mjs` 改相对路径并支持 Rewrite 白名单 |
| `2026-09-29T04:20` | — | **v7.19-lab2** 补 `/x/v2/space/article` 专栏页：其 `data.item[].author.vip` 与「我的」页同 schema，v7.19-lab 之前顶栏伪装而专栏列表显示真实牌子。`mine()` 抽出后与「我的」页共用同一份构造 |
| `2026-09-29T03:50` | — | **v7.19-lab** 代码精简：会员伪装合并单脚本、4 条规则并 1 条、清 7 张无引用素材、删 5 处失效注释；修个人主页配色漂移与「会员伪装规则漏 https:// 前缀」缺陷。详见上表 |
| `2026-09-29T01:15` | `—` | 搜索框滚动推荐词改用 `[Rewrite]` mock 返回空 gRPC 帧（`app.bili*` 域名）；此前三轮 `[Script]` 方案均未生效，已作废 |
| `2026-09-28T23:50` | `—` | **v7.18** 去广告改为强制生效：Loon 的 switch 参数无法可靠传入 bundle（DEBUG 日志显示 Settings=false 仍走「不去除」），删除全部 18 个开关，改为不声明即走 `default` 分支去除 |
| `2026-09-28T23:20` | `—` | **v7.17** 修复 BiliUniverse 开关默认值反了：参数语义是「是否保留」，原写成 `true` 导致开屏/热搜/动态/番剧/评论广告全部不去除；同时补齐 18 个未声明参数 |
| `2026-09-28T21:50` | `—` | `vip`（普通大会员）主题改用官方灰版 `gray-vip.png`——该档位权限与非会员相同，灰底如实反映 |
| `2026-09-28T21:30` | `—` | 新增参数 `myMid`：空间页伪装改为只作用于该 UID 的主页，**留空即关闭**（此前硬编码） |
| `2026-09-28T21:05` | `—` | **v7.16** 修空间页误改他人资料：`x/v2/space` 加 mid 判定，只改自己的主页；同时修掉 try 块顶层 `return` 的语法错误 |
| `2026-09-28T15:40` | — | 空降助手引擎包（chronos）镜像至 `upstream/chronos/`；`protobuf.response.js` 中 1 处 URL 改指本仓库，其余字节不变 |
| `2026-09-28T14:32` | `7ca3ac3` | `#!desc` 版本号 v6.0 → v7.15；修正重复标点；删除 v4 时代失效的「搜 PLUGIN_VERSION」说明（该常量在 5 个脚本中均不存在）；构建时间戳同步为实际提交时间 |
| `2026-09-28T14:25` | `b2b1c0d` | README 新增[第六章](#六上游脚本镜像--upstream-script-mirror)：目录结构、上游对应关系、SHA256 校验方法 |
| `2026-09-28T14:22` | `2b083ea` | 3 个上游 JS 镜像至 `upstream/`；`.lpx` 中 5 处 `script-path` 改指本仓库 |

**未升版本号**：`protobuf.response.js` 仅改 1 处 URL 指向，逻辑未动，
用户侧行为一致；镜像目标为上游原包的逐字节副本。改的只是**供给方**。
Bumped only the supply source, not behaviour.

> 版本号无代码依据，仅存在于 `#!name` 与本文档，改动后须手动同步。
> 版本号在代码层面无依据；`#!desc` 里的「搜 `PLUGIN_VERSION`」是 v4 时代残留，已删除。
>
> 表中时间为**各次提交的墙钟时间**（`git log` 原值），非脚本构建时间。
> Times are commit wall-clock (`git log`), not a build timestamp.

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Dedup/Bilibili-Dedup.lpx
```

CDN 缓存可能延迟更新，拉不到新版时加随机参数：`...lpx?cb=v712`

**需开启 MitM over HTTP/2。** Enable MitM over HTTP/2.

---

## 一、与 blockAds 的关系

blockAds（奶思合集）内置了 kokoryh 的完整 B 站规则集，与本插件功能重叠。
[`patch-blockads.py`](../../patches/README.md) 将合集里的 B 站部分**整段移除**：

| 段 | 移除内容 |
|---|---|
| `[Rewrite]` | 23 条 |
| `[Script]` | 4 条 |
| `[Rule]` | 5 条 |
| `[MITM]` | 6 个域名 |

其余 700+ App 的规则逐字节不动，Actions 每 6 小时自动同步。
The other 700+ apps are byte-for-byte untouched; Actions re-syncs every 6 hours.

---

## 二、功能 · Features

### 去广告 · Ad removal
推荐流 / 动态 / 搜索 / 番剧 / 直播 / 评论 / 播放页 / 开屏 / 短视频流 / 视频内插广告
Feed, dynamic, search, PGC, live, comments, playback, splash, shorts, in-video ads.

### 本地会员伪装 · Local VIP

5 种主题可切换，**已开通的真实大会员不会被改动**（判据 `status == 0`）。

| `vipTheme` | 显示 | `role` | 配色 |
|---|---|---|---|
| `fools_day_hundred_annual_vip` | **最强绿鲤鱼** | 15 | 绿底黑字 |
| `hundred_annual_vip` | 百年大会员 | 15 | 粉底白字 |
| `ten_annual_vip` | 十年大会员 | 7 | 粉底白字 |
| `annual_vip` | 年度大会员 | 3 | 粉底白字 |
| `vip` | 大会员 | 1 | 粉底白字 |

**Personal profile (`x/v2/space`) uses a different schema** and needs its own switch:

| | 账号页 / 我的页 | 个人资料页 |
|---|---|---|
| 端点 | `myinfo`、`account/mine` | `x/v2/space`(+`archive/cursor`、`article`) |
| 类型 | `type` / `status` | `vipType` / `vipStatus` |
| 到期 | `due_date` | `vipDueDate` |
| 非会员时 | `vip.status == 0` | **整个 `vip` 字段不存在** |

> ⚠️ 空间页有**两份 `vip`**，主页顶栏读的是 `data.card.vip` 而非 `data.vip`。
> 抓包实证：只写 `data.vip` 时顶栏仍显示灰色。**两处现在都会写入**，
> 且 `label` 对象逐字段一致，因此两页显示效果相同。
>
> The profile page has **two** `vip` objects; the header reads `data.card.vip`.
> Writing only `data.vip` leaves the header grey. Both are now written.

### 其他 · Misc
关闭弹幕 P2P（`[Rule]` 段 5 条，**无开关** · no switch）。

---

## 三、参数 · Parameters

### 本地会员 · Local VIP

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `localVIP` | switch | 开 | 账号页总开关 |
| `localVIPSpace` | switch | 开 | 个人资料页开关 |
| `myMid` | input | 空 | 我的 UID；**留空则空间页伪装不生效**，他人主页始终不受影响 |
| `vipAllUsers` | switch | 关 | 彩蛋：开启后**所有人的主页**都按上面的设置显示（含真会员） |
| `vipTargetMid` | input | 空 | 彩蛋：只让该 UID 的主页按上面的设置显示 |
| `vipTheme` | select | 最强绿鲤鱼 | 5 种主题 |
| `vipText` / `vipBg` / `vipFg` / `vipImg` | input | 空 | 留空用主题默认；`vipImg` **我的页与个人主页都生效** |
| `vipFakeVerify` | switch | 关 | 彩蛋：名字下方显示「bilibili UP主认证：xxx」。⚠️ 头像角标改不动（App 本地渲染，不读 `icon`） |
| `vipVerifyTitle` | input | 空 | 彩蛋：认证标题，留空显示「认证用户」 |

### 规则设计约定

| 约定 | 说明 |
|---|---|
| `[Rule]` 层 REJECT 的域名 | 走 DNS 拦截，**不进 `[MITM]`** |
| `[Rewrite]` 规则 | **无条件生效** —— Loon 手册中 `enable=` 仅记载于 `[Script]` |
| URL 正则 | 只写实际使用的域名，不留 `ap[ip]` 这类历史变体分支 |

### kokoryh 脚本 · kokoryh scripts

| 参数 | 默认 | 说明 |
|---|---|---|
| `sponsorBlock` | 开 | 空降助手（自动跳过视频内插广告），依赖两个外部服务，见[第七章](#七空降助手机制--sponsorblock-mechanism) |
| `optimizeRequest` | 开 | 优化评论区加载 |
| `purifyComment` | 开 | 移除评论区置顶商品广告 |
| `displayUpList` | `show` | 最常访问：`show`/`hide`/`auto` |
| `logLevel` | `off` | kokoryh 脚本日志 |
| `LogLevel` | `WARN` | BiliUniverse 脚本日志 |

> 界面（顶栏/标签页/底栏）由 [Bilibili-UI](../Bilibili-UI/) 负责，本插件不控制。

---

## 四、兼容性 · Compatibility

| 冲突 | 说明 |
|---|---|
| Bilibili-UI 的 `Mine` 功能 | 两者都改 `account/mine`。字段不重叠（`vip` vs 服务列表），但同响应两脚本顺序不可控。要用我的页自定义时先关本插件 `localVIP` |
| blockAds | 须使用**已移除 B 站部分的版本**，否则 B 站规则重复执行 |

---

## 五、验证依据 · Verification

字段选择基于**用户实测双抓包对照**（插件开/关各一份），非文档推断：

| 字段 | 原生实测 | 结论 |
|---|---|---|
| `due_date` | `1721577600000` | **毫秒**时间戳 |
| `status` / `type` | 0 / 1 | 置 1 / 2 |
| `vip_section` | 存在 | 已删除 |
| `ott_info` / `super_vip` / `tv_*` | — | 未被误伤 |

墨鱼 `Module.sgmodule` 与原生一致（毫秒），可交叉印证。

> 另：App 对空间页会员标**走文字渲染**（`text` + `bg_color`），
> 抓包里一次 `/bfs/vip/` 图片请求都不发，故 `image` 留空即可。

**空降助手**结论来自一次完整抓包（164 条，含自动跳过全过程）：

| 观察项 | 抓包证据 |
|---|---|
| API 返回真实数据 | `bsbsb.top` 返 `segment:[118.933,157.766]`、`videoDuration:384.986` |
| chronos 已被改写 | 首次抓包（**镜像前**）`file` 指向 `raw.githubusercontent.com/kokoryh/chronos/…`，非 `hdslb.com` |
| 原生路径被旁路 | `ObtainChronosPackage` 仍请求，但其 md5 不在脚本映射表内，未被采用 |
| 自动跳转时刻 | 用户实测：播放至 2:00 自动跳至 2:38，与 `segment` 端点吻合 |
| 撤销按钮 | 用户实测：播放器左下弹出粉色「撤销空降」，与 chronos 包 `AirborneToast` 的 `fillColor=BILI_PINK` 一致 |

**镜像改写的实机验证**（第二次抓包，238 条，iPhone 国际版）：

| 观察项 | 证据 |
|---|---|
| 改写生效 | `ViewProgress` 响应 `chronos.f2` = `raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Dedup/upstream/chronos/8c3feda2….zip` |
| 弹幕注入 | `DmSegMobile` 响应中确认含 `空指部已就位`（同批另一条请求不含） |
| 无重复下载 | 全程无 chronos zip 请求 → App 命中 MD5 缓存（镜像包与原包字节相同） |
| 兜底路径 | UA `bili-inter/82300200` → `inter` 档 → `8c3feda2…`，与表一致 |

---

## 六、上游脚本镜像 · Upstream Script Mirror

`[Script]` 段引用的脚本全部由本仓库托管（测试版走 `lab` 分支，上游镜像走 `main` 分支），
不依赖任何上游仓库的可用性。

```
plugins/Bilibili-Dedup-lab/
├── Bilibili-Dedup-lab.lpx
├── icon.png               17 KB  插件图标（256×256，复制自已发布版本）
├── vip.js                  5.7 KB  会员伪装：我的页 + 个人主页
├── vip.test.mjs             14 KB  回归测试，30 例（Node vm 模拟 Loon 运行时）
├── lpx-verify.mjs          5.8 KB  清单校验：与 v7.18 逐条比对 Rewrite/Rule/Mitm/Script
└── （upstream/ 镜像仍在 main 分支的 plugins/Bilibili-Dedup/ 下，未复制到测试版目录）

plugins/Bilibili-Dedup/upstream/            # 3 个上游脚本 + 6 个引擎包
    ├── protobuf.request.js     62 KB
    ├── protobuf.response.js    95 KB  ⚠️ 已改 URL，见下
    ├── adblock.bundle.js      842 KB
    ├── adblock-hotsearch.js   817 B
    ├── chronos/                5.6 MB  空降助手引擎包 ×6
    ├── vip-assets/             52 KB  4 张牌子图（另有 7 张无引用已删）
    └── MANIFEST.json
```

### 上游对应关系 · Provenance

| 本地文件 | 上游来源 | 用途 |
|---|---|---|
| `upstream/protobuf.request.js` | [kokoryh/Sparkle](https://github.com/kokoryh/Sparkle) `master/dist/bilibili.protobuf.request.js` | 评论请求优化、空降助手 |
| `upstream/protobuf.response.js` | [kokoryh/Sparkle](https://github.com/kokoryh/Sparkle) `master/dist/bilibili.protobuf.response.js` | protobuf 响应处理 |
| `upstream/adblock.bundle.js` | [BiliUniverse/ADBlock](https://github.com/BiliUniverse/ADBlock) `releases/download/v0.6.24/response.bundle.js` | 去广告主逻辑（19 项参数）。**现只用于番剧页 / 网页端推荐 / 直播房间 3 个端点**；splash 由 `[Rewrite]` 的 jq 负责 |
| `icon.png` | BiliUniverse `src/assets/icon_rounded.png` | 插件图标；**原图 1024×1024 缩放至 256×256**（67 KB → 17 KB） |
| `vip.js` | 本仓库自撰 · written in-house | 会员伪装（我的页 + 个人主页） |

三个上游**脚本**中，`protobuf.request.js` 与 `adblock.bundle.js` **逐字节原样镜像**，
`protobuf.response.js` **仅改动 1 处 URL**（下方说明）。版本固定在 BiliUniverse `v0.6.24`，
其余取自 kokoryh 提交 `master` 当时的快照。图标是唯一做过尺寸压缩的文件。

### 唯一的改动：`protobuf.response.js` 的 chronos 地址

空降助手需要 App 加载一个引擎包，原地址硬编码在 `ii()` 里：

```js
// 改前（镜像前）
a.file = `https://raw.githubusercontent.com/kokoryh/chronos/refs/heads/master/${n}.zip`
// 改后
a.file = `https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Dedup/upstream/chronos/${n}.zip`
```

**全文仅此一处**（`${n}` 保持原样，映射表 6 个键不变），文件其余 97357−38 字节与上游完全一致。
`MANIFEST.json` 中该条目标 `"modified": true` 并附改动说明。

**为什么要改**：这三个依赖是三重冻结的 ——

| 层面 | 冻结原因 |
|---|---|
| URL 模板 | 映射表 `Ti()` 的 6 个键写死在脚本里，上游新增的包脚本够不到 |
| 文件名 | 只有这 6 个固定名字 |
| 文件内容 | 6 个包每个**只提交过 1 次**，从未被覆盖 |

后果：上游仍在维护（最近 push 2026-07-04），但你跑的是 `danmaku-flame-master` **2.7.4**，
而上游已出到 **3.8.20** —— 跨一个大版本且**永远不会自动到达**。
镜像后即使上游删库、删分支或删文件，均不影响本插件。

> 另有两个新包（`21950f4b…` 3.8.14 / `28be59e0…` 3.8.2）**未镜像**：
> 脚本的映射表够不到它们，除非同时改 `Ti()` 逻辑 —— 那属于修改上游行为，风险大于收益。

### 这 6 个包的来历存疑

包里 `info.json` 自称是 B 站官方引擎，但**无法证实**。核查结果：

| 检验 | 结果 |
|---|---|
| `bilibili/DanmakuFlameMaster` 开源仓库 | 存在，2013 年建，**2018-03 停更于 v0.9.25** |
| 包内版本号 | **2.7.3 / 2.7.4 / 3.6.3 / 3.6.4 / 3.8.7 / 3.8.20** |
| `info.json` 声称的 4 个 commit | GitHub API 全部返回 **422 No commit found for SHA**（格式合法但仓库无此对象） |
| `is_main_package` 字段 | 仅 3.6+ 的 4 个包有，2.7.x 无 —— 属**打包者定义**的标记 |

> 开源仓库停在 0.9.25，包是 2.7.4+ —— 中间 1.8→2.7 的代码在 B 站**内部私有仓库**，
> `info.json` 的 `commit` 指向那里，外部无法验证。**不是伪造，是无法证实。**

`res/*_script.js` 里的 `node_modules/@bilibili/cronc/` 证明确实使用了 B 站内部构建工具链，
包的形态（引擎 + 素材 + 字体 + GLSL）也符合正式发布物。**但这只能说明「血统来自 B 站」，
不能说明包内每一行都是 B 站原装。**

**为何仍然镜像**：`撤销空降`（`AirborneToast`）是 B 站 App 从未暴露任何 UI 入口的功能，
而该功能只存在于这些包中。**它们是这份代码唯一的公开副本** ——
若确系二次打包，则上游删库意味着代码永久失传，风险高于普通依赖。

### 包里装的是什么

`93200207….zip`（879 KB）解压后 **3.6 MB / 102 项**：

```
index.js          2.1 MB   引擎主逻辑（混淆，单行）
info.json         232 B    元信息
res/                       资源
├── dfm_script.js   866 KB  ┐
├── task_script.js   73 KB  ├ 三份按需加载的子脚本
├── mask_script.js   60 KB  ┘
├── font/mono.ttf   166 KB   等宽字体
├── triple_like/    166 KB   三连动画
├── absorb/          31 KB   弹幕吸附（含 GLSL 着色器）
├── interaction/     37 KB   互动视频
├── others/          20 KB   含 airborne.png（1.5 KB）
├── fold_danmaku/    11 KB
├── command/         11 KB   签到、稍后再看等指令弹幕
└── ad/            1.3 KB   仅 4 张小图标
```

**空降助手在这 2.1 MB 里只占极小一块**，借用的是整个引擎：

- `撤销空降` 按钮**无素材** —— 纯代码绘制：系统字体 18px、`Color.BILI_PINK`、60% 黑底圆角矩形
- `res/ad/` 的 4 张图是「看广告」功能的 UI（关闭按钮、浮窗箭头），与跳转无关
- `res/others/airborne.png` 是唯一相关素材

其余功能（三连动画、互动视频、指令弹幕、弹幕吸附）均与空降无关 —— **5.6 MB 的体积是为整个弹幕引擎付的**。

### 已冻结的映射表

`Ti()` 内置 **9 个条目 → 6 个包**：

| 源 md5 / 档位 | → 目标包 | 版本 |
|---|---|---|
| `325e7073…` | `93200207…` | 2.7.4 ← **当前使用** |
| `45b564b5…` | `e5a968f1…` | 3.8.20 |
| `c29bd8f2…` | `ecca73e4…` | 3.6.4 |
| `c218977c…` / `hd` 兜底 | `f993a054…` | 3.8.7 |
| `8232ffb6…` | `feaca416…` | 3.6.3 |
| `3a14bedd…` / `inter` 兜底 | `8c3feda2…` | 2.7.3 |
| `universal` 兜底 | `e5a968f1…` | 3.8.20 |

选包规则：**先查 App 下发的 `chronos.md5`，查不到才按 UA 前缀兜底**（`bili-hd` / `bili-inter` / 其他）。
**与设备型号、视频内容、观看记录均无关** —— 取决于 App 内置的引擎版本。

你当前 App 下发 `325e7073…`（B 站原生包），命中第一行，全程未走兜底。
App 更新导致 md5 变化时才会触发兜底，**届时会静默换成 3.8.20，无任何提示**。

### 实测两条路径都走过

两次抓包分别命中**不同分支**，验证了上表：

| | iPad（`bili-hd2/37100100`） | iPhone 国际版（`bili-inter/82300200`） |
|---|---|---|
| 端点 | `view.v1.View/ViewProgress` | `viewunite.v1.View/ViewProgress` |
| App 下发 md5 | `325e7073…`（表内**键**） | 非表内值 → 走兜底 |
| 判定 | ① md5 命中 | ② `xi()` 读 UA → `bili-inter` → `inter` 档 |
| 拿到 | `93200207…`（2.7.4） | `8c3feda2…`（2.7.3） |
| `chronos.file` | 指向本仓库 ✅ | 指向本仓库 ✅ |

**两台设备的 `chronos.file` 都指向本仓库** —— 镜像改写实机验证通过。

国际版那次也印证了兜底逻辑本身：`inter` 档的目标 `8c3feda2…` 与实际响应完全一致。

> iPhone 全程无 zip 下载记录（238 条中仅有的 3 个 `.zip` 是 `fawkes` 灰度配置，无关）。
> App 按 **MD5 = 文件名** 判重，镜像包与原包字节相同 → 缓存键相同 → 命中已有缓存。
> 这同时验证了镜像的等价性。

> `.lpx` 中**所有**外部 URL（含 `#!icon`）均指向本仓库，清单层已无指向
> kokoryh / BiliUniverse 的可拉取地址。
> `MANIFEST.json` 的 `source` 字段保留上游地址，仅作溯源，运行时不会被读取。
>
> ⚠️ **脚本内部仍有一个硬编码依赖**：`sponsorBlock` 的广告时间数据库
> `bsbsb.top`，`[Script]` 的 `script-path` 管不到，详见[第七章](#七空降助手机制--sponsorblock-mechanism)。

### 校验 · Verification

`upstream/MANIFEST.json` 记录每个文件的原始 URL、字节数、SHA256 与镜像日期。
本地核对（在插件目录下执行）：

```bash
python3 -c "
import json,hashlib,pathlib
m=json.load(open('upstream/MANIFEST.json'))
base=pathlib.Path('upstream')
for k,v in m.items():
    p=base/k
    if not p.exists(): p=pathlib.Path(k)
    ok=p.exists() and hashlib.sha256(p.read_bytes()).hexdigest()==v['sha256']
    print('OK  ' if ok else 'FAIL', k)"
```

脚本项在 `upstream/` 下，图标项 `icon.png` 在插件根目录 —— 故先试 `upstream/k`，回退到 `k`。

> B 站去广告逻辑依赖 B 站接口，上游接口一变即失配。
> 上游发布新版本时，改 `MANIFEST.json` 里的 `source`、替换文件、重算 SHA256。
> Ad-block logic tracks Bilibili's API and breaks when upstream changes.

---

## 七、空降助手机制 · SponsorBlock Mechanism

开关 `sponsorBlock`。**到广告起点后 2 秒自动跳到广告终点**，播放器左下角弹出
「撤销空降」按钮，5 秒后自动消失。下方为抓包逆向所得，非官方文档。

Automatically seeks past in-video ads ~2s in, offering a 5-second "撤销空降" undo.

### 完整链路

```
① protobuf.request.js  Pt()
   GET https://bsbsb.top/api/skipSegments?videoID=<bvid>&cid=<cid>&category=sponsor
   ← 广告时间段在这里（第三方服务，非 B 站接口）
   tn() 过滤：actionType=="skip" 且 segment 时长 ≥ 8 秒

② protobuf.request.js  nn()
   往弹幕流注入一条：
     content = "空指部已就位"        ← 触发钥匙
     progress = 广告起点×1000 + 2000
     action   = airborne:<广告终点×1000>

③ protobuf.response.js  ii()   （ViewProgress 端点，共两处调用）
   改写响应里的 chronos 字段：
     file → raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Dedup/upstream/chronos/<md5>.zip
     sign → 清空

④ App 加载该 chronos 包（弹幕焰火引擎），到点识别 content 匹配
   → 自动 seekTo(广告终点) + 弹出「撤销空降」
```

**两个脚本缺一不可**：② 造弹幕，③ 换引擎。只有 ② 会得到一条需要手点的弹幕；
只有 ③ 则 App 不认识 `airborne:` 动作。

### 撤销按钮的两种触发

| 触发 | 撤销行为 |
|---|---|
| 自动（弹幕到点） | `seekTo(广告起点+1秒)` |
| 手动点弹幕 | `seekTo(点击那一刻)` |

### 三个硬编码阈值

| 值 | 位置 | 含义 |
|---|---|---|
| `≥ 8` 秒 | `tn()` | 短于 8 秒的广告不跳 |
| `+ 2000` ms | `nn()` | 弹幕在广告开始后 2 秒出现 |
| `5` 秒 | chronos 包内 | 撤销按钮停留时长 |

均写死在脚本里，**参数无法调节**。`sponsorBlock` 只控制 `.lpx` 的 `enable=`，
脚本内部并不读这个值。

### 两个外部依赖

| 依赖 | 地址 | 状态 |
|---|---|---|
| 广告时间数据库 | `bsbsb.top`（SponsorBlock 协议分支，Cloudflare） | 活；**个人第三方服务，非 B 站接口** |
| chronos 引擎包 | **本仓库 `upstream/chronos/`** | ✅ 已镜像 6 个（5.6 MB）；来历存疑，见[第六章](#六上游脚本镜像--upstream-script-mirror) |

> **`bsbsb.top` 是链路上唯一无法自持的依赖。** 广告时间不由 B 站接口提供
> （实测 `PlayURL/PlayView` 响应内无任何广告段），只能靠社区提交 + 投票积累，
> 而此实例**未开放提交端点**。因此自建服务解决不了「谁维护数据」——空库等于无功能。
> UUID 支持 4 位前缀枚举，理论上可导出全库快照，但库在持续更新，
> 快照会过时，且不解决新视频无数据的问题。**维持现状是唯一合理选择。**
>
> chronos 引擎包已镜像（见[第六章](#六上游脚本镜像--upstream-script-mirror)），
> 上游删库不影响本插件。

> 这两个是**脚本内部硬编码**的，`[Script]` 的 `script-path` 管不到。
> chronos 包已通过改写 `ii()` 的 URL 镜像到本仓库；
> `bsbsb.top` 因数据来源问题无法镜像（见上）。
>
> 失效表现：广告照播，**无任何提示**（脚本内 catch 后静默返回空列表）。
> 排查时把 `logLevel` 调到 `debug` 可见。
>
> 关闭本功能可避开 `bsbsb.top` 依赖：`sponsorBlock` 关掉后 `enable=` 会跳过规则，
> `request.js` 不执行。

---

## 致谢 · Credits

上游脚本镜像至 [`upstream/`](upstream/)，图标缩放后存于插件根目录。
除 `protobuf.response.js` 中 1 处 chronos URL 外**未修改任何逻辑**；
清单中另有一个本仓库自撰脚本（`vip.js`）。
Upstream scripts are mirrored **byte-for-byte** — no logic modified, only manifest
entries and parameter declarations reorganized. Two in-house scripts added.

| 作者 | 项目 |
|---|---|
| **Maasea** | B 站 protobuf 脚本 |
| **kokoryh** | bilibili protobuf / 空降助手 |
| **VirgilClyne**、**app2smile** | BiliUniverse ADBlock |
| **fmz200（奶思）** | blockAds 合集（规则来源） |
| **zirawell** | 年度大会员实现参考 |

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
