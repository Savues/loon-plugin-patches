# Bilibili-Airborne · B 站空降助手（可配置版）

> 从 [Bilibili-Dedup](../Bilibili-Dedup/README.md) 里拆出来的独立插件，只干一件事：**在 B 站 App 里跳过恰饭片段**。
> 区别是——**跳过哪些类型、用什么方式跳，交给用户自己定**。
> Splits the "空降助手" feature out of Bilibili-Dedup into a standalone plugin, and makes the skip category / skip mode configurable.

**v1.3** · 8 参数 / 2 Script / 3 MitM

> 本文只描述**当前状态**。各版本踩坑与"自动跳转"九层消融的完整过程 →
> [ITERATION.md](ITERATION.md)　出处与 9 处锚点逐条对照 → [UPSTREAM.md](UPSTREAM.md)

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Airborne/Bilibili-Airborne.lpx
```

CDN 缓存可能延迟更新，拉不到新版时加随机参数：`...lpx?cb=v13`

**需开启 MitM over HTTP/2。** Enable MitM over HTTP/2.

> ⚠️ 同时装了 [Bilibili-Dedup](../Bilibili-Dedup/README.md) 的话，请把那边的 **`空降助手` 开关关掉**。
> 两个插件都往同一条 `DM/DmSegMobile` 规则上挂脚本，类别设置各管各的，容易互相盖掉。

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
| `自动跳的类型` | `sponsor,intro,outro,padding` | 这些类别的片段带空降动作，**自动跳**（点一下也能跳） |
| `只提醒的类型` | `selfpromo,interaction` | 这些类别的片段**只在弹幕栏显示一行文字，不跳转**，跳不跳你自己拖进度条 |
| `允许哪些动作` | `skip` | 只约束自动跳那一档；`full` 空降到片尾、`poi` 空降到时间点、`mute` 无效 |
| `片段最小时长(秒)` | `8` | 只管 `skip`；`full`/`poi` 的片段长度天然是 0，不受此限制 |
| `空降方式` | `jump` | `jump` 正常；`mark` 把自动跳那一档也全部降级为只显示文字 |
| `自动跳的文案` | `空指部已就位` | 支持 `{cat}` `{start}` `{end}` `{dur}` 占位符 |
| `只提醒的文案` | `⚠️ {cat} {start}→{end}` | 同样的占位符 |
| `chronos 重签` | 开 | **决定空降会不会自动跳**，见下 |

> ⚠️ **老用户升级注意**：Loon 会保留你之前设过的参数值，所以你的 `自动跳的类型`
> 可能还是老的 `sponsor`。想要新默认值请手动改成
> `sponsor,intro,outro,padding`，或者删掉插件重新添加。

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

### 可选类别

| ID | 中文 | 可跳的典型时长 | 建议 |
|---|---|---|---|
| `sponsor` | 恰饭广告 | 10–90s | ✅ 默认开 |
| `intro` | 片头动画 | 0–30s | ✅ 值得加 |
| `outro` | 结尾鸣谢 | 20–40s | ✅ 值得加 |
| `interaction` | 一键三连提示 | **2–3s** | 需把最小时长调到 3 |
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
| 连一键三连提示一起跳 | `sponsor,intro,outro,interaction` | `3` |
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