# PinDuoDuo 迭代记录 v1.74 → v1.78（2026-09-30 ~ 10-21）

> 这一段迭代的主题不是「多拦了什么」，而是用**五份真机抓包 + 一份反编译**
> 把「插件到底该拦什么」重新钉了一遍。两次方向性修正、一个死开关、
> 一个假开关、两个新功能，全部有 HAR 证据链。

---

## 一、结论：风控由浏览节奏触发，与插件无关（2026-09-30）

四份抓包对照（同一账号，两台设备，全部只开 search_stub + bottom_custom）：

| 指标 | A 17:33 快速翻·被限 | B 18:08 正常速度·退场后 |
|---|---|---|
| 商品详情页 | 115 次 / 10.5 min | 12 次 / 9.2 min |
| 中位间隔 | 3.5 s（38 次 <2s） | 36.7 s（0 次 <2s） |
| `morgan-quick/confirm/pre_render`（下单预渲染） | 96 次 | 10 次 |
| 验证码挑战（`phantom/obtain_captcha`） | 5 次 | 1 次 |
| 百补 40002 / 429 REFUSE | 有 | 0 |
| 商品软封（`goods.status=5`「已售罄」） | 14 次 | 0 |

封禁链路完整可回放：`oak render → 54001 验证码 → phantom/user_verify`
（第 4 次 `code:3002 result:false`）→ `429 REFUSE` → `goods.status=5` 软封。
**结论：节奏（每页 3.5s、每页都触发下单预渲染）是服务端判据，响应改写零关联。**

**假警报存档**：`error_code: 1000000` 是 PDD 的**成功码**
（`{"success":true,"error_code":1000000,...}`），一次抓包里出现 110 次，不是错误。

## 二、blockAds 合集退场拼多多（v1.74 时代发现）

合集里两条裸 `[Rewrite]`（`cappuccino/splash` reject(404)、
`hungary/global/homepage` reject-dict）在**请求阶段**就返回假响应，
`stub.response.js` 根本没机会跑 —— 抓包里这些记录的 `script` 字段一律空数组，
`api_stub` 等开关对这两个端点完全失效。已在
[patches/patch-blockads.py](../../patches/README.md) 里按「拼多多退场」处理，
CI 的 `verify-artifact.py` 守住「上游拉取时不回来」。

## 三、`enable=` 挂在 `[Rule]` 上是死开关（v1.75 删除 telemetry_stub）

用户参数页截图（开关明确是「关」）与同一分钟的抓包对上了：
`DOMAIN, meta.pinduoduo.com, REJECT, enable={telemetry_stub}` 依然命中。

根因查证：Loon 官方手册只有 `script.md` 记载 `enable=`，
`rule.md` / `rewrite.md` / `plugin.md` / `general.md` 全文都没有。
这与 v1.5 在 `[Rewrite]` 上踩的是同一个坑——**当时只迁走了 `[Rewrite]`，漏了 `[Rule]`**。

- v1.75 整段删除 telemetry_stub + 8 条 [Rule]（13 → 12 个开关）
- 全仓扫描：AntiRevoke 还有 17 条同类（其 `#!desc` 早已写「未经真机验证」），未处理
- 教训固化进 `manifest.test.mjs`：禁止 `[Rule]` 上出现 `enable=`

## 四、信息流 + 详情页广告打标（v1.76 ~ v1.78，用户明确要的新能力）

用户原话：「这些是我所需要的」—— 广告商品不能删，要能认出来。

**识别依据**：服务端自打的 `data.ad`（`bkfl=1` / `openinfo.ad_id`），正常推荐没有。
拼多多把客户端原生广告角标 `need_ad_logo` 统一压成 `false`（故意藏标）。

**跨端点名单**：详情页响应里 `bkfl`/`openinfo`/`ad_id` **全部 0 次**（实测），
广告身份只在信息流。所以 `feed.response.js` 打标时把 goods_id 写
`$persistentStore`（环形 200，**`write(value, key)` 值在前**——Splash-Festival v37
踩过的坑，写反不报错但永远读回 null），`detail.response.js` 查名单命中才打标。

**v1.76 信息流**：三路标记（`need_ad_logo=true` / `tag_list` 红字「广告」 /
`sales_tip` 前缀），真机验证三路全部渲染。
**v1.77 详情页（写法 1）**：销量文案 5 个渲染副本统一「广告·」前缀；
两处 rich_list 插独立红字元素；无销量文案回落标题前缀「【广告】」。
**v1.78 滚动条补漏**：真机报告「本店已拼4.8万件」那帧没打标——
价格区滚动条有**两套数据源**，`desc_labels_for_carousel` 是逐帧独立下发、
v1.77 完全没碰；另把「快要抢光」纳入正则，新覆盖 SKU suffix 两列与
购买按钮副标题（「零差评」「限量价」不误伤，逐项断言）。

**验证闭环**：2026-10-21 抓包逐项对上 ——
`carousel = ['广告·本店已拼4.8万件']`、SKU 侧栏 5/6（第 6 个本就无标签）、
下拉标题首元素 `广告·`；信息流一屏 24 条商品 22 条广告、三路标记齐全。

## 五、同端点 `[Rewrite]` + `[Script]` 只跑 `[Rewrite]`（第二次实证）

v1.77 要在 `/api/oak/integration/render` 上挂响应脚本，但该端点已有一条
`[Rewrite]` json-del —— 不搬走，打标脚本永远不执行。三处删除
（`bottom_section_list` / `ui.bottom_section` / `ui.live_section.float_info`）
并进 `detail.response.js` 无条件执行，行为不变、归属变了，[Rewrite] 5 → 4。

## 六、反编译仓库勘误（ire，Pinduoduo-v8.28.0）

- `REVERSE_ENGINEERING.md` 把 `/api/polemon/gbdbpdc` 标成「搜索框下拉推荐词」
  **是错的** —— 真机响应实证是验证/登录链路
  （`access_array` + 「遇到问题/找回账号」`psnl_*` 同链），**绝不可 stub**
- `binary-analysis/strings_sample.txt` 是 `otool -l` 的 section 头列表，
  不是字符串表，grep 不到任何 API；应重新用
  `otool -v -s __TEXT __cstring` + `strings` 提取
- 可用结论：信息流广告判据（`data.ad`）、营销 icon ID 列表、
  热词本地缓存路径 `almighty.ios.home.search.hotquery`

## 七、当前开关地图（v1.78，14 项 / 14 条生效规则）

| 开关 | 默认 | 管辖 |
|---|---|---|
| `api_stub` | 开 | 13 条会场/推荐端点 stub |
| `chat_stub` / `phantom_stub` / `order_stub` | 关 | 各自独立的高危项 |
| `search_stub` | 开 | 搜索框三源（hub 热词 / `search_hotquery` / 百补 `queryWords`）+ `/search` expansion |
| `feed_ad` | 开 | 信息流 + 详情页广告打标（不删除；`$persistentStore` 名单跨端点） |
| `bottom_custom` + 6 个 Bot_* | 开 | 底栏自定义 |

**红线（逆向 + 抓包双实证，碰不得）**：`xg/ngrtt/zqog`（推送 WebSocket）、
`phantom/*`（验证码）、`polemon/gbdbpdc`（验证链路）。

**明确不加的**：`search_suggest`（无推广词证据）、开屏 `cappuccino/splash`
（服务端常态回 `{"size":0}`，v1.76 后 BlockAds 退场未观察到广告回潮）。
