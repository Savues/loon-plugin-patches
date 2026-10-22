# 淘宝 App (com.taobao.taobao4iphone) — 规则说明

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
| 18 | **埋点/APM/AB 分流** | Rewrite 整域 reject | `gm/log/s-gm/tlog.mmstat.com`、`px.effirst.com`、`abtest.alibaba.com`、`yixiu-abtest.alicdn.com`、`ossgw/hudong.alicdn.com` | `blockTracking` |
| 19 | **影视/O2O/音乐广告** | Rewrite + Script | `mtop.film.mtopadvertiseapi.queryadvertise`、`mtop.o2o.ad.gateway.get`、`mtop.alimusic.common.mobileservice.startinit` | `removePopWindow` |

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

## 三、已知限制

| 限制 | 原因 | 可能解法 |
|------|------|---------|
| **搜索框滚动词** | ACCS 私有 TCP 推送 + 原生 MultiHintq 渲染 + DX 容器模板（改则破坏点击）| 越狱 Hook `TBSearchHintLabel.setHintText` / `TBHomeSearchBarCacheManager.updateSearchItemData` 过滤 `mst_roll_` |
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
