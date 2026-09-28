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
# 换解析服务（推荐指向自建 Worker）
python3 build_shortcut.py --worker https://geofix-parse.<你的子域>.workers.dev

# 改定位精度（插件会夹到 5–200 米）
python3 build_shortcut.py --worker <地址> --acc 30

# 保守模式：只做纯字符串替换，不改动作结构
python3 build_shortcut.py --safe --worker <地址>

# 不要写入结果自检
python3 build_shortcut.py --no-status --worker <地址>
```

产物 `GeoFix位置.build.shortcut`（生成物，不入库）。

### 改了什么

| | 原件 | 改写后 |
|---|---|---|
| 写入端点 | `…/wloc-settings/save` | `…/geo-settings/save`（与插件一致） |
| 解析服务 | 硬编码在 URL 里 | **抽成独立的「文本」动作 `ParseWorker`，位置在第 2 个动作** |
| 精度 | `acc=25` 写死 | `--acc` 可调 |
| 通知 | 无条件报「已切换定位」 | 写入后再取一次 `status`，通知里显示 `mode` |
| 文案 | 上游品牌 | 全部改成 GeoFix |

**关于「链接可控」**：解析服务地址现在是第一个「文本」动作的内容，
导入后在快捷指令 App 里点进去直接改就行，不用重新生成、不用重签名。
默认值就是 `--worker` 给的地址，留空则沿用原地址（不推荐，那还是第三方）。

**关于「不再假成功」**：`mode=active` 才代表真写进去了；`passthrough` 说明
插件没启用、MITM 没生效或坐标被拒。通知里会直接写出来。

### 为什么这个脚本这么长

`.shortcut` 里的 URL 不是普通字符串：

```json
"string": "￼/api/parse?format=json&u=￼",
"attachmentsByRange": { "{0, 1}": {"OutputName": "ParseWorker"},
                        "{26, 1}": {"OutputName": "EncURL"} }
```

`￼`（U+FFFC）标记变量插入点，`{26,1}` 是它在**原字符串里的字符下标**。
换域名会改前缀长度 ⇒ 后面所有标记的下标都得平移，否则变量插到错位置。

漏了这步的症状极其隐蔽：一切照常运行，只是某个变量变成了 `lat` 里的某个字符，
被当成坐标发了出去。**这个 bug 在我改写自己的插件时就踩过一次**——把
`/wloc-settings/` 换成 `/geo-settings/` 短了一个字符，两处附件全偏一位。

所以脚本里：

- 用 `build_token(template, refs)` 从模板自动算偏移，不手写数字
- 写盘前把每个附件偏移逐个核回 `￼`
- 校验每个 `OutputUUID` 都有对应的动作
- 写完立刻回读 plist，确认结构没坏
- 任一条不过就**中止且不落盘**

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
