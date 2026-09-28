# GeoFix · 网络定位重定向

> 在**网络定位**这一层把 iOS 的定位结果改写到指定坐标。
> Redirects iOS network-derived location to a chosen coordinate.

**可用 OK** · 脚本自托管 · 自带解析后端

---

## 它改的是什么 · What it actually changes

iOS 定位不只有 GPS。系统会拿周围的 WiFi 和基站去 Apple 服务器换算一个粗略位置。
这个插件拦下那条链路的**响应**，把回包里的定位记录改掉。

Only network-derived location, never the GPS receiver. The plugin rewrites the
coordinates inside Apple's `gs-loc` response payload.

```
设备 → gs-loc.apple.com  ①上传当前 WiFi/基站观测
     ← 响应体（protobuf）   ②插件改写其中的 Location
     → iOS 采纳改写结果     ③只有网络定位受影响
```

### 改写的结构 · The payload structure

```
根消息 root
├ field 2  (repeated) = WiFi 记录   field1 = MAC   field2 = Location
├ field 22 (repeated) = 基站记录    field5 = Location
└ Location  field1 = lat  varint ×1e8
            field2 = lon  varint ×1e8
            field3 = accuracy  varint（米）
```

外层信封结构未知，所以脚本采用**偏移扫描**：先按「8 字节头 + 2 字节大端长度」猜分帧，
再逐字节尝试，直到能解出带合法 MAC 的 WiFi 记录。解不出来就原样放行（passthrough）。

---

## 写入坐标 · Setting the coordinate

> **插件配置页没有经纬度输入框，这是正常的。**
> 上游清单里原本有一段坐标参数，但它从未生效（原因见 `UPSTREAM.md`），本版已移除。
>
> **There is no lat/lon field in the plugin settings — by design.**
> The upstream manifest had one; it never worked. See `UPSTREAM.md`.

坐标通过 **Bridge 端点**写入。这些路径 Apple 那边并不存在，是插件在本地
用 `http-request` 脚本伪造响应吃掉的（`$done({response})`，请求根本不出本机）。

Write through the **Bridge endpoints**. These paths do not exist on Apple's
servers — the plugin answers them locally.

```
写入    https://gs-loc.apple.com/geo-settings/save?lat=31.230416&lon=121.473701&acc=25
查状态  https://gs-loc.apple.com/geo-settings/status
诊断    https://gs-loc.apple.com/geo-settings/diag
恢复    https://gs-loc.apple.com/geo-settings/clear
```

手机 Safari 直接开这几个地址即可（需 Loon 在线 + MITM 生效）。

### 网页版设置界面 · Web UI

**[`https://savues.github.io/loon-plugin-patches/`](https://savues.github.io/loon-plugin-patches/)** —— 单文件 HTML，已部署到 GitHub Pages。
手机浏览器打开就能填坐标、看状态、恢复真位，**不需要账号、不需要订阅**。
Bridge 响应带 `Access-Control-Allow-Origin: *`，所以跨域直接可用。

| 卡片 | 作用 |
|---|---|
| 状态 | 实时 `mode` / 当前坐标 / 已改写次数 / 上次写入与改写时间，异常时直接报 `lastError` |
| 写入坐标 | 填 lat / lon / acc，一键写入；「恢复真实定位」一键清除 |
| 从地图链接解析 | 粘分享链接 → 调你自己的解析服务（`companion/worker/`）→ 自动填入 |

源码在 `docs/index.html`，改完直接 commit 即可，Pages 会自动重新部署。

日常使用也可以走 `companion/shortcut` 的快捷指令：从地图 App 分享链接过来，
它会自己解析经纬度再写入。

`acc` 会被夹到 5–200 米，默认 25。

### 动态路线 · Routes

`geo-route.js` 支持让坐标沿一串点按时间线性插值前进，带 0.1–10× 变速、暂停、循环。
`save` 的 `payload` 是 base64url 编码的 JSON：

```json
{"id":"r1","name":"巡检","acc":25,
 "pts":[[39.90,116.39,0],[39.91,116.40,60],[39.92,116.41,150]],
 "totalDurationSec":150,"loop":true,"speedMultiplier":1}
```

```
存并启动  https://gs-loc.apple.com/geo-route/save?payload=<base64url>&autostart=1
控制      .../geo-route/{pause|resume|stop|clear|status}
```

---

## 安装 · Install

1. 导入 `GeoFix.lpx`
2. 安装并**完全信任**根证书
3. 确认 **MitM over HTTP/2** 与 **QUIC 回退保护** 已开启
4. 确认代理 / VPN 处于连接状态
5. 打开 `https://gs-loc.apple.com/geo-settings/status`，看到 `"tool":"Loon"` 就说明桥接通了
6. 重启 Loon

> ⚠️ 仓库是 public 的，`script-path` 走 `raw.githubusercontent.com` 可匿名拉取。
> CDN 缓存最长约 24h，拉不到新脚本时在订阅地址加 `?cb=2`。

---

## 文件 · Files

| 文件 | 用途 | Purpose |
|---|---|---|
| `GeoFix.lpx` | 插件本体 | Manifest |
| `src/geo-bridge.js` | 写坐标 / 查状态 / 诊断 | Bridge |
| `src/geo-route.js` | 动态路线 | Route |
| `src/geo-response.js` | protobuf 改写 | Response patch |
| `smoke.test.mjs` | 28 个用例，Node 里模拟 Loon 运行时 | `node smoke.test.mjs` |
| `UPSTREAM.md` | 出处与移植改动逐条对照 | Provenance & porting diff |
| `companion/` | iOS 快捷指令 + 自建解析 Worker | iOS companion (not a Loon plugin part) |

---

## ⚠️ 边界 · Boundaries

- **只影响网络定位**。强依赖 GPS 的 App 不会动。目标 App 是否采用，
  仍取决于它的权限、缓存、账号逻辑与服务端判定。
- iOS 的定位缓存没有公开 TTL。要让结果生效：杀掉目标 App 重开，或去
  设置 → 隐私 → 定位服务把开关拨一下。
- `status` 里 `mode: active`、`patchCount` 增长，只代表**回包被改写了**，
  不代表任何第三方 App 已经显示了新位置。
- **gzip 响应无法改写**。脚本检测到 gzip 会直接放行并在 `lastError` 里说明。
- 上游站点自述：**iOS 27 beta 6 及以后观察到证书限制会阻断该流程**，其他版本未经验证。
- 仅用于你**自有或获授权**的设备。定位 QA、区域目录自测、围栏与路线逻辑验证属于合理用途；
  打卡代打、支付风控、身份验证、游戏作弊不在此列。

---

## 致谢 · Credits

- **原作者**：见 `UPSTREAM.md`（保留了署名与出处，便于你核对许可条款）
- **本仓库**：脚本托管 + 死参数清理 + 端点改名 + 移植验证

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
