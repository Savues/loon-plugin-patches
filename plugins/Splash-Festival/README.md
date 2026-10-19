# 开屏节日定制 · Splash Festival

> B 站 iPad/iPhone 开屏品牌皮肤强制展示插件。
> 非节日期间也能展示任意节日/活动开屏，共 **76 个皮肤** + 7 个自动模式 + 屏蔽模式。

**当前版本 v40.1** · [订阅安装](https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Splash-Festival/Splash-Festival.lpx)

---

## 功能

- **22 个官方皮肤**：随时展示，不挑日期 —— 中秋、重阳、元旦、端午、七夕、万圣节、圣诞节 1.0/2.0、妇女节、劳动节、B 站 10/11/12/13 周年、BML 2021、BW 2020/2021、2233 款式一~四、slogan
- **53 个历史皮肤**（2023–2026）：官方已下架但素材仍在线的开屏 —— 2023 端午/暑假/七夕×6/开学季/中秋/万圣/跨年；2024 春节×6/元宵/妇女节/清明/劳动/高考/端午/暑假/七夕/重阳/教师节/中秋；2025 春节×6/元宵/妇女节/清明/劳动/端午/高考/暑假/七夕/教师节/中秋；2026 春节×3/五一/高考/端午/中秋
- **自动节日**：按当天日期自动选皮肤，农历节日用标准农历算法（1900–2100 数据表，30 组节日日期验证通过）；优先用今年的历史皮肤，没有则回退官方常青皮肤；非节日不干预（客户端显示官方默认开屏）
- **随机 / 轮换**：每次冷启动换一个皮肤。池子三档：默认官方 22 个；「·全部」75 个；「·半透明」只有 8 张透明角色图（2233 款式一~四 / slogan / BW2020 / 10 周年 / 11 周年 —— 实测像素层 70–82% 透明、服务端 `mode` 全为 `half`。注意 **12/13 周年是 full 满版图，不在半透明池**）。轮换用 `$persistentStore` 计数器，可预测可复现

- **block 屏蔽模式（v40 加强）**：彻底屏蔽开屏 —— 清 `show` / `select_show_list` / `selectList` / `preload`，并把 `forcibly` / `rule` / `force_show_times` 归零，客户端不创建开屏视图。`list` 保留不动（皮肤库，设置页与预加载依赖它）

## 参数设置

| 参数 | 类型 | 选项 | 默认 | 说明 |
|---|---|---|---|---|
| `enabled` | switch | — | true | 启用插件 |
| `festival` | select | 76 个节日 + 5 个自动模式 + block | midautumn | 选择展示的节日/活动品牌皮肤；`自动节日` / `随机` / `随机·全部` / `轮换` / `轮换·全部` 见「功能」章节 |
| `splashMode` | select | official / full / half | official | **显示模式**：<br>• `official` = 官方设定（full=铺满 / half=缩放）<br>• `full` = 强制铺满全屏<br>• `half` = 强制缩放完整（不裁切） |
| `imgMode` | select | auto / landscape / portrait | auto | **图片方向**：<br>• `auto` = 按设备自动（iPad 横图 / 手机竖图）<br>• `landscape` = 强制横图<br>• `portrait` = 强制竖图 |
| `logo` | select | 官方 / 隐藏 | 官方 | **B 站 logo 角标**：`隐藏` = 不叠加官方 Bilibili 角标（历史满版插画上更干净）。反汇编：type-2 路径读 list 条目的 `show_logo`、type-4 路径被 show 条目覆盖，两处都设 |
| `duration` | select | 官方 / 0秒 / 0.1秒 / 0.2秒 / 0.3秒 / 0.5秒 / 1秒 / 2秒 / 3秒 / 5秒 | 官方 | **显示时长**（ms）。⚠️ `duration` 会被 dispatcher 写入 list 条目（`[sp setDuration:]`），但「单位 ms、客户端是否真按它计时」未从反汇编的计时器直接证实，待真机确认 |

> `splashMode` 和 `imgMode` 可自由组合。例如：`splashMode=half` + `imgMode=landscape` = 强制横图 + 缩放完整。

## 使用方法

1. Loon 中添加插件订阅（上方安装链接）
2. 插件参数中选择想要的节日/活动（`festival`）
3. 按需调整 `splashMode`、`imgMode`
4. 杀掉 B 站后台后重新打开（需冷启动拉取 `brand/list`）

## 技术原理（v35.3，反汇编 8.89.0 客户端验证）

客户端冷启动请求 `x/v2/splash/brand/list`。响应模型 `BFCBrandSplashListModel` 的关键字段：
`list` / `show` / `select_show_list` / `selectList` / `forcibly` / `select_next_index` / `next_index` /
`force_show` / `force_show_times` / `last_day` / `has_new_splash_set` / `splash_hash` / `show_hash` /
`resources` / `preload` / `pull_interval` / `rule` / `queryList` / `splashItems`。

`BFCBrandSplashDispatcher.getSplashVCWithDelegate:launchFlag:inHot:` 的判定顺序：

1. `inReview` → 直接不显示
2. `getStringConfigByPath:` 非空且 `integerValue != 0` → 远程开关，跳过
3. `updateSelectList:` 把 `select_show_list` 按 `splash_id` 解析成 `selectList`
4. `[availableList forcibly]` 为真 **且** `[list selectList].count != 0`
   - 都满足 → `getSplashInSplashList:type:4` 遍历 **`show`**，按 `begin_time <= now <= end_time` 过滤
   - 否则     → `getSplashInSplashList:type:2` 遍历 **`selectList`**
5. 每条都要过 `availableSplash:` = `isFileExist:thumb_hash type:1` —— 图片必须已在本地品牌开屏缓存里
   （由 `BFCBrandSplashPreloader` 通过 `downloadResourceWithHashURL:hashValue:type:1` 下载）

> **⚠️ v37 反汇编复核修正**：上面第 4 步的「否则」不是唯一出口 —— `getSplashInSplashList:type:4`
> 内部还会按 `list.rule` 三分支：`"order"` 按 `next_index` 顺序取一条、`"probability"` 按
> `arc4random_uniform(Σprobability)` 加权随机、**其它值（含服务端平日下发的 `""`）直接 `return nil`**。
> 返回 nil 后控制流会**回退到 type-2 遍历 `selectList`**。
>
> 所以真相是：**非节日期间（`rule=""`）插件实际是靠 type-2 的 `selectList` 显示皮肤的，注入的 `show` 是装饰性的**；
> 节日当天服务端会下发 `rule:"order"`，那时 `show` 才真正生效。两条路都能出图，这就是插件「一直能用」的原因。
> （VA 速查：`getSplashInSplashList:type:` 0x10b2f6c3c，rule 分支 0x10b2f7104 / 0x10b2f7214 / 0x10b2f72f8，
> 回退点 0x10b2f5d34 → 0x10b2f6034 → 0x10b2f5eac）
>
> **v36 修的另外两个坑**（同一次反汇编发现）：
> ① `availableSplashListWithOriginList:` 在 `preload` 非空时改用 preload 条目当列表，只复制
> `list / select_show_list / selectList / select_next_index / next_index / force_show`，
> **不复制 `forcibly` 和 `rule`** → type-4 读到 preload 自己的 `show`，插件选的皮肤被官方节日皮肤顶掉
> （HAR 实证 `3_1791218834491.har`）。修法：`j.data.preload = []`。
> ② `force_show_times` 非 0 时 show 分支按 `force_show[splash_id]` 计数，超过就 `continue`
> （节日当天服务端下发 3）。修法：`j.data.force_show_times = 0`。

> **v35.3 修复的关键**：服务器平日只下发
> `{"pull_interval":1800,"forcibly":false,"rule":"","list":[…]}`（`show` 里只有默认皮肤一条），
> 缺 `forcibly` 与 `select_show_list` → 走 type-2 分支遍历空的 `selectList` → 什么都不显示。
> 这就是「节日当天能用、过后失效」的根因，**不是**客户端做节日日历校验（8.89.0 二进制里没有本地节日列表）。
> 插件现在自己补上 `forcibly:true` + `select_show_list:[{id,splash_id}]` + `selectList:[载体条目]`。

- **载体**：`list` 中 id=14（2233款式一），替换其 `thumb`/`thumb_hash`（并补 `splash_id`，模型字段名是 `splash_id` 不是 `id`）
- **官方皮肤**：注入 `show` 排期条目（窗口 = 当前时间 ±7 天），按设备选横/竖版（iPad 2732×2048 / 手机 1600×2560）
- **历史皮肤**：同样以 id=14 为载体注入
- **屏蔽**：`show` 置空

与 [Bilibili-Dedup](../Bilibili-Dedup/) 无端点冲突（本插件只拦 `brand/list`，Dedup 拦 `list`/`show`/`event/list2`），可同时启用。

## 实测记录

### v40.1（2026-10-20，真机实测修正）

`duration` 档位下压到 **0 秒 / 0.1 / 0.2 / 0.3 / 0.5**。

**用户实测得出的客户端行为**（重要，写进这里免得后人再踩）：

> **只有存在「特殊开屏图」时客户端才读 `duration`；否则回落默认图 + 默认时长。**

所以 **`屏蔽开屏` 不能用来缩短时长** —— 屏蔽后没有特殊开屏图，时长参数直接失效。
想「快速跳过开屏」的正确做法是：**选一个真实皮肤 + `duration` 设成极小值**（0.1 秒甚至 0 秒），
让开屏一闪而过，而不是把它屏蔽掉。

顺带把 `0` 值处理修成显式判断（`hasOwnProperty` + `!== undefined`），否则 `0秒` 会被
`|| 0` / `if (DUR_MS)` / `|| 1000` 三处吃掉、静默变回 1000。

回放器新增 2 项用例（0秒 / 0.1秒），共 69 项全过。

### v40（2026-10-19）

`屏蔽开屏` 从「只清 `show`」升级为彻底屏蔽。原来有三个漏口：

| 漏口 | 后果 | 修法 |
|---|---|---|
| 用户曾在 App 内「自选开屏」页保存过皮肤 → 服务端会带 `select_show_list` | `updateSelectList:` 重建出非空 `selectList`；type-4 拿空 `show` 返回 nil 后**回退 type-2**，反而把自选皮肤显示出来 | `select_show_list = []` + `selectList = []` |
| 节日当天服务端下发 `forcibly: true` | 门控被服务端打开 | `forcibly = false` |
| `preload` 非空 | 客户端改用 preload 条目当列表（v36 的坑） | `preload = []` |

另外归零 `force_show` / `force_show_times` / `rule`，并把 `has_new_splash_set` 置 false。
`list` **保留不动**：它是皮肤库，客户端「自选开屏」设置页与预加载都依赖它，清空有未知风险，
收益也只是省掉预下载。

回放器新增 4 项用例（含「节日当天 + 有自选」的最坏情况），共 67 项全过。

### v39.1（2026-10-19）

`duration` 增加 **0.5 秒**档（最短，接近「跳过开屏」）。同时修掉一个 0 值隐患：
原写法 `DUR_MS = {...}[sel] || 0` + `if (DUR_MS)` + `duration: DUR_MS || 1000`
三处都会把 `0` 当成「未设置」吃掉，将来若加「0秒」档会静默变回 1000。
现改为 `hasOwnProperty` + `!== undefined` 显式判断。

### v39（2026-10-19）

新增 `logo`（隐藏官方 Bilibili 角标）与 `duration`（显示时长）两个参数。

- **logo**：`type-2`（selectList，非节日实际路径）读 **list 条目**自己的 `show_logo`；
  `type-4`（show）路径会被 show 条目覆盖（`[sp setShow_logo:[sh show_logo]]`）。两处都设。
- **duration**：服务端 list 条目本来**不带** `duration` 字段（HAR 实证），type-2 读的是它，
  所以必须写到 list 条目上；show 条目也一并设。
- ⚠️ 两项都需真机确认实际效果（尤其 duration 的计时行为）。

### v38（2026-10-19）

新增 `随机·半透明` / `轮换·半透明`：只轮换 8 张透明角色图（2233×4 / slogan / BW2020 / 10/11 周年）。
池子成员是**实测**出来的，不是拍脑袋：PIL alpha 通道显示这 8 张 70–82% 透明，且服务端
`brand/list` 里它们的 `mode` 全部是 `half`；而 12 周年(44)/13 周年(67) 是 `mode:full` 的
横竖双版满版图，明确排除。

### v37.1（2026-10-19，真机抓包修正）

**bug**：`轮换` 一直出同一张图（HAR 实证：11 次冷启动全部注入 `38_pad.webp` = 池子第一个），
`随机` 正常。

**根因**：Loon / Surge 的 `$persistentStore` 是 `read(key)` / **`write(value, key)`** ——
`write` 的参数顺序是**值在前、键在后**。首版写成了 `write(key, value)`，
于是「键名被当成值存进去」，`read` 永远返回 `null` → 计数器恒为 0 → 永远取池子第一个。
（仓库内可对照：`plugins/GeoFix/src/geo-response.js:405` 就是 `write(value, key)`。）

**修法**：改正参数顺序；另加**回读校验**（写完读回，不一致就判定存储不可用），
不可用时兜底为「按天轮换」，至少不会永远卡在同一张。

回放器同步：mock 改成 `write(value, key)`，新增 2 项用例（存储不可用 → 仍落在池内 /
隔天会换一张），共 42 项全过。

### v37（2026-10-19，离线）

新增 `自动节日` / `随机` / `随机·全部` / `轮换` / `轮换·全部` 五个模式（`festival` 参数）。
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

回放器新增 15 项用例（共 39 项全过）。

> **待真机实测**：`自动节日` / `轮换` 冷启动是否按预期出图（`轮换` 的计数器跨冷启动是否保持，
> 取决于 `$persistentStore` 在 Loon 里的实际持久化行为）。


### v35.3（2026-10-19，iPad）

用户反馈「节日当天能用、过后失效」，根因确认为缺门控字段（详见技术原理章节）。修复后用户提供 HAR 验证：

| 注入字段 | 客户端实际读取 |
|---|---|
| `forcibly: true` | ✅ 门控通过 |
| `select_show_list: [{"id":14,"splash_id":"14"}]` | ✅ 被 `updateSelectList:` 解析成 `selectList` |
| `selectList: [载体条目]` | ✅ type-4 分支前提满足 |
| `show: [{id:14, splash_id:"14", begin_time/end_time ±7天, mode:"full"}]` | ✅ 成功读取，皮肤展示 |

目标皮肤：**BW 2021**（id=46，iPad 横图 `46_pad.webp`）。用户选择 `splashMode=official`（默认），`list[14].mode` 保持服务器下发的 `"half"`，皮肤以缩放完整方式显示。

## 文件结构

| 文件 | 说明 |
|---|---|
| `Splash-Festival.lpx` | 插件清单 |
| `splash-poc.js` | 注入脚本（76 皮肤素材表；官方图已仓库化，full 皮肤按设备选横竖版；历史 53 张） |
| `images/` | **官方 + 历史皮肤全量仓库化**：官方 full 14 张 × 横竖两套（`{id}_pad`/.`{ext}` iPad 横图 / `{id}_phone`/.`{ext}` 手机竖图），官方 half 8 张单套（`{id}`/.`{ext}`），历史 53 张单套（`{key}`/.`{ext}`） |
| `replay-splash.mjs` | 离线回放验证器（node 运行，喂 HAR 验证注入） |

## 素材来源

- **官方 22 皮肤**：`brand/list` 接口实时下发（已仓库化，免疫服务器换图）
- **历史皮肤（54 个）**：
  - 2023–2024 上半年（24 个）：来自 **zjkwdy/bili_app_splash** 归档（GitHub Actions 每日下载，停更于 2024-08，文件名即官方 id）——新增：2023 端午/暑假/七夕×6/开学季/中秋/万圣×2/跨年；2024 春节×6/元宵/妇女节/清明/劳动
  - 2024 下半年–2026（30 个）：来自 **Little-Data/bili_splash_images**（每日 Actions 更新中）——2024 高考/端午/暑假/七夕/重阳/教师节/中秋；2025 春节×6/元宵/妇女节/清明/劳动/端午/高考/暑假/七夕/教师节/中秋；2026 春节×3/五一/高考/端午/中秋
- 全部图片已入库 `images/`，注入时走 GitHub raw URL，免疫官方链接失效

1. `splash/show` 注入无效 —— 客户端不看该端点，只认 `brand/list` 的 `show`
2. 历史皮肤直接注入历史 id 无效 —— 客户端只认当前 `list` 中存在的 id
3. 自定义 URL 失败 —— 客户端校验 `thumb_hash` 与素材 MD5；同时**不能改 `logo_hash`**（改了必然不显示）
4. GitHub 上第三方数据库的 MD5 有 3 处转录错误（qm25/cj26c/women25），必须实际下载素材重算
5. 官方对 full 模式节日皮肤**按设备下发横竖两版图**（iPad 横图 / 手机竖图，`mode` 不分设备）——用错设备的图（如给 iPad 注入手机竖图）会在横屏严重裁切；插件现按请求里的 `device=pad`/`mobi_app=ipad`/UA 选对应版本
6. 官方 id=13（bili11）是轮播位，服务器会换图（当前是「2025暑假过半」），真正的 11 周年品牌图在 20251205 dump 里；v27 已修正为 11 周年品牌图（两端通用，half 模式）
7. **Loon `[Argument]` 的 `select` 不支持 `label=value` 语法** —— 选项值里出现 `=` 会与 `type=`/`tag=`/`desc=` 元数据字段冲突，导致整个 `[Argument]` 解析失败、UI 选项点不动（v30 的 bug）。中文标签只能作为**纯值**，脚本内用映射表翻译回英文键名
8. **顶层 `const` 的 TDZ 陷阱** —— `var sel = CN_TO_KEY[...]` 写在文件顶部、`const CN_TO_KEY` 写在文件中部时，会抛 `Cannot access 'CN_TO_KEY' before initialization`；该异常在 `try` 之外，直接让脚本崩溃、Loon 放行原响应，表现为「插件静默失效、所有选项都显示服务器当前默认开屏」（v31 的 bug）。定义必须放在首次引用之前
9. **回放器不传 HAR 就什么都不跑** —— 原 `replay-splash.mjs` 在没有 HAR 参数时静默 exit 0，制造「测试通过」的假象。现改为内置用例默认运行，且脚本抛异常一律记 FAIL

## 已知情况

- **「2025国际劳动节」选项已移除**（v33）：它与「2025劳动节」指向同一张图。v4（插件第一版）把它们列为两条独立记录，v16 仓库化时两者被填了同一个 URL/hash（`labor25.webp`，MD5 `bdb46b92e93d83f0cf35216b58376222`）。图片是绿色调「节日快乐」的 2025 五一开屏，源 URL `i0.hdslb.com/bfs/garb/3382e7a4…webp` 至今有效。
  已排查：官方 `brand/list`（含 id/pn/ps/history/all/老版本 build/mobi_app 各种组合）**固定只下发当前 22 条**，历史 id 拿不到；Little-Data 仓库**全部 988 个 commit 历史**里从未收录 2025 五一（该仓库 2025-12-05 才建立）；用户提供的 4 份 HAR、Wayback Machine 均无记录。**无法确认官方是否本来就有第二张图**，故按「同一皮肤」合并。若日后找到独立素材，恢复方式：`HISTORICAL_VENDORED` 加回 `labor25b` 条目 + `.lpx` 选项 + `CN_TO_KEY` 映射，并把 `ALIAS_KEY.labor25b` 去掉。
  老配置兼容：`2025国际劳动节` / `labor25b` 仍映射到 `labor25`（见脚本 `CN_TO_KEY` 与 `ALIAS_KEY`），升级后不会落到兜底。