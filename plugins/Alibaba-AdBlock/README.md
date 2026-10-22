# Alibaba-AdBlock · 阿里系 App 通用去广告

> **版本 v3.37.7** · 2026-10-23
> 阿里系 App 去广告插件（淘宝 / 淘宝联盟 / 淘宝直播 / 闲鱼 / 天猫 / 淘宝特价版 / Moon 阿里妈妈）
> 运行环境：Loon (iOS / iPadOS)

---

## 📥 安装

**订阅地址（推荐，CDN 有 5 分钟缓存，加 `?cb=<时间戳>` 强制刷新）**
```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Alibaba-AdBlock/Alibaba-AdBlock.lpx
```

**当前版本直链（无缓存）**
```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/5a845cf/plugins/Alibaba-AdBlock/Alibaba-AdBlock.lpx
```

---

## 📊 插件规模

| 项 | 数量 |
|----|------|
| Rewrite 规则 | **117** |
| Response Script 规则 | **58** |
| MITM 域名 | **24** |
| 开关 | **15** (另 2 个已注释备用: taobaoRemoveLiveAds / taobaoRemoveGuessLike) |
| bundle.js | ~62 KB（单文件） |
| 覆盖 App | 淘宝 · 淘宝联盟 · 淘宝直播 · 闲鱼（已实测）· 天猫 · 淘宝特价版（规则就绪待测）|

---

## 📱 各 App 专项文档

| App | 文档 | 已拦截形态 | 核心机制 |
|-----|------|-----------|---------|
| **淘宝** | [docs/Taobao.md](docs/Taobao.md) | **19 类** | 弹窗调度器 popcdn（793广告/118场景）· 搜索门双实现（Muise组件 + 原生 fallback）· TBBootImage 启动图 · ACCS 推轮播词 |
| **淘宝联盟** | [docs/AlibabaUnion.md](docs/AlibabaUnion.md) | **17 类** | **batchsite 广告位分发中枢**（开屏/弹窗/小卡片/公告/搜索词全在一接口）· metax 搜索框词+首页背景 · Flutter+ACCS 双通道 |
| **淘宝直播** | [docs/TaobaoLive.md](docs/TaobaoLive.md) | **20 类** | 三板块同接口（`userFootPrint` 与 `tabs` **同级**）· skylar_hummer 浮层体系（219模板）· 青少年模式=纯本地机制不可拦 |
| **闲鱼** | [docs/Xianyu.md](docs/Xianyu.md) | **29 类** | 联想与"猜你可能在找"同源冲突三条硬约束 · Flutter idle_search 603 组件 · 清空必须等同 kelee 的 `{}` |

---

## 🎛️ 开关清单（17 个）

### 全局
| 开关 | 默认 | 作用 |
|------|------|------|
| `blockTracking` | ✅ 开 | 埋点/APM/AB 分流整域拦截 |
| `removeSplashAd` | ✅ 开 | 开屏广告（图片/视频/摇一摇）|
| `removePopWindow` | ✅ 开 | 弹窗广告（调度器/模板/氛围）|
| `removeSmallCards` | ✅ 开 | 小卡片/公告/推荐词/搜索门 |
| `removeNoahOps` | ✅ 开 | NOAH 运营位 |
| `removeTAC` | ✅ 开 | TAC 搜索推荐 |
| `removeSearchWords` | ⛔ 关 | 搜索框轮播词（**已废弃**，仅历史标记；实际由容器模板 reject 实现，见下方警告）|
| `removeFeedKeywords` | ⛔ 关 | Moon 首页 Feed 清空 |
| `removePrivateDomain` | ✅ 开 | 私域动态/关注会员 |

### 淘宝联盟 / Moon
| 开关 | 默认 | 作用 |
|------|------|------|
| `fishRemoveSplash` | ✅ 开 | 闲鱼开屏 + ADX 竞价 + 游戏 IAA |
| `fishRemovePopup` | ✅ 开 | 闲鱼弹窗浮层/策略位/推荐位/购买Feed/鱼池弹窗 |
| `fishRemoveHomeAds` | ✅ 开 | 闲鱼首页广告位（9 个接口）|
| `fishRemoveSearchAds` | ✅ 开 | 闲鱼搜索广告/热搜/猜你可能在找 |
| `fishRemoveMyPage` | ✅ 开 | 闲鱼我的页面/交易详情 |

### 淘宝直播
| 开关 | 默认 | 作用 |
|------|------|------|
| `liveRemoveAds` | ✅ 开 | 直播搜索三板块/信息流广告/浮层/增长位/弹窗推荐 |

### 实验性（默认关，谨慎开启）
| 开关 | 默认 | 作用 | ⚠️ |
|------|------|------|---|
> ⚠️ **关于 `removeSearchWords`（已废弃）**：v3.9.10 起用「拒绝搜索栏容器模板 → 走原生 fallback」实现，**该规则无条件生效，与本开关无关**。
> 早期 v3.19~v3.23 的 DX 模板字节补丁方案已废弃（实测会破坏搜索框点击：轮播词 Text 组件即点击载体），
> 相关代码与资源已从 bundle.js / assets 中移除。淘宝搜索框滚动词确认 HTTP 层无解
> （ACCS 私有 TCP 推送 + 原生 MultiHintq 渲染 + DX 容器三者耦合），需越狱 Hook 才可根治。

---

## 🌐 MITM 域名（24 个）

```
abtest.alibaba.com            acs.m.alibaba.com          acs.m.fliggy.com
acs.m.goofish.com             acs.m.hema.com             acs.m.taobao.com
acs.m.tmall.com               cn-acs.m.taobao.com        dinamicx.alibabausercontent.com
dorangesource.alicdn.com      g-acs.m.goofish.com        g.alicdn.com
gm.mmstat.com                 guide-acs.m.taobao.com      gw.alicdn.com
heic.alicdn.com               img.alicdn.com             log.mmstat.com
orange.tbcdn.cn               poplayer.template.alibaba.com  px.effirst.com
s-gm.mmstat.com               tlog.mmstat.com            yixiu-abtest.alicdn.com
```

> 📌 `g.alicdn.com` 是搜索门 Muise 组件主 CDN（v3.9.27 补入）—— 缺它则搜索门拦截全部失效。
> `guide-acs.m.taobao.com` 是淘宝/联盟部分请求的网关（v3.36.0 补入）—— 缺它则 38 条规则全漏网。

> ⚠️ **带路径的规则必须配 MITM 域名**，否则 Loon 看不到 URL 路径 → 规则静默失效。
> 历史上因此踩坑两次：`orange.tbcdn.cn`（v3.9.20 修）、`g.alicdn.com`（v3.9.27 修）。

---

## 🏗️ 架构

### 为什么是单文件 bundle.js
Loon **不支持 CommonJS `require()`** → 模块化架构静默失效（脚本完全不执行）。
源码按 `core/` + `apps/` + `index.js` 分层维护，构建时**打包内联**为单文件 `src/bundle.js`（60KB）。

### 目录
```
plugins/Alibaba-AdBlock/
├── Alibaba-AdBlock.lpx     # 插件清单（MITM/Argument/Script/Rewrite/Task）
├── README.md               # 本文件
├── docs/                   # 各 App 专项维护文档
│   ├── Taobao.md  AlibabaUnion.md  TaobaoLive.md  Xianyu.md
├── assets/                 # 补丁用二进制资源（如搜索栏容器模板）
├── src/
│   ├── bundle.js           # ← 实际加载的单文件脚本
│   ├── core/               # 核心模块源码（构建输入）
│   ├── apps/               # 各 App 业务模块源码
│   └── index.js            # 入口
└── configs/                # 配置
```

### main() 分发顺序（重要）
```
1. 搜索栏容器模板（二进制，parse 之前处理）
2. 橙色配置营销清洗（protobuf 字节级）
3. 淘宝直播搜索域（搜索发现/热卖榜/遮罩词）
4. 淘宝直播信息流广告
5. 弹窗调度器 popcdn（bundle.js 内处理）
6. ★ Moon 系接口优先 → handleMoonResponse
   (mtop.alimama./etao./alimusic./taobao.union./tmall.tac./tmall.jiuxi.)
7. 淘宝系 → handleTaobaoResponse
8. 闲鱼系 → handleXianyuResponse
9. 其他 → handleMoonResponse
```

> **v3.37.0 修复**：第 5 步是新增的。淘宝联盟 App 走 `guide-acs.m.taobao.com`，
> 原先被判为"淘宝系"先进 handleTaobaoResponse → 而它无 metax 分支 → 搜索框词从未被清理。

---

## 🔧 5 项关键实现技巧

### 1. 字节级等长替换（protobuf / 长度前缀）
橙色配置是 protobuf 内嵌 JSON，改字段必须**保持字节长度不变**，否则长度前缀失效。
```js
latin1String ↔ Uint8Array  // 无损互转
"false"(7) → "true "(7)     // 字符串布尔翻转
URL → 同长度 'x' 填充        // 指向不存在资源
```

### 2. 编辑收集法（避免索引失效）
逐个 `indexOf` 替换会改变串结构导致后续 key 匹配失效 → 在**原串**上算出所有 (index, oldLen, newText) 编辑，**从后往前**应用。

### 3. 长度中立布尔翻转
```
字符串形式:  "false"(7) → "true "(7)  |  "true"(6) → "fals"(6)
布尔形式:    false(5)   → "true "(5)  |  true(4)  → 跳过(null 会让 NSNull.boolValue 崩溃)
```

### 4. 括号配对扫描（不依赖 JSON.parse）
popcdn 调度器 350KB，`JSON.parse` 失败时用括号配对定位 `"ac"` 段；被截断时输出最小合法空调度（31 字节）。

### 5. 组件全名子串匹配
搜索门组件有两种资源形式：
```
g.alicdn.com/tb-webb-widget-cloud/search_door_trending_nine_square_gridList/...   ← 目录形式
ms_tb-webb-widget-cloud_search_door_trending_nine_square_gridList@0.0.40.wlm   ← 合并包形式
```
→ 规则用**完整组件名子串**（`/search_door_trending_nine_square_gridList/i`），两种都覆盖。

---

## 📅 近期修复与验证状态（2026-10-23）

| 版本 | 内容 | 验证 |
|------|------|------|
| v3.37.3 |  数组形态兼容（**所有 Script 规则此前全部失效**）| ✅ |
| v3.37.4 | 联盟 metax 规则补 （私域横幅）| ✅ HAR: bannerList=0 无 TANX |
| v3.37.5 | 闲鱼 7 处「规则开关 ↔ 代码判断」不匹配 | ✅ HAR: idle.user.strategy.list 35858B→2B |
| v3.37.6 | 直播首页视频流广告（livexshow.homepage.*）| ✅ HAR: adType 8/24→0 |
| v3.37.7 | 直播推荐视频流广告（livexshow.recommend.slide.lives）| ✅ 74033→29784B |
| tools |  规则自检 | ✅ 58 条规则 0 缺口 |

**当前状态**：闲鱼 ✅ 全绿 · 淘宝联盟 ✅ 全绿 · 淘宝直播 ⏸ 已覆盖 23 形态（界面广告多，暂停）· 淘宝主 App ⚠️ 待回归 · 天猫/特价版 ⏳ 未测

---

## ⚠️ Loon 开发铁律（血泪教训）

| # | 规则 | 事故 |
|---|------|------|
| 1 | **带路径的规则必须配 MITM 域名** | orange.tbcdn.cn / g.alicdn.com 各一次，规则静默失效 |
| 2 | **`reject_dict(200)` 不能带 `enable=` 子句** | v3.5.0 一次让**整个 `[Rewrite]` 段崩溃**（含之前正常的 tracking 拦截）|
| 3 | **Loon 不支持负向断言 `(?!...)`** | 改用显式列举 `(?:discover\|guidehotlist\|shadingwords)` |
| 4 | **淘宝/联盟请求走 `guide-acs.m.taobao.com`** | v3.36.0 前 38 条规则全部漏网 |
| 5 | **清空语义 = 整体返回 `{}`** | 保留 `ret` 仅清 `data` → App 解析路径不同，行为异常 |
| 6 | **脚本必须单文件** | Loon 不支持 `require()` → 模块化静默失效 |
| 7 | **规则域名用 `(?:acs\|guide-acs)`** | 见第 4 条 |
| 8 | **`[Script]` 段内不能放 Rewrite 动作**（反之亦然）| 跨段错放被静默忽略 |
| 9 | **改 bundle.js 后必做调用点检查** | 区间替换曾把 `scrubPopcdnSchedule` 函数冲掉 → 脚本整体失效 |
| 10 | **★ 规则参数必须覆盖代码里所有 `isEnabled()` key** | v3.37.4/3.37.5 两起事故：规则传 `fishRemovePopup`，代码判 `removePopWindow` → **过滤器静默不执行**。必跑 `tools/check_switch_keys.py` |
| 11 | **★ `$argument` 可能是数组形态 `[{...}]`** | v3.37.3：`$argument[key]` 直接取值恒 undefined → 所有 Script 规则失效。`isEnabled` 需兼容 Array/Object 两形态 |

---

## 🧪 验证流程

### 标准测试步骤
```
1. 订阅更新 → 确认版本号 → 杀 Loon 重启
2. 清除目标 App 私有目录（沙盒逃逸工具）—— 关键！不清则旧缓存/组件仍在
3. 冷启动 → 走一遍: 首页 / 搜索页 / 我的 / 直播(如适用)
4. 导出 HAR + Loon 日志
```

### 判断规则是否真的生效
| 观察 | 结论 |
|------|------|
| HAR 中目标接口 `size=2` | ✅ Rewrite reject 生效 |
| HAR 中目标接口体积明显变小 | ✅ Script 清理生效 |
| HAR 中目标接口 **零出现** | ⚠️ 走了 Cronet/ACCS/Flutter 通道，HTTP 规则无效 |
| 接口 `size` 正常但功能仍在 | ⚠️ 有原生 fallback 或本地缓存 |

### 已知环境限制
| 现象 | 原因 | 解决 |
|------|------|------|
| **闲鱼消息页打不开** | Loon 抓包 = 「MitM 额外主机名」全量 MITM → 打断 `sealine.youku.com`/`dypnsapi-*.aliyuncs.com` 推送长连接 | **验证消息功能请关闭抓包**（插件规则不受影响）|
| 首次冷启动后旧浮层仍在 | 组件/数据有本地缓存 | 清 App 私有目录；第二次冷启动起消失 |
| 搜索门首次冷启动残留 | 同上 | 同上 |

---

## 📖 各 App 广告形态速查

### 淘宝（19 类 ✅）
弹窗调度器(793广告) · 弹窗模板 · 搜索门热榜九宫格 · 搜索门文字列表 · 搜索门猜你想搜 · 搜索门数据API · 搜索门原生数据源 · 开屏视频 · 开屏图片(双11摇一摇) · 热启动切后台广告 · 双11氛围皮肤 · 首页加载氛围 · 搜索框跑马灯 · NOAH运营位 · TAC搜索推荐 · 搜索关键词劫持(1710条) · 阿里橙配营销清洗 · 埋点/APM/AB分流 · 影视/O2O/音乐广告

### 淘宝联盟（17 类 ✅）
开屏广告(1242×2208/750×1200) · 批量广告分发(含开屏位) · 弹窗位 · 首页小卡片 · 公告位 · 搜索框推荐词 · **搜索框滚动词** · 首页Feed清空 · NOAH运营位 · 营销配置 · 私域动态 · TAC搜索推荐 · AI搜索(copilot) · 搜索分流 · 广告位默认配置 · 阿里妈妈CPS/顶展追踪 · 跑马灯热词

### 淘宝直播（20 类 ✅）
搜索发现 · 直播热卖榜 · 足迹补贴 · 搜索框遮罩词 · 信息流广告(AdFeed) · 搜索氛围 · 直播间弹窗推荐 · 增长弹窗 · 增长查询 · 增长广告位 · 营销浮层体系(219模板) · 广告位配置 · 广告策略配置 · 视频广告 · 第三方广告上报 · 礼物浮层 · 开屏资源 · 直播氛围 · 云袭广告监测平台(6域) · 阿里妈妈广告追踪

### 闲鱼（29 类 ✅）
开屏广告 · 异步开屏 · 开屏配置 · ADX竞价 · 游戏IAA · 用户策略 · 策略获取 · 商品推荐位 · 附近角落位 · 购买Feed · 搜索广告/热搜/猜你可能在找 · 搜索发现 · 搜索激活/热搜词卡 · 搜索遮罩词 · 首页主Feed · Widget刷新 · 鲸鱼模块 · 社区 · 新商品页 · 本地流量位 · 本地顶部 · 本地首页 · 我的页面 · 交易详情 · 圈子列表 · 魔法首页 · 关注Feed流 · 闲鱼广告上报 · 鱼池弹窗 · 直播广告素材 · 启动上报

---

## 🔧 维护指引

### 新活动上线后如何更新
```bash
# 1. 抓一次冷启动 HAR
# 2. 找广告位分发接口 → 提取新 siteCode / 图片 URL
#    淘宝/联盟: mtop.alimama.union.skyleap.distribution.batchsite
#    淘宝/直播: poplayer.template.alibaba.com/popcdn/*/config.json
# 3. 判别图片性质:
#    高度 1600+ 且 gw/heic 域  → 开屏图 (现有规则已覆盖)
#    高度 1200-1599             → 首页背景 (正常业务, 不要拦!)
#    img.alicdn.com 域         → 多为首页背景 (不要拦!)
# 4. 特殊 ID (如 doudi1111) → 需按 ID 精确加规则
# 5. 读取沙盒启动图配置核对:
#    Documents/TBDocuments/bootImageDatas (plist: URL→文件名)
```

### 禁止加入拦截的功能接口（会破坏功能）
```
mtop.iliad.interact.sendgift / chat.query / task.trigger / reward.createrechargeorder
mtop.taobao.iliad.comment.publish / share.item.*
mtop.tblive.live.follow.relation.add
mtop.taobao.livex.vinteract.product.video.getUploadConfig
mtop.taobao.wsearch.suggest                (打字联想)
mtop.alimama.union.copilot.* 的功能部分
```

### 发布前自检清单
```bash
# 1. 规则引用的域名 ⊆ MITM 列表
# 2. reject_dict 不带 enable=
# 3. bundle.js 语法
node -e "new Function(require('fs').readFileSync('src/bundle.js','utf8'))"
# 4. 函数定义+调用成对 (出现次数 ≥2)
grep -c "function scrubPopcdnSchedule" src/bundle.js   # 应为 1
grep -c "scrubPopcdnSchedule(" src/bundle.js           # 应为 2
# 5. 段位置: request 在 [Rewrite], response 在 [Script]
# 6. ★ 规则开关自检 (v3.37.4/5 事故后必跑)
python3 tools/check_switch_keys.py     # 退出码 0 = 通过
# 7. 版本号 +1
```

---

## 🔗 关联资源

| 资源 | 位置 |
|------|------|
| 逆向分析（机制/沙盒取证）| `Savues/ios-reverse-engineering` → `Taobao-Ecosystem/` |
| 插件源码与文档 | 本仓库 `plugins/Alibaba-AdBlock/` |
| 淘宝开屏文件改造包 | 本仓库 `fix-out/Taobao_OVERWRITE/` |
| ACCS 阻断独立插件 | 本仓库 `plugins/Alibaba-BlockACCS/` |

---

## 📄 许可

MIT
