# 上游出处与改写对照 · Upstream Provenance & Patch Map

本文件记录上游来源与逐条改动依据，正文说明见 [README.md](README.md)。
Provenance and per-change reasoning; user-facing notes live in README.md.

---

## 上游 · Upstream

| 项 | 值 |
|---|---|
| 名称 Name | 拼多多去广告（修复版）v1.2 |
| 分发 Distributor | `https://kelee.one/Tool/Loon/Lpx/PinDuoDuo_remove_ads.lpx` |
| 规则原作者 Rule author | walala（怎么肥事） |
| 规则原始形态 Original form | Quantumult X snippet，`https://github.com/ZenmoFeiShi/Qx` → `Pinduoduo.snippet` |
| 规则版本 Snippet version | 7.79.0（2025-11-01） |
| 打包者 Repackager | 可莉 <https://github.com/luestr/ProxyResource> |
| 打包日期 Packaged | 2026-07-11 |
| 脚本 Script | `https://kelee.one/Resource/JavaScript/PinDuoDuo/PinDuoDuo_remove_ads.js`（2475 B） |
| 外部依赖 External | 无 · none（脚本纯本地计算，不联网） |

上游 QX snippet 与本次收录的 Loon 清单共有 **23 个端点完全一致**。
Loon 版另外新增 4 个端点、3 条规则、1 条 `host`→`DOMAIN` 改写，并移除了 QX 版的 7 条 `ip-cidr`。

> QX 片段本身还含 `ip-cidr` 形式的 7 条 IP 屏蔽与 `host, sdk.1rtb.net, reject`，
> 这些在 Loon 清单里没有对应物，**本仓库未补回**（无实测依据支持逐条还原）。

| 托管 Vendored | `src/upstream/PinDuoDuo_remove_ads.js`（原件，sha256 `63af2e44…`）<br>`src/chunks/9410-b8806e870a26db7d.js`（sha256 `e8e4f0e8…`） |

### 脚本层唯一的改动

`src/PinDuoDuo_remove_ads.js` 相对 `src/upstream/` 的原件**只差 1 行**：

```diff
-const newChunk = "https://kelee.one/Resource/JavaScript/PinDuoDuo/9410-b8806e870a26db7d.js";
+const newChunk = "https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/PinDuoDuo/src/chunks/9410-b8806e870a26db7d.js";
```

**为什么必须改**：上游脚本硬编码了那个 chunk 地址，会把拼多多页面里的官方 JS
（`pfile.pddpic.com`，12669 B）替换成 kelee.one 上的版本（5131 B，少了 `53203` 商品推荐模块
与 `27519`）。这是**页面运行时再去第三方域名取代码**——比 `script-path` 更隐蔽，
Loon 层面完全看不见。把 chunk 一并托管后，这条第三方依赖链才真正断开。

按仓库原则 #2（改脚本仅限取参、远程配置依赖与标识符），这属于「远程配置依赖」，
改动合规。`test/manifest.test.mjs` 的第 7 组会逐行比对并断言差异仅此一处。

**其余全部逐字节未改。** `oldChunk`（匹配用的官方地址）保持原样。

Only one line differs from the pristine upstream copy. Everything else is byte-for-byte.

---

## 逐条改动 · Change Map

证据等级：**实测** = 有抓包或真机验证；**推导** = 由清单文本或协议语义推出，未直接观测。

| # | 改动 | 依据 | 等级 |
|---|---|---|---|
| 1 | 新增 `[Argument]` 的 `chat_stub`，挂 4 条聊天/推荐端点 | 上游 0 个开关、28 条 `[Rewrite]` 全无 `enable=`，用户无从关闭 | 推导 |
| 2 | 新增 `[Argument]` 的 `telemetry_stub`，挂 8 个上报/监控域名 | 同上；`meta` 实测返回 37900 B 真实配置，阻断有代价 | 实测 |
| 3 | 移除 `DOMAIN, xg.pinduoduo.com, REJECT` | 基线抓包：`xg.pinduoduo.com/ngrtt/zqog` 返回 **101 Switching Protocols**，是消息推送 WebSocket | 实测 |
| 4 | 移除 `AND,((DOMAIN,api.pinduoduo.com),(PROTOCOL,QUIC)), REJECT` | `api` 的 ALPN 只协商 h2，服务端不提供 h3，该规则不触发却破坏传输指纹 | 实测 |
| 5 | 移除 2 条裸 IP 明文 `/d1` `/d2` REJECT | 基线抓包中真实形态是 `http://[IPv6]/d5` 且**无 query**，而 IPv6 规则要求结尾 `\?`，正则不匹配 → 0 命中 | 实测 |
| 6 | 修正 `homepage/hub` 的 jq：`?` → `if type=="array"` | `?` 只保护路径查找、不保护 `map` 迭代，字段为 null 时抛 `Cannot iterate over null` | 推导（真实数据下未触发） |
| 7 | 补 `#!desc` 说明、`#!date`、尾部注释 | 仓库体例 | — |
| 8 | `script-path` 改指本仓库托管副本 | 仓库 2026-09-29 新增的脚本托管约定 | — |

### 关于第 6 条的诚实说明

原写法：

```jq
.result.bottom_tabs? |= map(...) | .result.all_top_opts |= map(del(...))
```

`?` 保护的是**路径查找**，不是 `map` 的迭代行为。构造 `buffer_bottom_tabs: null` 或字段缺失时，
真 jq 确实抛 `Cannot iterate over null`，整条复写失败。

但把 2026-09-29 抓包里的**真实** `homepage/hub` 响应（gzip + base64，184300 B → 138225 B）
解出来跑一遍，**exit = 0，裁剪正常** —— 该版本 PDD 的 `buffer_bottom_tabs` 是 len=5 的真实数组。

⇒ 这是**潜在**缺陷，不是当前现症。仍然修，因为它不该依赖服务端字段恰好齐全。

### 关于第 5 条的风险提示

被注释掉的两条规则在本仓库的基线流量里 0 命中，但 `/d5` 通道本身是实打实在用的：

```
POST http://[240c:409f::3:0:163]/d5
  22 次 · 全部 200
  Server: titan-gslb
  Session-Ticket: <base64>     Session-Valid: 86400
  请求体 288 B–2324 B 加密 · 响应体 265 B–7939 B
```

这是拼多多的**会话票据通道**。上游 REJECT 了 `titan.pinduoduo.com`，却因 `/d5` 走裸 IP 而漏掉。
若换设备/换网络后该通道形态改变（如带上 query），规则会重新命中并切掉它。
恢复前请自行评估。

---

## 证据文件 · Evidence

| 文件 | 说明 |
|---|---|
| `test/manifest.test.mjs` | 46 项回归：开关声明==引用、高风险规则确已移除、jq 四场景、外部资源收敛 |
| `test/har-fixture.json` | 从基线 HAR 摘出的最小样本，供 jq 测试用 |

基线 HAR 本身（24 MB）不入库，仅摘取必要片段。
The 24 MB baseline HAR is not vendored; only minimal excerpts are.

---

## 致谢 · Credits

- **walala（怎么肥事）** — 规则原作者
- **ZenmoFeiShi** <https://github.com/ZenmoFeiShi/Qx> — QX 片段维护
- **可莉** <https://github.com/luestr/ProxyResource> — Loon 清单打包

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
