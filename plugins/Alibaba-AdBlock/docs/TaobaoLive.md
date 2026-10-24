# 淘宝直播 App (com.taobao.live) — 规则说明

> ⚠️ **时效标注（2026-10-24）**：本文档记录至 v3.37.x 时代。v3.40~v3.49 的新增覆盖（天猫开屏/搜索域/弹窗/摇钱树、一淘全案、特价版闪屏、直播营销清洗）见仓库 README 的「近期修复与验证状态」表与 docs/Tmall-LTao-preliminary.md。本文档的历史结论仍有效。


> 插件版本 v3.9.x · App 版本 **4.56.18** · 架构：原生 + Weex/DX JS + 组件化
> 网关 `acs.m.taobao.com` / `guide-acs.m.taobao.com` · 埋点 `tblive.highway.alibaba-inc.com`

---

## 一、已拦截的广告形态（全部真机验证 ✅）

### 1.1 直播间广告（核心）

| # | 广告形态 | 机制 | 接口/资源 | 开关 |
|---|---------|------|-----------|------|
| 1 | **搜索发现板块** | Script 清 `data.result[]` | `mtop.taobao.livex.vcore.search.discover` | `liveRemoveAds` |
| 2 | **直播热卖榜** | Script 清 `data.data.tabs[]` | `mtop.taobao.livex.vcore.search.guidehotlist` | `liveRemoveAds` |
| 3 | **足迹补贴板块** | Script 清 `data.data.userFootPrint{}` | 同上（与 tabs 同级！） | `liveRemoveAds` |
| 4 | **搜索框遮罩词** | Script 清 `data.hotWords{}` | `mtop.taobao.livex.vcore.search.shadingwords` | `liveRemoveAds` |
| 5 | **信息流广告** | Script 过滤 `doudiType=AdFeed` / `type=DOUDI_RECOMMEND` | `mtop.taobao.livex.vcore.feeds.market.query` | `liveRemoveAds` |
| 6 | **搜索氛围** | Rewrite `reject_dict(200)` | `mtop.taobao.livex.vcore.search.searchatmosphere` | `liveRemoveAds` |
| 7 | **直播间弹窗推荐** | Rewrite `reject_dict(200)` | `mtop.tblive.recommend.popview.*`（query/click/status） | `liveRemoveAds` |
| 8 | **增长弹窗** | Rewrite `reject_dict(200)` | `mtop.tblive.growth.api.pop.*` / `.benefit.strategy.issue` | `liveRemoveAds` |
| 9 | **增长查询** | Rewrite `reject_dict(200)` | `mtop.tblive.live.growth.query` | `liveRemoveAds` |
| 10 | **增长广告位** | Rewrite `reject_dict(200)` | `mtop.taobao.livex.grow.{task,playlet,traffic}.*` | `liveRemoveAds` |
| 11 | **营销浮层体系** | Rewrite `reject_dict(200)` | `dinamicx.../skylar_hummer_*`（219 个模板） | `liveRemoveAds` |
| 12 | **广告位配置** | Rewrite `reject_dict(200)` | `mtop.taobao.livex.business.ad.*` / `.complex.ad.query` / `.item.supply.ad.report` / `.live.ad.preload` | `liveRemoveAds` |
| 13 | **广告策略配置** | Rewrite `reject_dict(200)` | `mtop.taobao.livex.business.ad.policy.config` | `liveRemoveAds` |
| 14 | **视频广告** | Rewrite `reject_dict(200)` | `mtop.taobao.livex.vcore.recommend.*.video.ad.query` | `liveRemoveAds` |
| 15 | **第三方广告上报** | Rewrite `reject_dict(200)` | `mtop.taobao.livex.business.third.ad.*` | `liveRemoveAds` |
| 16 | **礼物浮层** | Rewrite `reject_dict(200)` | `mtop.iliad.interact.reward.gift.float.layer` | `liveRemoveAds` |
| 17 | **开屏资源** | Rewrite `reject_dict(200)` | `mtop.taobao.livexshow.launchscreen.pullResource` | `removeSplashAd` |
| 18 | **直播氛围** | Rewrite `reject_dict(200)` | `mtop.tblive.live.atmosphere.resource.list` / `.detail.sendUserAtmosphere` | `liveRemoveAds` |
| 19 | **云袭广告监测平台** | Rewrite 整域 reject | `*.yunxish.com` / `*.iggrowth.cn`（6 个域） | `blockTracking` |
| 20 | **阿里妈妈广告追踪** | Rewrite reject | `mtop.taobao.livex.business.taolive.ad.monitor` | `blockTracking` |
| 21 | **首页视频流广告** | Script 清 `dataList[].data.data.liveList[0].ad` | `mtop.taobao.livexshow.homepage.{videolist,tabmenu}` | `liveRemoveAds` |
| 22 | **权益广告** | Script 清 `liveBenefitAdInfo.pushData.ad` | 同上（tabmenu 内） | `liveRemoveAds` |
| 23 | **推荐视频流广告** | Script 清 `data.model[].ad` | `mtop.taobao.livexshow.recommend.slide.lives` | `liveRemoveAds` |

### 1.2 搜索门（与淘宝共用组件）

| 广告形态 | 机制 | 资源 | 开关 |
|---------|------|------|------|
| 热榜九宫格 / 文字列表 / 猜你想搜 | Rewrite `reject_dict(200)` | `g.alicdn.com/tb-webb-widget*/search_door_*/` | `removeSmallCards` |

---

## 二、关键机制（逆向发现）

### 2.1 搜索域三板块同在一个接口
```
mtop.taobao.livex.vcore.search.guidehotlist (19KB)
  → body.data.data = {
       selectedPos: "0",
       tabs: [...],           ← 直播热卖榜  (desc:"直播热卖榜", itemList, subTabList[总榜/...])
       userFootPrint: {...}   ← 足迹补贴    (click.title:"足迹补贴", data.items[])
     }
```
**踩坑**：`userFootPrint` 与 `tabs` **同级**（不是 tabs 的子项）→ v3.31.0 只清 tabs 导致足迹补贴残留，v3.32.0 补正。

### 2.2 skylar_hummer 浮层体系
直播间的营销浮层/弹窗全部用 DX hummer 模板，命名规律：
```
skylar_hummer_layer_template_recall_popup      召回弹窗
skylar_hummer_float_urge2use_by_turn           催单浮层
skylar_hummer_float_welfare_v2                福利浮层
skylar_hummer_float_liveroom_activity         直播间活动浮层
skylar_hummer_layer_detain_education_guide_v3 引导层
skylar_hummer_template_layer_live_room_*      直播间层级
```
→ 规则 `/\/skylar_hummer_/i` 一条覆盖全部变体（219 个模板）。

### 2.3 沙盒 DX JS 组件（`Library/dxJs/`）
```
AdVideoUiLayer(0.11.4)     广告视频浮层
GrowUndertake(1.0.128)     增长承接
GrowFlowUndertake(1.0.49)  增长承接流
VideoCommonOverlay(0.16.4) 视频通用浮层
VideoBenefitCard            视频福利卡
TLLiveCommonOverlay         直播通用浮层
HotRankSecPage / TightMarketPage  热榜页/市场页
```
这些是**已下载缓存**，组件被拦后仍可能用旧缓存 → 测前清 App 私有目录。

### 2.4 青少年模式弹窗（**无法拦截**）
```
TLTeenProtectManager / TLTeenProtectViewController
TLSVOverlayTeenProtectCreator / TLTeenager
Library/Preferences/com.taobao.live.plist → teenprotect_lastshow_secondinterval
```
纯本地机制（记录上次展示时间 → 控制间隔 → 只弹一次），**无任何 mtop 接口** → 插件层不可达，只能删该 Preferences 键重置。

---

## 二·补、直播首页/推荐视频流广告结构（v3.37.6/3.37.7）

```
① 首页视频流   livexshow.homepage.videolist     260KB
   livexshow.homepage.tabmenu      321KB
   广告路径: dataList[N].data.data.liveList[0].ad
     内嵌 adType:"LIVE" + pCode:"home_livelist_other" + ownerId
     标记   m_ext=__TANX_M_EXT__  (阿里妈妈 Tanx 投放)
   正常项: isAd="0" 且【无 ad 对象】← 判别依据

② 权益广告 (对象非数组)
   videoListDatas.liveBenefitAdInfo.pushData.ad   → 整体置 {}

③ 推荐视频流   livexshow.recommend.slide.lives  74KB
   广告路径: data.model[N].ad   ← 数组名是 model (非 dataList)
```

实现 `filterLiveHomeFeed`：递归处理 `dataList` 与 `model` 两种数组名 + `liveBenefitAdInfo`。

**效果**：videolist 260696→209361 / tabmenu 321488→192984 / slide.lives 74033→29784（adType 全归零）

> 注：直播 App 广告面广（用户反馈"界面上无数广告"），当前已覆盖 23 种形态，
> **未覆盖**：`livex.vcore.series.videos.query`(328KB) / `page.pkg.config.list`(143KB,配置) /
> `common.video.query`(49KB) / `live.column.entry`(25KB) —— 经检测**无广告标记**，未处理。

## 三、已知限制

| 限制 | 原因 |
|------|------|
| 青少年模式弹窗 | 本地 Preferences 机制，无 HTTP 接口 |
| 三方 SDK 开屏（ABU/百度/GDT/快手）| 自有域名，未在 MITM 列表 |
| 首次冷启动后旧浮层缓存 | 需清 App 私有目录 |

---

## 四、维护指引

### 4.1 直播广告接口更新流程
```bash
# 1. 抓 HAR (进直播间停留 2-3 分钟 + 点送礼/福袋/抽奖)
# 2. 提取未覆盖的广告接口:
strings <TaoBaoLive4iPhone> | grep -oE "mtop\.[a-zA-Z0-9._]+" | sort -u \
  | grep -iE "ad|pop|growth|material|deliver|guang"
# 3. 甄别: 避开 sendgift / comment / chat / task / 充值 / follow 等功能接口
# 4. 加规则后跑验证脚本确认功能接口未被误伤
```

### 4.2 功能接口保护清单（**禁止**加入拦截）
```
mtop.iliad.interact.sendgift / chat.query / task.trigger / reward.createrechargeorder
mtop.taobao.iliad.comment.publish / share.item.*
mtop.tblive.live.follow.relation.add
mtop.taobao.livex.vinteract.product.video.getUploadConfig
```
