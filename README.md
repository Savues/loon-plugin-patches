# Loon 插件修改合集 · Loon Plugin Patches

> 个人使用的 Loon 插件修改版合集。
> A personal collection of patched Loon plugins.

修改范围以**清单层**为主 —— MitM 域名、`[Argument]` 参数、`[Script]` / `[Rewrite]` 规则条目。
个别插件额外托管了脚本：或只改托管位置与标识符，或在上游解析不了某个端点时**另写一个自研脚本**顶上，
两者都**不修改上游 JavaScript 的任何一行**。

Scope is **manifest-layer first** — MITM hostnames, `[Argument]` params, `[Script]`/`[Rewrite]` rules.
Three plugins ship scripts: two only relocate or rename upstream code, and one adds scripts of our
own for endpoints upstream can no longer parse or features it never had.
**No upstream JavaScript is modified.**

---

## 插件列表 · Plugins

| 插件 Plugin | 用途 Purpose | 状态 Status |
|---|---|---|
| [Bilibili-Dedup](plugins/Bilibili-Dedup/) | B 站去广告 · 大会员伪装 · 漫画净化<br>Bilibili ad-block · VIP spoof · comics | **v7.12** |
| [Bilibili-UI](plugins/Bilibili-UI/) | 首页标签页 / 底栏真开关<br>Home tabs & bottom nav switches | **v3.1** |
| [GeoFix](plugins/GeoFix/) | 网络定位重定向 · 完全本地 · 短地址 savues.com<br>Network-location redirect · fully self-contained | **v1.2** |
| [YouTube-Dedup](plugins/YouTube-Dedup/) | 消除与 blockAds 的重复改写 · 修 config 崩溃 · 清游戏大本营<br>Dedupe against blockAds · config fix · Gaming Hub removal | **v5.7** |
| [BlockAds-Patched](plugins/BlockAds-Patched/) | 合集 B 站 + YouTube 部分整体退场<br>Bilibili + YouTube removal from the big collection | 自动 Auto |

### 托管了脚本的三个插件

`Bilibili-UI` —— 上游 Enhanced 的脚本只接受**单个字符串**作为设置，而 Loon 无法把多个开关拼成一个值传入，
因此真开关必须改取参逻辑。改动仅两处 IIFE + 四处去 BoxJS，**业务逻辑逐字节未动**。

`GeoFix` —— 走的是另一条路：**不改逻辑，只改托管位置和字符串**。
上游三个脚本原本从作者站点 `script-path` 拉取，站点一旦消失，已导入的插件会直接加载失败；
本仓库把它们收进 `plugins/GeoFix/src/`，并做了一轮标识符与虚拟端点改名。
移植前后的逻辑等价性由 `smoke.test.mjs` 的 28 个用例覆盖（含一次真实 protobuf 改写），
逐条改动见 [GeoFix/UPSTREAM.md](plugins/GeoFix/UPSTREAM.md)。

`YouTube-Dedup` —— 第三条路：**上游解析不了某个端点、或压根没有某项功能时，另写自研脚本顶上**。
上游给 `config` 响应的 `ColdConfigGroup` 写的是空 schema，解析必然崩溃（2026-09-29 真机抓包证实），
`src/config-onesie.js` 只用公开可观测的 protobuf 字段编号把 UMP onesie 密钥取出来；
上游也没有「清除游戏大本营」这个功能，`src/feed-gaming.js` 按「结构 + 内容」把首页那个
61 KB 的 mini-app 面板从 feed 里摘掉。两份脚本都不含上游代码，各有 16 / 22 个回归用例。

Three plugins ship scripts. `Bilibili-UI` changes argument parsing because the upstream
accepts a single string. `GeoFix` changes nothing but hosting and strings: the upstream
fetched its three scripts from the author's site, so the plugin would break outright if
that site disappeared. `YouTube-Dedup` takes two further routes — a purpose-built script for
an endpoint upstream cannot parse (`config`), and one for a feature upstream never had
(removing the Gaming Hub module from the home feed). Equivalence is covered by 28, 16 and 22
tests respectively.

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
| 7 | 踩坑记录进迭代文档，不留在插件 README | Keep post-mortems in the iteration log, not plugin READMEs |

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
| [`docs/`](https://github.com/Savues/loon-plugin-patches/tree/main/docs) | GeoFix 网页版设置界面（GitHub Pages 托管，可选）· Web UI |

---

## 免责声明 · Disclaimer

- 仅供个人学习研究 · For personal study and research
- 收录不代表推荐或背书 · Inclusion is not an endorsement
- 上游作者不愿收录请提 issue 即下架 · Open an issue to opt out

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
