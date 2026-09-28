# Bilibili-Dedup · 哔哩哔哩去广告(合并版)

> B 站去广告 + 漫画净化 + 本地会员伪装，与 blockAds 合集去重后独立运行。
> Bilibili ad-block, comics cleanup and local-VIP spoofing, de-duplicated from blockAds.

**v7.15** · 14 参数 / 5 Rule / 18 Rewrite / 10 Script

| | 中文 | English |
|---|---|---|
| 端点 | `myinfo`、`account/mine`、`account/mine/ipad`、`x/v2/space`、`x/v2/space/archive/cursor` | same |
| 脚本 | 2 个托管脚本 + 2 个远程引用 | 2 hosted + 2 remote |
| 开关 | `localVIP`、`localVIPSpace` 独立可控 | independently toggleable |
| 历史 | 见 [迭代记录](../../BILIBILI-ITERATION.md) | see the post-mortem |

> 本文只描述**当前状态**。Why things are the way they are → 迭代记录。

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Dedup/Bilibili-Dedup.lpx
```

CDN 缓存可能延迟更新，拉不到新版时加随机参数：`...lpx?cb=v712`

**需开启 MitM over HTTP/2。** Enable MitM over HTTP/2.

---

## 一、与 blockAds 的关系

blockAds（奶思合集）内置了 kokoryh 的完整 B 站规则集，与本插件功能重叠。
[`patch-blockads.py`](../../patches/README.md) 把合集里的 B 站部分**整体退场**：

| 段 | 退场内容 |
|---|---|
| `[Rewrite]` | 23 条 |
| `[Script]` | 4 条 |
| `[Rule]` | 5 条 |
| `[MITM]` | 6 个域名 |

其余 700+ App 的规则逐字节不动，Actions 每 6 小时自动同步。
The other 700+ apps are byte-for-byte untouched; Actions re-syncs every 6 hours.

---

## 二、功能 · Features

### 去广告 · Ad removal
推荐流 / 动态 / 搜索 / 番剧 / 直播 / 评论 / 播放页 / 开屏 / 短视频流 / 视频内插广告
Feed, dynamic, search, PGC, live, comments, playback, splash, shorts, in-video ads.

### 本地会员伪装 · Local VIP

5 种主题可切换，**已开通的真实大会员不会被改动**（判据 `status == 0`）。

| `vipTheme` | 显示 | `role` | 配色 |
|---|---|---|---|
| `fools_day_hundred_annual_vip` | **最强绿鲤鱼** | 15 | 绿底黑字 |
| `hundred_annual_vip` | 百年大会员 | 15 | 粉底白字 |
| `ten_annual_vip` | 十年大会员 | 7 | 粉底白字 |
| `annual_vip` | 年度大会员 | 3 | 粉底白字 |
| `vip` | 大会员 | 1 | 粉底白字 |

**Personal profile (`x/v2/space`) uses a different schema** and needs its own switch:

| | 账号页 / 我的页 | 个人资料页 |
|---|---|---|
| 端点 | `myinfo`、`account/mine` | `x/v2/space`(+`archive/cursor`) |
| 类型 | `type` / `status` | `vipType` / `vipStatus` |
| 到期 | `due_date` | `vipDueDate` |
| 非会员时 | `vip.status == 0` | **整个 `vip` 字段不存在** |

> ⚠️ 空间页有**两份 `vip`**，主页顶栏读的是 `data.card.vip` 而非 `data.vip`。
> 抓包实证：只写 `data.vip` 时顶栏仍显示灰色。**两处现在都会写入**，
> 且 `label` 对象逐字段一致，因此两页显示效果相同。
>
> The profile page has **two** `vip` objects; the header reads `data.card.vip`.
> Writing only `data.vip` leaves the header grey. Both are now written.

### 漫画净化 · Comics
`manga.bilibili.com` 的推荐流、热门搜索、促销弹窗等 · 开关 `mangaAD`

### 其他 · Misc
关闭弹幕 P2P（`[Rule]` 段 5 条，**无开关** · no switch）。

---

## 三、参数 · Parameters

### 本地会员 · Local VIP

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `localVIP` | switch | 开 | 账号页总开关 |
| `localVIPSpace` | switch | 开 | 个人资料页开关 |
| `vipTheme` | select | 最强绿鲤鱼 | 5 种主题 |
| `vipText` / `vipBg` / `vipFg` / `vipImg` | input | 空 | 留空用主题默认 |

### 规则设计约定

| 约定 | 说明 |
|---|---|
| `[Rule]` 层 REJECT 的域名 | 走 DNS 拦截，**不进 `[MITM]`** |
| `[Rewrite]` 规则 | **无条件生效** —— Loon 手册中 `enable=` 仅记载于 `[Script]` |
| URL 正则 | 只写实际使用的域名，不留 `ap[ip]` 这类历史变体分支 |

### kokoryh 脚本 · kokoryh scripts

| 参数 | 默认 | 说明 |
|---|---|---|
| `sponsorBlock` | 开 | 空降助手（跳过视频内插广告） |
| `optimizeRequest` | 开 | 优化评论区加载 |
| `purifyComment` | 开 | 移除评论区置顶商品广告 |
| `displayUpList` | `show` | 最常访问：`show`/`hide`/`auto` |
| `logLevel` | `off` | kokoryh 脚本日志 |
| `LogLevel` | `WARN` | BiliUniverse 脚本日志 |

> 界面（顶栏/标签页/底栏）由 [Bilibili-UI](../Bilibili-UI/) 负责，本插件不控制。

---

## 四、兼容性 · Compatibility

| 冲突 | 说明 |
|---|---|
| Bilibili-UI 的 `Mine` 功能 | 两者都改 `account/mine`。字段不重叠（`vip` vs 服务列表），但同响应两脚本顺序不可控。要用我的页自定义时先关本插件 `localVIP` |
| blockAds | 须使用**退场版**，否则 B 站规则重复执行 |

---

## 五、验证依据 · Verification

字段选择基于**用户实测双抓包对照**（插件开/关各一份），非文档推断：

| 字段 | 原生实测 | 结论 |
|---|---|---|
| `due_date` | `1721577600000` | **毫秒**时间戳 |
| `status` / `type` | 0 / 1 | 置 1 / 2 |
| `vip_section` | 存在 | 已删除 |
| `ott_info` / `super_vip` / `tv_*` | — | 未被误伤 |

墨鱼 `Module.sgmodule` 与原生一致（毫秒），可交叉印证。

> 另：App 对空间页会员标**走文字渲染**（`text` + `bg_color`），
> 抓包里一次 `/bfs/vip/` 图片请求都不发，故 `image` 留空即可。

---

## 致谢 · Credits

未修改上游脚本任何逻辑，仅重组清单条目与参数声明。
No upstream logic modified — only manifest entries and parameter declarations.

| 作者 | 项目 |
|---|---|
| **Maasea** | B 站 protobuf 脚本 |
| **kokoryh** | bilibili protobuf / 空降助手 |
| **VirgilClyne**、**app2smile** | BiliUniverse ADBlock |
| **fmz200（奶思）** | blockAds 合集（规则来源） |
| **zirawell** | 年度大会员实现参考 |

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
