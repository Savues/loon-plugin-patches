# YouTube-Dedup 迭代记录 · Iteration Log

> 三次真机抓包 → 四个脚本级缺陷 → v5.0.0 → v5.4.0 的完整过程。
> Three real captures → four script-level defects → v5.4.0.

---

## 2026-09-29 · v5.4.0：真正的病根 —— Loon 的 Script 是 first-match-wins

### 现象

用户第二次反馈「游戏大本营还是没有去处」，附上第三份 HAR（219 条，04:13:28 – 04:14:49）。

### 先查时间线

| 事件 | 时间 |
|---|---|
| v5.2 commit + push | **04:11:10** |
| 第三份 HAR 覆盖区间 | **04:13:28 – 04:14:49** |

设备上跑的是 v5.2 推送后第 2 分钟的版本，中间还要重导入插件、重启 Loon、重开 YouTube，
再加上 `raw.githubusercontent` 的 CDN 缓存最长 24 小时 —— 这份抓包里**没有那条规则**。

### 但代码还是要审

把 13 条 browse 响应喂给当前脚本离线重跑：4 条改写、9 条逐字节不动，
`/vi/` 计数 55→55、49→49、96→96、270→270、519→519 全部不变，上游脚本能解析全部输出。
**算法没问题。**

### 真正的病根

既然用户会更新插件再测，那问题就必须在「规则能不能被调用」上。查 Loon 的规则语义：

**`[Script]` 是 first-match-wins。** 同一个 URL 只执行第一条完整命中的 `http-response` 规则，
后面的不再执行，也不会把前一条的输出喂给后一条。官方新版 Script 文档
（loon0x00.github.io/docs/Script/script_v2）：

> Response Script … 始终按照原配置顺序选择第一条最终条件为 true 的规则
> Request 和 Response 分别最多选择一条

链式执行只存在于 `[Rewrite]`（3.2.3 起专门加的），脚本从来没有这个特性。
搜索引擎里「Loon 多条脚本按顺序依次执行」的说法，是把 Rewrite 的语义错套到了 Script 上 ——
我上一轮就是信了这条二手资料，才把游戏规则排在了去广告规则后面。

**结论：v5.2 的规则从来没有执行过。** 不是代码不对，是规则没被调用。

### 修法与代价

把游戏规则提到最前，并从上游规则里移除 `browse|next`。
代价是丢掉上游在信息流上的 Shorts 过滤（`Fi()` 里的 `/shorts(?!_pivot_item)/`）。
`player` / `search` / `guide` / `get_setting` / `get_watch` / `reel_watch_sequence`
仍然走上游脚本，去广告不受影响。

上游另外两条信息流判据我逐条查过，三份抓包 25 条 browse/next 里**一次都没触发**：

| 上游判据 | 实现 | 抓包里出现次数 |
|---|---|---|
| 未知字段含 `pagead` | `ni()` = Boyer-Moore 搜 "pagead"，且字段 ≥1000 字节 | **0** |
| EML 名为 `inline_injection_entrypoint_layout` | `blackEml` 默认值 | **0** |
| EML 名匹配 `/shorts(?!_pivot_item)/` | `Fi()` 无条件 | **多次**（真的会触发） |
| 其余 EML 的「自学习」缓存 | 首次遇到现场判定 | 上游一次都没改过任何信息流响应 |

所以实际丢的只有 Shorts 过滤这一条。

### 补回 Shorts：写出来了，但不敢发

把上面三条判据都在自研脚本里复刻 + 游戏模块，做完了，**验证是全绿的**：

| 响应 | 原始 | -> 结果 | `/vi/` | 上游复检 |
|---|---|---|---|---|
| HAR2 #240 | 399608 B | 320536 B | 52 → 52 | ok |
| HAR2 #064 | 1263679 B | 1133272 B | 270 → 270 | ok |
| HAR3 #047 | 241246 B | 161220 B | 55 → 55 | ok |
| HAR3 #207 | 341757 B | 261390 B | 49 → 49 | ok |
| HAR2 #015（游戏货架页） | 587223 B | 16960 B | 0 → 0 | ok |

**但是太慢**：1.3 MB 的响应 25 秒、2.4 MB 的 42 秒，远超 Loon 的 10 秒脚本超时。
所以没有发出来。

慢的原因量出来了（Node vm 里打点）：`hasAnyTrigger` 占了 14 秒里的 8 秒。
一次完整响应有约 8 层单例嵌套（content → sectionListRenderer → …），每层都是 MB 量级，
**同一批字节在每一层都被全量重扫一遍**。三版优化都试过：

1. 剪掉不含判据的子树 → 25 s
2. 只在「列表项」上做判据扫描（单例只递归）→ 8 s，但 2.4 MB 仍要 30 s
3. 开头做一遍扫描把判据位置建成有序索引，之后二分查找 → 改写路径仍 36 s

`rebuild` 那条路径始终没压下来，根因没定位清楚。
**没有把握的优化我不会发到用户机器上**，所以这一版只发规则顺序的修复，
Shorts 过滤的补回留作下一件事。

### 这次抓包还暴露的两件事（已写成用例）

1. **面板还有第二种形态**：#42 里面板容器是**单例**字段，里面套一个 **12 项**的重复列表，
   每一项各带一次 `mini_app_panel`。只删最外层那一项是不够的 ——
   要 12 项全删、容器空、容器跟着删。用例：`嵌套形态：12 项全删后容器收敛`。
2. **清除后故意保留的那一项，说明了为什么不能用 `mini_game_card` 当 marker**：
   一张普通视频卡，模板清单里同时列着 `mini_app_game_info.eml-fe`、
   `mini_app_splash_screen.eml-fe`、`more_drawer_button.eml-fe`、
   `channel_action_buttons_phone.eml-js-fe` 和 `channel_description_preview.eml-fe`。
   拿它当 marker 就是从首页拿掉一个正常视频。四条「误伤防护」用例钉住。

---

## 2026-09-29 · v5.3.0：第三份抓包复盘 —— 代码没问题，是版本没换上

### 现象

用户反馈「游戏大本营还是没有去处」，附上第三份 HAR（219 条，`04:13:28` – `04:14:49`）。

### 先查时间线，别急着改代码

| 事件 | 时间 |
|---|---|
| v5.2 commit + push | **04:11:10** |
| 第三份 HAR 覆盖区间 | **04:13:28 – 04:14:49** |

设备上的插件是 **v5.2 推送后第 2 分钟**导出的抓包。中间还要重导入插件、重启 Loon、重开
YouTube —— 2 分钟做不到，再加上 `raw.githubusercontent` 的 CDN 缓存最长 24 小时。
**这份抓包里根本没有「清除游戏大本营」这条规则。**

### 但仍然把代码审了一遍（这才是有价值的部分）

把第三份 HAR 的 13 条 browse 响应全部喂给当前 `feed-gaming.js` 离线重跑：

| 响应 | 大小 | 结果 | `/vi/` 计数 | 上游脚本能否解析改写结果 |
|---|---|---|---|---|
| #42 | 134458 B | → 20830 B | 0 → 0 | ok |
| #43（游戏货架页） | 586850 B | → 16958 B | 0 → 0 | ok |
| #47（首页） | 241246 B | → 179894 B | **55 → 55** | ok |
| #207（首页） | 341757 B | → 280381 B | **49 → 49** | ok |
| 其余 9 条 | — | **逐字节未动** | 全部一致 | — |

`mini_app_panel` / `FEmini_apps_saved` / `playables_` 清除后全部归零，
视频条目一个不少，上游脚本对全部 4 条改写结果都解析通过。**算法对新抓包同样成立。**

### 新抓包暴露的两件事（补了测试）

1. **面板还有第二种形态。** #42 里面板容器本身是**单例**字段，里面套一个 **12 项**的重复列表，
   每一项各带一次 `mini_app_panel`。此时不能只删最外层那一项 ——
   正确行为是 12 项全删 → 容器空 → 容器跟着删（收敛）。已写成用例
   `嵌套形态：12 项全删后容器收敛`。
2. **清除后故意保留的那一项，说明了为什么不能用 `mini_game_card` 当 marker。**
   它的模板清单里同时列着 `mini_app_game_info.eml-fe`、`mini_app_splash_screen.eml-fe`、
   `more_drawer_button.eml-fe`、`channel_action_buttons_phone.eml-js-fe` 和
   `channel_description_preview.eml-fe` —— **这是一张普通视频卡**。
   拿它当 marker 就是从首页拿掉一个正常视频。已写成四条「误伤防护」用例。

### 真正的改进：让「规则没跑」可以被看见

之前的失败之所以难查，是因为**规则没执行**和**规则执行了但没删掉**在外部表现完全一样。
现在 `debug` 打开时会按结果分类通知：

| 通知 | 含义 |
|---|---|
| `游戏大本营 · done` | 规则在跑，删了 N 项 / M 字节 |
| `游戏大本营 · clean` | 规则在跑，这条响应本来就没有 |
| `游戏大本营 · nomatch` | 看到标识但没删掉 → 结构变了 |
| `游戏大本营 · off` | `blockGaming` 被关 |
| **没有通知** | **规则没被执行** → 旧版本，或同 URL 上有更靠前的规则 |

规则参数从 `[{blockGaming}]` 改成 `[{blockGaming},{debug}]`。

### 留了一个没解决的问题（诚实记录）

**同一 URL 上两条 `http-response` 规则同时匹配时，Loon 到底执行几条？**
官方文档只在 `network-changed` 一节写了「有多个这种类型的脚本，只会调用配置文件中的第一个」，
`http-response` 没有明说。本插件依赖「按顺序全部执行、后一条拿到前一条的输出」。

- 若实际是 **全部执行**：现在的规则顺序（去广告在前、游戏在后）工作正常。
- 若实际是 **只执行第一条**：游戏规则永远不会跑，而**不能**简单地把游戏规则提到前面 ——
  那样 feed 的去广告就没了。唯一解是自研一个同时做两件事的脚本，
  但去广告的判据需要一份**含广告的原始响应**才能推导，而现有抓包都是去广告之后录的，推不出来。
  所以在语义确认之前维持现状，并在上面那张表里让用户能自己判定。

---

## 2026-09-29 · v5.2.0：清除首页「游戏大本营」

### 输入

第二份 HAR：**253 条，71 秒**（`03:13:14.391` – `03:14:25.725`）。这份比第一份有价值得多 ——
**有 `player` 响应**（37182 B），播放页这条主路径终于覆盖到了。

### 它是什么

首页（`browseId=FEwhat_to_watch`）里插了一个 61342 字节的模块，标题「YouTube 游戏大本营」。
它**不是视频**，是 YouTube 的 **mini app（EML 渲染）面板**。证据链：

```
Browse.content(9) → sectionListRenderer(49399797) → sectionListSupportedRenderers(1)×16
  └─ 其中 1 项 → itemSectionRenderer(50195462) → richItemContents(1)
       └─ videoWithContextRenderer(153515154) → elementRenderer(172660663)
            └─ videoInfo(1) → videoContext(168777401) → videoContent(5)
                 └─ 未知字段 312131490（60766 B）= mini_app_panel 的数据
```

面板里能读到的技术标识：

| 标识 | 出现位置 |
|---|---|
| `mini_app_panel` | 面板定义 |
| `FEmini_apps_saved` | 面板定义 |
| `%mini_game_card.eml-fe\|998e208b2b3ddc1` | 每一张游戏卡的 EML 模板 |
| `youtube_outline_experimental/playables_24pt` | 承载它的实验开关 |
| `FEmini_app_destination` | 独立游戏货架页的 browseId |

### 怎么定位的

HAR 全是 protobuf，字符串搜索只能搜到**明文字符串**。这次能定位靠的是给上游脚本打洞：
把 `ii()` 里的 `let t = e.msgType.fromBinary(...)` 后面插一行 `globalThis.__DUMP(e.path, t)`，
让**上游自己**把 `browse` 响应解析成带字段名的 JSON，再倒查 `大本营` 出现在哪个对象的哪个 `@@unknown` 里
（上游 schema 不认识新字段时，会把原始字节挂在 `Symbol.for("protobuf-ts/unknown")` 上）。

定位到 `videoContent` 下挂着一个上游不认识的字段 `312131490`，顺藤摸瓜才看到 `mini_app_panel`。

### marker 选型：本次最花时间也最值钱的一步

第一版 marker 用了 `mini_game_card` + `FEmini_app`。跑下去发现**删多了**：

| 被误删的元素 | 后果 |
|---|---|
| `more_drawer_button.eml-fe\|f8bc3d9f67dab8ec` | 视频卡的「更多」按钮没了 |
| `channel_action_buttons_phone.eml-js-fe` | **订阅按钮没了** |
| `error_message.eml-fe\|9d9047059c0dc572` | 占位卡被删（这条无所谓） |

根因：这些标识在响应里到处都是，**tracking params 也会带**。

于是写了个 marker 精度评估（8 个候选 × 8 条响应，逐个列出该 marker 会删掉哪些元素），
结论是**只有 `mini_app_panel` / `FEmini_apps_saved` 干净** —— 每次恰好命中 1 个元素，
频道页/订阅页/媒体库/搜索页/`get_watch` 命中 0 个。`playables_` 更是连 `get_watch` 都命中，直接淘汰。

另外**明确不用「游戏大本营」这个中文串**做 marker：正常视频标题里完全可能出现。

### 算法

不认 schema，只认结构：

```
遍历 protobuf：
  「同一父消息里出现 >=2 次的字段号」的元素 = 列表里的一项
  该项内容含 marker        → 整项删
  删完后父消息一项都不剩   → 父消息也删，依次向上收敛
```

这样 YouTube 换 schema、换 A/B 分桶都不用改代码。实测三种形态都覆盖到了：
整块 section（首页）、货架里的游戏卡（游戏页）、以及更小的子列表。

### 三个自己踩的坑

1. **`hasMarker` 写错了首字符比较**。原本用「末字符」做外层快速过滤、只比 `s[1..]`，
   结果一个 marker 都匹配不上，而且**不报错** —— 静默失效，差点以为是结构判断错了。
2. **重建 protobuf 时把长度前缀算进了输出长度，却漏了 tag 本身**。
   症状很阴：`out.length` 和 `outLen` 在浅层一直相等，只有发生过重写的深层才差几个字节，
   结果就是输出被**截尾**，上游脚本报 `RangeError: premature EOF`。
   定位办法：先在 Python 里写一份等价实现当参照，对比两边输出的字节数和合法性 —— 算法没问题，是 JS 抄错了。
3. **逗号表达式里的求值顺序**：`const no = Math.floor(rv() / 8), wire = rv() & 7;`
   两次 `rv()` 用的是同一个游标，第二个读到的是长度字节。写测试辅助函数时又犯了一次。

### 验收方式

不是「跑通就算」，而是三条硬指标：

1. **上游脚本能解析改写后的字节**（报 `premature EOF` 就说明输出坏了）
2. **视频条目一个不少**：`/vi/` 出现次数改写前后必须相等（52 → 52、49 → 49）
3. **关掉开关时逐字节等于原响应**

四条带游戏面板的响应全部改写并通过，另外 21 条 browse/next/get_watch/player/reel/guide
**一字节未动**。回归测试 22 例。

---

## 2026-09-29 · v5.1.0：按第一份抓包更新

### 输入

用户在 YouTube 21.39.4 / iPadOS 18.7.3 上用 Loon 抓的 HAR：**64 条，冷启动 6.4 秒**
（`02:45:52.213` – `02:45:58.490`）。HAR 里有完整的 `Authorization: Bearer ya29.…`，
**不能进仓库**，只取了两条响应体，并逐字节确认不含 `ya29` / `Bearer` / `oauth` / `AIza` / visitor-id。

### 端点清单（先确认「该不该拦」，再谈「怎么修」）

抓包里出现 15 个 YouTube 相关端点，插件正则命中 4 个，另外 11 个按规则不拦。
判定依据是上游脚本内部这张表（`Mi=[{path:…}]`，用 `url.includes(path)` 匹配）：

```
browse  next  player  search  reel_watch_sequence  guide
get_setting  get_watch  config  log_event
```

| 端点 | 次数 | 处置 |
|---|---|---|
| `youtubei/v1/browse` | 2 | 拦（上游） |
| `youtubei/v1/config` | 1 | **改由自研脚本**（见下） |
| `youtubei/v1/guide` | 1 | 拦（上游） |
| `youtubei/v1/account/get_setting` | 1 | 拦（上游） |
| `youtubei/v1/log_event` | 1 | 响应侧**不再拦**，请求侧保留 |
| `youtubei/v1/att/get` | 3 | 不拦（不在表里，拦了只会刷「脚本需要更新」） |
| `youtubei/v1/mdx/handoff` | 1 | 不拦（同上） |
| `youtubei/v1/notification_registration/{set_registration,get_settings}` | 2 | 不拦（见下方陷阱） |
| `youtubei.googleapis.com/generate_204` | 1 | 不拦（HEAD 连通性探测） |
| `redirector.googlevideo.com/initplayback` | 1 | 推荐版不解密 googlevideo |
| `rr3---sn-a5msenes.googlevideo.com/initplayback` | 1 | 同上 |
| `s.youtube.com/api/stats/{qoe,watchtime}` | 4 | 不拦（播放质量上报，非广告） |
| `www.google.com/ads/on-device/{clicks,conversions}` | 2 | 不拦（见「没做的事」） |

### 陷阱：`get_settings` 里藏着 `get_setting`

`notification_registration/get_settings` 的 URL **包含子串 `get_setting`**，
上游的 `url.includes("get_setting")` 会把它当成 `youtube.response.setting.Setting` 解析。
实测（把这条 URL 硬喂给上游脚本）：**不报错，而且真的改写了响应体** —— 一个通知注册配置
被当成账号设置页面重写，静默损坏。

现有正则写的是 `account\/get_setting`，正好挡住。**这条是本次抓包最值钱的产出**：
一个看起来无害的正则放宽，就能让通知注册静默损坏。

### 缺陷 1：`config` 响应解析必崩

用 Node + `vm` 造了个 Loon 运行时（注入 `$request` / `$response` / `$persistentStore` /
`$notification` / `$done`），把 HAR 里的真实响应逐条喂给上游脚本，**问题立刻复现**：

```
[29] /youtubei/v1/config  in=80364B  => PASSTHROUGH
     TypeError: The encoded data was not valid for encoding utf-8
       at Ke.string          (youtube.response.js)
       at yr.internalBinaryRead   ← youtube.response.config.GlobalConfigGroup
       at pr.internalBinaryRead   ← youtube.response.config.ResponseContext
       at dr.fromBinary           ← youtube.response.config.Config
```

顺着栈把 minified 代码里的 `super("类型名",[...])` 全量抽出来（83 个类），
再按列偏移把栈帧映射回类型，就看到了真凶：

```js
super("youtube.response.config.ColdConfigGroup", [])          // ← 空 schema
internalBinaryRead(e,t,n,i){ return i??this.create() }        // ← 直接 return，一字节不消费
```

而父消息是这么读的：

```js
case 6: r.coldConfigGroup = lr.internalBinaryRead(e, e.uint32(), n, r.coldConfigGroup); break;
case 7: r.hotConfigGroup  = cr.internalBinaryRead(...); break;
case 4: r.hotHashData     = e.string(); break;
case 5: r.coldHashData    = e.string(); break;
```

实测响应里 `globalConfigGroup` 的字段是 `4(680B) 5(928B) 6(42757B) 7(30222B) 9(196B) 11(204B)`。
`field 6` 读到一半，reader 停在 42757 字节那段的开头；下一轮循环把那里的 tag 读成
`field 4 / length-delimited`，于是 `e.string()` 去解一个 **298 字节的嵌套 protobuf**：

```
FAIL f4 pos=8500 len=298 head=10,8,10,2,8,0,18,2,8,1,34,157,2,...
```

（`10` = field 1 / wire 2，是标准 protobuf tag，不是文本。）

**连带后果**：`config` 处理器 `ri()` 一次都跑不到 → UMP onesie 的
`clientKey` / `encryptKey` 永远写不进 `YouTubeConfig` → 同插件的 `*_request.js`
在 `kt()` 里判定「没有缓存」，于是**每次 `log_event` 都把 `x-youtube-hot-hash-data` 头删掉**。
一个解析崩溃 quietly 传染到了请求侧。

验证补丁有效性：把 `case 6:` 那一行删掉，让它落进 protobuf-ts 的 unknown-field 分支
（`skip()` 读、写出时原样回写，零信息损失），同一份 fixture 立刻解析通过并写出密钥：

```
{"{\"youtube\":{\"clientKey\":\"z1ILCNJ2yPW3hvvCB27hxlP/QZCCgrLnxR+N9XsnaEc=\", …}}":"YouTubeConfig"}
```

### 为什么最后没提交这个补丁

补丁有效，但要在公开仓库里放一份**改过的 133 KB minified 上游脚本**。
仓库原则 #1/#2 是不动上游逻辑，GeoFix 的先例也只是托管 + 改名。
于是换了个做法：既然 `ri()` 做的事就只是「沿固定路径取两个 bytes 字段、base64、存盘」，
那就**为这一个端点另写 80 行自研脚本**，上游脚本一个字不动。

`src/config-onesie.js` 不依赖任何 schema，只按
`1 → 16 → 7 → 138536474 → 146311580 → (1|2)` 走位，
并复刻了上游的边界行为（相同则不写、Music UA 写 `youtubeMusic`、保留另一平台的键、
任何异常都 `$done({})` 放行）。测试把「打了补丁的上游脚本在同一 fixture 上的输出」当真值比对。

### 缺陷 2：`log_event` 的响应是 GIF

```
[11] /youtubei/v1/log_event  in=42B
     resp headers: content-type: image/gif
     resp body:    R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7
     Error: illegal tag: field no 8 wire type 7
```

`R` = `0x52`？不 —— `G` = `0x47`，tag = field 8 / wire 7，正是 protobuf 的非法 wire type。
上游把 `log_event` 和 `config` 映射到同一个 `Config` 类型（`{path:"log_event", msgType:kr, handler:ri}`），
今天已经不成立。而 onesie 密钥只存在于 `config` 响应里，`log_event` 响应给不出它，
所以从 **http-response** 正则里删掉 `log_event` 是零损失。**http-request 的规则保留** ——
它只读请求头，实测能正常改写 17 个头（剥 `content-encoding`、按缓存状态决定要不要留 hot-hash）。

### 顺带查清、结论是「不动」的两件事

1. **两条 `browse`（903 KB / 407 KB）解析正常、零改动。** 原始字节里搜不到
   `Sponsored` / `promoted` / `广告` / `广告内容`，只有 `shopping`（商品货架，不是广告）。
   抓包是在装了插件的真机上做的，广告已被剥掉，所以这份样本**无法证明去广告是否仍然有效**。
2. **广告归因埋点** `www.google.com/ads/on-device/{clicks,conversions}`
   （`api_version=3&oda_eid=0.0.0`）每次启动都发，插件完全没覆盖。
   但 Loon 的 `[Rewrite]` **只对 http 和已解密的 https 生效**，要拦就得把
   `www.google.com` 加进 MitM —— 为两个 1 KB 埋点解密整个 Google 主域，不划算。
   写进 README 的「可选」小节，附上条件成立时的手写规则。

### 这次抓包**没有**覆盖到的

抓包是**冷启动**，全程没有 `youtubei/v1/player` 响应（只看到 `initplayback` 和
`s.youtube.com/api/stats/watchtime`）。也就是说：
**播放页的插片广告、中插广告这条主路径，本次抓包无法验证。**
README 里如实写了这条限制，没有拿「browse 干净」冒充「去广告有效」。

---

## 复现

```bash
# 回归测试（16 例）
node plugins/YouTube-Dedup/test/config-onesie.test.mjs

# 规则与抓包对照（每条端点命中哪条规则、有无冲突）
python3 /var/minis/workspace/check_rules.py   # 该脚本未入库，逻辑见 README 表格
```

抓包复现步骤：Loon → 请求记录 → 导出 HAR → 冷启动 YouTube（**要进播放页再导出**，
否则拿不到 `player` 响应，验证不了主路径）。
**导出后先删掉 `Authorization` 头再入库。**

---

## 方法论备忘

- **HAR 里全是 protobuf 的时候，字符串搜索是没用的** —— 二进制里没有字段名。
  能定位靠的是「栈帧列偏移 → 映射回 `super("类型名")` → 抽全量 schema」。
- **给 minified 脚本造 harness 比读代码快**：`vm` 里注入 5 个 `$` 变量，
  真实响应喂进去，PASS/FAIL 和异常栈直接出来。本次三个结论有两个是这么发现的。
- **改 `catch` 打 stack 比 `console.log(err)` 信息量高一个量级**：
  `console.log(String(l))` 只剩一行 message，换成 `l.stack` 才拿得到「哪个类型的哪个字段」。
- **HAR 会带 `Bearer ya29.…`**，这是能直接用的账号令牌，入库前必须逐字节扫。
