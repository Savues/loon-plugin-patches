# AgentRouter 签到 v1.13（修改版）

> 上游插件的清单层修改：**自动签到默认关闭**。脚本托管自上游并修了三处真机实测出来的缺陷 ——
> 奖励金额识别不出来、签到了却误报「待确认」、通知排版被 iOS 截断。
>
> Manifest patch of an upstream plugin: the daily cron is **off by default** (still manually
> triggerable from the plugin page). The script is vendored from upstream with three fixes,
> all found by running it on a real device.

| | 中文 | English |
|---|---|---|
| 清单改动 | 1 个开关 + cron 挂 `enable={auto}` | One switch, `enable={auto}` on cron |
| 脚本改动 | 奖励正则 + 去打码 + 通知三层重排 + 签到判定重试 | Reward regex, unmasking, 3-tier layout, retry on log race |
| 依据 | 多设备重复签到；三处真机实测缺陷 | Duplicate check-ins; three bugs found on device |
| 测试 | 55 个用例（24 结构 + 26 排版 + 5 竞态） | 55 cases (24 structure, 26 layout, 5 race) |

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/AgentRouter/AgentRouter.lpx
```

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。拉不到时在地址末尾加随机参数：`?cb=2`

| 文件 | 用途 | Purpose |
|---|---|---|
| [AgentRouter.lpx](AgentRouter.lpx) | 插件清单 | Plugin manifest |
| [src/agentrouter.js](src/agentrouter.js) | 上游脚本 + 三处修复 | Upstream script, three fixes |
| [src/upstream-agentrouter.js](src/upstream-agentrouter.js) | 上游脚本原件，逐字节未改 | Pristine upstream script |
| [upstream-agentrouter.lpx](upstream-agentrouter.lpx) | 上游清单原件 | Pristine upstream manifest |
| [manifest.json](manifest.json) | sha256 登记（含 `based-on`） | sha256 registry |
| [UPSTREAM.md](UPSTREAM.md) | 上游出处与逐条改动依据 | Provenance & per-change reasoning |
| [test/manifest.test.mjs](test/manifest.test.mjs) | 清单与脚本结构回归，24 个用例 | Structure regression tests |
| [test/stats.test.cjs](test/stats.test.cjs) | 通知排版函数单元测试，26 个用例（不联网） | Notification layout unit tests, offline |
| [test/retry.test.mjs](test/retry.test.mjs) | 签到判定的日志落库竞态，5 个用例 | Check-in detection race, 5 cases |
| [test/probe.cjs](test/probe.cjs) | 接口探查：打印各接口返回的字段结构 | Endpoint field-shape probe |
| [test/run-live.cjs](test/run-live.cjs) | 真机全流程测试（读环境变量） | Live end-to-end test |

```bash
node test/manifest.test.mjs        # 清单 + 脚本结构，24 个用例
node test/stats.test.cjs           # 通知排版纯函数，26 个用例
node test/retry.test.mjs           # 签到判定的日志竞态，5 个用例
AGENTROUTER='用户#密码' node test/run-live.cjs   # 真实网络
node test/probe.cjs                # 想看服务端还返回了什么，跑这个
python3 tools/vendor-check.py --diff            # 上游是否更新
```

---

## 真机实测 · Live test

2026-10-01 用真账号跑通全流程（`AGENTROUTER` 环境变量，格式 `用户名#密码`）：

```
【通知】AgentRouter · 用户ID                ← 副标题（顶栏）
  ✅ 今日已签到 +$25 · 第 N 天              ← 标题
  💳 余额 $XXX.XX · 已用 $X.XX              ← 正文
  📢 08-28 为保障服务长期运行，Claude 和
     GPT 模型已调整为限量供应，每日分
     次发放，用完即止。新的投放时间为…
```

三层各放什么，按 iOS 的实际渲染分配：

| 层 | 内容 | 为什么放这儿 |
|---|---|---|
| 副标题 | 站点名 · 用户 ID | 顶栏原本是插件名。右侧要留给时间戳（宽度随通知新旧变化，11~16 单位不等），所以这里只放静态信息，站点名里的空格也删掉 |
| 标题 | 状态 + 金额 + 注册天数 | 大字位置最该放结果。天数放这儿是因为副标题被时间戳挤，会被整个截掉 |
| 正文 1 行 | 余额 · 已用 | 挤一行才腾得出位置给公告 |
| 正文 2-4 行 | 公告（续行缩进 2 格） | 只在有新公告时占行，靠 `persistentStore` 记 id |

金额整数不带 `.00`（`$25` 不是 `$25.00`）。详细依据见 [UPSTREAM.md](UPSTREAM.md#03-通知重排用满三层把预算花在刀刃上)。

`test/run-live.cjs` 会把响应里的账号/密码/token 字段自动替换成 `***`；
上面那行账号省略是因为金额与余额都做了脱敏。

## 改了什么 · What changed

### 清单层（1 处）

上游的 cron 是 `enable=true`，**装完即生效**：

```ini
[Argument]
+auto = switch,false,tag=每日自动签到,desc=默认关闭；多设备只需一台打开

[Script]
-cron "0 9 * * *" ..., tag=AgentRouter签到, ..., enable=true
+cron "0 9 * * *" ..., tag=AgentRouter签到, ..., enable={auto}
```

**为什么要改**：多设备各装一份会各跑一轮登录请求。服务端有 `checked_in` 判重，不会多给奖励，
但请求是实打实发出去的。`enable={auto}` 走 Loon 调度层，关闭时脚本不执行、不发请求、不耗流量。

**没做的**：加一条 `generic` 手动触发规则。曾一度加上，后确认 Loon 的 cron 本身就能在插件页
手动触发，多加一条纯属冗余，已删。

`argument=` 列表、上游 4 个 Argument、cron 时间**全部未动**。

### 脚本层（3 处，都是真机实测出来的）

| # | 症状 | 根因 | 修法 |
|---|---|---|---|
| 1 | 奖励金额一直显示「金额未识别」 | 服务端返回**全角 `＄`（U+FF04）**，上游正则只认半角 `$` | 字符类改成 `[$＄]` |
| 2 | 明明签到了却报「⚠️ 签到待确认」 | 签到在 `POST /api/user/login` 时由服务端完成，但 `/api/log/self` 的记录**异步写**，登录后立刻查还查不到 | 查不到时重试（最多 4 次，间隔 2s/4s/6s）；重试仍失败但 `checked_in=true` 时不再报假警 |
| 3 | 通知排版被 iOS 截断 | 副标题右侧被**时间戳**占位，宽度随通知新旧在 11~16 单位间波动 | 天数挪到全宽的标题层；站点名去空格 |

外加两处个人向调整：去掉 `maskAccount()` 账号打码、通知按 iOS 三层重排（见上）。

逐条依据见 [UPSTREAM.md](UPSTREAM.md)。

---

## 注意 · Notes

- **脚本已托管进本仓库**（`src/agentrouter.js`），上游删目录也不会失效。
  代价是上游更新不再自动生效 —— `python3 tools/vendor-check.py --diff` 会告诉你上游出了新版本，
  由你决定跟不跟。
- `#!icon` 仍指向上游（每次现取，不托管）。
- 上游仓库提供了 Surge / Quantumult X / Stash 的配置片段，本仓库只收 Loon 版。
- 账号密码由插件填写并保存在 Loon 本地，本仓库不涉及。