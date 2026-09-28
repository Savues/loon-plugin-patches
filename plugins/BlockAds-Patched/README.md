# BlockAds-Patched · 广告拦截&净化合集（退场版）

> blockAds.plugin 打上 B 站 + YouTube 退场补丁后的可订阅版本。
> blockAds.plugin with the Bilibili- and YouTube-removal patches applied.

**自动同步** — GitHub Actions 每 6 小时同步上游并重施补丁
**Auto-synced** every 6 hours, patch re-applied automatically

---

## 参数精简 · Parameter pruning

B 站与 YouTube 退场后，5 个开关变成**死开关**（只被已注释的规则引用）：

| 参数 | 状态 | 说明 |
|---|---|---|
| `bilimanhua_enable` | 🗑 删除 | 哔哩哔哩漫画 —— 规则已退场 |
| `sponsorBlock` | 🗑 删除 | B 站空降助手 —— 规则已退场 |
| `logLevel` | 🗑 删除 | 标签写着 bilibili-日志等级，仅 B 站脚本用 |
| `flightradar24_enable` | 🗑 删除 | **上游自身的 bug**：声明了但任何规则都没引用 |
| `youtube_enable` | 🗑 删除 | YouTube 脚本开关 —— 规则已退场 |

**74 → 70 个参数。** 其余 70 个各自控制 350 条生效规则，均在用 —— 不做进一步删减。

> 这份产物由 Actions 自动生成，**直接编辑会被每 6 小时的重跑覆盖**。
> 上述删除已写进 `patch-blockads.py`，可随重放自动生效。

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/BlockAds-Patched/BlockAds.patched.plugin
```

---

## 改了什么 · What changed

把合集里**属于 B 站的部分整体退场**：

| 段 | 数量 | 处理 | Section | Count | Action |
|---|---|---|---|---|---|
| `[Rewrite]` | 23 | 注释 |  | 23 | commented |
| `[Script]` | 4 | 注释 |  | 4 | commented |
| `[Rule]` | 5 | 注释 |  | 5 | commented |
| `[MITM]` | 6 域名 | 移除 |  | 6 domains | removed |

**其余 700+ App 的规则逐字节不动。** The other 700+ apps are byte-for-byte untouched.

---

## 为什么 · Why

合集内置了 kokoryh 的完整 B 站规则集，与 [Bilibili-Dedup](../Bilibili-Dedup/) 完全重叠 ——
同一份逻辑对同一响应执行两遍，且合集版本有参数缺失问题
（`purifyComment` / `displayUpList` / `optimizeRequest` 未声明，脚本内置默认值被 `undefined` 覆盖）。

退场后 B 站能力由 Bilibili-Dedup 单独承担，也避免了与 [Bilibili-UI](../Bilibili-UI/) 抢端点。

### YouTube 部分 · Why YouTube is removed too

合集里这条 `http-response` 与 [YouTube-Dedup](../YouTube-Dedup/) 命中**同一批 URL**，
而 Loon 的 `[Script]` 是 **first-match-wins**（官方 script_v2：
「始终按照原配置顺序选择第一条最终条件为 true 的规则」），后一条永不执行。

2026-09-29 实测：合集排在前面 → YouTube-Dedup 的「清除游戏大本营」规则
**一次都没执行过**，用户连着五轮看到游戏大本营删不掉；
而合集自己那份脚本与上游同源，去广告照常工作，所以「其他功能都正常」，极具迷惑性。

| 退场项 | 说明 |
|---|---|
| `[SCRIPT]` `youtube.response.js` | 与 YouTube-Dedup 抢同一批 URL |
| `[REWRITE]` `rr*.googlevideo.com/initplayback? reject-dict` | **无 `enable` 保护**，会打断 UMP 与字幕翻译 |
| `[Argument]` `youtube_enable` | 随之失活 |

**保留**：`[Rule] DOMAIN, ads.youtube.com, REJECT` —— 纯域名拦截，不碰脚本，无冲突。

补丁器打完会自检：产物里只要还剩任何未注释的 YouTube 脚本/复写规则，就直接报错退出，
自动同步的 Action 随之变红，不会把坏产物推上去。

---

## 上游更新 · On upstream updates

无需手动操作；补丁失效时 Action 会报错，需更新 `patches/patch-blockads.py` 的域名判定。
Fully automatic; the Action fails loudly if the patch stops working.

---

## 致谢 · Credits

- **奶思 / fmz200** <https://github.com/fmz200/wool_scripts> — 原作者
- **kokoryh** <https://github.com/kokoryh> — B 站规则来源

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
