# B 站去广告 · 版本迭代全记录
# Bilibili Ad-Block · Full Iteration Log

> 记录每个版本改了什么、为什么错、怎么发现的。
> Every version: what changed, why it was wrong, and how the mistake was found.

**English summary** — 49 commits, 2026-09-27. Six failure patterns emerged; the most costly
was *injecting a field the app never reads* (two `vip` objects on the profile page — the header
reads `data.card.vip`, the plugin wrote `data.vip`). The second was *copying another author's
implementation without checking the native response* (a `due_date` unit mistake). The decisive
tool throughout was diffing a "plugin off" HAR against a "plugin on" HAR.


> 2026-09-27 一天，49 次提交，从 v1 一路到 v9。
> 这份文档记录**每个版本改了什么、为什么错、怎么发现的**，而不只是改了什么。

---

## 零、起点

用户已有三套 B 站相关插件共存：

| 插件 | 规模 | 状态 |
|---|---|---|
| `blockAds.plugin`（奶思合集） | 730+ App，含 B 站 23 Rewrite + 4 Script | 原生 |
| `YouTube_remove_ads`（YouTube） | — | 与本次无关但同源排查 |
| B 站专用去广告 | 待建 | 目标 |

**首个症状**：B 站 App 卡加载、偶尔出广告、顶栏布局不能自定义。

---

## 一、排查期：三个插件互相冲突（v1 ~ v5.1）

### 关键发现

用规则级 diff 逐条比对三个插件：

| 冲突 | 详情 |
|---|---|
| **脚本重复** | blockAds 内置的 kokoryh `bilibili.protobuf.response.js` 与 kelee 的**字节级相同**（`Build 注释后逐字节一致`） |
| **参数降级** | blockAds 只声明 `sponsorBlock`/`logLevel`，缺 `displayUpList`/`purifyComment`/`optimizeRequest` → 脚本内置默认值被 `undefined` 覆盖；`enable={optimizeRequest}` 规则永不执行 |
| **跨插件冲突** | `show/tab/v2`、`account/mine`、`feed/index` 三个端点被 Enhanced / ADBlock / blockAds 同时改写 |

### 产出

- `YouTube-Dedup` 插件（消除与 blockAds 的重复）
- `Bilibili-Dedup v1`（31 Rewrite / 5 Rule / 26 参数）
- `patch-blockads.py` 补丁器 + GitHub Actions 每 6 小时自动同步

---

## 二、v2 ~ v8：并入 Biliverse 全部功能（**失败**）

### 目标

把 Biliverse Enhanced（界面定制）+ ADBlock（去广告增强）并入 Dedup，全部开关内置。

### 三个版本，六次翻车

| 版本 | 改了什么 | 为什么错 | 怎么发现的 |
|---|---|---|---|
| **v2.0.0** | 标签页/顶栏/底栏改真开关 | 补丁用 `l.Home.Top = ...` **直接赋值**，`l.Home` 不存在时抛 `Cannot set properties of undefined`；脚本 4 个 `catch` 全在内部工具，**无一包住主流程** → 异常冒泡，脚本死，**插件完全无效果** | 用户：「所有功能均未能生效」 |
| **v2.0.1** | 改用 `i.get` / `i.set`（会自动创建中间对象） | 仍无效果 | 同上 |
| **v2.0.2** | 5 条规则各自只传所需参数（原各背 30 个） | 仍无效果 | 同上 |
| **v2.1.0** | 放宽真值判断 `T(x)`：原来只认 `true`/`"true"`，扩到 `1`/`"1"`/`on`/`ON` | 仍无效果 | 同上 |
| **v2.2.0** | 修正 `Bottom` 键名：`i.set(l,"Home.Bottom")` → `i.set(l,"Bottom")` | ✅ **部分好了** | 用户：「顶栏正常、底栏只显示默认值、开关无效」 |
| **v8** | 移除 3 条与 kokoryh 抢端点的 ADBlock 规则 | 空降助手**仍**失效 | 用户：「还是不行」 |
| — | 回滚到 v7.1 | — | — |

### 根因（三个叠加）

1. **脚本端点独占被破坏** —— Biliverse 的 ADBlock 与 kokoryh 改同一批 protobuf 端点
2. **空降助手数据被冲掉** —— `chronos` 写在这三个端点的响应里，第二个脚本的 protobuf 重序列化会丢掉
3. **判断依据错误** —— 一直用「端点不重叠 = 无冲突」，但只要同一响应有第二个脚本参与 body 处理，改写顺序就不可控

---

## 三、Bilibili-UI：真开关（v1 ~ v3.1）

从 Biliverse Enhanced 抽出界面定制独立成插件。

### 4 次翻车

| 版本 | 问题 | 发现方式 |
|---|---|---|
| v1.0 / v1.1 | 12 个「提示开关」不生效（真开关做不到） | 设计缺陷 |
| v2.0.0 | `a.parse()` 对 object 形式的 `$argument` 走 `i.set`，而 `i.set` 内部 `toPath` **按点号拆路径**：`{"Home.Tab_2036":true}` → `{Home:{Tab_2036:true}}`。补丁用**扁平读法** `l["Home.Tab_2036"]` 永远 `undefined` | Node 复现：旧补丁命中 **0** 项 / 新写法命中 **4** 项 |
| v2.0.1 ~ v2.0.2 | `l.Home` 直接赋值抛异常 | 同 v2.0.0 |
| **v2.2.0** | ✅ `Bottom` 键名修正 | 用户现象对比 |

### 最终形态（v3.1）

只保留实测可用的两组：

| 组 | 数量 | 默认 |
|---|---|---|
| 首页标签页 | 8 开关 + 默认下拉 + 备用输入框 | 推荐 / 动画 / 韩综 |
| 底部导航 | 8 开关 | 首页 / 动态 / 我的 |

参数 29 → 20，规则 5 → 1，脚本补丁 4 组 → 2 组。

---

## 四、v7 ~ v9：本地会员（三次判断错误）

### 演进

| 版本 | 内容 |
|---|---|
| v7.0 | 从 blockAds 迁入 `localVIP` 规则 |
| **v7.1** | 补上 `account/mine`（只有 `myinfo` 时会员不显示）→ **会员生效** |
| v7.2 | 加 `label.label_theme = hundred_annual_vip`（百年） |
| v7.3 | 改成 `fools_day_hundred_annual_vip`（最强绿鲤鱼）→ **生效** |
| **v7.4** | `localVIP` 是**死开关** —— 查 Loon 手册确认 `enable=` **只对 `[Script]` 生效**，`[Rewrite]` 不支持。迁到 `[Script]` + 独立 JS 脚本，开关终于能用 |
| v7.5 | 五主题独立配置，参考 zirawell 把 `due_date` 改成**秒级** |
| v7.6 | 加 `avatar_subscript` → 用户：「多此举例」 |
| v7.7 | 牌子**文字**改「小会员」 |
| v7.8 | 看到响应里 `use_img_label:true`，**推断**「文字会被图片覆盖」→ 强制 false → **用户：更新前就能看到小会员** |
| v7.8.1 | 回退。真实原因：App **文字与图片同时渲染**，该字段管的是另一张图 |
| **v7.9** | ✅ 抓包实证后改回**毫秒** |

### 决定性证据：双抓包对照

用户抓了两份**同一时刻**的 HAR（iPhone A 开 / B 关），逐字段 diff：

| 字段 | B 原生 | A 插件后 | 判断 |
|---|---|---|---|
| `due_date` | `1721577600000`（**毫秒** 2024-07-21） | `3818419199`（秒 2090） | ❌ **单位错** |
| `status` | 0 | 1 | ✅ |
| `type` | 1 | 2 | ✅ |
| `role` | 0 | 15 | ✅ |
| `label.text` | — | 小会员 | ✅（但被 v7.8 误判挡住过） |
| `ott_info`/`super_vip`/`tv_*` | — | 未动 | ✅ 未误伤 |

iPad 两份包（`account/mine` + `account/mine/ipad`）**表现完全一致**，再次印证原生是毫秒。

**第三方印证**：墨鱼 `Module.sgmodule` 第 2184-2185 行用的是 `due_date: 9005270400000`（**毫秒** 2999 年）—— 和原生、和我最初的写法**三方一致**。zilrawell 的秒级值是孤例。

---

## 五、墨鱼参考的对照

| 来源 | `due_date` | 单位 | 设 `label` | 主题定制 |
|---|---|---|---|---|
| **原生响应** | `1721577600000` | 毫秒 | — | — |
| **墨鱼** | `9005270400000` | 毫秒 | ❌ | ❌ |
| **我最初** | `9005270400000` | 毫秒 | ❌ | ❌ |
| zirawell（我抄的） | `3818419199` | **秒** | ✅ | ✅ |
| **我 v7.9** | `253402214399000` | **毫秒** | ✅ | ✅ |

**墨鱼做不出「小会员」** —— 它完全不设 `label`，只能让 B 站按原生渲染。
`label` 体系是我从 API 文档挖出来的，墨鱼没做。

---

## 六、复盘：六条教训

### 1. 不要假设多组改造同构

`La.replace` 里四组读取的键名**本来就不统一**：

```js
i.get(t,"Home.Top")  i.get(t,"Home.Top_more")  i.get(t,"Home.Tab")  i.get(t,"Bottom")
 └──────────── 带 Home. 前缀 ────────────┘                      └─ 顶层键
```

我按同构写，四组里一组静默失效。**必须逐字段核对「读什么键 / 写什么键」。**

### 2. 排查优先做现象二分，不是读代码

用户一句「顶栏能用、底栏只显示默认值」直接定位到 `Bottom` 键名 —— 比读三百行代码快得多。

### 3. 响应里存在某字段 ≠ 该字段影响目标行为

`use_img_label: true` 存在，但我推断「它会挡住文字」→ **错**。字段存在不代表它在起作用。**必须实测。**

### 4. 验证参数名时正则要用 `\{([^}]+)\}`

`\{(\w+)\}` 匹配不到带点的参数名（`Home.Tab_2036`），导致连续几轮误判「参数没传进去」。

### 5. 「脚本要联网」这件事没先验证

sponsorBlock 需要下载 `kokoryh/chronos` 的 zip，且 MD5 映射表只有 6 条而仓库有 8 个 zip。我在这上面绕了很久，而**双抓包一次就能验完**。

### 6. 双抓包 diff > 十篇文档 + 抄三个来源

今天我在「查文档 / 抄 zirawell / 抄墨鱼」之间来回，两次抄错（秒级 millis、`use_img_label`）。
**一份 baseline 抓包（A 开 / B 关）能一次性验证所有字段。**
如果一开始就拿到，能省掉 v7.5 → v7.9 这五轮。

---

## 七、if 重来一次的正确顺序

```
① 拿双抓包 baseline（插件开 / 关各一份）
     ↓
② 写脚本，参数名先确认 $argument 的实际结构
     ↓
③ 每条规则写完，立刻用 baseline 里的真实响应做回归
     ↓
④ 装到设备实测，只问「哪个能用/哪个不能」
     ↓
⑤ 有差异 → 回去看 diff，不要读文档猜
```

**全程不需要猜，也不需要抄别人的实现。**

---

## 八、最终交付物

| 插件 | 地址 | 状态 |
|---|---|---|
| `Bilibili-Dedup` v7.9 | `.../plugins/Bilibili-Dedup/Bilibili-Dedup.lpx` | 30 参数，含本地会员（5 主题可切） |
| `Bilibili-UI` v3.1 | `.../plugins/Bilibili-UI/Bilibili-UI.lpx` | 20 参数，标签页 + 底栏真开关 |
| `patch-blockads.py` | `.../patches/patch-blockads.py` | B 站退场补丁 + Actions 自动同步 |

---

# 附：本地会员（v7.0 ~ v7.12）

## 版本线

| 版本 | 内容 |
|---|---|
| v7.0 | 从 blockAds 迁入 localVIP（只改 myinfo） |
| v7.1 | 补 account/mine → **会员首次生效** |
| v7.2 | 加 label.label_theme（百年） |
| v7.3 | 改「最强绿鲤鱼」→ 生效 |
| v7.4 | localVIP 死开关 → 迁到 [Script]，开关可用 |
| v7.5 | 五主题独立配置 |
| v7.6 | 加 avatar_subscript → 用户「多此一举」 |
| v7.7 | 牌子**文字**改「小会员」 |
| v7.7.1 | 删 avatar_subscript |
| v7.8 | 推断 use_img_label 挡文字 → 强制 false |
| v7.8.1 | 回退（**误判**） |
| v7.9 | due_date 改回毫秒 |
| **v7.10** | 空间页会员伪装 → **无效** |
| v7.10.1 | 补 label.image → **无效** |
| **v7.11** | 改写 card.vip → **生效** |
| v7.12 | 字段与 myinfo 侧对齐 |

## 三次误判

| 误判 | 事实 |
|---|---|
| use_img_label:true 会挡住文字 | 文字与图片**并存**，该字段管另一张图 |
| due_date 该用秒级 | 原生是**毫秒**，三个来源中只有 zirawell 是秒 |
| 空间页缺 label.image | 真正原因是 **card.vip 根本没被写** |

## 决定性证据：抓包三连

| 抓包 | data.vip | card.vip | 说明 |
|---|---|---|---|
| 非会员主页（基线） | 无字段 | vipStatus:0 | 灰色来源 |
| v7.10 注入后 | vipStatus:1 | **vipStatus:0** | App 读后者 → 无效 |
| v7.11 注入后 | vipStatus:1 | **vipStatus:1** | 生效 |

**空间页有两份 vip，主页顶栏读的是 data.card.vip。**
连着两版只写 data.vip —— 字段值全对，但写在没人读的字段上。

## 另一个发现

App 对空间页会员标**走文字渲染**（text + bg_color），
抓包里**一次 /bfs/vip/ 图片请求都没有**。所以 v7.10.1 补 image 是无效尝试。

## 教训（补充第 8 条）

> **字段「注入成功」不等于「生效」。**
> 改响应体前必须先确认 **App 实际读的是哪个字段** ——
> 同一份响应里可能有 data.vip 和 data.card.vip 两份，只有后者被用。
> 这只能靠「注入前 vs 注入后」抓包对比，猜是猜不出来的。
