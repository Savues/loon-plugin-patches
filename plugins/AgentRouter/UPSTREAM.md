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

**脚本逐字节沿用上游，本仓库未做任何修改、未托管副本** —— `script-path` 仍指向上游 raw URL。
改动全部在清单层。

---

## 改动清单 · Change List

上游 965 B → 本版 1615 B，**脚本 0 行改动**。

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
| 托管脚本到 `src/` | 脚本零改动，上游仓库在 GitHub 上稳定存在，没有托管必要 |
| 改脚本做多设备互斥 | 服务端 `checked_in` 已判重，重复签到不多给奖励，只是多一轮请求 |
| 改 cron 时间 | 上游定的 09:00 无问题，不动 |
| 加 `[MITM]` | 不需要，本插件不抓包 |

---

## 验证 · Verification

`test/manifest.test.mjs`（14 个用例，`node test/manifest.test.mjs`）钉住：

- 开关默认值、cron 挂上了、没有残留 `enable=true`
- `generic` 存在且未被开关挡住
- 上游 4 个 Argument 一条没删，`argument=` 仍是对应的 4 个 key，两条规则一致
- `script-path` 仍指向上游、无 `[MITM]` 段
- 署名与 homepage 正确

已反向验证：把 `enable={auto}` 改回 `enable=true`，测试报 2 项失败 —— 不是空断言。