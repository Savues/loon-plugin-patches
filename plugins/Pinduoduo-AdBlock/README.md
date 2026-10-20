# Pinduoduo-AdBlock · 拼多多去广告 v2.0.0

> **安全模式优先**：字段级删除 > 整体 Stub，高危开关默认关，一键风控模式。覆盖首页/信息流/搜索/百亿补贴/扫码页/个人中心/订单页广告与埋点拦截。

**v2.0.0** · 2026-10-20 · 基于 PDD 8.28.0 反编译 + 真机 HAR 分析 · 14 项配置 / 13 条 Script 规则 / 11 域名 MITM

---

## 订阅地址

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Pinduoduo-AdBlock/Pinduoduo-AdBlock.lpx
```

> ⚠️ CDN 缓存约 5 分钟。强制刷新：订阅地址加 `?cb=时间戳`

---

## 为什么要重写 (v2.0.0)

旧版 `PinDuoDuo` (v1.75) 存在以下根本性问题：

| 问题 | 风险 | v2.0.0 解决 |
|------|------|-------------|
| **20 条 `[Rewrite] reject-dict` 无开关** | 全量改写响应体，触发风控限流 | 全部迁移至 `[Script]`，字段级删除 |
| **`telemetry_stub` 假开关** (`enable=` 在 `[Rule]` 无效) | 用户以为关了，实际持续拦截 8 域名 | 改用 Script 方案，仅拦上报路径，放行配置下发 |
| **`api_stub` 默认开 + 13 端点整体 `{}`** | 返回空对象极易被风控识别 | **默认关**，改为字段级删除 |
| **`order_stub` 默认开 + 清空订单列表** | 功能性破坏 | **默认关**，仅删推广字段 |
| **`xg.pinduoduo.com` 被 REJECT** | 断开 WebSocket 推送，聊天刷不出 | **绝不拦截** `xg` 域名 |
| **无信息流广告拦截** | 核心浏览体验无保护 | 新增 `data.ad` 字段识别，精准过滤 |
| **无开屏/启动广告拦截** | 每次冷启动必看 | 架构已就绪，待 HAR 补充端点 |
| **模块化 require() 不兼容 Loon** | 脚本完全不执行 | **单文件 bundle.js**，零依赖 |

---

## 开关总览 (全部在 Loon 参数页调整)

### 🛡️ 全局安全
| 开关 | 默认 | 说明 |
|------|------|------|
| `riskControlMode` | **关** | **一键风控模式**：开启后插件完全放行，仅保留日志。遇到限流/功能异常时立即开启恢复。 |

### 🏠 首页去广告
| 开关 | 默认 | 说明 |
|------|------|------|
| `removeHomepageAds` | 开 | 首页去广告总开关 |
| `removeIconSet` | 开 | 删除 13 个营销活动图标 (限时秒杀、9块9、现金大转盘、免费领礼物等) |
| `removeSearchHotQuery` | 开 | 清空搜索框热词 (首页下发 20 条 + 百亿补贴页 + `/search_hotquery` 轮询) |
| `removeTopOptsImages` | 开 | 去除顶部标签图片 (仅删 `image/selected_image`，保留结构) |

### 🏠 底栏自定义
| 开关 | 默认 | 说明 |
|------|------|------|
| `bottomCustom` | 开 | 总开关，关则保持服务端原样 (5 项) |
| `Bot_index` | 开 | 首页 |
| `Bot_chat` | 开 | 聊天 |
| `Bot_personal` | 开 | 个人中心 |
| `Bot_live` | 关 | 多多视频 |
| `Bot_class` | 关 | 分类 |
| `Bot_attendance` | 关 | 签到/提前优惠 (带推广参数) |
| `Bot_custom` | 空 | 自定义项，逗号分隔，按 link 包含匹配 |

> 顺序跟随服务端下发。全不选时回落 首页/聊天/我的。

### 📱 信息流广告
| 开关 | 默认 | 说明 |
|------|------|------|
| `removeFeedAds` | **开** | **核心功能**：识别 `goods_list[i].data.ad` 字段 (`bkfl=1`, `ad_id`, `openinfo.ads_from=0`)，仅移除广告项，**保留分页结构 `has_more`/`refresh_strategy`** |

### 🔍 搜索/推荐去广告
| 开关 | 默认 | 说明 |
|------|------|------|
| `removeSearchPromos` | 开 | 清空 `/api/polemon/gbdbpdc` 推荐词、`/search_hotquery` 热词、`/search` 的 `expansion` 字段 |

### 👤 个人中心 / 📦 订单页
| 开关 | 默认 | 说明 |
|------|------|------|
| `removePersonalAds` | 开 | 删月卡入口、banner、icon_set 等 |
| `removeOrderPromos` | **关** | ⚠️**默认关**！仅删订单详情/列表中的推广字段 (goods_list、order_growth_tip、marketing_banner_vo 等)，**不 stub 整响应** |

### 📷 特殊页面
| 开关 | 默认 | 说明 |
|------|------|------|
| `removeScanPageAds` | 开 | 扫码取件页：替换 webpack chunk 移除商品推荐模块 (53203、27519) |
| `removeSubsidyAds` | 开 | 百亿补贴页：复用 `removeSearchHotQuery`，清空 `queryWords` |

### 📊 埋点/遥测
| 开关 | 默认 | 说明 |
|------|------|------|
| `blockTracking` | **关** | ⚠️**默认关**！仅拦截上报路径：`/t.gif`、`/api/pmm/defined`、`/api/pmm/front_err` 等。**放行配置下发**：`/api/one-gateway-client/zone/v1/component/fetch`、`/api/app/v2/experiment` 等。 |

---

## 核心技术设计

### 1. 字段级删除 > 整体 Stub
```javascript
// ❌ 旧版：高风险
$done({ status: 200, body: '{}' });

// ✅ 新版：低风险
delete response.data.ad_slots;
delete response.result.icon_set[marketing_ids];
$done({ body: JSON.stringify(response) });
```

### 2. 信息流广告精准识别
基于 HAR 实测特征：
```json
// 广告项特征
{
  "data": {
    "ad": {
      "bkfl": 1,
      "openinfo": { "ads_from": 0, "ad_id": 9960611785 },
      "pubinfo": "...",
      "nbid": "...",
      "mark": "...",
      "search_id": "..."
    },
    "goods_id": 986239412877,
    "goods_name": "绿箭无糖口香糖..."
  }
}
```
→ 仅过滤含 `data.ad` 且 `bkfl=1`/`ads_from=0` 的数组项。

### 3. 埋点拦截分类
| 域名/路径 | 动作 | 理由 |
|-----------|------|------|
| `th-a.pinduoduo.com/t.gif` | **拦截** | 纯上报像素 |
| `apm.pinduoduo.com/api/pmm/defined` | **拦截** | 性能监控上报 |
| `apm.pinduoduo.com/api/pmm/front_err` | **拦截** | 前端错误上报 |
| `meta.pinduoduo.com/api/one-gateway-client/zone/v1/component/fetch` | **放行** | AB 实验/配置下发 (37KB 真实数据) |
| `xg.pinduoduo.com/ngrtt/zqog` (101 WebSocket) | **绝不拦截** | 消息推送长连接 |
| `xg.pinduoduo.com/api/phantom/_stm` | **放行** | 风控模块，拦截可能触发限制 |

### 4. 单文件打包架构
```
src/bundle.js (15KB)  ← 单文件，内联所有模块
├── 核心工具 (isEnabled, safeParse, log)
├── 首页 Hub 过滤 (icon_set, search_bar_hot_query, all_top_opts, bottom_tabs)
├── 信息流广告过滤 (data.ad 识别)
├── 搜索推荐词过滤 (polemon, search_hotquery, search)
├── 埋点拦截 (上报 vs 配置下发分离)
├── 百亿补贴页 (HTML 替换 queryWords)
├── 扫码取件页 (chunk 替换)
├── 个人中心清理
├── 订单页清理 (仅推广字段)
└── 统一路由入口
```

---

## 安装与验证

### 必须步骤
1. **导入订阅** → Loon 插件列表显示 `v2.0.0`
2. **开关配置** → 确认下表状态：
   | 开关 | 建议状态 |
   |------|----------|
   | `riskControlMode` | **关** |
   | `removeHomepageAds` | **开** |
   | `removeFeedAds` | **开** |
   | `removeSearchPromos` | **开** |
   | `removeOrderPromos` | **关** (如需订单页去推广可开) |
   | `blockTracking` | **关** (如需隐私保护可开) |
3. **MITM 证书** → Loon 设置 → HTTPS 解密 → 所有 `pinduoduo.com` 域名 **绿色**
4. **完全重启** → 杀掉拼多多 App → 关闭 Loon → 重开 Loon → 冷启动拼多多

### 验证清单 (Loon 脚本日志应出现)
```
[Pinduoduo-AdBlock] Removed 5 marketing icons from icon_set
[Pinduoduo-AdBlock] Cleared search_bar_hot_query
[Pinduoduo-AdBlock] Stripped images from all_top_opts
[Pinduoduo-AdBlock] Customized bottom tabs: ["index.html","chat_list.html","personal.html"]
[Pinduoduo-AdBlock] Filtered 3/10 feed ads
[Pinduoduo-AdBlock] Cleared search hot query data
[Pinduoduo-AdBlock] Blocked tracking report: https://th-a.pinduoduo.com/t.gif
[Pinduoduo-AdBlock] Allow tracking config path: https://meta.pinduoduo.com/api/one-gateway-client/zone/v1/component/fetch
```

---

## 已知限制

| 项 | 说明 |
|------|------|
| **开屏/启动广告** | 尚未在 HAR 中观测到端点，需补充冷启动抓包 |
| **直播间/多多视频广告** | `PDDLiveScene.bundle` 相关接口未分析 |
| **商品详情页推广** | `caterham/v2/query/goods_detail_with_tags` 仅在订单页开关下处理 |
| **Chunk 版本漂移** | 官方 chunk 更新时需手动更新 `src/chunks/9410-*.js` |
| **基线单一** | 结论基于单设备 (iPad/8.28.0) 一次会话，不同版本/地区可能差异 |

---

## 致谢

- **walala (怎么肥事)** — 规则原作者
- **ZenmoFeiShi** — Quantumult X 片段维护
- **可莉** — Loon 清单打包与托管
- **用户** — 提供解密 IPA、基线 HAR、风控实测反馈

---

## 更新日志

### v2.0.0 (2026-10-20)
- 🔄 **完全重写**：单文件 bundle.js，解决 Loon require() 不兼容
- 🛡️ **安全模式**：字段级删除、高危开关默认关、一键风控模式
- 🎯 **新增信息流广告过滤**：`data.ad` 字段精准识别
- 📊 **埋点拦截重构**：Script 方案替代失效的 Rule enable=，区分上报/配置下发
- ❌ **移除风控隐患**：不再拦截 `xg.pinduoduo.com` (WebSocket)，不再 stub 整响应
- 📦 **新增页面覆盖**：百亿补贴页、扫码取件页、个人中心、订单页
- ⚙️ **14 项精细开关**：全在参数页可调，无需改文件

---

## 对比：旧版 PinDuoDuo vs 新版 Pinduoduo-AdBlock

| 维度 | PinDuoDuo v1.75 | Pinduoduo-AdBlock v2.0.0 |
|------|-----------------|--------------------------|
| 架构 | 多脚本 + Rewrite | 单文件 Script only |
| Loon 兼容 | ❌ require() 失效 | ✅ 单文件零依赖 |
| 信息流广告 | ❌ 无 | ✅ 精准过滤 |
| 开屏广告 | ❌ 无 | 🔄 待端点补充 |
| 埋点拦截 | ❌ 假开关失效 | ✅ Script 真生效 |
| 高危默认 | 全开 (易风控) | 核心开、高危关 |
| 紧急恢复 | 无 | ✅ 一键风控模式 |
| 订单页 | 清空列表 | 仅删推广字段 |
| 底栏自定义 | 写死 3 项 | 7 项可选 + 自定义 |
| MITM 域名 | 2 个 | 11 个 (含埋点域名) |