# Bilibili-Dedup

> 合并 BiliUniverse ADBlock 与 kokoryh 两套能力，并与 blockAds 合集完全去重。

---

## 一、要解决的问题

同时启用以下三者会产生大量冲突：

| 插件 | B 站 Rewrite | B 站 Script |
|---|---|---|
| kelee 哔哩哔哩去广告 | 20 | 4 |
| BiliUniverse ADBlock | 9 | 13 |
| blockAds 合集 | 23 | 4 |

规则级实测比对：

- **kelee ∩ blockAds = 15 条**，其中 13 条动作字节级相同
- **2 条 jq 规则动作不同**（`app.bilibili.com/x/v2/account/mine`、
  `x/resource/show/tab/v2`）→ jq 串联执行，后者读到的 body 已被前者改过
- 三者同时启用时无任何一方能单独生效

### 冲突根源

`blockAds` 合集内置了 **kokoryh 的完整 B 站规则集**：

```
kelee 插件 #!author = kokoryh
blockAds 里的 jq 源  = raw.githubusercontent.com/kokoryh/Sparkle/...
blockAds 里的 JS     = kokoryh/Sparkle/master/dist/bilibili.protobuf.*.js
```

同作者、同一套规则，只是托管位置不同。

---

## 二、blockAds 的降级问题

`blockAds` 的 `[Script]` 段调用 kokoryh 的 `bilibili.protobuf.response.js`。
该脚本**内置默认值**：

```js
var L = Bn({displayUpList:"show", purifyComment:!0, sponsorBlock:!0})
initArgument(e){ Object.assign(this.argument, e) }   // 传入值覆盖默认值
```

而 `blockAds` 的 `[Argument]` 只定义了 `sponsorBlock` 和 `logLevel`。
另外三个参数未定义，传进来的 `undefined` 会**覆盖掉脚本的正常默认值**：

| 参数 | 脚本默认 | blockAds 传入 | 实际效果 |
|---|---|---|---|
| `sponsorBlock` | `true` | `true` | ✅ 正常工作 |
| `purifyComment` | `true` | `undefined` | ❌ 电商广告链接过滤被跳过 |
| `displayUpList` | `"show"` | `undefined` | ❌ 走 `auto` 分支而非 `show` |

更严重的是，`blockAds` 的 `bilibili.request` 规则写着 `enable={optimizeRequest}`，
而 `optimizeRequest` **未在 `[Argument]` 中定义** —— 该规则**完全不生效**。

> 注：`sponsorBlock` 是唯一正常工作的，所以用户主观感受是「空降助手很好用」，
> 其他功能却是哑的。

本插件用完整参数重新调用同一脚本，补回这三项。

---

## 三、本插件的取舍

### 保留（blockAds 未覆盖的增量）

- `api.vc.bilibili.com` ×3：搜索热搜、动态话题、动态最常访问
- `api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd?` 网页端推荐
- `api.bili*/pgc/page/(bangumi|cinema/tab?)` 番剧页
- `api.live.bilibili.com/xlive/app-room/v1/index/getInfoByRoom` 直播房间
- 屏蔽 UP 主直播推广（`Feed.BlockUpLiveList`）
- 完整参数的评论区净化 / 最常访问显示 / 评论区优化

### 排除（blockAds 已覆盖）

- **全部 23 条 blockAds Rewrite 规则** —— 含 2 条会打架的 jq
- **漫画去广告** —— blockAds 有 `bilimanhua_enable` 开关且规则更全
- BiliUniverse 的 grpc 规则 —— 与 blockAds 的 protobuf 规则重叠，
  而本插件已用完整参数覆盖同一批端点

### 重叠状态

```
Rewrite 层：3 条 vs 23 条  →  零重叠  ✅
Script  层：同一批端点，但本插件参数完整
MITM 域名：4 个重叠         →  Loon 合并去重，不产生二次解密
```

Script 层是**有意的双跑**：blockAds 先跑降级版，本插件后跑完整版。
kokoryh 脚本是 protobuf 幂等改写（各功能作用于不同字段，第二次执行
在已改过的 body 上是 no-op），最终结果等于完整版。

---

## 四、v2 复查：首版的 3 个缺陷

首版发布后逐字节核对了 `bundle.js` 与 kokoryh 脚本的参数读取逻辑，
发现以下问题。**三者都出在「清单层写的参数」与「脚本实际读取的键」不匹配**。

### 缺陷 1：参数名大小写 —— 静默失效

`bundle.js` 读取的是 `a.LogLevel`（**大写 L**）：

```js
a.LogLevel && (d.logLevel = a.LogLevel)
i.Settings.LogLevel && (d.logLevel = i.Settings.LogLevel)
```

首版只传了 `{logLevel}`（小写）→ **4 条 BiliUniverse 规则的日志开关完全无效**，
且不会报任何错误。

**修正**：同时声明两个参数。它们本来就是两套独立参数：

- `LogLevel`（大写 L）→ 供 BiliUniverse `bundle.js`
- `logLevel`（小写）→ 供 kokoryh `bilibili.protobuf.*.js`

### 缺陷 2：`Dynamic.MostVisited` 默认值写反 —— 自造冲突

`bundle.js` 的处理逻辑：

```js
e?.Dynamic?.MostVisited === !0
  ? (d.info("✅ 动态综合页最常访问去除"), i.upList = void 0)   // 整块删除
  : e?.Dynamic?.MostVisitedLiveOnly === !0 ? ... : ...
```

首版写成 `Dynamic.MostVisited = switch,**true**` → **bundle 会整块删掉「最常访问」**。

而 kokoryh 侧 `displayUpList="show"` 的处理是：

```js
function Ni(a,e){ if(e==="show" || iPad) return; ... }   // 直接 return，保留
```

**两个脚本对同一字段 `upList` 反向操作**，谁后跑谁赢 —— 这是首版自己引入的新冲突。

**修正**：改回原版的 `false`，并在参数说明中写明
「开启会整块删除该模块；关闭则交由 `displayUpList` 控制」。

### 缺陷 3：`[Rewrite]` 段语法非法

首版有两条规则：

```ini
[Rewrite]
^https?:\/\/api\.bilibili\.com\/x\/web-interface\/wbi\/... script-response-body,requires-body=1
```

**Loon 的 `[Rewrite]` 段不支持调用脚本** —— `script-response-body` 是 Surge 的写法。
Loon 调脚本必须写在 `[Script]` 段。而且首版在 `[Script]` 段已经写了同样的规则，
纯属重复。

**修正**：删除这 2 条规则，仅保留 `[Script]` 版本。

### 附带修正：一条死规则

直播规则原指向 `xlive/app-interface/v2/index/feed`，
但该字符串在 `bundle.js` 中出现 **0 次** —— 指向一个脚本根本不处理的端点。

`bundle.js` 实际支持的直播端点只有 `xlive/app-room/v1/index/getInfoByRoom`。

**修正**：改指 `getInfoByRoom`。

### 一个误报

`requires-body=1` 一度被当作 bug，检查 BiliUniverse 原版后确认
**其 13 条规则全部使用 `=1`**，Loon 接受该写法，无需修改。

---

## 五、怎么发现这些问题的（方法论）

三个 bug 全部**无法通过阅读清单文件发现**，必须读脚本源码。

关键动作：

```bash
# 1. 下载被引用的远程脚本
curl -sL "https://github.com/BiliUniverse/ADBlock/releases/download/v0.6.24/response.bundle.js"

# 2. 搜出它实际读取的开关名
grep -oE '\be\??\?\.(\w+\??\?\.)?\w+' bundle.js
#   → e?.Splash / e?.Feed?.AD / e?.Search?.HotSearch / a.LogLevel ...

# 3. 逐个与清单层声明的参数名比对（注意大小写与嵌套层级）
```

三个容易踩空的点：

1. **逐级可选链会骗过字面量搜索** —— 源码里写的是 `e?.PGC?.AD`，
   搜字符串 `"PGC.AD"` 得到 0 次命中
2. **嵌套参数名靠 lodash `set` 展开**：

   ```js
   Object.keys($argument).forEach(e => c.set(a, e, $argument[e]))
   ```

   `c.set` 是 lodash.set，支持点号路径，所以 `Feed.AD` 会正确展开成
   `{Feed:{AD:true}}`。**清单层不需要做嵌套结构** —— 这点原本担心错了。
3. **默认值写在脚本里**（`Bn({...})`），传 `undefined` 会覆盖而非回退

---

## 六、验证结果

```
Rewrite 层与 blockAds 重叠:  0 条
Script  URL 重叠:            0 条
MITM 新增域名:               api.vc.bilibili.com（唯一）
6 条规则参数数量:             kokoryh 2/4 项，bundle 4×19 项（完整）
```

---

## v3 修正：补回 AIRelateAsync（v2 回归）

### 现象

使用 v2 后，**视频页右上角推荐位出现广告**（标签「广告 / 立即下载」）。

### 原因

v2 的 protobuf 响应规则是从 `blockAds` 抄的，比 `kelee` 少一个端点：

```
kelee    : view(unite)?\.v1\.View\/(View|ViewProgress|RelatesFeed|AIRelateAsync)
blockAds : view(unite)?\.v1\.View\/(View|ViewProgress|RelatesFeed)
v2 合并版 : view(unite)?\.v1\.View\/(View|ViewProgress|RelatesFeed)      ← 缺
```

`AIRelateAsync` 即**右侧 AI 推荐栏**，其处理函数无条件执行、不受任何参数控制：

```js
si=(a,e)=>{
  let t=jt.fromBinary(a.response.bodyBytes)
  return t.cm=void 0,                            // 删除广告位
         t.module.modules=oi(t.module.modules),  // 过滤 type 18/29/37/55/63 的广告卡
         ...
}
function oi(a){ let e=[18,29,37,55,63]; return a.filter(t=>!e.includes(t.type) && ...) }
```

### 教训

去重时不能只看「谁覆盖得多」，要看**谁覆盖得全**。
`blockAds` 的版本是从 kelee 抄的**删减版**（少 `AIRelateAsync`），
我以它为基准做去重，等于继承了它的删减 —— **而删掉的部分正是 blockAds 自己缺失的功能**。

正确做法：**以覆盖面最全的那一份为基准**去算差集，而不是以需要「让开」的那份为基准。

### 修正

v3 将 `AIRelateAsync` 补回，与 kelee 端点列表完全一致。
Rewrite 层与 Script 层对 blockAds 的重叠仍为 0。

## 七、安装

1. **禁用** kelee 哔哩哔哩去广告
2. **禁用** BiliUniverse ADBlock（避免三开）
3. 导入本插件
4. 确认 Loon 已开启 **MitM over HTTP/2**（本插件 `[MITM] h2 = true`）
5. 重启 Loon

blockAds 合集**无需任何改动**，其 B 站部分继续提供空降助手等基础能力。

### 参数说明

| 参数 | 作用 |
|---|---|
| `Dynamic.MostVisited` | **开启 = 整块删除「最常访问」**。想保留请设为关 |
| `displayUpList` | `show` 始终显示 / `hide` 隐藏 / `auto` 仅直播时显示 |
| `purifyComment` | 补回 blockAds 跳过的电商广告链接过滤 |
| `optimizeRequest` | 补回 blockAds 中**完全失效**的评论区优化 |
| `sponsorBlock` | 空降助手，与 blockAds 共存 |
| `LogLevel` | BiliUniverse 规则日志等级 |
| `logLevel` | kokoryh 规则日志等级（与上一项**不是同一个参数**） |

---

## 致谢与许可

未修改上游脚本任何逻辑，仅重组规则条目与参数声明。

- **BiliUniverse ADBlock** — ClydeTime, VirgilClyne, app2smile, RuCu6, Maasea
  <https://ADBlock.BiliUniverse.io>
- **kokoryh** — <https://github.com/kokoryh>
- **fmz200**（blockAds 合集，仅作为去重参照）— <https://github.com/fmz200/wool_scripts>

上游版权与许可条款全部适用。

## v4 修正：补回 `https://` 前缀（v2/v3 的根本缺陷）

### 现象

v2 和 v3 启用后，**视频页右侧推荐广告仍在**；但同时启用 kelee 插件则广告消失。

### 原因：protobuf 规则从未执行

v2/v3 的两条 kokoryh 规则都**缺少 `https:\/\/` 前缀**：

```
kelee : ^https:\/\/(grpc\.biliapi\.net|app\.bilibili\.com)\/bilibili\.(...)
v2/v3 :     (grpc\.biliapi\.net|app\.bili(bili\.com|api\.net))\/bilibili\.(...)   ← 缺
```

Loon 的 `^` 锚定 **URL 开头**，而真实 URL 形如
`https://grpc.biliapi.net/bilibili.app.viewunite.v1.View/AIRelateAsync`。

正则从 `grpc` 起始匹配，**永远匹配不到任何请求**。这类错误：

- 正则语法完全合法，Loon 加载**不报错**
- 规则显示在插件里、参数齐全、开关可点
- 但一次都不会触发 —— **整个 protobuf 净化链是空转的**

这解释了为什么 v2 补了 `AIRelateAsync` 仍然无效：不是那一条漏了，是
**两条规则全部失效**。评论净化、最常访问显示、右侧推荐过滤统统没跑。

### 两个版本的错误叠加

| 版本 | 缺陷 | 后果 |
|---|---|---|
| v2 | 缺 `AIRelateAsync` | 右侧 AI 推荐未过滤 |
| v3 | 补了 `AIRelateAsync`，但仍缺协议前缀 | 规则整体不触发，补了也白补 |
| **v4** | 补 `https:\/\/` 前缀 | 21 个真实端点全部命中 |

### 教训

**URL 正则不能靠肉眼比对，必须用真实 URL 实跑。**

已据此新增 `scripts/rule-test.py`（随本仓库一并维护在 loon-plugin-patching skill 中）：

```bash
rule-test.py <插件文件> --urls urls.txt
```

它会做两件事：

1. **协议前缀体检** —— 扫描所有 `[Script]` 规则，标出缺 `https://` 前缀的
2. **真实 URL 实跑** —— 用 Python `re` 对实际端点逐条测试命中情况

v3 用它能立刻被拦下，v4 则报告 `覆盖 21/21 个端点`。

> 顺带说明：早期 v2→v3 的排查中，我用"和 kelee 的规则串做字符级 diff"来定位，
> 那个方法在这里是**失效**的 —— 两个字符串确实只差前缀，但"差什么"靠眼看，
> "能不能匹配"只能靠实跑。

## v5：版本标识 + 默认全开

### 版本标识

插件头部加了可直接肉眼确认的标记：

```
#!name=哔哩哔哩去广告(合并版) v5
#!desc=[插件版本 v5 / 构建 2026-09-27T22:20] ...
# ==== PLUGIN_VERSION: 5.0.0 | MINIS_BUILD: 2026-09-27T22:20 | 协议前缀: OK | 端点覆盖: 21/21 ====
```

**Loon 插件列表直接显示 `#!name`**，所以不用打开文件就能确认版本。

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存可能长达 24h。
> 若拉到的仍是旧版，两种办法：
> 1. 等缓存过期（实测约 1~24 小时不等）
> 2. 在订阅地址末尾加一个随机参数强制刷新：
>    `.../Bilibili-Dedup.lpx?cb=2`
>
> **判断是否为本版：Loon 插件列表里的标题有没有 `v5`。**

### 默认开关

去广告类全部默认开启，共 18 项：

```
Splash  Feed.AD  Feed.Activity  Feed.Vertical  Feed.Story  Search.AD  Search.HotSearch
PGC.AD  Xlive.AD  Dynamic.HotTopics  Dynamic.AdCard  View.AD  DM.Command
DM.Colorful  Reply.AD  purifyComment  optimizeRequest  sponsorBlock
```

以下 4 项**虽是默认开，但它们删的不是广告**（参数 desc 里标了 ⚠️），不想要就手动关：

| 开关 | 实际影响 |
|---|---|
| `Feed.Vertical` | 删掉竖屏视频内容 |
| `Search.HotSearch` | 隐藏热搜榜 |
| `Dynamic.HotTopics` | 隐藏话题入口 |
| `DM.Colorful` | 会员彩色弹幕降级为普通弹幕 |

以下 2 项**必须保持关闭**：

| 开关 | 原因 |
|---|---|
| `Dynamic.MostVisited` | 开启 = 整块删除「最常访问」，与 `displayUpList` 方向相反会打架 |
| `Dynamic.MostVisitedLiveOnly` | 与 `displayUpList` 二选一，用后者即可 |

---

# 版本演进全记录

| 版本 | 缺陷 | 状态 |
|---|---|---|
| v1 | 参数名大小写错误；`Dynamic.MostVisited` 默认值写反；`[Rewrite]` 误用 Surge 语法；指向脚本未处理的死端点 | 修正 |
| v2 | 丢失 `AIRelateAsync`（以 blockAds 删减版为基准做去重） | 修正 |
| v3 | 补了 `AIRelateAsync`，但**两条 protobuf 规则缺 `https://` 前缀，从未触发** | 修正 |
| **v4/v5** | — | 21/21 端点命中 |

**v2→v3 的教训**：用「和 kelee 规则串做字符级 diff」定位，方法在这里失效 ——
两个串确实只差前缀，但"差什么"靠眼看，"能不能匹配"只能靠实跑。
`rule-test.py` 由此而来。

## v6：接管 blockAds 全部 B 站能力

blockAds 的 B 站部分已由配套补丁**整体退场**（`patches/patch-blockads.py`：
23 条 Rewrite + 8 条 Script + 5 条 Rule + 6 个 MITM 域名）。
本版接管其中此前缺失的部分。

### 新增：空降助手请求侧

**这是 v5 的重大缺口。** v5 的空降助手只有响应侧没有请求侧，
而 kokoryh 的 request 脚本路由表里明确需要它：

```
v1.DM/DmSegMobile      -> Ct      ← 空降助手的数据来源
viewunite.v1.View/View -> tt
v1.Reply/MainList      -> tt
```

v5 抄 blockAds 规则时只取了 `enable={optimizeRequest}` 那条，
漏了 `enable={sponsorBlock}` 的 `DmSegMobile` 请求规则 ——
这就是「Dedup 的空降助手不如 blockAds 好用」的原因。

```ini
http-request .../bilibili\.community\.service\.dm\.v1\.DM/DmSegMobile$
  script-path=.../bilibili.protobuf.request.js
  enable={sponsorBlock}, tag=空降助手
```

### 新增：漫画去广告（8 条 Rewrite + 1 条 Script）

自 blockAds 原样迁入，开关 `mangaAD`（默认开）。
`manga.bilibili.com` 加入 `[MitM]`。

### 新增：[Rule] 段的 5 条拦截

```ini
DOMAIN,api.biliapi.com,REJECT          # 旧版 API，已停用
DOMAIN,app.biliapi.com,REJECT
DOMAIN,api.biliapi.net,REJECT
DOMAIN,app.biliapi.net,REJECT
AND,((DOMAIN-SUFFIX,chat.bilibili.com),(OR,stun|tracker|p2p)) REJECT   # 关弹幕 P2P
```

最后一条在 blockAds 原文中只含 `stun|tracker`，这里按 kelee 的版本
补上了 `p2p`。

### 迁移后的能力对照

| 能力 | 状态 |
|---|---|
| 去广告（推荐/动态/搜索/番剧/直播/评论） | ✅ |
| 空降助手（请求 + 响应） | ✅ **v6 补全** |
| 评论区电商广告过滤 | ✅ |
| 评论区加载优化 | ✅ |
| 画中画 / 后台播放 | ✅ |
| 漫画去广告 | ✅ **v6 新增** |
| 关闭弹幕 P2P | ✅ **v6 新增** |
| 顶栏 / 标签栏 / 底部导航 | ❌ 已交还 Biliverse Enhanced |

### v6.1 补全：漫画静态资源与 manhuaren 接口

退场校验最初只匹配 `bilibili*.com` 系域名，**漏掉了 B 站漫画用的另外两个域**：

| 规则 | 域名 | 上游动作 |
|---|---|---|
| 2 条 | `i\d.hdslb.com/bfs/manga-static/` | `reject-200` |
| 3 条 | `*mangaapi.manhuaren.*` | `reject` |

因此 blockAds 退场版 v1 仍有 5 条漫画规则生效。v6.1 已把这 5 条
连同 `i*.hdslb.com`、`mangaapi.manhuaren.com` 两个 MITM 域名一并迁入，
blockAds 侧的判定也扩展为 `hdslb.com|manhuaren`。

> 教训：判定「B 站相关」不能只看主域名。B 站漫画走 `hdslb.com`（CDN）
> 和 `manhuaren.com`（漫画 API），与 `bilibili.com` 无关。

## v7：补全 17 条遗漏的 blockAds 规则

v6 之前把 blockAds 的 B 站 Rewrite 规则当成「重复」整体排除，
但其中**有 17 条提供的是功能而非去广告**，排除后全部丢失。

### 最重要的一条：大会员伪装

```ini
^https:\/\/app\.bilibili\.com\/x\/v2\/account\/myinfo\? response-body-json-jq
  '.data.vip |= if . != null and .status == 0 then
     . + { status: 1, type: 2, due_date: 9005270400000, role: 15 } else . end'
```

伪装 `status/type/role` 三个字段，`due_date` 设为公元 2999 年。
**不加这条就没有本地大会员。** v7 已加回，并提供 `localVIP` 开关可一键关闭。

### 完整遗漏清单

| 功能 | 规则 | 动作 |
|---|---|---|
| **大会员伪装** | `app.bilibili.com/x/v2/account/myinfo` | jq 改 vip 字段 |
| **推荐页去广告** | `app.bilibili.com/x/v2/feed/index` | jq 过滤 banner/ad_info |
| **短视频流去广告** | `app.bilibili.com/x/v2/feed/index/story` | jq |
| **关闭 P2P** | `api.bilibili.com/x/pd-proxy/tracker` | jq 改写 tracker 地址 |
| 去付费入口 | `api.bilibili.com/pgc/view/v2/app/season` | `del(.data.payment)` |
| 番剧页模块过滤 | `api.bilibili.com/pgc/page/channel` | jq |
| 开屏广告 | `app.bilibili.com/x/v2/splash/*` | jq |
| 皮肤精简 | `app.bilibili.com/x/resource/show/skin` | `del data.common_equip` |
| 搜索默认词 | `grpc.../Search/DefaultWords` | mock base64 |
| 青少年模式 | `grpc.../Teenagers/ModeStatus` | mock base64 |
| 播放页/完播页 | `grpc.../(view.v1.View/TFInfo\|viewunite.v1.View/ViewEndPage)` | mock 空响应 |
| grpc 状态码 | 上述三条的合并规则 | `response-header-add grpc-status 0` |
| 直播购物信息 | `api.live.bilibili.com/.../get_shopping_info` | reject-dict |
| 游戏直播素材 | `line3-h5-mobile-api.biligame.com/.../large_card_material` | reject-dict |
| 漫画接口 | `manga.bilibili.com/twirp/comic...` | reject-dict |
| 广告位/活动页 | `ap[ip].bilibili.com/x/(resource/top/activity\|v2/search/square\|vip/ads/materials)` | mock 404 |
| 活动投放 | `api.bilibili.com/pgc/activity/deliver/material/receive` | mock close_win |

**归 Biliverse Enhanced 的 2 条未迁入**（避免冲突）：

```
app.bilibili.com/x/resource/show/tab/v2     ← 标签栏
app.bilibili.com/x/v2/account/mine          ← 我的页服务入口
```

### 教训

去重时不能按「谁做过」判断，该按「**这个功能由谁承担**」判断。
当时把 blockAds 的 B 站规则整体当重复排除，漏掉了它独有的功能类规则。

## v7.1：修复本地大会员

### 现象

v7 加了 `account/myinfo` 的 VIP 伪装，用户实测**本地会员依然没有**。

### 根因

VIP 伪装有**两个端点**，而我之前只迁了一个：

| 端点 | VIP 伪装 | 原本归属 |
|---|---|---|
| `app.bilibili.com/x/v2/account/myinfo` | ✅ | 已迁入 |
| **`app.bilibili.com/x/v2/account/mine`** | ✅ **且重写整个服务列表** | **判给了 Enhanced** |

被排除的那条用的是 kokoryh 的 `bilibili.mine.jq`，它同时做三件事：

```jq
.data |= (
    del(.answer, .live_tip, .vip_section, .vip_section_v2, .modular_vip_section) |
    .vip_type = 2 |
    .vip |= if . != null and .status == 0
             then . + { status:1, type:2, due_date:9005270400000, role:15 } else . end |
    ...重写 sections_v2 / ipad_sections / ipad_upper_sections / ... 全套...
)
```

**把整个 `account/mine` 端点让给 Enhanced，等于把会员功能一起让了出去。**

### v7.1 的处理

加回 `account/mine`，但**只做 VIP，不重写 sections**：

```ini
^https?:\/\/app\.bili(bili\.com|api\.net)\/x\/v2\/account\/mine(\/ipad)?\?
  response-body-json-jq '.data |= (.vip_type = 2
    | .vip |= if . != null and .status == 0
              then . + { status:1, type:2, due_date:9005270400000, role:15 } else . end
    | del(.answer, .live_tip, .vip_section, .vip_section_v2, .modular_vip_section))'
```

这样职责清晰：
- **本插件** 负责 `vip` / `vip_type` 字段
- **Enhanced** 负责「我的」页服务列表的可视化配置

### ⚠️ 端点重叠提示

`account/mine` 同时被本插件和 Enhanced 改写，**后执行者覆盖前者**：

| 你装不装 Enhanced | 结果 |
|---|---|
| **不装** | ✅ 会员 + 去广告，全部完整 |
| **装** | 需实测：若 Enhanced 的 script 先跑、jq 后跑 → 两者都生效；若相反 → VIP 可能被覆盖 |

**若装了 Enhanced 后会员又消失**，说明顺序反了，把本条规则的 `?` 改成 `\\?` 之类微调即可定位，或干脆不装 Enhanced。

### 另一个坑（我的验证失误）

排查时我连续几次用 `grep 'account/myinfo'` 判断规则是否存在，**一律返回 0** ——
因为文件里实际是 `account\/myinfo`（Loon 规则的正则转义），
而我搜的是无转义的 `account/myinfo`。

**教训：验证插件内容必须先归一化转义再比对**，直接 grep 原文会得到假阴性。

## v8：并入 Biliverse Enhanced + ADBlock

原计划是让 blockAds 退场、把功能搬到本插件、再由 Biliverse Enhanced 接管界面定制。
既然 Enhanced 与 ADBlock 本身也想要，**直接全部并入本插件，一套开关搞定**。

### 并入内容

| 来源 | 内容 | 端点数 |
|---|---|---|
| **Biliverse Enhanced** | 顶栏左侧/右侧、标签栏右侧、标签页、默认标签页、底部导航栏、分区页、我的页（iOS/iPad） | 5 |
| **Biliverse ADBlock** | 去广告增强 + 隐私追踪清理 + 商业上报阻断 | 9 |
| kokoryh protobuf（原有） | protobuf 类改写 | 2 |
| BiliUniverse bundle（原有） | 开屏/搜索/网页端/番剧/直播 | 4 |

**Enhanced ∩ ADBlock = 0 条端点重叠**，可直接共存。

### 开关全部内置，不依赖 BoxJS

关键设置：

```ini
Storage = select,"Argument","PersistentStore","database"
```

**默认 `Argument`** —— 脚本只读本插件参数页的值，不读 BoxJS 存储。
迁移后所有配置都在 Loon 的插件参数里，不再需要装 BoxJS。

参数共 **47 个**，`[Argument]` 内无重名：

| 分组 | 数量 |
|---|---|
| E 界面自定义 | 10 |
| A 去广告增强 | 30 |
| 其他（会员/漫画/存储/日志） | 7 |

### 默认值策略

**有利的默认开**：

```
Privacy.Tracking / BlockBiliCommercial / BlockThirdParty   隐私类全开
Reply.CommercialLinks / SubjectDescriptionCommercial        评论商业全开
Feed.StoryCommercial / Search.Tracking                     商业清理全开
```

**默认关（会误伤内容或影响功能）**：

```
Dynamic.MostVisited / MostVisitedLiveOnly   会与 displayUpList 冲突
Xlive.RemoveTrackingCallbacks               作者标注影响推荐翻页
Privacy.Strict                              作者标注影响跳转与翻页
```

**非广告类默认开但会删内容**（参数 desc 里已标 ⚠️）：

```
Feed.Vertical / Search.HotSearch / Dynamic.HotTopics / DM.Colorful
```

### 与会员伪装的共存

`account/mine` 同时被两处改写：

| 来源 | 改什么 |
|---|---|
| 本插件的 jq | `vip` / `vip_type` 字段 |
| Enhanced 脚本 | `sections_v2` / `ipad_sections` 服务列表 |

已核实 `Ba.replaceSections` **不触碰 vip 字段**，两者改不同字段，与执行顺序无关。

### v8.1 修正：空降助手被 ADBlock 的 Airborne 破坏

**现象**：v8 上线后空降助手「不像以前那样工作了」。

**根因**：两个脚本的空降助手同时生效，互相破坏。

| | kokoryh sponsorBlock | ADBlock DM.Airborne |
|---|---|---|
| 依赖字段 | `chronos`（**15 处引用**） | 无 `chronos`（**0 处**） |
| 数据来源 | `DM/DmSegMobile` 请求 | `DM/DmSegMobile` 响应 |
| 实现 | `Qn` / `ti` handler | `Airborne` 独立实现 |

ADBlock 的实现**根本不认识 `chronos` 字段**。两套同时跑时，
它对 body 做的 protobuf 重序列化会把 kokoryh 写入的 `chronos` 丢掉，
空降助手因此失效。

另外 v8 里 ADBlock 的弹幕规则覆盖 `DM/(DmView|DmSegMobile)`，
与 kokoryh protobuf 脚本的 `v1.DM/DmView` handler 重复：

```js
kokoryh fi: t.qoe=void 0; t.activityMeta.length=0; t.command.commandDms.length=0
```

**两个脚本改同一份 body。**

**v8.1 的处理**：

1. `DM.Airborne` 改回**默认关**，并在 desc 里写明「仅在 sponsorBlock 关闭时启用」
2. ADBlock 的弹幕规则从 `DM/(DmView|DmSegMobile)` 收窄为 **`DM/DmView`**，
   **不再碰 `DmSegMobile`**（那是 sponsorBlock 的唯一数据来源）
3. 该规则加 `dmClean` 开关控制（默认开），弹幕去广告仍生效

修正后 `DmSegMobile` 在整个插件里只出现 **1 次** —— 只有 kokoryh 的请求规则。

### v8.2 修正：移除 3 条与 kokoryh 抢端点的 ADBlock 规则

v8.1 只关掉了 `DM.Airborne` 开关，**空降助手仍然失效**。真正原因是在 kokoryh 独占的端点上，
ADBlock 仍在做 protobuf 重序列化：

| 规则 | ADBlock 端点 | kokoryh 路由 |
|---|---|---|
| ~~A播放页~~ | `app.playurl.v1.PlayURL/PlayView` | `playurl.v1.PlayURL/PlayView` |
| ~~A弹幕~~ | `community.service.dm.v1.DM/DmView` | `v1.DM/DmView` |
| ~~A番剧播放~~ | `pgc.gateway.player.v2.PlayURL/PlayView` | `v2.PlayURL/PlayView` |

**空降助手的 `chronos` 正是写在这三个端点的响应里的。**
ADBlock 的 Airborne 关了，但它对同一份 body 的其他改写照样会重序列化，
把 kokoryh 写入的 `chronos` 冲掉 —— 所以开关关了也没用。

v8.2 直接**移除这 3 条规则**，让 kokoryh 独占相关端点。
它们的主要去广告能力（播放页广告、弹幕广告、番剧播放页）kokoryh 脚本本就覆盖：

```
playurl.v1.PlayURL/PlayView  -> Yn
v1.DM/DmView                -> fi   (清 qoe / activityMeta / commandDms)
v2.PlayURL/PlayView         -> di
```

### 空降助手规则对齐 blockAds 原版

请求规则的 host 段改为与 blockAds 完全一致：

```
^https:\/\/(grpc\.biliapi\.net|app\.bilibili\.com)\/bilibili\.community\.service\.dm\.v1\.DM\/DmSegMobile$
```

响应侧 `sponsorBlock` 参数保持在 kokoryh 的 Protobuf处理 规则里，与 blockAds 一致。

---

## ⬅️ v7.1 回滚（当前线上版本）

v8 尝试并入 Biliverse Enhanced 与 ADBlock 后，**空降助手失效**，
已回滚到 v7.1。

### 为什么回滚

v8.0 把两个 BiliUniverse 脚本包（Enhanced v0.6.0 + ADBlock v0.6.27）并入，
引入了 11 条新规则。排查结论：

| 验证项 | 结果 |
|---|---|
| kokoryh 规则的 `argument` | 逐字相同 |
| 端点覆盖 | v8 还**多** 2 条（`AIRelateAsync`） |
| 脚本内容 MD5 | 相同 |
| script-path 两个写法 | 返回同一文件 |
| 唯一差异 | `timeout=10`（730 原版没有） |

**静态分析未发现根因。** 但梳理出一条关键事实：

> **v5.1 根本没有 `DmSegMobile` 请求规则** —— 当时验证「730 + v5.1 空降助手正常」时，
> 干活的一直是 **blockAds**，Dedup 从未独立跑通过空降助手。
> v7.1 时用户确认的「没问题了」指的是**会员伪装**，不是空降助手。

**一个可疑点**：空降助手需要下载 `https://raw.githubusercontent.com/kokoryh/chronos/refs/heads/master/<md5>.zip`，
而脚本内置的 MD5 映射表只有 **6 条**，chronos 仓库却有 **8 个 zip**，
缺 `21950f4b` 与 `28be59e0`。若 App 版本对应的是这两个之一，映射查不到即静默失效。

### v7.1 保留的能力

| 功能 | 状态 |
|---|---|
| 去广告（推荐/动态/搜索/番剧/直播/评论） | ✅ |
| 大会员伪装（`myinfo` + `account/mine`） | ✅ |
| **空降助手** | ✅ 规则完整（**未经独立验证**） |
| 评论区净化 / 加载优化 | ✅ |
| 漫画去广告 | ✅ |
| 关闭弹幕 P2P | ✅ |
| 画中画 / 后台播放 | ✅ |
| Biliverse 界面自定义 | ❌ v8 才加，本次回滚移除 |
| 隐私追踪清理 | ❌ v8 才加，本次回滚移除 |

### 后续方向

- **短期**：用 v7.1 + **原版 blockAds**（你已验证过的组合），空降助手由 730 负责
- **长期**：若要彻底移除 730 的 B 站部分，需开 `LogLevel=ALL` 抓日志，
  搜索 `MD5 mismatch` 确认是否命中 chronos 映射表缺失


## v7.2.0 · 本地会员 → 百年大会员

原规则已写 `role: 15`，但 **`role` 只是大角色类型，App 显示什么由 `vip.label` 决定**。
原规则没设 `label`，所以界面显示的是普通大会员。

依据 B 站 API 文档（`bilibili-api-collect/docs/user/info.md`）：

| 字段 | 取值 |
|---|---|
| `role` | 1 月度 / 3 年度 / **7 十年** / **15 百年** |
| `type` | 0 无 / 1 月度 / 2 年度及以上（百年也归此类） |
| `label.label_theme` | `vip` 大会员 · `annual_vip` 年度 · `ten_annual_vip` 十年 · **`hundred_annual_vip` 百年** · `fools_day_hundred_annual_vip` 最强绿鲤鱼 |
| `label.text` | `大会员` / `年度大会员` / `十年大会员` / **`百年大会员`** / `最强绿鲤鱼` |

改动的 jq（`myinfo` 与 `account/mine` 两处同步）：

```jq
.data.vip |= if . != null and .status == 0 then
  . + { status: 1, type: 2, due_date: 9005270400000, role: 15,
        label: ((.label // {}) + { text: "百年大会员",
                                    label_theme: "hundred_annual_vip",
                                    text_color: "#FFFFFF",
                                    bg_color: "#FB7299",
                                    use_img_label: false }) }
  else . end
```

- `((.label // {}) + {...})` 保留原有 label 字段（如 `path`），只覆盖需要的
- `use_img_label: false` —— 走文字渲染而非图片牌子，避免缺 `img_label_uri_*` 导致破图
- `due_date: 9005270400000` 已是公元 2999 年，等同永久

jq 实测三种输入：

| 输入 | 结果 |
|---|---|
| 未开通、有 label | ✅ 写入 `label_theme: hundred_annual_vip`，原 `path` 保留 |
| 未开通、无 label | ✅ 完整创建 label 对象 |
| 已开通 | ✅ 不改动（`status != 0` 走 else 分支） |

参数 `localVIP` 改名为「本地百年大会员」，关闭即恢复真实状态。

> ⚠️ 若 App 仍显示普通大会员，说明它还校验 `img_label_uri_*` 牌子图片地址，
> 届时需要补上百年大会员的图片 URL（文档里只给了十年的样本）。


## v7.3.0 · 会员主题改回「最强绿鲤鱼」

B 站 `label.label_theme` 的全部可选值（来自 API 文档）：

| `label_theme` | 显示 |
|---|---|
| `vip` | 大会员 |
| `annual_vip` | 年度大会员 |
| `ten_annual_vip` | 十年大会员 |
| `hundred_annual_vip` | 百年大会员 |
| **`fools_day_hundred_annual_vip`** | **最强绿鲤鱼** |

改成愚人节特供的绿鲤鱼主题：

```jq
label: ((.label // {}) + { text: "最强绿鲤鱼",
                            label_theme: "fools_day_hundred_annual_vip",
                            text_color: "#000000",
                            bg_color: "#00E07C",
                            use_img_label: false })
```

`role` 仍为 **15**（百年）—— 绿鲤鱼本身是「百年」系列的愚人节彩蛋，role 不变。

> ⚠️ **颜色是推测的**：文档只说明 `bg_color` 「曾用于愚人节改变大会员配色」，
> 未给出绿鲤鱼的准确色值。这里用黑字 `#000000` + 亮绿底 `#00E07C`。
> 若显示效果不对，把 App 里实际的配色告诉我，或直接改成你想要的值。
> 真实颜色属于**读取**响应，不能伪造 —— 只能靠猜或实测。


## v7.6.0 · 加「小会员」图标

绿鲤鱼主题的昵称旁小会员标识，此前一直没设置。补上：

```js
avatar_subscript: 1,        // 开启会员图标
avatar_subscript_url: "",    // 留空 → App 渲染自带图标
```

**依据**：B 站 API 文档（`user/info.md`）的 8 个真实账号样本中，
**5 个是 `avatar_subscript: 1` 且 `avatar_subscript_url` 为空** ——
说明 App 在 URL 为空时会用内置图标，而不是不显示。

| 字段 | 含义 |
|---|---|
| `avatar_subscript` | 0 不显示 / 1 显示（昵称旁的小会员标） |
| `avatar_subscript_url` | 大会员角标地址；**留空用 App 内置** |

> ⚠️ 文档示例里的 `icon_Certification_big_member_22_3x.png` 等 URL 现已 404，
> 且本机网络无法访问 hdslb.com（所有 URL 均返回 000），**无法验证任何图 URL**。
> 留空走内置是当前唯一可靠方案。

各主题当前的图配置：

| 主题 | `label.image` | `avatar_subscript` |
|---|---|---|
| 年度大会员 | zirawell 的 URL（未验证） | 1（内置小会员） |
| 其余四个 | 空 | 1（内置小会员） |


## v7.7.0 · 绿鲤鱼牌子文字改为「小会员」

之前误解了需求：用户要改的是**牌子上的文字**（`label.text`），不是头像旁的小会员图标。

绿鲤鱼主题（`fools_day_hundred_annual_vip`）的默认文字改为 **「小会员」**，配色仍是绿底黑字。

五个主题的默认文字：

| `vipTheme` | `label.text` |
|---|---|
| `vip` | 大会员 |
| `annual_vip` | 年度大会员 |
| `ten_annual_vip` | 十年大会员 |
| `hundred_annual_vip` | 百年大会员 |
| `fools_day_hundred_annual_vip` | **小会员** |

新增 `vipText` 输入框：**留空用主题默认，填了就覆盖**。这样以后想改文字不用再动插件。

> **v7.7.1 已按反馈删除 `avatar_subscript`** —— 那是昵�旁的小会员图标，
> 与牌子文字无关，属多余。最终输出的 vip 字段：
> `type` / `status` / `due_date` / `role` / `nickname_color` / `label`


## v7.8.0 · 强制 `use_img_label: false`（抓包发现的关键问题）

用户抓包（HAR，249 个请求）后暴露的真问题：

```json
"label": {
  "text": "小会员",                              ← 我们设的
  "use_img_label": true,                          ← B站原值，被 Object.assign 保留
  "img_label_uri_hans_static": "https://i0.hdslb.com/bfs/vip/d7b702ef....png",
  "image": ""                                     ← 我们设的空
}
```

**`use_img_label: true` 时 App 走图片渲染，`label.text` / `bg_color` / `text_color` 全部被忽略。**

那张图同时出现在 `/x/vip/web/vip_center/v2` 响应里 ——
证明是 **B 站自带的通用大会员图**，不是插件引入的。
所以界面一直显示大会员标，我们设置的「小会员」三个字从未渲染过。

**修正**：显式写入 `use_img_label: false`。

### 抓包同时验证了这些此前全靠推断的字段

| 字段 | 实测 | 结论 |
|---|---|---|
| `due_date: 3818419199` | ✅ 原样出现 | **秒级正确**；我最初用的毫秒 `9005270400000` 是错的 |
| `role: 15` | ✅ | 绿鲤鱼/百年共用 |
| `nickname_color` | ✅ | 与主题配色同步 |
| `vip_section` | ✅ 已删除 | 规则生效 |
| `vip_type: 2` | ✅ | 生效 |
| `label.text` | ✅ 写入但被挡 | `use_img_label` 的问题 |

### 回归测试

用抓包里的**真实 B 站原值**作输入跑脚本：

```
role=15  due_date=3818419199  nickname_color=#00E07C
label.text=小会员   label_theme=fools_day_hundred_annual_vip
label.bg_color=#00E07C   label.use_img_label=false
```

### 附：抓包中出现的大会员图（本机无法访问 hdslb.com，未验证）

```
https://i0.hdslb.com/bfs/vip/d7b702ef65a976b20ed854cbd04cb9e27341bb79.png
https://i0.hdslb.com/bfs/activity-plat/static/20220614/e369244d0b14644f5e1a06431e22a4d5/KJunwh19T5.png
```
