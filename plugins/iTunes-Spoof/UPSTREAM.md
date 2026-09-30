# 上游出处与改写对照 · Upstream Provenance & Patch Map

本文件记录上游来源与逐条改动依据，正文说明见 [README.md](README.md)。

---

## 上游 · Upstream

| 项 | 值 |
|---|---|
| 名称 Name | iTunes系列解锁 |
| 分发 Distributor | `https://reven.jsforbaby.workers.dev/reven/iTunes.lpx`（1121 B） |
| 脚本 Script | `https://reven.jsforbaby.workers.dev/reven/loon-itunes.js`（**374259 B**） |
| 运行时 Worker | `https://reven.lovebabyforever.workers.dev/` ← **与分发站不同域** |
| 作者 Author | Jsforbaby |
| 许可 License | **上游未声明** |
| 外部依赖 External | ⚠ **有，且不可消除** —— 见「镜像没能消除什么」 |

| 托管 Vendored | `src/loon-itunes.js`（原件，sha256 `2fab4bf8…`）<br>`upstream-iTunes.lpx`（原件清单，sha256 `22de70f2…`） |

### 与仓库内 Reven-Mirror 的关系

同一作者、同一架构（客户端零逻辑，伪回包在 Worker 端生成）。但有几处不同：

| | Reven-Mirror | 本插件 |
|---|---|---|
| 分发站 | `reven.jsforbaby.workers.dev` | 同 |
| 运行时 Worker | `reven.jsforbaby.workers.dev` | **`reven.lovebabyforever.workers.dev`** |
| 脚本体积 | 4369 B（**可读**） | **374259 B**（重度混淆） |
| 参数接线 | ✅ 自己解析字符串，正常 | 🔴 期待驼峰对象，**失效** |
| 作用域名 | 7 个 SDK 域名 | 1 个 `buy.itunes.apple.com` |

**脚本大了 85 倍，参数接线反而坏了。** 这是本次收录的核心发现。

---

## 🔴 上游 bug：参数页的开关关不掉

### 现象

`#!desc` 写「可在设置中关闭」，`[Argument]` 声明了 `Enabled` 参数并接进 `argument=[{Enabled},{Expires},{Country}]`。
但**用户在参数页把 `Enabled` 填 `false`，插件照样转发、照样生成伪造凭证。**

### 根因（实测，非推断）

| | 形状 |
|---|---|
| 上游读的是 | `$argument.Enabled` / `$argument.Expires` / `$argument.Country` —— **驼峰对象** |
| Loon 按 `argument=[{A},{B},{C}]` 传的是 | `"值1,值2,值3"` —— **逗号分隔字符串** |

类型不匹配 → 三个属性读到 `undefined` → 全部落回默认值 → **开关恒为 `true`**。

### 证据是怎么拿到的

上游是 374 KB 混淆代码，**字符串表里的条目本身还是二次编码**（`W7DyeCoPW7C` 这种
自定义 Base64 变体，不是标准 Base64），配 wasm 风格的自解机。逐条解码不现实。

改用**在 Node 沙盒里跑它，截获它对外的调用**：

```js
// 用 Proxy 当 $argument，记录脚本访问了哪些属性
$argument → { Enabled, Expires, Country }   ← 实测访问记录
```

**对照验证**（同一份脚本，只改 `$argument` 的类型）：

| 传入 | 脚本实际请求的 URL |
|---|---|
| `'false,2027-01-01,CN'`（字符串） | `?enabled=true&expires=2099-09-09&country=HK` ← 全落默认 |
| `{Enabled:'false',...}`（对象） | **完全不请求** ← 开关真的生效 |
| `{Enabled:'true',Expires:'2027-01-01',Country:'CN'}` | `?enabled=true&expires=2027-01-01&country=CN` ✅ |

⇒ **类型不对，是唯一原因。** 不是逻辑写错。

### 为什么修法这么小

原计划是「改 374 KB 混淆代码，绕过那段数组假设」。
查清之后这个计划**被推翻** —— 根本不需要改。

**类型不对，在它运行前喂对就行。** 壳层 1.7 KB，一行上游代码都没碰。

> 这正是仓库原则 #2 的边界所在：**远程配置依赖**属于允许改动��范围。
> 壳层是新增文件，不是改上游；上游 374 KB 逐字节未改，由测试第 4 组证明。

---

## v1.0 逐条改动 · Change Map

| # | 改动 | 依据 | 等级 |
|---|---|---|---|
| 1 | `script-path` → 本仓库 `main` 分支 | 上游脚本挂在作者站点，可随时替换 | 实测 |
| 2 | **新增壳层** `src/prelude.js`，修正参数类型 | 见上。壳层 + 上游合成 `src/itunes-spoof.js` | 实测 |
| 3 | `tag=iTunes转发` → `iTunes收据转发` | 与上游同名 tag 区分，便于在 Loon 里分辨 | — |
| 4 | `#!system` 显式写 `iOS, iPadOS` | 上游未写。仓库另 9 个插件都写，不写会在 iPad 上被判不兼容 | 推导 |

> **v1.01 的教训**：v1.0 曾把 `http-request` 改成 `http-response`，理由是
> 「抓包显示 `modifiedResponse: true` 挂在响应侧」。**这是把因果读反了**，
> 插件因此完全失效。真机对照见下。

### 🔴 我改错的那一处，以及真机证据

用户装了 v1.0 后反馈**无效**，并提供了同一台设备、同一个 App 的对照抓包：

| | v1.0（我的，`http-response`） | 上游原版（`http-request`） |
|---|---|---|
| Loon 日志 | `Trigger http-response(body) script:iTunes收据转发` | `Trigger http-request(body) script:iTunes转发` |
| 转发动作 | **无** | `Forward fake response` |
| `modifiedResponse` | **`false`** | `true` |
| 回包长度 | 810 B（Apple 原始回包） | 2457 B（含伪凭证） |
| `download_id` 末位 | `…885897`（原值） | `…885900`（已改写） |

⇒ **脚本被触发了，但什么都没做，直接放行。**

**根因**：上游脚本在**请求阶段**就把伪回包准备好，`$done()` 返回的响应直接顶替原响应，
所以规则必须挂 `http-request`。我按 `_loon.modifiedResponse` 的字面意思改成了
`http-response` —— **那个字段记的是「响应最终被替换了」，不是「规则该挂哪一侧」**。

教训：**从日志字段的字面意思推因果，是最容易犯的错。**
两个字段都在响应上，`modifiedResponse: true` 完全可以在 `http-request` 规则下产生。
改回上游写法后行为逐字一致，这条差异根本不该由我来"修正"。

### 关于第 4 条：`#!system`

上游清单**根本没有 `#!system` 这一行**。本仓库显式补上 `iOS, iPadOS`，
理由是仓库内 `AdGuard-Spoof v1.0` 曾因只写 `iOS` 导致 iPad 上无法加载。
属于「按仓库惯例补齐」，非上游缺陷。

### 没有做的三件事

| 没做 | 为什么 |
|---|---|
| 改 `Expires` / `Country` 的默认值 | 上游默认就是 `2099-09-09` / `HK`，改了属擅自变更 |
| 收紧 URL 匹配正则 | 与上游逐字相同。收窄属行为变更，不在等价托管范围 |
| 去掉 `requires-body=1` | 脚本确实需要 `$request.body`（收据），去掉就跑不了 |

---

## 测试为什么分两个文件 · 一条重要的教训

| 文件 | 测什么 | 耗时 |
|---|---|---|
| `test/itunes-spoof.test.mjs` | 壳层逻辑（用桩）+ 清单 + 托管完整性 | **秒级**，53 个用例 |
| `test/e2e-real-upstream.mjs` | 壳层 × 真 374 KB 上游的兼容性 | **几分钟一个 case**，默认不跑 |

### 踩过的坑

第 1 版测试把 **19 次**真脚本求值放进一个文件。结果：

```
跑到一半 → 退出码 15（SIGTERM/OOM）
```

**根因不是「慢」，是内存泄漏** —— 上游 374 KB 含 wasm 自解机，每求值一次
泄漏一个编译上下文。我一度误判为「超时不够」，试图用缓存和加大 timeout 缓解，
那是治标。

**修法是认清分工，不是优化：**

| 内容 | 放哪 |
|---|---|
| 壳层逻辑（自写的 1.7 KB） | 主测试，**用桩**穷举，毫秒级 |
| 壳层与真上游的兼容性 | 独立脚本，**默认不跑**，手动验一次 |

桩做的正是上游唯一依赖壳层的那件事——**回显 `$argument`**。
壳层在桩上通过 ⟺ 在真上游上通过，因为二者之间没有别的交互；
真脚本侧另跑关键 case 确认这个推理成立。

> **一个会因为机器忙慢而假红、或干脆跑不完的测试，比没有测试更糟。**
> 它会让人养成「红了先跑两遍」的习惯，久了真红了也没人看。

### e2e 结果（2026-09-30 人工跑）

11 个 case，每个独立进程串行执行，**全部通过**：

```
✓ 默认开              true,2099-09-09,HK      → enabled=true&expires=2099-09-09&country=HK
✓ 自定义到期日+国区    true,2027-01-01,CN      → enabled=true&expires=2027-01-01&country=CN
✓ 美区               true,2030-12-31,US      → enabled=true&expires=2030-12-31&country=US
✓ 尾部逗号            true,                   → enabled=true&expires=2099-09-09&country=HK
✓ 缺 Country          true,2030-01-01         → enabled=true&expires=2030-01-01&country=HK
✓ 两侧空格            "  true , 2030-01-01 , US " → enabled=true&expires=2030-01-01&country=US
✓ Country 小写        true,2030-01-01,us      → enabled=true&expires=2030-01-01&country=us
✓ Enabled=false       false,2099-09-09,HK     → 不转发 · $done({})
✓ 大写 FALSE          FALSE,2099-09-09,HK     → 不转发
✓ 大写 TRUE           TRUE,2030-06-06,US      → 不转发
✓ 整串空              ""                      → 不转发
```

---

## 镜像没能消除什么 · External Dependency (🔴 未消除)

上游脚本的全部功能是**透明转发**：

```js
$httpClient.post({
  url: "https://reven.lovebabyforever.workers.dev/reven/buy.itunes.apple.com/verifyReceipt?…",
  headers: {},              // 不转发原始请求头
  body: <收据原样透传>       // ← 但收据走了
})
```

**客户端没有任何生成逻辑，伪回包由 Worker 端生成。**

| | 上游原版 | 本仓库镜像 |
|---|---|---|
| 跑在设备上的代码 | 作者站点现取，随时可换 | 本仓库固定，可 diff |
| 站点消失 | 插件直接加载失败 | 不受影响 |
| **运行时仍联系作者** | 是 | **仍然是** |

### 真机抓包证实 Worker 确实在伪造

用户提供的两份抓包（`buy.itunes.apple.com` 收据校验）：

**已付费的 App**（`com.loveyouchenapps.knockout`）：Worker 回包与 Apple 原始回包**逐字节相同**
（sha256 均为 `047dd8a…`）—— 因为收据本来就有真实条目，不需要改。

**未付费的 App**（`cn.congzhen.CongZhenQiMen`）：Worker 回包里出现

```json
"in_app": [{
  "product_id": "qimen_yongjiu_198_yuan",    ← 198 元永久版
  "purchase_date": "2023-07-22 06:43:22",
  "expires_date": "2099-09-09 09:09:09",
  "in_app_ownership_type": "PURCHASED"
}]
```

⇒ **Worker 会读收据、查 App Store 的内购商品列表、注入一条「最贵套餐」的伪凭证。**

> 这也是**我没有在本地重写伪造逻辑**的原因：它需要实时查询某个 App 卖什么商品，
> 手上只有一份样本不足以覆盖。且做错会让所有 App 解锁失败 —— 风险远大于收益。

---

## 风险 · Risk

1. **🔴 收据外发**：Apple 收据凭据原样送到第三方 Worker。镜像**不改变**这一点。
2. **🔴 运行时依赖**：Worker 不可用时收据校验全部失败。
3. **MITM 不可关**：Loon 不支持 `[Mitm]` 段的 `enable=`，关开关后仍解密该域名。
4. **374 KB 混淆代码无法审计**：本仓库托管了它，但**没人能完整读懂它**。
   托管只把「跑谁家的代码」固定下来，不等于「代码可信」。
5. **许可未声明**：上游未声明任何许可条款。使用前请自行确认。

---

## 致谢 · Credits

脚本与清单版权归原作者 Jsforbaby 所有，本仓库仅作托管、参数修复与出处记录。
**上游版权与许可全部适用。**
