# 什么值得买去广告 · SMZDM

> **版本 v1.4.0** · 订阅以 lpx 内版本为准

移除开屏/信息流/搜索广告、热榜、微信通知弹窗；屏蔽 UMP 开屏 SDK、友盟 DSP 与自建埋点。
基于 kelee.one 上游（原作可莉🅥/luestr），Savues 增强版：首页 jq 本地化 + 二进制审计补齐 + 热榜/弹窗整删。

| | 中文 | English |
|---|---|---|
| 上游 | kelee.one `smzdm_remove_ads`（2026-10-02 版），原作可莉🅥 | kelee.one upstream by luestr |
| 改动 | 见下「本仓库改动」 | See changes below |
| 脚本 | `src/home_smzdm_remove_ads.js`（首页清洗，本地化自上游 jq） | 1 localized script |
| 审计依据 | SMZDM 11.2.1 主二进制（101MB，自建广告/UMP SDK/埋点域名全景） | Binary-audited |
| 上游停更 | 2026-10-02 后无更新，本仓库独立维护 | Upstream stale, maintained here |

---

## 安装 · Install

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/SMZDM/smzdm_remove_ads.lpx
```

---

## 本仓库改动（相对上游）

| 版本 | 改动 |
|------|------|
| v1.0.0 | **首页 jq_file 本地化**：上游依赖远程 `home_smzdm_remove_ads.jq`，翻译成语义等价的本地 JS Script（ads 三特征/组件白名单/问卷/皮肤/banner 选项），摆脱远程依赖且模拟器可验证 |
| v1.1.0 | 二进制审计补齐：8 个埋点/广告 SDK 域名级 `[Rule]`（umeng DSP/cnlogs/uyunad/analytics×2/神策/阿里 UT×2）+ `admsg` UMP 开屏路径拦截（域名运行时拼接，用路径特征）+ 友盟 DSP 上报 + 红包分享 |
| v1.2.0 | **双网关变体**：好价首页同接口走 `haojia-api` 与 `a-api` 两个域名（HAR 实测），规则补 `(?:haojia\|a)-api` |
| v1.3.0 | **搜索热榜整删**：上游 jq 只删"热点主题榜"但保留"热搜榜"区块 —— `hot_tab`/`search_hot`/`bangdan` 三字段全删 |
| v1.4.0 | **微信通知弹窗清洗**：`init_user → wechat_notice_service_popup`（降价提醒/预约抢购话术）删除 |

---

## 它做什么 · What it does

| 模块 | 机制 |
|------|------|
| 开屏 | `util/loading` reject + `adx-api.zdmimg.com`（自建广告平台）域名断 + `admsg` UMP 开屏 SDK 路径拦 |
| 首页信息流 | 本地化 Script：`ad_campaign_id`/`tag`/`model_type=ads` 三特征 + 组件白名单（circular_banner/filter/list）+ 问卷 + 皮肤 |
| 好价首页 | `cell_type` 过滤 + 主题横幅删除（双网关域）|
| 搜索域 | 滚词典 reject + `list_v10` 广告行过滤 + **热榜整删**（v1.3.0）+ 弹窗券 |
| 我的页 | 频道列表/会员页横幅/底部卡 |
| 文章页 | 推广位/券日志/悬浮气泡 |
| 弹窗 | **微信通知开通弹窗**（v1.4.0）+ 静默推送/百川跳转开关关闭 |
| 埋点 | 8 域名级拦截（见 v1.1.0）|

---

## 验证记录 · Verification

| 日期 | 项 | 结果 |
|------|-----|------|
| 2026-10-24 | 开屏/loading | ✅ 2B |
| 2026-10-24 | 热榜整删 | ✅ 真实 body 端到端（10 条标题全消，batch_id 保留）|
| 2026-10-24 | 滚词典 | ✅ 清数据冷启动后消失（旧缓存实锤）|
| 2026-10-24 | 微信通知弹窗 | ✅ 字段删除、其余 23 字段保留 |
| 2026-10-24 | `adx-api`/`admsg` | 0 请求（域名/路径拦截下不再发起）|

## 已知边界 · Known limits

- `ab/config → home_popup` 为 AB 实验开关，保守不拦（删实验配置风险大于收益）
- 文章 `preload` 的比价浮层字段服务端默认关闭，观察中
