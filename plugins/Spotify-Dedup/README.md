# Spotify-Dedup · Spotify 去广告（合订版）

> 合并 **kelee 的开关版脚本** + **730 合集的 gae2 老端点拦截** + **kelee 的 QUIC 封锁**，
> 并让 blockAds 合集里那份重复的 Spotify 规则整体退场。
> Merges the switch-capable script from kelee with the two rules that only one of the
> other two sources had, and removes the duplicate Spotify rules from the blockAds collection.

**一个插件，三份来源合并 · One plugin, three sources merged**

**v1.2** — 脚本写入的账号属性从 10 项扩到 38 项（音质、目录、离线、有声书等一并解锁）

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Spotify-Dedup/Spotify-Dedup.lpx
```

装这个之后，**blockAds 合集里的 Spotify 规则已经自动退场**（`[MITM]` 也不再解密
`*‑spclient.spotify.com`），两者不会撞车。

> 更新后请在 Loon 里刷新一次插件（raw CDN 缓存约 24h，必要时加 `?cb=2`）。

---

## 合并了什么 · What was merged

同一批 Spotify 端点分散在两个上游里各有一份，Loon first-match-wins，
先加载的那个赢，另一份等于白装。本插件把两边能力收成一份：

| 规则 | kelee | 730 | 本插件 |
|---|:--:|:--:|:--:|
| `pendragon` 广告配置 `reject-dict` | ✅ | ✅ | ✅ |
| `artistview` iphone→ipad 改写 | ✅ | ✅ | ✅ |
| `gae2-spclient` `/ad` 拦截 | — | ✅ | ✅ |
| `spotify.com` + QUIC → REJECT | ✅ | — | ✅ |
| bootstrap Protobuf 脚本 | ✅（带开关） | ✅（开关失效） | ✅（kelee 那份 + crack-dev 属性表） |

两条 Rewrite 在两个上游里**逐字节相同**，MITM 域名也相同。

---

## v1.2 做了什么 · Why 10 → 38 properties

2026-09-30 做了一次真机抓包验证（86 秒 601 条，流程是「已登录打开 → 退出登录 → 重新登录」），
把脚本交付给 App 的响应解出来一看，结论很明确：

> **去广告有效，但解锁维度基本没生效。**

| 属性 | v1.1 交付的值 | v1.2 交付的值 |
|---|---|---|
| `catalogue` | `free` | `premium` |
| `audio-quality` | `0` | `1` |
| `high-bitrate` / `libspotify` | `false` | `true` |
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

改动由 `patch/merge-crack-dev.py` 生成（幂等可重跑），不是手改压缩过的 JS。

> ⚠️ **`subscription-enddate` / `product-expiry` 是伪装值**（沿用上游语义 = 当前时间 +1 个月），
> 不代表真实订阅。1 个月后想刷新显示，需要重新登录触发一次全量响应。
>
> ⚠️ 这些是**客户端显示层**的伪装，不改变服务端账号状态。
> 音质/下载等实际权益仍受服务端校验。

---

## 已知问题 · Known issues

### 🔴 `pendragon` 拦截目前没生效

2026-09-30 的抓包里，8 次 `pendragon` 请求全部走了真实服务器
（`server-timing: edge` / `via: HTTP/2 edgeproxy`），`modifiedResponse: false`，
`_loon.rewrite` 全 601 条皆空。其中 2 次返回了 5885 字节的真实 Premium 推广
（「想下载 XX 的音乐吗？添加 Premium…」）。

已排除的原因：MITM 正常（`mitmHost` 有值）、插件已加载（脚本确实跑了）、
正则用 node 验证能匹配这个 URL。**根因尚未定位。**
已核对全网 12 份同类插件，8 份用的是逐字节相同的正则 —— 所以不是规则文本的问题。

### 🔴 `tab` 开关当前无效

抓包解出的 1125 条 `assignedValues` 里，`tab_configuration` 出现 0 次，
scope `ios-feature-navigation` 整个不存在。回放 `tab=true` / `tab=false` 输出逐字节相同。

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
- 歌手/专辑列表恢复正常展示（`ios-system-your-plan-sidedrawer` 恒为关闭）
- 客户端显示为 Premium 状态：目录、音质（`audio-quality=1`）、高码率、离线下载、
  有声书、智能洗牌、歌词离线等一并开启
- 想要的话还能关掉 Apple 设备接力（`tab` 开关当前无效）
- 老版本客户端的 `gae2` 广告端点也被拦
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
| `test/script.test.mjs` | 39 条断言，拿真机响应体回放脚本 | 39 assertions replaying real response bodies |
| `test/manifest.test.mjs` | 34 条断言，清单层 | 34 assertions on the manifest |
| `test/fixtures/*.bin.gz` | 真机响应体（83 KB → 25 KB，已脱敏） | Real device responses, redacted |

---

## 测试 · Tests

```
cd plugins/Spotify-Dedup
node test/script.test.mjs      # 脚本层：回放真机响应体，解码逐条比对
node test/manifest.test.mjs    # 清单层：合并完整性 / 开关接线 / enable= 位置
```

`script.test.mjs` 拿 2026-09-30 那份真机抓包里的两份 83 KB protobuf 响应体
反复回放脚本，再把输出解回来比对。**光读代码是不够的** ——
v1.1 那 10 项属性「看起来完全正常」，只有真跑一遍才发现另外 26 项根本没被写。

反向验证：把脚本退回 kelee 原版，`script.test.mjs` 有 10 条断言转红。

fixture 由 `patch/make-fixture.py` 从 HAR 生成，`account-id` / `strider-key` /
`at-signal` / `account-creation-time` / `feature-set-id-masked` 做了**等长**字节替换
（等长是为了不改 protobuf 的长度前缀，结构与原响应完全一致），可安全入库。

---

## 致谢 · Credits

- **001ProMax** <https://github.com/001ProMax> — 原作者
- **kelee** <https://hub.kelee.one> — 开关版脚本的托管与改造

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
