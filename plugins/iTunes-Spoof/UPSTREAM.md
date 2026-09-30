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

## 我走过的两轮弯路 · 两版都因为「不存在的 bug」而失效

这一节是本文件最重要的部分。v1.0 与 v1.01 都建立在同一个错误前提上，
而那个前提**真机证明是反的**。

### 错误前提

我当时断定：

> 上游读的是驼峰对象 `$argument.Enabled`，而 Loon 按 `argument=[{Enabled},{Expires},{Country}]`
> 传的是逗号字符串 ⇒ 类型不匹配 ⇒ 参数全落默认 ⇒ 开关恒为 true。

**并据此写了 1682 B 壳层「修复」，还收紧成「读不到 true 就当关」。**

### 真机证据（诊断插件回显）

```
TYPE=object
LEN=15
RAW=[object Object]
KEYS=["Enabled","Expires","Country"]
K=Enabled TYPE=string VAL="true"
K=Expires TYPE=string VAL="2099-09-09"
K=Country TYPE=string VAL="HK"
```

**Loon 传的 `$argument` 就是对象，键名与上游读取的完全一致，值也正确。**

⇒ 上游一直读得到参数，**从来没有 bug**。

### 我错在哪

| | |
|---|---|
| 证据来源 | Node 沙盒里我传的是**字符串** |
| 得到的「现象」 | 上游读不到参数 |
| 真机实际情况 | 传的是**对象**，上游读得到 |
| 那个「现象」 | **在真机上根本不存在** |

**拿沙盒结果当真机结论。** 这是本轮所有返工的根源。

### 失效的真凶是我自己

壳层里这一行：

```js
if (typeof $argument !== 'string') $argument = '';
```

真机传的是对象 ⇒ 条件成立 ⇒ 强制置空 ⇒ 切出的第一段是空 ⇒ 判为「关」
⇒ `$done({})` 放行 ⇒ **不转发** ⇒ App 拿到 Apple 的原包（810 B，
`download_id` 末位 `…897`，而上游伪造后是 `…900`）⇒ **App 读到「真实收据 = 无有效订阅」→ 订阅被下掉**。

用户提供的对照实验也印证了这条因果：诊断插件返回 599（App 解析不了）时**订阅不掉**，
本仓库的 v1.01（放行 Apple 原包）时**订阅掉**。

### v1.02 的处理

**删掉壳层。** 脚本指回 `src/loon-itunes.js`（上游原件，逐字节）。
实测纯上游在真机参数下转发正常：

```
真机参数对象 {Enabled:'true',Expires:'2099-09-09',Country:'HK'}
  → enabled=true&expires=2099-09-09&country=HK   ✅
带壳层的同一输入
  → 放行 $done({})，不转发                        ❌
```

同时删除 `src/prelude.js`、`src/itunes-spoof.js`、`build.mjs`。

### 另一处：我自己也标过疑，却还是发了

v1.0 那次改 `http-request`→`http-response` 时，我在 commit 里写了
「⚠️ 这条**没有真机对照实验**」。**知道没验证，还是发了。**
真机后果：脚本被触发但不转发，插件完全失效。v1.01 改回。

### 留下的资产

- `ArgShape-Diag.lpx` + `diag/diag.js` —— 参数形状诊断插件，取证留存
- `test/itunes-spoof.test.mjs` 第 1 组把真机实测的参数形状钉成断言，
  防止有人再按「字符串」的假设改代码

---

## ✅ 真机验证通过（2026-09-30 00:11）

v1.02（删掉壳层、纯上游）在 iPad 上实测：

```
00:11:03  POST buy.itunes.apple.com/verifyReceipt
          script=['iTunes收据转发']  modified=true      ← 脚本触发并改写了响应
          回包 2457 B                                     ← 伪造后长度（Apple 原包 810）
          download_id 末位 900                           ← 897 是 Apple 原值，900 是伪造
          in_app[0] = com.knockout.1year.AIVIP / expires 2099-09-09 / PURCHASED
          → 转发到 reven.lovebabyforever.workers.dev
             ?enabled=true&expires=2099-09-09&country=HK
```

与失败版本逐项对照：

| | 失败（v1.01 带壳层） | 成功（v1.02 纯上游） |
|---|---|---|
| `modifiedResponse` | `false` | **`true`** |
| 回包长度 | 810 B（Apple 原包） | **2457 B** |
| `download_id` 末位 | `897` | **`900`** |
| 是否转发到 Worker | 否 | **是** |

⇒ **本仓库版本与上游行为一致**，托管之外没有任何行为变更。

用户反馈：解锁正常。

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
