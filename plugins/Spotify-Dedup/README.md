# Spotify-Dedup · Spotify 去广告（合订版）

> 合并 **kelee 的开关版脚本** + **730 合集的 gae2 老端点拦截** + **kelee 的 QUIC 封锁**，
> 并让 blockAds 合集里那份重复的 Spotify 规则整体退场。
> Merges the switch-capable script from kelee with the two rules that only one of the
> other two sources had, and removes the duplicate Spotify rules from the blockAds collection.

**一个插件，三份来源合并 · One plugin, three sources merged**

**v1.1** — 修 v1.0 的 `enable=` 挂在逻辑规则上导致 Loon 弹窗的问题

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Spotify-Dedup/Spotify-Dedup.lpx
```

装这个之后，**blockAds 合集里的 Spotify 规则已经自动退场**（`[MITM]` 也不再解密
`*‑spclient.spotify.com`），两者不会撞车。

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
| bootstrap Protobuf 脚本 | ✅（带开关） | ✅（开关失效） | ✅（kelee 那份） |

两条 Rewrite 在两个上游里**逐字节相同**，MITM 域名也相同。

---

## 为什么用 kelee 的脚本，不是 730 指向的那个

两个脚本同源于 `001ProMax/Surge` 的 `Spotify.Crack.Dev.js`，但：

| | 730 指向的 | kelee 托管的 |
|---|---|---|
| 提交 | `2e3eb28d`（2026-07-26 重构） | 基于 `8986b9b9`（2026-03-13）自行改造 |
| 大小 | 10446 B | 9389 B |
| **`$argument` 出现次数** | **0 次** | **4 次** |
| `tab` / `useractivity` 开关 | **失效** | 生效 |

2026-07-26 那次重构把逻辑改写成走 `new Request/Response` 的 fetch 重写，
**`$argument` 从此一次都不出现** —— 也就是说 730 声明了这两个开关、
脚本行也确实传了 `argument=[{tab},{useractivity}]`，但脚本压根不读。
UI 上开关能点，什么用都没有。

> 上游这次重构**不是 bug，是主动改了方向**。所以「哪个更好」取决于你要不要开关，
> 本仓库要的是带开关那份。

本仓库托管的是 kelee 线上那份的**逐字节副本**（SHA256 已用测试钉死），
一个字符都没改，只是把托管地址从 `kelee.one` 换成本仓库 —— 第三方站点消失会导致
已导入的插件加载失败，`PinDuoDuo` / `YouTube-Dedup` 是同样处理。

---

## 开关 · Switches

| 开关 | 默认 | 作用 |
|---|---|---|
| `tab` | **关** | 打开后隐藏底栏中间的「创建」按钮 |
| `useractivity` | **开** | 关闭后禁用「共享播放 / Apple 设备接力」入口 |

> ⚠️ **`tab` / `useractivity` 改完必须重新登录 Spotify 才生效。**
> 这两个开关作用于 **bootstrap 响应**，而 bootstrap 只在登录/冷启动时下发。
> kelee 上游的 `#!desc` 里也是这么写的。

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
- 想要的话还能顺手关掉底栏创建按钮、禁用设备接力
- 老版本客户端的 `gae2` 广告端点也被拦
- **不与 blockAds 合集撞车** —— 那份的 Spotify 规则已在 `patches/patch-blockads.py` 里退场

---

## 文件 · Files

| 文件 | 用途 | Purpose |
|---|---|---|
| `Spotify-Dedup.lpx` | 插件清单，规则逐条标注出处 | Manifest, each rule annotated with its source |
| `src/spotify.response.js` | kelee 线上版逐字节副本 | Byte-for-byte copy of kelee's script |
| `src/UPSTREAM.md` | 出处、SHA256、三个版本的关系 | Provenance, hash, version relationship |
| `test/manifest.test.mjs` | 26 条断言 | 26 assertions |

---

## 致谢 · Credits

- **001ProMax** <https://github.com/001ProMax> — 原作者
- **kelee** <https://hub.kelee.one> — 开关版脚本的托管与改造

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
