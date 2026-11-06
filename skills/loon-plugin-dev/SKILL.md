---
name: loon-plugin-dev
version: 1.6.0
description: >
  帮我做去广告 / 写个 Loon 插件 / 加拦截规则 / 这个广告怎么去掉 / 弹窗悬浮窗太烦了 / 小红书去广告 / 京东去广告 / 改造上游插件 / kelee /
  分析一下抓包 HAR / 插件不生效 — 这类请求 MUST 先读本 skill。
  适用: Loon 插件全链路开发(自研清洗脚本/去广告规则/HAR 取证/弹窗/悬浮窗/搜索域/开屏/滚词典)、
  bundle.js 修改、阿里系 App(淘宝/天猫/闲鱼/直播/特价版/一淘)+小红书/什么值得买/京东/Zepp/美团 等去广告、
  loon-plugin-patches 仓库相关工作。
  Covers plugin authoring, HAR forensics, response cleaning, simulator verification.
---

# Loon 插件开发

## 前提

仓库 `/var/minis/shared/loon-plugin-patches`（先读其 AGENTS.md → AI-GUIDE.md 获取完整规范）。
模拟器 `tools/loon-sim/`（离线验证一切，不依赖真机）。官方语法存档 `tools/loon-sim/docs/`。

## 流程（每步必须走，不得跳过）

1. **定位**：哪个 App、哪个广告形态（开屏/弹窗/悬浮窗/搜索域/信息流）
2. **取证**：让用户给 HAR 抓包（在真实操作时段内抓）；没有就先列出要抓什么
3. **判定通道**（决定方案生死，详见 references/app-notes.md；逆向完成后 IPA 按 references/ipa-archive.md 归档私库）：
   - HAR 能看到数据 → HTTP 通道，可拦/可清洗
   - HAR 零命中 + 沙盒缓存有 → **ACCS 通道，HTTP 不可达，插件侧无解**（终局，直接告知用户）
   - HAR 零命中 + 沙盒也没有 → 本地内置/原生 fallback，同样不可达
4. **判定语义层级**（reject 会出白屏事故！）：
   - 纯广告接口 → `[Rewrite]` reject
   - 功能主干接口（首页容器/搜索中间页/多页面配置，如 infinity.gateway、home.metax、tacdata）→ **只能清洗响应体**
5. **实现三件套（缺一即静默失效）**：① bundle.js 函数定义 ② main() 分发 ③ lpx `[Script]` 规则入口
   清洗匹配用**前缀族**（同一功能在不同页面用不同容器名，如 tm_my_promotion / landscape_promotion_grid51）
6. **端到端验证**（完整链路，禁止 vm 直调函数）：
   ```bash
   cd tools/loon-sim
   node cli.js check ../../plugins/<Name>/<Name>.lpx        # 0 错误
   node cli.js run <lpx> --url "<目标URL>" --phase response --response-file <真实body>
   # 必须看到「生效规则」+ 输出 body 满足断言
   ```
   验证范围按**改动集**分层（见下方「验证分层」）—— 纯插件改动**不**跑全量 ci.sh。
7. **发布前跑物流审计** `python3 tools/loon-sim/audit.py <lpx>` — 资源 URL 探测(404=订阅「链接无效」) + 缓存戳漂移; 全绿再 push
8. **push → 告知用户订阅地址+版本号 → 用户更新 Loon → 探针转绿才能下终端结论**

### 验证分层（按改动集客观判定，不靠感觉）

```bash
# 判据：改动集是否触及 loon-sim 本体
git diff --name-only -- tools/loon-sim/ | grep -q .
```

| 改动集 | 必跑 | 耗时 |
|---|---|---|
| **纯插件**（只动 `plugins/**`） | `check <该插件>` + `run <该插件>` + `dead-fn <该插件 src>` + `parity <该插件>` + 该插件自己的 `test.mjs` + `audit.py <该插件>` | **~5s** |
| **loon-sim 本体**（`tools/loon-sim/**`：内核/converter/matcher/runtime/selftest） | **全套 `sh ci.sh`**（跨插件爆炸半径，必须全量） | 195s |

> **为什么纯插件改动不跑全量**：插件之间互不 import，loon-sim 只是测试器。
> 改插件 X 不会影响 ①selftest/②regression/④parity/⑦同步，也不会影响**其他**插件的
> ③check/⑤dead-fn/⑥单测 —— 全量 ci.sh 在纯插件改动下保护 ≈ 0，纯浪费 195s。
> 定向检查同样是验证，只是范围对准了改动。

## 五条铁律（其余 15 条见 references/pitfalls.md，全库共 20 条）

1. **探针不绿不下结论** — 终端测的是设备已加载配置；不绿时先怀疑「更新未生效」而非规则语法
2. **三件套缺一 = 清洗静默失效** — 历史上三轮排查被它骗过
3. **功能主干接口 reject = 白屏** — 摸清语义再动手
4. **改开关默认值不影响已持久化的用户设置** — 老开关复活查历史默认值；开关判断放脚本内而非 with enable
5. **HAR body 可能多层编码** — base64 响应必须解码后搜词；词还可能藏在 URL 参数和 unwEvents 埋点里

## 按需深读

| 场景 | 文件 |
|------|------|
| 完整流程/探针/发布 | `references/workflow.md` |
| 20 条铁律 + 事故案例 | `references/pitfalls.md` |
| HAR 取证方法（编码/时序/多源交叉/分目录zip）| `references/har-analysis.md` |
| 各 App 通道地图（ACCS 死角/容器命名/已覆盖清单）| `references/app-notes.md` |
| 上游插件改造（kelee 拉取/jq 本地化/多窗口协调）| `references/upstream-port.md` |
| 逆向 IPA 归档（私库备份/gzip拆分/RESTORE.md）| `references/ipa-archive.md` |

## 工具（本仓 `tools/loon-sim/`，一处维护）

`tools/loon-sim/cli.js`（check/run/rules）、`tools/loon-sim/version-probe.sh`（版本探针）、`tools/loon-sim/ci.sh`（全套回归）。

> 本 skill 与 `tools/loon-sim/` 同仓共存。`scripts/` 下的指针存根（绝对路径）**已移除**，
> 所有脚本一律以 `tools/loon-sim/` 为准。CI 分层规则见上方「验证分层」。
