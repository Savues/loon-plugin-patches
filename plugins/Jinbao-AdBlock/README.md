# 多多进宝净化（Jinbao-AdBlock）

> **v0.2.0** — 真机 HAR 取证后修正：业务域名是 `jinbaoh5.pinduoduo.com`（不是 `jinbao.`），
> 并新增「热门搜索」屏蔽。开屏部分仍为**预防性**（真机 200 条请求里同样零开屏流量）。

## 一、真机取证结论（2026-10-27，200 条 HAR）

| 观测项 | 结果 |
|---|---|
| 业务 API 域名 | **`jinbaoh5.pinduoduo.com/network_h5/*`**（59 条） |
| 原生 API 域名 | `jinbao.pinduoduo.com/network/api/*`（25 条） |
| 含 `splash` 的请求 / 响应 | **0 条**（URL 与 body 全文检索均为 0） |
| 搜索框热门词 | `GET network_h5/auth/goods/query_top_keywords` → `result` 字符串数组 |

> ⚠️ v0.1.0 的 `[Script]` 只写了 `jinbao.pinduoduo.com/network_h5/`，而真实业务流量全在
> `jinbaoh5.pinduoduo.com` —— **v0.1.0 实际上一条都没命中**。v0.2.0 已改为
> `^https://jinbao(h5)?\.pinduoduo\.com/network(_h5)?/`，同时覆盖两个域名。

## 二、屏蔽热门搜索（v0.2.0 新增，默认开）

真机实测响应：

```json
GET https://jinbaoh5.pinduoduo.com/network_h5/auth/goods/query_top_keywords
{"success":true,"errorCode":1000000,"errorMsg":null,
 "result":["裤子","飞天茅台","猫砂","富士xm5","华为mate80","蓝牙耳机","外套","一加ace6t","牛奶","卫生纸"]}
```

处理：`result` 置空数组，**保留 `success`/`errorCode` 原值**（避免 App 弹错误提示）：

```json
{"success":true,"errorCode":1000000,"errorMsg":null,"result":[]}
```

- 132B → 64B，`result[]: 10 → 0`
- 开关 `hideHotSearch`，关掉后原样返回

## 三、开屏防护（预防性）

### 1. `[Script]` 递归剪除开屏字段（默认开）

递归（最大 24 层）删除键名匹配以下模式的字段（整键匹配，大小写不敏感）：

```
splash / splashInfo / splash_info / splashAd / splash_ad / splashScreen
splashConfig / splashModel / splashImage / splashUrl / splashId
hasSplash / hasSplashInfo / needSplash / showSplash
launchAd / launch_ad / launchAdInfo / openScreen / open_screen / openScreenAd
startupAd / startup_ad / bootAd / boot_ad / welcomeAd / welcome_ad
```

- **未命中任何字段时原样返回**（不重写 body）
- 非 JSON 直接跳过；`query_top_keywords` 跳过（由热词脚本专职处理）

### 2. `[Rewrite]` 开屏类路径兜底

```
request if ${url} ~= /^https:\/\/jinbao(h5)?\.pinduoduo\.com\/network(_h5)?\/[^?]*\/?splash/i
  then reject(200, '{"success":true,"errorCode":1000000,"errorMsg":null,"result":null}')
```

当前流量零命中（真机 + LC 双环境均确认无此路径）。

## 四、为什么开屏只能做「预防」

两次 LC 冷启动 + 业务层探针（`DDJBHTTPServiceManager` 全量 hook）+ 真机 HAR，三条证据一致：

| 证据源 | 开屏痕迹 |
|---|---|
| LC 进程内（18 请求/18 响应） | `preloadSplashInfo` / `DDJBSplashViewController` / `DDJBSplashModel` **0 次调用** |
| 真机 HAR（200 条） | 含 `splash` 的请求/响应 **0 条** |
| 二进制静态 | 开屏实现完整存在（`hasSplash` / `jbapp_splash` / `AppSplashIdentifier`），但**无 splash API 路径字符串** |

→ 能力存在、服务端开关关闭。规则保留为预防，未命中原样放行。

## 五、开关

| 开关 | 默认 | 说明 |
|---|---|---|
| `enabled` 插件总开关 | 开 | 关闭后所有脚本直接返回 |
| `hideHotSearch` 屏蔽热门搜索 | 开 | 清空 `query_top_keywords` 的 `result` |
| `stripSplashKeys` 剪除开屏字段 | 开 | 递归删 splash 类字段 |

## 六、验证记录（v0.2.0）

```bash
cd tools/loon-sim
node cli.js check ../../plugins/Jinbao-AdBlock/Jinbao-AdBlock.lpx
# → 0 错误 0 警告 · [Script] 2 · [Rewrite] 2 · [Mitm] 2 · [Argument] 3

# ① 热门搜索（真机真实响应）
node cli.js run ... --url "https://jinbaoh5.pinduoduo.com/network_h5/auth/goods/query_top_keywords" \
  --phase response --response-file test/fixture-hotsearch.json
# → [jinbao] 热门搜索已清空（10 条）· 132B → 64B · result[]: 10 → 0

# ② 常规接口不误伤（真机 label_info）
node cli.js run ... --url "https://jinbaoh5.pinduoduo.com/network_h5/weak_auth/common/label_info" ...
# → 原样返回（未修改）

# ③ 注入 splashInfo（jinbaoh5 域名）
node cli.js run ... --response-file test/fixture-splash.json
# → 已剪除开屏字段 · 465B → 184B

# ④ 真机 HAR 全量回放
node cli.js har ../../plugins/Jinbao-AdBlock/Jinbao-AdBlock.lpx <har>
# → 扫描 200 条：命中 Script 75 · 实际改动 1 · 被 Rewrite 终止 0
```

`test/fixture-hotsearch.json` / `fixture-channel-config.json` / `fixture-label-info.json`
均为真机 HAR 原样导出（未加工）。

## 七、已知边界

1. **开屏未验证真实样本**：规则按字段名族推测，真出现时需按实际字段名补 `SPLASH_KEY`。
2. 若开屏走 **Titan 长连接推送**（`DDJBTitanService`）或本地内置资源，HTTP 层不可达。
3. 热门搜索若改由 H5 页面内联下发（`jinbao.pinduoduo.com/mobile/*.html` 内嵌 JSON），当前规则不覆盖 —— 本次 HAR 中该词表确实来自独立接口，暂不需要。
4. 其他推广位（`pop_window_info` 弹窗 / `activity_list` / `super_red_packet`）**未处理**，按需再加。

## 八、取证工具位置

- 进程内探针源码：`/var/minis/workspace/ddjb/probe/ddjb-probe.c`（独立模块，不修改 lc-forensics）
- 日志：`Documents/lcf-ddjb/probe-<UTC>-<pid>.jsonl` + `bodies/`
