# Bilibili-Dedup

> 合并 BiliUniverse ADBlock 与 kokoryh 两套能力，并与 blockAds 合集完全去重。

## 解决的问题

同时启用以下三者会产生大量冲突：

| 插件 | B 站 Rewrite | B 站 Script |
|---|---|---|
| kelee 哔哩哔哩去广告 | 20 | 4 |
| BiliUniverse ADBlock | 9 | 13 |
| blockAds 合集 | 23 | 4 |

实测比对（规则级）：

- **kelee ∩ blockAds = 15 条**，其中 13 条动作字节级相同
- **2 条 jq 规则动作不同**（`app.bilibili.com/x/v2/account/mine`、`x/resource/show/tab/v2`）
  → jq 串联执行，后者输入已被前者改过
- 三者同时启用时无任何一方能单独生效

## blockAds 的降级问题

blockAds 的 `[Script]` 段调用 kokoryh 的 `bilibili.protobuf.response.js`，
该脚本内置默认值：

```js
var L = Bn({displayUpList:"show", purifyComment:!0, sponsorBlock:!0})
initArgument(e){ Object.assign(this.argument, e) }   // 传入值覆盖默认值
```

但 blockAds 的 `[Argument]` 只定义了 `sponsorBlock` 和 `logLevel`，
`displayUpList` / `purifyComment` / `optimizeRequest` 三个参数未定义，
传入的 `undefined` 会覆盖脚本的正常默认值：

| 参数 | 脚本默认 | blockAds 传入 | 效果 |
|---|---|---|---|
| `sponsorBlock` | `true` | `true` | 正常工作 |
| `purifyComment` | `true` | `undefined` | 电商广告链接过滤被跳过 |
| `displayUpList` | `"show"` | `undefined` | 走 `auto` 分支而非 `show` |

此外 blockAds 的 `bilibili.request` 规则写着 `enable={optimizeRequest}`，
而 `optimizeRequest` 未定义 —— **该规则完全不生效**。

本插件用完整参数重新调用同一脚本，补回这三项。

## 本插件的取舍

### 保留（blockAds 未覆盖的增量）

- `api.vc.bilibili.com` 三个端点：搜索热搜、动态话题、动态最常访问
- `api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd?` 网页端推荐
- `api.bili*/pgc/page/(bangumi|cinema/tab?)` 番剧页
- `api.live.bilibili.com/xlive/app-interface/v2/index/feed` 直播推荐
- 屏蔽 UP 主直播推广（`Feed.BlockUpLiveList`）
- 完整参数的评论区净化 / 最常访问显示 / 评论区优化

### 排除（blockAds 已覆盖）

- **全部 23 条 blockAds Rewrite 规则** —— 含 2 条会打架的 jq
- **漫画去广告** —— blockAds 有 `bilimanhua_enable` 开关且规则更全
- BiliUniverse 的 grpc 规则 —— 与 blockAds 的 protobuf 规则重叠，
  而本插件已用完整参数覆盖同一批端点

### 与 blockAds 的重叠状态

```
Rewrite 层： 5 条 vs 23 条   →  零重叠  ✅
Script  层：同一批端点，但本插件参数完整
MITM 域名： 4 个重叠         →  Loon 合并去重，不产生二次解密
```

Script 层是**有意的双跑**：blockAds 先跑降级版，本插件后跑完整版。
kokoryh 脚本是 protobuf 幂等改写（各功能作用于不同字段，第二次执行
在已改过的 body 上是 no-op），最终结果等于完整版。

## 验证结果

```
Rewrite 层重叠:  0 条  ✅
Script  URL 重叠: 0 条  ✅
MITM 新增域名:   api.vc.bilibili.com  （唯一）
```

## 安装

1. **禁用** kelee 哔哩哔哩去广告
2. **禁用** BiliUniverse ADBlock（避免三开）
3. 导入本插件
4. 确认 Loon 已开启 **MitM over HTTP/2**（本插件 `[MitM] h2 = true`）
5. 重启 Loon

blockAds 合集**无需任何改动**，其 B 站部分继续提供空降助手等基础能力。

## 致谢与许可

未修改上游脚本任何逻辑，仅重组规则条目与参数声明。

- **BiliUniverse ADBlock** — ClydeTime, VirgilClyne, app2smile, RuCu6, Maasea
  <https://ADBlock.BiliUniverse.io>
- **kokoryh** — <https://github.com/kokoryh>
- **fmz200**（blockAds 合集，仅作为去重参照）— <https://github.com/fmz200/wool_scripts>

上游版权与许可条款全部适用。

## v2 复查修正记录

首版存在 3 个缺陷，已在 v2 修复：

| 缺陷 | 现象 | 修正 |
|---|---|---|
| **参数名大小写** | `bundle.js` 读取 `a.LogLevel`（大写 L），首版传 `logLevel` | 同时声明 `LogLevel`（供 bundle）与 `logLevel`（供 kokoryh），二者是不同参数 |
| **`Dynamic.MostVisited` 默认值** | 首版设为 `true`，bundle 会执行 `i.upList=void 0` 整块删除「最常访问」，与 kokoryh 的 `displayUpList="show"` 方向相反，两个脚本互相打架 | 改为 `false`，并补充说明：生效前需先关闭该项 |
| **`[Rewrite]` 非法语法** | 首版用 `script-response-body,requires-body=1` 调脚本，但 Loon 的 `[Rewrite]` 不支持调脚本（那是 Surge 写法），且与 `[Script]` 段重复 | 删除这 2 条规则，仅保留 `[Script]` 版本 |

另修正：直播规则端点从 `xlive/app-interface/v2/index/feed` 改为
`xlive/app-room/v1/index/getInfoByRoom` —— 前者在 `bundle.js` 中出现 **0 次**，
是一条不会生效的死规则。

参数传递机制说明：`bundle.js` 用 lodash `set` 合并 `$argument`，
**支持点号路径**，因此 `Feed.AD` 这类嵌套名会正确展开为 `{Feed:{AD:...}}`，
无需在清单层做嵌套结构。
