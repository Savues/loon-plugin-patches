# Alibaba-AdBlock

> 阿里系 App 通用去广告插件 (Loon)
> **版本 v3.13.0** · 2026-10-22
> 覆盖 **淘宝 / 天猫 / 闲鱼 / 淘宝特价版 / 淘宝直播 / Moon(阿里妈妈) / 盒马 / 飞猪 / 菜鸟**

基于 **5 款 App 解密 IPA 二进制审计 + 20+ 次真机冷启动 HAR + App 私有目录沙盒取证**，
逐条实测验证每个拦截点，非猜测式规则。

---

## 📊 拦截能力总览（全部经真机验证）

| # | 广告形态 | 拦截机制 | 验证状态 |
|---|---------|---------|---------|
| 1 | **埋点 / APM / 实验分流** | 域名级 Reject（6 域名） | ✅ HAR 零穿透 |
| 2 | **广告投放埋点域名** | 域名级 Reject（6 域名） | ✅ |
| 3 | **广告结算 / 追踪 / 曝光** | 12 组 mtop API Reject | ✅ 二进制审计 |
| 4 | **各 App 独有广告通道** | 9 组 mtop API Reject（闲鱼/天猫/特价版/直播差分） | ✅ 二进制审计 |
| 5 | **弹窗调度器**（798 弹窗 / 118 场景） | Script 清洗 `sc`→0 + `cdnId` 改 0 + `url` 破坏 | ✅ HAR 实测 `sc=0` |
| 6 | **弹窗模板**（哈希 JSON） | reject_dict(200) | ✅ HAR `size=2` |
| 7 | **双11摇一摇启动页广告** | 图片 ID reject（doudi1111/1115） | ✅ 沙盒 2 字节空文件 |
| 8 | **热启动切后台广告** | kelee 1080/1125 尺寸规则 | ✅ 沙盒 2 字节空文件 |
| 9 | **启动页活动专用图** | `tps-*-1624` 全屏高规则 | ✅ |
| 10 | **双11氛围皮肤** | `skin.atmosphere.info` Script | ✅ `enable=False` |
| 11 | **首页底栏加补券横幅** | DinamicX campaign 模板 reject | ✅ |
| 12 | **搜索门热榜 / 猜你想搜** | 组件全名子串 reject（覆盖 `ms_*.wlm` 资源包） | ✅ 沙盒无缓存 |
| 13 | **搜索关键词劫持**（1710 条广告） | `spotlightsearch.get` reject | ✅ |
| 14 | **直播 tab 动态标记** | 状态 API reject | ✅ |
| 15 | **橙色配置营销内容** | protobuf 字节级等长清洗 | ✅ 长度不变 JSON 合法 |
| 16 | **搜索框轮播营销词** | — | 🔴 见「已知限制」 |

---

## 📦 安装

### 订阅导入
```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Alibaba-AdBlock/Alibaba-AdBlock.lpx
```
> CDN 缓存约 5 分钟，紧急刷新加 `?cb=<时间戳>`

### 配套插件（可选，实验性）
```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Alibaba-BlockACCS/Alibaba-BlockACCS.lpx
```
阻断 ACCS 推送通道（路由层），用于配合沙盒空词缓存消除搜索框轮播词。

---

## 🔧 开关说明

| 开关 | 默认 | 作用 |
|------|------|------|
| `blockTracking` | ✅ 开 | 埋点 / APM / 实验分流 / AB 配置域名 Reject |
| `removeSplashAd` | ✅ 开 | 开屏广告、热启动广告、双11摇一摇启动页、氛围皮肤、橙色配置营销清洗 |
| `removePopWindow` | ✅ 开 | 弹窗调度器（清空场景映射）+ 弹窗模板 + 运营位接口 |
| `removeSmallCards` | ✅ 开 | 首页小卡片 / 公告栏 / 跑马灯热词 / 搜索门热榜与想搜 |
| `removeNoahOps` | ✅ 开 | NOAH 运营位 |
| `removeTAC` | ✅ 开 | TAC 搜索推荐 |
| `removePrivateDomain` | ✅ 开 | Moon 私域动态 / 关注会员入口 |
| `removeSearchWords` | ⛔ 关 | 搜索框轮播词（DX 模板补丁方案已验证会破坏搜索栏点击，**保持关闭**） |
| `removeFeedKeywords` | ⛔ 关 | Moon 首页 Feed 整体清空 |
| `blockAccs` | ⛔ 关 | 阻断 ACCS 推送通道（核弹级，需配合沙盒空词缓存） |

---

## 🔌 MITM 域名（23 个）

```
acs.m.taobao.com          cn-acs.m.taobao.com       guide-acs.m.taobao.com
acs.m.goofish.com         g-acs.m.goofish.com
acs.m.tmall.com           acs.m.alibaba.com
acs.m.hema.com            acs.m.fliggy.com
poplayer.template.alibaba.com                        弹窗模板 + 调度器
dinamicx.alibabausercontent.com                     DX 容器/组件
heic.alicdn.com           gw.alicdn.com             img.alicdn.com
orange.tbcdn.cn           dorangesource.alicdn.com  橙色配置
gm.mmstat.com             log.mmstat.com            s-gm.mmstat.com
px.effirst.com            abtest.alibaba.com        tlog.mmstat.com
yixiu-abtest.alicdn.com
```
> Loon 会自动按此清单解密，**无需手动信任**。

---

## 🏗️ 架构说明

### 为什么是单文件 `bundle.js`

Loon **不支持 CommonJS `require()`** — 模块化架构会导致脚本**静默失效**（无任何日志）。
因此运行时代码是单文件打包（`src/bundle.js`，60KB），内联全部核心模块 + Moon/淘宝/闲鱼分发逻辑。

> `src/core/` `src/apps/` `src/index.js` 保留了模块化源码作为**可维护性参考**，构建产物为 `src/bundle.js`。

### 主流程分发顺序（重要）

```
main()
 ├─ 搜索栏容器模板 → 整体替换为补丁版（二进制 Uint8Array）
 ├─ orange.tbcdn.cn → protobuf 字节级营销清洗
 ├─ poplayer/popcdn → 弹窗调度器清洗（sc 清空 + cdnId 改 0）
 └─ 域名分发 → handleTaobaoResponse / handleXianyuResponse / handleMoonResponse
```

### 关键实现技巧

| 技巧 | 说明 |
|------|------|
| **字节级等长替换** | 清洗 protobuf/JSON 时保持字节数不变，保证长度前缀有效 |
| **编辑收集法** | 在原串上算出所有 (index, len, newText) 编辑，**从后往前**应用，避免索引错位 |
| **长度中立布尔翻转** | `"false"`(7)→`"true "`(7) · `"true"`(6)→`"fals"`(6) · `false`(5)→`true `(5) |
| **括号配对扫描** | 解析大 JSON 不依赖 `JSON.parse`，避免 350KB body 解析失败 |
| **组件全名子串匹配** | 覆盖 `目录/main.v20.wlm` 与 `ms_<组件名>@<ver>.wlm` 两种资源形式 |

---

## 🧪 真机验证流程

```
1. Loon 订阅更新 → 确认版本号 → 杀 Loon 重启
2. Loon 参数页 → 确认开关状态（默认 7 开 2 关）
3. 清除 App 私有目录 → 冷启动 → 走一遍核心流程
4. Loon 日志确认：出现 [Alibaba-AdBlock] 相关输出
5. 导出 HAR → 验证：埋点域名零出现 / popcdn 响应 sc=0 / 弹窗模板 size=2
```

**判断规则是否真的生效**：
| 现象 | 解读 |
|------|------|
| `popcdn/config.json` 响应 `sc=0 ac=785` | ✅ 调度器已清洗 |
| 弹窗模板 `size=2` | ✅ 模板已拒 |
| 埋点域名零出现 | ✅ Reject 生效 |
| 域名仍在但 `size` 是业务数据 | ❌ 该规则未命中 |

---

## ⚠️ 已知限制：搜索框轮播营销词

**现象**：首页搜索框循环显示「丰臀修身牛仔裤 / 旅行便携式可折叠衣架 / 双汇玉米肠」等营销词。

**根因（三重锁死）**：

| 环节 | 机制 | 可拦截 |
|------|------|--------|
| 数据源 | **ACCS 常驻 keep-alive 连接**（`RangerACCSOfflineCallback`）— 冷启动复用旧连接，既有 TCP 流上的推送 HTTP 代理层完全看不到 | ❌ |
| 落地 | 沙盒 `Documents/TBDocuments/gateway/cache_newface_home_main_base` → `sections[1].content.searchText`（`mst_roll_N` 营销位） | ❌ App 启动即用 ACCS 内存数据重写 |
| 渲染 | 原生 `TBSearchHintLabel` / MultiHintq | ❌ |

**已排除方案（全部实测）**：

| 方案 | 结果 |
|------|------|
| DX 模板字节补丁（v1/v2/v3 三版） | ❌ `content.searchText` 显示绑定**即搜索栏点击载体**，词为空则点击区域失效 |
| reject 容器模板 → 原生 fallback | ❌ 原生同样渲染 ACCS 数据 |
| reject `xsd.searchbar.info.get` / `relationrecommend.*` / `spotlightsearch` | ❌ API 全程零请求（走 ACCS 路径） |
| 橙色配置清洗（`enableSearchTextCache=false`） | ❌ orange 走 Cronet 直连，49 个 HAR 全扫证实配置从不经过 HTTP |
| plist 目录阻挡 | ❌ App 根本不从 plist 取词（已实测：阻挡成功但词仍在） |
| gateway 覆盖空词版 | ❌ 被 ACCS 数据立即重写（已实测） |

**唯一可行路径**：越狱 Hook —
```
-[TBSearchHintLabel setSearchHint:] / setSearchHintLabel:   → 词替换为 @""
-[TBHomeSearchBarCacheManager updateSearchItemData:tabId:] → 过滤 itemBizCode 以 mst_roll_ 开头
```

---

## 🔌 可选：Alibaba-BlockACCS（路由层阻断 ACCS）

```ini
[Rule]
IP-CIDR,59.82.0.0/16,REJECT
IP-CIDR,47.246.0.0/16,REJECT
DOMAIN,amdc.m.taobao.com,REJECT
DOMAIN,amdc.alipay.com,REJECT
```

**ACCS 服务器地址硬编码在 App 二进制**（每次冷启动可能不同）：
```
59.82.31.182  59.82.17.132  59.82.113.219  59.82.113.10
47.246.103.9  47.246.103.10
```
> 全部 1500+ 请求 100% 只跑 `/amdc/mobileDispatch`，按 IP 段阻断不影响其他业务。

**⚠️ 优先级提醒**：Loon 规则优先级为 **本地 > 插件 > 订阅**。
若主配置/订阅已有 `59.82.*` / `47.246.*` 的直连规则，会压过本插件的 REJECT
（表现为部分请求 404 通过、部分 status 0 被拒）。
**最可靠做法**：把同样两行加到**主配置** [Rule] 段最前面。

**副作用**：首页实时更新 / IM 实时消息失效。

---

## 📜 Loon 开发铁律（血泪教训）

| # | 规则 | 事故 |
|---|------|------|
| 1 | **单文件打包**，无 `require()` | 模块化架构 → 脚本静默失效 |
| 2 | `script-path` 必须是完整 HTTPS URL | 相对路径不工作 |
| 3 | `request`/`reject` 只能在 `[Rewrite]`，`response`/`script` 只能在 `[Script]` | 跨段错放**被静默忽略** |
| 4 | **`reject_dict(200)` 不能跟 `enable={}` 子句** | 会让**整个 Rewrite 段失效** |
| 5 | 带**路径**的规则，该域名必须进 `[MITM]` | HTTPS 未解密时路径不可见 → 规则静默失效 |
| 6 | 改 bundle.js 后必须跑：**语法检查 + 函数调用点存在性检查 + 端到端模拟** | 区间替换曾两次冲掉中间函数 |
| 7 | 一条语法错误的规则会**静默杀死整个配置段** | 排查时优先怀疑段内语法 |

---

## 📚 配套文档

- 逆向仓库：`Savues/ios-reverse-engineering` → `Taobao-Ecosystem/`
  - `Common/DEEP_REVERSE_ENGINEERING.md` — 沙盒取证 / 启动广告机制 / 橙色配置开关表
  - `Common/SEARCH_DOMAIN_ANALYSIS.md` — 搜索域专项（轮播词三重锁死完整证据链）
  - `Common/COMPONENT_API_MAP.md` — 组件 → 数据 API 溯源表
  - `Common/APP_SPECIFIC_AD_SYSTEMS.md` — 各 App 独有广告体系
- 逆向资产：`plugins/Alibaba-AdBlock/assets/`（补丁版 DX 容器模板）
