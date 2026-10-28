# 淘宝 App (com.taobao.taobao4iphone) — 规则说明

> ⚠️ **时效标注（2026-10-24）**：本文档记录至 v3.37.x 时代。v3.40~v3.49 的新增覆盖（天猫开屏/搜索域/弹窗/摇钱树、一淘全案、特价版闪屏、直播营销清洗）见仓库 README 的「近期修复与验证状态」表与 docs/Tmall-LTao-preliminary.md。本文档的历史结论仍有效。


> 版本 v3.9.x · 反编译版本 **10.68.0** · 架构：原生(TBSearch/XOverseas) + DinamicX 容器 + ACCS 推送
> UA 标识：`淘宝/59078163` · 网关：`acs.m.taobao.com` + `guide-acs.m.taobao.com` (mtop)

---

## 一、已拦截的广告形态（全部真机验证 ✅）

| # | 广告形态 | 拦截机制 | 接口/资源 | 开关 |
|---|---------|---------|-----------|------|
| 1 | **弹窗调度器**（793 广告/118 场景） | Script 清空 `sc` 场景映射 + 改坏 683 个 `cdnId` + 100 个落地页 URL | `poplayer.template.alibaba.com/popcdn/*/config.json` | `removePopWindow` |
| 2 | **弹窗模板本体** | Rewrite `reject_dict(200)` | `poplayer.template.alibaba.com/<32位hex>.json` | `removePopWindow` |
| 3 | **搜索门热榜九宫格** | Rewrite `reject_dict(200)` | `g.alicdn.com/tb-webb-widget-cloud/search_door_trending_nine_square_gridList/*` | `removeSmallCards` |
| 4 | **搜索门热榜文字列表** | Rewrite `reject_dict(200)` | `.../search_door_trending_hot_textList/*` | `removeSmallCards` |
| 5 | **搜索门猜你想搜** | Rewrite `reject_dict(200)` | `g.alicdn.com/tb-webb-widget/search_door_guess_discovery/*` | `removeSmallCards` |
| 6 | **搜索门数据 API** | Rewrite `reject_dict(200)` | `mtop.relationrecommend.*`（10 变体前缀覆盖）| `removeSmallCards` |
| 7 | **搜索门原生数据源** | Rewrite `reject_dict(200)` | `mtop.taobao.wsearch.common` / `.commonApi` | `removeSmallCards` |
| 8 | **开屏视频广告** | Rewrite + Script | `guide-acs.m.taobao.com/gw/mtop.taobao.cloudvideo.video.query` | `removeSplashAd` |
| 9 | **开屏图片（双11摇一摇）** | Rewrite 图片高度 ≥1600 | `gw/heic.alicdn.com/imgextra/*-tps-{宽}-1624\|2208\|2244.png` | `removeSplashAd` |
| 10 | **热启动切后台广告** | Rewrite 图片模式（kelee 同款）| `gw/heic.alicdn.com/imgextra/*-(octopus\|tps)-(1080\|1125)-*.jpg_q90` | `removeSplashAd` |
| 11 | **双11氛围皮肤/开屏背景** | Script 清 `enable` + `content` | `mtop.wireless.skin.atmosphere.info` | `removePopWindow` |
| 12 | **首页加载氛围** | Rewrite `reject_dict(200)` | `mtop.taobao.wireless.homepage.loadAtmosphere` | `removePopWindow` |
| 13 | **搜索框跑马灯热词** | Script 清 `multiWords` | `mtop.taobao.union.marquee.query` | `removeSmallCards` |
| 14 | **NOAH 运营位** | Script + Rewrite 双保险 | `mtop.etao.noah.query` | `removeNoahOps` |
| 15 | **TAC 搜索推荐** | Script | `mtop.alimama.moon.provider.tac.service.call` / `.smart.call` | `removeTAC` |
| 16 | **搜索关键词劫持**（1710 条 Atlas 投放词）| Rewrite `reject_dict(200)` | `mtop.taobao.clientpaas.spotlightsearch.get` | `removeSmallCards` |
| 17 | **阿里橙配营销清洗** | Script 字节级等长替换 | `orange.tbcdn.cn` / `dorangesource.alicdn.com` | `removeSplashAd` |
| 18 | **埋点/APM/AB 分流** | [Rule] 整域 reject（无条件）| `gm/log/s-gm/tlog.mmstat.com`、`px.effirst.com`、`abtest.alibaba.com`、`yixiu-abtest.alicdn.com`、`hudong.alicdn.com`（⚠️ `ossgw.alicdn.com` 已移出，见 §2.7）| 无开关 |
| 19 | **影视/O2O/音乐广告** | Rewrite + Script | `mtop.film.mtopadvertiseapi.queryadvertise`、`mtop.o2o.ad.gateway.get`、`mtop.alimusic.common.mobileservice.startinit` | `removePopWindow` |
| 20 | **UCP 全局弹窗闸门** | Rewrite `reject_dict(200)` | `mtop.taobao.auge.delivery.private.popup.control` | `removeUcpPopup` |
| 21 | **生活圈 LBS 横幅/入口** | Rewrite `reject_dict(200)` | `mtop.taobao.newhaven.lbsgroup.banner.*` / `newhaven.life.entrance.show` | `removePopWindow` / `removeSmallCards` |
| 22 | **社交弹窗** | Rewrite `reject_dict(200)` | `mtop.taobao.social.pop.get` | `removePopWindow` |

> ⚠️ **全屏图规则的判别**（v3.35.0 踩坑）：高度 ≥1600 且在 `gw/heic.alicdn.com` 才是开屏图；
> 高度 1200-1599（如 `tps-750-1200.png`）与 `img.alicdn.com` 域的 `tps-1080-2872.png_q50.jpg`
> 都是**首页背景图**（正常业务），不可拦。

---

## 二、关键机制（逆向发现）

### 2.1 弹窗调度器 popcdn.json
```json
{ "sc": { 场景URI: [弹窗ID...] },     // 118 个场景 → 触发关系
  "ac": { 弹窗ID: { params:{cdnId,url}, type, priority } },  // 785 条
  "version": "173801" }
```
**清理策略**：清空 `sc`（场景映射）+ 改坏 `cdnId`/`url` + **保留 `ac` 条目数**（content count==0 会被 App 判为错误并保留旧配置）。

### 2.2 搜索门两套实现
```
Muise 组件版: g.alicdn.com/tb-webb-widget*/search_door_*/   ← 可 reject
原生 Swift 版: XOverseasSectionHeaderView(Swift) + relationrecommend API
```
组件被拒后原生会 fallback → 必须同时拦 **组件 + 数据 API**。

### 2.3 启动图 TBBootImage
```
Documents/TBDocuments/bootImageDatas   (plist: URL→文件名)
Documents/TBDocuments/bootImagesDoc/  (图片本体)
Documents/TBDocuments/bootImageStatus (DisplayedTimes-xxx 展示次数)
Library/Preferences/com.taobao.bootimage.splash.plist (业务优先级 + 10分钟请求间隔)
```
活动图配置经 ACCS 下发（HAR 零命中），**图片本体走 HTTP** → 拦图片 URL 有效。

### 2.4 首页容器 gateway 缓存
```
Documents/TBDocuments/gateway/cache_newface_home_main_base
  → sections[1].content.searchText = { "0": {displayText, itemBizCode:"mst_roll_0"} }
```
轮播词 `mst_roll_N` = Atlas 营销位；**每次冷启动被 ACCS 立即重写** → 文件层无效。

---

### 2.5 ★ UCP 全局弹窗控制闸门（v3.38.0）

```
接口: mtop.taobao.auge.delivery.private.popup.control
```
二进制字符串证据：
```
GlobalControl CheckDisplay checkResult:true |reason:UCPCheckClientPass
GlobalControl CheckDisplay checkResult:false|reason:UCPCheckCodeInvalid    ← 拦掉走这条
GlobalControl CheckDisplay checkResult:false|reason:UCPCheckNotRequestEnd  ← 请求未完也不弹
GlobalControl CheckDisplay checkResult:false|reason:UCPCheckFatigueFailed
homePopRemovePopWhenUCPCheckFailed   ← 配置: UCP 失败则移除首页弹窗
notifyUCPSceneChanged / TabSwitch_UCP_args   ← 场景切换触发检查
updateTabBar / addList / removeList          ← 同时管 tabbar 角标
```
**机制**：客户端请求 → 按 `checkResult` 决定弹不弹。
**拦截效果**：返回 `{}` → `UCPCheckCodeInvalid` → `checkResult:false` → 弹窗被抑制。

> ⚠️ **独立开关 `removeUcpPopup`**（默认开）—— 行为系推断，且**同时影响 tabbar 角标**；
> 若首页/角标异常，单独关它即可，不影响其他弹窗规则。
> 📌 实测注意：该接口在普通浏览中**不一定被请求**（按需/懒加载），未出现在冷启动 HAR 中。

### 2.6 ⚠️ 双规则冲突模式（v3.38.1 事故）

同一接口同时存在 `[Script]` 和 `[Rewrite]` 规则时，**Rewrite 在请求阶段先执行 → Script 永远轮不到**。

| 接口 | Script（kelee 式清空）| Rewrite（blanket reject）| 后果 |
|------|---------------------|------------------------|------|
| `cloudvideo.video.query` | `filterTaobaoSplashVideo`（duration=0 + 清 resources/caches）| `reject_dict(200)` | **App 退避重试 6 次** ❌ |

- **kelee 原版此接口用的是 Body Rewrite 清空，不是 reject**
- 修复：移除 reject_dict，恢复 Script → 响应有效（duration=0/resources 空）→ 开屏视频不播 + **App 不再重试**

> 审计发现另有 10 个接口存在同类「Script + blanket reject」双规则（`splash.awesome.get` /
> `alimusic.common.mobileservice.startinit` / `film.mtopadvertiseapi.queryadvertise` /
> `o2o.ad.gateway.get` / `etap.etao.config.query` / `advertisementservice.getadv` /
> `trip.activity.querytmsresources` / `volvo.secondfloor.getconfig` / `idle.home.welcome` /
> `union.marquee.query`）→ Script 为死代码。**这 10 处行为正常、无重试证据，暂保留待审**。

---

### 2.7 🔴 结算页「提交订单」按钮消失（v3.50.3 事故，2026-10-29）

**现象**：一淘 10.7.0 从购物车进入结算页，页面能打开，但**底部付款栏整条不见**（无「提交订单」按钮）。

**取证链**（HAR + 模拟器规则匹配）：

| # | 证据 | 结论 |
|---|------|------|
| 1 | `mtop.trade.order.build` 响应 `data.hierarchy.root=confirmOrder_1`；按钮节点 `submitOrder_1` = `{"type":"dinamicx$475$buysubmit","fields":{"payBtn":{"enable":true,"title":"提交订单"}}}` | **数据层正常**，按钮数据存在且 enable |
| 2 | 同响应 `data.container.data` 共 154 个 dinamicx 组件，**103 个**托管 `ossgw.alicdn.com`；`buysubmit` → `https://ossgw.alicdn.com/rapid-oss-bucket/template_online/buy_submit/1600853389896/buy_submit_h5.js`（实测 HTTP 200 / 6166 B 模板）| 按钮由**远端模板**渲染，非内置 |
| 3 | `loon-sim rules --url <buy_submit_h5.js>` → `[Rule]: DOMAIN-SUFFIX, ossgw.alicdn.com, REJECT` | **整域拦截命中模板 URL** |
| 4 | 设备侧 `ossgw.alicdn.com` DNS → `127.0.0.1`（Loon [Rule] REJECT 特征）| 模板拉取必然失败 |
| 5 | `loon-sim rules --url mtop.trade.order.build` → 无 Rule/Rewrite/Script | 响应体未被改写，**排除清洗误伤** |

**根因**：`ossgw.alicdn.com` 是阿里**静态模板 CDN**（`rapid-oss-bucket/template_online/*`，托管全部 buy_* 结算组件），
v3.39.0 把它当"埋点域名"下沉到 `[Rule]` 整域 REJECT。模板拉取失败 → DX 节点渲染为空 → 底部结算栏消失。
其余组件因本地模板缓存仍能渲染，所以表现为"只有按钮不见了"。

**修复**：删除 `DOMAIN-SUFFIX, ossgw.alicdn.com, REJECT`（v3.50.3），原位留注释防回归。

#### 补充：一淘结算页有两套实现（2026-10-29 二次取证）

| 版本 | 接口 | 根节点 | 组件 | 提交按钮模板 |
|------|------|--------|------|-------------|
| 老页（H5） | `mtop.trade.order.build/4.0` | `confirmOrder_1` | 154（103 on ossgw） | `buy_submit_h5.js`（ossgw） |
| 新页 V3（原生 DX） | `mtop.trade.order.build/5.0` | `etaoBuyV3` | 187（142 on dinamicx / 26 on ossgw） | `buy_submit_ios.plist`（ossgw）+ `buy_v3_submit_order.zip` |

- 插件开（v3.50.2）：App 走 4.0 老页 → 按钮模板被 ossgw 规则拦 → 付款栏消失
- 插件关：App 走 5.0 新页 → 20 个 `buy_v3_*` 模板全部 200 → 正常
- v3.50.3 下两套页面的全部组件 URL（154 + 171 条）跑 `loon-sim rules` 均 **0 命中**

#### 真正的根因：结算入口接口被误拦（2026-10-29 第三次取证）

用户提示：失败时会弹「**人多拥挤，获取返利信息失败……**」再跳到无按钮的结算页。

真机对照抓包（同一 HAR 内插件开/关）：

| 插件状态 | `mtop.etao.fe.chaojisheng.draw.hongbao` | 结果 |
|---------|----------------------------------------|------|
| 开 | `reject_dict(200)` → 2B `{}` | 弹 toast → 退回旧 H5 页 → 无付款按钮 |
| 关 | 200 / 1251B，含 `placeOrderUrl` | 直接进 `etaoRoutePageCode=v3` 结算页 → 按钮正常 |

该接口的真实返回（不是广告，是结算入口）：

```json
{"data":{"noticeType":"0",
  "placeOrderUrl":"https://h5.m.taobao.com/awp/base/buy.htm?...&exParams=...%22etaoRoutePageCode%22%3A%22v3%22..."}}
```

- `placeOrderUrl` 里的 `exParams.etaoRoutePageCode=v3` **决定 App 打开哪套结算页**
- 拦成 `{}` → 拿不到 URL → App 走默认旧页 → 旧页 `buy_submit` 模板缺失 → 付款栏消失
- 规则 v3.46.0 引入时按名字「超级省红包」归类为营销接口 → 误伤主链路
- **v3.50.5 已撤销**，原位留事故注释

> 判定教训：接口名含 `hongbao`/`coupon`/`draw` ≠ 广告。一淘把「返利信息 + 结算页路由」塞在
> `chaojisheng.draw.hongbao` 里，这是第三次同类误判（前两次：`adzone.default.get` 分享链路、
> `home.metax.query` 首页白屏）。

#### 最终验证（v3.50.5 真机确认 ✅）

修复后抓包（2026-10-29 01:09）：

| 观测 | 结果 |
|------|------|
| `chaojisheng.draw.hongbao` | 200 / 1251 B，`placeOrderUrl.exParams.etaoRoutePageCode=v3` |
| `mtop.trade.order.build/5.0` | 200 / 125167 B，`hierarchy.root=etaoBuyV3`，184 组件 |
| 提交按钮节点 | `submit` = `dinamicx$buy_v3_submit_order$0$30`，`submitOrder.position=footer` |
| `mtop.etao.noah.query` | `assetResult: []`（`etao_dx_home_popup` 已清），无 `civet` 模板请求 |

三层问题（按发现顺序）：
1. `ossgw.alicdn.com` 整域拦截 → 旧结算页模板拉不到（v3.50.3 撤销）
2. `etao_dx_home_popup` NOAH 弹窗未过滤（v3.50.4 加入名单）
3. `chaojisheng.draw.hongbao` 结算入口被拦 → 弹「获取返利信息失败」+ 退回旧页（v3.50.5 撤销，**真正的按钮消失原因**）

---

## 三、已知限制

| 限制 | 原因 | 可能解法 |
|------|------|---------|
| **搜索框滚动词** | ACCS 私有 TCP 推送 + 原生 MultiHintq 渲染 + DX 容器模板（改则破坏点击）| 越狱 Hook `TBSearchHintLabel.setHintText` / `TBHomeSearchBarCacheManager.updateSearchItemData` 过滤 `mst_roll_` |
| ↳ **三次验证记录** (2026-10-23) | ① 数据只在 `gateway/cache_newface_home_main_base` 的 `sections[1].content.searchText`；② 新查 `TBHomeTabSearchBarManager` / `modifySearchBarSectionData` 为原生填充；③ 候选 API 全未出现于任何 HAR：`homepage.container.config.get` / `newface.stream.*` / `xsd.searchbar.info.get` / `search.request.searchdoor.bgword`（实为 TLog 埋点标识，非接口）；④ 最近 12 个 HAR 中 `enableSearchbarLoopControl`/`enableSearchTextCache` 零出现 | 确认 **ACCS 私有通道，HTTP 层无解** |
| 搜索门首次冷启动残留 | 组件 reject 后旧缓存未立即清 | 第二次冷启动起永久消失（已知现象） |
| 弹窗调度器新广告 | 换活动素材 ID | 清空 ac 的方案对新增广告自动免疫 |

---

## 四、维护指引

### 4.1 新增/更新开屏图规则
```bash
# 1. 导出淘宝沙盒 → 读启动图配置
python3 -c "import plistlib;d=plistlib.load(open('Documents/TBDocuments/bootImageDatas','rb'));[print(k) for k in d]"
# 2. 若新图高度在 1200-1599 → 可能是首页背景, 不要拦!
#    高度 1600+ 且在 gw/heic.alicdn.com → 开屏图, 现有规则已覆盖
# 3. 特殊 ID (如 doudi1111) → 需按 ID 精确加规则
```

### 4.2 新增接口的写法规范（踩过的坑）
```ini
# ✅ 正确: 域名用 (?:acs|guide-acs) —— 淘宝部分请求走 guide-acs!
request if ${url} ~= /^https?:\/\/(?:acs|guide-acs)\.m\.taobao\.com\/gw\/mtop\.xxx/i then reject_dict(200)

# ✅ 带路径的规则必须配 MITM 域名, 否则路径不可见 → 规则静默失效
# ❌ reject_dict(200) 不能加 enable= 子句 → 会让整个 [Rewrite] 段崩溃!
# ❌ 不要用负向断言 (?!...) → Loon 对 lookahead 支持不可靠
```

### 4.3 发布前自检
```bash
# 1. 规则域名 ⊆ MITM 列表
# 2. reject_dict 不带 enable
# 3. bundle.js: node -e "new Function(fs.readFileSync('...bundle.js','utf8'))"
# 4. 函数定义+调用成对 (grep 函数名, 出现次数 ≥2)
# 5. 段位置: request 在 [Rewrite], response 在 [Script]
```
