# Spotify-Dedup · Spotify 去广告（合订版）

> 合并 **kelee 的开关版脚本** + **730 合集的 gae2 老端点拦截** + **kelee 的 QUIC 封锁**，
> 并让 blockAds 合集里那份重复的 Spotify 规则整体退场。
> Merges the switch-capable script from kelee with the two rules that only one of the
> other two sources had, and removes the duplicate Spotify rules from the blockAds collection.

**一个插件，三份来源合并 · One plugin, three sources merged**

**v1.4** — 移除三项会导致部分歌曲无法播放的假权限（`high-bitrate` / `libspotify` / `audio-quality`）

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Spotify-Dedup/Spotify-Dedup.lpx
```

装这个之后，**blockAds 合集里的 Spotify 规则已经自动退场**（`[MITM]` 也不再解密
`*‑spclient.spotify.com`），两者不会撞车。

> 更新后请在 Loon 里刷新一次插件（raw CDN 缓存约 24h，必要时加 `?cb=2`）。

---

## 🔴 v1.4 修的是什么 · Why some tracks wouldn't play

v1.3 引入后用户报「拖动进度条导致歌曲自动跳过，且有些歌无法播放」。
查包定位到根因，**是我自己写进去的属性**。

抓包里 `playplay/v1/key/` 有 7 次 403（其余 25 次全 200），
`track-error` 同步上报 7 次。相关性零例外：

| `storage-resolve` 档位 | `playplay` 结果 |
|---|---|
| `interactive/0` | 200 × 12 |
| `interactive/1` | 200 × 12 |
| **`interactive/2`**（24-bit 无损） | **403 × 7** |

`storage-resolve` 照样 200 并返回 CDN 链接，但 `playplay` 的播放密钥被拒。

**为什么** —— 你的一次对照实验（关脚本 → 重新登录 → 音质改回默认 → 开脚本 → 重新登录，
抓包 1141 条）把服务端对**免费账号**真实下发的值照了出来：

| 属性 | 服务端真实值 | v1.2 写的 |
|---|---|---|
| `high-bitrate` | **`false`** | `true` |
| `libspotify` | **`false`** | `true` |
| `audio-quality` | **`"0"`** | `"1"` |

服务端**从来没给过**这三个权限。脚本硬写成 true，客户端就以为有了，
去请求 `interactive/2` 无损档，服务端在 `playplay` 阶段直接拒绝
⇒ 拿不到播放密钥 ⇒ 跳歌 + 部分歌曲播不了。

同一份包的脚本关闭段：`playplay` 16 次全 200、CDN 15 次全 206、`track-error` **0 次**。

**v1.4 把这三项删掉**，属性表 38 → 35。代价是失去音质相关的「解锁」——
而那本来就是拿不到的。`test/script.test.mjs`【3b】有 7 条断言钉住
「必须保持服务端原值」，反向验证过：把 `audio-quality` 加回去会红 4 条。

> 顺带说明：`Amlabort` 那份插件也没写这三个 —— 当时只当它是风格差异，
> 现在知道那是同一个判断。

---

## v1.3 加了什么 · The two endpoints 38 properties can't reach

v1.2 的 38 项属性**全部作用在 bootstrap / customize 响应上**。
但真机抓包（iPad 115 秒 893 条 + iPhone 55 秒 424 条）暴露了两个独立端点，属性表改不到：

| 端点 | 是什么 | 实测 |
|---|---|---|
| `watch-feed-entrypoints/v1/discovery-from-seed` | 播放页「探索」内容 | iPad ×18（3.5–4.0 KB）、iPhone ×4（1.7–2.0 KB） |
| `pam-view-service` | 设置页会员信息 | `GetPremiumPlanRow` 返回 63 B protobuf，**明文 `Spotify Free` + 「查看可用套餐」**；`GetPlanOverview` 返回 344 B，含「在网页上管理你的 Premium 套餐」「继续使用 Premium」「续订订阅项目」 |

两个平台都复现。v1.3 用 `reject-dict` 屏蔽，**与既有 pendragon 同一手法**
（`pam-view-service` 是 protobuf/grpc，而 pendragon 也是 grpc 且实测拦截成功）。

### 刻意**不**加的两条，附理由

| 候选 | 实测 | 决定 |
|---|---|---|
| `/ads/` | `ads/v3/ads` 返回 `{"marquee":[]}`（空）；`ads/v2/config` 607 B 是 ad-logic 状态机配置 | ❌ 不加 |
| `aet.spotify.com` | iPad ×1 / iPhone ×1，**都返回 0 字节** | ❌ 不加 |

`/ads/` 那条值得说清楚：广告之所以为空，是因为**脚本已经把 `ads` 属性置成 `false`，
服务端本来就不下发广告**。再去拦 `ads/v2/config` 会打断 `ad-logic/prefetch` 的正常轮询
—— 收益为零，风险为正。KPI0/fuck-Ads 那份拦了 `/ads/` 和 `/ad-logic/`，
但那是纯屏蔽插件，不承担「不能影响正常功能」的约束。

另：`37i9dQZF1EYkqdzj48dyYq`（AI DJ 歌单）两份抓包里都稳定 404，
Amlabort 为它加的 `reject-dict` 确已无意义，本版不跟。

---

## v1.2 做了什么 · Why 10 → 38 properties

## 合并了什么 · What was merged

同一批 Spotify 端点分散在两个上游里各有一份，Loon first-match-wins，
先加载的那个赢，另一份等于白装。本插件把两边能力收成一份：

| 规则 | kelee | 730 | 本插件 | Amlaborth |
|---|:--:|:--:|:--:|:--:|
| `pendragon` 广告配置 `reject-dict` | ✅ | ✅ | ✅ | ✅ |
| `artistview` iphone→ipad 改写 | ✅ | ✅ | ✅ | — |
| `gae2-spclient` `/ad` 拦截 | — | ✅ | ✅ | — |
| `watch-feed-entrypoints` `reject-dict` | — | — | ✅ **（v1.3 新增）** | ✅ |
| `pam-view-service` `reject-dict` | — | — | ✅ **（v1.3 新增）** | ✅ |
| `spotify.com` + QUIC → REJECT | ✅ | — | ✅ | ✅ |
| bootstrap Protobuf 脚本 | ✅（带开关） | ✅（开关失效） | ✅（kelee 那份 + crack-dev 属性表） | ✅ |

前两条 Rewrite 在 kelee 与 730 里**逐字节相同**，MITM 域名也相同。

---

## v1.2 做了什么 · Why 10 → 38 properties

2026-09-30 做了一次真机抓包验证（iPad 86 秒 601 条，流程是「已登录打开 → 退出登录 → 重新登录」），
把脚本交付给 App 的响应解出来一看，结论很明确：

> **去广告有效，但解锁维度基本没生效。**

| 属性 | v1.1 交付的值 | v1.2 交付的值 |
|---|---|---|
| `catalogue` | `free` | `premium` |
| `smart-shuffle` | `UNAVAILABLE` | `AVAILABLE` |
| `mixing-tools` | `VIEW` | `EDIT` |
| `offline-backup` | `DISABLED` | `UNRESTRICTED` |
| `social-session` / `can_use_superbird` | `false` | `true` |
| `jam-social-session` | `BASIC` | `EXPANDED` |
| `subscription-enddate` / `product-expiry` | **缺失** | 当前时间 +1 个月 |
| `loudness-levels` / `unrestricted` | **缺失** | 已写入 |

原因在脚本本身：v1.1 托管的 kelee 版只写 10 个 `accountAttributes`，
而 001ProMax 现役的 `Spotify.Crack.Dev.js` 写 36 个。

v1.2 取两者之长：

- **属性表**换成 crack-dev 的 36 项 + kelee 独有的 2 项（`publish-playlist`、`financial-product`）
- **开关机制**继续用 kelee 那份（`$argument` 出现 4 次，crack-dev 是 0 次）
- **protobuf 读写器、开关逻辑、状态守卫一行未动**

⚠️ 其中 3 项后来在 v1.4 剔除了 —— 详见上面「v1.4 修的是什么」。

改动由 `patch/merge-crack-dev.py` 生成（幂等可重跑），不是手改压缩过的 JS。

> ⚠️ **`subscription-enddate` / `product-expiry` 是伪装值**（沿用上游语义 = 当前时间 +1 个月），
> 不代表真实订阅。1 个月后想刷新显示，需要重新登录触发一次全量响应。
>
> ⚠️ 这些是**客户端显示层**的伪装，不改变服务端账号状态。
> 音质/下载等实际权益仍受服务端校验。

---

## 已知问题 · Known issues

### 🔴 如果 `pendragon` 突然不生效，先别改正则

2026-09-30 出现过一次「v1.1 全失效、v1.2 全正常」的诡异现象，值得记下来。

**现象**：v1.1 抓包里 8 次 pendragon 全部走真实服务器，`_loon.rewrite` 601 条全空。
但**规则文本、MITM、插件加载、正则匹配全部正常** —— 我为此查了三轮，盯着正则找。

**根因**：v1.2 的 `[Rewrite]` 三条与 v1.1 **逐字节相同**，本次唯一变的是脚本。
而 pendragon 从「零命中」变成「iPad 3/3、iPhone 1/1 全中」。

```
v1.1 抓包: (rule非空, rewrite非空) → {True:485}              rewrite 全灭
v1.2 抓包: (rule非空, rewrite非空) → {True:833, rewrite:3}  ← 活了
```

**结论：`[Rewrite]` 与 `[Script]` 是同一个解析单元。换了 script 内容 → Loon 重新解析
整个 lpx → `[Rewrite]` 随之恢复。**（这与 B 站 2026-09-30 19:51→20:18 那次同款机制。）

**推论**：以后若发现「Rewrite 突然不生效」，**先怀疑解析状态，别急着改正则** ——
正则写对了也可能就是不跑。常规动作是改一下脚本内容或重新导入插件，让 Loon 重新解析。

### 🔴 `tab` 开关当前无效

抓包解出的 1125 条 `assignedValues` 里，`tab_configuration` 出现 0 次，
scope `ios-feature-navigation` 整个不存在。回放 `tab=true` / `tab=false` 输出逐字节相同。
**iPad 与 iPhone 两个平台都如此。**

第三方佐证：`Amlabort/MY_clash` 的 `spot-proto-ev3.js` 里
`tab_configuration` 那段 JSON **是被注释掉的** —— 连 2026 年最新的第三方脚本
也当它是死属性。

**没有删这个开关**：Spotify 若恢复下发该属性，它无需改动即自动生效。
测试里已把「当前无效」这个事实钉住，哪天属性回来了测试会红，会提醒回来改。

### `gae2-spclient` 那条是死规则

全 HAR 里 `gae2-spclient.spotify.com` 出现 0 次 —— 当前客户端只走
`guc3-spclient.spotify.com`。这条来自 730 合集，是上一代客户端的端点。
暂未删除（删它属于另一次改动），想删直接删掉那一行即可。

### 改开关必须重新登录

⚠️ **`tab` / `useractivity` 改完必须重新登录 Spotify 才生效。**

已登录冷启动时，Spotify 对 `user-customization-service` 只发一个 **304**
（带 `if-none-match`，命中本地缓存），而脚本首行
`200 !== $response.status` 会直接 `$done({})` 放行 —— 没有任何 body 可改。
必须走一次真实登录，才有 200 全量响应。

> 别的插件（`app2smile`、`Moli-X/Resources`、`Amlabort`）用另一条 Rewrite
> `header-del if-none-match` 删掉这个请求头，让服务端每次都返回全量，就不必重新登录。
> 本仓库尚未采用（会让脚本每次都跑，代价是流量与耗时）。

---

## 开关 · Switches

| 开关 | 默认 | 作用 |
|---|---|---|
| `tab` | **关** | 打开后隐藏底栏中间的「创建」按钮 ⚠️ 当前无效，见「已知问题」 |
| `useractivity` | **开** | 关闭后禁用「共享播放 / Apple 设备接力」入口 ✅ 实测有效 |

> ⚠️ **广告还在、脚本像没跑过？先确认 Spotify 没在走 QUIC。**
> 本插件有一条无条件规则把 `spotify.com` 的 QUIC 连接 REJECT 掉，
> 强制回落到 TCP+MITM —— 不这样脚本一次都不会触发。无法用开关关闭
> （原因见下）。

### 为什么只有两个开关，3 条 Rewrite 和 QUIC 规则都没有

v1.0 曾给 QUIC 规则挂过开关，真机直接弹窗报错：

```
Policy match error. Can not find policy:REJECT, enable={blockQuic},
use the global first node.
```

**`enable=` 不能挂在逻辑规则上。** Loon 不解析逻辑规则尾部的 `enable=`，
而是把最后那对 `))` 之后的**全部**内容当成策略名 ——
于是去找一个叫「`REJECT, enable={blockQuic}`」的策略，找不到，
**回落到第一个节点**。也就是说那条 QUIC 拦截其实压根没生效。

查证：blockAds 上游 59 条逻辑规则（`AND`/`OR`/`NOT`）**零**使用 `enable=`。

同类的坑还有两处，`manifest.test.mjs` 各有一条断言守着：

- **`enable=` 在 `[Rewrite]` 上也没有依据** —— 官方手册未记载，
  上游 4362 条 Rewrite 里零使用，本仓库只有 `[Rule]` 挂过（`DOMAIN, ...` 那种普通规则，真机验过）
- **写一个不生效的 `enable=` 比不写更糟** —— 你会以为开关管用

所以现在：3 条 Rewrite、1 条 QUIC 逻辑规则，全部无条件；
只有 `tab` / `useractivity` 两个开关，作用在脚本的 `$argument` 上（那个是真的）。

想关掉某条 Rewrite 或 QUIC 拦截，只能把那一行整条删掉。

---

## 装了会怎样 · What you get

- 播放前广告消失（`pendragon` 配置返回空字典 + bootstrap 里的 `ads` 属性置空）
- 播放页「探索」内容消失（`watch-feed-entrypoints`，v1.3）
- 设置页不再显示 `Spotify Free` 与升级引导（`pam-view-service`，v1.3）
- 歌手/专辑列表恢复正常展示（`ios-system-your-plan-sidedrawer` 恒为关闭）
- 客户端显示为 Premium 状态：目录、离线下载、有声书、智能洗牌、歌词离线、
  混音工具等一并开启
- **不写服务端不认的假权限**（`high-bitrate` / `libspotify` / `audio-quality`）——
  见「v1.4 修的是什么」，写这些会导致部分歌曲无法播放
- 想要的话还能关掉 Apple 设备接力（`tab` 开关当前无效）
- 老版本客户端的 `gae2` 广告端点也被拦
- **iPad / iPhone 通用** —— 实测两端属性值完全一致，服务端下发仅 4 处平台差异
- **不与 blockAds 合集撞车** —— 那份的 Spotify 规则已在 `patches/patch-blockads.py` 里退场

---

## 文件 · Files

| 文件 | 用途 | Purpose |
|---|---|---|
| `Spotify-Dedup.lpx` | 插件清单，规则逐条标注出处 | Manifest, each rule annotated with its source |
| `src/spotify.response.js` | 脚本（v1.2 起属性表已扩展，SHA256 由测试钉死） | The script; property table extended in v1.2 |
| `src/UPSTREAM.md` | 出处、SHA256、三个版本的关系、v1.2 改动明细 | Provenance, hashes, version relationship, v1.2 changelog |
| `patch/merge-crack-dev.py` | 生成 v1.2 脚本，幂等 | Generates the v1.2 script, idempotent |
| `patch/make-fixture.py` | 从 HAR 生成脱敏测试数据 | Generates redacted fixtures from a HAR |
| `test/script.test.mjs` | 47 条断言，拿真机响应体回放脚本 | 47 assertions replaying real response bodies |
| `test/manifest.test.mjs` | 34 条断言，清单层 | 34 assertions on the manifest |
| `test/fixtures/*.bin.gz` | 真机响应体（83 KB → 25 KB，已脱敏） | Real device responses, redacted |

---

## 测试 · Tests

```
cd plugins/Spotify-Dedup
node test/script.test.mjs      # 脚本层：回放真机响应体，解码逐条比对（47 断言）
node test/manifest.test.mjs    # 清单层：合并完整性 / 开关接线 / enable= 位置 / 新规则正则
```

`script.test.mjs` 拿 2026-09-30 那份真机抓包里的两份 83 KB protobuf 响应体
反复回放脚本，再把输出解回来比对。**光读代码是不够的** ——
v1.1 那 10 项属性「看起来完全正常」，只有真跑一遍才发现另外 26 项根本没被写。

`manifest.test.mjs` 里有 3 条断言**用真机抓包里的原始 URL 验证新规则的正则能匹配**
（逐字节照抄那 4 条真实请求）。反向验证过：删掉新规则 → 4 条转红；
把 host 前缀漏掉 `(?::443)?` → 2 条转红（`guc3-spclient.spotify.com` 带 `:443`，
写错就匹配不上，这类错肉眼很难看出来）。

反向验证：把脚本退回 kelee 原版，`script.test.mjs` 有 10 条断言转红。

fixture 由 `patch/make-fixture.py` 从 HAR 生成，`account-id` / `strider-key` /
`at-signal` / `account-creation-time` / `feature-set-id-masked` 做了**等长**字节替换
（等长是为了不改 protobuf 的长度前缀，结构与原响应完全一致），可安全入库。

---

## 致谢 · Credits

- **001ProMax** <https://github.com/001ProMax> — 原作者
- **kelee** <https://hub.kelee.one> — 开关版脚本的托管与改造

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
