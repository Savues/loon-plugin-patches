## v2.41（2026-10-28）

### 点亮任务改为「无需滑动的倒计时」

**问题**：消费券页的「浏览 10 秒点亮」任务，前端要求**持续滑动页面**才扣时间
（`m.current` 只在滚动中为 false 才走计时器）。用户实测：改成 1 秒后停留 10 秒
再滑动，服务端**接受** —— 说明服务端只校验真实时间间隔 ≥ 10 秒，不关心 UI 显示。

**方案**：直接改 JS bundle 的一处判断。

```js
// 原：只有「正在滚动」才每秒扣 1
setInterval(() => { m.current || d(e => e - 1) }, 1000)
// 改：无条件每秒扣 1
setInterval(() => { d(e => e - 1) }, 1000)
```

**实现**：

```ini
[URL Rewrite]
^https://static\.pddpic\.com/assets/js/xbrand_special_sale_[a-f0-9]+\.js\? response-body-replace-regex m\.current\x7c\x7cd\( d(

[MitM]
hostname=..., static.pddpic.com
```

用 `\x7c` 代替字面 `|`，避免被 action 管道分隔符切断。

**效果**：进入任务后 10 秒自动完成，不需要手动滑动。服务端仍校验真实间隔 ≥ 10 秒，
所以不会失败。

**风险**：
- `static.pddpic.com` 加入 MITM，该域所有静态资源都会解密
- JS bundle 更新后字符串可能变化，需要重新验证

### 顺带：`lightup_secs` 参数仍然保留

它改的是 `task_duration`（UI 显示），配合本方案可以让倒计时显示更短。
但单独使用无效（服务端校验真实时长）。

---

## v2.40（2026-10-28）

### 移除 3 个从未使用的开关

用户明确：`api_stub`（[高危]屏蔽会场/推荐类接口 13 条）从一开始就是关闭状态，
`chat_stub` / `phantom_stub` 也从未开启。移除后行为不变。

| 移除 | 影响 |
|---|---|
| `api_stub` | 13 条 stub 规则 + homepage 里两处 icon_set/all_top_opts 处理 |
| `chat_stub` | 2 条（get_list_data / buffon recommend） |
| `phantom_stub` | 1 条（phantom/gbdbpdv/extra） |

stub 规则 URL 正则从 17 个路径收敛到 2 个（`search_hotquery|search`）。
`Argument`: 23 → 20。

### 新增开屏广告预防性屏蔽

沙盒取证：开屏是「预下载素材 + 本地调度」，只拦网络无法清掉已下载的素材。
二进制确认唯一下发路径是 `/api/cappuccino/splash`。

新脚本 `splash.response.js` 返回 `{"splash_list":[],"size":0}`，
与「服务端无开屏」时的正常响应一致（27B）。

价值：大促前装上可阻断新素材下载与调度表写入。

### 已知问题（未修复）

**首页冷启动偶发全部失效**：hub/feed 响应未被 Loon 处理 → 原始配置写入
`Documents/mmkv/StartupMMKVID` → 之后读缓存渲染。

修复方法：杀进程后删除 `Documents/mmkv/` 目录（或只删 `StartupMMKVID` + `.crc`）。
根因在 App 的缓存机制 + Loon 冷启动时序，插件层无法解决。

---

# CHANGELOG · PinDuoDuo

> 只记录 **v1.99 → v2.29** 这一轮「列表显示佣金率 + CPS 链接改写」的完整过程。
> 更早的去广告改动见 git history 与 `UPSTREAM.md`。

---

## 起点：为什么会有这一轮

用户需求分两步提出：

1. **在拼多多列表里显示佣金率**（当时以为只是首页信息流）
2. 后来澄清：**「显示佣金 ≠ 转链」**，且拼多多有**自购比价规则** ——
   第一次进入商品若是不带推广者标记的自然流量，之后再去进宝转链回来买，
   **也不计佣金**。所以必须在**第一次点击**时就落在 CPS 链路上。

这两条决定了最终要做两件事：
- 各处列表显示佣金率
- 各处列表的 `link_url` 改写成 CPS 链接

---

## 数据源：整个过程中最大的坑

佣金率不在拼多多自己的接口里（实测 50 商品 × 53 字段，`fee|rate|commis` 零命中），
必须走第三方。最终选定**大淘客**（免费、一次批量 20 个、1.3 秒）：

```
POST https://dtkapi.ffquan.cn/taobaoapi/parsing-content-three-in-one
     content=<url>\n<url>\n...      ← 换行分隔，单次上限 20 个
     is_app=1&supered=2&jaw_uid=<app_token>

→ data.pdd.data[] = {
    goods: { rate, goods_sign, goods_name, ... },
    item_link: "https://mobile.yangkeduo.com/duo_coupon_landing.html?...&cpsSign=..."
  }
```

**一次请求同时拿到佣金率和完整推广链接**，`item_link` 里已含 `goods_sign` + `cpsSign` + `authDuoId`。

| 项 | 实测结论 |
|---|---|
| 覆盖率 | 30 个真实商品：有佣金率 13（43%）/ 有可改写链接 29（96%） |
| 未进进宝的商品 | `rate=0`，改写也不产生佣金 → **只处理 `rate>0`** |
| 单次上限 | 20 个（请求 30 个只回 20） |
| 频次限制 | 50 并发全部成功，响应头无 rate-limit 字段 |
| `goods_sign` | 同一商品多次调用完全一致 → 可缓存 |
| `cpsSign` | 每次不同，内嵌日期（`CC_261027_...`）→ **当日有效，缓存不跨天** |

---

## 各页面的数据源（全部实证过，很多一开始都搞错了）

| 页面 | 真正的数据源 | 字段命名 | 改哪个字段 |
|---|---|---|---|
| 首页信息流 | `api/alexa/cells/hub/v3` | snake_case | `sales_tip` / `fallback_sales_tip` |
| 商品详情页 | `api/oak/integration/render` | snake_case | `side_sales_tip` 等 5 处 |
| 百补「精选」 | `api/hermes/goods_list` → `place_id=BYBT_MAIN` | snake_case | `activity_price_word_before_tag.text` |
| 百补首页（首屏） | `brand_activity_subsidy.html` 的 `rawData.store.tabStore.commonGoodsInfoStore.goodsInfoMap` | camelCase | `activityPriceWordBeforeTag.text` |
| 消费券栏目（首屏） | `tandy_vase.html` 的**静态 HTML** | HTML | `<span class="zlvRmSss">券后</span>` |
| 消费券栏目（刷新） | `api/brand-sega/special-sale-coupon/goods_list` | snake_case | `activity_price_word` |
| 消费券专区 | `api/brand-oppo/cma/goods_list` | snake_case | `activity_price_word` |
| 返回页面时重刷 | `api/brand-zara/bybt/goods_fresh` | snake_case | `bgp_fresh_goods_info_map[place][gid]` |

### 走过的弯路（v2.10 → v2.19，整整 10 个版本）

一直在改 `brand_activity_subsidy.html` 的 `rawData`（camelCase 字段），
以为那就是列表数据。实际那是**首屏骨架，会被接口数据覆盖**。
直到 v2.19 才在抓包里发现 `api/hermes/goods_list` 才是真正的渲染源。

---

## 版本时间线

### v1.99 — CPS 链接改写（首页）
- 把信息流 `link_url` 从 `goods.html?goods_id=x&...` 改成 `duo_coupon_landing.html?goods_id=x&pid=...&campaign=ddjb&duoduo_type=2`
- 因 Loon 同 URL 只跑首个命中 `[Script]`，内联进 `feed.response.js` 而非另开规则
- 新开关 `cps_rewrite`（默认关）、`cps_pid`、`cps_probe`

### v2.00 — 补缓存戳
- **根因**：8 个 `script-path` 全部没有 `?v=`。Loon 按完整 URL 缓存脚本，
  改了内容不改 URL → 继续跑旧缓存。真机表现为「改了没反应」。
- 修：`feed.response.js?v=2`
- 教训：`audit.py` 只检测「有 v 但没跟着改」，无 v 时静默通过

### v2.01 — 补 `goods_sign`
- 真机证实：客户端**确实读取 `link_url`**，点击后请求
  `m.pinduoduo.net/duo_coupon_landing.html?...&goods_id=...`
- 但只带 `goods_id` 缺 `goods_sign` → 领券页回落「商品已售罄」
- 改为调用大淘客批量换 `goods_sign` + `cpsSign`

### v2.02 — 只改写有佣金的商品
- 用户指出：**没进进宝 = 没佣金 = 改了也白改**，反而多跳一次领券页
- 96% 能改写 ≠ 该改，只有 `rate>0` 才值得
- 过滤 `parseFloat(goods.rate) > 0`

### v2.03 — 数组参数合并
- **根因**：`if (Array.isArray(v)) v = v[0] || {}` —— Loon 传数组时元素顺序不保证
- 真机表现：`cps_rewrite` 生效但 `feed_ad` 丢失 → 广告标全没了
- 修：数组形态**逐项合并**，验证对象/数组输出逐字节一致

### v2.04 — 列表显示佣金率（标签行）
- 给 `tag_list` 插 `佣金x.x%` 红字标签

### v2.05 — 改拼进销量行
- 用户要求：`广告·佣金9.6%·已拼X件` 这种形式

### v2.06 — 详情页佣金 + 列表回标签行
- **真机实测**：销量行长度 17~21 字**整段不显示**，10~13 字正常
- 列表改回 `tag_list`，详情页用行内前缀

### v2.07 — 回到销量行
- 用户反馈：**标签行会被折券倒计时横幅遮挡**，只有销量行位置稳定
- 去掉冗余的 `广告·` 前缀腾位置（实证 32/32 广告商品 `tag_list` 已有「广告」标）
- 新增 `cps_budget` 宽度预算

### v2.08 — 优先级：广告标 > 佣金率 > 销量文案
- 广告商品的「广告」徽标额外占约 6 宽度单位，留给文本只剩约 16
- 广告商品只保留 `广告·佣金x.x%`，销量文案舍弃
- `markAds` 移到最后执行，且跳过已含佣金的文本

### v2.09 — 列表缓存 + 详情页实时
- 列表查 `pddCpsCache`（6 小时 + 不跨自然日），命中则零请求
- 详情页**强制绕过缓存**，每次拉实时值（用户要求：买之前看到的必须真实）

### v2.10 ~ v2.18 — 百补首页（走的弯路）
- v2.10 首次尝试，改 `rawData`（camelCase）
- v2.11 改 `activityPriceWord` 无效（主列表读的是 `activityPriceWord`，但被 `BeforeTag` 覆盖）
- v2.12 数据从 `plusSubsidyStore` 改到 `tabStore`
- v2.13 加 `cps_probe` 参数诊断
- v2.14 `timeout` 5→15（H5 页面 + 外部请求）
- v2.15 改 `activityPriceWordBeforeTag.text`
- v2.16 发现首屏标签是**静态 HTML**，加静态改写
- v2.17 移除全部（改错方向的代码）
- v2.18 修首页空白 bug：`cps_budget` 22→14

### v2.19 — 找到真正数据源 `hermes/goods_list`
- `place_id=BYBT_MAIN` 是百补精选主列表（20 个，17 个带 `before_tag`）
- `BYBT_MAIN_LUXE_HUB` 是奢品馆（`before_tag` 全 null）
- 新脚本 `bybt_goods.response.js`

### v2.20 — 双数据源探针
- HTML 写 `HTML探针`、接口写 `API探针`，确认前端读哪层

### v2.21 — 清理全部诊断代码

### v2.22 — 消费券栏目（`tandy_vase.html`）
- 双列布局，数据在 `rawData.stores.store`（双层）
- 该页面**没有** `activityPriceWordBeforeTag`，`activityPriceWord` 是真渲染的

### v2.23 — 消费券「券后」是静态 HTML
- 页面有 31 处「券后」是**服务端预渲染**的，不是 JSON 字段
- 新增 `rewriteCouponTags()`，用价格整数做锚点替换 `<span class="zlvRmSss">`
- **关键**：必须在 JSON 改写**之前**做，否则 `p3.start` 失效

### v2.24 — 消费券刷新被接口覆盖
- 真机：**短暂显示佣金，然后自动刷回「券后」**
- 前端 hydration 后调 `special-sale-coupon/goods_list` 覆盖
- 在该接口加 `activity_price_word` 改写
- 顺带修 bug：`finish(fetched)` 只写 cache 没写 map

### v2.25 — 消费券专区 `cma/goods_list`
- 新专区（`lucky_bag_coupon`）同样双阶段渲染
- 结构一致，复用 `subsidy_api.response.js`

### v2.26 — 返回页面时重刷
- 真机：点进商品再返回，又被刷回「券后」
- 根因：`bybt/goods_fresh` 返回 `activity_price_word: "券后"`
- 结构是 **map 不是数组**：`bgp_fresh_goods_info_map[place][gid]`
- 新脚本 `bybt_fresh.response.js`

### v2.27 — 百补全部支持转链，默认开启
- 之前只有 `feed.response.js` 做了链接改写，四个百补脚本只做佣金
- `cpsFetch` 返回值从 `rate` 改为 `{ rate, link }`
- 新增 `rewriteLink()`，同时支持 `link_url`（snake）与 `linkUrl`（camel）
- `cps_rewrite` 默认 `false → true`

### v2.28 — 旧缓存缺 link
- 缓存结构从 `{r,t}` 改成 `{r,l,t}`，但设备上已有旧格式
- 命中旧缓存 → `link` 为空 → 只改佣金不转链
- 修：转链开启时，缓存缺 `l` 视为未命中，重新请求

### v2.29 — 百补首页 `goodsInfoMap` + 补回误删的 else
- 百补首页商品在 `store.tabStore.commonGoodsInfoStore.goodsInfoMap`
  （key 形如 `BYBT_MAIN_693607160697`，值对象无 `goodsId` 字段）
- v2.28 批量替换时**误删**了 `subsidy.response.js` 里 `need` 收集的 `else` 分支
  → `need` 恒为 0，从不发请求 → 百补首页完全不显示佣金
- 同时把 `activityPriceWord` 改写改为**优先 `activityPriceWordBeforeTag.text`**

---

## 最终架构

```
                    ┌─ feed.response.js        首页信息流
                    │    · sales_tip 佣金
                    │    · link_url 改写
                    │
                    ├─ detail.response.js      商品详情页
                    │    · side_sales_tip 等 5 处佣金
                    │
   Loon 11 条规则 ──┼─ subsidy.response.js     百补首页 + 消费券首屏
                    │    · goodsInfoMap（camelCase）
                    │    · 静态 HTML「券后」
                    │    · linkUrl 改写
                    │
                    ├─ bybt_goods.response.js  百补精选（hermes/goods_list）
                    ├─ subsidy_api.response.js 消费券滚动（2 个接口）
                    └─ bybt_fresh.response.js  返回重刷（map 结构）
```

**共用组件**（每个脚本内联一份，因 Loon 脚本间无法共享代码）：

| 函数 | 作用 |
|---|---|
| `cpsFetch(ids, cb)` | 大淘客批量查询，返回 `{gid: {rate, link}}` |
| `cacheLoad` / `cacheSave` / `cacheFresh` | `pddCpsCache`，6 小时 + 不跨自然日 |
| `rewriteLink(g, ent)` | 改 `link_url` / `linkUrl`，幂等 |
| `fmtRate(v)` | 9.6 → `"9.6"` |

---

## 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `cps_label` | **开** | 显示佣金率 |
| `cps_rewrite` | **开** | 链接改写为 CPS |
| `cps_token` | 空 | 大淘客 `app_token`（171 字符），留空则全部跳过 |
| `cps_ttl` | 21600 | 列表缓存秒数（6 小时，不跨自然日） |
| `cps_budget` | 14 | 首页销量行显示宽度上限（CJK=2/ASCII=1） |
| `cps_pid` | `41096949_318859099` | 改写进链接的推广位 |

---

## 踩过的坑（按教训价值排序）

1. **Loon 按完整 URL 缓存脚本** —— 改内容必须同时改 `?v=`，否则静默跑旧版
2. **`$argument` 数组形态元素顺序不保证** —— 必须逐项合并，不能取 `v[0]`
3. **同 URL 只跑首个命中的 `[Script]`** —— 需要叠加逻辑只能内联进同一个文件
4. **列表类功能验证必须滚到底** —— 首屏 10 个里可能只有 2 个有佣金，
   只看首屏会误判为「失败」
5. **批量替换后必须跑端到端测试** —— v2.28 误删一行 `else`，
   导致 v2.29 前百补首页完全失效，而我只验证了另一个脚本
6. **双阶段渲染**：静态 HTML 被接口覆盖，两处都得改
7. **改错字段**：前端 `W = BeforeTag.text || priceWord`，只改后者会被前者盖住## v2.48（2026-10-28）

### 三选一福袋自动选中间

**结构**（`LuckyBagTakeCouPopNewTwo.js` 的 `Y` 组件）：

| 位置 | class 键 | 实际 class |
|---|---|---|
| 左 `n[0]` | `BX_Class540` | `_1OzN-NpJ` |
| 中 `n[1]` | `BX_Class536` | `_22KgmSjU` |
| 右 主福袋 | `BX_Class527` | `_1HumS6AN` |

**关键**：`W`（每个福袋）是**纯展示组件，没有 `onClick`** ——
点击靠 React 事件委托（监听挂在 root 容器，靠冒泡 + target 判断）。

所以不能只靠 `el.click()`，改成**按坐标 dispatch 真实 MouseEvent**
（`mousedown` / `mouseup` / `click`），让 React 合成事件拿到正确 `clientX/Y`。

**防误伤**：

| # | 措施 |
|---|---|
| ① | 必须三个福袋同时存在 |
| ② | 只点一次，弹窗消失后重置 |
| ③ | 元素尺寸 > 20px |
| ④ | 按 x 坐标排序取中间 |

新开关 `lucky_3of1`（默认开）。`Argument`: 22 → 23。

---

## v2.47（2026-10-28）

### 福袋自动关闭覆盖两个弹窗变体

**为什么 v2.45 / v2.46 都失败**

PDD 有**两个不同的福袋弹窗组件**，之前只覆盖了其中一个：

| 组件 | 触发条件 | 关闭按钮 class | 关闭按钮图片 |
|---|---|---|---|
| `LuckyBagTakeCouPopNewTwo` | 无 `popup_goods` | `_1-lALGJL` / `_1CIjIqvj` | `f57ce24c-...` |
| **`LBTakeCouponPopWithGoods`** | **有 `popup_goods`** | `_1YyPm9Uh` / `eOdKZIH1` | `bf929de2-...` |
| | | 另有 `closeIcon` `_3T2QZOWa` | |

**抓包佐证**：用户那次 `take_coupon` 响应含 `popup_goods`，加载的是
`LBTakeCouponPopWithGoods_*.js`（13.4 KB），而 `LuckyBagTakeCouPopNewTwo`
**根本没加载** → 之前的选择器全是空的。

**本版**：`SELS` 同时覆盖两个变体的 class + 图片 URL。

防误伤：宽高 > 8px、在视口内、每元素只点一次、只点元素本身。

---

## v2.46（2026-10-28）

### 福袋自动关闭改用属性选择器

**v2.45 为什么没生效**

v2.45 只查 `document.querySelectorAll('img')`，但关闭按钮由图片组件 `f.ZP` 渲染，
**可能是 `<div style="background-image:url(...)">` 而不是 `<img>`** → 找不到 → 不生效。

**修复**

改用属性选择器，一次覆盖所有渲染形态：

```js
var SEL = '[src*="' + KEY + '"],[data-src*="' + KEY + '"],'
        + '[srcset*="' + KEY + '"],[style*="' + KEY + '"]';
```

**防误伤（五重）**

| # | 措施 |
|---|---|
| ① | `KEY` 是关闭按钮专属图片 UUID，实测全页只加载 1 次 |
| ② | 宽高必须 > 8px（跳过未渲染/隐藏元素） |
| ③ | 必须在视口内（跳过离屏元素） |
| ④ | 每个元素只点一次（`__pddLbClicked`） |
| ⑤ | 只点元素本身，不点父元素（避免命中其他交互） |

---

## v2.45（2026-10-28）

### 福袋领券弹窗自动点关闭

**背景**：消费券页福袋领券弹窗，动画（Lottie）播完才显示关闭按钮，要手动点。
服务端在动画开始瞬间就已发券（`take_coupon` 立即返回 `code: 0`），动画纯拖延。

**定位**（`LuckyBagTakeCouPopNewTwo_*.js`）：

```js
l.createElement(f.ZP, {
  className: m()(x().BX_Class521, x().BX_Ani521),   // → "_1-lALGJL _1CIjIqvj"
  src: D.IMG_SRC_13,
  onClick: a                                         // a = closePop
})
```

**为什么用图片 URL 而不是 class**

| 特征 | 稳定性 |
|---|---|
| class `_1-lALGJL` | ❌ CSS Modules 编译产物，每次构建都变 |
| 图片 URL `f57ce24c-...png` | ✅ 写死在 JS 里 |

实测两个弹窗变体（`BX_Class521` / `BX_Class240`）都用同一张关闭图。

**实现**：注入 JS，每 500ms 扫 `img`：

- `src` 命中 `f57ce24c-be68-49a3-ab54-dd45824a4a1d`
- 尺寸 > 5px（跳过未渲染的）
- 每个元素只点一次（`__pddLbClicked` 标记）

新开关 `lucky_close`（默认开）。`Argument`: 21 → 22。

---

## v2.44（2026-10-28）

### 点亮自动倒计时修正：必须主动触发 scroll 事件

**v2.43 为什么没生效**

抓包 `shared-0D3729E4_490`：注入成功了（`lightup=True`）、`task_duration=10` 也对，
但**没有 `end_task`** —— 倒计时根本没走。

根因：v2.43 只给 `scrollTop` 打了「读取扰动」补丁，**没有触发 scroll 事件**。

页面真实逻辑：

```js
const t = debounce(() => { m.current = false; ... }, 1000);
document.addEventListener('touchstart', () => {
  document.addEventListener('scroll', t);   // 首次触摸才挂监听
});
setInterval(() => { if (!m.current) d(e => e - 1) }, 1000);
```

`m.current` 初始为 `true`，**只有 debounce 执行才会变 `false`**，
而 debounce 只由 `scroll` 事件驱动 → 不滚动就永远不扣时间。

**v2.44 修正**

每 300ms 执行三件事，缺一不可：

| 步骤 | 作用 |
|---|---|
| ① `dispatch touchstart` | 挂上 scroll 监听 |
| ② 真实抖动 `scrollTop` 1px | 让 debounce 里的「位置是否变化」判断失败 |
| ③ `dispatch scroll` | 驱动 debounce 执行 |

抖动幅度 1px，用户基本察觉不到。

---

## v2.43（2026-10-28）

### 点亮任务改用注入 JS 自动倒计时（放弃改 bundle）

**为什么放弃 v2.41 的 JS 替换**

抓包实证：`xbrand_special_sale_*.js` 被 WebKit 缓存后**不再请求**，
Loon 的 `[Rewrite]` 没有机会执行 → 替换从未生效。
106 条请求里没有一条是那个 JS。

**新方案：注入 JS 打 scrollTop 补丁**

在 `tandy_vase.html` / `brand_activity_subsidy.html` 的 `</body>` 前注入：

```js
Object.defineProperty(documentElement/body, 'scrollTop', {
  get: 真实值 + 0/1 交替,
  set: 透传
});
```

页面代码 `a === scrollTop()` 永远为 false → `m.current` 保持 false
→ 倒计时每秒自动扣 1，无需手动滑动。

**HTML 每次重新请求，不受 JS 缓存影响。**

**改动**

| 项 | 变化 |
|---|---|
| `[Rewrite]` xbrand_special_sale 替换 | **移除** |
| `[MitM]` static.pddpic.com | **移除**（不再需要） |
| `lightup_auto` | **新增**（默认开） |
| `lightup_secs` 默认值 | 1 → **10** |
| `subsidy.response.js` | 加 `injectLightupAuto()` |

**副作用**：页面其他读 `scrollTop` 的逻辑会得到 ±1 扰动值
（吸顶/懒加载的判定阈值通常远大于 1px，影响可忽略）。

---


