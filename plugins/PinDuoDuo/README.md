# PinDuoDuo · 拼多多去广告（修复版）

> 修复聊天消息刷不出来、修复 jq 空值崩溃、移除三条无效或有害的 REJECT。
> Fixes broken chat refresh, a jq null crash, and three ineffective or harmful REJECT rules.

**v1.73** · 14 项配置 / 21 条生效规则 / 2 域名 · 抓包基线 PDD 8.26.0（iPad16,1） · 更新 `2026-09-29T20:20`

| | 中文 | English |
|---|---|---|
| 脚本 | 1 个，**仅改 1 行远程 URL**；原件另存只读 | 1 script, **one line changed**; pristine copy kept |
| 改动范围 | 仅清单层：1 处 jq 表达式 + 4 条 `enable` | Manifest only: 1 jq expression, 4 `enable` guards |
| 证据 | 用户基线 HAR（461 请求，未开插件） | Baseline HAR, plugin disabled |
| 完整性 | `manifest.json` 记 sha256，`tools/vendor-check.py` 可校验 | sha256 in `manifest.json`, verifiable |

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
- **两条裸 IP 规则写错了正则**。真实形态是 `/v3/d?type=addrs&ttl=1&dn=…&id=1`
  —— IP 之后是 `/v3` 再 `/d?`，而上游正则要求紧接 `/d(\d)?`，中间多出一段。
  2026-09-29 两台设备实测该形态流量稳定存在，上游正则一条都命中不了。
  （v1.1~v1.71 记为「真实形态无 query」是错的，实际带 query。）
- **QUIC 规则不触发**。`api.pinduoduo.com` 的 ALPN 只协商 h2，服务端根本不提供 h3。
- **去广告本身是有效的**。真实 `homepage/hub` 响应里 `bottom_tabs` 确有 5 项，
  含 `pdd_live_tab_list.html` 与带推广参数的 `attendance.html` —— 正是插件要删的那些。
- **真机实测（2026-09-29）**：v1.3 装上后 `all_top_opts` 带图项 1→0、`icon_set` 已删、
  `bottom_tabs` 5→3，聊天 WebSocket 返回 101、`mark_read` 9 次全部 `ok`。

---

## 开关 · Switches

14 项配置全部在 Loon 插件参数页，**不用改文件**。分两组。

### [高危] 会改写服务端下发内容的拦截

| 开关 | 默认 | 覆盖 | 什么时候关 |
|---|---|---|---|
| `api_stub` | 开 | 13 条会场/推荐类端点 | 想要**完全不改任何响应体**时 |
| `chat_stub` | **关** | 4 条聊天/推荐端点 | 平时不用管；开着可能导致**聊天刷不出来**（已实测：关掉即恢复） |
| `telemetry_stub` | **关** | 8 个埋点/监控/配置域名 | 平时不用管；怀疑被风控、或 App 行为异常时再开 |
| `phantom_stub` | **关** | `/api/phantom/gbdbpdv/extra` | 平时不用管；怀疑被风控时可**优先开这条** |
| `order_stub` | 开 | `/api/caterham/v3/query/my_order_group` | 想让订单页显示真实订单时 |
| `search_stub` | 开 | `/search_hotquery` + `/search` 的 `expansion` + 百亿补贴 `queryWords` | 搜索框仍轮播「酷态科cp12」这类词时 |

> **v1.7 变更**：`chat_stub` / `telemetry_stub` / `phantom_stub` 三项默认改为**关闭**。
> 这三项都会拦掉拼多多自己的后台请求，先用观察得到的行为决定要不要开，比默认全开更稳。
> ⚠️ Loon 会**记住**你改过的开关值 —— 已经装过 v1.6 的人升级后，这三项仍是你上次的状态，
> 要改得自己去参数页拨一下。

> ⚠️ `api_stub` 关掉时，**首页去广告与底栏裁剪会同时失效** —— 它们都依赖改写
> `/api/alexa/homepage/hub` 的响应。只想去广告又想放行接口，可以关 `api_stub`
> 但单独开 `bottom_custom`（见下），底栏仍能裁。

### 为什么把后两条拆出来

`phantom_stub` 与 `order_stub` 是从 `api_stub` 里拆出来的独立开关，
因为它们的性质和「去广告」根本不同：

| 端点 | 性质 | 风险 |
|---|---|---|
| `/api/phantom/gbdbpdv/extra` | 风控/配置模块，与消息推送 WebSocket **同模块**（`xg.pinduoduo.com/api/phantom/_stm` 也在那里） | 拦它可能干扰推送；被风控时又该优先放行 |
| `/api/caterham/v3/query/my_order_group` | **订单列表**，返回 `{}` 会让订单页变空 | 纯功能取舍，与广告无关 |

把它们和「搜索框热词」这类广告项捆在一个开关上，等于逼你二选一：
要么为了去掉搜索框推荐词而一起关掉订单列表，要么为了保订单而把风控模块也一起拦了。

### 搜索框推荐词在哪

搜索框轮播的「酷态科cp12」「百事可乐」这类词**不来自首页**，而是独立端点：

```
GET https://api.pinduoduo.com/search_hotquery?dark_mode=0&source=index
→ {"hotqs":[{"q":"酷态科cp12","tag_list":[{"text":"热"}]},{"q":"酷态科"}, ...]}
```

但**词有四个来源，必须同一个开关管**：

| 来源 | 位置 | 由谁删 |
|---|---|---|
| 首页首次下发 | `homepage/hub` 的 `result.search_bar_hot_query`（含 `hotqs` 20 条 + `items` 20 条） | `homepage.response.js` |
| 轮询刷新 | `/search_hotquery` 的 `hotqs` | `stub.response.js` |
| 结果页扩展 | `/search` 的 `expansion` 字段 | `stub.response.js` |
| 百亿补贴页 | `m.pinduoduo.net/brand_activity_subsidy.html` 内联 `window.rawData` 的 `store.searchStore.queryWords` | `subsidy.response.js` |

四者同归 `search_stub`。v1.5.1 之前首页那份挂在 `api_stub` 下，
**关掉 `api_stub` 放行会场接口时，词会从首页侧漏回来** —— 已解耦。

> 百亿补贴页那一行是 v1.6 新增。该页是**服务端渲染的 HTML**，轮播词既不在
> `homepage/hub` 也不在任何 API 响应里，而是内联在 HTML 的 `window.rawData` 中
> （实测 10 个词里 5 个是推广：百事可乐 ×3、可口可乐、特价饮料），
> 所以前面那套 `[Script]` 根本碰不到它，必须对 `brand_activity_subsidy.html`
> 单独挂一条 `subsidy.response.js`。该脚本只替换目标数组字面量，
> 不解析也不重新序列化整页（672KB）。

> 只开 `search_stub` 即可去掉搜索词，**不必开 `api_stub`**。

> ⚠️ **v1.3 / v1.4 曾经失效**：那两版把 `enable={api_stub}` 挂在 `[Rewrite]` 规则上，
> 而 **Loon 手册的 `rewrite.md` 根本没有 `enable=` 这个参数**（`script.md` 才有），
> 真机实测 21 条规则全部放行。v1.5 已全部改为 `[Script]` 方案。

### [底栏] 自定义底部导航

| 开关 | 默认 | 对应 tab |
|---|---|---|
| `bottom_custom` | 开 | 总开关，关掉则底栏保持服务端原样（5 项） |
| `Bot_index` | 开 | 首页 |
| `Bot_chat` | 开 | 聊天 |
| `Bot_personal` | 开 | 我的 |
| `Bot_live` | 关 | 多多视频 |
| `Bot_class` | 关 | 分类 |
| `Bot_attendance` | 关 | 签到 |
| `Bot_custom` | 空 | 输入框，逗号分隔，按 link 包含匹配 |

- **顺序跟随服务端下发**，不是开关排列顺序 —— 想要「多多视频」排在聊天前面，重开 App 即可。
- 一个都不选时**回落**为 首页 / 聊天 / 我的（上游写死的那三项），不会给你一个空底栏。
- `Bot_custom` 用于接口下发但上面没列出的项，容忍空格与空段。

> 服务端真实下发的 5 项是：首页、多多视频、签到（带推广参数）、聊天、我的；
> `buffer_bottom_tabs` 侧是 首页、多多视频、分类、聊天、我的。**两个字段分别匹配**，
> 所以「分类」只在 buffer 侧出现，勾了它不会影响底栏显示。

### 开关是怎么生效的

| 通路 | 用在哪 |
|---|---|
| `enable={xxx}` | `[Rule]` 与 `[Rewrite]` 条目 |
| `argument=[{xxx}]` | 传给 `homepage.response.js` 脚本 |

底栏脚本**不带** `enable`，由脚本内部读 `$argument` 判断——这样关掉 `bottom_custom`
时脚本仍会运行并原样放行，不会因为规则被禁用而丢掉另一组去广告逻辑。

> 上游的 28 条 `[Rewrite]` **一条 `enable` 都没有**，`[Argument]` 段整个不存在。
> 换句话说，用户连「关掉某一项」的入口都没有。本版补齐了。

---

## 自研脚本 · The purpose-built script

`src/homepage.response.js` 是本仓库自研的，不含任何上游代码。

### 为什么要写它

上游用两条 `[Rewrite]` 处理 `/api/alexa/homepage/hub`（一条 `json-del`、一条 `json-jq`），
存在三个问题：

1. **底栏写死三项**。jq 里硬编码 `IN("index.html", "chat_list.html", "personal.html")`，
   用户想留「签到」或「分类」必须改文件。
2. **jq 有空值崩溃缺陷**。`?` 只保护路径查找、不保护 `map` 迭代，字段为 null 时抛
   `Cannot iterate over null`，整条复写失败。
3. **同一 URL 挂两条规则，谁先谁后是未解疑点**。Loon 官方手册没写这个行为。
   真机验证时观察到底栏确实是 3 项（说明 jq 跑了），但**依据不明确**。

脚本一次解决三者：底栏可选、空值安全、同一 URL 只有一条处理规则。

### 怎么读开关

`[Argument]` 的 9 个值经 `argument=[{...}]` 传入 `$argument`，脚本内部判断。
所有异常路径都 `$done({})` 放行原响应——脚本出错不会让 App 拿不到首页配置。

### 真实数据验证

`test/homepage.test.mjs` 用 2026-09-29 基线 HAR 的真实响应（gzip+base64 解出 138 KB）
驱动脚本，31 个用例覆盖：开关全关时零改动、默认三项裁剪、自定义组合、
顺序保持服务端原序、空选回落默认、备用输入框、异常结构不崩。

```
node test/manifest.test.mjs    # 49 用例，清单层
node test/homepage.test.mjs    # 31 用例，脚本逻辑
```

> 顺带修掉了本仓库 `manifest.test.mjs` 一个老 bug：`$done()` 早退漏了 `return`，
> 会继续往下执行并被外层 catch 吞掉，把错误响应原样放行。测试当场报出来了。

---

## 为什么删这三条 · Why these three were removed

| 规则 | 处理 | 理由 |
|---|---|---|
| `DOMAIN, xg.pinduoduo.com, REJECT` | **移除** | 实测是 WebSocket 推送通道（101） |
| `AND,((DOMAIN,api),(PROTOCOL,QUIC)),REJECT` | **移除** | ALPN 只协商 h2，规则不触发 |
| 2 条裸 IP `/d`~`/d9` REJECT | **移除**（v1.72） | 正则匹配不上，且职责已由 HTTPDNS拦截器 覆盖 |

裸 IP 那两条在 v1.72 之前是「注释掉」，v1.72 起**连注释一起删除**。三个理由：

1. **拦不到**。真实形态 `/v3/d?type=addrs&ttl=1&dn=…&id=1` 里，IP 之后是 `/v3` 再 `/d?`，
   上游正则要求紧接 `/d(\d)?`，中间多一段，对不上。
2. **职责重复**。`HTTPDNS拦截器`（可莉 + VirgilClyne）已在拦这类请求，
   其正则含 `(\/v?[0-9]+)?` 可正确命中 `/v3/d`。两台设备实测共 65 条全部由它拦下。
3. **旧注释在误导人**。原先写着「无 query」「恢复前请先看 README」，
   照着做会写出一条仍然匹配不了的正则。留着比删掉更糟。

> ⚠️ 另一个曾被记录的点同样有误：`/d5` 的 titan-gslb 会话票据通道
> （`Server: titan-gslb`、`Session-Ticket`、`Session-Valid: 86400`）确实是真实存在的，
> 但它走的是 `/v3/d` 而非 `/d5`，原先「上游因 /d5 走裸 IP 而漏掉 titan.pinduoduo.com」
> 的推理不成立。历史正则见 git `39e6ed5`。

逐条依据与证据文件见 [UPSTREAM.md](UPSTREAM.md)。

---

## 回归测试 · Regression test

```bash
node test/manifest.test.mjs      # 54 用例，清单层
node test/homepage.test.mjs      # 37 用例，首页脚本
node test/stub.test.mjs          # 60 用例，拦截开关
node test/stub-wiring.test.mjs   # 40 用例，清单与脚本接线
```

清单层覆盖：开关声明与引用双向一致、三条高风险规则确已移除、
`[Rewrite]` 上不再有 `enable=`、底栏与拦截脚本接线正确、
外部资源全部收在仓库内、上游脚本仅差 1 行。

`stub-wiring` 专门校验一件事：**清单里那条 URL 正则能否命中脚本 `RULES` 的全部 21 条路径**。
写清单用的正则很长，少写一个分支就会让某个端点静默失效 —— 这个用例把两者绑在一起。

---

## 外部资源 · External resources

运行时会碰到的外部资源**全部收在本仓库**，不再有任何第三方脚本域名：

| 资源 | 位置 | 说明 |
|---|---|---|
| 主脚本 | `src/PinDuoDuo_remove_ads.js` | 被 `script-path` 加载 |
| 上游原件 | `src/upstream/PinDuoDuo_remove_ads.js` | 只读对照，不加载 |
| 页面 chunk | `src/chunks/9410-b8806e870a26db7d.js` | 见下 |
| 图标 | `raw.githubusercontent.com/luestr/IconResource` | 插件图标，Loon 拉取 |

### 上游脚本里藏着的第二个脚本

上游 `PinDuoDuo_remove_ads.js` 硬编码了一个 chunk 地址，会把拼多多页面里的官方 JS
替换成第三方服务器上的版本：

```js
const oldChunk = "https://pfile.pddpic.com/mdkd/mdkd/_next/static/chunks/9410-…js";
const newChunk = "https://kelee.one/…/9410-….js";   // ← 页面运行时再去第三方取代码
```

这不是"引用"，是"替换"。两边实测对比：

```
官方 pfile.pddpic.com    12669 B   6 个模块: 53203 27519 82115 75637 43435 70242
kelee.one 托管版          5131 B   4 个模块:               82115 75637 43435 70242
                                                    ↑ 少 53203（商品推荐逻辑）与 27519
```

⇒ 本仓库把该 chunk 一并收进 `src/chunks/`，并把 `newChunk` 指向自己的 raw URL。
**对上游脚本的唯一改动就是这一行 URL**，业务逻辑一个字节没动，测试会逐行比对并断言差异仅此一处。

> 该 chunk 只在「扫码取件」页（`m.pinduoduo.net/mdkd/package?from_app_scan`）加载，
> 两份基线抓包里都没有触发过，删掉也不影响日常使用。保留是为了功能完整。

---

## 已知限制 · Known limits

| 项 | 说明 |
|---|---|
| 基线单一 | 结论基于一台设备（iPad16,1 / PDD 8.26.0）的一次日常使用，461 个请求 |
| 20 条 reject-dict 未观测 | 这批端点在基线中一次都没出现，属低频/特定页面触发，未能实证其响应 |
| 未解疑点 | `/api/alexa/homepage/hub` 挂了**两条** `[Rewrite]`（json-del + json-jq），Loon 官方手册未说明同一 URL 多条规则的执行顺序 |
| 上游 JS 未审 | `PinDuoDuo_remove_ads.js` 保持原样引用，未做改动也未做审计 |
| 底栏顺序 | 跟随服务端下发顺序，插件不重排 |

---

## 文件 · Files

| 文件 | 用途 | Purpose |
|---|---|---|
| `PinDuoDuo.lpx` | 插件清单 | Manifest |
| `UPSTREAM.md` | 出处与逐条改动依据 | Provenance & per-change reasoning |
| `src/PinDuoDuo_remove_ads.js` | 上游脚本，仅改 1 行 chunk URL | Upstream script, one line changed |
| `src/upstream/PinDuoDuo_remove_ads.js` | 上游原件，只读 | Pristine upstream, read-only |
| `src/chunks/9410-*.js` | 页面 chunk 托管副本（上游第三方托管） | Vendored page chunk |
| `manifest.json` | 脚本 sha256 登记（上游 2 + 自研 2） | Script hashes |
| `src/homepage.response.js` | 首页去广告 + 底栏自定义（**自研**） | Purpose-built script |
| `src/stub.response.js` | 21 条接口拦截 + 搜索词屏蔽（**自研**） | Endpoint stubbing script |
| `src/subsidy.response.js` | 百亿补贴页搜索框去推广词（**自研**） | Subsidy page search-box scrubber |
| `test/manifest.test.mjs` | 49 个清单层回归用例 | 49 manifest-layer tests |
| `test/homepage.test.mjs` | 31 个脚本逻辑用例 | 31 script-logic tests |
| `test/stub.test.mjs` | 60 个拦截开关用例 | 60 stub-switch tests |
| `test/stub-wiring.test.mjs` | 40 个清单与脚本接线用例 | 40 wiring tests |
| `test/har-fixture.json` | 基线 HAR 摘出的最小样本 | Minimal excerpt of baseline HAR |

校验托管脚本完整性：

```bash
python3 tools/vendor-check.py --hash    # 离线校验
python3 tools/vendor-check.py --diff    # 拉上游比对
```

---

## 致谢 · Credits

- **walala（怎么肥事）** — 规则原作者
- **ZenmoFeiShi** <https://github.com/ZenmoFeiShi/Qx> — Quantumult X 片段维护
- **可莉** <https://github.com/luestr/ProxyResource> — Loon 清单打包

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
