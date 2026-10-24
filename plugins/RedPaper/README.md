# 小红书去广告 · RedPaper

> **版本 v1.3.0** · 订阅以 lpx 内版本为准

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
| 搜索域 | banner/hot_list/hint/trending（声明式 `response.json.replace`） |
| **点点 AI 屏蔽**（v1.1+，开关 `removeDianDian`） | agentspark 38 接口 + inspiration（AI 创作）+ askdiandian 域名 + diandian 前端，条件式 Rewrite 可开关 |
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
