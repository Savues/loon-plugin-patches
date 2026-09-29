# 上游出处与改写对照 · Upstream Provenance & Patch Map

本文件记录上游来源与逐条改动依据，正文说明见 [README.md](README.md)。

---

## 上游 · Upstream

| 项 | 值 |
|---|---|
| 名称 Name | AdGuard |
| 分发 Distributor | `https://yfamilys.com/plugin/adguard.plugin`（458 B） |
| 托管脚本 Script | `https://raw.githubusercontent.com/yqc007/QuantumultX/master/AdGuardProCrack.js`（1905 B） |
| 原作者 Author | Passer_by_yun（`https://t.me/yqc_777`），取自脚本头部注释 |
| 二次分发者 Redistributor | yqc007（`https://t.me/yqc_123`） |
| 脚本日期 Script date | 2022-12-26，取自脚本头部注释 |
| 目标版本 Target | AdGuard 4.4.5，取自脚本头部注释 |
| 许可 License | **上游未声明** |
| 外部依赖 External | ⚠ **无** —— 脚本纯本地生成回包，不请求任何第三方 |

| 托管 Vendored | `upstream-AdGuardProCrack.js`（原件，sha256 `31024c00…`）<br>`upstream-adguard.plugin`（原件清单，sha256 `46e8a86e…`） |

### 与 Reven-Mirror 的关键区别

Reven-Mirror 的上游脚本是**透明转发**，真逻辑在作者的 Worker 里，镜像只能改 URL。
**本插件不同**：上游脚本的全部逻辑就是那 6 行本地伪造，**没有任何外部服务**。
所以本仓库能真正做到「纯本地」—— 不是把依赖从 A 挪到 B，而是彻底没有 B。

---

## 去混淆过程 · Deobfuscation

上游是单行混淆：字符串数组 + 数组移位自解机。解法不是猜，是**直接跑它的解码器**。

### 1. 字符串表

```js
var _0x3ee633 = [
  '999089TGuJfA', '3427288deZfJF', '6779030reCFqu', '933687RsylaR',
  '3gRYkyg', 'com.adguard.lifetimePurchase', 'parse', '16683YDGYxP',
  '166cawkvp', 'stringify', '3714462UfLwGc', '5452840hRVWxC', 'ACTIVE'
];
```

开头的 IIFE 会不断 `push(shift())` 把数组转到某个位置，直到一组 `parseInt` 算出的和
等于 `0xab543`。**这个过程只能在运行时确定**，所以下表的索引是转完之后的。

### 2. 解码表（跑 `new Function` 直接取，见测试第 2 组）

| 索引 | 解出 | 用途 |
|---|---|---|
| `0xbf` | `parse` | `JSON.parse` |
| `0xc2` | `stringify` | `JSON.stringify` |
| `0xc5` | `ACTIVE` | `premium_status` 的值 |
| `0xcb` | `com.adguard.lifetimePurchase` | `product_id` 的值 |
| `0xc0 0xc1 0xc3 0xc4 0xc6 0xc7 0xc8 0xc9 0xca` | `16683YDGYxP` 等 9 个 | **纯垃圾** —— 只被自解机拿去 `parseInt` 算校验和，不参与任何业务逻辑 |

最后一行是去混淆里最容易搞错的地方：这 9 个看着像数据，其实是自解机的常量。
测试断言了它们全部匹配 `/^\d+[A-Za-z]+$/`，防止后来者误当成业务字段。

### 3. 混淆代码 ↔ 清晰代码 逐句对照

| 混淆 | 清晰 | 本仓库 |
|---|---|---|
| `var body=$response['body']` | 取响应体 | **删**（不需要） |
| `obj=JSON[_0x4f31d5(0xbf)](body)` | `obj = JSON.parse(body)` | **删**（结果从未被读，见下） |
| `obj={'products':[{'product_id':_0x4f31d5(0xcb),'premium_status':_0x4f31d5(0xc5)}]}` | 构造固定对象 | 保留，值为两个具名常量 |
| `body=JSON[_0x4f31d5(0xc2)](obj)` | `body = JSON.stringify(obj)` | 内联进 `$done` |
| `$done({'body':body})` | 交回响应体 | 保留 |

**唯一实质改动是删掉那次 `JSON.parse`。** 依据：它的结果 `obj` 在下一行就被整体覆盖，
从未被读取。它唯一的作用是在非 JSON 响应上抛异常导致请求卡死。测试第 4 组用三组输入验证了这个差异，
同时用另外七组合法输入验证了**产物逐字节不变**。

---

## v1.0 逐条改动 · Change Map

| # | 改动 | 依据 | 等级 |
|---|---|---|---|
| 1 | `script-path` → 本仓库 `main` 分支 | 上游脚本挂在 `yqc007` 个人仓库，Loon 拉取不带任何凭证，他人随时可替换 | 实测 |
| 2 | 混淆脚本去混淆等价重写 | 可读性 + 可测试。产物等价由 57 个用例证明 | 实测 |
| 3 | 删除无用的 `JSON.parse` | 非 JSON 响应下上游抛异常、`$done` 不执行、请求挂到超时 | 实测 |
| 4 | 新增 `spoof` switch，**默认 true** | 上游无任何开关，只能整体停用插件。默认开保证装上行为与上游一致 | 实测 |
| 5 | 规则加 `tag=AdGuard-收据改写` | 仓库体例 | — |
| 6 | `#!date` 更新；头部加 `PLUGIN_VERSION` 注释 | 仓库体例 | — |

**没有做的四件事，理由如下**（避免「看起来完整」而编造能力）：

| 没做 | 为什么 |
|---|---|
| 收窄端点正则 | `\/api\/.+\/ios_…` 里的 `.+` 确实宽，但收紧它就是**改拦截范围** —— 行为变更，不属于等价重写。测试第 6 组把这个正则的 7 组命中/不命中判定钉死，也钉死「与上游逐字相同」 |
| 改商品 ID / `premium_status` | 无依据的猜测。改错了更难排查 |
| 给 `[Mitm]` 加 `enable={}` | Loon 的 `[Mitm]` 段不支持，官方 `script.md` 全文无此记载。**关开关不会关解密**，这点在 README 里写明而非假装有 |
| 加 `timeout=` | 上游没有，托管不顺手加 |

### 等价性怎么验的

`test/equivalence.test.mjs` 的核心命题不是「输出是否符合预期」——
那只能证明我写的东西自洽。而是**把上游那份混淆原件和本仓库重写版喂同一批输入，
逐字节比对 `$done` 的产物**。等价性由上游说了算，不由重写者说了算。

10 组输入：7 组合法 JSON（含 unicode、嵌套、多商品、已过期）+ 3 组非 JSON。
另有一组独立断言：解码器解出的 4 个业务字符串必须逐字等于预期，
且其余 9 项必须全是 `parseInt` 垃圾常量。

**守卫本身也验证过能失败**（变异测试，四种都抓到了）：

| 变异 | 结果 |
|---|---|
| `ACTIVE` 改成 `EXPIRED` | 7 条等价性断言失败 ✅ |
| 注释掉 `$done` | 6 条等价性断言失败 ✅ |
| 偷偷加一行 `fetch(...)` | 「无 fetch」+「9 行」两条失败 ✅ |
| 端点正则收窄到 `/api/v1/` | 「正则与上游逐字相同」+「v2 端点命中」两条失败 ✅ |

> 第 4 种第一次跑「全绿」是变异手法错了 —— `sed` 模式没匹配上，文件根本没变。
> 换成能匹配的正则后正常报错。**测不出问题的守卫等于没写**，所以每条断言都要手动验一次它会红。

---

## 外部资源审计 · External Resource Audit

2026-09-29 实测。基线已登记进 [`tools/external-watch.json`](../../tools/external-watch.json)。

| # | 资源 | 类型 | 2026-09-29 状态 | sha256 |
|---|---|---|---|---|
| 1 | `yfamilys.com/plugin/adguard.plugin` | 清单 | 200 / 458 B | `46e8a86e…` |
| 2 | `raw.githubusercontent.com/yqc007/…/AdGuardProCrack.js` | **代码** | 200 / 1905 B | `31024c00…` |
| 3 | `raw.githubusercontent.com/deezertidal/private/…/adguard.png` | 图标 | 200 / 8870 B | 见 watch 配置 |

**运行时外部依赖：无。** 脚本不含 `$httpClient` / `fetch` / `XMLHttpRequest` /
`$persistentStore` / `$notification` / `eval`，测试逐一断言，任一出现即失败。

---

## 实测记录 · Measured Findings

| 观察 | 方法 | 结果 | 等级 |
|---|---|---|---|
| 混淆表能解出 4 个业务字符串 | Node 里跑上游解码器 | `parse` / `stringify` / `ACTIVE` / `com.adguard.lifetimePurchase` | 实测 |
| 其余 9 项是自解机垃圾 | 检查值形状 | 全部匹配 `/^\d+[A-Za-z]+$/` | 实测 |
| 上游在非 JSON 响应上抛异常 | 喂 HTML / 空体 / 截断 JSON | 3/3 抛异常，`$done` 从未执行 | 实测 |
| 去混淆后产物等价 | 7 组合法输入逐字节比对 | 7/7 完全相同 | 实测 |
| 去混淆后不再抛异常 | 同上 3 组非 JSON 输入 | 3/3 正常产出回包 | 实测 |
| 脚本无外发 | 全文搜索 6 类 API | 0 命中 | 实测 |
| **是否还能真的解锁** | — | **未验证** —— 无真机 AdGuard、无抓包 | — |

---

## 风险 · Risk

1. **🔴 有效性未验证**：上游脚本日期 2022-12-26、目标版本 4.4.5，距今三年多。
   端点路径、响应结构、客户端判定逻辑都可能已变。**本仓库只能保证与上游等价，不能保证上游还有效。**
2. **MITM 不可关**：Loon 不支持 `[Mitm]` 段的 `enable=`，关开关后 `mobile-api.adguard.org` 仍被解密。
3. **无完整性锁定（上游版）**：`script-path` 拉的是纯文本，别人仓库里放什么装什么。
   本仓库的镜像版把它变成可 diff 的固定文件，`tools/external-watch.py --check --diff` 能报警。
4. **许可未声明**：上游未声明许可条款。**使用前请自行确认。**

---

## 致谢 · Credits

脚本与清单版权归原作者 Passer_by_yun 所有，本仓库仅作去混淆、托管与出处记录。
**上游版权与许可全部适用。**
