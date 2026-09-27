# blockAds 退场补丁

`blockAds.plugin`（[fmz200/wool_scripts](https://github.com/fmz200/wool_scripts)，730+ App）
内置了 kokoryh 的完整 B 站规则集，与本仓库的 [Bilibili-Dedup](../plugins/Bilibili-Dedup/README.md) 功能重叠。

本补丁把合集里的 **B 站部分整体退场**，其余 700+ App 逐字节不动。

---

## 订阅（推荐）

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/BlockAds-Patched/BlockAds.patched.plugin
```

由 [GitHub Actions](../.github/workflows/sync-blockads.yml) **每 6 小时自动同步上游并重施补丁**。

| 特性 | 说明 |
|---|---|
| 上游无变化 | 不提交，避免刷屏 |
| 退场不完整 | **Action 报错终止**，不会推送坏产物 |
| 手动触发 | Actions → Sync blockAds → Run workflow |

---

## 本地运行

```bash
# 拉上游最新版 → 打补丁
python3 patch-blockads.py -o blockAds.patched.plugin

# 对已下载的文件打补丁
python3 patch-blockads.py blockAds.plugin -o out.plugin

# 只看会改什么，不写文件
python3 patch-blockads.py --dry-run blockAds.plugin -o /dev/null

# 保留 MITM 域名（仅注释规则，用于仍需解密 B 站流量的场景）
python3 patch-blockads.py --keep-mitm -o out.plugin
```

---

## 退场范围

| 段 | 数量 | 处理 |
|---|---|---|
| `[Rewrite]` | 23 | 注释 |
| `[Script]` | 4 | 注释 |
| `[Rule]` | 5 | 注释 |
| `[MITM]` | 6 域名 | 移除 |
| **合计** | **38** | — |

判定依据是域名片段 `bilibili.com` / `biliapi.net` / `biliapi.com` / `biligame.com` / `hdslb.com` / `manhuaren`。

> ⚠️ **易漏点**：B 站漫画走的是 `hdslb.com`（CDN）和 `manhuaren.com`（漫画 API），
> **都不含 `bilibili.com`**。只匹配主域名会漏掉 6 条规则 —— 这是实际踩过的坑。

---

## 设计原则

- **声明式**：按域名特征定位，不依赖行号，上游增删行后仍能重放
- **幂等**：已打过补丁的版本再跑一次不重复注释
- **最小改动**：除补丁条目外逐字节保持原样
- **可验证**：Action 每次运行都做「残留检查」，有残留即失败

---

## 上游更新后

无需手动操作，Action 会自动处理。若补丁失效（上游改了结构），
Action 会报错，此时需更新 `patch-blockads.py` 里的域名判定。

## 致谢

- **奶思 / fmz200** <https://github.com/fmz200/wool_scripts> — 原作者
- **kokoryh** <https://github.com/kokoryh> — B 站 protobuf 脚本作者

上游版权与许可全部适用。
