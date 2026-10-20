# Alibaba-AdBlock

> 阿里系 App 通用去广告插件  
> 支持 **Moon (阿里妈妈/淘宝联盟)、淘宝、天猫、闲鱼、盒马、飞猪、阿里巴巴(1688)、菜鸟裹裹、阿里妈妈商家版** 等  
> 核心能力：**开屏/弹窗/小卡片/Feed/搜索推荐/跑马灯/TAC/NOAH/私域动态/埋点/APM/实验分流** 全拦截  
> 基于真机抓包逆向，按接口字段分类过滤，**核心模块复用率 80%+**，不误伤正常业务。

---

## ✨ 核心特性

| 广告类型 | 接口 | 关键特征 | 适用 App | 开关 |
|---------|------|----------|----------|------|
| **开屏广告** | `mtop.alimama.union.skyleap.distribution.batchsite` | `siteCode=open_screen_site` | Moon/淘宝/天猫/闲鱼 | `removeSplashAd` |
| **弹窗广告** | 同上 | `siteCode=pop_window_site` | Moon/淘宝/天猫/闲鱼 | `removePopWindow` |
| **首页小卡片** | 同上 | `siteCode=small_handler_*` | Moon/淘宝/天猫/闲鱼 | `removeSmallCards` |
| **公告栏/通知** | 同上 | `siteCode=bulletin_board_*` | Moon/淘宝/天猫/闲鱼 | `removeSmallCards` |
| **搜索词推荐** | 同上 | `siteCode=searchDomeWord_site` | Moon/淘宝/天猫/闲鱼 | `removeSmallCards` |
| **搜索框跑马灯** | `mtop.taobao.union.marquee.query` | `data.result[]` | 全系 | `removeSmallCards` |
| **TAC 搜索推荐** | `mtop.alimama.moon.provider.tac.service.call/smart.call` | `data[].word` / `data.wordList[]` | 全系 | `removeTAC` |
| **NOAH 运营位** | `mtop.etao.noah.query` | `resKey` 黑名单 | Moon/淘宝/天猫 | `removeNoahOps` |
| **首页搜索栏热词** | `metax.homepage.query` | `headerList[].fields.hotwords[]` | Moon/淘宝/天猫 | `removeSmallCards` |
| **首页 Feed 清空** | `metax.homepage.query` | `bodyList[].fields.newsList.recommend.resultList[]` | Moon | `removeFeedKeywords` |
| **私域动态/关注会员** | `union.pub.entry` | `followMembers.resultList[]` | Moon | `removePrivateDomain` |
| **埋点/错误上报** | `gm.mmstat.com` / `log.mmstat.com` | — | 全系 | `blockTracking` |
| **APM/JS错误/实验分流** | `px.effirst.com` / `abtest.alibaba.com` | — | 全系 | `blockTracking` |

> **核心优势**：所有广告位通过**共享接口**下发，按字段分类过滤。核心模块复用率 80%+，新增 App 只需配置差异字段。

---

## 📦 安装方式

### Loon 订阅导入
```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Alibaba-AdBlock/Alibaba-AdBlock.lpx
```

> ⚠️ CDN 缓存约 5 分钟，更新后可加 `?cb=时间戳` 强制刷新。

### MITM 配置（必需）
插件自带 `[MITM]` 段，导入后需在 Loon 设置 → HTTPS 解密 中勾选信任对应域名：
- **核心网关**（必须）：`acs.m.taobao.com`、`guide-acs.m.taobao.com`、`cn-acs.m.taobao.com`、`acs.m.goofish.com`、`acs.m.tmall.com`、`acs.m.alibaba.com`、`acs.m.hema.com`、`acs.m.fliggy.com`
- **埋点/APM/实验分流**（Rewrite Reject 无需解密，但建议信任）：`gm.mmstat.com`、`log.mmstat.com`、`s-gm.mmstat.com`、`px.effirst.com`、`abtest.alibaba.com`、`tlog.mmstat.com`

---

## ⚙️ 参数说明

### 全局开关（所有 App 生效）
| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `blockTracking` | Switch | ON | 拦截所有埋点/APM/实验分流请求 |

### 分类开关（所有 App 生效，细分控制）
| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `removeSplashAd` | Switch | ON | 拦截开屏广告 |
| `removePopWindow` | Switch | ON | 拦截弹窗/浮层广告 |
| `removeSmallCards` | Switch | ON | 拦截小卡片/公告栏/搜索推荐/跑马灯/TAC/NOAH/热词 |
| `removeNoahOps` | Switch | ON | 拦截 NOAH 运营位 |
| `removeTAC` | Switch | ON | 拦截 TAC 搜索推荐 |

### App 专属开关（仅对应 App 生效）
| 参数 | 适用 App | 默认 | 说明 |
|------|----------|------|------|
| `removeFeedKeywords` | Moon | **OFF** | **清空 Moon 首页 Feed 所有商品**（慎用） |
| `removePrivateDomain` | Moon | ON | 拦截 Moon 私域动态/关注会员 |
| *(预留)* | 淘宝/天猫/闲鱼 | — | 后续版本逐步添加 |

> 分类开关默认开启，App 专属开关按需调整。Feed 清空默认关闭，**开启后首页无任何商品推荐，慎用**。

---

## 🏗️ 技术架构

### 多 App 模块化设计
```
Alibaba-AdBlock/
├── src/
│   ├── index.js              # 统一路由入口
│   ├── core/                 # 共享核心模块 (复用率 80%+)
│   │   ├── common.js         # 共享工具函数
│   │   ├── batch-ad-filter.js    # 批量广告分发 (100% 复用)
│   │   ├── noah-filter.js        # NOAH 运营位 (90% 复用)
│   │   ├── tac-filter.js         # TAC 搜索推荐 (100% 复用)
│   │   ├── metax-filter.js       # MetaX 首页/Feed (70% 复用)
│   │   ├── marquee-filter.js     # 跑马灯 (100% 复用)
│   │   ├── private-domain.js     # 私域动态 (80% 复用)
│   │   └── tracking-reject.js    # 埋点 Reject 生成器 (100% 复用)
│   └── apps/                 # App 专属逻辑
│       └── moon.js           # Moon App (阿里妈妈/淘宝联盟) ✅
│       # taobao.js           # 手机淘宝 (待 HAR)
│       # tmall.js            # 天猫 (待 HAR)
│       # xianyu.js           # 闲鱼 (待 HAR)
│       # hema.js             # 盒马 (待 HAR)
│       # fliggy.js           # 飞猪 (待 HAR)
└── Alibaba-AdBlock.lpx       # 清单文件
```

### 复用策略
| 模块 | 复用率 | 隔离方式 |
|------|--------|----------|
| 批量广告分发 | 100% | `siteCode` 白名单配置 |
| NOAH 运营位 | 90% | `resKey` 黑白名单配置 |
| TAC 搜索推荐 | 100% | 接口完全一致 |
| MetaX 首页/Feed | 70% | JSON 路径配置化 |
| 私域动态 | 80% | 接口/字段配置化 |
| 埋点/APM | 100% | 域名级 Reject 完全复用 |

---

## 🧪 测试验证

### Moon App (已验证 v9.17.0)
1. 导入插件 → 开启 Loon → 信任 MITM 证书 (`acs.m.taobao.com` 等)
2. 完全关闭 Moon App → 冷启动
3. 验证：
   - ❌ 无开屏广告
   - ❌ 无弹窗/浮层
   - ❌ 首页无小卡片、公告栏、搜索词、跑马灯、TAC 推荐、热词
   - ❌ 无私域动态通知
   - ✅ 正常功能：商品流、佣金、提现、分享、登录授权

### 抓包验证
- `batchsite`：`batchResult` 无广告 `siteCode`
- `metax`：`hotwords=[]`、`bodyList.resultList=[]`
- `union.pub.entry`：`followMembers.resultList=[]`
- 埋点域名：全部 404 (Rewrite Reject)

---

## 📝 更新日志

| 版本 | 日期 | 变更 |
|------|------|------|
| **2.0.0** | 2026-10-20 | **重大重构**：重命名为 Alibaba-AdBlock，多 App 模块化架构，核心复用，Moon 零回归 |
| **1.5.1** | 2026-10-20 | 修复 `metax.homepage.query` 缺少 `removeFeedKeywords` 参数；Feed 清空逻辑升级 |
| **1.5.0** | 2026-10-20 | 新增 `removeFeedKeywords`、`removePrivateDomain`、TAC/NOAH/Metax/跑马灯拦截 |
| **1.4.0** | 2026-10-20 | 新增私域动态拦截、TAC 智能推荐、metax homepage 热词拦截 |
| **1.3.0** | 2026-10-20 | 新增 metax homepage 热词、TAC 基础/智能推荐、跑马灯拦截 |
| **1.2.0** | 2026-10-20 | 新增 TAC 基础/智能推荐、跑马灯拦截 |
| **1.1.0** | 2026-10-20 | 新增跑马灯拦截 |
| **1.0.0** | 2026-10-20 | 初版：开屏/弹窗/小卡片/公告栏/埋点全拦截 |

---

## ⚠️ 注意事项

1. **必须信任 MITM 证书** (`acs.m.taobao.com` 等)，否则核心接口无法解密
2. **不拦截**：商品流、佣金数据、提现页面、分享功能、登录/授权、正常业务 API
3. **AMDC (59.82.x.x:80)** 使用 HTTP 明文，不在 MITM 范围，不影响广告拦截
4. **Feed 清空 (`removeFeedKeywords`)** 开启后首页将无任何商品推荐，**慎用**
5. 淘宝/天猫/闲鱼等 App 支持待 HAR 分析后逐步上线
6. 若官方新增 `siteCode`/`resKey`，只需在对应配置中添加，无需改动清单层

---

## 📄 许可

仅供个人学习研究使用。上游 App 版权归阿里巴巴集团所有。

---

## 🔗 相关仓库

- 插件源码：[loon-plugin-patches/plugins/Alibaba-AdBlock](https://github.com/Savues/loon-plugin-patches/tree/main/plugins/Alibaba-AdBlock)
- 逆向文档：[ios-reverse-engineering/Alimama-Moon](https://github.com/Savues/ios-reverse-engineering/tree/main/Alimama-Moon) (私有)
- 架构规划：[Alibaba-AdBlock-ARCHITECTURE.md](https://github.com/Savues/loon-plugin-patches/blob/main/plugins/Alibaba-AdBlock/ARCHITECTURE.md)