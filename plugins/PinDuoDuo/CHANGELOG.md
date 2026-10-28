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
7. **改错字段**：前端 `W = BeforeTag.text || priceWord`，只改后者会被前者盖住
