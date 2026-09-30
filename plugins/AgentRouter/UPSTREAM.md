# 上游出处与改写对照 · Upstream Provenance & Patch Map

本文件记录上游来源与逐条改动依据，正文说明见 [README.md](README.md)。
Provenance and per-change reasoning; user-facing notes live in README.md.

---

## 上游 · Upstream

| 项 | 值 |
|---|---|
| 名称 Name | AgentRouter 签到 |
| 分发 Distributor | `https://github.com/MaYIHEI/paperclip/tree/main/app/agentrouter` |
| 清单 Manifest | `app/agentrouter/agentrouter.lpx`（965 B，sha256 `525501a7…`） |
| 脚本 Script | `app/agentrouter/agentrouter.js`（16104 B，sha256 `f688ff55…`） |
| 原作者 Authors | 773075692、MaYIHEI |
| 脚本版本 Script version | `2026-09-12.r8`（脚本内 `SCRIPT_VERSION` 常量） |
| 抓取日期 Fetched | 2026-09-29 |
| 外部依赖 External | 无 · none |

**脚本与清单原件均逐字节托管**，`script-path` 已改指本仓库。脚本本身**一个字都没改** ——
托管的只是「跑谁家的代码」这件事。sha256 登记在 `manifest.json`，
`python3 tools/vendor-check.py --diff` 可随时比对上游是否漂移。

---

## 改动清单 · Change List

上游 965 B → 本版 1615 B；脚本 16104 B → 16009 B（**改了 3 处，见下**）。

### 0. 托管上游原件，script-path 改指本仓库

```diff
-cron "0 9 * * *" script-path=https://raw.githubusercontent.com/MaYIHEI/paperclip/.../agentrouter.js, ...
+cron "0 9 * * *" script-path=https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/AgentRouter/src/agentrouter.js, ...
```

**依据**：托管的意义是「上游没了也能用」。作者的个人仓库不是长期稳定承诺的 CDN，
站点消失的话已导入的插件会直接加载失败。跟 GeoFix / YouTube-Test 同一个理由。

**代价**：上游更新不再自动生效，要手动跟。`tools/vendor-check.py --diff` 就是为此存在 ——
它会告诉你上游出了新版本，由你决定跟不跟。

`#!icon` **仍指向上游**（每次现取，不托管）—— 与 AdGuard-Spoof 一致。

### 0.1 脚本层唯一的改动：修奖励金额永远识别不出来

**真机实测（2026-09-30）**：脚本跑通、签到成功，但通知里写的是
「🎁 今日奖励：**金额未识别，请到网站核对**」。

**根因**：`/api/log/self` 返回的签到记录长这样：

```
每日签到成功，增加额度 ＄25.000000 额度
        ↑ 全角 ＄（U+FF04）
```

上游正则只认半角 `$`：

```diff
-const match = content.trim().match(/^每日签到成功，\s*增加额度\s*\$\s*(\d+(?:\.\d+)?)\s*额度$/);
+// 金额前的符号实测是全角 ＄（U+FF04），不是半角 $ —— 半角全角都收。
+const match = content.trim().match(/^每日签到成功，\s*增加额度\s*[$＄]\s*(\d+(?:\.\d+)?)\s*额度$/);
```

字符类 `[$＄]` 半角全角都收，**不破坏**原本能显示的场景。

**修复前后**（同一账号同一天）：

| | 通知正文 |
|---|---|
| 修复前 | 🎁 今日奖励：金额未识别，请到网站核对 |
| 修复后 | 🎁 今日奖励：**+$25.00**（今日记录） |

### 0.2 去掉账号打码

上游有个 `maskAccount()`，把账号掐头去尾各留 2 个字符、中间用 `***` 盖住：

```js
function maskAccount(username) {
    const name = username.split("@")[0];
    return name.length > 4 ? `${name.slice(0, 2)}***${name.slice(-2)}` : `${name.slice(0, 1)}***`;
}
```

**改动**：两处调用改为直接显示 `accounts[i].username`，函数定义整段删掉（留着就是死代码）。

**依据**：个人自用，通知在锁屏上只有自己能看见；打码反而让多账号场景难以分辨。

**顺带发现上游一个真问题**：`name.length > 4` 这个分支会让**短账号藏得更少** ——
5 位账号显示成 `ab***de`，只藏 1 个字符；4 位及以下走 else 分支只留首字符。
不过本仓库已删掉该函数，此问题不再存在。

> ⚠️ 代价要说清楚：通知里现在会出现**完整邮箱**。Loon 的通知在锁屏上可见，
> 别人瞥一眼就能拿到你的账号。多设备或共用设备场景下要留意。
> 想要打码的话把 `src/agentrouter.js` 那两处插值改回 `${maskAccount(...)}` 并恢复函数即可，
> 逐字节原件在 `src/upstream-agentrouter.js`。

### 0.3 通知重排：用满三层，把预算花在刀刃上

iOS 锁屏通知是三层：**副标题**（顶栏，灰小字）、**标题**（大字）、**正文**（最多 4 行，
第 5 行起用 `…`）。上游把最显眼的标题层浪费在「今日签到已确认」这种状态描述上，
账号打码，金额/余额/消耗各占一行 —— 后面的「签到时间」直接被 iOS 截掉。

按真机截图逐行量过宽度（全角算 1、半角算 0.5），窄屏一行约 19 全角单位。重排后：

```
Agent Router · 用户ID · 第 N 天       ← 副标题：站点 · 用户ID · 注册至今天数
✅ 今日已签到 +$25                     ← 标题：状态 + 金额合并
💳 余额 $XXX.XX · 已用 $X.XX · N 次    ← 正文1：三项挤一行
📢 08-28 为保障服务长期运行，Claude 和    ← 正文2-4：公告，续行缩进 2 格
   GPT 模型已调整为限量供应，每日分
   次发放，用完即止。新的投放时间为…
```

四处具体改动：

| # | 改动 | 依据 |
|---|---|---|
| 1 | 副标题改成 `站点 · ID · 第N天` | 顶栏原本是插件名，跟通知上方显示的 App 名重复 |
| 2 | 标题把金额合并进来，余额挪到正文1 | 大字位置最该放结果，不是状态描述 |
| 3 | 余额 / 已用 / 请求数挤成一行 | 拆成三行会把公告挤出 4 行预算 |
| 4 | 去掉签到时间、账号行、约可用天数、今日消耗 | 4 行预算放不下，且这几个价值低于公告 |

**金额不带 `.00`** —— `$25` 而不是 `$25.00`，整数走 `toFixed(0)`。

**公告只在有新公告时占行**：`$persistentStore` 记住上次见到的最大 id（`ANNOUNCE_KEY`），
首次运行会把当前最新那条报一次，之后不再重复。
`wrap()` 按显示宽度自己断行 —— iOS 不会自动折，超出直接被截。
真机截图暴露了两个只有肉眼能发现的排版缺陷，都已修掉并写成断言：

| 缺陷 | 症状 | 根因 |
|---|---|---|
| 缩进没对齐 | 续行起点比首行文字靠左半个字 | 缩进用了 2 个半角空格（1 个全角单位），而首行「📢 」是 emoji 1 + 空格 0.5 = **1.5** 单位。改成 3 个空格 |
| 某一行多缩进一格 | 第 2 行比第 3 行靠右 | 断行点落在「和 GPT」的空格之后，`cur` 开头带一个空格，再叠加 3 格缩进 = 4 格。断行时要把**行首行尾空格都剪掉** |

**缩进的 2（现在 3）个单位也计入行宽预算** —— 第一版忘了算，实测第 2 行到了 20 单位。

中文标点后的空格也去掉了：原文段落换行被压成空格，`用完即止。 新的` 读着别扭。

**顶栏天数的坑**：登录响应的 `created_at` 是 **0**，真值只在 `/api/user/self` 里。
不设上界的话，`/api/user/self` 失败时会算出「第 20727 天」。`formatTopbar` 里限了 36500 天。

**顶栏的宽度会被时间戳挤占**（真机截图实测）：

| 时间戳 | 字数 | 副标题 |
|---|---|---|
| `现在` | 2 | `Agent Router · 用户ID · 第 20 天` 完整 |
| `31分钟前` | 5 | **被截** —— 「第 20 天」变成「第 2...」 |
| `昨天 20:05` | 7 | 更窄（最坏情况） |

副标题右侧要留给时间戳，而时间戳宽度随通知新旧变化。由两张截图反推，
**最坏情况（隔天的「昨天 20:05」）的预算是 13 个全角单位**。
`formatTopbar` 超预算时**整段砍掉站点名** —— 它静态，ID 和天数每天都在变。

站点名里的空格也删掉：通知宽度紧张，`Agent Router`(6 单位) 比 `AgentRouter`(5.5) 贵半个单位。

| 站点名 | 副标题 | 单位 / 预算 |
|---|---|---|
| `AR` | `AR·用户ID·第20天` | 8 / 13 ✅ |
| `Agent Router` | `AgentRouter·用户ID·第20天` | 12.5 / 13 ✅（余量 0.5） |
| 某中文站名很长 | `用户ID·第20天` | 6.5 / 13 ✅（站点名被砍） |

为此抽了个共用的 `width()`（全角 1 / 半角 0.5），断行和长度判断都用它。

**顺带删掉两处死代码**：`formatAmount`（换算已内联进 `formatStats`）、
`loginStarted` / `loginFinished` / `isNew`（标题统一写「今日已签到」后不再区分）。

### 服务端还有哪些字段没用

`test/probe.cjs` 能打印三个接口的完整字段结构。探过但没往通知里放的：

| 字段 | 为什么没放 |
|---|---|
| `aff_code` / `aff_count` / `aff_quota` | 邀请返利，账号没在用 |
| `last_login_time` | 签到脚本每次跑都刷新它，没信息量 |
| `version` / `start_time` | 服务端信息，不是账户信息 |
| `group` | 恒为 `default`，无信息量 |
| `quota_for_inviter` / `quota_for_invitee` | 邀请奖励 $50/人，但账号没在邀请 |

### 0.4 原件另存

`src/upstream-agentrouter.js` 是逐字节原件（16104 B，sha256 `f688ff55…`），`manifest.json` 里
`origin: patched-upstream` + `based-on` 指向它，与 PinDuoDuo 的 `src/upstream/` 同一做法。
`vendor-check.py` 因此新增了 `PATCHED` 表 —— 这类文件不参与漂移比对（改了，比对必然报差异）。

脚本层合计改了：奖励正则（+1 行注释）、两处打码调用、`maskAccount` 函数删除、
新增 `formatStats` / `averageDailySpend` 两个函数、日志查询挪位与共用。

### 1. 新增 `auto` 开关，默认关闭

```diff
 [Argument]
 debug = switch,false,tag=调试模式,desc=仅记录请求状态和签到判定
+auto = switch,false,tag=每日自动签到,desc=默认关闭；多设备只需一台打开
```

**依据**：上游 cron 是 `enable=true`，装完即生效。多设备各装一份会重复签到 ——
虽然服务端用 `checked_in` 判重不会多给奖励，但每台设备每天都会发一轮登录请求。
改成默认关闭，需要的用户自己打开。

**写法**：`switch,false` 的第三位（可否反转）留空 = 只在 true/false 间切。
抄自同仓库的 `loon/paperclip-cookie`（27 个开关全是这个写法）。

### 2. cron 挂上开关

```diff
-cron "0 9 * * *" ..., tag=AgentRouter签到, timeout=300, ..., enable=true
+cron "0 9 * * *" ..., tag=AgentRouter签到, timeout=300, ..., enable={auto}
```

**依据**：`enable={}` 由 Loon 调度层拦截 —— 关闭时脚本不执行、不发请求、不耗流量。
不是脚本里 `if` 判断，所以关着是真的零开销。

⚠️ `enable=` 只能挂在**无条件规则**上。这里 cron 的匹配条件是 cron 表达式本身，
不是 URL/逻辑规则，属于可挂开关的规则类型。

### 3. 一度加了 `generic` 手动触发，后又删掉

```diff
+generic script-path=..., argument=[...], tag=立即签到, ...
```

**当时的理由**：上游只有 cron，开关一关插件就完全没有可点项，没法验证账号密码填对没有。

**删掉的原因**：真机使用后确认 **Loon 的 cron 本身就能在插件页手动触发** ——
多加一条 `generic` 是纯粹冗余，还多占一个位置。开关只拦自动调度，不影响手动触发。

### 4. 头部元信息

```diff
-#!author=773075692, MaYIHEI
+#!author=773075692, MaYIHEI | 修改版: Savues <https://github.com/Savues/loon-plugin-patches>
-#!homepage=https://github.com/MaYIHEI/paperclip/tree/main/app/agentrouter
+#!homepage=https://github.com/Savues/loon-plugin-patches/tree/main/plugins/AgentRouter
```

`#!desc` 补了一句说明默认值与用法。其余头部原样保留（含 `#!icon` 仍指向上游）。

---

## 没做的 · Not done

| 事项 | 原因 |
|---|---|
| 改脚本做多设备互斥 | 服务端 `checked_in` 已判重，重复签到不多给奖励，只是多一轮请求 |
| 改 cron 时间 | 上游定的 09:00 无问题，不动 |
| 加 `[MITM]` | 不需要，本插件不抓包 |
| 托管 icon | 每次现取即可，托管反而要跟着上游改 size |
| 动 `findTodayCheckin` | 签到判定（`type===4` + 内容含「签到成功」）实测正确 |

---

## 验证 · Verification

`test/manifest.test.mjs`（23 个用例）+ `test/stats.test.cjs`（21 个用例，不联网）：

```bash
node test/manifest.test.mjs     # 清单 + 脚本结构
node test/stats.test.cjs        # formatStats / wrap / formatTopbar / formatAnnouncement 纯函数
AGENTROUTER='用户#密码' node test/run-live.cjs   # 真实网络
python3 tools/vendor-check.py --diff             # 上游是否更新
```

清单与脚本两层钉住：

- 开关默认值、cron 挂上了、没有残留 `enable=true`
- 没有多余的 `generic` 规则（cron 本身可手动触发）
- 上游 4 个 Argument 一条没删，`argument=` 仍是对应的 4 个 key
- `script-path` 全部指向本仓库托管副本
- **上游原件的 sha256 与 manifest 一致**，且仍是 16104 B
- **删掉的函数只有两个**：`formatAmount`（换算已内联）、`maskAccount`
  （`formatCheckinReward` 只是签名变了，函数还在 —— 判据是函数名，不是签名行）
- **新增的函数只有四个**：`formatStats` / `formatTopbar` / `formatAnnouncement` / `wrap`
- 按要求去掉的四项：签到时间、账号行、约可用天数、今日消耗
- **三层各司其职**：副标题走 `$.msg` 第一参、标题第二参、正文第三参；
  金额整数不带 `.00`；公告记 id、只占 3 行
- **修复真的生效**：拿 2026-09-30 真机 `/api/log/self` 的原句（全角 `＄25.000000`）
  喂给脚本里那条正则，必须解析出 25；半角 `$25.00` 也仍要能解析
- 托管件被改动能被抓到；`based-on` / `origin` 登记正确

`test/run-live.cjs` 用环境变量 `AGENTROUTER`（格式 `用户名#密码`）跑**真实网络**全流程，
响应里的账号字段自动脱敏。

`python3 tools/vendor-check.py --hash` 校验本地完整性，`--diff` 拉上游比对漂移。

反向验证，确认不是空断言：

| 注入的错误 | 测试反应 |
|---|---|
| `enable={auto}` 改回 `enable=true` | 2 项失败 |
| `script-path` 改回指向上游 | 1 项失败 |
| 往托管件尾部追加一行 | 1 项失败（sha256 对不上） |
| 正则改回只认半角 `$` | 2 项失败 |
| 改上游原件的 `BASE_URL` | 3 项失败 |
| 复制一份 `/api/log/self` 查询 | 1 项失败（共用断言） |
| 金额又变回 `$25.00` | 2 项失败 |
| 去掉公告的 id 记忆（变天天报） | 1 项失败 |