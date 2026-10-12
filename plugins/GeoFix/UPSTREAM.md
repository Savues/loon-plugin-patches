# 出处与移植记录 · Provenance & porting

本插件是第三方项目的**自托管镜像版**。这份文档保留完整出处，
方便核对上游许可条款；也逐条列出移植到本仓库时做了什么改动。

This is a self-hosted mirror of a third-party project. Attribution is kept in
full so the upstream licence can be checked; every porting change is listed.

---

## 上游 · Upstream

| | |
|---|---|
| 项目 | `wloc.app` —— Apple 网络定位测试工具（付费 App + 控制台） |
| 插件 | `https://wloc.app/modules/wloc.lpx`（清单 v1.1.1） |
| 脚本 | `https://wloc.app/scripts/{wloc,wloc-route,wloc-settings}.js?v=1.1.1` |
| 快照时间 | 2026-09-28 |

**许可**：上游未见明确的开源许可声明，站点上以「授权测试 / authorized testing」
为前提提供付费服务。**本仓库为个人存档与自用，公开转发前请自行确认上游条款。**

上游脚本逐字节原件与 SHA256 保留在作者的私有归档仓库
（`Savues/wloc-mirror`，不公开），需要逐字节比对时去那里取。

---

## 移植改动 · What the port changed

**只有字符串与路径，没有任何业务逻辑改动。**
逻辑等价性由 `smoke.test.mjs` 的 28 个用例覆盖（含一次真实 protobuf 改写）。

### 1. 脚本托管 · Script hosting

上游用 `script-path=https://wloc.app/scripts/…` 远程拉取。上游站点一旦消失，
已导入的插件会直接加载失败。本版改为指向本仓库的 raw 地址。

| | 上游 | 本仓库 |
|---|---|---|
| `geo-bridge.js` | `wloc.app/scripts/wloc-settings.js` | `raw.githubusercontent.com/…/plugins/GeoFix/src/geo-bridge.js` |
| `geo-route.js` | `wloc.app/scripts/wloc-route.js` | `…/src/geo-route.js` |
| `geo-response.js` | `wloc.app/scripts/wloc.js` | `…/src/geo-response.js` |

### 2. 标识符改名 · Identifier renames

公开仓库不打算带上游的产品名，所以把脚本里的自有标识统一换掉。
**全部是常量名、存储 key、事件类型和文案，不涉及任何控制流。**

| 上游 | 本仓库 | 出现位置 |
|---|---|---|
| `wloc_settings` | `geo_settings` | persistentStore key |
| `wloc_route_session` | `geo_route_session` | persistentStore key |
| `wloc_diag` | `geo_diag` | persistentStore key |
| `wloc_events` | `geo_events` | persistentStore key |
| `wloc_passthrough` | `geofix_passthrough` | 事件类型 |
| `wloc-control-center-device-bridge` | `geofix-device-bridge` | 响应 `signature` 字段 |
| `wloc-control-center-route-bridge` | `geofix-route-bridge` | 响应 `signature` 字段 |
| `wloc-control-center` | `geofix-bridge` | 设置项 `source` 字段 |
| `lastWlocHitAt` | `lastGeoHitAt` | 诊断字段名 |
| `patchWloc` | `patchGeo` | 内部函数名 |
| `1.1.1` | `1.0.0` | `VERSION` |

> ⚠️ 换了存储 key，所以**与旧版共存时数据不互通**：装了本版后要从头写一次坐标。
> 旧的 key 会留在 persistentStore 里成为孤儿，不影响运行。

### 3. 虚拟端点改名 · Virtual endpoint rename

`/geo-settings/*` 和 `/geo-route/*` 都是**插件自己伪造的虚拟路径**，Apple 那边并不存在，
所以改名零风险。上游是 `/wloc-settings/*` 与 `/wloc-route/*`。
清单里的两条 `http-request` 规则和脚本里的路径匹配正则同步修改。

### 4. 移除死参数段 · Dead argument block removed

上游清单里有一段：

```ini
[Argument]
longitude =          # 空
latitude =           # 空
accuracy = 25
```

**它有两处独立的问题，任何一处都足以让它失效：**

1. 三条 `[Script]` 规则都**没有 `argument=` 参数**。没有这个参数，
   脚本里的 `$argument` 拿到的是**被拦截的 URL 本身**（而不是插件参数）。
   脚本把它当 query 字符串解析，Apple 的定位接口 URL 里没有 `lat` / `lon`，
   于是 `args.latitude` 恒为 `undefined`，`accuracy` 也回落到硬编码的 25。
2. 那两个坐标的默认值**本身就是空的**。

所以：不是 Loon 不支持 `[Argument]`（本仓库其它插件就在用），
而是上游既没把参数传进去，也没给默认值。留着这段只会让人以为配置页能填。
本版移除，并在清单里写清了原因。

### 5. 无法改名的一处 · The one thing that could not be renamed

清单里这条规则的正则包含 `/clls/wloc`：

```
http-response ^https?:\/\/gs-loc(-cn)?\.apple\.com\/clls\/wloc …
```

`gs-loc.apple.com/clls/` 是 **Apple 自己的真实接口路径**，不是这个项目的发明，
必须原样匹配才能拦到那条链路。这一处保留了上游原字面。

---

## 本仓库新增 · New in this repo

| 文件 | 说明 |
|---|---|
| `smoke.test.mjs` | Node 里模拟 Loon 运行时（`$request` / `$response` / `$persistentStore` / `$done` / `$loon`），28 个用例 |
| `companion/worker/src/index.js` | **独立重写**的地图链接解析 Worker，不含任何上游代码 |
| `companion/shortcut/build_shortcut.py` | 配套 iOS 快捷指令的定点改写器 |

### 解析 Worker 为什么重写

上游的解析服务实测有两个问题：

| | 上游 | 本仓库重写版 |
|---|---|---|
| 苹果地图 `?ll=` | 按 GCJ-02 又减一次偏移，同一对数字走不同入口差 **482m** | 苹果 / Google 一律按 WGS84 原样输出 |
| 百度 `@x,y` | 换算结果与 POI 名称能差 **1000+ km**，仍返回 200 且零告警 | 标准球面墨卡托还原 + BD-09→GCJ-02→WGS84，结果落回 POI 本体 |

外加：境外坐标不套国内偏移、`@` 后经纬顺序自动消歧、短链展开带 SSRF 防护（限 3 跳、拦内网与云元数据地址）。
`companion/worker/test.mjs` 19 个用例，含针对上述两条的回归断言。

### 快捷指令改写器为什么这么写

`.shortcut` 里的 URL 不是普通字符串：

```json
"string": "https://…/api/parse?format=json&u=￼",
"attachmentsByRange": { "{54, 1}": { "Type": "ActionOutput", "OutputName": "EncURL" } }
```

`￼`（U+FFFC）标记变量插入点，`{54,1}` 是它在**原字符串里的字符下标**。
换域名或改路径会改变前缀长度 ⇒ 后面所有标记的下标都得平移，
否则变量会插到错误位置。漏了这步的症状很隐蔽：一切照常运行，
只是某个变量变成了 `lat` 里的某个字符，被当成坐标发了出去。

改写器从后往前替换、同步改写 `attachmentsByRange` 的 key，
并在写盘前把每个附件偏移逐个核回 `￼`。
