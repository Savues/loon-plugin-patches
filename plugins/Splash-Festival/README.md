# 开屏节日定制 · Splash Festival

> B 站 iPad/iPhone 开屏品牌皮肤强制展示插件。
> 非节日期间也能展示任意节日/活动开屏，共 **98 个皮肤** + 7 个自动模式 + 屏蔽模式。

**当前版本 v40.2** · [订阅安装](https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Splash-Festival/Splash-Festival.lpx)

---

## 功能

### 皮肤

- **22 个官方皮肤**：随时展示，不挑日期 —— 中秋、重阳、元旦、端午、七夕、万圣节、圣诞节 1.0/2.0、妇女节、劳动节、B 站 10/11/12/13 周年、BML 2021、BW 2020/2021、2233 款式一~四、slogan
- **76 个历史皮肤**（2022–2026）：官方已下架但素材仍在线的开屏
- **自动节日**：按当天日期自动选皮肤（含农历），优先今年的历史皮肤，没有则回退官方常青皮肤；**非节日不干预**（客户端显示官方默认开屏）
- **随机 / 轮换**：每次冷启动换一个皮肤，池子三档（见下）
- **屏蔽开屏**：彻底屏蔽，客户端不创建开屏视图

### 显示控制

- `splashMode` 显示模式（official / full / half）
- `imgMode` 图片方向（auto / landscape / portrait）
- `logo` 官方 Bilibili 角标开关
- `duration` 显示时长（可压到 1 毫秒，接近「跳过开屏」）

---

## 参数设置

| 参数 | 类型 | 选项 | 默认 | 说明 |
|---|---|---|---|---|
| `enabled` | switch | — | true | 启用插件 |
| `festival` | select | 76 个节日 + 7 个自动模式 + 屏蔽 | midautumn | 选择展示的节日/活动品牌皮肤；`自动节日` / `随机` / `随机·全部` / `随机·半透明` / `轮换` / `轮换·全部` / `轮换·半透明` 见「功能」 |
| `splashMode` | select | official / full / half | official | **显示模式**：`official` = 官方设定（full=铺满 / half=缩放）；`full` = 强制铺满全屏；`half` = 强制缩放完整不裁切 |
| `imgMode` | select | auto / landscape / portrait | auto | **图片方向**：`auto` = 按设备自动（iPad 横图 / 手机竖图）；`landscape` = 强制横图；`portrait` = 强制竖图 |
| `logo` | select | 官方 / 隐藏 | 官方 | **B 站 logo 角标**：`隐藏` = 不叠加官方 Bilibili 角标（历史满版插画上更干净） |
| `duration` | select | 官方 / 1毫秒 / 10毫秒 / 50毫秒 / 0.1秒 / 0.2秒 / 0.5秒 / 1秒 / 2秒 / 3秒 / 5秒 | 官方 | **显示时长**（ms）。数值越小越接近跳过开屏 |

> `splashMode` 和 `imgMode` 可自由组合。例如：`splashMode=half` + `imgMode=landscape` = 强制横图 + 缩放完整。

### 轮换 / 随机的三档池子

| 池子 | 成员 | 说明 |
|---|---|---|
| 默认 | 官方 22 个 | 其中 8 个 half 版 hash 与服务端一致、通常已缓存，切过去立刻能显示 |
| `·全部` | 98 个 | 官方 22 + 历史 76 |
| `·半透明` | 8 张 | 2233 款式一~四 / slogan / BW2020 / 10 周年 / 11 周年（实测像素 70–82% 透明、服务端 `mode` 全为 `half`）。**12/13 周年是 full 满版图，不在池内** |

---

## 使用方法

1. Loon 中添加插件订阅（上方安装链接）
2. 插件参数中选择想要的节日/活动（`festival`）
3. 按需调整 `splashMode` / `imgMode` / `logo` / `duration`
4. 杀掉 B 站后台后重新打开（需冷启动拉取 `brand/list`）

> **想「快速跳过开屏」**：选一个真实皮肤 + `duration` 设成 `1毫秒`。
> **不要用 `屏蔽开屏` 来缩短时长** —— 屏蔽后没有特殊开屏图，客户端不读 `duration`，会回落默认图 + 默认时长。

---

## 技术原理

反汇编对象：iPad 版 3.71.0（`bili-hd2`，arm64）。客户端冷启动请求 `x/v2/splash/brand/list`。

### 判定链（`BFCBrandSplashDispatcher.getSplashVCWithDelegate:launchFlag:inHot:`）

```
1. launchFlag || inHot        → return nil（只有冷启动才可能出开屏）
2. isRestricted               → return nil
3. list = currentSplashListWithClass:BFCBrandSplashListModel type:2
4. updateSelectList:          → 把 select_show_list 按 splash_id 解析成 selectList
5. availableList = availableSplashListWithOriginList:list
   if ([availableList forcibly] == 0)              → TYPE-2
   if ([list selectList].count == 0)               → TYPE-2
   s = getSplashInSplashList:availableList type:4
   if (s == nil || splashVC == nil)                → TYPE-2   ← 回退点
6. TYPE-2: getSplashInSplashList:availableList type:2 → 遍历 selectList
```

`getSplashInSplashList:type:4` 内部**按 `list.rule` 三分支**：

| `rule` | 行为 |
|---|---|
| `"order"` | 按 `next_index` 顺序取一条 |
| `"probability"` | `arc4random_uniform(Σprobability)` 加权随机 |
| **其它（含服务端平日下发的 `""`）** | **`return nil`** → 回退 TYPE-2 |

> **关键结论：非节日期间（`rule=""`）插件实际是靠 TYPE-2 的 `selectList` 显示皮肤的，注入的 `show` 是装饰性的。**
> 节日当天服务端会下发 `rule:"order"`，那时 `show` 才真正生效。两条路都能出图，这就是插件「一直能用」的原因。
> （VA 速查：`getSplashInSplashList:type:` 0x10b2f6c3c；rule 分支 0x10b2f7104 / 0x10b2f7214 / 0x10b2f72f8；
> 回退点 0x10b2f5d34 → 0x10b2f6034 → 0x10b2f5eac）

每条候选最终都要过 `availableSplash:` = `isFileExist:thumb_hash type:1` —— 图片必须已在本地品牌开屏缓存里
（由 `BFCBrandSplashPreloader` 通过 `downloadResourceWithHashURL:hashValue:type:1` 下载）。

### 载体机制

- **载体**：`list` 中 id=14（2233款式一），替换其 `thumb`/`thumb_hash`（并补 `splash_id` —— 模型字段名是 `splash_id` 不是 `id`）
- **官方皮肤**：注入 `show` 排期条目（窗口 = 当前时间 ±7 天），按设备选横/竖版（iPad 2732×2048 / 手机 1600×2560）
- **历史皮肤**：同样以 id=14 为载体注入
- **屏蔽**：清 `show` / `select_show_list` / `selectList` / `preload`，并归零 `forcibly` / `rule` / `force_show_times`

### 为什么「节日当天能用、过后失效」

服务器平日只下发 `{"pull_interval":1800,"forcibly":false,"rule":"","list":[…]}`，缺 `forcibly` 与 `select_show_list`
→ 走 TYPE-2 遍历空的 `selectList` → 什么都不显示。**不是**客户端做节日日历校验（二进制里没有本地节日列表）。
插件自己补上 `forcibly:true` + `select_show_list:[{id,splash_id}]` + `selectList:[载体条目]`。

### 两个会静默失效的坑（v36 修）

1. **`preload` 非空**：`availableSplashListWithOriginList:` 会改用 preload 条目当列表，且只复制
   `list / select_show_list / selectList / select_next_index / next_index / force_show`，
   **不复制 `forcibly` 和 `rule`** → TYPE-4 读到 preload 自己的 `show`，插件选的皮肤被官方节日皮肤顶掉。
   修法：`j.data.preload = []`。
2. **`force_show_times` 非 0**：show 分支按 `force_show[splash_id]` 计数，超过就 `continue`（节日当天服务端下发 3）。
   修法：`j.data.force_show_times = 0`。

### 与 Bilibili-Dedup 的关系

本插件只拦 `brand/list`；Dedup 拦 `list` / `show` / `event/list2`。**无端点冲突，可同时启用。**

---

## 皮肤清单

### 官方 22 个

中秋、重阳、元旦、端午、七夕、万圣节、圣诞节 1.0、圣诞节 2.0、妇女节、劳动节、
B 站 10/11/12/13 周年、BML 2021、BW 2020、BW 2021、2233 款式一~四、slogan

### 历史 76 个（2022–2026）

| 年份 | 皮肤 |
|---|---|
| 2022 | 春节-除夕 / 初一~初七（8）、劳动节、端午节 |
| 2023 | 春节-除夕 / 初一 / 初三~初七（7，初二官方未留存）、跨年、暑假过半、七夕×6、开学季、中秋、万圣×2 |
| 2024 | 春节×6、元宵、妇女节、清明、劳动节、高考、端午、暑假、七夕、重阳、教师节、中秋、新年、生日快乐、注册五周年、十二周年 |
| 2025 | 春节×6、元宵、妇女节、清明、劳动、端午、高考、暑假、七夕、教师节、中秋 |
| 2026 | 春节×3、五一、高考、端午、中秋 |
| 其他 | 2233-初、2233-小电视 |

---

## 已知情况与坑

1. `splash/show` 注入无效 —— 客户端不看该端点，只认 `brand/list` 的 `show`
2. 历史皮肤直接注入历史 id 无效 —— 客户端只认当前 `list` 中存在的 id
3. 自定义 URL 失败 —— 客户端校验 `thumb_hash` 与素材 MD5；同时**不能改 `logo_hash`**（改了必然不显示）
4. GitHub 上第三方数据库的 MD5 有 3 处转录错误（qm25/cj26c/women25），必须实际下载素材重算
5. 官方对 full 模式节日皮肤**按设备下发横竖两版图**（iPad 横图 / 手机竖图，`mode` 不分设备）——用错设备的图会在横屏严重裁切；插件现按请求里的 `device=pad`/`mobi_app=ipad`/UA 选对应版本
6. 官方 id=13（bili11）是轮播位，服务器会换图；v27 已修正为 11 周年品牌图（两端通用，half 模式）
7. **Loon `[Argument]` 的 `select` 不支持 `label=value` 语法** —— 选项值里出现 `=` 会与 `type=`/`tag=`/`desc=` 元数据字段冲突，导致整个 `[Argument]` 解析失败、UI 选项点不动。中文标签只能作为**纯值**，脚本内用映射表翻译回英文键名
8. **顶层 `const` 的 TDZ 陷阱** —— `var sel = CN_TO_KEY[...]` 写在文件顶部、`const CN_TO_KEY` 写在文件中部时，会抛 `Cannot access 'CN_TO_KEY' before initialization`；该异常在 `try` 之外，直接让脚本崩溃、Loon 放行原响应，表现为「插件静默失效、所有选项都显示服务器当前默认开屏」。定义必须放在首次引用之前
9. **回放器不传 HAR 就什么都不跑** —— 原 `replay-splash.mjs` 在没有 HAR 参数时静默 exit 0，制造「测试通过」的假象。现改为内置用例默认运行，且脚本抛异常一律记 FAIL
10. **`$persistentStore.write` 的参数顺序是 `(value, key)`**（Loon / Surge 一致）—— 写成 `(key, value)` 不会报错，但 `read` 永远返回 `null`，表现为「轮换一直出同一张图」。写完必须回读校验
11. **`duration` 只在存在「特殊开屏图」时才被客户端读取** —— 用 `屏蔽开屏` 会让它回落默认图 + 默认时长。想快速跳过开屏要用「真实皮肤 + 极小 duration」
12. **`duration <= 0` 被当成「未设置」** —— `0秒` 会回落默认时长，所以不提供 0 档
13. **载体 id=14 缺失时原实现会静默失效**（`if (item)` 没有 else）—— 现做三级兜底：id=14 → 任意 half 条目 → 任意条目 → 追加合成条目
14. **「2025国际劳动节」选项已移除**（v33）：它与「2025劳动节」指向同一张图。老配置 `2025国际劳动节` / `labor25b` 仍映射到 `labor25`，升级后不会落到兜底

---

## 文件结构

| 文件 | 说明 |
|---|---|
| `Splash-Festival.lpx` | 插件清单 |
| `splash-poc.js` | 注入脚本（98 皮肤素材表；官方图已仓库化，full 皮肤按设备选横竖版；历史 76 张） |
| `images/` | **官方 + 历史皮肤全量仓库化**：官方 full 14 张 × 横竖两套（`{id}_pad` iPad 横图 / `{id}_phone` 手机竖图），官方 half 8 张单套，历史 76 张单套 |
| `replay-splash.mjs` | 离线回放验证器（node 运行，喂 HAR 验证注入；内置 71 项用例） |

---

## 素材来源

- **官方 22 皮肤**：`brand/list` 接口实时下发（已仓库化，免疫服务器换图）
- **历史 76 个**：
  - 2023–2024 上半年（24 个）：来自 **zjkwdy/bili_app_splash** 归档（GitHub Actions 每日下载，停更于 2024-08，文件名即官方 id）
  - 2024 下半年–2026（29 个）：来自 **Little-Data/bili_splash_images**（每日 Actions 更新中）
- 全部图片已入库 `images/`，注入时走 GitHub raw URL，免疫官方链接失效

---

## 实测记录

### v40.2（2026-10-20）

`0秒` 会导致客户端回落默认时长（0 被当成「未设置」）。撤掉 0 档，改为往 100ms 以下探：**1毫秒 / 10毫秒 / 50毫秒**。
判定规则：`duration > 0` 才生效，`<= 0` 或缺失一律回落默认。

### v40.1（2026-10-20）

`duration` 档位下压到 0 秒 / 0.1 / 0.2 / 0.3 / 0.5。同时记录下一条重要结论：

> **只有存在「特殊开屏图」时客户端才读 `duration`；否则回落默认图 + 默认时长。**

所以 `屏蔽开屏` 不能用来缩短时长。想快速跳过开屏的正确做法是「真实皮肤 + 极小 duration」。

### v40（2026-10-19）

`屏蔽开屏` 从「只清 `show`」升级为彻底屏蔽，补三个漏口：

| 漏口 | 后果 | 修法 |
|---|---|---|
| 用户曾在 App 内「自选开屏」页保存过皮肤 → 服务端会带 `select_show_list` | `updateSelectList:` 重建出非空 `selectList`；TYPE-4 拿空 `show` 返回 nil 后**回退 TYPE-2**，反而把自选皮肤显示出来 | `select_show_list = []` + `selectList = []` |
| 节日当天服务端下发 `forcibly: true` | 门控被服务端打开 | `forcibly = false` |
| `preload` 非空 | 客户端改用 preload 条目当列表 | `preload = []` |

`list` **保留不动**：它是皮肤库，客户端「自选开屏」设置页与预加载都依赖它，清空有未知风险。

### v39 / v39.1（2026-10-19）

新增 `logo`（隐藏官方 Bilibili 角标）与 `duration`（显示时长）。
`logo`：TYPE-2 读 list 条目的 `show_logo`、TYPE-4 被 show 条目覆盖，两处都设。
`duration`：服务端 list 条目本来不带该字段，必须写到 list 条目上。

### v38（2026-10-19）

新增 `随机·半透明` / `轮换·半透明`：只轮换 8 张透明角色图。池子成员是**实测**出来的：
PIL alpha 通道显示这 8 张 70–82% 透明，且服务端 `mode` 全部是 `half`；
而 12 周年(44)/13 周年(67) 是 `mode:full` 的横竖双版满版图，明确排除。

### v37.1（2026-10-19，真机抓包修正）

`轮换` 一直出同一张图（HAR 实证：11 次冷启动全部注入 `38_pad.webp` = 池子第一个），`随机` 正常。
根因：`$persistentStore.write` 参数顺序写反（见「已知情况」第 10 条）。
修法：改正参数顺序 + 回读校验 + 不可用时兜底「按天轮换」。

### v37（2026-10-19）

新增 `自动节日` / `随机` / `随机·全部` / `轮换` / `轮换·全部`。
农历算法用标准 1900–2100 数据表，30 组节日日期（春节/元宵/端午/七夕/中秋/重阳 × 2023–2027）全部验证通过。

| 输入 | 结果 |
|---|---|
| `自动节日` @ 2026-10-18 | 官方 `chongyang`(145) —— 今年无重阳历史皮肤，回退官方 |
| `自动节日` @ 2026-09-25 | 历史 `midautumn26` —— 优先用今年的历史皮肤 |
| `自动节日` @ 2026-05-01 | 历史 `labor26` |
| `自动节日` @ 2024-02-24 | 历史 `yx24` |
| `自动节日` @ 2025-04-04 | 历史 `qm25` |
| `自动节日` @ 2026-03-15（非节日） | **不干预**，`show=[]`、`forcibly` 未改、载体 thumb 保持原样 |
| `轮换` × 3 次 | `midautumn` → `chongyang` → `yuandan`，`$persistentStore` 计数器逐次递增 |
| `随机` | 落在官方 22 个之内 |
| `随机·全部` / `轮换·全部` | 落在 75 个皮肤之内 |

### v35.3（2026-10-19，iPad）

用户反馈「节日当天能用、过后失效」，根因确认为缺门控字段（详见技术原理章节）。修复后用户提供 HAR 验证：

| 注入字段 | 客户端实际读取 |
|---|---|
| `forcibly: true` | ✅ 门控通过 |
| `select_show_list: [{"id":14,"splash_id":"14"}]` | ✅ 被 `updateSelectList:` 解析成 `selectList` |
| `selectList: [载体条目]` | ✅ TYPE-4 分支前提满足 |
| `show: [{id:14, splash_id:"14", begin_time/end_time ±7天, mode:"full"}]` | ✅ 成功读取，皮肤展示 |

目标皮肤：**BW 2021**（id=46，iPad 横图 `46_pad.webp`）。
