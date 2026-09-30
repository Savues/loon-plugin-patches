# AgentRouter 签到（修改版）

> 上游插件的清单层修改：**自动签到默认关闭**，另加「立即签到」手动触发。脚本逐字节托管自上游。
> Manifest-only patch of an upstream plugin: the daily cron is **off by default**, plus a manual
> trigger. The script is vendored byte-for-byte, unmodified.

| | 中文 | English |
|---|---|---|
| 清单改动 | 1 个开关 + cron 挂 `enable` + 1 条 generic | One switch, `enable` on cron, one `generic` |
| 脚本改动 | **1 行正则**（修奖励金额识别不出来），原件另存 `src/upstream-/` | **One regex** (reward amount never parsed); pristine copy kept |
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
| [test/manifest.test.mjs](test/manifest.test.mjs) | 回归测试，22 个用例 | Regression tests |
| [test/run-live.cjs](test/run-live.cjs) | 真机全流程测试（读环境变量） | Live end-to-end test |

```bash
node test/manifest.test.mjs        # 离线，22 个用例
AGENTROUTER='用户#密码' node test/run-live.cjs   # 真实网络
python3 tools/vendor-check.py --diff            # 上游是否更新
```

---

## 真机实测 · Live test

2026-09-30 用真账号跑通全流程（`AGENTROUTER` 环境变量，格式 `用户名#密码`）：

```
【通知】AgentRouter
  ✅ 今日签到已确认
  👤 账号：tg***ax
  🎁 今日奖励：+$25.00（今日记录）
  💳 当前余额：$671.57
  📉 累计消耗：$3.43
  ⚡ 累计调用：37 次
  🕒 签到时间：00:05:20
```

**这条实测揪出了上游一个 bug**：修复前同一行显示的是
「🎁 今日奖励：金额未识别，请到网站核对」——
服务端 `/api/log/self` 返回的金额符号是**全角 `＄`（U+FF04）**，上游正则只认半角 `$`。
本仓库把字符类改成 `[$＄]` 修掉了，详见 [UPSTREAM.md](UPSTREAM.md)。

`test/run-live.cjs` 会把响应里的账号/密码/token 字段自动替换成 `***`，
账号名也只显示 `tg***ax` 这种脱敏形式。

---

## 用法 · Usage

| 开关 | 默认 | 作用 |
|---|---|---|
| **每日自动签到** | **关** | 打开后每天 09:00 自动执行 |
| 调试模式 | 关 | 上游自带，输出请求状态与签到判定 |

插件页面两个可点项：

| 按钮 | 行为 |
|---|---|
| **立即签到** | 手动跑一次，**不受开关影响** |
| **AgentRouter签到** | 开关关闭时为灰色，Loon 不调度 |

**多设备**：全部装上，只在**一台**上打开「每日自动签到」，其余保持默认关闭。

账号密码仍在上游那三个输入框里填，本改动没有动它们。

---

## 改了什么 · What changed

上游的 cron 是 `enable=true`，**装完即生效**。三处改动：

```ini
[Argument]
+auto = switch,false,tag=每日自动签到,desc=默认关闭；多设备只需一台打开。关闭后仍可手动点「立即签到」

[Script]
-cron "0 9 * * *" ..., tag=AgentRouter签到, ..., enable=true
+cron "0 9 * * *" ..., tag=AgentRouter签到, ..., enable={auto}
+generic ..., tag=立即签到, ...
```

**为什么要改**

1. **默认关闭** —— 多设备各装一份会各跑一轮登录请求。服务端有 `checked_in` 判重，
   不会多给奖励，但请求是实打实发出去的。改成按需开启。
2. **`enable={auto}` 走 Loon 调度层** —— 关闭时脚本不执行、不发请求、不耗流量。
   不是脚本里 `if` 判断。
3. **补 `generic` 手动触发** —— 上游只有 cron，开关一关插件就完全没有可点项，
   没法验证账号密码填对没有。这条规则刻意不写 `enable=`。

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