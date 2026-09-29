# YouTube-Test · YouTube 规则独立提取版

> 从「广告拦截&净化合集」中原样提取的 YouTube 规则，供 A/B 对照测试。
> YouTube rules extracted verbatim from blockAds, for A/B testing.

**v1.0** · 1 参数 / 3 规则 / 2 域名 · 更新 `2026-09-29T09:20`

| | 中文 | English |
|---|---|---|
| 脚本 | 1 个，**上游原版未改** | 1 script, **upstream, unmodified** |
| 外部依赖 | `Maasea/sgmodule` 的 `youtube.response.js` | upstream `youtube.response.js` |

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/YouTube-Test/YouTube-Test.lpx
```

---

## 提取了什么 · What was extracted

从 `plugins/BlockAds-Patched/BlockAds.patched.plugin` 里逐条摘出**全部 5 处** YouTube 相关内容，
**未增、未删、未改写规则本体**：

| 段 | 内容 | Section | Content |
|---|---|---|---|
| `[Argument]` | `youtube_enable` | `[Argument]` | `youtube_enable` |
| `[Rule]` | `DOMAIN, ads.youtube.com, REJECT` | `[Rule]` | 同左 |
| `[Rewrite]` | `rr*.googlevideo.com/initplayback?` → `reject-dict` | `[Rewrite]` | 同左 |
| `[Script]` | `youtubei/v1/…` 8 个端点 → 上游 `youtube.response.js` | `[Script]` | 同左 |
| `[Mitm]` | `rr*.googlevideo.com`、`youtubei.googleapis.com` | `[Mitm]` | 同左 |

唯一的人为改动：给 `youtube_enable` 补了一句 `desc=` 说明（原文没有），并加了文件头元数据与尾部注释。

The only deliberate deviation is a `desc=` string added to `youtube_enable`, plus header metadata.

**上游脚本一行未改。** Upstream script untouched.

---

## ⚠️ 只能启用一个 · Enable only one

Loon 的 `[Script]` 是**先匹配先执行**：同一 URL 只能挂一条 `http-response` 规则，后面的永不执行。

本插件的 `[Script]` 与 **[YouTube-Dedup](../YouTube-Dedup/)**、**BlockAds-Patched**
命中**完全相同的 8 个端点**（`browse|next|player|search|reel/reel_watch_sequence|guide|account/get_setting|get_watch`）。

三者同时启用时，只有排在最前的那条会跑，其余**静默失效** —— 表现为「改了没效果」，但没有任何报错。

This plugin's `[Script]` matches exactly the same 8 endpoints as YouTube-Dedup and BlockAds-Patched.
Loon picks the **first** matching rule only; the rest are silently skipped.

> 2026-09-29 已因此栽过：合集的 YouTube 脚本抢在前面，导致独立插件的去广告规则从未执行过。
> 排查时请先确认「还有谁也在匹配同一批 URL」，而不是反复调自己的规则顺序。

---

## 已知副作用 · Known side effects

| 项 | 说明 |
|---|---|
| `initplayback` 拦截 | **`[Rewrite]` 无 `enable` 保护** —— 关掉 `youtube_enable` 它照样生效。会打断 UMP 与双语字幕翻译插件 |
| `timeout=60` | 上游原样保留，Loon 上限 10 秒，实测长响应可能超时 |
| 双语字幕翻译 | 与「YouTube双语翻译」插件共用 UMP 通道，两者同时启用会互相干扰 |

---

## 致谢 · Credits

- **奶思 / fmz200** <https://github.com/fmz200/wool_scripts> — 规则原作者
- **Maasea** <https://github.com/Maasea/sgmodule> — `youtube.response.js` 作者

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
