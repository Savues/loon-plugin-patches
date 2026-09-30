# AgentRouter 签到（修改版）

> 上游插件的清单层修改：**自动签到默认关闭**。脚本托管自上游并修了奖励金额识别。
> Manifest patch of an upstream plugin: the daily cron is **off by default** (still manually
> triggerable from the plugin page). The script is vendored from upstream, with one regex fix.

| | 中文 | English |
|---|---|---|
| 清单改动 | 1 个开关 + cron 挂 `enable={auto}` | One switch, `enable={auto}` on cron |
| 脚本改动 | 奖励正则 + 去打码 + 通知三层重排，原件另存 `src/upstream-/` | Reward regex, unmasking, 3-tier notification layout |
| 依据 | 多设备重复签到；真机实测奖励显示「金额未识别」 | Duplicate check-ins; live test showed reward unparsed |

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/AgentRouter/AgentRouter.lpx
```

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。拉不到时在地址末尾加随机参数：`?cb=2`

| 文件 | 用途 | Purpose |
|---|---|---|
| [AgentRouter.lpx](AgentRouter.lpx) | 插件清单 | Plugin manifest |
| [src/agentrouter.js](src/agentrouter.js) | 上游脚本 + 1 行修复 | Upstream script, one fix |
| [src/upstream-agentrouter.js](src/upstream-agentrouter.js) | 上游脚本原件，逐字节未改 | Pristine upstream script |
| [upstream-agentrouter.lpx](upstream-agentrouter.lpx) | 上游清单原件 | Pristine upstream manifest |
| [manifest.json](manifest.json) | sha256 登记（含 `based-on`） | sha256 registry |
| [UPSTREAM.md](UPSTREAM.md) | 上游出处与逐条改动依据 | Provenance & per-change reasoning |
| [test/manifest.test.mjs](test/manifest.test.mjs) | 清单与脚本结构回归，23 个用例 | Structure regression tests |
| [test/stats.test.cjs](test/stats.test.cjs) | 通知排版函数单元测试，21 个用例（不联网） | Notification layout unit tests, offline |
| [test/probe.cjs](test/probe.cjs) | 接口探查：打印各接口返回的字段结构 | Endpoint field-shape probe |
| [test/run-live.cjs](test/run-live.cjs) | 真机全流程测试（读环境变量） | Live end-to-end test |

```bash
node test/manifest.test.mjs        # 离线，23 个用例
node test/stats.test.cjs           # 离线，21 个用例
AGENTROUTER='用户#密码' node test/run-live.cjs   # 真实网络
node test/probe.cjs                # 想看服务端还返回了什么，跑这个
python3 tools/vendor-check.py --diff            # 上游是否更新
```

---

## 真机实测 · Live test

2026-09-30 用真账号跑通全流程（`AGENTROUTER` 环境变量，格式 `用户名#密码`）：

```
【通知】Agent Router · 用户ID · 第 N 天     ← 副标题（顶栏）
  ✅ 今日已签到 +$25                         ← 标题
  💳 余额 $XXX.XX · 已用 $X.XX · N 次        ← 正文
  📢 08-28 为保障服务长期运行，Claude 和
     GPT 模型已调整为限量供应，每日分
     次发放，用完即止。新的投放时间为…
```

三层各放什么，按 iOS 的实际渲染分配：

| 层 | 内容 | 为什么放这儿 |
|---|---|---|
| 副标题 | 站点名 · 用户 ID · 注册至今天数 | 顶栏原本是插件名，跟上方 App 名重复；这里放身份信息 |
| 标题 | 状态 + 金额 | 大字位置最该放结果，不是状态描述 |
| 正文 1 行 | 余额 · 已用 · 请求数 | 挤一行才腾得出位置给公告 |
| 正文 2-4 行 | 公告（续行缩进 2 格） | 只在有新公告时占行，靠 `persistentStore` 记 id |

金额整数不带 `.00`（`$25` 不是 `$25.00`）。详细依据见 [UPSTREAM.md](UPSTREAM.md#03-通知重排用满三层把预算花在刀刃上)。

`test/run-live.cjs` 会把响应里的账号/密码/token 字段自动替换成 `***`；
上面那行账号省略是因为金额与余额都做了脱敏。

## 改了什么 · What changed

上游的 cron 是 `enable=true`，**装完即生效**。三处改动：

```ini
[Argument]
+auto = switch,false,tag=每日自动签到,desc=默认关闭；多设备只需一台打开

[Script]
-cron "0 9 * * *" ..., tag=AgentRouter签到, ..., enable=true
+cron "0 9 * * *" ..., tag=AgentRouter签到, ..., enable={auto}
```

**为什么要改**

1. **默认关闭** —— 多设备各装一份会各跑一轮登录请求。服务端有 `checked_in` 判重，
   不会多给奖励，但请求是实打实发出去的。改成按需开启。
2. **`enable={auto}` 走 Loon 调度层** —— 关闭时脚本不执行、不发请求、不耗流量。
   不是脚本里 `if` 判断。
3. **没做的**：加一条 `generic` 手动触发规则。曾一度加上，后确认 Loon 的 cron
   本身就能在插件页手动触发，多加一条纯属冗余，已删。

`argument=` 列表、上游 4 个 Argument、cron 时间**全部未动**。
脚本只改了奖励金额那一行正则（修一个真机实测出来的显示 bug）。
逐条依据见 [UPSTREAM.md](UPSTREAM.md)。

---

## 注意 · Notes

- **脚本已托管进本仓库**（`src/agentrouter.js`），上游删目录也不会失效。
  代价是上游更新不再自动生效 —— `python3 tools/vendor-check.py --diff` 会告诉你上游出了新版本，
  由你决定跟不跟。
- `#!icon` 仍指向上游（每次现取，不托管）。
- 上游仓库提供了 Surge / Quantumult X / Stash 的配置片段，本仓库只收 Loon 版。
- 账号密码由插件填写并保存在 Loon 本地，本仓库不涉及。