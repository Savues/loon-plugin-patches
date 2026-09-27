# BlockAds-Patched

`blockAds.plugin`（奶思合集，730+ App）打上 B 站退场补丁后的可订阅版本。

## 订阅

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/BlockAds-Patched/BlockAds.patched.plugin
```

由 GitHub Actions 每 6 小时自动同步上游并重施补丁，详见 [patches/README](../../patches/README.md)。

## 改了什么

把合集里**属于 B 站的部分整体退场**：

| 段 | 数量 | 处理 |
|---|---|---|
| `[Rewrite]` | 23 | 注释 |
| `[Script]` | 4 | 注释 |
| `[Rule]` | 5 | 注释 |
| `[MITM]` | 6 域名 | 移除 |

**其余 700+ App 的规则逐字节不动。**

## 为什么

合集内置了 kokoryh 的完整 B 站规则集，与 [Bilibili-Dedup](../Bilibili-Dedup/README.md) 完全重叠 ——
同一份逻辑对同一响应执行两遍，且合集版本有参数缺失问题（`purifyComment` / `displayUpList` / `optimizeRequest`
未声明，脚本内置默认值被 `undefined` 覆盖）。

退场后 B 站能力由 Bilibili-Dedup 单独承担，也避免了与 [Bilibili-UI](../Bilibili-UI/README.md) 抢端点。

## 上游更新

无需手动操作。补丁失效时 Action 会报错，需更新 `patches/patch-blockads.py` 的域名判定。

## 致谢

- **奶思 / fmz200** <https://github.com/fmz200/wool_scripts> — 原作者
- **kokoryh** <https://github.com/kokoryh> — B 站规则来源

上游版权与许可全部适用。
