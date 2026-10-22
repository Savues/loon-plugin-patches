# 闲鱼 App (com.taobao.fleamarket) — 规则说明

> 插件版本 v3.9.x · App 版本 **7.28.70** · 架构：**Flutter 主导** (Runner + App.framework) + 原生壳(IFMatrix/XOverseas)
> 网关 `acs.m.goofish.com` / `g-acs.m.goofish.com` · UA `闲鱼/59062863`

---

## 一、已拦截的广告形态（全部真机验证 ✅）

### 1.1 首页 / 通用（5 组开关）

| # | 广告形态 | 机制 | 接口 | 开关 |
|---|---------|------|------|------|
| 1 | **开屏广告** | Script + Rewrite 双保险 | `mtop.taobao.idlecommerce.splash.ads` / `.async.ads` / `.splash.config` | `fishRemoveSplash` |
| 2 | **ADX 竞价广告** | Script 清空 | `mtop.taobao.idlecommerce.adx.bid` | `fishRemoveSplash` |
| 3 | **游戏 IAA 广告** | Script 清空 | `mtop.taobao.idlecommerce.game.iaa.ads` | `fishRemoveSplash` |
| 4 | **用户策略/弹窗位** | Script 整体 `{}` | `mtop.taobao.idle.user.strategy.list` / `.get` | `fishRemovePopup` |
| 5 | **商品推荐位** | Script 整体 `{}` | `mtop.taobao.idle.item.recommend.list` | `fishRemovePopup` |
| 6 | **附近角落位** | Script 整体 `{}` | `mtop.taobao.idle.local.near.by.corner.info` | `fishRemovePopup` |
| 7 | **购买 Feed** | Script 整体 `{}` | `mtop.taobao.idle.item.buy.feeds` | `fishRemovePopup` |
| 8 | **玩家推荐** | Script 整体 `{}` | `mtop.taobao.idle.playboy.recommend` | `fishRemovePopup` |
| 9 | **首页主 Feed** | Script 过滤 `cardType=homeMultiBanner/mamaAD` + 保留 `kingkongDo` | `mtop.taobao.idlehome.home.nextfresh` | `fishRemoveHomeAds` |
| 10 | **Widget 刷新** | Script 同上 | `mtop.taobao.idlehome.widget.refresh.get` | `fishRemoveHomeAds` |
| 11 | **鲸鱼模块** | Script 过滤 `template.name=fish_home_miniapp` | `mtop.taobao.idle.home.whale.modulet` | `fishRemoveHomeAds` |
| 12 | **社区** | Script 模板白名单 | `mtop.taobao.idlehome.home.community` | `fishRemoveHomeAds` |
| 13 | **新商品页** | Script 去 banner/mamaAD | `mtop.taobao.idlehome.home.newitem.page` | `fishRemoveHomeAds` |
| 14 | **本地流量位** | Script 去 `fish_city_kingkong` | `mtop.taobao.idle.local.flow.plat.section` | `fishRemoveHomeAds` |
| 15 | **本地顶部** | Script 保留 `fish_home_second_stage_top_cardV3` | `mtop.taobao.idle.local.home.top` | `fishRemoveHomeAds` |
| 16 | **本地首页** | Script 去 `cardEnum=ads` | `mtop.taobao.idle.local.home` | `fishRemoveHomeAds` |
| 17 | **圈子列表** | Script 白名单 (`main`/`market`/`IDLE_CIRCLE`) | `mtop.taobao.idlehome.home.circle.list` | `fishRemoveHomeAds` |
| 18 | **魔法首页** | Script 去 `topList` | `mtop.taobao.idlehome.magic.home.page.list` | `fishRemoveHomeAds` |
| 19 | **关注 Feed 流** | Script 只保留 `cardType=2001` | `mtop.taobao.idle.fun.follow.feed.list` | `fishRemoveHomeAds` |
| 20 | **我的页面** | Script 模板白名单 + 去 `level.exContent.tips` | `mtop.idle.user.page.my.adapter` | `fishRemoveMyPage` |
| 21 | **交易详情** | Script 保留特定 render 类型 | `mtop.taobao.idle.trade.full.info` | `fishRemoveMyPage` |
| 22 | **搜索广告/热搜/猜你可能在找** | Script 精准清理 | `idlemtopsearch.search*` / `idleitem.tbsearch` / `idle.search.*` | `fishRemoveSearchAds` |
| 23 | **搜索发现** | Script 清 `MarketHotSpot` | `mtop.taobao.idlemtopsearch.search.discover` | `fishRemoveSearchAds` |
| 24 | **搜索激活/热搜词卡** | Script 清 `cardData.hotwords` | `mtop.taobao.idlemtopsearch.item.search.activate` | `fishRemoveSearchAds` |
| 25 | **搜索遮罩词** | Script 清 `singleShadeWords` | `mtop.taobao.idlemtopsearch.search.shade` | `fishRemoveSearchAds` |
| 26 | **闲鱼广告上报** | Rewrite reject | `mtop.idle.ad.*` / `mtop.idle.idleadv.*` | `blockTracking` |
| 27 | **鱼池弹窗** | Rewrite `reject_dict(200)` | `mtop.taobao.idle.fishpool.poplayerinfo` | `fishRemovePopup` |
| 28 | **直播广告素材** | Rewrite `reject_dict(200)` | `mtop.taobao.idle.live.home.ads.material.get` | `fishRemovePopup` |
| 29 | **启动上报** | Rewrite reject | `mtop.taobao.idlefish.device.log.launch.report` | `blockTracking` |

---

## 二、关键机制（逆向发现）

### 2.1 Flutter 侧搜索域（闲鱼搜索页是 Flutter 实现）
```
package:idle_search/src/biz/fun/
  ├── widget/fun_active_keyword_item.dart    ← ★ 猜你可能在找渲染器
  ├── widget/fun_active_keyword_list.dart
  ├── widget/fun_hot_keyword.dart            ← 热搜
  └── protocol/oliver_batch_issue_request.dart  ← Oliver 投放平台
package:idle_search/src/proto/api/
  ├── index_activate_res.dart   (cardList[].cardData.{hotwords,keywords,title})
  ├── index_suggest_res.dart    (items / dynamicList / picTextEntryInfoVOList)
  └── index_shade_res.dart      (singleShadeWords / multiWordsForMarquee)
package:idle_search/src/page/components/sub_page_container/components/search_mid/
  ├── widgets/mid_hot/hot_widget.dart
  └── widgets/mid_history/history_widget.dart
```

### 2.2 ★ 联想与"猜你可能在找"同源冲突（三条硬约束）

`activate` 接口的 `cardData.keywords` **同时是**：
- **联想请求的触发前提**（App 用 activate 是否"有内容"决定是否发联想请求）
- **"猜你可能在找"板块的渲染数据**

| 操作 | 联想 | 猜你可能在找 |
|------|------|------------|
| `keywords = []` | ❌ 失效（App 判定无内容 → 不发请求）| ✅ 消失 |
| `keywords[].link = ""` | ❌ 失效（初始化失败）| — |
| 保留 1 项 + `text=""` | ✅ 正常 | 仅剩空位 |
| **保留 1 项 + `text="我是学生，可以送我吗？"`** | ✅ 正常 | ✅ **占位词**（当前方案）|

**结论**：词显示与可点击性/初始化耦合，只能"以无害内容占位"替代"清空"。

### 2.3 原生 XOverseas 体系（搜索页外壳）
```
XOverseaViewController
├── XOverseasSearchView / XOverseasSearchBar / XOverseasPhotoSearchButton
├── XOverseasScrollContainer / XOverseasContentView
│   ├── XOverseasItemModel / XOverseasSectionModel / XOverseasTabModel
│   └── XOverseasContentType
├── XOverseasHeaderView / XOverseasSectionHeaderView  (标题 + onMoreTapped 刷新)
├── XOverseasSectionFooterView / XOverseasFooterState
└── SEARCH_TAB_* 枚举 (AI_SEEK / DEAL_PRICE / MAIN / MARKET / OLD_FRIENDLY / USER)
```
关键字符串 `searchReqFromActivatePagePart` → **联想请求从激活页发起**。

### 2.4 清空语义必须等同 kelee 的 `reject_dict(200)`
```
kelee reject_dict(200)  → 整个响应体替换为 {}      (HAR 实证 size=2, body=b'{}')
错误实现             → 保留 ret, 仅 data={}     → App 解析路径不同, 行为异常
```
v3.15.1 起全部统一为返回 `{}`。

### 2.5 闲鱼自有广告 SDK
```
FishAdsManager / FishAdMaterialManager / FishAdFeedsTracker
FishAdThirdPartySdkManager / FishAdShakeManager (摇一摇) / FishAdPryGestureDetector
BeiZi (贝子)  —— 第三方广告 SDK
```

---

## 三、已知限制

| 限制 | 原因 |
|------|------|
| **消息页无法加载**（仅在抓包开启时）| Loon 抓包 = 「MitM 额外主机名」全量 MITM → 打断 `sealine.youku.com`/`dypnsapi-*.aliyuncs.com` 推送长连接。<br>**验证消息功能请关闭抓包**（插件规则不受影响）|
| Flutter 网络可能不走系统代理 | 若某接口 HAR 零出现但功能仍在 → 走 Flutter/Cronet 通道，HTTP 规则无法命中 |
| 首次冷启动后旧浮层缓存 | 清 App 私有目录可解 |

---

## 四、维护指引

### 4.1 kelee 规则对照
kelee 原插件 24 条规则已**全部语义等价实现**（jq `select` ↔ JS `filter`），并额外补齐反编译发现的 5 条：
```
mtop.taobao.idlecommerce.splash.async.ads / .splash.config
mtop.taobao.idlecommerce.adx.bid / .game.iaa.ads
mtop.taobao.idle.user.strategy.get
mtop.taobao.idle.fun.follow.feed.list
```

### 4.2 新增闲鱼规则
```ini
# 闲鱼全部走 acs.m.goofish.com / g-acs.m.goofish.com
response if ${url} ~= /^https?:\/\/acs\.m\.goofish\.com\/gw\/mtop\.taobao\.xxx/i then script(...)
```
**注意**：`g-acs.m.goofish.com` 是搜索专用网关（`idlemtopsearch.search` 走它），别漏。

### 4.3 搜索域改动的风险
改动 `keywords` 相关逻辑前**必须**本地跑端到端验证：
```bash
node -e "..." # 构造含 keywords 的 activate 响应, 确认 ① 联想保留 ② 板块词为占位词
```
