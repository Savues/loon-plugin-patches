# Alibaba-BlockACCS

> 阻断淘宝 ACCS 推送通道（路由层）· v1.1.0 · 2026-10-22

独立小插件，与 `Alibaba-AdBlock` **完全解耦**（可随时启用/禁用，即时回滚）。

---

## 🎯 用途

配合 `Alibaba-AdBlock` 的**空词版 gateway 缓存**，消除首页搜索框的轮播营销词
（丰臀修身牛仔裤 / 旅行便携式可折叠衣架 / 双汇玉米肠 …）。

---

## 🔬 原理

淘宝 ACCS（长连接推送通道）负责下发首页容器数据，其中 `sections[1].content.searchText`
携带营销位词表（`itemBizCode: mst_roll_N`），由原生 `TBSearchHintLabel` 轮播展示。

**为什么 HTTP 层拦不住**：
- ACCS 是**常驻 keep-alive 连接**，冷启动时复用旧连接
- 既有 TCP 流上的数据推送，HTTP 代理层（Rewrite / Script）**完全看不到**
- IP 直连流量**不经过代理** → `[Rewrite]` 规则对 IP 形式无效（实测：IP 形式 404 通过，域名形式 status 0 被拒）

**因此必须在【路由层】阻断。**

---

## 📦 安装

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Alibaba-BlockACCS/Alibaba-BlockACCS.lpx
```

---

## 📋 用法

```
1. 启用本插件
2. Alibaba-AdBlock → 覆盖沙盒 gateway 缓存为空词版:
   Documents/TBDocuments/gateway/cache_newface_home_main_base
   (displayText / searchTextConfig 置空, 保留 searchBoxUrl/searchButtonUrl)
3. 杀淘宝 → 冷启动
4. 预期: 首页正常显示 (读缓存渲染) + 搜索框无轮播词
```

**回滚**：直接禁用本插件 + 恢复 gateway 原文件。

---

## 🔌 规则

```ini
[Rule]
IP-CIDR,59.82.0.0/16,REJECT
IP-CIDR,47.246.0.0/16,REJECT
DOMAIN,amdc.m.taobao.com,REJECT
DOMAIN,amdc.alipay.com,REJECT
```

---

## 📊 ACCS 服务器清单

**App 二进制硬编码**（每次冷启动可能不同）：
```
59.82.31.182    59.82.17.132    59.82.113.219
59.82.113.10    47.246.103.9    47.246.103.10
```

**历史实际工作通道**（带显式 `:80`，status 200）：
```
59.82.34.148:80    59.82.34.255:80    59.82.14.1:80
```

> 全部 1500+ 次请求 **100% 只跑 `/amdc/mobileDispatch`**，零例外
> → 按 IP 段阻断不影响任何其他业务。

---

## ⚠️ 优先级提醒（重要）

Loon 规则优先级：**本地规则 > 插件规则 > 订阅规则**

若你的**主配置或订阅**里已有 `59.82.*` / `47.246.*` 的 IP-CIDR 直连规则（阿里 CDN 直连很常见），
会**压过**本插件的 REJECT，表现为：

```
部分请求 status=0  (被拒)
部分请求 status=404 (通过)   ← 同一 URL
```

**最可靠做法** — 把同样两行加到**主配置** `[Rule]` 段**最前面**（本地规则优先级最高）：

```
IP-CIDR,59.82.0.0/16,REJECT
IP-CIDR,47.246.0.0/16,REJECT
```

同时确认没有更靠前的规则把这两个段设为 `DIRECT`（Loon 路由页搜 `59.82` / `47.246` 检查）。

---

## ⚠️ 副作用

| 影响 | 说明 |
|------|------|
| 首页**实时更新**失效 | 首页容器不再实时刷新（价格变动 / 活动推送） |
| **IM 实时消息**失效 | 聊天 / 系统推送不再实时到达 |
| 搜索 / 浏览 / 下单 / 收藏 | ✅ **不受影响**（走 HTTP mtop） |
| 首页静态内容 | ✅ 正常（读本地缓存渲染） |

---

## 🔬 相关证据

| 结论 | 证据来源 |
|------|---------|
| ACCS 是常驻连接 | 冷启动时 `mobileDispatch` 请求 404，但数据仍到达 |
| IP 直连不进代理 | 同 URL：域名形式 status 0（拒），IP 形式 status 404（通） |
| ACCS 服务器 100% 只跑 amdc | 1500+ 请求路径全量统计 |
| 数据经 ACCS 离线回调 | 二进制 `RangerACCSOfflineCallback` / `rangerBucketOfflineEnable` |
| 轮播词 = Ranger 营销位 | `sections[1].content.searchText` + `itemBizCode: mst_roll_N` + `suggest_rn: ...tpp_atlas-hintq` |
| 橙色配置也走 Cronet | 49 个 HAR 全扫：`orange.tbcdn.cn` 仅有 4 个小配置，搜索配置从不经过 HTTP |
