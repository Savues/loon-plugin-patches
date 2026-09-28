# GeoFix · 网络定位重定向

> 在**网络定位**这一层把 iOS 的定位结果改写到指定坐标。
> Redirects iOS network-derived location to a chosen coordinate.

**可用 OK** · 脚本自托管 · 解析和控制页都在插件里

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

### 本地控制页 · Local UI

```
https://savues.com
```

**所有控制端点都统一在 `savues.com`**（`gs-loc.apple.com` 是等价旧地址，两边都通）：

| 地址 | 干什么 | 谁在用 |
|---|---|---|
| `https://savues.com/` | 网页控制台 | 手动用、加书签 |
| `https://savues.com/g/<链接>` | **一键：脚本直接解析 + 写入。链接原样写在路径里，不编码、不加后缀** | 5 动作快捷指令 |
| `https://savues.com/off` | **一键：恢复真实定位**（别名 `/r`、`/0`） | 书签 / 手输 |
| `https://savues.com/?u=<链接>` | 控制台 + 自动解析填表（`&auto=1` 自动写入） | 网页手工用 |
| `https://savues.com/geo-parse?u=<链接>` | 纯 JSON 解析，**不开网页** | 8 动作快捷指令 |
| `https://savues.com/geo-settings/save?lat=…&lon=…&acc=…` | 写入坐标 | 所有路径 |
| `https://savues.com/geo-settings/status` | 查状态 | 控制台 / 排查 |
| `https://savues.com/geo-settings/clear` | 恢复真实定位 | 控制台 |
| `https://savues.com/geo-route/save?payload=…` | 动态路线 | 手动 |

浏览器直接打开就是一个控制界面，**由插件自己在本地返回**。
加到主屏幕书签，以后一点就用。**不需要任何外部服务、不需要账号、不需要联网。**

| 卡片 | 作用 |
|---|---|
| 状态 | 实时 `mode` / 当前坐标 / 已改写次数 / 放行次数 / 上次写入与改写时间，异常时直接列出 `lastError` |
| 粘贴地图链接 | 粘进去点「本地解析」，自动换算成 WGS84 并填进下面的框，原始坐标系也会显示出来 |
| 写入坐标 | 填 lat / lon / acc，一键写入；「恢复真实定位」一键清除 |
| 收藏 | 常用地点存在本机 `localStorage`，换地点时不用再翻聊天记录 |

**和快捷指令配合**：把链接直接拼在路径里就行——

```
https://savues.com/g/<原始地图链接>
```

链接原样放进路径，插件从 `$request.url` 的 `/g/` 之后取回，连查询串一起保住
（`&` 不会被当成外层参数）。页面读到就**自动解析 + 自动写入**，零点击。
也接受 URL 编码形式（`/g/` 后面是编码过的链接）。

另一种形式是带 `?u=` 参数

```
https://savues.com/?u=<URL 编码后的地图链接>
```

打开即自动解析并填好表单，显示原始坐标系；加 `&auto=1` 则解析完直接写入。
这样 `companion/shortcut` 里的快捷指令就能退化成纯入口——只负责从地图 App
的分享菜单接住链接、编码、打开控制页（6 个动作），解析和写入全在本地完成。
成品在 `companion/shortcut/dist/`。

完整的备用地址（短地址之外的等价入口）：

```
https://gs-loc.apple.com/geo-ui/
https://gs-loc-cn.apple.com/geo-ui/
```

#### ⚠️ 关于 `savues.com` 这个短地址

`savues.com` 是个真实存在的域名。加进来之后：

- 规则**只**匹配根路径和 `/geo-ui/`，该域名其它路径原样放行；
- 但 `savues.com` 因此进了 **MitM 列表**。你真去访问该域名时，流量会被 Loon 解密后转发
  —— 能正常用，只是每次多一次 TLS 握手；
- 你若不希望这个域名进 MitM 列表，把 `GeoFix.lpx` 里两处 `savues.com` 删掉即可
  （一条 `[Script]` 规则 + MitM 行），控制页在 `gs-loc.apple.com/geo-ui/` 照常可用。

页面里的接口调用用的是**绝对地址**（`https://gs-loc.apple.com/geo-settings`），
所以从哪个域名打开都能通 —— 否则从 `savues.com` 打开会去请求 `savues.com/geo-settings`，
那条规则不匹配。

页面源码在 `src/ui.html`（可读可改），由 `build_ui.py` 注入成 `src/geo-ui.js`：

```bash
python3 build_ui.py            # 生成 + node --check 语法自检
python3 build_ui.py --check    # 只检查是否同步
```

Loon 只能用 `script-path` 拉一个 `.js`，读不到同目录的 `.html`，
所以页面必须整个塞进脚本里。`build_ui.py` 用 `json.dumps` 把 HTML 变成一个安全的
JS 字符串字面量，换行、反斜杠、反引号、`${` 都不用手动转义。

### 解析器 · Parser

```
https://gs-loc.apple.com/geo-parse?u=<URL 编码后的链接或坐标>
```

也在插件里本地算，WGS84 / GCJ-02 / BD-09 三种坐标系互转都是纯数学，没有网络往返。
控制页的「本地解析」按钮调的就是它。

支持：苹果 `?ll=`、**`place?…&coordinate=lat,lon`**（苹果地图 App 分享出来的就是这个格式）、
`/place/…/@lon,lat,z`、Google `@` 与 `!3d!4d`、
高德 `uri.asavues.com/marker` 与 `@lon,lat,z`、百度 `@x,y,z` 墨卡托、裸坐标。
另外会**尝试展开短链**（受控：限跳数、拦内网与云元数据地址），跳转后的页面里
仍找不到坐标就明确报错，不会瞎猜。

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

> 📖 想知道这东西怎么来的、踩过哪些坑 → [ITERATION.md](ITERATION.md)
> 想核对出处与许可 → [UPSTREAM.md](UPSTREAM.md)

## 安装 · Install

1. 导入 `GeoFix.lpx`
2. 安装并**完全信任**根证书
3. 确认 **MitM over HTTP/2** 与 **QUIC 回退保护** 已开启
4. 确认代理 / VPN 处于连接状态
5. 打开 `https://gs-loc.apple.com/geo-settings/status`，看到 `"tool":"Loon"` 就说明桥接通了
6. 重启 Loon
7. 浏览器打开 `https://savues.com`，加到主屏幕书签

> ⚠️ 仓库是 public 的，`script-path` 走 `raw.githubusercontent.com` 可匿名拉取。
> CDN 缓存最长约 24h，拉不到新脚本时在订阅地址加 `?cb=2`。

---

## 文件 · Files

| 文件 | 用途 | Purpose |
|---|---|---|
| `GeoFix.lpx` | 插件本体 | Manifest |
| `src/geo-route.js` | 动态路线 | Route |
| `src/geo-response.js` | protobuf 改写 | Response patch |
| `src/geo-control.js` | 桥接 + 解析 + 一键写入，**合成一个脚本** | Control endpoints |
| `src/geo-ui.js` | 本地控制页（**由 `build_ui.py` 生成**） | Local control page |
| `src/ui.html` | 控制页源码，改这里 | Page source |
| `build_ui.py` | 把 `ui.html` 注入成 `geo-ui.js` | UI builder |
| `smoke.test.mjs` | 28 个用例，Node 里模拟 Loon 运行时 | `node smoke.test.mjs` |
| `parse.test.mjs` | 34 个用例，解析器 + SSRF 防护 + 脏输入 | `node parse.test.mjs` |
| `manifest.test.mjs` | 32 个用例，清单规则的路由与安全 | `node manifest.test.mjs` |
| `ui.test.mjs` | 22 个用例，哪些地址出页面、哪些放行 | `node ui.test.mjs` |
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
