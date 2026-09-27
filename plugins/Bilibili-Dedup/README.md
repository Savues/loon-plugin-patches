# Bilibili-Dedup

B 站去广告 + 漫画净化 + 本地会员伪装，与 `blockAds` 合集去重后独立运行。

**当前版本：v7.10** · 32 参数 / 5 Rule / 29 Rewrite / 11 Script

> 📖 版本演进与踩坑复盘见 [BILIBILI-ITERATION.md](../../BILIBILI-ITERATION.md)
> 本文只描述**当前状态**，不记录历史。

---

## 订阅

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Dedup/Bilibili-Dedup.lpx
```

CDN 缓存可能延迟更新。拉不到新版时在末尾加随机参数：`...lpx?cb=v79`

**需要开启 MitM over HTTP/2。**

---

## 一、与 blockAds 的关系

blockAds（奶思合集）内置了 kokoryh 的完整 B 站规则集，与本插件功能重叠。
本仓库的 [`patches/patch-blockads.py`](../../patches/README.md) 会把合集里的 B 站部分**整体退场**：

| 段 | 退场内容 |
|---|---|
| `[Rewrite]` | 23 条 |
| `[Script]` | 4 条 |
| `[Rule]` | 5 条 |
| `[MITM]` | 6 个域名 |

其余 700+ App 的规则逐字节不动。GitHub Actions 每 6 小时自动同步上游并重施补丁。

---

## 二、功能

### 去广告

推荐流 / 动态 / 搜索 / 番剧 / 直播 / 评论 / 播放页 / 开屏 / 短视频流 / 视频中插广告（空降助手）。

### 本地会员伪装

把未开通账号的响应改成大会员状态，**5 种主题可切换**：

| 参数 `vipTheme` | 显示 | `role` | 配色 |
|---|---|---|---|
| `fools_day_hundred_annual_vip` | **最强绿鲤鱼** | 15 | 绿底黑字 |
| `hundred_annual_vip` | 百年大会员 | 15 | 粉底白字 |
| `ten_annual_vip` | 十年大会员 | 7 | 粉底白字 |
| `annual_vip` | 年度大会员 | 3 | 粉底白字（**含真实牌子图**） |
| `vip` | 大会员 | 1 | 粉底白字 |

已开通的真实大会员账号**不会被改动**（判据 `status == 0`）。

**个人资料页**（`x/v2/space`）由独立开关 `localVIPSpace` 控制，用的是**另一套字段名**：

| | 账号页 / 我的页 | 个人资料页 |
|---|---|---|
| 端点 | `myinfo`、`account/mine` | `x/v2/space`(+`archive/cursor`) |
| 类型 | `type` / `status` | `vipType` / `vipStatus` |
| 到期 | `due_date` | `vipDueDate` |
| 非会员时 | `vip.status == 0` | **整个 `vip` 字段不存在** |

后者的差异是重点 —— B 站在非会员时会**直接删掉整个字段**而不是给 0，
所以脚本以「字段不存在或未开通」为判据，必要时构造整个对象。

### 漫画净化

`manga.bilibili.com` 的推荐流、热门搜索、促销弹窗等，开关 `mangaAD`。

### 其他

关闭弹幕 P2P（`[Rule]` 段 5 条，**无开关**）。

---

## 三、参数（31 个）

### 本地会员

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `localVIP` | switch | 开 | **总开关** |
| `vipTheme` | select | 最强绿鲤鱼 | 5 种主题 |
| `vipText` | input | 空 | 牌子文字，留空用主题默认 |
| `vipBg` / `vipFg` | input | 空 | 底色 / 字色，留空用主题默认 |
| `vipImg` | input | 空 | 牌子图，留空用主题自带 |
| `localVIPSpace` | switch | 开 | 个人资料页会员伪装（与上面共用主题/配色） |

### 界面（交由 [Bilibili-UI](../Bilibili-UI/README.md) 处理）

本插件不控制顶栏、标签页、底部导航。

### 其他

| 参数 | 默认 | 说明 |
|---|---|---|
| `sponsorBlock` | 开 | 空降助手（跳过视频内插广告） |
| `optimizeRequest` | 开 | 优化评论区加载 |
| `purifyComment` | 开 | 移除评论区置顶商品广告 |
| `displayUpList` | `show` | 最常访问：`show`/`hide`/`auto` |
| `mangaAD` | 开 | 漫画去广告 |
| `logLevel` | `off` | kokoryh 脚本日志 |
| `LogLevel` | `WARN` | 其他脚本日志 |

---

## 四、兼容性

### ⚠️ 与 Bilibili-UI 的 `Mine` 功能冲突

两者都改写 `x/v2/account/mine`。本插件只改 `vip` / `vip_type` 字段，
Bilibili-UI 改服务列表，**字段不重叠**。但同一响应上有两个脚本，改写顺序不可控 ——
需要「我的」页自定义时，先关掉本插件的 `localVIP`。

### blockAds 已退场

启用本插件前请确认合集用的是本仓库的 **退场版**，否则 B 站规则会重复执行。

---

## 五、验证依据

本插件的字段选择基于**用户实测的双抓包对照**（插件开 / 关各一份），非文档推断：

| 字段 | 原生响应实测 | 结论 |
|---|---|---|
| `due_date` | `1721577600000` | **毫秒**时间戳 |
| `status` / `type` | 0 / 1 | 置 1 / 2 |
| `role` | 0 | 主题对应值 |
| `vip_section` | 存在 | 已删除 |
| `vip_type` | 0 | 置 2 |

墨鱼 `Module.sgmodule` 与原生一致（毫秒），可交叉印证。

---

## 致谢

未修改上游脚本任何逻辑，仅重组清单条目与参数声明。

- **Maasea** <https://github.com/Maasea> — B 站 protobuf 脚本
- **kokoryh** <https://github.com/kokoryh> — bilibili protobuf / 空降助手
- **VirgilClyne**、**app2smile** — BiliUniverse ADBlock
- **fmz200（奶思）** <https://github.com/fmz200/wool_scripts> — blockAds 合集，规则来源
- **zirawell** <https://github.com/zirawell/R-Store> — 年度大会员牌子图与实现参考

上游版权与许可全部适用。
