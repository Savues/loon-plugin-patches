# 多多进宝开屏防护（Jinbao-AdBlock）

> **状态：预防性守卫（v0.1.0）** —— 截至 2026-10-27 的进程内取证，**没有观测到该 App 存在开屏广告流量**。
> 本插件按「开屏字段即广告字段」的保守假设做预防性拦截，未命中时**原样放行**，不影响任何功能接口。

## 一、为什么是「预防性」

2026-10-27 用 `lc-forensics v10.3` + 自研业务层探针（`ddjb-splash-probe`）在 LiveContainer 里两次冷启动全量取证：

| 观测项 | 结果 |
|---|---|
| NSURLSession 层流量 | 仅 9 个域名：`meta.pinduoduo.com`、`apm-a.pinduoduo.com`、`duotk.pinduoduo.com` —— **业务 API 全部不在其中** |
| 业务层探针（`DDJBHTTPServiceManager`） | 18 请求 / 18 响应全量捕获，接口全部是 `network_h5/*` |
| 开屏专属接口 | **0 个**（二进制里也没有任何 splash 相关 API 路径字符串） |
| `-[AppDelegate preloadSplashInfo]` | **0 次调用** |
| `DDJBSplashViewController`（viewDidLoad / tapAction / nextStep） | **0 次调用** |
| `DDJBSplashModel` 构造 | **0 次** |

结论：**当前版本 + 当前账号（未登录）+ 当前 AB 实验下，App 根本没有走开屏逻辑。**
二进制里确实存在完整的开屏实现（`DDJBSplashModel` / `DDJBSplashViewController` / `hasSplash` / `jbapp_splash`），
说明该能力存在但被服务端开关关闭 —— 这与用户反馈「很少见，几乎没见过」一致。

## 二、插件做什么

### 1. `[Script]` 递归剪除开屏字段（默认开）
挂在 App 全部业务 JSON 上：

```
^https://jinbao\.pinduoduo\.com/network_h5/
```

递归（最大 24 层）删除键名匹配以下模式的字段（整键匹配，大小写不敏感）：

```
splash / splashInfo / splash_info / splashAd / splash_ad / splashScreen
splashConfig / splashModel / splashImage / splashUrl / splashId
hasSplash / hasSplashInfo / needSplash / showSplash
launchAd / launch_ad / launchAdInfo / openScreen / open_screen / openScreenAd
startupAd / startup_ad / bootAd / boot_ad / welcomeAd / welcome_ad
```

- **未命中任何字段时原样返回**（不重写 body，零开销、零误伤）
- 非 JSON 响应直接跳过
- 兼容 `$argument` 三种形态：对象 / `[对象]` / `[v0,v1]`（仓库历史事故 v3.37.3）

### 2. `[Rewrite]` 开屏类路径兜底（不可关）
若未来出现开屏专属接口（路径含 `splash`），直接返回成功空结果而不是 404/白屏：

```
request if ${url} ~= /^https:\/\/jinbao\.pinduoduo\.com\/network_h5\/[^?]*\/?splash/i
  then reject(200, '{"success":true,"errorCode":1000000,"errorMsg":null,"result":null}')
```

> 注：这条是**预防**，当前流量里零命中（已确认二进制里没有此类路径）。

## 三、开关

| 开关 | 默认 | 说明 |
|---|---|---|
| `enabled` 插件总开关 | 开 | 关闭后脚本直接返回，不做任何处理 |
| `stripSplashKeys` 剪除开屏字段 | 开 | 关掉后只保留路径兜底 |

## 四、验证记录

```bash
cd tools/loon-sim
node cli.js check ../../plugins/Jinbao-AdBlock/Jinbao-AdBlock.lpx
# → 0 错误 0 警告

# ① 命中：注入 splashInfo 的响应
node cli.js run ../../plugins/Jinbao-AdBlock/Jinbao-AdBlock.lpx \
  --url "https://jinbao.pinduoduo.com/network_h5/weak_auth/goods/query_channel_config" \
  --phase response --response-file ../../plugins/Jinbao-AdBlock/test/fixture-splash.json
# → 生效规则命中 · 465B → 184B · result{}: 3 → 2 · console: [jinbao] 已剪除开屏字段

# ② 未命中：真实结构响应
node cli.js run ... --response-file test/fixture-plain.json
# → 原样返回（未修改）
```

夹具来自 2026-10-27 真机取证的真实响应结构（`query_channel_config` 的 `homePageConfig`），
仅额外注入 `splashInfo` 字段用于验证剪除逻辑。

## 五、已知边界

1. **未验证真实开屏**：没有样本可对照，规则的有效性只能在开屏真的出现时确认。
2. 若开屏改走 **Titan 长连接推送**（`DDJBTitanService`）而非 HTTP，本插件**拦不到** —— 需要 Loon 侧不可达，
   届时只能用进程内方案（探针已覆盖 `titan:didReceiveTitanPushResponse:`）。
3. 若开屏是**本地内置图**（LaunchScreen / 预置资源），HTTP 层同样不可达。
4. 开屏字段名是**推测**的命名族；若真实字段叫别的名字（如 `adMaterial`），需按实际响应补进 `SPLASH_KEY`。

## 六、取证工具位置

- 探针源码：`/var/minis/workspace/ddjb/probe/ddjb-probe.c`（独立模块，不依赖也不修改 lc-forensics）
- 探针构建：`clang --target=arm64-apple-ios15.0.0 … && ld64.lld -dylib … && ldid -S`
- 日志：`Documents/lcf-ddjb/probe-<UTC>-<pid>.jsonl` + `bodies/`
