# AdGuard-Spoof · 收据校验回包本地伪造

把 AdGuard iOS 的收据校验接口回包整个换成「你买过终身版，且当前有效」。
**纯本地生成，不请求任何第三方** —— 与 Reven-Mirror 那种「转发到作者 Worker」的镜像不同，这里没有任何运行时外部依赖。

> ⚠️ 这是绕过付费校验的破解脚本。服务端仍认为你未购买，本插件不解锁任何服务端侧功能。
> 仅供个人学习研究，请勿用于商业用途。是否使用由你自己判断。

---

## 安装 · Install

订阅地址（Loon → 配置 → 插件 → 右上角 `+` → 粘贴）：

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/AdGuard-Spoof/AdGuard-Spoof.lpx
```

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。拉不到时在地址末尾加**随机**参数：`?cb=<随机数>`

| 文件 | 用途 | Purpose |
|---|---|---|
| [AdGuard-Spoof.lpx](AdGuard-Spoof.lpx) | 插件清单 | Plugin manifest |
| [src/receipt.response.js](src/receipt.response.js) | 改写脚本，**有效代码 9 行** | Rewrite script |
| [test/equivalence.test.mjs](test/equivalence.test.mjs) | 等价性回归测试，57 个用例 | Equivalence tests |
| [UPSTREAM.md](UPSTREAM.md) | 上游出处与逐句对照 | Provenance & patch map |
| `upstream-AdGuardProCrack.js` | 上游混淆原件（逐字节存档） | Upstream original |
| `upstream-adguard.plugin` | 上游清单原件（逐字节存档） | Upstream manifest |

跑测试：`node test/equivalence.test.mjs`

---

## 原理 · How it works

拦截一个端点，命中即伪造回包：

```
POST https://mobile-api.adguard.org/api/v1/ios_validate_receipt
```

不管服务端返回什么，一律换成：

```json
{"products":[{"product_id":"com.adguard.lifetimePurchase","premium_status":"ACTIVE"}]}
```

客户端信了 → 显示高级版。就这么多，脚本有效代码 9 行。

---

## 开关 · Switch

| 开关 | 默认 | 作用 |
|---|---|---|
| **伪造收据校验回包** | **开** | 关闭后脚本不执行 |

> ⚠️ 关闭开关**不会关掉解密**。Loon 的 `[Mitm]` 段不支持 `enable={}`，
> 官方文档全文无此记载。`mobile-api.adguard.org` 仍会被解密，只是不再改写响应。

---

## 与上游的差别 · What changed

只有三处,全在清单层和脚本的「等价去混淆」范围内:

| # | 改动 | 理由 |
|---|---|---|
| 1 | `script-path` 从 `raw.githubusercontent.com/yqc007/…` 改指本仓库 | 上游那份随时可被换掉；纯本地可 diff、可复现 |
| 2 | 混淆脚本去混淆重写 | 1905 B 单行混淆 → 9 行可读代码。**产物逐字节等价**，由测试证明 |
| 3 | 加一个 `switch`（默认开） | 上游无法关闭，只能整体停用插件 |
| 4 | **修掉一处真实缺陷** | 见下 |

### 🔴 修掉的缺陷：上游在非 JSON 响应上会卡死

上游有一行 `JSON.parse($response.body)`，但解析结果**随即被整个覆盖，从未被读取**。
它唯一的作用是在服务端返回非 JSON 时抛异常 —— 抛了异常 `$done` 就不执行，
在 Loon 里的表现是**请求挂到超时**，而不是「放行原样通过」。

实测（测试第 4 组，三组输入逐一验证）：

| 输入 | 上游 | 本版 |
|---|---|---|
| `<html>502 Bad Gateway</html>` | 抛 `Unexpected token '<'`，**无 `$done`** | 正常产出回包 |
| 空 body | 抛 `Unexpected end of JSON input` | 正常产出回包 |
| 截断的 JSON | 抛异常 | 正常产出回包 |

删掉这次无用的解析即可，**不改变任何合法输入下的输出**（测试同样钉死）。

### 没有做的三件事

| 没做 | 为什么 |
|---|---|
| 收窄端点正则 | `\/api\/.+\/ios_…` 的 `.+` 看起来能收紧，但那是**改拦截范围**，属于行为变更。只做等价重写 |
| 改 `premium_status` / 商品 ID | 无依据的猜测。等真机抓包证明需要再说 |
| 给 `[Mitm]` 加开关 | Loon 不支持。**说清楚而不是假装有** |

---

## 有效性 · ✅ 端点已真机验证存活（2026-09-29）

v1.0 发布时这里写的是「有效性未验证」。用户随后提供了一份真机抓包
（iPad · iPadOS 18.7.3 · AdGuard 4.5.23），结论如下：

| | 未装插件 19:54:19 | 已装插件 19:54:51 |
|---|---|---|
| `ios_validate_receipt` 回包 | `{"products":[]}` | `{"products":[{"product_id":"com.adguard.lifetimePurchase","premium_status":"ACTIVE"}]}` |
| Loon 日志 | `script: []` | `script: ["AdGuardProCrack.js"]` · `modifiedResponse: true` |
| `content-length` | 15 | 86（与伪造体字节数一致） |

**端点仍是 `/api/2.0/ios_validate_receipt/ADG_EXT`，三年过去结构没变。**
上游那条正则**一个字没改就抓到了** —— 这也是当初不收窄它的回报。

### 只需用一次

用户实测确认：**装上跑一次即可，之后不卸载就一直保持会员。**
客户端在首次校验后把结果缓存到了本地，不再每次联网重验。
所以日常可以**把 `spoof` 开关关掉**，插件留着不卸载即可。

### ✅ `status.html` 不用拦（已由真机实测排除）

同一份抓包里还有一个本插件没拦的端点：

```
POST https://mobile-api.adguard.org/api/1.0/status.html
```

它在两段里回包**逐字节相同**，仍在老实报：

```json
{"status":"FREE","lifetime":false,"licenseKey":null,"subscription":null, ...}
```

**一度怀疑解锁不完整** —— 收据端点伪造了，这个还在说 FREE。
用户实测后排除：**插件可用、解锁正常、开关正常**。

结论：**AdGuard 4.5.23 的会员态由收据校验结果决定，不读 `status.html`。**
这正好印证了当初不拦它的决定是对的 —— 手上只有 `status: FREE` 一份样本，
若当时靠猜字段去伪造付费回包，反而是拿一个能用的插件去冒 App 崩的风险。

（`status.html` 走的是另一套 license key 体系，本机没买过 key，
`licenseKey: null`、`lifetime: false` 都是如实反映，不是插件造成的。）

---

## 风险 · Risk

1. **凭据外发**：无。脚本不含 `$httpClient` / `fetch` / `eval`，测试逐一断言。
2. **MITM 不可关**：关掉 `spoof` 开关后，Loon 仍会解密 `mobile-api.adguard.org`。
3. **服务端不认**：所有权与订阅状态在服务端，本插件只改客户端看到的东西。
4. **未绑定设备**：伪造的是**一次性**收据校验结果。若 App 未来改成每次联网重验，
   或用户清空 App 数据，本插件需要重新生效一次（开关打开、App 启动一次）。
5. **许可未声明**：上游未声明任何许可条款，使用前请自行确认。

---

## v1.01 修的 bug

**症状**：在 iPad 上导入后提示「插件不可用 / 不支持的操作系统」，插件根本不加载。

**根因**：`#!system=iOS` —— 漏了 `iPadOS`。Loon 拿这个字段跟设备系统比对，
缺 iPadOS 就判为不兼容。本仓库其余 9 个插件都写了 `iPadOS`，**只有本插件漏了**。

已加断言钉死，并加了一条跨插件对照检查
（`仓库内所有声明 iOS 的插件都同时声明了 iPadOS`），防止再次成为仓库里的唯一例外。

---

## 致谢 · Credits

脚本与清单版权归原作者 [Passer_by_yun](https://t.me/yqc_123) 所有
（分发者 yqc007，站点 yfamilys.com），**上游版权与许可全部适用**。

本仓库的贡献限于：去混淆等价重写、托管位置迁移、清单层加开关。
逐句对照见 [UPSTREAM.md](UPSTREAM.md)。
