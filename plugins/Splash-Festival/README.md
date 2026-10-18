# 开屏节日定制 · Splash Festival

> B 站 iPad/iPhone 开屏品牌皮肤强制展示插件。
> 非节日期间也能展示任意节日/活动开屏，共 **53 个皮肤** + 屏蔽模式。

**当前版本 v20** · [订阅安装](https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Splash-Festival/Splash-Festival.lpx)

---

## 功能

- **22 个官方皮肤**：随时展示，不挑日期 —— 中秋、重阳、元旦、端午、七夕、万圣节、圣诞节 1.0/2.0、妇女节、劳动节、B 站 10/11/12/13 周年、BML 2021、BW 2020/2021、2233 款式一~四、slogan
- **31 个历史皮肤**（2024–2026）：官方已下架但素材仍在线的开屏 —— 高考、教师节、清明、元宵、暑假、春节系列（2025 打铁花/放御灯/滚灯球/聚天宫/跨火盆/舞龙狮、2026 马年灯笼/马头琴/马球）等
- **block 屏蔽模式**：开屏不显示任何品牌皮肤

## 使用方法

1. Loon 中添加插件订阅（上方安装链接）
2. 插件参数中 `festival` 选择想要的节日/活动
3. 杀掉 B 站后台后重新打开（需冷启动拉取 `brand/list`）

## 技术原理

客户端冷启动请求 `x/v2/splash/brand/list`，响应里的 `data.show` 数组是**展示控制通道**：
客户端按其中条目的 `begin_time`/`end_time` 时间窗口决定是否展示对应 `id` 的品牌皮肤。

- **官方皮肤**：直接向 `show` 注入排期条目（窗口 = 当前时间 ±7 天），客户端按 id 从 `list` 找素材展示
- **历史皮肤**：以 B 站 11 周年（id=13）为载体，把 `list` 中该条目的 `thumb`/`thumb_hash` 替换为目标皮肤素材的 URL/MD5 —— 客户端只验证 hash 与素材内容一致，不校验 id 与素材的对应关系，也不做本地节日日期匹配
- **屏蔽**：`show` 置空

与 [Bilibili-Dedup](../Bilibili-Dedup/) 无端点冲突（本插件只拦 `brand/list`，Dedup 拦 `list`/`show`/`event/list2`），可同时启用。

## 踩过的坑（为什么版本号这么高）

1. `splash/show` 注入无效 —— 客户端不看该端点，只认 `brand/list` 的 `show`
2. 历史皮肤直接注入历史 id 无效 —— 客户端只认当前 `list` 中存在的 id
3. 自定义 URL 失败 —— 客户端校验 `thumb_hash` 与素材 MD5；同时**不能改 `logo_hash`**（改了必然不显示）
4. GitHub 上第三方数据库的 MD5 有 3 处转录错误（qm25/cj26c/women25），必须实际下载素材重算

## 文件

| 文件 | 说明 |
|---|---|
| `Splash-Festival.lpx` | 插件清单 |
| `splash-poc.js` | 注入脚本（53 皮肤 id/URL/MD5 素材表，22 官方图已仓库化） |
| `images/` | 22 张官方皮肤仓库图（`{id}.{ext}`），注入时替换 list 的 thumb |
| `replay-splash.mjs` | 离线回放验证器（node 运行，喂 HAR 验证注入） |
