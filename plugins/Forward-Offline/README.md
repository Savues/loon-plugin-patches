# Forward-Offline · Forward 的离线替代

> 原版把订阅查询请求改写到作者的 Cloudflare Worker，由 Worker 返回伪造凭据。
> 作者一旦下线，插件即刻失效。本插件改用**本地脚本**在请求发出前直接返回同样结构的响应，
> **不依赖任何外部服务器**。**v1.1**

| | 中文 | English |
|---|---|---|
| 上游 | `upstream-Forward.lpx`（逐字节原件，SHA256 见 `upstream-SHA256SUMS`） | Pristine upstream copy |
| 上游是否含 JS | **否**（全文 4 行有效配置，无 `[Script]`、无 `script-path`） | No (4 config lines, zero JavaScript) |
| 本插件脚本 | `forward-offline.js`，**自研**，不含任何上游代码 | Self-written, no upstream code |
| 回归测试 | `test/manifest.test.mjs` 46 例 + `test/forward-offline.test.mjs` 21 例 | 67 assertions |

---

## 安装 · Install

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Forward-Offline/Forward-Offline.lpx
```

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。拉不到时加随机参数：`?cb=2`

| 文件 | 用途 | Purpose |
|---|---|---|
| [Forward-Offline.lpx](Forward-Offline.lpx) | 插件清单 | Plugin manifest |
| [forward-offline.js](forward-offline.js) | 伪造响应的脚本 | Response script |
| [mock-server.js](mock-server.js) | 独立 mock 服务端，可在电脑自建 | Standalone mock server |
| `test/` | 回归测试 52 例 | Regression tests |
| `samples/` | 线上响应采样 + 提取出的固定前缀 | Captured samples |
| `upstream-Forward.lpx` | 上游清单原件（仅存档对照） | Pristine upstream copy |

跑测试：

```bash
node test/manifest.test.mjs
node test/forward-offline.test.mjs
```

> ⚠️ **不要与原版 `Forward.lpx` 同时启用。** 两条规则会争同一个请求，行为不可预期。
> 换装步骤：先停用原版，再启用本版。

---

## 能独立运行吗 · Can it run standalone

**不能完全独立。** 这一点必须说清楚，否则会误判可靠性。

`.lpx` **不支持内联 JavaScript** —— 脚本只能通过 `script-path=` 指向外部 URL。
依据：官方 `LoonExampleConfig` 仓库 11 个插件样例、`Loon0x00/LoonManual` 的 `script.md`
与 `plugin.md`、wiki 的插件章节，所有 `script-path` 示例无一例外都是 URL；
wiki 完整示例里的 `script-path=remove_ads.js` 是占位符写法，
**没有任何官方文档说明它会解析成同目录文件**。

所以本插件的依赖是：

| 依赖 | 失效后果 | 原版对比 |
|---|---|---|
| 本仓库的 `raw.githubusercontent.com`（托管 `forward-offline.js`） | 脚本加载失败，插件失效 | 原版依赖作者的 `mock.forward1.workers.dev`，**同一类风险，且不受你控制** |
| `crypto.getRandomValues` | 无（Loon 运行时提供；已写 `Math.random` 兜底） | — |

**净收益是把「别人控制的服务」换成「你自己控制的服务」。** 不是消除依赖，是换了个主人。

要做到真正的零网络依赖，只能放弃 `.lpx` 这条路，把脚本手动导入 Loon 内部脚本库
（`script-path` 指向本地文件），但那样就不是「订阅一个 URL」能完成的事了。

---

## 原理 · How it works

### 原版

```ini
[Rewrite]
^https://fluxapi\.vvebo\.vip/v1/(purchase/iap/subscription) header https://mock.forward1.workers.dev/forward/v1/$1
[Mitm]
hostname = fluxapi.vvebo.vip
```

`header <url>` 在 Loon 里是 **URL 类型复写**（查 `rewrite.md` 原文确认），不是改 header。
即把请求整条转发到作者的 Worker。

### 本插件

```ini
[Script]
http-request ^https:\/\/fluxapi\.vvebo\.vip\/v1\/purchase\/iap\/subscription script-path=.../forward-offline.js, requires-body=true, timeout=10, enable=true
[Mitm]
hostname = fluxapi.vvebo.vip
```

用 **http-request 而不是 http-response**：请求在**离开设备之前**就被假响应拦下。

| 失效场景 | 原版 | 本插件 |
|---|---|---|
| 作者的 Worker 下线 | ❌ 失效 | ✅ 不受影响 |
| `workers.dev` 被污染 / 被规则拦 | ❌ 失效 | ✅ 不受影响 |
| 真实服务器关停 | ✅ 不受影响 | ✅ 不受影响 |
| 本仓库脚本托管失效 | ✅ 不受影响 | ❌ 失效 |

> `[MITM]` 仍需声明：要看到 https 请求就必须先解密。
> `[Rewrite]` 段刻意留空 —— **不要补 `reject` 兜底**，它会和 `[Script]` 抢同一个请求。

---

## 响应结构（HAR 实测）· Response structure

2026-09-29 用 4 份 HAR、**23 个带签名样本**实测确定：

```
密文 352 字节 = 128 字节恒定前缀 + 224 字节变化段
  → base64                = 472 字符
  → JSON.stringify 加引号  = 474 字节
  → 再 base64（不加引号）  = 632 字符   ← 这就是 HTTP 响应体
```

| 观察 | 结论 |
|---|---|
| 128 字节前缀在 **23 个样本中逐字节相同** | 恒定模板，见 `samples/prefix-128.hex` |
| 224 字节变化段**每次请求都变** | 密文内容，非随机噪声 |
| 外层是**裸 base64 不带引号** | 尽管 `content-type` 是 `application/json` |
| 同一签名重复请求真实服务器 3 次 | 恒定 336 字节密文，内容每次都变 |

### 🔴 v1.0 失效的根因

| | v1.0（错） | 实测（对） |
|---|---|---|
| 变化段长度 | 160 字节 | **224 字节** |
| base64 层数 | 单层 | **双层，且外层不加引号** |
| HTTP 响应体 | 386 字节 | **632 字节** |

128 字节前缀一直是对的，错的是**长度和包装层数**。App 解不开 386 字节，判定未订阅。

> 教训：早期我用**不带签名头**的请求采样，拿到的是 mock 的 288 字节**降级响应**，
> 据此误判「只校验结构、尾部可随机生成」。真实凭据必须用 App 实际发出的
> 带 `x-timestamp` / `x-auth-key` / `x-signature` 的请求去采样才有意义。

### 真实服务器对照

| 请求方式 | 结果 |
|---|---|
| `POST https://fluxapi.vvebo.vip/v1/purchase/iap/subscription`（带合法签名，绕过 Loon） | 200，**336 字节密文** |
| 同一请求走 mock.forward1.workers.dev | 200，**352 字节密文** |
| 不带签名头 | 200，288 字节降级响应 |

⇒ mock 服务器**不是必需的**：真实服务器自己就会发放凭据（密文 336 字节，比 mock 少 16 字节）。
两者的 128 字节前缀相同（`731570b9...`），属同族格式。

### 复现取证

```bash
UA='Loon/700'
# 用 App 真实请求（含三个签名头）打服务器
curl -s -X POST -A "$UA" \
  -H "x-timestamp: <ts>" -H "x-auth-key: <uuid>" -H "x-signature: <hex>" \
  --data-binary @body.txt \
  'https://mock.forward1.workers.dev/forward/v1/purchase/iap/subscription'

# 绕过 Loon 改写打真实服务器
curl -sk --resolve fluxapi.vvebo.vip:443:47.246.23.185 -X POST \
  -H "x-timestamp: <ts>" -H "x-auth-key: <uuid>" -H "x-signature: <hex>" \
  --data-binary @body.txt \
  'https://fluxapi.vvebo.vip/v1/purchase/iap/subscription'
```

---

## 自建服务端 · Self-host

不想在 Loon 里跑脚本，或想在电脑上复现：

```bash
node mock-server.js 8787
```

已实测与线上逐项一致（含 404 分支：非 POST 或非目标路径一律 `404 Not Found`）。
把清单里的 `script-path` 换成本地地址即可，例如：

```ini
^https:\/\/fluxapi\.vvebo\.vip\/v1\/purchase\/iap\/subscription header http://192.168.1.10:8787/forward/v1/$1
```

---

## 已知限制 · Limitations

1. **不是真正的内购凭据。** 返回的是自造的 base64，与 Apple 的真实收据无关。
   对依赖 Apple 服务端校验的功能无效。
2. **只拦一条路径。** `/v1/purchase/iap/subscription` 之外的 API 照旧打真实服务器。
3. **上游 API 若改结构，本插件会静默失效。** 128 字节前缀是从黑盒采样得来的，
   真实含义未知（可能是签名或加密头）。若日后 App 升级导致前缀变化，
   需重新采样 —— 换言之**这个插件没有长期保证**。
4. **无法验证 App 端是否真的接受。** 沙盒里没有该 App，
   「响应结构一致」不等于「App 校验通过」。首次换装请自行确认。

---

## 上游版权与许可 · Upstream

上游清单原件逐字节保留在 `upstream-Forward.lpx`，仅作存档与对照，**未做任何修改**。
上游未附任何许可声明。

本插件的 `forward-offline.js` 与 `mock-server.js` 为**独立编写**，不含上游任何代码
（上游本就没有 JavaScript）。响应结构由黑盒实测得出，未参考任何反编译代码。
