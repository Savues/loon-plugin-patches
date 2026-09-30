# AgentRouter 签到（修改版）

> 上游插件的清单层修改：**自动签到默认关闭**，另加「立即签到」手动触发。脚本逐字节托管自上游。
> Manifest-only patch of an upstream plugin: the daily cron is **off by default**, plus a manual
> trigger. The script is vendored byte-for-byte, unmodified.

| | 中文 | English |
|---|---|---|
| 改动范围 | **仅清单层**：1 个开关 + cron 挂 `enable` + 1 条 generic | **Manifest only**: one switch, `enable` on cron, one `generic` |
| 脚本改动 | **0 行**，托管进 `src/`，sha256 由 `manifest.json` 钉死 | **None**, vendored into `src/`, sha256 pinned in `manifest.json` |
| 依据 | 多设备重复签到 | Duplicate check-ins across devices |

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/AgentRouter/AgentRouter.lpx
```

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。拉不到时在地址末尾加随机参数：`?cb=2`

| 文件 | 用途 | Purpose |
|---|---|---|
| [AgentRouter.lpx](AgentRouter.lpx) | 插件清单 | Plugin manifest |
| [src/agentrouter.js](src/agentrouter.js) | 上游脚本原件，逐字节未改 | Upstream script, byte-for-byte |
| [upstream-agentrouter.lpx](upstream-agentrouter.lpx) | 上游清单原件 | Upstream manifest, byte-for-byte |
| [manifest.json](manifest.json) | 托管件 sha256 登记 | sha256 registry |
| [UPSTREAM.md](UPSTREAM.md) | 上游出处与逐条改动依据 | Provenance & per-change reasoning |
| [test/manifest.test.mjs](test/manifest.test.mjs) | 清单回归测试，18 个用例 | Manifest regression tests |

跑测试：`node test/manifest.test.mjs`
查上游是否更新：`python3 tools/vendor-check.py --diff`

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

`argument=` 列表、上游 4 个 Argument、cron 时间、脚本本体**全部未动**。
逐条依据见 [UPSTREAM.md](UPSTREAM.md)。

---

## 注意 · Notes

- **脚本已托管进本仓库**（`src/agentrouter.js`），上游删目录也不会失效。
  代价是上游更新不再自动生效 —— `python3 tools/vendor-check.py --diff` 会告诉你上游出了新版本，
  由你决定跟不跟。
- `#!icon` 仍指向上游（每次现取，不托管）。
- 上游仓库提供了 Surge / Quantumult X / Stash 的配置片段，本仓库只收 Loon 版。
- 账号密码由插件填写并保存在 Loon 本地，本仓库不涉及。