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
