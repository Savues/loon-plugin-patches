# 小红书去广告 · RedPaper

> **版本 v1.4.0** · 订阅以 lpx 内版本为准

过滤信息流推广、移除图片/视频/实况照片水印、屏蔽点点 AI 与通知引导弹窗。
上游版本本地化（脚本原作 RuCu6），Savues 修正版：实况照片保存修复 + 点点 AI 屏蔽（可开关）+ 通知弹窗清洗。

| | 中文 | English |
|---|---|---|
| 来源 | 上游拉取本地化，脚本原作 RuCu6/fmz200 | Localized |
| 改动 | 见下方「本仓库改动」 | See "Changes" below |
| 脚本 | `RedPaper_remove_ads.js`（上游清洗+水印）· `RedPaper_switch_config.js`（通知弹窗，自研）· `RedPaper_flag_exp.js`（点点旗标，自研） | 3 scripts |
| 审计依据 | discover 9.51.1 主二进制（1404 API，见逆向仓库 Xiaohongshu/） | Binary-audited |

---

## 安装 · Install

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/RedPaper/RedPaper_remove_ads.lpx
```

---

## 它做什么 · What it does

| 模块 | 机制 |
|------|------|
| 信息流广告 | `v6/homefeed` 等接口清洗：直播卡/赞助（`ads_info`）/带货（`card_icon`/`note_attributes`）/商品（`has_related_goods`）五类特征全滤 |
| 水印移除 | `media_save_config.disable_watermark=true` + 实况照片/视频保存链专门处理 |
| **实况照片保存**（🔴 本仓库修复） | 见下方专节 |
| 开屏 | `splash_config` / `system_service.config` 清洗 |
| 搜索域 | banner/hot_list/hint + **「猜你想搜」trending 整段删除**（v1.3.1）+ **搜索框占位词清空**（v1.4.0）+ 模板 zip 下载拦截 |
| **点点 AI 屏蔽**（v1.1+，开关 `removeDianDian`） | agentspark 38 接口 + inspiration（AI 创作）+ askdiandian 域名 + diandian 前端，条件式 Rewrite 可开关 |
| **品牌广告资源**（v1.4.0） | `ads/resource` 域名修 `(?:www\|edith)` —— 原写死 `www.` 导致 48.8KB 品牌专区资源（56 条 h5 + 98 个魔方素材）全放行 |
| **通知引导弹窗**（v1.2+，自研） | `switch_config → ios_scene_trigger_config → push_guide_actions`：15 个"打开推送通知"场景弹窗清空 |
| 点点入口旗标（v1.3+） | `flag_exp` 的 diandian/spark/ai_assistants 实验旗标全关 |
| QUIC 对策 | `[Rule]` 拒绝 QUIC 强制回落 TCP，保证 MITM 可见 |

---

## 🔴 实况照片保存修复（本仓库核心改动）

**上游 bug**：保存实况照片得到静态图。根因链——

```
imagefeed 响应带正确视频 URL（存入 persistentStore）
→ live_photo/save 响应的 url 带「双 sign 畸形尾巴」
→ 上游 `url.replace(/^https?:\/\/.*\.mp4/g, storeUrl)` 只换 .mp4 前段
→ 畸形尾巴保留 → CDN 403 → App 下载视频失败 → 只存静态图
```

**修复**：`itemA.url = itemB.url` 完整替换 + `error_code` 清零。真实 HAR + CDN 实测（畸形 403 / 干净 200）+ 真机验证照片可动 ✅。

---

## 开关 · Arguments

| 参数 | 默认 | 说明 |
|------|------|------|
| `removeDianDian` | true | 点点 AI 全链路屏蔽（askdiandian 域名 + agentspark/inspiration API + 入口旗标）。关闭即完全恢复 |

---

## 已知边界 · Known limits

- **点点入口图标**：`DianDianNavButton` 原生组件 + `diandian_enabled` 本地 UserDefaults，HTTP 不可达。已做到的极限：点击后 agentspark 全断（无内容），图标本身需越狱 Hook 移除
- 其余沿用上游已知限制

---

## 验证记录 · Verification

| 日期 | 项 | 结果 |
|------|-----|------|
| 2026-10-24 | 实况照片保存 | ✅ 真机验证可动（上游静态图 bug 修复） |
| 2026-10-24 | 点点屏蔽 | ✅ agentspark 真机被替换为 `{}`（Loon 分目录抓包 replace_body 实证） |
| 2026-10-24 | 通知弹窗 | ✅ 15 个引导清空（真实 312KB body 端到端） |
| 2026-10-24 | 条件式 Rewrite 开关 | ✅ 真机生效（`&& ${参数} == true` 首次实证） |
| 2026-10-26 | 「猜你想搜」trending | ✅ 真实 5007B body 端到端（5007B → 25B，`data` 整段删除）|
| 2026-10-26 | v1.4.0 四项 | ✅ 模拟器全命中（ads/resource · 模板拦截 · placeholder · MitM 扩容）|

---

## 🔴 v1.4.0：搜索域全净 + 品牌广告资源（4 项）

### P0 · `ads/resource` 域名写死 `www.`，48.8KB 广告全放行
```
旧：^https://www\.xiaohongshu\.com/api/sns/(?:v1/ads/resource|...)
实测：4 次请求全部走 edith.xiaohongshu.com → 命中 0 次
```
该接口返回 **56 条品牌专区资源**：34 个 h5（品牌活动页 `pages.xiaohongshu.com/newad/brand/…`）+ 98 个 `brandzone_magic_cube_predy_source`（魔方素材，走 `ads-i2/i3/i4.xhscdn.com/hera/…`）。
**修复**：域名 `www` → `(?:www|edith)`。

### P1 · MitM 扩容（6 → 10 域名）
新增 `search` / `fe` / `as` / `fe-static.xhscdn.com`，`askdiandian.com` → `*.askdiandian.com`。
未加的理由（避免无收益解密拖慢）：
- `gslb` / `apm-fe` / `apm-native` / `crash` / `lng` / `t2` / `spider-tracker` —— 纯埋点/诊断/域名解析，无广告内容
- `sns-*` / `picasso-static` / `fe-platform` 等 CDN —— 纯图片，解密无收益且严重影响性能

### P2 · 「暂无搜索词」空态文案（**有技术上限，已尽量处理**）
现象：v1.3.1 清空 `queries` 后，组件不消失，改为显示 DSL 的空态文案「暂无搜索词」。

根因（两条并存，实测确认）：
1. `search_recommend_trending` **硬编码在 App 二进制**（`strings discover` 可见），删 `template_info` 后 App 回落到硬编码模板名
2. 模板已**缓存在本地** `Library/dsl_template_Directory/search_recommend_trending/`（652 个模板之一），无需重新下载

已做：加 `fe-static.xhscdn.com/xhs-dsl/search_recommend_trending/` 的 `reject_img(200)` 拦截，防止缓存失效后重新下载。
**用户侧一步**：删掉本地缓存目录后重启 App，组件（含空态文案）将不再出现：
```
App 沙盒/Library/dsl_template_Directory/search_recommend_trending/
```
> 未做全局清缓存脚本 —— 那是 App 私有数据，插件侧无权操作。

### P3 · 搜索框占位词清空
`search.xiaohongshu.com/api/search/fls/placeholder` → `data.placeholder[]`（搜索框轮播占位词），
规则 `response.json.replace("data.placeholder", [])`，保留 `word_request_id` 不影响功能。

### 验证
- `check`: 0 错误 0 警告（[Rewrite] 16 · [Mitm] 10）
- `run` 逐条命中：ads/resource `reject_dict` ✅ / 模板 zip `reject_img` ✅ / placeholder `json.replace` ✅
- placeholder 改写实测：179B → 80B，`placeholder=[]`，`word_request_id` 保留
- `ci.sh` 全绿 / `audit.py` 全过

---

## 🔴 v1.3.1：「猜你想搜」修复（路径错层 + 批量写法坑）

**现象**：打开搜索框出现「猜你想搜」组件，下方 12 条推荐词（含 1 条广告词 `华为百变路由非秀不可` / `type=ads` / `ads_id=6899411856`）。

**数据源**（进程内取证 `lc-forensics v9.7` 实证）：
```
https://edith.xiaohongshu.com/api/sns/v4/search/trending?card_entry=...&word_request_situation=FIRST_ENTER
→ data.template_info = {"type":"DSL","name":"search_recommend_trending"}
→ data.data.title    = "猜你想搜"
→ data.data.queries  = 12 条（其中 1 条 type=ads）
```

**两个叠加 bug**（旧规则 `response.json.replace(["data.queries","data.hint_word"], ["[]","{}"])`）：

| # | bug | 后果 |
|---|-----|------|
| 1 | 路径少一层 `data` —— 真实是 `data.data.queries` | 写入 `data.queries`（不存在的键），真实词表原封不动 |
| 2 | 批量值 `"[]"` / `"{}"` 是**字符串**，不是数组/对象 | 即使路径对，也会写成 `queries: "[]"` 字符串，DSL 的 `len2()` 拿到非数组 |

**修复**：整段删除 `data`
```
response if ${url} ~= /^https:\/\/edith\.xiaohongshu\.com\/api\/sns\/v4\/search\/trending\?/i then response.json.delete("data")
```
输出 `{"success":true,"code":0}`（5007B → 25B）。DSL 拿不到 `template_info` → 不加载模板 → 组件不渲染。
