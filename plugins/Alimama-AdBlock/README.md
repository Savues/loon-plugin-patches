# Alimama-AdBlock

> 阿里妈妈 **Moon App (v9.17.0+)** 专用去广告插件  
> 精准拦截 **开屏广告、弹窗广告、首页小卡片、公告栏、搜索推荐词、跑马灯、TAC 智能推荐、首页搜索栏热词、私域动态、埋点上报**  
> 基于真机抓包逆向，按接口字段分类过滤，不误伤正常业务。

---

## ✨ 功能特性

| 广告类型 | 接口 | 关键字段/特征 | 开关 | 默认 |
|---------|------|--------------|------|------|
| **开屏广告** | `mtop.alimama.union.skyleap.distribution.batchsite` | `siteCode=open_screen_site` | `removeSplashAd` | ✅ 开启 |
| **弹窗广告** | 同上 | `siteCode=pop_window_site` | `removePopWindow` | ✅ 开启 |
| **首页小卡片** | 同上 | `siteCode=small_handler_*` | `removeSmallCards` | ✅ 开启 |
| **公告栏/通知** | 同上 | `siteCode=bulletin_board_*` | `removeSmallCards` | ✅ 开启 |
| **搜索词推荐** | 同上 | `siteCode=searchDomeWord_site` | `removeSmallCards` | ✅ 开启 |
| **搜索框跑马灯** | `mtop.taobao.union.marquee.query` | `data.result[]` | `removeSmallCards` | ✅ 开启 |
| **TAC 基础推荐** | `mtop.alimama.moon.provider.tac.service.call` | `data["2019021101"].data[].word` | `removeSmallCards` | ✅ 开启 |
| **TAC 智能推荐** | `mtop.alimama.moon.provider.tac.service.smart.call` | `data.wordList[].word` | `removeSmallCards` | ✅ 开启 |
| **首页搜索栏热词** | `mtop.alimama.moon.provider.metax.homepage.query` | `headerList[].fields.hotwords[]` | `removeSmallCards` | ✅ 开启 |
| **清空首页 Feed** | `mtop.alimama.moon.provider.metax.homepage.query` | `bodyList[].fields.newsList.recommend.resultList[]` | `removeFeedKeywords` | ❌ 关闭 |
| **私域动态/关注会员** | `mtop.alimama.union.pub.entry` | `data.followMembers.resultList[]` | `removePrivateDomain` | ✅ 开启 |
| **埋点/错误上报** | `gm.mmstat.com` / `log.mmstat.com` | — | `blockTracking` | ✅ 开启 |
| **APM/JS错误/实验分流** | `px.effirst.com` / `abtest.alibaba.com` | — | `blockTracking` | ✅ 开启 |

> **核心优势**：所有广告位通过**单一批量接口**下发，按 `siteCode` 区分。脚本精准按分类过滤，不拦截正常业务数据（商品流、佣金、提现、分享、登录等）。

---

## 📦 安装方式

### Loon 订阅导入
```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Alimama-AdBlock/Alimama-AdBlock.lpx
```

> ⚠️ CDN 缓存约 5 分钟，更新后可加 `?cb=时间戳` 强制刷新。

### MITM 配置（必需）
插件自带 `[MITM]` 段，导入后需在 Loon 设置 → HTTPS 解密 中勾选信任对应域名：
- `acs.m.taobao.com` —— **核心业务 API（必须）**
- `gm.mmstat.com` / `log.mmstat.com` / `px.effirst.com` / `abtest.alibaba.com` / `s-gm.mmstat.com` —— 埋点/上报（Rewrite Reject 无需解密）

---

## ⚙️ 参数说明

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `removeSplashAd` | Switch | ON | 拦截开屏广告（含图片、跳转链接、倒计时） |
| `removePopWindow` | Switch | ON | 拦截弹窗/浮层广告 |
| `removeSmallCards` | Switch | ON | 拦截首页小卡片、公告栏、搜索推荐词、跑马灯、TAC 推荐、首页热词 |
| `removeFeedKeywords` | Switch | **OFF** | **清空首页推荐流所有商品**（慎用，开启后首页无商品） |
| `removePrivateDomain` | Switch | ON | 拦截私域动态/关注会员动态 |
| `blockTracking` | Switch | ON | 网络层直接 Reject 所有埋点/上报/APM/实验分流请求 |

> 全部默认开启（除 Feed 清空），按需关闭即可。关闭某开关后对应广告恢复显示，不影响其他功能。

---

## 🔧 技术细节

### 核心接口
```
POST https://acs.m.taobao.com/gw/mtop.alimama.union.skyleap.distribution.batchsite/1.0/
```
请求体含 `siteCodeList`，响应 `data.batchResult[]` 每项对应一个广告位：
```json
{
  "siteCode": "open_screen_site",
  "siteData": {
    "displayTime": "4",
    "img": "https://gw.alicdn.com/...",
    "fetchDelayTime": "3",
    "url": "https://mo.m.taobao.com/union/path_...?tkScm=..."
  }
}
```

### 过滤逻辑
脚本在 `http-response` 阶段解析响应体，遍历 `batchResult` 数组，根据开关状态移除对应 `siteCode` 的项，其余字段（`memberId`、`tkScm`、`ret` 等）保持原样。

### 域名分类
| 域名 | 处理方式 | 理由 |
|------|----------|------|
| `acs.m.taobao.com` | **Response Body Rewrite** | 核心业务网关，含批量广告接口 |
| `gm.mmstat.com` / `log.mmstat.com` | **Rewrite Reject** | 纯埋点/错误上报，无业务价值 |
| `px.effirst.com` | **Rewrite Reject** | APM/JS错误/性能监控 |
| `abtest.alibaba.com` | **Rewrite Reject** | 实验分流，拦截不影响功能 |
| `s-gm.mmstat.com` | **Rewrite Reject** | 备用埋点 |

---

## 🧪 测试验证

### 真机验证步骤
1. 导入插件 → 开启 Loon → 开启 MITM 信任 `acs.m.taobao.com`
2. **完全关闭 Moon App**（后台划掉）
3. **冷启动 Moon App** → 观察：
   - ❌ 无开屏广告页面
   - ❌ 无弹窗/浮层
   - ❌ 首页无小卡片、公告栏、搜索词推荐、跑马灯、TAC 推荐、热词
   - ❌ 无私域动态通知
4. 正常使用：商品列表、佣金查看、提现、分享、登录/授权等功能**完全正常**

### 抓包验证
- `batchsite` 响应：`batchResult` 数组长度减少，对应 `siteCode` 项消失
- `metax.homepage.query`：`headerList.hotwords=[]`、`bodyList.resultList=[]`
- `union.pub.entry`：`followMembers.resultList=[]`
- `gm.mmstat.com` / `px.effirst.com` 等：请求直接被 Reject，无响应体

---

## 📝 更新日志

| 版本 | 日期 | 变更 |
|------|------|------|
| **1.5.1** | 2026-10-20 | 修复 `metax.homepage.query` 缺少 `removeFeedKeywords` 参数；Feed 清空逻辑升级（整体清空） |
| **1.5.0** | 2026-10-20 | 新增 `removeFeedKeywords` 开关（Feed 关键词过滤 → 整体清空）；新增 `removePrivateDomain` 开关（私域动态） |
| **1.4.0** | 2026-10-20 | 新增私域动态拦截 (`union.pub.entry`)、TAC 智能推荐拦截、metax homepage 热词拦截 |
| **1.3.0** | 2026-10-20 | 新增 metax homepage 热词拦截、TAC 基础/智能推荐拦截、跑马灯拦截 |
| **1.2.0** | 2026-10-20 | 新增 TAC 基础/智能推荐拦截、跑马灯拦截 |
| **1.1.0** | 2026-10-20 | 新增跑马灯拦截 |
| **1.0.0** | 2026-10-20 | 初版：开屏/弹窗/小卡片/公告栏/埋点全拦截 |

---

## ⚠️ 注意事项

1. **必须信任 `acs.m.taobao.com` MITM 证书**，否则核心接口无法解密，脚本不生效
2. **不拦截**：商品流、佣金数据、提现页面、分享功能、登录/授权、正常业务 API
3. **AMDC (59.82.x.x:80)** 使用 HTTP 明文，不在 MITM 范围，不影响广告拦截
4. **Feed 清空 (`removeFeedKeywords`)** 开启后首页将无任何商品推荐，**慎用**
5. 若官方新增 `siteCode`，只需在脚本中添加到对应 Set 即可，无需改动清单层

---

## 📄 许可

仅供个人学习研究使用。上游 App 版权归阿里妈妈所有。

---

## 🔗 相关仓库

- 插件源码：[loon-plugin-patches/plugins/Alimama-AdBlock](https://github.com/Savues/loon-plugin-patches/tree/main/plugins/Alimama-AdBlock)
- 逆向文档：[ios-reverse-engineering/Alimama-Moon](https://github.com/Savues/ios-reverse-engineering/tree/main/Alimama-Moon) (私有)