# 上游出处与改写对照 · Upstream Provenance & Patch Map

本文件记录上游来源与逐条改动依据，正文说明见 [README.md](README.md)。
Provenance and per-change reasoning; user-facing notes live in README.md.

---

## 上游 · Upstream

| 项 | 值 |
|---|---|
| 名称 Name | AgentRouter 签到 |
| 分发 Distributor | `https://github.com/MaYIHEI/paperclip/tree/main/app/agentrouter` |
| 清单 Manifest | `app/agentrouter/agentrouter.lpx`（965 B，sha256 `525501a7…`） |
| 脚本 Script | `app/agentrouter/agentrouter.js`（16104 B，sha256 `f688ff55…`） |
| 原作者 Authors | 773075692、MaYIHEI |
| 脚本版本 Script version | `2026-09-12.r8`（脚本内 `SCRIPT_VERSION` 常量） |
| 抓取日期 Fetched | 2026-09-29 |
| 外部依赖 External | 无 · none |

**脚本与清单原件均逐字节托管**，`script-path` 已改指本仓库。脚本本身**一个字都没改** ——
托管的只是「跑谁家的代码」这件事。sha256 登记在 `manifest.json`，
`python3 tools/vendor-check.py --diff` 可随时比对上游是否漂移。

---

## 改动清单 · Change List

上游 965 B → 本版 1615 B，**脚本 0 行改动**。

### 0. 托管上游原件，script-path 改指本仓库

```diff
-cron "0 9 * * *" script-path=https://raw.githubusercontent.com/MaYIHEI/paperclip/.../agentrouter.js, ...
+generic/cron script-path=https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/AgentRouter/src/agentrouter.js, ...
```

**依据**：托管的意义是「上游没了也能用」。作者的个人仓库不是长期稳定承诺的 CDN，
站点消失的话已导入的插件会直接加载失败。跟 GeoFix / YouTube-Test 同一个理由。

**代价**：上游更新不再自动生效，要手动跟。`tools/vendor-check.py --diff` 就是为此存在 ——
它会告诉你上游出了新版本，由你决定跟不跟。

`#!icon` **仍指向上游**（每次现取，不托管）—— 与 AdGuard-Spoof 一致。

### 1. 新增 `auto` 开关，默认关闭

```diff
 [Argument]
 debug = switch,false,tag=调试模式,desc=仅记录请求状态和签到判定
+auto = switch,false,tag=每日自动签到,desc=默认关闭；多设备只需一台打开。关闭后仍可手动点「立即签到」
```

**依据**：上游 cron 是 `enable=true`，装完即生效。多设备各装一份会重复签到 ——
虽然服务端用 `checked_in` 判重不会多给奖励，但每台设备每天都会发一轮登录请求。
改成默认关闭，需要的用户自己打开。

**写法**：`switch,false` 的第三位（可否反转）留空 = 只在 true/false 间切。
抄自同仓库的 `loon/paperclip-cookie`（27 个开关全是这个写法）。

### 2. cron 挂上开关

```diff
-cron "0 9 * * *" ..., tag=AgentRouter签到, timeout=300, ..., enable=true
+cron "0 9 * * *" ..., tag=AgentRouter签到, timeout=300, ..., enable={auto}
```

**依据**：`enable={}` 由 Loon 调度层拦截 —— 关闭时脚本不执行、不发请求、不耗流量。
不是脚本里 `if` 判断，所以关着是真的零开销。

⚠️ `enable=` 只能挂在**无条件规则**上。这里 cron 的匹配条件是 cron 表达式本身，
不是 URL/逻辑规则，属于可挂开关的规则类型。

### 3. 新增「立即签到」手动触发

```diff
+generic script-path=..., argument=[...], tag=立即签到, img-url=..., timeout=300
```

**依据**：上游只有 cron，没有手动入口 —— 开关关着时插件就完全没有可点项，
没法验证账号密码填对没有。加一条 `generic` 让用户随时能手动跑一次。
**这条规则刻意不写 `enable=`**，开关关着也能点。

### 4. 头部元信息

```diff
-#!author=773075692, MaYIHEI
+#!author=773075692, MaYIHEI | 修改版: Savues <https://github.com/Savues/loon-plugin-patches>
-#!homepage=https://github.com/MaYIHEI/paperclip/tree/main/app/agentrouter
+#!homepage=https://github.com/Savues/loon-plugin-patches/tree/main/plugins/AgentRouter
```

`#!desc` 补了一句说明默认值与用法。其余头部原样保留（含 `#!icon` 仍指向上游）。

---

## 没做的 · Not done

| 事项 | 原因 |
|---|---|
| 改脚本做多设备互斥 | 服务端 `checked_in` 已判重，重复签到不多给奖励，只是多一轮请求 |
| 改 cron 时间 | 上游定的 09:00 无问题，不动 |
| 加 `[MITM]` | 不需要，本插件不抓包 |
| 托管 icon | 每次现取即可，托管反而要跟着上游改 size |

---

## 验证 · Verification

`test/manifest.test.mjs`（18 个用例，`node test/manifest.test.mjs`）钉住：

- 开关默认值、cron 挂上了、没有残留 `enable=true`
- `generic` 存在且未被开关挡住
- 上游 4 个 Argument 一条没删，`argument=` 仍是对应的 4 个 key，两条规则一致
- `script-path` 全部指向本仓库托管副本，无 `[MITM]` 段
- **托管件被改动能被抓到**：两个原件的 sha256 与 `manifest.json` 逐一比对
- 署名与 homepage 正确

`python3 tools/vendor-check.py --hash` 校验本地完整性，`--diff` 拉上游比对漂移（当前均一致）。

三条反向验证，确认不是空断言：

| 注入的错误 | 测试反应 |
|---|---|
| `enable={auto}` 改回 `enable=true` | 2 项失败 |
| `script-path` 改回指向上游 | 1 项失败 |
| 往托管脚本 / 清单原件尾部追加一行 | 1 项失败（sha256 对不上） |