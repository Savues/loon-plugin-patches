# 京东去广告 · JD-AdBlock

> **版本 v1.0.1** · 订阅以 lpx 内版本为准

移除京东开屏广告、精简我的页面产品推广、屏蔽搜索推广流。
上游 kelee 版拉取本地化（脚本原作 RuCu6），Savues 修正：uniformRecommend 变体补全 + 链接/脚本全本地化。

| | 中文 | English |
|---|---|---|
| 来源 | 上游拉取本地化（脚本在 src/，引用本仓库直链） | Localized |
| 改动 | uniformRecommend[06] 正则补全为 `\d?` 变体族（9 漏网修复） | Variant regex fix |
| 脚本 | `JD_remove_ads.js`（上游原版） | Upstream script |
| 审计依据 | JDMobile 17.11.35 主二进制 + 141MB HAR + 沙盒取证 | Binary+HAR+sandbox |

---

## 安装 · Install

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/JD-AdBlock/JD_remove_ads.lpx
```

---

## 它做什么 · What it does

| 模块 | 机制 |
|------|------|
| 开屏 | `functionId=start`：images 清空 + showTimesDaily=0 |
| 首页 | `welcomeHome`：悬浮通栏/小圆图/顶部动图/消费券/下拉二楼等 7 类图层清洗 |
| 订单/物流/我的页 | 各自 floor 清洗（banner/会员推广/满意度等）|
| 搜索推广 | `searchBoxWord`（搜索词）+ `stationPullService` + **`uniformRecommend\d?` 全变体（v1.0.0 补全 9）** reject |
| 诊断 | jddebug.com 拦截 |

---

## 🔍 审计发现（2026-10-24）

- **今日热搜/搜索发现 = 搜索推广商品卡**：沙盒 MTA 库曝光记录实锤（word/rankName=今日热搜 + planid/materialid 广告投放字段 + SAK7/8 实验层 + rank_type=-100 排序注入）→ uniformRecommend 系即其数据源
- **京东 ciphertype=5 加密协议**：新版接口响应加密（uniformRecommend 实测），字段级清洗不可行 → 只能整接口 reject
- 滚词典：searchBoxWord 已拦仍显示 → 存在第二通道（未定位，候选 FSSearchHistory 沙盒/ACCS）

---

## 已知边界 · Known limits

- `uniformRecommend` 整接口 reject 会同时断掉该通道上的正常推荐（如首页"为你推荐"异常请反馈）
- 滚词典第二通道未定位

---

## 验证记录 · Verification

| 日期 | 项 | 结果 |
|------|-----|------|
| 2026-10-24 | uniformRecommend 变体拦截 | ✅ 模拟器 0/6/9/裸 全命中 |
| 2026-10-24 | 上游核心拦截 | ✅ HAR 实测 start/welcomeHome 等在工作 |
| 待真机 | 今日热搜/搜索发现消失 | 更新后确认 |
