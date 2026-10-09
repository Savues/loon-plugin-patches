# Bilibili-Airborne · 出处与改动对照 · Provenance & patch diff

> 按本仓库《收录原则》第 5 条：出处与逐条改动记在这里，插件 README 只讲当前状态。

## 上游 · Upstream

| 项 | 内容 |
|---|---|
| 脚本 | `kokoryh/Sparkle` → `dist/bilibili.protobuf.request.js` |
| 源文件 | `src/service/sponsor-block.service.ts` |
| 抓取 | `https://raw.githubusercontent.com/kokoryh/Sparkle/refs/heads/master/dist/bilibili.protobuf.request.js` |
| 本次产物基于 | `// Built at: 2026/10/7 08:31:48` |
| 数据源 | `bsbsb.top`（社区标注服务端），本身是浏览器扩展 `hanydd/BilibiliSponsorBlock` 的后端 |
| 许可 | 遵循上游仓库许可；本仓库仅重分发打过补丁的构建产物 |

## 为什么必须动脚本

上游把两处**常量写死**在代码里，清单层传多少 `[Argument]` 都不起作用：

```ts
// src/service/sponsor-block.service.ts
url: `https://bsbsb.top/api/skipSegments?videoID=${e}&cid=${t}&category=sponsor`
// dist 里的过滤：actionType === "skip" && (end - start) >= 8
```

用户要求「自己选跳过类型和方式」，这两处就是被要求开放的部分。

## 逐条改动 · Patch, anchor by anchor

补丁器：[`patches/patch-airborne.py`](../../patches/patch-airborne.py)　单测：[`patches/test-airborne.js`](../../patches/test-airborne.js)（30 例）

| # | 锚点 | 原文 | 改后 | 性质 |
|---|---|---|---|---|
| 1 | 查询参数 | `` `…skipSegments?videoID=${e}&cid=${t}&category=sponsor` `` | `` `…&`+__airQS(s.argument) `` | 常量 → 参数 |
| 2 | 空类别短路（v1.3 起判定两档并集） | `async function en(s,e,t){try{` | `…if(!__airCats(s.argument).length)return[];try{` | 新增短路，避免 `categories=[]` 被服务端当成"全部" |
| 3 | 过滤调用 | `…?[]:tn(i)` | `…?[]:tn(i,s.argument)` | 传参 |
| 4 | 过滤本体 | `t==="skip"&&n[1]-n[0]>=8` | `n&&__airOK(a,t,r,n[1]-n[0])` | 三处常量（动作/时长/类别）→ 参数 |
| 5 | 注入入口 | `t.elems.push(...nn(s.state.segments))` | `__airInject(t,s.state.segments,s.argument)` | 换成带幂等守卫的入口 |
| 6 | 弹幕构造 | `function nn(s)` | `function nn(s,a)` | 传参 |
| 7 | 提示文案 | `content:"空指部已就位"` | `content:__airText(a,t)` | 常量 → 参数（支持占位符） |
| 8 | 空降落点 | `,l=Math.floor(t[1]*1e3)` | `,l=Math.floor(__airEnd(t)*1e3)` | `full` 段是 `[0,0]`，落点必须换成整段总时长 |
| 9 | 空降动作（v1.3 起多收一个 seg，用于判断是否只提醒） | `` action:`airborne:${l}` `` | `action:__airAction(a,l)` | 常量 → 参数（`jump`/`mark`） |

头部另注入 1.5 KB 工具代码（`__airVal` / `__airCats` / `__airQS` / `__airOK` / `__airFmt` / `__airText` / `__airAction` / `__airInject`），全部以 `__air` 前缀命名，不与上游压缩后的单字母变量冲突。

## 对《收录原则》第 2 条的说明 ⚠️

原则 2 写的是「确需改脚本时，仅限取参、远程配置依赖与标识符」。
本插件是**有意识的例外**，理由：

- 改动全部是**把硬编码常量换成参数**（类别 / 动作 / 时长 / 文案 / 模式），
  没有新增业务逻辑，也没有改动弹幕空降的实现方式（仍是 `airborne:` 动作 + 同一套 protobuf 处理）；
- 唯二的行为增量是 **空类别短路**（第 2 条）和**注入幂等守卫**（第 5 条），
  两者都是防御性的：前者避免用户填错参数时反而跳一堆，后者避免与 `Bilibili-Dedup`
  同时开启时同一视频跳两次；
- 回归测试覆盖 21 个用例，另有一次真实 API 响应的端到端验证。

## 资源归属 · Asset ownership

`chronos/` 目录（6 个引擎包，5.5 MB）**归属本插件**，2026-10-10 从
`Bilibili-Dedup/upstream/chronos/` 迁入。原因：Dedup 的「空降助手」已移出，
资源留在那里会造成跨插件依赖（Airborne 依赖 Dedup 的目录结构）。

`Bilibili-Dedup/upstream/protobuf.response.js` 里那处硬编码 URL 同步改指到这里，
保留是为了不破坏它自身的其它功能——Dedup 已不再传 `sponsorBlock`，
所以那段 `ii()` 实际不会被调用，只是留着不出错。

## 同步方式 · Auto sync

[`.github/workflows/sync-airborne.yml`](../../.github/workflows/sync-airborne.yml)　每 6 小时：

1. 拉上游 `dist/bilibili.protobuf.request.js`
2. 打 9 处锚点（**任一锚点命中 0 次或多次 → 报错终止，不产出文件**）
3. `node --check` 语法体检 + `test-airborne.js` 逻辑单测
4. 校验产物里确实含补丁、且上游的 `category=sponsor` 已消失
5. 有变化才提交

上游一旦重构那几行，Actions 会红着失败并提示"需要更新 `patch-airborne.py`"——
这是刻意的：宁可同步失败，也不要静默产出一个"用户改了参数却不生效"的脚本。