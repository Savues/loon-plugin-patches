# PinDuoDuo · 拼多多去广告（修复版）

> 修复聊天消息刷不出来、修复 jq 空值崩溃、移除三条无效或有害的 REJECT。
> Fixes broken chat refresh, a jq null crash, and three ineffective or harmful REJECT rules.

**v1.0** · 2 开关 / 28 复写 / 2 域名 · 抓包基线 PDD 8.26.0（iPad16,1） · 更新 `2026-09-29T11:55`

| | 中文 | English |
|---|---|---|
| 脚本 | 1 个，**上游原版未改** | 1 script, **upstream, unmodified** |
| 改动范围 | 仅清单层：1 处 jq 表达式 + 4 条 `enable` | Manifest only: 1 jq expression, 4 `enable` guards |
| 证据 | 用户基线 HAR（461 请求，未开插件） | Baseline HAR, plugin disabled |

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/PinDuoDuo/PinDuoDuo.lpx
```

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。
> 拉不到时在订阅地址末尾加随机参数：`?cb=2`
>
> CDN cache may lag up to 24h. Append a random param to force refresh: `?cb=2`

---

## 为什么要修 · Why this exists

用户报告两个故障：聊天消息刷不出来；用了插件后被平台限制浏览。
拿用户提供的**未开插件基线 HAR**（461 请求）逐条模拟上游规则后，定位到：

Two symptoms were reported. Simulating the upstream rules against the user's
**baseline HAR with the plugin disabled** (461 requests) pinned both down:

| 故障 | 直接原因 | 证据 |
|---|---|---|
| 聊天刷不出来 | 上游 `DOMAIN, xg.pinduoduo.com, REJECT` | 该域名承载 WebSocket 推送连接 |
| 疑似被限制浏览 | 28 条复写改写服务端下发内容 + 8 个域名被切断 | 命中 65 次，含 37 KB 真实配置 |

### 决定性证据：`xg` 是推送通道

```
GET http://xg.pinduoduo.com/ngrtt/zqog
  请求: Connection: Upgrade / Upgrade: websocket / Sec-WebSocket-Key / Sec-WebSocket-Version: 13
  响应: 101 Switching Protocols
        Sec-WebSocket-Accept: QO2eSWwlXq5vOfC2Cwl5KcenqgQ=
        x-yak-request-id: 1790653577520-4b793faccf077c885e81269d903e4111
```

上游把 `xg` 整域 REJECT，等于**直接掐断消息推送长连接**。
`/api/phantom/_stm` 也在同一域名 —— `phantom` 正是上游另一条 reject 端点所属的模块。

The upstream REJECTs this whole domain, severing the push connection outright.

### 顺带查实的几件事 · Also established

- **`meta` 不是纯风控口**。实测 `meta.pinduoduo.com/api/app/v2/experiment` 与
  `/api/one-gateway-client/zone/v1/component/fetch` 合计返回 **37900 B 真实 AB 实验与配置下发数据**。
  切断它有实际功能代价，所以改成了可关的开关而非直接删。
- **两条裸 IP 规则 0 命中**。真实形态是 `http://[IPv6]/d5` 且**无 query**，
  而上游的 IPv6 规则要求结尾 `\?`，正则不匹配。写了但打不中。
- **QUIC 规则不触发**。`api.pinduoduo.com` 的 ALPN 只协商 h2，服务端根本不提供 h3。
- **去广告本身是有效的**。真实 `homepage/hub` 响应里 `bottom_tabs` 确有 5 项，
  含 `pdd_live_tab_list.html` 与带推广参数的 `attendance.html` —— 正是插件要删的那些。

---

## 开关 · Switches

两个都**默认开**（保持上游行为）。在 Loon 插件参数页直接切换，不用改文件。

| 开关 | 覆盖 | 什么时候关 |
|---|---|---|
| `chat_stub` | 4 条聊天/推荐端点 | **聊天刷不出来时关掉** |
| `telemetry_stub` | 8 个埋点/监控/配置域名 | 怀疑被风控、或 App 行为异常时关掉 |

`chat_stub` 覆盖的端点：

| 端点 | 作用 |
|---|---|
| `/api/caterham/v3/query/new_chat_group` | 会话分组 |
| `/api/zaire_biz/chat/resource/get_list_data` | 聊天资源 |
| `/api/caterham/v3/query/personal` | 个人页聚合 |
| `/api/buffon/nasus/recommend` | 推荐流 |

> 上游的 28 条 `[Rewrite]` **一条 `enable` 都没有**，`[Argument]` 段整个不存在。
> 换句话说，用户连「关掉某一项」的入口都没有。本版补上了。

---

## jq 修正 · The jq fix

上游写法：

```jq
.result.bottom_tabs? |= map(...) | .result.all_top_opts |= map(del(...))
```

`?` 保护的是**路径查找**，不保护 `map` 的迭代。构造 `buffer_bottom_tabs: null` 或字段缺失时，
真 jq 抛 `Cannot iterate over null`，整条复写失败。

改为先判类型再迭代：

```jq
.result.bottom_tabs? |= (if type=="array" then map(...) else . end) | ...
```

**诚实说明**：把 2026-09-29 抓包里的**真实**响应（gzip + base64，184300 B → 138225 B）
解出来跑一遍，上游写法 **exit = 0、裁剪正常** —— 该版本 PDD 的 `buffer_bottom_tabs` 是 len=5 的真数组。
所以这是**潜在**缺陷而非当前现症。仍然修，因为它不该依赖服务端字段恰好齐全。

---

## 为什么删这三条 · Why these three were removed

| 规则 | 处理 | 理由 |
|---|---|---|
| `DOMAIN, xg.pinduoduo.com, REJECT` | **移除** | 实测是 WebSocket 推送通道（101） |
| `AND,((DOMAIN,api),(PROTOCOL,QUIC)),REJECT` | **移除** | ALPN 只协商 h2，规则不触发 |
| 2 条裸 IP `/d1` `/d2` REJECT | **注释掉** | 基线 0 命中（真实形态无 query） |

裸 IP 那两条默认注释掉了，但**要提醒**：被拦的 `/d5` 本身是在用的会话票据通道 ——
22 次请求全部 200，响应头 `Server: titan-gslb`、`Session-Ticket: <base64>`、`Session-Valid: 86400`。
上游 REJECT 了 `titan.pinduoduo.com`，却因 `/d5` 走裸 IP 而漏掉。
若换设备或换网络后该通道形态改变（例如带上 query），规则会重新命中并切掉它。

逐条依据与证据文件见 [UPSTREAM.md](UPSTREAM.md)。

---

## 回归测试 · Regression test

```bash
node test/manifest.test.mjs
```

35 个用例，覆盖开关声明与引用一致、三条高风险规则确已移除、
jq 在真实抓包数据与四种异常结构下均不崩、去广告功能未被误伤。

---

## 已知限制 · Known limits

| 项 | 说明 |
|---|---|
| 基线单一 | 结论基于一台设备（iPad16,1 / PDD 8.26.0）的一次日常使用，461 个请求 |
| 20 条 reject-dict 未观测 | 这批端点在基线中一次都没出现，属低频/特定页面触发，未能实证其响应 |
| 未解疑点 | `/api/alexa/homepage/hub` 挂了**两条** `[Rewrite]`（json-del + json-jq），Loon 官方手册未说明同一 URL 多条规则的执行顺序 |
| 上游 JS 未审 | `PinDuoDuo_remove_ads.js` 保持原样引用，未做改动也未做审计 |
| 非现症 | jq 缺陷在真实数据下不触发（见上） |

---

## 致谢 · Credits

- **walala（怎么肥事）** — 规则原作者
- **ZenmoFeiShi** <https://github.com/ZenmoFeiShi/Qx> — Quantumult X 片段维护
- **可莉** <https://github.com/luestr/ProxyResource> — Loon 清单打包

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
