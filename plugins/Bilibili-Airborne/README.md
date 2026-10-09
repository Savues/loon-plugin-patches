# Bilibili-Airborne · B 站空降助手（可配置版）

> 从 [Bilibili-Dedup](../Bilibili-Dedup/README.md) 里拆出来的独立插件，只干一件事：**在 B 站 App 里跳过恰饭片段**。
> 区别是——**跳过哪些类型、用什么方式跳，交给用户自己定**。
> Splits the "空降助手" feature out of Bilibili-Dedup into a standalone plugin, and makes the skip category / skip mode configurable.

**v1.14** · 12 参数 / 2 Script / 3 MitM

> 本文只描述**当前状态**。各版本踩坑与"自动跳转"九层消融的完整过程 →
> [ITERATION.md](ITERATION.md)　出处与 9 处锚点逐条对照 → [UPSTREAM.md](UPSTREAM.md)

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Airborne/Bilibili-Airborne.lpx
```

CDN 缓存可能延迟更新，拉不到新版时加随机参数：`...lpx?cb=v24`

**需开启 MitM over HTTP/2。** Enable MitM over HTTP/2.

> ✅ Dedup v7.26 起已**移除**空降助手（参数与规则都删了），两个插件不再冲突，随便同时装。


---

## 一、它是怎么工作的 · How it works

App 端没有播放器可 hook，所以空降是靠**弹幕**实现的：

```
App 打开视频 → 请求 DM/DmSegMobile（弹幕分段）
    → 脚本从请求 pb 里解出 aid / cid
    → 查 bsbsb.top 拿社区标注的片段
    → 往弹幕响应里插一条假弹幕，action = airborne:<片段结束毫秒>
    → App 播放到该弹幕时自动 seek 过去
```

注入的那条弹幕文案默认是 **`空指部已就位`** —— 这是本插件独有、最可靠的验证信号：弹幕栏闪过这几个字就说明脚本跑通了。
The fake danmaku's text `空指部已就位` is the only reliable signal that the script actually ran.

数据源 [bsbsb.top](https://www.bsbsb.top) = 浏览器扩展 [hanydd/BilibiliSponsorBlock](https://github.com/hanydd/BilibiliSponsorBlock) 的服务端，共 **11 个类别**；App 侧脚本来自 [kokoryh/Sparkle](https://github.com/kokoryh/Sparkle)。

---

## 二、参数 · Arguments

| 参数 | 默认 | 说明 |
|---|---|---|
| `空降助手` | 开 | 总开关 |
| `自动跳的类型` | `sponsor,selfpromo,interaction,intro,outro,padding` | 这些类别的片段带空降动作，**自动跳**（点一下也能跳） |
| `只提醒的类型` | `exclusive_access,poi_highlight,preview,filler,music_offtopic` | 默认是**所有不在自动跳里的类别** | 这些类别的片段**只在弹幕栏显示一行文字，不跳转**，跳不跳你自己拖进度条 |
| `允许哪些动作` | `skip` | 只约束自动跳那一档；`full` 空降到片尾、`poi` 空降到时间点、`mute` 无效 |
| `片段最小时长(秒)` | `8` | 只管 `skip`；`full`/`poi` 的片段长度天然是 0，不受此限制 |
| `空降方式` | `jump` | `jump` 正常；`mark` 把自动跳那一档也全部降级为只显示文字 |
| `自动跳的文案` | `空指部已就位` | 占位符：`{cat}` 中文类别名、`{catid}` 原始 id、`{start}` `{end}` `{dur}` |
| `只提醒的文案` | `⚠️ {cat} {start}→{end}` | 渲染成 `⚠️ 三连提醒 00:56→01:07` |
| `提醒延后秒数` | `3` |
| `提醒弹幕样式` | `5`（顶部） | 停留时长由它决定 |
| `片头汇总` | `single` | 开头列出本视频所有会被处理的片段 |
| `汇总的排版` | `line` | 每段一行；`same` = 挤一行 | 只影响提醒档；自动跳固定 +2 秒 |
| `整篇软广的处理` | `notice` | 整篇标记默认只出文字提醒；`jump` 直接跳片尾；`off` 不处理 |
| `chronos 重签` | 开 | **决定空降会不会自动跳**，见下 |

> 📌 **两档并集 = bsbsb 全部 11 类**，所以只要有一档不是空的，就一定会有东西被注入。
> v1.5 短暂出现过"两档默认全空"的情况，用户把两档都设成 `off` 后插件一条弹幕都不出，
> 排查了很久才定位到——所以现在默认把非自动跳的类别都放进了只提醒档。
>
> 📦 **本插件是空降功能的唯一归属**（v7.26 起）：`chronos` 引擎包 ×6 已从
> `Bilibili-Dedup/upstream/chronos/` 迁到本目录 `chronos/`，Dedup 里的 `空降助手`
> 参数与 `DM/DmSegMobile` 规则已删除。
> ⚠️ **两个插件不要同时开**——同一条 `DM/DmSegMobile` 规则会被执行两次，重复注入空降弹幕。
>
> ⚠️ **老用户升级注意**：Loon 会保留你之前设过的参数值，所以你的 `自动跳的类型`
> 可能还是老的 `sponsor`。想要新默认值请手动改成
> `sponsor,selfpromo,interaction,intro,outro,padding`，或者删掉插件重新添加。

### 为什么只有「自动跳」和「只提醒」两档

B 站 App 端我们只有弹幕这一个杠杆，没有播放器 UI：

| | 网页端扩展 | 本插件 |
|---|---|---|
| 自动跳 | AutoSkip，播到点直接 seek | 弹幕带 `airborne:` 动作 → App 自动执行 |
| 手动跳 | ManualSkip，**弹一个跳过按钮** | ❌ 做不出来。弹幕不带动作 → 点了也跳不了；带动作 → 就会自动跳 |

自动和手动在 App 端是**同一个动作的两种触发方式**，不是两个开关。
所以第二档只能是「只显示文字」——好处是**告诉你这里有东西**，代价是跳不跳得自己拖。
（已确认 B 站 App 没有「自动空降」这类全局开关可关。）

### 与官方推荐档位的对照

| 官方档位 | 网页端行为 | 本插件 |
|---|---|---|
| **AutoSkip** | 自动 seek | `自动跳的类型` |
| **ManualSkip** | 弹跳过按钮 | `只提醒的类型`（降级为纯文字） |
| ShowOverlay | 只显示标签 | 同上 |
| Disabled | 关闭 | 不写进任何列表 |

默认自动跳的六类是官方定义里"不含任何有意义的内容"或明确属广告的那几类。
`interaction`（三连提醒）按用户要求也并入了，但它**多数只有 2–3 秒**，
会被 `片段最小时长`（默认 8 秒）滤掉大半——想连它一起跳，把该值调到 3。

> 🔴 **为什么需要 chronos 重签**
>
> 消融实验实测（D1/D2/S1/S2/U1/U2/V1 六层定位）：自动跳与注入的弹幕字节**完全无关**
> ——两次会话 App 收到的伪造响应 md5 一模一样（`6bc9feb4` / `19cdaca0`）。
> 真正的开关是 `bilibili.app.view.v1.View/ViewProgress` 响应里的 chronos：
>
> | | chronos#1 | chronos#2 | chronos#3 |
> |---|---|---|---|
> | 服务端原始 | `325e7073…` | `i0.hdslb.com/….zip` | 80 字符 token |
> | 重签后 | `932002070d…` | 本仓库 `chronos/<md5>.zip` | **删除** |
>
> 拿不到校验文件时 App 会进入降级状态：弹幕照常渲染、**点了也能跳**，但**不会自动跳**。
> 本插件自带 `chronos.js` 完成重签（复用仓库里已有的 chronos zip），不再依赖 Bilibili-Dedup。
> 关掉这个开关就退化成"只提示不自动跳"。

### 整篇软广（`full`）

社区允许标记「**整个视频都属于某一类**」，这种片段是**零长度**的（`[0,0]`），
全靠 `videoDuration` 定位。全站有 **8306 条 `exclusive_access`** + **15 条左右整篇 `sponsor`**，
它在网页端的**跳过次数是 0**——扩展只给它显示标签，从不让它跳。

原因很实在：独家首发里很多是**有真内容**的。比如 `BV1WA411v7nS`《天气之子》（112 分钟）
就被标成 `exclusive_access` 整篇——那是独家首发的正常电影，不是广告。

所以本插件给这一类**单独一档**，默认只提醒：

| `整篇软广的处理` | 行为 |
|---|---|
| `notice`（默认） | **不再单独出提醒**——由「片头汇总」里那一行 `恰饭 整篇` 表达；只有把汇总关掉时才会单独提醒 |
| `jump` | 直接空降到片尾 |
| `off` | 完全不处理 |

它**独立于上面的类别列表**——不管某类写没写进 `自动跳的类型`，只要社区标了整篇就会提醒。

> ℹ️ **「只提醒」的弹幕长什么样**：与自动跳那条**同样**是顶部大字（`mode 5`、字号 50）、同样带空降标志 `midHash=1948dd5d`，唯一区别是**不带跳转动作**。所以 B 站在框的左前方给的是**大拇指**图标（有 action 时才是降落伞）。⚠️ 弹幕「显示区域」设得太小会把顶部大字裁掉，看不到就调大它。



> 并且**延后到第 8 秒**出现（第 2 秒太早，用户根本来不及看），由 `提醒延后秒数` 调整。
>
> 自动跳的时机**不受**这个参数影响：它必须在片段开始时就位，否则来不及跳。

### 片头汇总：开头就知道这个视频有什么

`片头汇总` 默认 `single`：视频开头（`提醒延后秒数` 那个时刻）出现一条

```
📍 本视频包括：
恰饭 00:37–00:48
自我推广 02:39–02:52
三连提醒 02:52–03:15
```

**颜色**：汇总整条是红色；「只提醒」的每条按类别上色——
`sponsor` 珊瑚红、`selfpromo` 橙黄、`interaction` 天蓝、`intro`/`outro` 灰、
`exclusive_access` 紫、`poi_highlight` 金、`preview` 粉、`filler` 青绿、
`padding` 深灰、`music_offtopic` 绿。
**自动跳那条保持白色**，好和提醒区分。

> ⚠️ 一条弹幕只能有一个颜色，所以 `single` 模式下整条汇总是一个颜色（红色）。
> 想让**每段各自不同颜色**，把 `片头汇总` 切成 `stagger`——每段一条独立弹幕，各自上色。

段落多时默认每段一行（换行符），可切成 `same` 挤在一行用 ` · ` 分隔。
如果 App 不认换行符、显示成一条长文本，就把排版切成 `same`，
或者把 `片头汇总` 切成 `stagger`（每段一条独立弹幕，彻底没有长度问题）。

| 值 | 效果 |
|---|---|
| `single`（默认） | 挤成一条，最多列 5 段，超出显示「等 N 处」 |
| `stagger` | 每段一条、错开 4 秒依次出现，单条更短更易读 |
| `off` | 不列 |

只列**会被实际处理**的片段（自动跳 + 只提醒两档的并集），所以不会出现
"提醒里说有广告、结果没跳"的情况。整篇标记显示成 `恰饭 整篇`。

文案复用 `只提醒的文案` 那一项：模板里含 `{list}` 就用你的，否则用内置文案。

### 提醒弹幕能停留多久

**由 `mode` 决定，插件可以改**（`提醒弹幕样式`）：

| 值 | 样式 | 停留 | 说明 |
|---|---|---|---|
| `5`（默认） | 顶部大字 | **最短**，固定时长 | 最显眼。暂停几秒后就会消失，而其它滚动弹幕还冻结在屏幕上 |
| `1` | 滚动 | **最久** | 按屏宽与字号动态计算，暂停视频也保留；代价是容易混进弹幕堆 |
| `4` | 底部 | 短，固定时长 | 顶部弹幕会挡住画面标题/进度区，底部更容易被界面元素挡住 |

非顶部样式时会借用视频里一条真实弹幕的 `midHash`/`attr`——顶着空降标志又用非顶部模式
有被 App 丢弃的风险（这是 v1.7 那次踩过的坑的反面）。

自动跳那条始终是顶部空降弹幕，不受此参数影响。

### 类别中文化

弹幕文案里的 `{cat}` 渲染成中文短名：

| id | 中文 | id | 中文 |
|---|---|---|---|
| `sponsor` | 恰饭 | `poi_highlight` | 精彩时刻 |
| `selfpromo` | 自我推广 | `intro` | 开场动画 |
| `exclusive_access` | 独家体验 | `outro` | 片尾 |
| `interaction` | 三连提醒 | `preview` | 往期回顾 |
| `padding` | 前黑后黑 | `filler` | 离题闲聊 |
| `music_offtopic` | 非音乐片段 | 未知 id | 原样输出 |

需要原始英文 id 时用 `{catid}`。

### 可选类别

| ID | 中文 | 可跳的典型时长 | 建议 |
|---|---|---|---|
| `sponsor` | 恰饭广告 | 10–90s | ✅ 默认开 |
| `intro` | 片头动画 | 0–30s | ✅ 值得加 |
| `outro` | 结尾鸣谢 | 20–40s | ✅ 值得加 |
| `interaction` | 三连提醒 | **2–3s** | 需把最小时长调到 3 |
| `selfpromo` | 自我推广 | — | 按需 |
| `padding` | 前黑 / 后黑 | — | 跳前黑 ≈ 跳到 0s，App 端没意义 |
| `music_offtopic` | 离题闲聊 | 10–60s | 会漏内容，慎开 |
| `preview` | 回顾概要 | 60s–10min | 数据极少（全库 1 条） |
| `filler` | 填充内容 | 30–70s | 数据极少（全库 2 条） |
| `exclusive_access` | 独家体验 | — | 只有 `full` 动作，要配 `full` 才生效 |
| `poi_highlight` | 精彩时刻 | — | 只有 `poi` 动作，要配 `poi` 才生效 |
| `padding` | 前黑 / 后黑 | — | 全站数据库里 0 条样本 |

> **`full` 和 `poi` 的片段是"零长度"的**，这是实测数据：全库 36 条 `full` 段全是 `[0,0]`，
> 6 条 `poi` 段全是 `[t,t]`。所以
> - `full`（整个视频都是这类，比如独家体验/整段推广）→ 落点是**片尾**，效果是一打开就跳到结尾；
> - `poi`（精彩时刻在某个时间点）→ 落点是**那个时间点**，效果是空降过去看；
> - 两者都**不受 `片段最小时长` 约束**（否则 0 长度会被全部滤掉）。
>
> 🔴 **`mute` 在 App 端做不到**：弹幕只有"跳到某时刻"这一种语义，没有静音。填了不会有任何效果。

### 常用配置

| 想要 | 跳过哪些类型 | 最小时长 |
|---|---|---|
| 和原版一样 | `sponsor` | `8` |
| 顺带跳片头片尾（**推荐**） | `sponsor,intro,outro` | `8` |
| 连三连提醒一起跳 | `sponsor,intro,outro,interaction` | `3` |
| 只要提示不想被跳走 | 任意 | `8` + 空降方式选 `mark` |
| 自定义提示 | 任意 | 文案填 `⏩ {cat} {start}→{end}` |

---

## 三、为什么必须改脚本 · Why a build-time patch

上游把类别写死在代码里，清单层传多少 argument 都没用：

```ts
// kokoryh/Sparkle  src/service/sponsor-block.service.ts
url: `https://bsbsb.top/api/skipSegments?videoID=..&cid=..&category=sponsor`
过滤: actionType === "skip" && (end - start) >= 8
```

所以本仓库的做法不是手改 JS，而是**打补丁产物**：

```
每 6 小时  →  拉上游 dist/bilibili.protobuf.request.js
            →  patches/patch-airborne.py 打 8 处精确锚点
            →  node --check 语法体检 + patches/test-airborne.js 逻辑单测（22 项）
            →  有变化才提交 plugins/Bilibili-Airborne/bilibili.airborne.js
```

| 特性 | Feature | 说明 |
|---|---|---|
| 锚点找不到 / 命中多次 | **Actions 报错终止** | 上游改了这几行就会失败，绝不产出"参数不生效"的脚本 |
| 响应处理器 `$t` 有专项回归 | `test-airborne-proto.js` | **v1.1 实机翻车记**：注入函数按数组写、调用点传的是 protobuf 消息对象，TypeError 被框架 catch 吞掉，退化成原样放行。HAR 里完全看不出问题（脚本查了 API、也重取了上游，就是没有弹幕） |
| 上游无变化 | 不提交，避免刷屏 | |
| 手动触发 | Actions → Run workflow | |
| 与 Dedup 共存 | 注入幂等守卫 | 同一响应里已有本脚本注入的弹幕就不再注入 |

### 本地运行 · Local usage

```bash
python3 patches/patch-airborne.py                    # 拉上游并打补丁
python3 patches/patch-airborne.py src.js -o out.js   # 对已下载文件打补丁
python3 patches/patch-airborne.py --dry-run -o /dev/null
node patches/test-airborne.js plugins/Bilibili-Airborne/bilibili.airborne.js
```

---

## 四、排查 · Troubleshooting

| 现象 | 原因 |
|---|---|
| 什么都不跳 | ① 关了总开关 ② 类型填了 `off` ③ **bsbsb.top 3 秒超时**（脚本里写死的，清单层改不了）——先在浏览器里打开 `https://bsbsb.top/api/skipSegments?videoID=BV1yUHL63Ean&categories=["sponsor"]` 看能不能出 JSON |
| 不跳但有假弹幕 | 类型对、时长不够，调小 `片段最小时长` |
| 跳的位置不对 | 社区标注有误（`votes=0` 的新标注尤其容易错）。用浏览器扩展在网页端跳同一个 BV 验证，错了去扩展里对该 UUID 点踩 |
| 看不到「空指部已就位」 | 脚本没跑。`脚本日志等级` 选 `debug`，在 Loon 日志里找 `[SponsorBlock]` |
| 想要 mute / poi 效果 | App 端做不到，见上文 |

### 测试视频

| BV | 时长 | 片段 |
|---|---|---|
| `BV1hyH96tESH` | 6:17 | sponsor `00:00–00:42.9`（开头即广告，最适合首测） |
| `BV1pma16SEHm` | 39:50 | sponsor `00:00–01:20.6` + intro `00:00–01:28.9` |
| `BV1LNHj68EMg` | 1:58 | sponsor `01:04.7–01:33.5` |
| `BV1EDHC6CEDJ` | 43:47 | intro `00:00–00:31.6` + outro `42:54–43:27`（专测非恰饭类别） |
