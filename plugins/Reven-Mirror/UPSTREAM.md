# 上游出处与改写对照 · Upstream Provenance & Patch Map

本文件记录上游来源与逐条改动依据，正文说明见 [README.md](README.md)。
Provenance and per-change reasoning; user-facing notes live in README.md.

---

## 上游 · Upstream

| 项 | 值 |
|---|---|
| 名称 Name | Reven |
| 分发 Distributor | `https://reven.jsforbaby.workers.dev/reven/reven.lpx` |
| 托管服务 Host | Cloudflare Workers（`server: cloudflare`，作者自建） |
| 作者 Author | Jsforbaby（`https://t.me/Jsforbaby`，伪造回包的 `management_url` 里） |
| 脚本 Script | `https://reven.jsforbaby.workers.dev/reven/loon-redirect.js`（4369 B） |
| 脚本部署时间 Deployed | 2026-05-10 14:50 (UTC+8)，取自脚本首行注释 |
| 许可 License | 上游未声明 |
| 外部依赖 External | ⚠ **有，且不可消除** —— 见下节 |

| 托管 Vendored | `src/loon-redirect.js`（原件，sha256 `425c476e…`）<br>`upstream-Reven.lpx`（原件清单，sha256 `4ed9911c…`） |

### 🔴 先说清一件事：镜像并没有消除作者域依赖

上游脚本的全部功能是**透明转发**——把被劫持的请求原样送到作者自己的 Worker：

```js
const targetUrl = `https://reven.jsforbaby.workers.dev/reven/${host}/${rest}?bypass=…&strategy=…`;
const options = { url: targetUrl, headers: $request.headers };   // 连 Authorization 一起送走
```

**客户端脚本里没有任何解锁逻辑**，伪造的订阅回包是 Worker 在服务端生成的。
所以本仓库做的托管只解决**一件事**：

| | 上游原版 | 本仓库镜像 |
|---|---|---|
| 跑在设备上的代码 | 作者站点现取，**随时可换** | 本仓库固定，可 diff、可复现 |
| 站点消失 | 已导入的插件**直接加载失败** | 不受影响 |
| 运行时是否仍联系作者 | 是 | **仍然是** |

> 把 `script-path` 指向本仓库 ≠ 去掉作者域。要真正去掉，只能让脚本在本地生成回包 ——
> 那等于重写一个绕过付费校验的引擎，本仓库不做。

### v1.0：清单层唯一的改动

`Reven-Mirror.lpx` 相对 `upstream-Reven.lpx` **只差 1 行**（`[Script]` 段内）：

```diff
-http-request ^https:\/\/(api\.revenuecat\.com|…)\/ script-path=https://reven.jsforbaby.workers.dev/reven/loon-redirect.js, requires-body=true, tag=Reven转发, argument=[{Bypass},{Strategy}]
+http-request ^https:\/\/(api\.revenuecat\.com|…)\/ script-path=https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Reven-Mirror/src/loon-redirect.js, requires-body=true, tag=Reven转发, argument=[{Bypass},{Strategy}]
```

按仓库原则 #2，这属于「远程配置依赖」，改动合规。MITM 域名、`[Argument]`、
`requires-body=true`、URL 匹配范围**全部原样保留**——托管不该顺手改行为。
`src/loon-redirect.js` **逐字节等于上游原件，一行未改**。

The script is byte-for-byte upstream. Only the `script-path` URL was rewritten.

---

## v1.1 逐条改动 · Change Map

v1.1 只动清单层，脚本一行未改（sha256 仍是 `425c476e…`）。

| # | 改动 | 依据 | 等级 |
|---|---|---|---|
| 1 | `[Script]` 的一条规则拆成 4 条，按 SDK 分组 | 上游 0 个 `switch`、规则无 `enable=`，用户无法只关一部分 | 实测 |
| 2 | 4 条各挂一个 `enable={}`，新增 4 个 `switch` 且**默认全为 true** | 同上；默认全开保证装上行为与上游一致 | 推导 |
| 3 | 每条规则加独立 `tag=Reven-<SDK>` | 一条规则被拆开后需要能分辨关掉的是谁 | 推导 |
| 4 | `#!date` 更新 | 仓库体例 | — |

**没有做的三件事，理由如下**（避免"看起来完整"而编造能力）：

| 没做 | 为什么 |
|---|---|
| 给 `[Mitm]` 加开关 | Loon 的 `[Mitm]` 段不支持 `enable={}`；官方 `script.md` 全文无此记载。**关掉开关不会关掉解密**，7 个域名仍会被解密，只是不再转发 |
| 加「总开关」AND 4 个分组开关 | 官方 `script.md` 只记载 `enable=true` 与单变量形式，本仓库 9 处历史用法也全是单条件，`&&` 组合无据可依，不编 |
| 顺手加 `timeout=` | 上游没有，托管不顺手改行为 |

**等价性怎么验的**（`test/manifest.test.mjs` 第 3/5/6 组）：

- 4 条规则的域名并集 == 上游那一条的并集，**且两两不重叠** —— 没多、没少、不会同一个请求被处理两次
- 拿上游那条的 URL 用例去跑 4 条的并集，逐条断言行为一致（含 `http://` 与相似域名的负例）
- ⚠️ 顺带钉住一个**连带风险**：脚本内部自己还有一份域名正则。
  拆规则后若它比清单窄，清单放行的请求会走到脚本却不匹配，走 `$done({})` 静默透传 ——
  表现就是"解锁时好时坏"。测试会断言两边覆盖的域名集合相等。

**一个测试助手的坑，值得记**：`hostsOf()` 最初在规则正则末尾拼了个 `|`
（本意是"避免部分匹配"）。但模式本身以 `\/` 结尾，拼成 `…\/|` 后**它会匹配空串**，
于是每个域名对每条规则都算命中（4×7=28），
而"没有域名被两条规则同时覆盖"这类断言**恰恰依赖这个集合** —— 它会静默变成空断言，
测试照样全绿。发现方式是断言里的具体数字：`覆盖域名总数 == 7` 却报 28。

The 4 rules are proven equivalent to the upstream single rule; the script is untouched.

---

## 外部资源审计 · External Resource Audit

2026-09-29 实测。基线已登记进 [`tools/external-watch.json`](../../tools/external-watch.json)。

| # | 资源 | 类型 | 2026-09-29 状态 | sha256 |
|---|---|---|---|---|
| 1 | `…/reven/reven.lpx` | 清单 | 200 / 1364 B | `4ed9911c…` |
| 2 | `…/reven/loon-redirect.js` | **代码** | 200 / 4369 B | `425c476e…` |
| 3 | `raw.githubusercontent.com/fishdown/Icon/…/RevenueCat.png` | 图标 | 200 / 24053 B | `4a6082bd…` |
| 4 | `…/reven/{host}/{path}?bypass=&strategy=` | **运行时转发目标** | 200 | 内容不固定 |
| 5 | `github.com/NSNanoCat/util/…/argument.test.js` | 注释里的参考链接 | — | 不参与运行 |

`/reven/` 目录本身 404（无索引）；`robots.txt` 是 Cloudflare 的 AI 内容信号样板（1248 B）。
脚本响应头 `cf-cache-status: HIT`，`etag: "f9ad26b1a7acbe0d89e8ee6ca66bc821"`，
`cache-control: public, max-age=0, must-revalidate` ⇒ CDN 有缓存层，漂移可能延迟可见。

**MITM 域名（7 个，由 App 侧 SDK 决定，不由作者控制）**

| 域名 | 对应 SDK |
|---|---|
| `api.revenuecat.com` / `api.rc-backup.com` / `rc.visionarytech.ltd` / `revenue.cuto.app` | RevenueCat 及其备份/代理域名 |
| `proxy.linearity.io` | Linearity |
| `subscriptions-api.superwall.com` | Superwall |
| `api.adapty.io` | Adapty |

---

## 实测记录 · Measured Findings

| 观察 | 方法 | 结果 | 等级 |
|---|---|---|---|
| 脚本内无解锁逻辑 | 通读 98 行 | 只做 `$httpClient` 转发 + 剥 3 个 header | 实测 |
| Worker 不校验路径 | `GET /reven/api.revenuecat.com/v1/test` | 照样返回完整伪造回包 | 实测 |
| 回包是固定模板 | 同上 | `entitlements.pro` = `PURCHASED` / `app_store` / `expires_date: 2099-09-09T09:09:09Z` / `product_identifier: mac_curve` | 实测 |
| `Strategy` 五档无差异 | 分别以 `auto / lifetime_sub / year / month / all` 请求同一路径 | 输出**完全相同**（该路径无真实 App User ID 与商品 ID，参数无从生效） | 实测 |
| 真实服务器是活的 | 直连 `POST https://api.revenuecat.com/v1/test` | **200**（对照组：证明返回的不是碰巧一致的假数据） | 实测 |
| 无开关可关 | 读 `[Argument]` | 只有 `Bypass`(input) 与 `Strategy`(select)，**无 `switch`**，规则上无 `enable={}` | 实测 |
| Worker 挂掉的表现 | 读脚本错误分支 | `$done({response:{status:500, body:String(error)}})` —— 把错误字符串当响应体喂给 App | 推导 |

---

## 风险 · Risk

1. **凭据外流**：`options.headers = $request.headers` 原样转发，Authorization、App User ID
   全部送到第三方，叠加 `requires-body=true` 连 POST body 也走。**镜像不改变这一点。**
2. **无完整性锁定**：`script-path` 拉的是纯文本，Worker 端回什么装什么。
   本仓库的镜像版把这段变成可 diff 的固定文件，`tools/external-watch.py --check --diff` 能报警。
3. **无开关**：装上即无条件劫持 7 个域的**全部路径**，只能整体停用。
4. **站点即单点**：Worker 不可用时 7 个 SDK 的所有请求都会拿到 500。

---

## 致谢 · Credits

脚本与清单版权归 [Reven](https://reven.jsforbaby.workers.dev/reven/reven.lpx) 作者所有，
本仓库仅作托管与出处记录，**未修改任何一行上游代码**。
**上游版权与许可全部适用。**
