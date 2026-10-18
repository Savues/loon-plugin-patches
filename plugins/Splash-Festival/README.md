# 开屏节日定制 · Splash Festival

> B 站 iPad/iPhone 开屏品牌皮肤强制展示插件。
> 非节日期间也能展示任意节日/活动开屏，共 **53 个皮肤** + 屏蔽模式。

**当前版本 v32** · [订阅安装](https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Splash-Festival/Splash-Festival.lpx)

---

## 功能

- **22 个官方皮肤**：随时展示，不挑日期 —— 中秋、重阳、元旦、端午、七夕、万圣节、圣诞节 1.0/2.0、妇女节、劳动节、B 站 10/11/12/13 周年、BML 2021、BW 2020/2021、2233 款式一~四、slogan
- **31 个历史皮肤**（2024–2026）：官方已下架但素材仍在线的开屏 —— 高考、教师节、清明、元宵、暑假、春节系列（2025 打铁花/放御灯/滚灯球/聚天宫/跨火盆/舞龙狮、2026 马年灯笼/马头琴/马球）等
- **block 屏蔽模式**：开屏不显示任何品牌皮肤

## 参数设置

| 参数 | 类型 | 选项 | 默认 | 说明 |
|---|---|---|---|---|
| `enabled` | switch | — | true | 启用插件 |
| `festival` | select | 53 个节日 + block | midautumn | 选择展示的节日/活动品牌皮肤 |
| `splashMode` | select | official / full / half | official | **显示模式**：<br>• `official` = 官方设定（full=铺满 / half=缩放）<br>• `full` = 强制铺满全屏<br>• `half` = 强制缩放完整（不裁切） |
| `imgMode` | select | auto / landscape / portrait | auto | **图片方向**：<br>• `auto` = 按设备自动（iPad 横图 / 手机竖图）<br>• `landscape` = 强制横图<br>• `portrait` = 强制竖图 |

> `splashMode` 和 `imgMode` 可自由组合。例如：`splashMode=half` + `imgMode=landscape` = 强制横图 + 缩放完整。

## 使用方法

1. Loon 中添加插件订阅（上方安装链接）
2. 插件参数中选择想要的节日/活动（`festival`）
3. 按需调整 `splashMode`、`imgMode`
4. 杀掉 B 站后台后重新打开（需冷启动拉取 `brand/list`）

## 技术原理

客户端冷启动请求 `x/v2/splash/brand/list`，响应里的 `data.show` 数组是**展示控制通道**：客户端按其中条目的 `begin_time`/`end_time` 时间窗口决定是否展示对应 `id` 的品牌皮肤。

- **官方皮肤**：直接向 `show` 注入排期条目（窗口 = 当前时间 ±7 天），客户端按 id 从 `list` 找素材展示。**素材图已仓库化**：官方对 full 模式节日皮肤按设备下发横竖两版（iPad 横图 2732×2048 / 手机竖图 1600×2560，`mode` 不分设备），插件复刻该逻辑——按请求里的 `device=pad`/`mobi_app=ipad`/UA 识别设备并注入对应版本；half 模式品牌皮肤两端相同，单套即可。客户端只校验 `thumb_hash` 与素材 MD5 一致，官方换图不再影响展示
- **历史皮肤**：以 B 站 11 周年（id=13）为载体，把 `list` 中该条目的 `thumb`/`thumb_hash` 替换为目标皮肤素材的 URL/MD5 —— 客户端只验证 hash 与素材内容一致，不校验 id 与素材的对应关系，也不做本地节日日期匹配
- **屏蔽**：`show` 置空

与 [Bilibili-Dedup](../Bilibili-Dedup/) 无端点冲突（本插件只拦 `brand/list`，Dedup 拦 `list`/`show`/`event/list2`），可同时启用。

## 文件结构

| 文件 | 说明 |
|---|---|
| `Splash-Festival.lpx` | 插件清单 |
| `splash-poc.js` | 注入脚本（53 皮肤素材表；官方图已仓库化，full 皮肤按设备选横竖版） |
| `images/` | **官方 + 历史皮肤全量仓库化**：官方 full 14 张 × 横竖两套（`{id}_pad`/.`{ext}` iPad 横图 / `{id}_phone`/.`{ext}` 手机竖图），官方 half 8 张单套（`{id}`/.`{ext}`），历史 31 张单套（`{key}`/.`{ext}`） |
| `replay-splash.mjs` | 离线回放验证器（node 运行，喂 HAR 验证注入） |

## 踩过的坑（为什么版本号这么高）

1. `splash/show` 注入无效 —— 客户端不看该端点，只认 `brand/list` 的 `show`
2. 历史皮肤直接注入历史 id 无效 —— 客户端只认当前 `list` 中存在的 id
3. 自定义 URL 失败 —— 客户端校验 `thumb_hash` 与素材 MD5；同时**不能改 `logo_hash`**（改了必然不显示）
4. GitHub 上第三方数据库的 MD5 有 3 处转录错误（qm25/cj26c/women25），必须实际下载素材重算
5. 官方对 full 模式节日皮肤**按设备下发横竖两版图**（iPad 横图 / 手机竖图，`mode` 不分设备）——用错设备的图（如给 iPad 注入手机竖图）会在横屏严重裁切；插件现按请求里的 `device=pad`/`mobi_app=ipad`/UA 选对应版本
6. 官方 id=13（bili11）是轮播位，服务器会换图（当前是「2025暑假过半」），真正的 11 周年品牌图在 20251205 dump 里；v27 已修正为 11 周年品牌图（两端通用，half 模式）
7. **Loon `[Argument]` 的 `select` 不支持 `label=value` 语法** —— 选项值里出现 `=` 会与 `type=`/`tag=`/`desc=` 元数据字段冲突，导致整个 `[Argument]` 解析失败、UI 选项点不动（v30 的 bug）。中文标签只能作为**纯值**，脚本内用映射表翻译回英文键名
8. **顶层 `const` 的 TDZ 陷阱** —— `var sel = CN_TO_KEY[...]` 写在文件顶部、`const CN_TO_KEY` 写在文件中部时，会抛 `Cannot access 'CN_TO_KEY' before initialization`；该异常在 `try` 之外，直接让脚本崩溃、Loon 放行原响应，表现为「插件静默失效、所有选项都显示服务器当前默认开屏」（v31 的 bug）。定义必须放在首次引用之前
9. **回放器不传 HAR 就什么都不跑** —— 原 `replay-splash.mjs` 在没有 HAR 参数时静默 exit 0，制造「测试通过」的假象。现改为内置用例默认运行，且脚本抛异常一律记 FAIL