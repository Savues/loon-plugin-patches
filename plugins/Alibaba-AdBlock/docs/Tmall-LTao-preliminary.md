# 天猫 / 特价版 热启动广告逆向预研 (2026-10-24)

> 来源: 二进制字符串审计 (com.taobao.tmall 15.91.0 / com.taobao.special 10.60.33)
> 背景: 淘宝的"切后台回前台全屏广告"已修复 (v3.0.0 + v3.9.3), 天猫/特价版尚未开始 — 此为预研

## 一、天猫热启动闪屏机制 (关键发现)

### 触发链证据
```
splashAdApplicationWillEnterBackground:appInfo:   ← ★ 切后台瞬间预热闪屏广告!
hotStart showingFlash:%@                          ← 热启动时展示 flash
TMNewFlashModel / findCanShowFlashModelWithIsFromCache:  ← 闪屏数据模型 (带缓存!)
TMFlashSkipButton / TMNewFlash_Skip               ← 跳过按钮 (确认是全屏广告形态)
flashEnable / splashViewAutoClose / splashViewTimeout
```

**机制推断**: 天猫在 `applicationWillEnterBackground`(切后台) 时预加载闪屏数据,
回前台 (hotStart) 时若有缓存的 FlashModel 直接展示 → 与淘宝热启动开屏同机制不同实现。
`findCanShowFlashModelWithIsFromCache` 表明**有本地缓存** — 需同时拦 HTTP 数据源 + 关注缓存。

### 数据源 (HTTP 层)
- `mtop.taobao.wireless.home.newface.awesome.get` (天猫二进制唯一 newface 接口, 插件已有规则 ✅)
- `mtop.tmall.rpm.splash.query` (RPM 开屏, 插件已有 ✅)
- noah 面板: 天猫走 `mtop.tmall.tac.gateway.execute` (插件已有响应清洗 ✅)

### 其他天猫闪屏体系 (SQR=汇川广告/HC=穿山甲系?)
- `SQRHuiChuanSplashAd` / `SQRHCSplashADView` — 第三方广告 SDK 汇川
- `HcPreSplashAdn` / `BuSplashAdn` / `MtSplashAdn` — PreSplash(前置闪屏) 体系
- `mtop.tmall.fc.resource.floatingpoint.get` / `popplayer.precheck` — 闪屏浮层资源

## 二、特价版 (LTao) 发现

### 闪屏接口族 (二进制全量, 插件覆盖 0)
```
mtop.taobao.wireless.home.awesome.get            ← awesome 主接口 (非 newface 前缀!)
mtop.taobao.wireless.home.awesome.homepage.recommend
mtop.taobao.wireless.home.awesome.recommend
mtop.taobao.wireless.home.awesome.update
mtop.taobao.wireless.home.morning.newface.get    ← morning 体系
mtop.taobao.wireless.home.newface.morning.awesome.get
mtop.taobao.wireless.home.newface.bottombar.get
mtop.taobao.wireless.home.newface.stream.get/newget   (插件有 newface.stream 前缀 ✅)
```

### 推荐广告族 (Atlas 系)
```
mtop.relationrecommend.mtoprecommend.recommend(stream)
mtop.relationrecommend.newfacerecommend.recommend    ← 10-23 归档: 拦前缀断所有组件广告
mtop.relationrecommend.pailitaorecommend.recommend
mtop.relationrecommend.wirelessrecommend.recommend
```

### 特价版独有广告体系 (10-23 归档印证)
- `LTaoGrowthLAManager` / `LTaoHCRewardADManager` (激励视频)
- `mtop.gaia.tjb.growth.*` (dotask/sendredpacket/synstate — 部分已拦)
- `mtop.ltao.growth.report` (已拦 ✅)
- `HcPreSplashAdn` 同天猫 (PreSplash 体系)

## 三、已预置的规则 (本次 commit)

### [Rewrite] 新增 (天猫/特价版热启动)
- `mtop\.taobao\.wireless\.home\.awesome\.` — 特价版 awesome 全族 (get/update/recommend)
- `mtop\.taobao\.wireless\.home\.morning\.` — morning 体系 (新版开屏)
- `mtop\.taobao\.wireless\.home\.newface\.morning\.` / `newface\.bottombar\.` — 特价版变体
- `mtop\.relationrecommend\.newfacerecommend\.` — 搜索/首页推荐广告
- `mtop\.tmall\.rpm\.(homepage\.bottom\.floatbar|rate\.buyshow|taste\.)` — 天猫 RPM 浮层/购物车秀

### [Rule] 域名级待验证 (不预置, 需抓包确认)

## 四、待抓包验证清单 (正式开发时)

1. **天猫热启动复现**: 切后台 30s → 回前台, 抓 `newface.awesome.get` / `rpm.splash.query` 是否请求
2. **TMNewFlashModel 缓存**: 沙盒找 flash 缓存文件 (参考淘宝 cache_newface_home_main_base 模式)
3. **SQR 汇川 SDK 域名**: 找 SQRHuiChuanSplashAd 的上报/素材域名 (可能非 mtop)
4. **特价版 awesome.get**: 与淘宝 splash.awesome.get 的关系 (同族不同名?)
