# 淘宝联盟 App (com.alimama.moon / 淘宝联盟) — 规则说明

> ⚠️ **时效标注（2026-10-24）**：本文档记录至 v3.37.x 时代。v3.40~v3.49 的新增覆盖（天猫开屏/搜索域/弹窗/摇钱树、一淘全案、特价版闪屏、直播营销清洗）见仓库 README 的「近期修复与验证状态」表与 docs/Tmall-LTao-preliminary.md。本文档的历史结论仍有效。


> 插件版本 v3.9.x · App 版本 **9.17.0** · appkey `21683432` · UA `Moon/58886864`
> 架构：Flutter 为主 + 原生壳 + ACCS 推送 · 网关 `acs.m.taobao.com` / `guide-acs.m.taobao.com`

> ⚠️ **淘宝联盟与淘宝主版共用同一套后端接口族**（`mtop.alimama.*` / `mtop.etao.*` / `mtop.alimama.moon.*`），
> 因此大部分规则与 [Taobao.md](Taobao.md) 共用。差异在于：**联盟 App 用 `guide-acs.m.taobao.com`**，
> 且有独立的 `union.*` / `copilot.*` / `exp.shunt` 接口族。

---

## 一、已拦截的广告形态（全部真机验证 ✅）

| # | 广告形态 | 机制 | 接口/资源 | 开关 |
|---|---------|------|-----------|------|
| 1 | **开屏广告**（1242×2208 ProMax / 750×1200）| Rewrite 图片高度 | `gw.alicdn.com/imgextra/*-tps-1242-2208.jpg` 等 | `removeSplashAd` |
| 2 | **批量广告分发**（含开屏位 `open_screen_site`）| Script 按 siteCode 过滤 | `mtop.alimama.union.skyleap.distribution.batchsite` | `removeSplashAd` |
| 3 | **弹窗位** `pop_window_site` | Script 同上 | 同上 | `removePopWindow` |
| 4 | **首页小卡片** `small_handler_*_site` | Script 同上 | 同上 | `removeSmallCards` |
| 5 | **公告位** `bulletin_board_*_site` | Script 同上 | 同上 | `removeSmallCards` |
| 6 | **搜索框推荐词** `searchDomeWord_site` | Script 同上 | 同上 | `removeSmallCards` |
| 7 | **搜索框滚动词** | Script 递归清任意层 `hotwords[]` | `mtop.alimama.moon.provider.metax.homepage.query` | `removeSmallCards` |
| 8 | **私域动态横幅** | Script 递归清任意层 `bannerList[]` | 同上 | `removePrivateDomain` |
| 9 | **首页 Feed 清空** | Script 清 `type=58536_33` 卡片 | 同上 | `removeFeedKeywords` |
| 9 | **NOAH 运营位** | Script + Rewrite | `mtop.etao.noah.query` | `removeNoahOps` |
| 10 | **营销配置** | Rewrite `reject_dict(200)` | `mtop.alimama.etao.config.query` | `removePopWindow` |
| 11 | **私域动态/关注会员** | Script 清 `data` | `mtop.alimama.union.pub.entry` | `removePrivateDomain` |
| 12 | **TAC 搜索推荐** | Script | `mtop.alimama.moon.provider.tac.service.call`/`.smart.call` | `removeTAC` |
| 13 | **AI 搜索 (copilot)** | Rewrite `reject_dict(200)` | `mtop.alimama.union.copilot.api.*` | `removeSmallCards` |
| 14 | **搜索分流** | Rewrite `reject_dict(200)` | `mtop.alimama.union.exp.shunt*` | `removeSmallCards` |
| 15 | ~~**广告位默认配置**~~ **已撤销** | ~~Rewrite `reject_dict(200)`~~ | ~~`mtop.alimama.moon.adzone.default.get`~~ | ~~`removePopWindow`~~ |
| 16 | **阿里妈妈 CPS/顶展追踪** | Rewrite reject | `mtop.alimama.adsdk.customize.cps.track`、`cps.trace.adsdk.send`、`cps.initiativeaction.save`、`union.trace`/`trace2`、`topshow.*` | `blockTracking` |
| 17 | **跑马灯热词** | Script | `mtop.taobao.union.marquee.query` | `removeSmallCards` |

---

## 二、关键机制（逆向发现）

### 2.1 batchsite = 广告位分发中枢
`mtop.alimama.union.skyleap.distribution.batchsite` 返回所有广告位的配置：
```json
{ "batchResult": [
  { "siteCode": "pop_window_site" },
  { "siteCode": "open_screen_site", "siteData": { "img": "https://gw.alicdn.com/...-tps-1242-2208.jpg",
                                               "url": "https://mo.m.taobao.com/union/path_...", "displayTime": "4" } },
  { "siteCode": "small_handler_home_site", "siteData": { "img": "...-tps-314-308.png", "width": "75" } }
] }
```
**siteCode 全表**：`open_screen_site`(开屏) · `pop_window_site`(弹窗) · `small_handler_home_site`/`_share_site`/`_h5_1~3_site`(小卡片) · `bulletin_board_mid_site`/`_report_site`/`_mine_site`(公告) · `searchDomeWord_site`(搜索词)

→ **拦掉此接口 = 开屏/弹窗/小卡片/公告/搜索词 全灭**（比逐张图拦更根本）。

### 2.2 metax = 首页容器（含搜索框词与首页背景）
```json
{ "sectionKey": "moon_home_search_bar_section",
  "fields": { "hotwords": ["猫粮幼猫","马克笔美术专用",...],   ← 搜索框滚动词
              "backgroundImageUrl": "...-tps-750-1200.png" } } ← 首页背景图
```
**注意**：`backgroundImageUrl` 是**正常业务**（首页背景），图片规则**不能**拦 750×1200。

**私域动态横幅**（v3.37.4 定位）：
```
bodyList[5].tabList[0].dataList[0].fields.floorMappingList[0]
  .siteMappingList[0].siteData.bannerList = 23 项
    每项 { id, pic: "...-tps-1404-288.jpg", jumpUrl: "https://mo.m.taobao.com/union2/*" }
```
→ 清理用**全树递归**（`clearMetaxBannerList`），因为路径深度不定（4~6 层）。

> ⚠️ **踩坑 (v3.37.4)**：清理代码依赖 `removePrivateDomain`，但该规则的脚本参数只写了
> `{removeSmallCards, removeFeedKeywords}` → **脚本读不到 key → 清理永不执行**。
> 已在 v3.37.4 补上。**新增/修改规则后必须跑 `tools/check_switch_keys.py`**。

### 2.3 Flutter + ACCS 双通道
```
union-syntax-resource.oss-*.aliyuncs.com/release/.../share_flutter.mirror_*.zip  ← Flutter 资源镜像
union-app.oss-cn-beijing.aliyuncs.com/animation_*.json                        ← 开屏动画配置
tmge.alicdn.com/tmge/v2/3/(null)/iOS/9.17.0_*.json                        ← 营销引擎 TMGE
amdc.m.taobao.com/amdc/mobileDispatch?appkey=21683432                      ← ACCS 调度
```

---

## 三、已知限制

| 限制 | 原因 |
|------|------|
| 开屏**动画**层（lottie）可能残留 | `union-app.oss-*.aliyuncs.com/animation_*.json` 未拦（正常业务共用域名，风险高）|
| 搜索页"一堆"板块 | 部分来自 `mtop.alimama.union.at.landing.entry`(124KB) 与 `pub.entry`(57KB)，未做精细字段过滤 |

---

## 四、维护指引

### 4.1 新活动上线后的更新流程
```bash
# 1. 抓一次冷启动 HAR
# 2. 找 batchsite 响应 → 提取新的 siteCode / img URL
# 3. 若出现新 siteCode → 加入 filterBatchsite 的白名单(要删的)
# 4. 若 img 是新尺寸 → 检查高度: 1600+ 且 gw/heic 域 = 开屏(现有规则已覆盖)
#                   1200-1599 = 首页背景(不要拦!)
# 5. 若出现新图片 ID 且非标准尺寸 → 精确加 ID 规则
```

### 4.2 联盟专属接口族
```
mtop.alimama.union.*      联盟业务 (含广告)
mtop.alimama.moon.*       联盟首页 (metax/tac/grow)
mtop.alimama.etao.*       联盟营销配置
mtop.alimama.copilot.*    AI 搜索
mtop.alimama.union.exp.shunt*  搜索分流
```
新增规则时**务必**用 `(?:acs|guide-acs)\.m\.taobao\.com`（联盟走 guide-acs，v3.36.0 前全部漏网）。

### 4.3 ★ 改完规则必跑自检
```bash
python3 tools/check_switch_keys.py     # 退出码 0 = 通过
```
检查「规则参数 `{${开关}}`」是否覆盖「代码分支里所有 `isEnabled()`」——
key 不匹配时**静默失效、零报错**（v3.37.4/3.37.5 两起事故均因此）。

### 4.4 验证状态
| 版本 | 验证项 | 结果 |
|------|--------|------|
| v3.37.4 | 私域横幅清理 | ✅ HAR 实证 `bannerList=0` `hotwords=0` 无 TANX |
| v3.37.4 | 联盟全量广告扫描 | ✅ 零广告标记 |
| v3.50.2 | 双11会场「去分享」按钮无反应 | ✅ 根因 `adzone.default.get` 被拦, 规则已撤销 |

### 4.5 🔴 事故复盘: adzone.default.get 误拦 (v3.36.0 → v3.50.2)

**现象**：淘宝联盟 App 双11活动页点「去分享」按钮完全无反应（无报错、无弹窗、无跳转）。

**取证**（2026-10-27 HAR，29 条请求）：
- `adzone.default.get` 请求 **16 次，全部返回 2 字节 `{}`**（`reject_dict(200)` 生效）
- 分享链路下游 3 个接口 `xt.biz.default.api.entry` / `tbkurl.shortUrl.generate` / `taobao.union.task.action`
  **一次都没发出** → 链条在第一步就断了

**代码级根因**（`cell-cellx-unionapp-2311-tasklist@0.0.21/seajs/index/m2.js` 反查）：
```js
if (e.material.openShare && e.material.pageId)
  return void ke("mtop.alimama.moon.adzone.default.get", {tag: 29})   // ① 取 pid
    .then(function (t) {
      ke("mtop.alimama.union.xt.biz.default.api.entry",
         {floorId: 35936, refpid: t && t.pid, ...})                    // ② 换推广页 URL
        .then(function (t) {
          ke("mtop.alimama.tbkurl.shortUrl.generate", {url: he(t, "resultList[0].url"), ...})  // ③ 转短链
            .then(function (t) {
              ... location.href = MM_UTIL.getMoonShareUrl({url: n, img: ..., text: ...})       // ④ 唤起分享
            }).catch(function (t) { console.log("gen shortUrl err:", t) })
        }).catch(function (t) { console.log("get pageUrl err:", t) })
    }).catch(function (t) { console.log("get pid err:", t) });          // ← 吞掉一切错误
```
`reject_dict(200)` 返回 `{}` → `t.pid === undefined` → ② 的 `refpid` 传 `undefined`
→ 服务端拒绝 → 一路 `.catch()` **只打 console.log，UI 无任何反馈** → 用户看到「点了没反应」。

**误判来源**：v3.36.0 按接口名把 `adzone`（广告位）当广告拦截。
实际它是**推广位 PID 查询**（返回 `{pid: "mm_xxx_xxx_xxx"}`），是分享/转链的必备前置。

**教训**：
1. 接口名含 `ad`/`adzone`/`promo` **不等于广告** —— 必须看调用方代码或响应结构再定
2. 分享/转链是联盟 App 的**核心功能**（用户靠它赚钱），拦错等于废掉 App 主路径
3. `.catch(function(){})` 静默吞错的前端链路，**「无反应」= 某一步 reject 了**，优先查被拦接口
4. 判据：HAR 里某接口高频重复（16 次）+ 返回 2 字节 `{}` = 插件拦截，不是网络问题

