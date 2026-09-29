# Loon 插件修改合集 · Loon Plugin Patches

> 个人使用的 Loon 插件修改版合集。
> A personal collection of patched Loon plugins.

修改范围以**清单层**为主 —— MitM 域名、`[Argument]` 参数、`[Script]` / `[Rewrite]` 规则条目。
个别插件额外托管了脚本：或只改托管位置与标识符，或在上游解析不了某个端点时**另写一个自研脚本**顶上，
或完全自研（无上游代码）。**任何情况下都不修改上游 JavaScript 的任何一行。**

Scope is **manifest-layer first** — MITM hostnames, `[Argument]` params, `[Script]`/`[Rewrite]` rules.
Some plugins additionally ship scripts: some only relocate or rename upstream code, some add
scripts of our own for endpoints upstream can no longer parse, and one is written from scratch
(no upstream code at all). **Upstream JavaScript is never modified.**

---

## 插件列表 · Plugins

| 插件 Plugin | 用途 Purpose | 状态 Status |
|---|---|---|
| [Bilibili-Dedup](plugins/Bilibili-Dedup/) | B 站去广告 · 大会员伪装 · 漫画净化<br>Bilibili ad-block · VIP spoof · comics | **v7.12** |
| [Bilibili-UI](plugins/Bilibili-UI/) | 首页标签页 / 底栏真开关<br>Home tabs & bottom nav switches | **v3.1** |
| [GeoFix](plugins/GeoFix/) | 网络定位重定向 · 完全本地 · 短地址 savues.com<br>Network-location redirect · fully self-contained | **v1.2** |
| [YouTube-Dedup](plugins/YouTube-Dedup/) | 消除与 blockAds 的重复改写 · 修 config 崩溃<br>Dedupe against blockAds · config parse fix | **v5.1** |
| [YouTube-Test](plugins/YouTube-Test/) | 去广告 + 双语字幕合订 · 脚本全托管<br>Ad-block + bilingual subs, self-hosted | **v1.0** |
| [PinDuoDuo](plugins/PinDuoDuo/) | 拼多多去广告 · 底栏可自定义 · 高危拦截全可关<br>Ad-block · custom bottom bar · all risky stubs switchable | **v1.3** |
| [QuarkCheckIn](plugins/QuarkCheckIn/) | 夸克网盘每日签到领空间 · 无 MITM<br>Quark Drive daily check-in · no MITM | **v1.0** |
| [BlockAds-Patched](plugins/BlockAds-Patched/) | 合集 B 站部分整体退场<br>Bilibili removal from the big collection | 自动 Auto |

### 托管了脚本的六个插件

`Bilibili-UI` —— 上游 Enhanced 的脚本只接受**单个字符串**作为设置，而 Loon 无法把多个开关拼成一个值传入，
因此真开关必须改取参逻辑。改动仅两处 IIFE + 四处去 BoxJS，**业务逻辑逐字节未动**。

`GeoFix` —— 走的是另一条路：**不改逻辑，只改托管位置和字符串**。
上游三个脚本原本从作者站点 `script-path` 拉取，站点一旦消失，已导入的插件会直接加载失败；
本仓库把它们收进 `plugins/GeoFix/src/`，并做了一轮标识符与虚拟端点改名。
移植前后的逻辑等价性由 `smoke.test.mjs` 的 28 个用例覆盖（含一次真实 protobuf 改写），
逐条改动见 [GeoFix/UPSTREAM.md](plugins/GeoFix/UPSTREAM.md)。

`PinDuoDuo` —— 沿用 YouTube-Test 的做法托管上游脚本，另有一个自研脚本。
修掉了两个上游缺陷（切断了消息推送 WebSocket、jq 空值崩溃），依据是一份未开插件的基线 HAR。
上游脚本里还硬编码了一个 kelee.one 的 chunk 地址（会把官方 JS 换成第三方版本），已连同 chunk 一并收进仓库。
`src/homepage.response.js` 是自研的：底栏按钮可自定义、jq 空值安全、同一 URL 只留一条处理规则。

`YouTube-Dedup` —— 第三条路：**上游解析不了某个端点时，另写自研脚本顶上**。
上游给 `config` 响应的 `ColdConfigGroup` 写的是空 schema，解析必然崩溃（2026-09-29 真机抓包证实），
`src/config-onesie.js` 只用公开可观测的 protobuf 字段编号把 UMP onesie 密钥取出来。
该脚本不含上游代码，有 16 个回归用例。

`QuarkCheckIn` —— 第四种情况：**完全自研，无任何上游代码**。脚本从真机抓包逆向得到，
2.3 KB 单文件，17 个回归用例。它也是本仓库唯一**不涉及 [MITM]** 的插件 ——
只用 `$httpClient` 主动发请求，因此不用装根证书、与其他插件零冲突。

> v5.2～v6.0 曾附带自研的 `src/feed-gaming.js`（清除首页「游戏大本营」）与一批清单改动，
> 已于 2026-09-29 整体回退到 v5.1；代码仍留在 git 历史里，需要时可按提交取回。

Six plugins ship scripts. `Bilibili-UI` changes argument parsing because the upstream
accepts a single string. `GeoFix` changes nothing but hosting and strings: the upstream
fetched its three scripts from the author's site, so the plugin would break outright if
that site disappeared. `YouTube-Test` and `PinDuoDuo` host the upstream scripts and add
purpose-built ones for endpoints upstream breaks on. `YouTube-Dedup` takes a further
route — a script for an endpoint upstream cannot parse (`config`) — covered by 16 tests.
`QuarkCheckIn` is a further case still: written entirely from scratch off a real packet
capture, 2.3 KB, 17 tests, and the only plugin here that needs **no `[MITM]`** at all.

---

## 收录原则 · Principles

| # | 中文 | English |
|---|---|---|
| 1 | 优先只改清单层 | Prefer manifest-layer changes |
| 2 | 确需改脚本时，仅限取参、远程配置依赖与标识符 | When a script must change, limit to argument parsing, remote config and identifiers |
| 3 | 每条改动注明依据 | Document the reasoning for every change |
| 4 | 保留上游署名与许可 | Preserve upstream attribution and licensing |
| 5 | 公开仓库不带上游产品名，出处改记在 `UPSTREAM.md` | Keep upstream product names out of a public repo; preserve attribution in `UPSTREAM.md` |
| 6 | 改过脚本的插件必须带可运行的回归测试 | Any plugin shipping modified scripts ships a runnable regression test |
| 7 | 结论须有基线抓包支撑，猜不得 | Conclusions need baseline-capture evidence, not guesswork |
| 8 | 踩坑记录进迭代文档，不留在插件 README | Keep post-mortems in the iteration log, not plugin READMEs |

---

## 🔄 自动同步 · Auto Sync

`BlockAds-Patched` 由 GitHub Actions **每 6 小时同步上游并重施退场补丁**
Synced upstream every 6 hours, with the Bilibili-removal patch re-applied.

[`.github/workflows/sync-blockads.yml`](.github/workflows/sync-blockads.yml)

| 特性 | Feature |
|---|---|
| 无变化不提交 | No commit when upstream is unchanged |
| 退场不完整则**报错终止** | **Fails hard** if the removal is incomplete |
| 可手动触发 | Manual trigger supported |

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。
> 拉不到新版时在订阅地址末尾加随机参数：`?cb=2`
>
> CDN cache may lag up to 24h. Append a random param to force refresh: `?cb=2`

---

## 📖 开发记录 · Development

| 文档 | 内容 |
|---|---|
| [BILIBILI-ITERATION.md](BILIBILI-ITERATION.md) | 49 次提交的完整复盘 · Full post-mortem of 49 commits |
| [patches/README.md](patches/README.md) | 退场范围与判定依据 · Removal scope and detection rules |
| [tools/README.md](tools/README.md) | `har-diff.py` 抓包对比工具 · HAR diff tool |
| [GeoFix/UPSTREAM.md](plugins/GeoFix/UPSTREAM.md) | 定位插件的出处与移植逐条对照 · Provenance & porting diff |
| [GeoFix/ITERATION.md](plugins/GeoFix/ITERATION.md) | 定位插件 18 次提交的完整复盘 · Full post-mortem |
| [YouTube-Dedup/ITERATION.md](plugins/YouTube-Dedup/ITERATION.md) | 去广告插件 config 崩溃的定位过程 · How the config parse crash was found |
| [PinDuoDuo/UPSTREAM.md](plugins/PinDuoDuo/UPSTREAM.md) | 拼多多插件的出处与逐条改动依据 · Provenance & per-change reasoning |
| [QuarkCheckIn/README.md](plugins/QuarkCheckIn/README.md) | 夸克签到插件：逆向结论 + 四次踩坑记录 · Check-in plugin: reverse-engineering notes & post-mortems |
| [`docs/`](https://github.com/Savues/loon-plugin-patches/tree/main/docs) | GeoFix 网页版设置界面（GitHub Pages 托管，可选）· Web UI |

---

## 免责声明 · Disclaimer

- 仅供个人学习研究 · For personal study and research
- 收录不代表推荐或背书 · Inclusion is not an endorsement
- 上游作者不愿收录请提 issue 即下架 · Open an issue to opt out

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
