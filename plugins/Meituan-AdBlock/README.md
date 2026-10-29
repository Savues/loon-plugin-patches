# 美团去广告 · Meituan-AdBlock

> **版本 v1.6.0** · 订阅以 lpx 内版本为准

拦截我的页会员营销、弹窗族、营销素材；清洗 horn 远程配置中的广告/弹窗开关（**134 键**，完整清单见 [HORN.md](HORN.md)），并关闭全部隐私采集、遥测上报、灰度实验与开发测试开关。
**从零自研**（无上游），基于二进制逆向 + 五份 HAR + 双沙盒取证的全新开发。

| | 中文 | English |
|---|---|---|
| 上游 | 无（全新自研） | None (from scratch) |
| 审计依据 | imeituan 12.67.403 主二进制（208MB）+ 三份 HAR ~3600 条 + 双沙盒 | Binary + HAR + sandbox forensics |
| 逆向归档 | 私库 ios-reverse-engineering/Meituan（91MB 单文件 + URL/API 清单） | Archived |
| 架构特征 | 美团主 API 走 **mtgsdk 长连接**（HTTP 不可达），明文层只有素材/配置/少量接口 | Long-connection architecture |

---

## 安装 · Install

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Meituan-AdBlock/Meituan_remove_ads.lpx
```

---

## 美团流量架构（为什么这个插件长这样）

美团与阿里系完全不同的架构，决定了插件的边界：

| 层 | 通道 | 可达性 |
|----|------|--------|
| **业务数据**（搜索框热搜/发现/滚词、首页信息流）| mtgsdk 长连接 | ⚫ **HTTP 不可达**（三份 HAR 3600 条 + 沙盒全零命中实锤）|
| **horn 远程配置** | portal-portm / h.meituan.com 明文（mergeRequest 1.1MB/169 模块）| ✅ **键级反转清洗**（本插件核心战场）|
| 我的页会员营销 | market.waimai.meituan.com 明文 JSON | ✅ 拦截 |
| 弹窗族 | 各 .com 域明文 | ✅ 预置拦截 |
| 素材 CDN | mss_* .meituan.net / flowplus | ✅ 广告路径/域拦 |

`.bin` 后缀响应（mapi/mtlist/*）是美团序列化格式 —— 非明文，只能 reject 不能字段清洗。

---

## 开屏广告研究报告（专项研究）

### 为什么"从来没见过美团开屏广告"

**开屏是定向投放，不是人人可见。** 二进制实证开屏展示前有五重校验（`checkStartupImage*` 函数族）：

```
素材有效 → 展示时长 → 投放时段 → 展示时间 → 频控(已展示次数)
```

投放配置的定向字段（`moduleExtMap.startupPicArea`）：

| 字段 | 含义 |
|------|------|
| `userHobby` | **按用户兴趣画像定向** —— 画像不命中 = 不投 |
| `dayShowTime` / `monthShowTime` | 日/月展示次数上限 |
| `StartupUserShowDates` | 用户级展示日期控制 |
| `gaea.../forbidden/resource` | 禁投名单 |

对该设备的判定：**定向投放未命中**（画像/频控/灰度三选一），佐证：`ad_midas`/`clc_ad_coreLib` 广告库空、HAR 只有品牌闪屏图（`flowplus.../linglong/` 是运营图通用路径，那张 297KB 的图是品牌启动图不是广告）。

### 开屏数据链全貌（四层）

```
① 数据下发: mobile.launch.StartUpImage → 长连接 (proto 方法族: start/click/reveal/exit) ⚫不可达
② 配置开关: horn splash 键 (maicai_splash_hidden/splash_vap/splash_video_disabled) → ✅已清洗
③ 素材下载: flowplus.meituan.net → ✅域名断供 (v0.7)
④ 本地兜底: pfb_launchview 缓存 (newStartupImageResponse) → 被覆盖后衰减
```

当前是"未命中"状态，插件的开屏防线是**未来时保险**（画像/灰度变化时兜住）——无副作用。

---

## 版本历史 · Versions

| 版本 | 改动 |
|------|------|
| v0.1.0 | 骨架 + 首批明文拦截（market.waimai 会员营销 ×3 / picasso-ad 素材 / launch track）|
| v0.2.0 | 弹窗三接口（member 活动曝光惊喜分 / topcube 活动 / 问卷弹窗）|
| v0.3.0 | 逆向深挖弹窗族 8 条（mlive 直播券弹窗 / mtmessage 横幅 ×3 / DSP 抽奖 / mtdealad 广告物料 / couponbanner / 酒店弹窗 / 用户弹窗配置）|
| v0.4.0 | **horn 远程配置清洗上线**（retail 开屏/弹窗 5 键）—— 真机 HAR 实证生效 |
| v0.5.0 | horn 650 配置全量盘点 → +17 键（通用/推送/酒店弹窗、引导浮层、返现/权益横幅、**小说阅读器广告 8 键全灭**）|
| v0.6.0 | 高嫌疑开关 +26（悬浮窗 8 / 券弹层 7 / 横幅 5 / 引导运营 6）|
| v0.7.0 | 开屏素材断供（flowplus 域拦截）|
| v0.8.0 | 169 模块 751KB 全量二次盘点 → +29 键（插屏/推送/任务列表/酒店营销/引导动画/首页位置引导）；广告模块深挖 → +10 键（灵犀广告/midas 上报/团购快手 SDK/搜索关键词监控/夜间签到/搜索页直播）→ horn 合计 **86 键** |
| v0.8.1 | horn 规则扩展到全量接口 —— HAR 实证 `horn_ios?id=` 与 `horn_ios/mergeRequest` 并存，此前只覆盖后者 |
| v0.8.2 | 数值规则幂等化（`[1-9]\d*` 避免重复匹配已改为 0 的值）|
| v0.9.0 | 169 模块深度二次扫描 → +13 键（**开屏启动图时长 5→0** / promo 列表 / 酒店团购券列表 / **首页 7 类营销卡片频控归零** / 拼好饭弹窗 / 引导展示次数）|
| v1.0.0 | **全量 2655 叶子键穷举** → +3 键（**字符串内嵌 JSON 盲区 `rec_config`：3 个 `ad_feed_poi_deal` 信息流广告位** / 增长业务 / 旅行 CPC 广告禁用）|
| v1.1.0 | **隐私/遥测/内部测试全关** → +16 键（截图上传 / 设备指纹 / Beacon+WiFi 采集 / 请求+异常上报 / Logan+Raptor 上报 / midas 监控 / 酒店 mock 数据 / 播放器调试面板）；`allowShowDebugBoard` 按要求**打开** |
| v1.2.0 | **基于真机 703KB 实际响应漏网扫描** → +14 键（位置监控 / 采样上报 / 首页漏斗+速度 / Feed Raptor / 图片流量日志 / 代码日志采样率 / 酒店 Pike 直播开关 / AB 白名单 / **播放器流量测试 bid** / 调试信息升级 / 公交原生测试）|
| v1.3.0 | 曾尝试清理测试环境 URL（deeplink 2 条 + SSR `test-g`→`g`），**已按用户要求回退** |
| v1.3.1 | AB 实验分组 + 图标 Babel 上报 → +2 键（**134 键**）；测试环境 URL 仅记录不处理 |
| **v1.7.0** | 🎁 会员等级/成长值参数标注为**彩蛋功能**（含生效范围与实测边界说明）；无逻辑改动 |
| **v1.6.0** | ⭐ **新增成长值自定义参数** —— `growthValue` 留空不改，填数字则替换当前等级成长值；等级门槛（500/2000/5000/10000/30000）保持不变，进度区间按所选等级自动换算（`growthValueStart` / `growthValueEnd`）；当前等级不再显示「成长值满X可升级」 |
| **v1.5.1** | 🔴 **修复等级伪装 UI 不生效** —— 只改 `data.memberLevel` 前端不认，实际前端读 `allLevelData[].realLevelCompare`（0=当前/-1=未达到）。现同步迁移该标记 + 有效期/保级/成长值状态字段 |
| **v1.5.0** | ⭐ **新增会员等级自定义参数** —— `memberLevel` 可选 1~6（普通/白银/黄金/白金/黑金/黑钻），覆盖 5 个下发等级的接口（`member/homepage/query` 的当前等级字段、`activity/api/expose`、`products/recommend/v3`、`marketing/featuredActivity`、`marketing/SLevelBanner`）。**仅改客户端显示**，`allLevelData` 等级定义表不动，服务端仍为真实等级 |
| **v1.4.0** | 🔴 **修复会员页「活动太火爆」** —— 4 条 reject_dict 规则误拦会员页核心数据接口：<br>• `member/activity/api/expose`（名字像曝光上报，实际返回**会员等级 + 惊喜值 + 惊喜多选一奖品**）→ **放行**<br>• `marketing/SLevelBanner`（含 **ifMember/memberLevel** 会员身份）→ **放行**<br>• `dailyMagicalCoupon` / `marketing/featuredActivity` → 改为**响应侧清洗**（保留 `code:0/message:成功` 结构，只清空营销内容）|

### horn 清洗机制说明

horn = 美团版「橙配」（全 App 远程配置主干道，169 模块 / 约 1.1MB）。清洗方式：响应**键级正则反转**（41 条规则 / 86 个键），其余 95% 配置原样保留 —— horn 是功能配置载体，**只能清洗不能 reject**。

覆盖两种接口形态（2026-10-29 真机 HAR 实证）：

```
h.meituan.com/horn_ios?id=...&version=v1    → 全量（无缓存时 200，有缓存 304）
h.meituan.com/horn_ios/mergeRequest?...     → 增量 / 冷启动全量（697KB ~ 1.1MB）
```

**清洗分组概览**（完整 134 键清单见 **[HORN.md](HORN.md)**）：

| 分组 | 键数 | 代表 |
|------|------|------|
| 开屏族 | 3 | 买菜开屏隐藏 / VAP 动画 / 开屏视频 |
| 弹窗族 | 7 | 通用弹窗 / 闪购引导 / 我的页 / 酒店首页 |
| 悬浮窗·浮层 | 9 | floatWindowAB/MGC / 顶部浮层 / 券浮层 |
| 券·优惠弹层 | 10 | 券头 / 券弹层 / 领券 / 券列表 / 酒店券详情 |
| 横幅 | 7 | 权益横幅 / 返现 / 流量平台 / 直播横幅 |
| 小说阅读器广告 | 8 | 章节末 / 段末 / 插页 / 解锁 / 金币（全灭）|
| 引导·运营 | 14 | 引导层 / 引导动画（6 键数值归零）/ 透明活动 |
| 首页·位置引导 | 2 | 旅行引导位 / 位置引导次数 |
| 推送 | 5 | 秒哇推送 / 推送分类 / 订单推送 |
| 任务列表 | 2 | 团购任务列表 / 抢任务列表 |
| 酒店营销 | 9 | 特惠券 / 订单券 / 红包 / 推广订单 |
| **广告系统** | 8 | **灵犀广告 / midas 上报 / 快手广告 SDK / 插屏** |
| 其他 | 3 | 搜索关键词监控 / 夜间签到 / 搜索页直播 |
| **时长·频控·卡片** | 13 | **开屏时长 5→0** / promo 列表 / 酒店券列表 / 7 类营销卡片频控 / 拼好饭弹窗 |
| **字符串内嵌 JSON** | 3 | **`rec_config` 3 个 `ad_feed_poi_deal` 广告位** / 增长业务 / CPC 广告 |
| **隐私·遥测·内部测试** | 16 | 截图上传 / 设备指纹 / Beacon+WiFi / Logan+Raptor / midas 监控 / 酒店 mock / 调试面板 |
| **灰度·AB·开发测试** | 14 | 位置监控 / 采样上报 / 首页漏斗 / 酒店 Pike 直播 / AB 白名单 / 流量测试 bid / 调试信息 / 公交原生测试 |
| **AB 实验·上报** | 2 | 图片服务 AB 分组 / 图标 Babel 上报 |

用户授权"有嫌疑就加"，误伤任何功能随时反馈 —— 键反转完全可逆，删掉对应规则即恢复。

**已知边界**：有本地配置时服务器返回 304（无 body，脚本无法介入），需清缓存才能让新规则生效 —— 详见 [HORN.md § 五](HORN.md#五强制重新下发缓存问题)。

---

## 🎁 彩蛋 · 会员等级伪装（v1.5.0 起，v1.7.0 标注为彩蛋）

> **定位：彩蛋功能，不是主力去广告能力。** 效果有限，请看清下面两条边界再用。

### ⚠️ 生效范围（2026-10-30 实测）

| 页面 | 是否生效 | 原因 |
|------|---------|------|
| **会员二级页**（点「我的」→ 会员中心）| ✅ **生效** | 数据源 `member/homepage/query` 走 HTTP，可改写 |
| **「我的」页顶部的会员标识** | ❌ **不生效** | 读 MSC 本地渲染缓存 + SAK 加密用户信息，**每次打开都重新生成** |

关于「我的」页的实测记录：

```
· 渲染缓存 renderTreeCache_.bin 已手动替换为「黑钻会员6星」（28 处）
· 重启 App 后：文件从 319,970B → 324,981B，内容全部回到「普通会员1星」
· 内嵌时间戳 = 打开页面的时刻（03:25:58）→ 证明每次渲染都重新生成
· 冷启动 HAR（890 条请求）中没有任何「我的」页的会员接口
```

结论：**「我的」页的等级来自本地加密存储（SAKUserService / mtGetUserInfoSync），HTTP 层和缓存层都无法改变**，需要越狱 hook 才能动。

### 另一个边界

纯客户端显示，服务端仍为真实等级 —— 领券 / 会员价 / 权益领取 / 下单优惠一律以服务端为准，可能出现「等级不足」提示或价格不变。

---

插件设置里有两项：

**① 会员等级显示**（`memberLevel`）

```
不修改（默认） / 1 普通会员 / 2 白银会员 / 3 黄金会员 / 4 白金会员 / 5 黑金会员 / 6 黑钻会员
```

**② 成长值自定义**（`growthValue`）

```
留空（默认，不修改） / 任意数字
```

等级门槛固定为 **500 / 2000 / 5000 / 10000 / 30000**，插件按所选等级自动换算进度区间：

| 等级 | 起点 | 终点 |
|------|------|------|
| V1 | 0 | 500 |
| V2 | 500 | 2,000 |
| V3 | 2,000 | 5,000 |
| V4 | 5,000 | 10,000 |
| V5 | 10,000 | 30,000 |
| V6 | 30,000 | —（最高级）|

当前等级不再显示「成长值满 X 可升级」提示。**只填成长值、等级选「不修改」也生效**（作用于真实当前等级）。

选任意档位后，以下 5 个接口的「当前等级」字段会被改写：

| 接口 | 改写的字段 |
|------|-----------|
| `member/homepage/query` | `data.{memberLevel, memberActualLevel, memberLevelShow, memberLevelName, ifMember, memberSubLevel}` |
| `member/activity/api/expose` | `data.userMemberLevel.{memberLevel, memberSubLevel, ifMemberShip}` |
| `member/homepage/products/recommend/v3` | `data.{memberLevel, ifMember, memberSubLevel}` |
| `marketing/featuredActivity` | `data.{ifMember, memberLevel, memberSubLevel, memberLevelName}` |
| `marketing/SLevelBanner` | 同上 |

**关键**：前端判断「当前等级」读的是 `data.allLevelData[].realLevelCompare`（`0` = 当前，`-1` = 未达到），不是 `data.memberLevel`。因此插件会：

1. 把目标等级的 `realLevelCompare` 改为 `0`，其余改为 `-1`
2. 把真实当前等级上的状态字段（`levelStrategyTypeInfo` 有效期 / `retainLevelFlag` 保级 / `growthInfo.growthValue` 成长值）迁移到目标等级
3. 原当前等级的这些字段清空

`allLevelData` 的**等级定义**（等级名、升级门槛 `growthValueEnd`）保持不变。

### ⚠️ 重要限制

```
这是纯客户端显示伪装。服务端仍返回并校验真实等级。
领券 / 权益 / 下单 / 会员价等业务动作，一律以服务端校验为准。
可能出现：「等级不足」「该权益仅限XX会员」等提示，或实际价格不变。
```

真机验证：5 个接口等级字段全部改写成功（V5 黑金会员实测）、参数边界正确（不修改/空/0/7/abc 均不生效）、幂等 ✅

---

## 已知边界 · Known limits

- 搜索框热搜/发现/滚词、首页信息流数据 —— **长连接不可达**（仅越狱 Hook 可根治）
- 开屏当前对该设备未投放（定向未命中）；插件防线为预防性
- `products/recommend`（我的页商品推荐）暂放行 —— 功能性存疑，观察中
- `member/homepage/query` 的 banner/coupon 字段服务端下发为 null —— 无需处理
- **会员页 `member/activity/api/expose` 与 `marketing/SLevelBanner` 必须放行** —— 二者承载会员等级、惊喜值、惊喜多选一奖品，拦掉会导致「活动太火爆」报错（v1.4.0 修复）

---

## 验证记录 · Verification

| 日期 | 项 | 结果 |
|------|-----|------|
| 2026-10-25 | horn 清洗真机生效 | ✅ HAR 实证 mergeRequest 响应四键已反转 |
| 2026-10-25 | 弹窗族模拟器决策 | ✅ 全命中 · 功能接口（citylist/searchbox）放行验证 |
| 2026-10-25 | horn 端到端 | ✅ 真实 1.1MB body 48 键反转 / JSON 合法 / 等长 |
| 2026-10-25 | 开屏素材 URL | ✅ 沙盒缓存原图 URL 追溯 + 拦截命中 |
| 2026-10-29 | horn 全量接口覆盖 | ✅ HAR 实证 `horn_ios?id=` 与 `/mergeRequest` 并存，规则已扩展到两者 |
| 2026-10-29 | **horn 86 键真机验证** | ✅ 清数据冷启动 109MB HAR：697KB + 1.1MB 双全量响应，10/10 关键键反转（灵犀/midas/快手SDK/插屏/推送/券/夜间签到/直播/引导动画）|
| 2026-10-29 | 落地配置验证 | ✅ 沙盒 616 个 sakhorn 配置全部为清洗后的值 |
| 2026-10-29 | 幂等性 | ✅ 已清洗响应重跑 = 未修改（数值规则 `[1-9]\d*` 修复）|
| 2026-10-29 | v0.9.0 深度扫描 | ✅ 169 模块全量重扫 → 62 键变化（49 + 新增 13）/ JSON 合法 / 幂等通过 |
| 2026-10-29 | v1.0.0 全量穷举 | ✅ 2655 叶子键（1198 bool / 668 数字 / 374 字符串）→ 66 键变化 / 字符串内嵌 JSON 广告位已清 / 幂等通过 |
| 2026-10-29 | v1.1.0 隐私全关 | ✅ 90 键变化（66 + 24 处）/ 截图上传·指纹·采集上限·上报族全关 / 幂等通过 |
| 2026-10-29 | **v1.1.0 真机验证** | ✅ 177MB HAR 冷启动：703KB 全量响应 → 63 规则 0 残留 / 24 抽查键全对（含 allowShowDebugBoard=true）/ 幂等通过 |
| 2026-10-29 | v1.2.0 漏网扫描 | ✅ 基于真机 703KB 响应 +14 键（16 处变化）/ JSON 合法 / 幂等通过 |
| 2026-10-29 | v1.3.1 修正 | ✅ 测试环境 URL 3 条已回退（不动 deeplink/SSR）/ AB 分组+图标上报生效 / 18 处变化 / 幂等通过 |
| 2026-10-29 | **v1.6.0 成长值** | ✅ 等级+成长值组合 / 仅成长值 / 门槛换算（V1~V6 起点终点）/ 当前等级 info 清空 / 边界（abc/空）不生效 / 幂等 |
| 2026-10-29 | **v1.5.1 UI 修复** | ✅ 真机 HAR 证实 `data.memberLevel=6` 已改写但 UI 不变 → 定位到 `allLevelData[].realLevelCompare` / 已改为迁移该标记 + 状态字段 / V1~V6 全档位验证 / 幂等 |
| 2026-10-29 | **v1.5.0 等级自定义** | ✅ 5 接口等级字段全部改写（V1~V6）/ 参数边界（不修改/空/0/7/abc 不生效）/ 营销清洗与等级伪造并存 / 幂等通过 / `allLevelData` 定义表不动 |
| 2026-10-29 | **v1.4.0 会员页修复** | ✅ HAR 双状态对比定位（插件关=全部 200/插件开=3 个接口 2B）/ expose+SLevelBanner 放行 / 另两个响应清洗保留结构（5706→83B、8146→221B）/ 真实响应验证通过 |
| 2026-10-29 | **v1.4.0 真机确认** | ✅ 用户确认会员页恢复正常；抓包复核：expose 2469B 完整 / SLevelBanner 221B 完整 / dailyMagicalCoupon 83B（code:0 结构完整）/ featuredActivity 220B（保留 ifMember+memberLevel，仅清空活动列表）|
