# PinDuoDuo 迭代记录 v1.74 → v1.92（2026-09-30 ~ 10-21）

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

**v1.80 真机消融（方案 2 证伪）**：tagInfoList 注入数据层成功（响应里 4 个标签
全在）但百补列表页不可见 —— H5 卡片渲染器不消费该标签，死代码，已移除；
方案 1（名单）真机验证有效：Tafe 饼干从百补入口进详情，
「广告·已抢4.4万+袋」可见。百补列表页的可见打标需分析 H5 前端
（hermes/lego）的字段→UI 映射，暂缓。

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

---

# 第二部分：广告打标体系（v1.79 → v1.92）与排障手册

> 2026-10-21 一天内从 v1.79 做到 v1.92，全部结论都经过真机消融。
> 这一部分写给「以后插件出问题时」的自己和任何人。

## 八、广告识别体系（三层判据，缺一不可）

打标的全部依据是**服务端自己打的付费标记**，我们只是把它读出来重新显示。

| 场景 | 数据位置 | 形态 |
|---|---|---|
| 信息流 `/api/alexa/cells/hub/v3` | `data.goods_list[].data.ad` | **对象** |
| 百补列表 `tandy_vase.html` / `brand_activity_subsidy.html` | `window.rawData` → `…list[].ad` | **转义 JSON 字符串**（字段名 camelCase：`goodsId`）|
| 商品详情 `/api/oak/integration/render` | —— | **不存在**（`bkfl`/`openinfo`/`ad_id` 实测 0 次）|

```json
"ad": { "bkfl": 1,                      // 广告恒为 1
        "openinfo": { "ads_from": 0,    // 0 = 竞价广告
                      "ad_id": 7123468285,   // 竞价投放单元 ID
                      "is_tr": 1 },
        "nbid": "…", "mark": "…" }      // 结算归因 ID 与签名
```

**判定规则只有一条**：存在 `ad` 字段即广告。正常推荐没有这个键——
五份抓包、上百条商品零例外。**不要用文案匹配**（「已抢」「本店已拼」正常商品也有）。

**旁证**：拼多多把客户端原生的广告角标开关 `need_ad_logo` 对所有商品
（含广告）统一下发 `false` —— 判定信息它都有，只是不给用户看。

## 九、打标架构：三段式 + 跨端点名单

```
信息流(cells/hub/v3) ─┐
百补列表(subsidy/tandy)─┴→ 广告 goodsId 名单（$persistentStore）──→ 详情页打标
        │                                                              ▲
        └────────────→ 列表页图片角标（直接改 HTML/JSON）───────────────┘
```

- **名单键**：`pddAdGoodsIds`，环形 200 条，新 id 在前
- **`$persistentStore.write(value, key)` 参数是「值在前键在后」** ——
  写反了不报错、但 `read` 永远回 null（仓库在 Splash-Festival v37 踩过）
- 详情页响应里没有任何广告标记，只能靠名单关联。**从历史记录直接进详情不会打标**
  （名单是刷列表时才写入的）——这是设计使然，不是 bug

### 各打标点的真实渲染结论（真机消融，别再试第二遍）

| 位置 | 字段 | 真机结果 |
|---|---|---|
| 信息流卡片 | `sales_tip` / **`fallback_sales_tip`** / `tag_list` / `need_ad_logo` | ✅ 全部可见（**fallback 是客户端实际渲染的那个**）|
| 详情页销量行 | `goods.side_sales_tip`、`sku[*].side_car_labels[*].text`、`desc_labels[]`、`desc_labels_rich`、`pull_down_title_section` | ✅ 全部可见 |
| 详情页滚动条 | `desc_labels_rich`（行）+ `desc_labels_for_carousel`（**逐帧**）| ✅ 两套都要改 |
| 百补列表 | `tagInfoList` 插标签 | ❌ 数据层写入成功但**不渲染**（死代码，v1.80 删除）|
| 百补列表 | `activityPriceWord` 价格词 / `salesTip` 销量行 / `titleTop` 徽章 | ❌ 主瀑布流不读（只有优惠券子列表读 titleTop）|
| 百补列表 | **`goodsFlagIcon`（数组）/ `ltIcon`（字符串）** | ✅ 商品图左上角，手机+平板均可见（最终方案）|

## 十、图片角标的五条铁律（每一条都是真机踩出来的）

1. **宽高比决定渲染大小**。渲染器按宽度适配：宽高比 1.57:1 的徽章会被放大
   2.2 倍显得巨大。要和官方「百亿补贴」角标一样大，就必须用官方比例
   **530×150（3.53:1）**。改尺寸时必须连比例一起改。
2. **`ltIcon` 是单个 URL 字符串**，H5 组件会 `join(',')` 把它当数组拼——
   v1.83 转成数组后拼出 `badge.png,原URL` 的畸形 URL → 404 → WebKit 碎图。
   改字段形态前先看它在**普通商品**上是什么类型。
3. **`goodsFlagIcon` 是原生数组**，组件按徽章行逐项渲染，头部插入即可。
4. **不要依赖外部 CDN**：`raw.githubusercontent.com` 在部分线路不可达
   （iPad 碎图）；`cdn.jsdelivr.net/gh/...@main` 有缓存延迟（旧图被缓存到次日）。
   最终方案是 **data URI 内联**（3.4KB → base64 写进脚本），零网络、零缓存、
   设备无关。资产源文件保留在 `src/assets/` 备查。
5. **留白也要画**：整张画布透明、红框只包住文字，可以控制视觉重量；
   但画布尺寸必须保持官方比例，否则又回到第 1 条。

## 十一、Loon 插件开发的通用守则（本插件踩过的坑）

1. **`enable=` 只在 `[Script]` 上有效**。官方手册只有 `script.md` 记载它；
   `rule.md` / `rewrite.md` / `plugin.md` / `general.md` 全文没有。
   挂在 `[Rule]` 或 `[Rewrite]` 上是**死开关**（规则等于无条件生效）——
   v1.75 删除了 `telemetry_stub` 与 8 条 `[Rule]`，v1.5 迁走了 20 条 `[Rewrite]`。
   **写一个不生效的开关比不写更糟。**
2. **同一端点上 `[Rewrite]` 与 `[Script]` 同时命中时只跑 `[Rewrite]`**。
   要在该端点做响应改写，必须把 `[Rewrite]` 的活并进脚本（v1.77 处理
   `oak/integration/render` 的 json-del 时验证）。
3. **脚本必须单文件**，不能依赖模块系统。
4. **每次改脚本必跑 `node --check`** —— v1.88 曾因内联 data URI 时残留
   `=='';` 双重引号导致 SyntaxError，被其它测试失败掩盖了好几轮。
5. **开关巡检**：任何时刻 `[Argument]` 声明的开关都必须真的接线
   （`enable={}` 或 `argument=[{}]`），`manifest.test.mjs` 有断言守着。

## 十二、排查手册（下次出问题照着做）

### 读 HAR 的要点
- Loon HAR 的 `response.content.text` 可能是 **base64**，必须解码后再搜
- **搜中文文案时不要设 body 长度上限** —— 第一版就漏了所有 >300KB 的响应，
  差点误判「抓包里没有这个字符串」
- `_loon` 字段是金矿：`rule`（命中的规则）、`policy`、`script`（跑过的脚本）、
  `rewrite`（生效的复写）、`modifiedResponse`、`serverIPAddress`
- 请求阶段就返回假响应的记录，`script` 是空数组——这是「[Rewrite] 抢跑」的铁证

### 常见假警报（别浪费时间）
- `error_code: 1000000` 是拼多多的**成功码**（`{"success":true,...}`），不是错误
- 百补页第一份响应常是 `stores` 形态（骨架/另一状态），第二份才是完整页
- 客户端「已抢xxx件」可能是 `fallback_sales_tip` 而不是 `sales_tip`
- 服务端 `{"result":{}}`（84B）是正常空结果，不是失败

### 别碰的红线（两次逆向 + 抓包双实证）
- `xg.pinduoduo.com/ngrtt/zqog` —— 消息推送 WebSocket（101）
- `phantom/*`（`obtain_captcha` / `user_verify` / `gbdbpdv`）—— 验证码链路
- `polemon/gbdbpdc` —— 登录/验证策略（**注意：ire 仓库的
  `REVERSE_ENGINEERING.md` 把它标成「搜索框推荐词」是错的**，真机响应是
  `access_array` + 找回账号/遇到问题，与 `psnl_*` 同链）

### 风控归因（重要经验，避免误改插件）
四份抓包对照结论：**限制访问由浏览节奏触发，与响应改写无关**。
快速翻页（115 个商品页/10.5 分钟、中位间隔 3.5s、每页触发下单预渲染）
→ 5 次验证码 → 第 4 次 `user_verify` 失败 → `429 REFUSE` →
`goods.status=5`「已售罄」软封。同一账号正常速度浏览（中位 36.7s）零信号。

## 十三、开发流程规约（血泪）

1. **`/var/minis/shared` 目录写入偶发不持久化**：`write_text` 报成功、
   当场回读也对，下一轮读又是旧内容。**关键文件改动必须在 `/tmp` 的
   git worktree（真实文件系统）里做**，或至少用 `git diff` 行数验证落盘。
2. **批量 `str.replace` 必须带 `assert old in t`** —— 无断言时锚点不匹配会
   静默跳过，v1.85→v1.86 的版本号/changelog 就是这样连环丢的。
3. **验收正则先拿已知样本自证**：查 `#26.【` 而实际格式是 `# 26. 【`
   （空格+点），连续多轮「缺失」全是误报。
4. **push 后从 `origin/main` 重新拉取终验**，不信本地工作区。
5. **提交后 `git show HEAD --stat` 核对文件数** —— 预期 5 个文件却只有 2 个，
   就是写入没落盘。
6. **测试只能证明数据层正确，不能证明 UI 渲染**。每个新打标点都必须真机消融，
   数据层断言通过 ≠ 用户能看见（v1.80 的 tagInfoList 就是活教材）。

## 十四、当前开关地图（v1.92）

| 开关 | 默认 | 管辖 |
|---|---|---|
| `api_stub` | 开 | 13 条会场/推荐端点 stub |
| `chat_stub` / `phantom_stub` / `order_stub` | 关 | 各自独立的高危项 |
| `search_stub` | 开 | 搜索词三源 + `/search` expansion + 百补 `queryWords` |
| `feed_ad` | 开 | 广告打标：信息流四字段 + 详情页销量文案 + 百补图片角标 + 名单 |
| `bottom_custom` + 6 个 `Bot_*` | 开 | 底栏自定义 |

**明确不加的**：`search_suggest`（无推广词证据）、开屏 `cappuccino/splash`
（服务端常态回 `{"size":0}`）、百补列表的文字型标记（真机证伪）。

---

## 十五、省钱月卡 H5 拆解（v1.93，2026-10-22 抓包 `shared-33DB198B_474`，638 条）

页面 `m.pinduoduo.net/hub_monthly_card.html`（378 KB，React + styled-components，
bundle `hub_monthly_card_*.js` 858 KB）与 `hub_renew_manage.html`。

### 15.1 「签到领好礼」的随机券：**服务端指派，插件无从优化**

- 数据源 `POST /api/wizard/jaina/coupon/stats` → `private.mixtureCouponInfo.dailyLotteryCoupon`
  - `couponList` 一次下发 **9 张候选券**（面额 20/27/44/47/49/61/62/78/90 元，门槛满 350–1199）
  - 字段：`autoClaim:true`、`isAlgo:true`、`claimType:0`、`promotionType:276`、
    `mcardRec`（推荐位埋点，含 `coupon_rec_id`/`idx`/`round`）
  - 分两类：`month_card_coupon_type`（月卡券）与 `universal_bybt_no_self`（全场通用含百补）
- 领取 `POST /api/wizard/jaina/lottery/coupon/claim` 请求体**只有 `anti_content`，没有 coupon_id**
  → 拿哪张券完全由服务端算法决定；前端那点「随机」是 `hub_module_lucky_draw_everyday_coupons_*.js`
  （33 KB）里的扫描光效 + 翻牌（`canFlip`/`flipped`/`onFlipAniEnd`）
- 页面侧配置键（CMS 下发，可在 rawData 里看到）：`common.showDailyLotteryCouponScanning`、
  `common.banDailyLotteryCouponScanning`、`common.dailyLotteryCouponItemScan`、
  `common.dailyLotteryCouponItemScanTime`、`common.dailyLotteryCouponItemScanStyle`
- **结论：不做**。改展示只会让自己看到一张拿不到的券。

### 15.2 全屏动效的「跳过」：**可以替用户点，且等效**

- 动效本体：`static.pddpic.com/upload/hub_monthly_card/20251205/172902/lottie/data.json`
  （Lottie 750×1624 / 92 帧），图层里**烘焙**了「跳过.png」「补贴额度有限 活动5分钟后失效.png」
  「给下一位用户.png」等图案 → 视觉上的跳过按钮在动画里，可点的按钮是 DOM
- 按钮由模块 `hub_popup_limit_expire_73598_*.js` 渲染，文案走 i18n
  `mobile-hub.csp.popup_skip`（zh=跳过 / en=Skip）；其 `onClick` 做三件事：
  清倒计时 → `dispatchEvent` → `emphasizeLimitExpirePopupDone:true` + `subsidyCountDownVisible:true`
  → **点跳过 = 动效跑完**，不丢任何东西
- `react_common_*.js` 另有一族通用跳过组件（`sc-zpklgs-0/1/2`，`::after{content:var(--skip-text,'跳过')}`，
  `position:fixed;top:.5rem;right:.16rem` 右上角变体），一并兜住
- 实现 `src/hub_skip.response.js`：往 HTML 注入自执行脚本，命中「跳过」（文本节点或
  `::after` computed content）就走 `pointerdown`→`mousedown`→`pointerup`→`mouseup`→`click`
  完整序列（H5 按钮多挂 pointer/touch，只调 `element.click()` 会哑火）；
  要求可见 + 尺寸 2~260×2~140 px，最多 4 次、120 秒收工
- 开关 `auto_skip`（默认开）；钩 `hub_monthly_card.html` + `hub_renew_manage.html`

### 15.3 顺带发现：多个商品流端点带 `ad` 但未打标（**待评估，未做**）

| 端点 | 广告条数 | 结构 |
|---|---|---|
| `/api/wizard/naga/selected/goods` | 2–9 条/次（7 次） | **扁平**，`goods_list[].ad` 直接是对象 |
| `/api/wizard/gather/homepage/goods` | 12 | 扁平/其它形态 |
| `hub_monthly_card.html` 的 rawData | 5 | H5 内联 |
| `/api/caterham/v3/query/personal` | 9 | 个人中心 |
| `/api/alexa/homepage/hub` | 2 | 首页 |

与已覆盖的 `cells/hub/v3`（`data.ad` 对象）、百补（转义字符串）三者形态不同，
若要覆盖需在 `feed.response.js` 的收集器加「扁平形态」分支。

### 15.4 方法论提醒

**HAR 抓不到「点击」本身**，只能抓点击产生的请求。判断某个按钮点没点，看的是
「点击后应出现的请求」有没有出现（本例：`lottery/coupon/claim` 在模块 JS 加载后 1 秒内
出现，且 rawData 里 `autoClaim:true`，证明是自动领取而非点击触发）；
真正要在客户端「替用户点」，只能靠往 H5 响应体注入脚本 —— 这两件事别混为一谈。

---

## 十六、百补列表广告角标：手机版看不见的根因与重定位（v1.94）

抓包基线：`383_1792646492521.har`（808 条，iPhone）。
**`/var/minis/attachments/` 会被清空，抓包真身常在挂载盘
`/var/minis/mounts/File Provider Storage/Downloads/<序号>_<时间戳>.har`**。

### 16.1 两个页面模板的字段差异（关键）

| 页面 | 模板 | 广告商品有 `ltIcon` 吗 |
|---|---|---|
| `m.pinduoduo.net/brand_activity_subsidy.html` | camelCase `window.rawData.store...` | **有**（42 处） |
| `m.pinduoduo.net/tandy_vase.html`（手机版真实列表页） | `window.rawData.stores.store...` | **没有**（0 处） |

v1.87~v1.93 的角标逻辑是「**替换**已有字符串 `ltIcon`」→ 手机版那个页面
**压根没有这个字段可替换**，徽章只落到了 `goodsFlagIcon`。

### 16.2 两个槽位的真实尺寸（CSS 实证，这是「手机看不到 / iPad 看得到」的原因）

| 槽位 | CSS | 375pt 手机 | iPad | 结论 |
|---|---|---|---|---|
| 标题旗标 `goodsFlagIcon` | `.aFOWVd6O{height:.15rem}` | ≈15px 高 | ≈16–17px | 横幅「广告」被压到 ~10px 高 → 手机上等于看不见 |
| 商品图左上角 `ltIcon` | `.ilx1YR3r{height:.52rem;width:.46rem;position:absolute;top:0;left:0}` | ≈46×52px | 更大 | **官方角标位**，这个尺寸下「广告」清晰可读 |

`1rem = 100px`（375pt 设计稿）→ 手机上 0.15rem = 15px、iPad 上同比例更大，
所以同一枚 530×150 横幅在 iPad 能认出来、在手机上糊成一团。

### 16.3 渲染链路（逆向，可复核）

- 列表卡片 = module `36066`（`8208_*.js`）：读 `C.ltIcon` → 传给图片组件
- 图片组件 = module `41407`（`2125_*.js`）：
  `!!S && createElement(s.ZP,{src:S, className:I().ltIcon})`（`S` = ltIcon）
- 另一模板的图片组件（`react_brand_activity_subsidy`）兜底分支：
  `t && !n ? <Ay src={t} className="ilx1YR3r"> : null` → **字符串型 ltIcon 直接渲染成角标**
- 图片组件的 URL 构造函数 `FT()` 开头判 `indexOf("http")||indexOf("//")`，
  **非 http 直接原样返回** → data URI 不会被 CDN 参数破坏（这点很关键）

### 16.4 v1.94 的三处改动

1. 角标**只写 `ltIcon`**（缺失即新增），不再写 `goodsFlagIcon`
   （0.15rem 槽不可读，还会顶乱标题行布局 `Me=(flags.length)<3`）
2. 资产换**竖版 184×208**（比例 0.885 = 0.46/0.52，填角标槽不畸变），
   半透明黑底 + 浅灰白字「广告」竖排；生成脚本 `tools/make-badge.py`
   （`corner` / `wide` 两种版式，wide 保留旧横幅版备查）
3. 新增 `src/subsidy_api.response.js`：钩 **上拉加载分页接口**
   `POST /api/brand-sega/special-sale-coupon/goods_list`
   —— 该接口 snake_case 字段（`goods_id` / `goods_flag_icon` / `ad` / `lt_icon`），
   实测一次 20 条里 **10 条带 ad**；H5 映射函数里有 `ltIcon: r.lt_icon || ""`，
   写 `lt_icon` 即可生效。**旧版本只改 HTML → 手机往下翻的广告商品一条角标都没有。**

### 16.5 沉淀

- **同一个功能在不同端/不同模板下，字段可以完全不存在** —— 「替换已有字段」的写法
  在缺字段的模板上会静默失效，必须写成「**缺失即新增**」。
- **改角标前先量槽位**：CSS 的 rem 尺寸 × 端子的屏宽 = 实际像素高度；
  7–15px 高的槽位放横排文字必然不可读，别再靠换图片比例试错。
- 端子的 H5 会**分模板**（brand_activity_subsidy / tandy_vase），
  字段名还分 camelCase / snake_case 两套；改响应体前先把两套都取样。

### 16.6 v1.95：角标换回用户自备的那张图

手机版显示确认正常后，用户要求把角标图片换回 v1.92 自备的那张（530×150 横幅，
半透明黑底 + 白字「广告」）。但横幅宽高比 3.53 直接进近方形角标槽（0.885）会拉变形，
所以 `tools/make-badge.py` 改为：**从用户原图里切出两个字的字形**（不重新排字体，
保留原字形与抗锯齿），竖排叠进 184×208 画布，底色/字色 alpha 全部沿用原图。
美术源唯一化：`src/assets/ad-badge-src.png`（用户原图，逐字节保留）→
`src/assets/ad-badge.png`（生成物，data URI 内联进两个脚本）。

**顺带修一个 v1.94 的坑**：`tools/make-badge.py` 上次没提交进仓库
（写在了另一个 worktree 路径下，清理时连同目录一起没了），导致 badge-asset 用例在
**干净克隆**上会 ENOENT —— 本地跑是绿的、远端跑会红。教训：
① 新增测试依赖的文件，**必须在干净克隆上再跑一遍全套**再推；
② `/tmp` 下的 worktree 在本机会被清理，产物类文件（生成脚本、资产源）不要只留在那里。

### 16.7 v1.96：角标改回横排（竖排 46×52 的黑块太大）

用户反馈竖排版「太大」。取舍：
- 画布比例**不能动**：角标槽 CSS 固定 `width:.46rem;height:.52rem`，img 默认
  `object-fit:fill` → 资产比例必须 = 0.885，否则字被拉变形。
- 所以画布仍 184×208，但内容改成「用户原图里那块 黑底+横排广告」整体缩放到
  150px 宽、居中放置，四周留透明 → 屏幕上是一条横向小黑标（约 37×23px），
  既横排、又不遮商品图；字形与 alpha 全部沿用原图。

**教训**：改图片前先问清「太大」指的是**黑块面积**还是**文字字号**——
前者靠留白+缩放解决，后者靠字号/画布比例解决；两者都影响画布比例，
而画布比例是被 CSS 锁死的，不能随便改。
