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

## 有效性存疑 · ⚠️ 有效性没有真机验证

上游脚本头部注释写着 **2022-12-26、AdGuard 4.4.5**，距今已三年多。

**我没有真机 AdGuard，没有抓包，本插件是否还能真的解锁，未经任何验证。**
端点路径、响应结构、客户端判定逻辑都可能早已变化。

本仓库能保证的只有一件事：**本脚本与上游脚本行为等价**（57 个测试用例）。
上游若失效，本版同样失效 —— 这是等价重写的必然代价，
但至少失败原因是明确的、而不是「镜像脚本改坏了」。

要确认是否有效，请抓一次包看 `mobile-api.adguard.org` 还有没有
`ios_validate_receipt` 这个请求。有基线抓包后，判断才有依据。

---

## 风险 · Risk

1. **凭据外发**：无。脚本不含 `$httpClient` / `fetch` / `eval`，测试逐一断言（这四类 API 任一出现即测试失败）。
2. **MITM 不可关**：见上。
3. **服务端不认**：见上，所有权与订阅状态在服务端，本插件只改客户端看到的东西。
4. **上游已死**：见上。

---

## 致谢 · Credits

脚本与清单版权归原作者 [Passer_by_yun](https://t.me/yqc_123) 所有
（分发者 yqc007，站点 yfamilys.com），**上游版权与许可全部适用**。

本仓库的贡献限于：去混淆等价重写、托管位置迁移、清单层加开关。
逐句对照见 [UPSTREAM.md](UPSTREAM.md)。
