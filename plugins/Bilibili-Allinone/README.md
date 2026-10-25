# Bilibili-Allinone · 四合一

> 由四个 B 站插件合并而成（v8.0.0, 2026-10-26）。装这一个即可替代旧四件套。

## 来源映射 · Source map

| 功能域 | 来源插件 | 迁入文件（scripts/） | 参数数 |
|---|---|---|---|
| 去广告 + 会员伪装 + 漫画净化 | Bilibili-Dedup v7.45 | vip.js / protobuf.request.js / protobuf.response.js / adblock.bundle.js / adblock-hotsearch.js（upstream/） | 21 |
| 首页标签页 + 底栏 | Bilibili-UI v3.6.0 | Enhanced.response.js | 19 |
| 空降助手 SponsorBlock | Bilibili-Airborne v1.60 | bilibili.airborne.js（chronos.js 保留但由 ii() 接管） | 20 |
| 开屏节日定制 | Splash-Festival v40.3 | splash-poc.js + images/（87 图） | 6 |

**LogLevel / logLevel 合并说明**: 原 UI 与 Dedup 的 `LogLevel` 同名同选项 → 合一；
Airborne 的 `logLevel`（kokoryh 链）与 Dedup 同名同档 → 合一。合计 67 参数。

## 关键架构

- **ViewProgress 单管线**: `upstream/protobuf.response.js` 的 `ii()` 同时完成
  videoGuide/dm 清洗（去广告）+ chronos 重签（空降，MAP×9 + UA 回退）。
  消除了跨插件「同端点 Loon 只跑先命中规则」的互抢隐患（v7.43 事故根源）。
- **chronos/**: 6 个自托管校验 zip（1×48 透明占位图 = 无降落伞图标），文件名=内容 md5。
- **探针**: `loon-sim.probe/bilibili_allinone` → reject(200, 版本号)。

## 验证

- `tests/`: vip.test.mjs(66) / replay-splash.mjs(76) / replay-mine.js(3) / lpx-verify.mjs(基线 v8.0) / test-ii.js(11)
- 发布前: `python3 tools/loon-sim/audit.py plugins/Bilibili-Allinone/Bilibili-Allinone.lpx`（URL/副本/缓存戳）
- sim v1.7.4 起 legacy 旧语法规则可验证（phase 推断 + converter 即时转换）

## 维护注意

- 上游 Sparkle 同步由 `sync-airborne.yml` 每 6 小时执行，产物写 `scripts/bilibili.airborne.js`，
  锚点失配会红（设计如此）。
- 改 `upstream/protobuf.response.js` 必须同步 bump lpx 的 `?v=` 缓存戳（v723→v724 回退事故教训）。
- 旧四插件目录已归档至 `archive/{Airborne,Dedup,UI,Splash}/`（git mv 保留历史；lpx 的 script-path 一律指向 Allinone 自身路径，不依赖 archive）。
