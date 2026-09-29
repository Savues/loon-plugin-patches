# blockAds 退场补丁 · blockAds Bilibili + YouTube Removal Patch

> 把合集里的 **B 站** 和 **YouTube** 部分整体退场，其余 700+ App 逐字节不动。
> Removes the Bilibili and YouTube portions; other 700+ apps stay byte-for-byte intact.

`blockAds.plugin`（[fmz200/wool_scripts](https://github.com/fmz200/wool_scripts)，730+ App）
内置了 kokoryh 的完整 B 站规则集和一份 YouTube 响应体脚本，与本仓库的
[Bilibili-Dedup](../plugins/Bilibili-Dedup/README.md) 和
[YouTube-Dedup](../plugins/YouTube-Dedup/README.md) 功能重叠。

本补丁把这两块**整体退场**，其余 700+ App 逐字节不动。

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
| 产物不是插件 | **Action 报错终止**（上游 404 / 限流返回错误页时） |
| 补丁不可重放 | **Action 报错终止**（幂等性被破坏时） |

> ⚠️ GitHub 的定时任务常延迟 1–6 小时，看到「6 小时没跑」先别急着当故障。

---

## 本地运行 · Local usage

```bash
# 拉上游最新版 → 打补丁
python3 patch-blockads.py -o blockAds.patched.plugin

# 对已下载的文件打补丁
python3 patch-blockads.py blockAds.plugin -o out.plugin

# 只看会改什么，不写文件
python3 patch-blockads.py --dry-run blockAds.plugin -o /dev/null

# 保留 MITM 域名（仅注释规则，用于仍需解密这两块流量的场景）
python3 patch-blockads.py --keep-mitm -o out.plugin

# 校验产物：退场完整性 + 结构合法性
python3 verify-artifact.py out.plugin

# 回归测试（34 条断言）
python3 test-patch-blockads.py
```

---

## 退场范围 · Removal scope

当前上游（2026-09-10 版）的实际命中数：

| 段 | B 站 | YouTube | 处理 |
|---|---|---|---|
| `[Rewrite]` | 29 | 1 | 注释 |
| `[Script]` | 8 | 1 | 注释 |
| `[Rule]` | 5 | 1 | 注释 |
| `[MITM]` | 9 域名 | 2 域名 | 移除 |
| **合计** | **51** | **4** | — |

判定依据：

- **B 站** —— `bilibili.com` / `biliapi.net` / `biliapi.com` / `biligame.com` / `hdslb.com` / `manhuaren`
- **YouTube** —— `youtube` / `googlevideo` / `youtu.be` / `ytimg`（**刻意用宽匹配**：
  上游随时会加新端点，逐个列主域名迟早会漏）

注释掉的行会打上标记，产物里能直接搜到：
`# [bilibili-removed]` / `# [youtube-removed]`。

> ⚠️ **易漏点 1**：B 站漫画走的是 `hdslb.com`（CDN）和 `manhuaren.com`（漫画 API），
> **都不含 `bilibili.com`**。只匹配主域名会漏掉 6 条规则 —— 这是实际踩过的坑。
>
> ⚠️ **易漏点 2**：`biligame.com` 少写一个 `li` 就会漏掉
> `line3-h5-mobile-api.biligame.com` 和 1 条 Rewrite。**改这两个正则时务必跑
> `test-patch-blockads.py`**，里面有专门针对这两个坑的断言。

### 删除失活参数（自动应用）

两块退场后有 5 个开关变成死开关 —— 只被已注释的规则引用：

| 参数 | 原因 |
|---|---|
| `bilimanhua_enable` | 哔哩哔哩漫画，规则已退场 |
| `sponsorBlock` | B 站空降助手，规则已退场 |
| `logLevel` | 标签为 `bilibili-日志等级`，仅 B 站脚本使用 |
| `flightradar24_enable` | 上游 bug：声明了但无任何规则引用 |
| `youtube_enable` | YouTube，规则已退场 |

参数 **74 → 69**。其余 69 个各自控制生效规则，全部在用，不做进一步删减。

---

## 为什么退场 · Why

**B 站**：内置 kokoryh 的完整规则集，与 Bilibili-Dedup 完全重叠 —— 同一份逻辑对同一响应
执行两遍，且合集版本有参数缺失问题（`purifyComment` / `displayUpList` / `optimizeRequest`
未声明，脚本内置默认值被 `undefined` 覆盖）。

**YouTube**：
1. **抢 first-match** —— 合集的 `youtube.response.js` 匹配
   `browse|next|player|search|reel_watch_sequence|guide|account/get_setting|get_watch`，
   与 YouTube-Dedup 完全同一批 URL。Loon first-match-wins，谁排在前面谁生效。
2. **无 enable 保护的 Rewrite** —— `rr*.googlevideo.com/initplayback` 那条
   `reject-dict` 常无 `enable` 保护，会打断 UMP 与字幕翻译。

---

## 设计原则 · Design principles

- **声明式** Declarative · **幂等** Idempotent · **最小改动** Minimal · **可验证** Verifiable
- **幂等**：已打过补丁的产物再跑一次逐字节不变。
  CI 里有一道 `cmp` 断言专门守这条 —— 不幂等会让每 6 小时都产生新 commit。
- **最小改动**：除补丁条目外逐字节保持原样。当前产物 8485 行 / 410 KB，
  活规则 4540 → 4537，消失的恰好是 3 条 YouTube 规则。
- **可验证**：`verify-artifact.py` 检查两件事 ——
  **退场完整性**（还有没有漏网的 B 站/YouTube 规则和 MITM 域名）
  与**结构合法性**（首行是不是 `#!name=`、五个段在不在、行数够不够）。

> ⚠️ **为什么结构检查不能省**：上游仓库若被删或改名，`curl` 拿回来的是
> GitHub 的 404 HTML 页（约 268 KB）。体积能过下载下限，HTML 里又没有
> `bilibili.com`，**只看内容的校验会全绿并把垃圾推上 main**。
> 只有「首行是 `#!name=` / 段结构完整」这类结构断言拦得住。

---

## 上游更新后 · On upstream updates

无需手动操作，Action 会自动处理。若校验失败（上游改了结构或新增了未覆盖的域名），
Action 会报错并附上残留的具体行，此时更新 `patch-blockads.py` 里的域名判定即可。

改了 `patch-blockads.py` 或 `verify-artifact.py` 之后，**先本地跑一遍**：

```bash
python3 patches/test-patch-blockads.py
```

## 致谢 · Credits

- **奶思 / fmz200** <https://github.com/fmz200/wool_scripts> — 原作者
- **kokoryh** <https://github.com/kokoryh> — B 站 protobuf 脚本作者

上游版权与许可全部适用。
