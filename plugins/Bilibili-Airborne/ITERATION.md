# Bilibili-Airborne 迭代全记录 · Iteration Log

> 从 Bilibili-Dedup 拆出独立插件 → 自定义跳过类型 → **查清"自动跳转"的真正开关**。
> 记录每个版本改了什么、为什么错、怎么发现的。
> Every version: what changed, why it was wrong, and how the mistake was found.

**English summary** — 两个版本，两次实机翻车。两次翻车都不是"功能写错了"，
而是**错误地相信了局部证据**：一次是单测绕过了真实调用点，一次是抓包里根本
看不到要找的东西。最难的一次排查跨越了九层消融实验，才确认「自动跳不跳」与
注入的弹幕字节毫无关系，真正的开关在 chronos 校验文件上——而那是一个从代码、
参数名、UI 上完全看不出来的隐式依赖。

---

## ⚡ 改动这个插件前必读

**先读这一节，再看后面的复盘。** 下面每条都是在这个插件上真的栽过的。

### 硬性流程（按顺序，不许跳）

1. **确认在对的目录里**：`git -C /var/minis/shared/lpp-work rev-parse --is-inside-work-tree`
   （`/var/minis/shared/loon-plugin-patches` 那个同名目录**不是仓库**，是过期副本）
2. **改 `patches/patch-airborne.py`（不要改产物）**，然后 `python3 patches/patch-airborne.py`
   重新生成 `plugins/Bilibili-Airborne/bilibili.airborne.js`——**产物是构建物，勿手改**
3. **五个测试全跑过**：
   ```bash
   node patches/test-airborne.js && node patches/test-airborne-proto.js \
   && node patches/test-airborne-fuzz.js && node patches/test-chronos.js \
   && python3 patches/check-airborne-lpx.py
   ```
4. **改了 `[Argument]` 就必须**跑 `check-airborne-lpx.py`，**它不过就不许 commit**
5. 改完核对一遍 `grep` 你以为改了的地方真的变了

### 代码层面的硬约束

| # | 约束 | 原因 |
|---|---|---|
| 1 | **注入块里禁止出现任何单字母变量名**（`k`、`e`、`i`…），用 `kk`/`seg`/`idx` | 漏写 `var` 就会污染压缩 bundle 的顶层同名变量（顶层 `k` 是 protobuf 的 sfixed64 类），污染后 `toBinary` 全线抛错，**插件对所有视频失效** |
| 2 | 新加辅助函数一律用 `__air` 前缀 | 同上，避免撞名 |
| 3 | 补丁锚点必须**精确命中一次**，命中 0 次或多次就 `sys.exit` | 宁可同步失败，也不要静默产出「参数不生效」的脚本 |
| 4 | 改 `chronos.js` 必须同时看未知字段 | `ViewProgress` 里有**上游 schema 没声明的字段**：字段 #4（重复 N 次）是**进度条章节按钮**（`#2` 起始秒 / `#3` 结束秒 / `#4` 章节名 / `#5` 封面）。拆开再拼回顶层消息时必须原样保留，`test-chronos.js` 有夹具盯着 |
| 5 | 新参数的名字要和脚本里读的 key **完全一致** | Loon 的 `argument=[{X}]` 是把**声明名原样**当 JSON key，大小写不同 → 用户改参数完全没反应 |
| 6 | 涉及「产物里某个函数行为」的断言，放 `test-airborne-proto.js` | `test-airborne.js` 里的 `nn` 是桩，测不到真弹幕 |

### 定位「不工作」类问题的顺序

这类问题在 HAR 里**大部分看不见**，顺序错了会绕很久：

1. 先问一句「是不是**设置**问题」——我曾把「弹幕显示区域设太小把顶部裁掉了」误判成「App 丢弃了弹幕」，白改两个版本
2. HAR 里 response body 是 **base64 + gzip**，先解开再 grep
3. 判「这条响应被脚本改写过没有」：**帧头首字节 `0x00` = 改写过（未压缩），`0x01` = 原始（gzip）**
4. 记住**伪造的响应不上网**（请求阶段脚本自己 `s.fetch` 重取上游再改写），所以「App 实际收到的那份」和「HAR 里记的那份」可能不是同一份
5. 拿不准就**做减法消融**：从 Dedup 真文件程序化派生出只保留一条规则的变体，逐层二分（本文第三节的九层消融就是这么做的）

### 发布相关

- 上游每 6 小时由 `sync-airborne.yml` 重打补丁；**锚点失效会让 Actions 红着失败**，这是设计
- 推完核对线上内容**不要用 `raw.githubusercontent.com`**（CDN 缓存会骗你，可能忽略 `?cb=`），用
  `https://api.github.com/repos/Savues/loon-plugin-patches/contents/<path>?ref=main`
- 本机拉 `raw.githubusercontent.com` 偶尔会撞上中间人证书错误（`CERTIFICATE_VERIFY_FAILED`），
  此时用本地缓存的上游副本重建，产物一致（锚点命中数不变）

---

## 零、起点

用户要求：把 `Bilibili-Dedup` 里的「空降助手」拆成独立插件，并让用户能**自己选
跳过哪些类型、用什么方式跳**。`Bilibili-Dedup` 本体**全程未改动**。

先摸清上游：`kokoryh/Sparkle` 的 `dist/bilibili.protobuf.request.js` 把两处常量
写死在代码里，清单层传多少 argument 都不起作用：

```ts
// src/service/sponsor-block.service.ts
url: `https://bsbsb.top/api/skipSegments?videoID=..&cid=..&category=sponsor`
过滤: actionType === "skip" && (end - start) >= 8
```

数据源是 [bsbsb.top](https://www.bsbsb.top)（浏览器扩展
[hanydd/BilibiliSponsorBlock](https://github.com/hanydd/BilibiliSponsorBlock) 的
服务端），共 **11 个类别**。官方网页端支持全部 11 类，App 侧只能跳 1 类。

---

## 一、v1.0：打补丁产物

上游的类别/时长/文案都是常量，要开放成参数只能改脚本。但本仓库《收录原则》
第 2 条要求"确需改脚本时仅限取参"。解法是**构建期打补丁**：

```
每 6 小时 → 拉上游 dist → 打 9 处精确锚点 → node --check + 单测 → 有变化才提交
```

| 锚点 | 原文 | 改后 |
|---|---|---|
| 查询参数 | `…&category=sponsor` | `…&` + `__airQS(argument)` |
| 空类别短路 | `async function en(s,e,t){try{` | 前面加 `if(!__airCats(…).length)return[]` |
| 过滤调用 | `?[]:tn(i)` | `?[]:tn(i,argument)` |
| 过滤本体 | `t==="skip"&&n[1]-n[0]>=8` | 类别/动作/时长三项白名单 |
| 注入入口 | `t.elems.push(...nn(s.state.segments))` | `__airInject(t, …)` |
| 弹幕构造 | `function nn(s)` | `function nn(s,a)` |
| 提示文案 | `content:"空指部已就位"` | `content:__airText(a,t)` |
| 空降落点 | `,l=Math.floor(t[1]*1e3)` | `,l=Math.floor(__airEnd(t)*1e3)` |
| 空降动作 | `` action:`airborne:${l}` `` | `action:__airAction(a,l)` |

顺带修掉一个**设计错误**：扫 2231 个 B 站视频后发现，`full` 段恒为 `[0,0]`
配整段 `videoDuration`，`poi` 段恒为 `[t,t]`——**长度天然为 0**。
原先统一的 `≥8s` 过滤会把这两类全杀掉，且 `full` 的落点会算成 0 秒。
改为：`minDuration` 只约束 `skip`；`full` 落点换成整段片尾。

### 一个自踩的坑：目录选错

这些文件最初写在 `/var/minis/shared/loon-plugin-patches/`——**那个目录根本不是
git 仓库**，是 9 月 28 日的过期副本（只有 5 个插件）。真仓库是
`/var/minis/shared/lpp-work`（另有两个旧快照 `lpp` / `lpp-main`）。

> 教训：动手写文件之前先验 `git rev-parse --is-inside-work-tree`，
> 而且 `git fetch` 必须真跑——不 fetch 就比对 `origin/main`，
> 三个副本会各自显示"已同步"。

---

## 二、v1.1：实机翻车（消息对象当数组）

**现象**：用户实机测试「完全没有弹幕也没有跳」，连 `Bilibili-Dedup` 自带的
空降助手也失效了。

HAR 里能看到设备确实发出了
`…/skipSegments?videoID=BV1hyH96tESH&cid=42568977734&categories=["sponsor"]`——
**数组式 `categories` 参数只有打过补丁的产物才会发**，说明规则命中、脚本加载、
参数解析、aid→bvid 转换全部正常。

**根因**：

```js
function __airInject(elems, segs, a) { elems.some(...) }   // 我按数组写
__airInject(t, s.state.segments, s.argument)                // 调用点传的是 protobuf 消息对象
```

`t.elems` 才是数组，`t` 本身没有 `.some`。于是每次都抛
`TypeError: elems.some is not a function`，被框架 `q.run().catch` 吞掉，
`onerror` 走 `end()` 时 `state.type` 还是 `"request"` → **`$done(this.request)`
原样放行**。查询、重取上游、参数解析全都正常，就是永远不注入。

**为什么单测没抓到**：`test-airborne.js` 和 `test-airborne-proto.js` 都是**自己
构造数组**调 `__airInject`，把「调用点传什么」这个契约整个绕开了。

> **教训**：补丁器改的每个锚点，都要有一条测试**从产物里把那个函数取出来、
> 按生产调用方的传参方式调一遍**。只测被改函数的"正确用法"等于没测。

已补 6 条直接调产物里 `$t` 的用例，并做**变异测试**证明有效——把修复回退，
新用例如期报 6 项失败。

---

## 三、自动跳转之谜（九层消融）

### 现象
弹幕栏出现了「空指部已就位」，**点击能跳**，但**不会自动跳**。
而 `Bilibili-Dedup` 里的空降助手一切正常。用户明确排除了播放进度记忆
（"每次都是手动把进度条拉到快弹广告之前几秒来测"）。

### 先修好的认知：HAR 到底能看到什么

Sparkle 的空降**不是响应改写，而是请求阶段脚本伪造响应**：

```
App → 请求 DM/DmSegMobile
  → Ct 解析请求 pb 拿 aid/cid，自己 s.fetch 重新取一次上游响应，同时并发查 bsbsb
  → v  做 $utils.ungzip + 重排 5 字节 gRPC 帧头
  → $t 注入弹幕、toBinary
  → st 把 state.type 设成 fakeResponse → $done({response})   ← 伪造响应
```

⇒ **改写后的响应根本没上过网**。上游 Loon 插件的 response 规则里也
**根本没有 DmSegMobile**（只有 DmView）。

HAR 取证三条硬规则（都踩过）：

1. Loon 导出的 HAR，response body 是 **base64**
2. gRPC 响应体是 **gzip**（帧头首字节 `0x01`），必须逐个成员解开才能 grep
3. **判据**：被改写过的响应是**未压缩**的（帧头 `0x00`）。HAR 里全是 `0x01`
   ⇒ 全是未改写的原始响应

### 排除掉的东西（每条都有证据）

| 怀疑 | 怎么排除的 |
|---|---|
| 我的补丁改了输出字节 | 离线对拍：上游原版 vs 补丁版，产物 md5 均为 `ef4aca39…` |
| 脚本版本不同 | Dedup 用的是仓库里 **2026/9/7** 的快照，当前上游是 10/7；两版产出的 HAR 字节一致 |
| App 收到的字节不同 | 同一个视频，两次会话的伪造响应 md5 都是 `6bc9feb4…` / `19cdaca0…`，**请求头响应头也一致** |
| `DM/DmView` | 响应脚本虽带了 `DmViewReply` 类，但**没有对应路由**，抛错后原样放行 |
| `grpc-status` 头 | 两次会话 ViewProgress 响应头集合完全一致，都没有这个头 |
| 播放进度记忆 | 用户明确否认 |
| 弹幕里的字段有差异 | 逐字段 diff：progress/action/content/oid/attr/mode/id/pool 全同 |
| 官方空降弹幕干扰 | 该视频 147+37 条原始弹幕里带 `action` 的是 **0 条** |

### 消融路径

每轮都从**真文件程序化派生**，保证除被消融的部分外逐字不变。

| 实验 | 构造 | 结果 | 结论 |
|---|---|---|---|
| A | 单独搬 Dedup 的空降规则 | 不跳 | 搬运无罪 |
| D1 | Dedup 去掉 14 条 Rewrite | **跳** | 元凶在 Script |
| D2 | Dedup 只留空降助手脚本 | 不跳 | 同上 |
| S1 | D1 去掉「Protobuf处理」 | 不跳 | 元凶 = `protobuf.response.js` |
| S2 | D1 只留「Protobuf处理」+ 空降 | **跳** | 确认 |
| U1 | 只留两个 `ViewProgress` 端点 | **跳** | 元凶 = ViewProgress |
| U2 | 只留 DynAll / DmView / MainList | 不跳 | 同上 |
| V1 | 只留 `view.v1.View/ViewProgress` | **跳** | 确认是处理函数 `Qn` |
| V2 | 只留 `viewunite.v1.View/ViewProgress` | — | 未测（HAR 显示 App 走非 unite 版） |

### 根因

`protobuf.response.js` 里 `view.v1.View/ViewProgress` 的处理函数 `Qn` 做的两件事：

```js
Qn = (a,e) => { n = pt.fromBinary(a.response.bodyBytes);
  n.videoGuide = void 0;                                  // ← HAR 实测：该字段本来就不存在，空操作
  ni(t) && n.chronos && ii(n.chronos, a.request.headers); // ← 真正生效的是这个
  … }
```

HAR 里两次会话 ViewProgress 响应的**唯一**差异：

| | chronos#1 md5 | chronos#2 file | chronos#3 sign |
|---|---|---|---|
| 服务端原始 | `325e7073ffc6fb5263682fecdcd1058f` | `http://i0.hdslb.com/bfs/app-static/042de1dc….zip` | 80 字符 token |
| 重签之后 | `932002070dc1b51241198a074d2279fc` | 本仓库 `chronos/<md5>.zip` | **删除** |

**拿不到 chronos 校验文件时，App 会进入降级状态**：弹幕照常渲染、
**点了也能跳**，但 `airborne:` 动作不自动执行。

也就是说——**「自动跳过」依赖的是 Bilibili-Dedup 里的 chronos 重签功能，
不是空降链路的任何特性**。而这是一个隐式依赖：从代码、参数名、UI 上
完全看不出来。这也解释了为什么三轮"换个脚本版本 / 换个插件封装"的实验
全都白做——变量根本不在那里。

---

## 四、v1.2：把 chronos 搬进独立插件

新增 `plugins/Bilibili-Airborne/chronos.js`，**不依赖上游任何脚本**，
用通用 protobuf 改写完成三步（md5 查表映射 / file 重指 / 删 sign），
其余字段逐字节保留。zip 复用 `Bilibili-Dedup/upstream/chronos/` 里已有的 6 个，
**不重复托管**。至此插件不再依赖 Bilibili-Dedup。

### 又一个只有机器能抓的 bug

自己写的 protobuf 拆分/拼接必须自洽：

- `split()` 的 `raw` 若含长度前缀，`join()` 就不能再补；反之亦然
- 第一版两边都写错了 → 输出比期望**少 4 字节**

4 字节的差异人眼根本看不出来，结构上"看着也对"。**唯一能抓住它的手段是
断言"输出与已知正确产物逐字节一致"**——所以测试夹具直接用了真实抓包的两份
响应，一份就是 Dedup 实测的正确答案。

---

## 四之二、v1.7 / v1.8：一次错误的"修复"，以及它教我的事

**经过**：用户反馈"整篇软广的提醒弹幕看不见"。HAR 取证发现伪造出的 `DmSegMobile`
响应里**确实有**那条提醒弹幕，字段只差一个 `action`（空 vs `airborne:xxx`），
于是我断定：**App 认得 `midHash=1948dd5d`（空降标志），发现没有动作就整条丢弃**。

**结论是错的。** 用户后来把 App 的「弹幕显示区域」调大之后，v1.6 那条提醒弹幕
一直好好地显示着——**顶部大字（`mode 5`、字号 50）**，正是用户喜欢的样子。
真正的原因是显示区域太小，把顶部裁掉了。

**更糟的是我据此做的"修复"**：把提醒档降级成借用真实弹幕样式的 25px 滚动弹幕，
把用户喜欢的大字变成了底部小字。这是**实打实的功能退步**。

### 教训

| # | 坑 | 教训 |
|---|---|---|
| 9 | 从「HAR 里有、屏幕上没有」直接推出「被 App 丢弃」 | 中间隔着**客户端行为与设置**这一层。证明"数据到了"不等于证明"渲染逻辑把它扔了"——要先排除设置项 |
| 10 | 假设一旦被验证就立刻写进代码 | 该先在真机上确认现象（这次只要把显示区域调大就能验证），再动手改 |

**如果重来**：拿到"看不见"的反馈，第一步应该是让对方调整一个相关设置再问一次，
而不是立刻从抓包里推导机制。

---

## 四之三、v1.3 ~ v1.21：功能长出来的一轮

这十几个版本没有再翻车，但踩到了两类**流程坑**（第 11–16 条），先记功能。

| 版本 | 做了什么 |
|---|---|
| v1.3 | 类别分「自动跳 / 只提醒」两档；自动跳扩到 `sponsor,intro,outro,padding` |
| v1.4 | `selfpromo` 进自动跳；弹幕类别名中文化（`{cat}` 渲染中文，新增 `{catid}` 取原始 id） |
| v1.5 | `interaction` 进自动跳；只提醒档默认留空 |
| v1.6 | 整篇软广（`actionType=full`）独立成档 `airFullMode`，默认 `notice`（片头提醒不跳） |
| v1.7 / v1.8 | **错误的两版**：把提醒档降级成普通滚动弹幕、加 8 秒延后。已在 v1.9 回退 |
| v1.9 | 回退样式改动；顺带发现「提醒档在两个列表里都出现时，自动档优先」这个语义 bug，改成提醒档优先 |
| v1.10 | 只提醒档默认填满所有非自动跳类别（两档并集 = 全部 11 类，杜绝「两档都空 = 静默失效」） |
| v1.11 | 修：片头汇总文案渲染成 `⚠️  00:00→00:00`（模板算了却没传给渲染函数） |
| v1.12 | `chronos.js` 从 `ViewProgress` 抠出来独立成文件（自带通用 protobuf 改写） |
| v1.14 | 片头汇总：开头列出本视频所有会被处理的片段 |
| v1.15 | 修汇总文案（同 v1.11 的教训） |
| v1.16 | 汇总支持换行（`airSummaryWrap`） |
| v1.17 | 汇总加「本视频包括：」标题行 + 按类别上色 |
| v1.19 | 删掉整篇软广的独立提醒（汇总里已有一行，两条说的是同一件事） |
| v1.20 | 标题改「⚠️本视频包含⚠️」；整篇恰饭置顶「全片恰饭软广」；`sponsor` → 恰饭硬广 |
| v1.21 | `interaction`→三连提醒、`intro`→开场动画、`preview`→往期回顾（依据解包扩展的官方文案）；汇总改红色；修错别字「软告→软广」 |
| v1.22 | 修：开头有自动跳时片头汇总看不见 —— 汇总钉到用户真正的落点（新增 `airSummaryAnchor`，`start` 可退回旧行为）；同时把 `sponsor` 的中文名从「恰饭硬广」改为「恰饭内容」 |
| v1.23 | 片头汇总按**类别**折叠成一行（同类的多段合成 `恰饭内容 ×2 · 34:55–35:11 | 52:31–52:40`，用户实测 BV1VeHQ6tEaS 两段恰饭原先显示两行同名列）；删除 `stagger` 与 `same` 两种排版（连同 `airSummaryWrap` 参数）；截断上限由「段」改按「类」计；修超过 1 小时的时间点原先显示 `120:00` 的问题 |
| v1.24 | 汇总多段同类改用紧凑格式 `恰饭内容 ×2 · 34:55、52:31（共25s）`：逐段列完整区间时三段同类就 53 显示列，竖屏顶部弹幕只放得下约 32~40 列必然被截断；起点最多列 2 个、多余用 `…`，单段保持完整区间不变。宽度封顶 36 列（已写成断言） |
| v1.25 | 汇总改为「类别一行 + 每段各一行 + 每段标时长」：`恰饭内容 ×2` / `34:55–35:11 （16s）` / `52:31–52:40 （9s）`；单段也带时长；按用户判断不设段数上限。每行宽度约 20 列，彻底不受段数影响 |

### 类别命名的依据：解包浏览器扩展

**不要只看 GitHub 源码**——把扩展 CRX 解开，里面有更完整的文案（`_short` 短名 + `guideline1/2/3` 提交判定标准）：

```bash
# CRX3 = "Cr24" + 版本 + 头长 + zip，从第 12+头长 字节开始就是 zip
curl -skL -o c.crx "https://clients2.google.com/service/update2/crx?response=redirect\
&acceptformat=crx2,crx3&prodversion=130.0.0\
&x=id%3Deaoelafamejbnggahofapllmfhlhajdd%26installsource%3Dondemand%26uc"
# 注意 prodversion=0.0 会返回 204 空包，随便填个大的版本号即可
```

解出来 96 个文件，`v0.16.0`。两个关键位置：
- `_locales/zh_CN/messages.json` —— `category_*` 系列的名称 / `_short` / `_description` / `_guideline1..3`
- `js/background.js` —— `categorySelections` 是**真实生效的默认档位**（`AutoSkip / ManualSkip / ShowOverlay / Disabled`），比读源码可靠

同文件里还有两个可复用的字符串：`full` = 「整个视频」；`AutoSkipDanmakuSkip`（自动跳过弹幕）默认 `false`。

### 这一轮的三个真 bug

1. **v1.14 推了坏清单**：`argument` 里引用了 `airSummary`，`[Argument]` 里漏了声明行（字符串替换漏了换行符，两行挤成一行）。`check-airborne-lpx.py` 当时就报了，但我没停就 commit+push 了。
2. **v1.20 差点推出去一个致命 bug**：把 `var synth, head, k;` 改成 `var synth, head;`，但循环里还有三处 `for (k = ...)`。漏写 `var` 会让 `k` 解析到**压缩后 bundle 的顶层 `k`——protobuf 的 sfixed64 类**，被赋成数字后 `k.from` 变 undefined，之后**任何 `toBinary` 都抛**，插件对**所有视频**彻底失效。是 proto 测试先抓到的。
3. **UPSTREAM.md 的编辑静默失败**：锚点字符串对不上，`str.replace` 不报错，我却在提交信息里写"已加入"。

---

## 五、测试体系

全部离线，不联网，CI 逐个跑：

| 文件 | 覆盖 | 用例 |
|---|---|---|
| `test-airborne.js` | 参数解析、类别/动作/时长过滤、两档分组、文案占位符与改名、幂等 | 56 |
| `test-airborne-proto.js` | 整份产物在 Loon 式全局下能否加载；注入弹幕真 protobuf 往返；**走真实调用点 `$t`**；**顶层变量未被污染** | 45 |
| `test-airborne-fuzz.js` | 18 种畸形/边界响应 × 17 组参数 | 311 组 |
| `test-chronos.js` | 与 Dedup 实测**逐字节一致**；gzip 帧；幂等；**未知字段（进度条章节）逐字段保留** | 17 |
| `check-airborne-lpx.py` | 清单结构、regex 正反例、**参数名↔脚本 key 一一对应**、Mitm 覆盖 | 78 |

`check-airborne-lpx.py` 里「参数名 ↔ 脚本 key」这一条，是 v1.0 阶段踩坑之后加的：
清单里写 `AirborneCategories`（大写 A），脚本读 `airborne`（小写 a），而
**Loon 的 `argument=[{X}]` 是把声明名原样当 JSON key 的**——结果用户改参数
完全没反应。这类静默失效比崩溃危险得多。

---

## 六、维护事项

1. **chronos 映射表需要跟进**。表里的 key 是「服务端当前下发的 chronos zip 的
   md5」。B 站换版本后若表里没有对应 key，会退回按 UA 取默认值
   （`universal` / `bili-hd` / `bili-inter`），可能不再生效。
   表与 `Bilibili-Dedup/upstream/protobuf.response.js` 里的那张保持一致。
2. **补丁锚点失效时 Actions 会红着失败**，这是刻意设计——宁可同步失败，
   也不要静默产出一个"用户改了参数却不生效"的脚本。
3. 消融实验产物（12 个临时 `.lpx`）已在 v1.2 实测通过后删除，
   实验结论见本文第三节。

---

## 七、踩坑清单

| # | 坑 | 教训 |
|---|---|---|
| 1 | 参数名大小写与脚本 key 不一致 | Loon 用**声明名原样**当 JSON key，必须交叉校验 |
| 2 | 单测绕过真实调用点 | 补的函数要**按生产调用方传参**的方式调 |
| 3 | 自己写的 protobuf 拆分/拼接不自洽 | 断言"与已知正确产物逐字节一致" |
| 4 | HAR body 是 base64 + gzip | 直接 grep 必然 0 命中 |
| 5 | 伪造的响应不上网，HAR 里看不到 | 判据是帧头 `0x00`（未压缩）才是改写过的 |
| 6 | 目录选错，写在非 git 目录里 | 动手前先 `git rev-parse --is-inside-work-tree` |
| 7 | 不 fetch 就比对 `origin/main` | 三个副本会各自显示"已同步" |
| 8 | 隐式依赖从代码里看不出来 | chronos 是自动跳的前置条件，却没写在任何参数名或 UI 上 |
| 9 | 「HAR 里有、屏幕上没有」≠「被 App 丢弃」 | 中间隔着客户端设置层，要先排除设置再下结论 |
| 10 | 断言写在有桩的测试文件里 | `test-airborne.js` 的 `nn` 是桩，涉及 `nn` 真实行为的断言必须放 `test-airborne-proto.js` |
| 11 | **注入块里的循环变量漏写 `var`** | 会解析到压缩后 bundle 的顶层同名变量（`k` = protobuf 的 sfixed64 类），污染后 `k.from is not a function`，插件对**所有视频**失效。注入块里**不要用任何单字母变量名** |
| 12 | `str.replace` 没匹配上却照样往下走 | 字符串替换静默失败。写完必须 `grep` 核对文件真的变了，提交信息里不许写没验证过的"已加入" |
| 13 | 校验报警告了仍然 commit + push | v1.14 就是这么把坏清单推上线的。**清单改完、校验没过 = 不许提交** |
| 14 | 收到"帮我查一下"就直接改代码 | 查询类请求只读不改；要改先把要改的东西列出来等确认 |
| 15 | 拿 `raw.githubusercontent.com` 核对线上内容 | 它有 CDN 缓存，**可能忽略查询参数**。核对线上真实内容用 GitHub API：`contents/<path>?ref=main` |
| 16 | 只在真机观察里找 bug | 第 11 条那种致命错误真机表现为"静默不工作"，定位极慢；而 Node 里跑一遍 `toBinary` 立刻炸出来 |
