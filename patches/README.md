# blockAds 退场补丁 · blockAds Bilibili + YouTube Removal Patch

> 把合集里的 **B 站**与 **YouTube** 部分整体退场，其余 700+ App 逐字节不动。
> Removes the Bilibili and YouTube portions from the collection; other 700+ apps stay byte-for-byte intact.

`blockAds.plugin`（[fmz200/wool_scripts](https://github.com/fmz200/wool_scripts)，730+ App）
内置了 kokoryh 的完整 B 站规则集，与本仓库的 [Bilibili-Dedup](../plugins/Bilibili-Dedup/README.md) 功能重叠。

本补丁把合集里的 **B 站部分整体退场**，其余 700+ App 逐字节不动。

---

## 为什么 YouTube 也要退场

合集里这条规则：

```
http-response ^https:\/\/youtubei\.googleapis\.com\/youtubei\/v1\/(browse|next|player|search|reel\/reel_watch_sequence|guide|account\/get_setting|get_watch)
    script-path=.../Maasea/sgmodule/.../youtube.response.js  enable={youtube_enable}
```

与本仓库 **YouTube-Dedup** 的规则命中**同一批 URL**。而 Loon 的 `[Script]` 是
**first-match-wins**（官方 script_v2：「始终按照原配置顺序选择第一条最终条件为 true 的规则」），
后一条永不执行。

2026-09-29 实测踩到的：合集排在前面 → YouTube-Dedup 的「清除游戏大本营」规则
**一次都没执行过**，用户连着五轮看到游戏大本营删不掉；
而合集自己那份脚本与上游同源，去广告照常工作，所以「其他功能都正常」，极具迷惑性。

所以本补丁把 YouTube 部分一并退场，让 YouTube 能力**只由 YouTube-Dedup 一个插件承担**：

| 行 | 处理 |
|---|---|
| `[SCRIPT]` `youtube.response.js`（与 YouTube-Dedup 抢同一批 URL） | 注释 |
| `[REWRITE]` `rr*.googlevideo.com/initplayback? reject-dict`（无 `enable` 保护，打断 UMP 与字幕翻译） | 注释 |
| `[Argument]` `youtube_enable`（随之失活） | 删除 |
| `[Rule]` `DOMAIN, ads.youtube.com, REJECT` | **保留**（纯域名拦截，不碰脚本） |

**自检**：补丁器打完会再扫一遍产物，只要还剩任何未注释的 YouTube 脚本/复写规则就
**直接报错退出**，自动同步的 Action 随之变红 —— 不会把坏产物推上去。

---

## 订阅（推荐）· Subscribe (recommended)

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/BlockAds-Patched/BlockAds.patched.plugin
```

由 [GitHub Actions](../.github/workflows/sync-blockads.yml) **每 6 小时自动同步上游并重施补丁**。
Re-synced and re-patched automatically every 6 hours.

| 特性 | Feature | 说明 | Description |
|---|---|---|---|
| 上游无变化 | 不提交，避免刷屏 |
| 退场不完整 | **Action 报错终止**，不会推送坏产物 |
| 手动触发 | 手动可用 | Manual | Actions → Run workflow |

---

## 本地运行 · Local usage

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

## 退场范围 · Removal scope

| 段 | 数量 | 处理 |
|---|---|---|---|---|
| `[Rewrite]` | 23 | 注释 |
| `[Script]` | 4 | 注释 |
| `[Rule]` | 5 | 注释 |
| `[MITM]` | 6 域名 | 移除 |
| **合计** | **38** | — |

判定依据是域名片段 `bilibili.com` / `biliapi.net` / `biliapi.com` / `biligame.com` / `hdslb.com` / `manhuaren`。

> ⚠️ **易漏点**：B 站漫画走的是 `hdslb.com`（CDN）和 `manhuaren.com`（漫画 API），
> **都不含 `bilibili.com`**。只匹配主域名会漏掉 6 条规则 —— 这是实际踩过的坑。

### P003 · 删除失活参数（自动应用）

B 站退场后有 4 个开关变成死开关 —— 只被已注释的 B 站规则引用：

| 参数 | 原因 |
|---|---|
| `bilimanhua_enable` | 哔哩哔哩漫画，规则已退场 |
| `sponsorBlock` | B 站空降助手，规则已退场 |
| `logLevel` | 标签为 `bilibili-日志等级`，仅 B 站脚本使用 |
| `flightradar24_enable` | 上游 bug：声明了但无任何规则引用 |

参数 **74 → 70**。其余 70 个各自控制 350 条生效规则，全部在用，不做进一步删减。

---

## 设计原则 · Design principles

- **声明式** Declarative · **幂等** Idempotent · **最小改动** Minimal · **可验证** Verifiable：按域名特征定位，不依赖行号，上游增删行后仍能重放
- **幂等**：已打过补丁的版本再跑一次不重复注释
- **最小改动**：除补丁条目外逐字节保持原样
- **可验证**：Action 每次运行都做「残留检查」，有残留即失败

---

## 上游更新后 · On upstream updates

无需手动操作，Action 会自动处理。若补丁失效（上游改了结构），
Action 会报错，此时需更新 `patch-blockads.py` 里的域名判定。

## 致谢 · Credits

- **奶思 / fmz200** <https://github.com/fmz200/wool_scripts> — 原作者
- **kokoryh** <https://github.com/kokoryh> — B 站 protobuf 脚本作者

上游版权与许可全部适用。
