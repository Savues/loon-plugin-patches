# GeoFix 配套件 · Companion

> 这部分**不是 Loon 插件**，是给 GeoFix 用的两样东西。
> Not a Loon plugin part — two optional companions.

| 目录 | 是什么 | 必需吗 |
|---|---|---|
| `shortcut/` | iOS 快捷指令：从地图 App 分享链接过来，自动解析经纬度并写入 | 可选，有 Safari 直接开 Bridge 端点就够 |
| `worker/` | 自建的地图链接解析 Worker，替代上游那个第三方服务 | 只在用快捷指令时才需要 |

---

## 快捷指令 · Shortcut

`GeoFix位置.shortcut` — 19 个动作，Apple 签名（导入后只读）。

```
① 取分享进来的地图链接            ← Extension Input
② URL 编码
③ 解析经纬度
   GET <worker>/api/parse?format=json&u=<②>
④ 取 lat / lon / name
⑤ 写入
   GET https://gs-loc.apple.com/geo-settings/save?lat=④&lon=④&acc=25
⑥ 通知「已切换定位」
⑦ 等 1 秒
⑧ 打开 设置 → 隐私 → 定位服务
```

`WFWorkflowTypes = [Watch, ActionExtension]`，`NoInputBehavior = ShowError`
（必须从分享菜单带链接进来，不能无输入直接跑）。

### 重新生成

```bash
python3 build_shortcut.py --worker https://geofix-parse.<你的子域>.workers.dev --acc 30
# → GeoFix位置.build.shortcut
```

`--worker` 留空则沿用原地址。脚本会同时把虚拟端点改名、修正附件偏移，
并在写盘前逐个自检。`shortcut-source.json` 是 19 个动作的人读版拆解。

### 已知短板

- 通知是**无条件**发的。写入失败（Loon 没开 / 插件没装 / MITM 没生效）时它依然会说成功。
  要保险可在 ⑤ 之后插一次 `geo-settings/status`，比对 `mode` 和 `patchCount` 再决定发不发。
- 没有路线（route）能力，`geo-route/*` 那套接口要手动发。

---

## 解析 Worker

上游的解析服务实测会把苹果地图 `?ll=` 当成 GCJ-02 二次偏移 **482m**，
百度 `@x,y` 换算能偏 **1000+ km** 却返回 200 零告警。这个是**独立重写**的替代品。

### 部署

```bash
npm i -g wrangler && wrangler login
cd worker && wrangler deploy
# → https://geofix-parse.<你的子域>.workers.dev
```

`src/index.js` 是纯 Web 标准 API（`Request` / `Response` / `fetch` / `URL`），
不挑运行时，Deno Deploy、Node 20+、Bun 都能直接起。

### 测试

```bash
cd worker && node test.mjs     # 19 个用例，不需要 Cloudflare
```

### 接口

```
GET /api/health
GET /api/parse?u=<URL 编码的地图链接>&format=json
→ 200 {"lat":…,"lon":…,"name":"…","system":"WGS84",
       "originalSystem":"GCJ-02","source":"…","confidence":0.85,
       "warnings":[…],"checkedAt":…}
→ 422 {"error":"未能从链接中解析出经纬度","warnings":[…]}

GET /api/parse?u=31.230416,121.473701       # 也接受裸坐标
```

`lat` / `lon` 字段名与上游一致，所以快捷指令不用改结构，只改域名。

### 支持的输入

| 来源 | 格式 | 坐标系 |
|---|---|---|
| 裸坐标 | `31.230416,121.473701` | WGS84 |
| 苹果地图 | `?ll=lat,lon`、`/place/…/@lon,lat,z` | WGS84 |
| Google | `@lat,lon,z`、`!3d!4d` | WGS84 |
| 高德 | `uri.amap.com/marker?position=lon,lat`、`@lon,lat,z` | GCJ-02 → WGS84 |
| 百度 | `…/@x,y,z`（墨卡托网格） | BD-09 → GCJ-02 → WGS84 |
| 短链 | 没有明显坐标参数、靠 302 跳转的 | 跟随 ≤3 跳后按上面规则 |

**不支持**（返回 422）：苹果 `?q=` 纯搜索词、高德 `www.amap.com/search` 搜索结果页。
这些格式本身就不含坐标，只能靠网页脚本注入。
