# 小红书去广告 · RedPaper

> **版本 v1.5.1** · 订阅以 lpx 内版本为准

过滤信息流推广、移除图片/视频/实况照片水印、屏蔽点点 AI 与各类引导弹窗、清空搜索域推广、拦截品牌广告资源与开屏广告。

上游版本本地化（脚本原作 RuCu6），本仓库在此基础上做了大量真机取证修正。

| | 说明 |
|---|---|
| 来源 | 上游拉取本地化，脚本原作 RuCu6/fmz200 |
| 脚本 | `RedPaper_remove_ads.js`（清洗+水印+开屏）· `RedPaper_switch_config.js`（通知弹窗，自研）· `RedPaper_flag_exp.js`（点点旗标，自研） |
| 审计依据 | discover 9.51.1 主二进制（1404 API，见逆向仓库 Xiaohongshu/） |
| 取证手段 | 进程内 hook（`lc-forensics v9.7`）+ 真机 HAR 抓包 |

---

## 安装 · Install

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/RedPaper/RedPaper_remove_ads.lpx
```

版本探针（更新后确认设备版本）：
```
https://ci.xiaohongshu.com/gw/loon-sim.probe.redpaper_remove_ads
```
返回 `1.5.1` 即表示设备已加载新版。

---

## 它做什么 · What it does

### 信息流与详情页

| 目标 | 机制 |
|---|---|
| 信息流广告 | `v6/homefeed` 五类特征全滤：直播卡（`model_type:live_v2`）/ 赞助（`ads_info`）/ 带货（`card_icon`、`note_attributes`）/ 商品（`has_related_goods`） |
| 详情页小部件 | `v2/note/widgets` 清空 `cooperate_binds` / `widget_list`（猜你想搜）/ `note_next_step`（活动）等 7 类 |
| 关注页推荐 | `v4/followfeed`、`v2/user/followings/followfeed` 只保留 `friend_post` 白名单 |
| 推荐用户 | `v5/recommend/user/follow_recommend` 清洗（`v5/recommend/user/explore` 未处理） |

### 搜索域（全净）

| 接口 | 处理 |
|---|---|
| `v4/search/trending` | **整段删除 `data`** —— 移除「猜你想搜」组件及其 12 条推荐词 |
| `fls/placeholder` | 删除 `data.placeholder` —— 清空搜索框轮播占位词 |
| `v1/search/banner_list` | 删除 `data` |
| `v1/search/hot_list` | 删除 `data.items` |
| `v4/search/hint` | 删除 `data.hint_words` |
| `v10/search/notes` | 搜索页结果广告清洗（Script） |

### 开屏与品牌广告

| 接口 | 处理 |
|---|---|
| `v2/system_service/splash_config` | **直接清空 `ads` 数组**（97KB → 3KB，减少 96.9%）+ 时间戳改写作双保险 |
| `v1/system_service/config` | 清除 `app_theme` / `loading_img` / `splash` / `store` |
| `v1/ads/resource` | `reject_dict` —— 品牌专区资源（56 条 h5 + 98 个魔方素材） |

### 弹窗与引导

| 接口 | 处理 |
|---|---|
| `v1/system/switch_config` | `ios_scene_trigger_config → push_guide_actions` 清空（15 个"打开推送通知"场景弹窗） |
| `v2/message/config` | 删除 `data.in_app_push`（站内推送弹窗权限） |
| `usergrowth/behavior/getflowlist` | 删除 `data.behaviorFlowList`（"完成X得奖励"增长引导） |
| `surprisebox/*` | `reject_dict` —— 双十一惊喜盒子 |
| `marketing/box/trigger` | `reject_dict` —— 活动弹窗触发 |
| `v2/guide/user_banner`、`v3/note/guide` | `reject_dict` |

### 点点 AI（开关 `removeDianDian`，默认开启）

| 目标 | 机制 |
|---|---|
| `agentspark/*` | `reject_dict`（38 个接口） |
| `inspiration/*` | `reject_dict`（AI 创作） |
| `askdiandian.com`、`diandian.xiaohongshu.com` | `reject_dict`（域名级） |
| `flag_exp` 入口旗标 | `diandian` / `agentspark` / `spark_` / `ai_assistants` 全部置 `false` / `0`（实测 20~26 个） |

### 水印移除

| 目标 | 机制 |
|---|---|
| 图片 / 视频 / 实况照片 | `media_save_config.disable_watermark=true` + 各保存链专门处理 |
| **实况照片保存修复** | 见下方专节（本仓库核心修复） |

### 网络层

```
[Rule] AND, ((PROTOCOL, QUIC), (DOMAIN-SUFFIX, xiaohongshu.com)), REJECT
```
拒绝 QUIC 强制回落 TCP，保证 MITM 可见。

---

## 🔴 实况照片保存修复（本仓库核心改动）

**上游 bug**：保存实况照片得到静态图。根因链——

```
imagefeed 响应带正确视频 URL（存入 persistentStore）
→ live_photo/save 响应的 url 带「双 sign 畸形尾巴」
→ 上游 `url.replace(/^https?:\/\/.*\.mp4/g, storeUrl)` 只换 .mp4 前段
→ 畸形尾巴保留 → CDN 403 → App 下载视频失败 → 只存静态图
```

**修复**：`itemA.url = itemB.url` 完整替换 + `error_code` 清零。
真实 HAR + CDN 实测（畸形 403 / 干净 200）+ 真机验证照片可动 ✅。

---

## 🔴 v1.5.1 开屏广告：改时间戳 ≠ 拦数据

**真机 HAR 实证**（实机非 LC，416 请求 / 20 秒）：

`splash_config` 响应 **97KB**，内含 **48 条品牌开屏广告**：
```
FENDI / BVLGARI宝格丽 / DIOR BEAUTY LOVERS / 华为终端
大众安徽 / Moccona摩可纳 / 好好玩情报局 / 城市情报官 …
```

**上游方案的缺陷**：只把 `start_time`/`end_time` 改成 2090 年（`3818332800`），
数据仍**全量下发**。真机实测下载了：

```
6 个广告视频（8.9MB）+ 4 张广告图（1.2MB）≈ 10MB 素材
```

用户侧从没见过开屏广告 —— 说明这些素材是**后台预取但未展示**，纯浪费流量。

**修复**：直接清空 `ads` 数组，保留 `ads_groups` 结构（8 组）+ 时间戳改写作双保险。

```js
if (i?.ads?.length > 0) { i.ads = []; changed = true; }
i.start_time = 3818332800;   // 保留：双保险
i.end_time   = 3818419199;
```

**真机对比实测**：

| 指标 | 修复前 | 修复后 |
|---|---|---|
| `splash_config` 响应 | 97,061B | **3,008B** |
| 广告视频/图片下载 | 10 个 / 10MB | **0 个 / 0MB** |

**HAR 素材归因方法**：全 HAR 遍历响应体，搜 `ads-video-al` / `ads-img-al`，统计来源接口 →
48 处来自 `splash_config`，1 处来自 `switch_config`。

---

## 开关 · Arguments

| 参数 | 默认 | 说明 |
|---|---|---|
| `removeDianDian` | true | 点点 AI 全链路屏蔽（askdiandian 域名 + agentspark/inspiration API + 入口旗标）。关闭即完全恢复 |

---

## 已知边界 · Known limits

### ⚫ HTTP 不可达（插件侧无解）

| 目标 | 原因 |
|---|---|
| **点点入口图标** | `DianDianNavButton` 原生组件 + `diandian_enabled` 本地 UserDefaults。已做到的极限：点击后 agentspark 全断（无内容），图标本身需越狱 Hook 移除 |
| **「猜你想搜」空态文案** | 模板名 `search_recommend_trending` **硬编码在 App 二进制**，且模板已缓存在 `Library/dsl_template_Directory/`。删数据 / 删缓存 / 拦下载三管齐下，组件仍会渲染空态文案 |

### 🟡 技术上限说明

「猜你想搜」已尝试的全部手段（均实测确认无效）：

1. `v4/search/trending` 响应清空到 25B ✅（数据层已拦）
2. `fls/placeholder` 清空到 173B ✅
3. 模板 zip 下载拦截 ✅（但 App 从本地缓存读取）
4. 本地模板目录删除 ✅（App 会重新下载）

→ 结论：**App 有内置兜底渲染路径，插件侧无解**。已完成的清理保留（数据层确实拦住了），
用户可见的「暂无搜索词」是 App 兜底行为。

### ⚠️ 已排除的目标（不是广告，勿再投入）

| 接口 | 体积 | 实际内容 |
|---|---|---|
| `rocking/resource/plan/batch/get` | 560KB | 商品详情营销资源（`bigSaleItemGoods`），**电商功能** |
| `mall_home/vision/feed` | 321KB | 商城商品卡 / 优惠券，**功能内容** |
| `im/v3/chats` | 105KB | 真实会话列表（32 会话），**功能数据** |
| `im/emoji/config` | 1.3MB | 表情包资源 |
| `note/detailfeed/preload` | 96KB | 详情页预加载 |
| `redconfig/dynamic/rule/execute/batch` | 28KB | 43 条功能开关，仅 3 条含推广关键词且均为功能 |
| `capa/configlist` | 3.4KB | 发布按钮 tab 配置 |

### 🔵 未加 MitM 的域名（加了解密无收益且拖慢）

- `gslb` / `apm-fe` / `apm-native` / `crash` / `lng` / `t2` / `spider-tracker` —— 纯埋点 / 诊断 / 域名解析
- `sns-*` / `picasso-static` / `fe-platform` 等 CDN —— 纯图片

---

## 踩坑记录 · Pitfalls

本插件踩过的坑，已写入仓库 `references/pitfalls.md`：

### 1. `json.replace` 的「值」参数不能传空容器（v1.4.1）

`response.json.replace("data.placeholder", [])` 在真实 Loon 上**静默失败**（不报错、不写日志）。
仓库里真机验证通过的 `json.replace` 全部是**数字**参数（SMZDM `[0,0]`、JD `[0,0,0]`）。

**规则**：JSON Action 的值参数只信已验证形态（数字 / 字符串）。清空容器一律用 `delete`。

### 2. 拦截二进制资源时占位类型必须匹配（v1.4.2）

`fe-static.xhscdn.com/.../search_recommend_trending_1.12.0.zip` 用 `reject_img(200)` 拦截 →
App 收到 GIF 占位图 → 解压失败 → `[DslJsRuntime] downloadJs failed, cannot open zip file` → **用户可见报错**。

**规则**：zip 请求不能用 `reject_img` / `reject_video`。不确定内容类型时，**宁可不拦**。

### 3. 路径层级容易少写（v1.3.1）

`v4/search/trending` 的真实结构是 `data.data.queries`（两层 `data`），
旧规则写的是 `data.queries` → 写到不存在的键，词表原封不动。

**规则**：改 JSON 路径前，先从真实响应 dump 出结构确认层级。

---

## 验证记录 · Verification

| 日期 | 项 | 结果 |
|---|---|---|
| 2026-10-24 | 实况照片保存 | ✅ 真机验证可动（上游静态图 bug 修复） |
| 2026-10-24 | 点点屏蔽 | ✅ agentspark 真机被替换为 `{}`（Loon 分目录抓包 replace_body 实证） |
| 2026-10-24 | 通知弹窗 | ✅ 15 个引导清空（真实 312KB body 端到端） |
| 2026-10-24 | 条件式 Rewrite 开关 | ✅ 真机生效（`&& ${参数} == true` 首次实证） |
| 2026-10-26 | 「猜你想搜」trending | ✅ 真实 5007B body 端到端（5007B → 25B） |
| 2026-10-27 | 品牌广告资源 | ✅ 真机 HAR 实测 2B（原 48.8KB） |
| 2026-10-27 | 站内推送 / 增长行为流 | ✅ 真机 HAR 实测 77B（原 24KB） |
| 2026-10-27 | 开屏广告 | ✅ 真机 HAR 对比：97,061B → 3,008B，素材下载 10MB → 0MB |
| 2026-10-27 | 信息流清洗 | ✅ 真机 HAR 实测 10 条内容 `is_ads` 全为 `false` |

### 静态检查

```
node cli.js check  → 0 错误 0 警告  [Rule] 1 · [Script] 14 · [Rewrite] 17 · [Mitm] 9 · [Argument] 1
sh ci.sh           → ✅ 全绿
python3 audit.py   → ✅ 全过
```

---

## 附：广告缓存清理脚本

插件只能拦 HTTP。App 本地已缓存的广告素材需直接删。

LC（Live Container）容器内的 App 私有目录可直接操作：

```bash
sh plugins/RedPaper/clean-ad-cache.sh --dry-run   # 预演
sh plugins/RedPaper/clean-ad-cache.sh             # 执行
```

清理三类：
1. `Library/dsl_template_Directory/` 广告模板（`ads_*` / `splash_ad` / `seller_window` / `brandzone` / `mid_roll` / `engage`）
2. `Documents/com.xiaohongshu.SplashAds/` 开屏 Lottie 素材 + 配置 bplist
3. `Library/Caches/SurpriseBox/` 活动弹窗 JS 配置

> ⚠️ 清理后 App 联网会按需重新下载。插件已拦截广告接口，重新下载的通常是空数据。
