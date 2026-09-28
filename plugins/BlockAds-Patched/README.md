# BlockAds-Patched · 广告拦截&净化合集（退场版）

> blockAds.plugin 打上 B 站退场补丁后的可订阅版本。
> blockAds.plugin with the Bilibili-removal patch applied.

**自动同步** — GitHub Actions 每 6 小时同步上游并重施补丁
**Auto-synced** every 6 hours, patch re-applied automatically

---

## 参数精简 · Parameter pruning

B 站退场后，4 个开关变成**死开关**（只被已注释的 B 站规则引用）：

| 参数 | 状态 | 说明 |
|---|---|---|
| `bilimanhua_enable` | 🗑 删除 | 哔哩哔哩漫画 —— 规则已退场 |
| `sponsorBlock` | 🗑 删除 | B 站空降助手 —— 规则已退场 |
| `logLevel` | 🗑 删除 | 标签写着 bilibili-日志等级，仅 B 站脚本用 |
| `flightradar24_enable` | 🗑 删除 | **上游自身的 bug**：声明了但任何规则都没引用 |

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

---

## 上游更新 · On upstream updates

无需手动操作；补丁失效时 Action 会报错，需更新 `patches/patch-blockads.py` 的域名判定。
Fully automatic; the Action fails loudly if the patch stops working.

---

## 致谢 · Credits

- **奶思 / fmz200** <https://github.com/fmz200/wool_scripts> — 原作者
- **kokoryh** <https://github.com/kokoryh> — B 站规则来源

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
