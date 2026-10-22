# 淘宝联盟 App (com.alimama.moon / 淘宝联盟) — 规则说明

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
| 7 | **搜索框滚动词** | Script 递归清 `fields.hotwords[]` | `mtop.alimama.moon.provider.metax.homepage.query` | `removeSmallCards` |
| 8 | **首页 Feed 清空** | Script 清 `type=58536_33` 卡片 | 同上 | `removeFeedKeywords` |
| 9 | **NOAH 运营位** | Script + Rewrite | `mtop.etao.noah.query` | `removeNoahOps` |
| 10 | **营销配置** | Rewrite `reject_dict(200)` | `mtop.alimama.etao.config.query` | `removePopWindow` |
| 11 | **私域动态/关注会员** | Script 清 `data` | `mtop.alimama.union.pub.entry` | `removePrivateDomain` |
| 12 | **TAC 搜索推荐** | Script | `mtop.alimama.moon.provider.tac.service.call`/`.smart.call` | `removeTAC` |
| 13 | **AI 搜索 (copilot)** | Rewrite `reject_dict(200)` | `mtop.alimama.union.copilot.api.*` | `removeSmallCards` |
| 14 | **搜索分流** | Rewrite `reject_dict(200)` | `mtop.alimama.union.exp.shunt*` | `removeSmallCards` |
| 15 | **广告位默认配置** | Rewrite `reject_dict(200)` | `mtop.alimama.moon.adzone.default.get` | `removePopWindow` |
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
