# BlockAds-Patched · 广告拦截&净化合集（退场版）

> blockAds.plugin 打上 B 站 + YouTube + Spotify 退场补丁后的可订阅版本。
> blockAds.plugin with the Bilibili + YouTube + Spotify removal patch applied.

**自动同步** — GitHub Actions 每 6 小时同步上游并重施补丁
**Auto-synced** every 6 hours, patch re-applied automatically

---

## 参数精简 · Parameter pruning

三块退场后，7 个开关变成**死开关**（只被已注释的规则引用）：

| 参数 | 状态 | 说明 |
|---|---|---|
| `bilimanhua_enable` | 🗑 删除 | 哔哩哔哩漫画 —— 规则已退场 |
| `sponsorBlock` | 🗑 删除 | B 站空降助手 —— 规则已退场 |
| `logLevel` | 🗑 删除 | 标签写着 bilibili-日志等级，仅 B 站脚本用 |
| `flightradar24_enable` | 🗑 删除 | **上游自身的 bug**：声明了但任何规则都没引用 |
| `youtube_enable` | 🗑 删除 | YouTube —— 规则已退场 |
| `tab` | 🗑 删除 | Spotify 底栏创建按钮 —— 脚本已退场 |
| `useractivity` | 🗑 删除 | Spotify 设备接力 —— 脚本已退场 |

**74 → 67 个参数。** 其余 67 个各自控制生效规则，均在用 —— 不做进一步删减。

> 这份产物由 Actions 自动生成，**直接编辑会被每 6 小时的重跑覆盖**。
> 上述删除已写进 `patches/patch-blockads.py`，可随重放自动生效。

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/BlockAds-Patched/BlockAds.patched.plugin
```

---

## 改了什么 · What changed

把合集里**属于 B 站、YouTube、Spotify 的部分整体退场**：

| 段 | B 站 | YouTube | Spotify | 处理 | Action |
|---|---|---|---|---|---|
| `[Rewrite]` | 29 | 1 | 3 | 注释 | commented |
| `[Script]` | 8 | 1 | 1 | 注释 | commented |
| `[Rule]` | 5 | 1 | 0 | 注释 | commented |
| `[MITM]` | 9 域名 | 2 域名 | 2 域名 | 移除 | removed |
| **合计** | **51** | **4** | **6** | — | — |

**其余 700+ App 的规则逐字节不动。** The other 700+ apps are byte-for-byte untouched.

活规则数 4540 → 4533，消失的恰好是 3 条 YouTube + 4 条 Spotify 规则。

---

## 为什么 · Why

**B 站**：合集内置 kokoryh 的完整规则集，与 [Bilibili-Dedup](../Bilibili-Dedup/) 完全重叠 ——
同一份逻辑对同一响应执行两遍，且合集版本有参数缺失问题
（`purifyComment` / `displayUpList` / `optimizeRequest` 未声明，脚本内置默认值被 `undefined` 覆盖）。

**YouTube**：合集的 `youtube.response.js` 匹配
`browse|next|player|search|reel_watch_sequence|guide|account/get_setting|get_watch`，
与 [YouTube-Dedup](../YouTube-Dedup/) 是**完全同一批 URL**。
Loon first-match-wins，谁排在前面谁生效 —— 两份都在时，
先加载的那个赢，另一份等于白装。另外 `rr*.googlevideo.com/initplayback`
那条 `reject-dict` 常无 `enable` 保护，会打断 UMP 与字幕翻译。

**Spotify**：合集的 3 条 Rewrite + 1 条 Script 与 kelee 的 `Spotify_remove_ads.lpx`
逐条撞车。且合集指向的脚本在上游 2026-07-26 重构后已不再读 `$argument`，
它声明的 `tab` / `useractivity` 两个开关形同虚设。
合并版见 [Spotify-Dedup](../Spotify-Dedup/)。

退场后这三块能力分别由 Bilibili-Dedup、YouTube-Dedup 和 Spotify-Dedup 单独承担。

---

## 上游更新 · On upstream updates

无需手动操作；校验失败时 Action 会报错并附上残留的具体行，
需更新 `patches/patch-blockads.py` 的域名判定。
Fully automatic; the Action fails loudly if the patch stops working.

CI 会验三件事：退场是否完整、产物是不是真插件、补丁能不能原样重放。
补丁器改动请先跑 `python3 patches/test-patch-blockads.py`。

---

## 致谢 · Credits

- **奶思 / fmz200** <https://github.com/fmz200/wool_scripts> — 原作者
- **kokoryh** <https://github.com/kokoryh> — B 站规则来源
- **001ProMax** <https://github.com/001ProMax> — Spotify 规则来源

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
