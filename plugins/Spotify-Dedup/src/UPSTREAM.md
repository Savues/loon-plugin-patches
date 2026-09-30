# UPSTREAM · 上游出处与改动记录

## 脚本

| 项 | 值 |
|---|---|
| 文件 | `src/spotify.response.js` |
| 基线 URL | `https://kelee.one/Resource/JavaScript/Spotify/Spotify_remove_ads.js`（现已 404） |
| 采集日期 | 2026-09-29 |
| 基线大小 | 9389 B |
| 基线 SHA256 | `198cb5869d9710c56ed1945156c8f6227fdf9d19da38ee1c8870f4d72f26c6c8` |
| **v1.1 及以前** | **逐字节副本，一个字符未改** |
| **v1.2 起** | **属性表被替换（见下），protobuf 与开关逻辑未动** |
| v1.2 大小 | 10476 B |
| v1.2 SHA256 | `270b1c76a4e93a8b7d22fa6988c29f3292a3661a5f39d584e554f4fb8882bb6a` |
| 作者 | 001ProMax <https://github.com/001ProMax> |

> 采集时的线上副本仍可从 `Moli-X/Tool` 的
> `Loon/Plugin/Kelee/Script/Spotify_remove_ads.js` 逐字节取回，SHA256 与上表基线一致。
> `kelee.one/Tool/Loon/Lpx/Spotify_remove_ads.lpx` 已 404
> —— 当初把托管位置换成本仓库 raw 的判断是对的。

## v1.2 改了什么（唯一一次动脚本内容）

改动由 **`patch/merge-crack-dev.py`** 生成，幂等可重跑，不是手改压缩过的 JS。
脚本只被改了两处，都在 `A()` 函数内：

1. **函数头**插入一行到期日计算（沿用 crack-dev 语义，当前时间 +1 个月）
2. **属性表**从 10 项替换为 38 项

**没有动的部分**（逐字保留）：protobuf 读写器、`$argument` 解析与 JSON 兼容分支、
`ios-system-your-plan-sidedrawer` / `is_row_enabled` 无条件改写、
`tab_configuration` 与 `is_useractivity_sharing_enabled` 两处开关逻辑、
`200 !== $response.status` 状态守卫、`$done({body:s})` 写回。

### 属性表 10 → 38 的来源

| 来源 | 项数 | 内容 |
|---|---|---|
| kelee 原版 | 10 | `ads` / `player-license` / `type` / `name` / `financial-product` / `publish-playlist` / `nft-disabled` / `offline` / `streaming-rules` / `com.spotify.madprops.use.ucs.product.state` |
| 001ProMax `Spotify.Crack.Dev.js` | 36 | 见下 |
| 取舍 | 38 | crack-dev 的 36 项 **全部保留**（含与 kelee 重名的 8 项，值一致）+ kelee 独有的 2 项 |

crack-dev 相对 kelee 新增的 26 项，逐条抄自其 `A()` 函数：
`subscription-enddate`、`product-expiry`、`smart-shuffle`、`is-euterpe`、
`has-audiobooks-subscription`、`payments-initial-campaign`、`social-session-free-tier`、
`can_use_superbird`、`jam-social-session`、`audio-quality`、`shuffle-algorithm`、
`is-thalia`、`shuffle`、`is-pigeon`、`libspotify`、`high-bitrate`、`unrestricted`、
`catalogue`、`your-library-tags`、`on-demand`、`loudness-levels`、`social-session`、
`pick-and-shuffle`、`offline-backup`、`lyrics-offline`、`mixing-tools`、`mobile`、
`com.spotify.madprops.delivered.by.ucs`。

### 为什么不是直接换成 crack-dev.js

crack-dev 是 001ProMax 现役的脚本（2026-07-26 重构，commit `2e3eb28d`），
属性表更全，但 **`$argument` 出现 0 次** —— 它 lpx 里声明的 `tab` / `useractivity`
两个开关形同虚设。这正是本仓库 v1.0 选 kelee 版而不是 730 指向那份的唯一理由。
v1.2 取两者之长：留 kelee 的开关机制，换 crack-dev 的属性表。

## 三份脚本的关系

| 版本 | 提交 | 大小 | `$argument` | 说明 |
|---|---|---|---|---|
| 730 指向的 | `2e3eb28d`（2026-07-26） | 10446 B | **0 次** | 重构版，走 `new Request/Response` fetch 重写，**开关功能丢失** |
| kelee 托管的 | 基于 `8986b9b9`（2026-03-13）自行改造 | 9389 B | 4 次 | 保留开关；另加 `tab_configuration` / `ios-feature-share` / `publish-playlist` / `financial-product` |
| 中间版 | `8986b9b9`（2026-03-13） | 12899 B | 0 次 | 无开关版 |

## 真机验证（2026-09-30）

抓包 `shared-E75675D5_189_1790768027685.har`，601 条，19:33:51–19:35:17，
流程为「已登录打开 → 退出登录 → 重新登录」。

**v1.1 状态的实测结论**（这是 v1.2 的依据）：

| 属性 | 交付给 App 的值 | 应为 |
|---|---|---|
| `catalogue` | `free` | `premium` |
| `audio-quality` | `0` | `1` |
| `high-bitrate` / `libspotify` | `false` | `true` |
| `smart-shuffle` | `UNAVAILABLE` | `AVAILABLE` |
| `mixing-tools` | `VIEW` | `EDIT` |
| `offline-backup` | `DISABLED` | `UNRESTRICTED` |
| `social-session` / `can_use_superbird` | `false` | `true` |
| `jam-social-session` | `BASIC` | `EXPANDED` |
| `subscription-enddate` / `product-expiry` / `unrestricted` / `loudness-levels` | **缺失** | 写入 |

⇒ **去广告有效（Premium 推广被拦掉一部分），解锁维度基本没生效。**

v1.2 用同一份响应体回放验证：**21 项翻转 + 5 项新增**，
`test/script.test.mjs` 39 条断言全绿。反向验证（退回 kelee 原版）10 条转红。

### 开关语义（`switch, 默认值, 取反值`）

```
tab=switch, false, true         → 默认关（保留底栏创建按钮）
useractivity=switch, true, false → 默认开（保留 Apple 设备接力）
```

⚠️ 两者都作用于 **bootstrap / customize 响应**，而已登录冷启动时 Spotify
只发一个 **304**（带 `if-none-match`），脚本首行 `200 !== $response.status`
会直接 `$done({})` 放行。**改完开关需要重新登录 Spotify 才生效。**

参照做法：`app2smile/rules`、`Moli-X/Resources`、`Amlabort` 三家都在同一条
Rewrite 上加了 `header-del if-none-match`，删掉请求头即可每次拿全量，
不必重新登录。本仓库尚未采用（见 README「已知问题」）。

### 🔴 `tab` 开关当前无效（保留但不推荐用）

真机响应解出 1125 条 `assignedValues`，`tab_configuration` 出现 **0 次**，
scope `ios-feature-navigation` **整个不存在**。回放 `tab=true` / `tab=false`
输出逐字节相同。

第三方佐证：`Amlabort/MY_clash` 的 `spot-proto-ev3.js`（2026 年最新、最激进那份）
里 `tab_configuration` 那段 JSON **是被注释掉的**，注释里还留着
`"enumValue": {"value": "CreateRight"}` —— 连最新脚本也当它是死属性。

不删这个开关的理由：Spotify 若恢复下发该属性，它无需改动即自动生效。
`test/script.test.mjs`【5】已把「当前无效」这个事实钉住。

## 回归测试

| 文件 | 作用 |
|---|---|
| `test/script.test.mjs` | 39 断言。拿真机响应体（已脱敏）回放脚本，解码输出逐条比对 |
| `test/manifest.test.mjs` | 清单层：合并完整性、开关接线、`enable=` 不得挂逻辑规则 |
| `test/fixtures/*.bin.gz` | 真机响应体，83 KB → 25 KB。`patch/make-fixture.py` 从 HAR 生成 |
| `patch/merge-crack-dev.py` | 生成 v1.2 脚本，幂等 |
| `patch/make-fixture.py` | 从 HAR 生成脱敏 fixture（等长字节替换账号标识） |

**为什么要有 fixture**：光读代码判断属性名对不对是不够的 ——
v1.1 的 10 项属性「看起来完全正常」，只有把真实响应体喂进脚本再解回来
才发现另外 26 项根本没被写。这也是仓库原则 #6「改过脚本必须带回归测试」的由来。

**fixture 已脱敏**：`account-id` / `strider-key` / `at-signal` /
`account-creation-time` / `feature-set-id-masked` 做了等长字节替换
（等长是为了不改 protobuf 长度前缀，结构与原响应完全一致），可安全入库。

## 清单层

`Spotify-Dedup.lpx` 的规则逐条溯源见该文件末尾的注释块。
需要说明的两处：
- `#!system` 上游写的是空值，本版按仓库惯例补全为 `iOS, iPadOS, macOS`
- v1.2 的 `[Rewrite]` 三条与 v1.1 逐字节相同（`gae2-spclient` 已被真机证明是死规则，
  但删它属于另一次改动，本版未动）

## 许可

上游未声明明确的开源许可。按仓库通例：
**上游版权与许可全部适用**。v1.1 及以前本仓库只做托管位置替换；
**v1.2 起修改了脚本内容**（属性表 + 一行日期计算），已在上面逐条列明。

致谢：**001ProMax** <https://github.com/001ProMax> — 原作者
