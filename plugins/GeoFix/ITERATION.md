# GeoFix 迭代复盘 · Post-mortem

从「把 wloc.app 的插件镜像到 GitHub」到「一条链接完成改定位」，18 次提交、11 个版本。
这篇记的是**过程和踩的坑**，不是用法。用法在 [README.md](README.md)。

> 按本仓库收录原则 #7，踩坑记录留在迭代文档里，不进插件 README。

---

## 一句话

**终点**：`https://savues.com/g/<地图链接>` 打开即定位，`https://savues.com/off` 一键还原，
**整条链路上没有任何外部服务**。

---

## 起点：上游是什么

`wloc.app` 是付费产品（App Store App + 控制台 + 订阅）。它的核心是一个 Loon 插件，
MITM `gs-loc.apple.com`，改写 Apple 网络定位接口的响应体。

### 改写的是什么

```
设备 → gs-loc.apple.com/clls/wloc     ①上传当前 WiFi/基站观测
     ← 响应体（protobuf）              ②插件改写其中的 Location
     → iOS 采纳改写结果                ③只有网络定位受影响
```

```
根消息
├ field 2  (repeated) = WiFi 记录   field1 = MAC   field2 = Location
├ field 22 (repeated) = 基站记录    field5 = Location
└ Location  field1 = lat  varint ×1e8
            field2 = lon  varint ×1e8
            field3 = accuracy  varint（米）
```

外层信封结构未知，所以上游用**暴力扫偏移**：先按「8 字节头 + 2 字节大端长度」猜分帧，
再 0–96 逐字节试，最后 0–256 逐字节当根 protobuf 解。解不出可改的定位就静默放行。

---

## 我判断错的一次

一开始我说「Loon 插件根本不读 `[Argument]`」，并据此把上游清单里那段坐标参数
当成死代码删掉。

**错了。** 用户自己的仓库里 9 个插件全都在用 `[Argument]` + `argument=[{a},{b}]`。
Loon 官方手册只写了 `#!input`/`#!select`，但两者实际都支持。

上游那段参数失效，真实原因是**两条独立原因叠加**：

1. 三条 `[Script]` 规则**都没有 `argument=`**。没这个参数，脚本里的 `$argument`
   拿到的是**被拦截的 URL 本身**，脚本把它当 query 解析，Apple 的 URL 里没有 lat/lon
2. `longitude =` `latitude =` **默认值本来就是空的**

结论没变（必须走 Bridge 端点写坐标），但理由是错的。教训：
**手册没写 ≠ 不支持，拿用户自己的配置反推比查文档可靠。**

---

## 版本演进

| 版本 | 改了什么 | 触发原因 |
|---|---|---|
| **v1.0** | 脚本改由本仓库托管；标识符改名 18 处；端点 `/wloc-settings/*` → `/geo-settings/*`；移除死参数段 | 上游站点一消失，已导入的插件直接加载失败 |
| v1.1 | 控制页和地图链接解析器收进插件 | 整条链路上最后两个外部依赖（GitHub Pages + Cloudflare Worker） |
| v1.2 | 控制页加短地址 `map.com` | `gs-loc.apple.com/geo-ui/` 太长 | 
| v1.3 | 补 `coordinate=` 参数 | **用户真机分享的苹果地图链接解析不出来** |
| v1.4 | 容忍分享脏输入（前缀地点名、尾随文字） | 分享到快捷指令时链接前面会被粘文字 |
| v1.5 | 所有控制端点统一到 `map.com` | 两套地址容易混 |
| v1.6 | 修 v1.5 事故：`[Script]` 段头丢失 | **插件整个不工作**，见下 |
| v1.7 | 短地址换自有域名 `savues.com` | `map.com` 和系统冲突 |
| v1.8 | 一键入口 `/g/<链接>`（页面 JS 版） | 想做成「访问即定位」 |
| v1.9 | 桥接 + 解析合成 `geo-control.js`，`save?u=` 同步写入 | **Shortcuts 不执行 JS**，v1.8 只在浏览器有效 |
| v1.10 | `/g/` 分支移到脚本里，回到最短形态 | `save?u=…&acc=25` 太复杂 |
| v1.11 | `/off` 一键恢复真实定位 | 需要快速还原 |

---

## 我自己造的 bug

### ① v1.5：清单丢了段头，插件整个不工作

用 `t.index("[Script]")` 定位段头重生成整个段落。这个字符串**先匹配到的是注释里的**：

```
#   1) 三条 [Script] 规则都没有 argument= 参数，…   ← 注释里也有 [Script]
[Script]                                            ← 真正的段头
```

于是从注释中间开始覆盖，把段头冲掉了。六条规则成了漂在文件里的裸行，Loon 不认。

**发现方式**：我用浏览器访问 `gs-loc.apple.com/geo-settings/status`，
拿到的是真实 Apple 的 `Not Found` 而不是插件的 JSON。

**更值得记的是**：`manifest.test.mjs` 当时**没抓到**，因为它只数「以 `http-`
开头的行」，不关心它们在不在 `[Script]` 段里。**测试的盲区正好是 bug 本身。**
现在测试改成按段解析，并用 v1.5 的坏清单反验过。

### ② 合并脚本时把规则正则改瞎了

字符串替换把某条规则的**主机部分整个吃掉**，变成匹配任意域名——那会劫持设备上
所有 HTTP 流量。路由表里 `evil.example.com` 那两条当场就红了。

### ③ 合并后的正则漏了 query

```
\/geo-settings\/(save|status|…)        ← 后面少了 (\?.*)?
```

`save?lat=…&acc=25` **带参数的请求全都不匹配**。也是路由表抓出来的。

### ④ 解析器的私网检查被绕过（安全）

```
parseInput()  → 发现是内网地址，抛错
     ↓ catch
expandThenParse()  → 又去抓了  ← 等于绕过了检查
```

`169.254.169.254`、`localhost` 都会被真的发一次请求。改成只有「确实没坐标」
才允许展开短链。

### ⑤ 短链展开形同虚设

`tryParse` 内部把异常吞了，外层 `catch` 永远不触发，所以短链这条路从没真正走过。

### ⑥ 快捷指令里多了一个 `|`

我写步骤时用 `|` 表示「光标停这里」：

```
https://savues.com/g/|
                      ↑ 光标停这
```

**用户把那个 `|` 真的敲进去了。** 用户的锅是我的符号画得像正文。

### ⑦ 测试假通过

换域名时漏改了 `ui.test.mjs`，而 `geo-ui.js` 的守卫只看路径不看主机——
那些 `map.com` 的用例一直绿着，**测的是一个已经不存在的域名**。

---

## 上游代码的 bug

| | 上游行为 | 本仓库 |
|---|---|---|
| 苹果 `?ll=` | 当 GCJ-02 又减一次偏移，**同一对数字走不同入口差 482m** | 苹果/Google 一律 WGS84 原样 |
| 百度 `@x,y` | 换算结果与 POI 名称**差 1000+ km**，仍返回 200 零告警 | 标准墨卡托还原，落回 POI 本体 |
| 缺 `coordinate=` | 苹果地图 App 分享的链接**全部 422** | 已支持 |
| 硬编码第三方 Worker | 那个 Worker 一挂，快捷指令就废 | 本地解析 |

`coordinate=` 那条是**用户真机分享才发现的**——我之前的测试用例全是自己编的 URL。

---

## 测试从 0 到 164

一开始没有任何测试。现在：

| 文件 | 用例 | 覆盖 |
|---|---|---|
| `smoke.test.mjs` | 49 | 桥接 / 响应改写 / 路线 / `save?u=` / `/g/` / `/off` |
| `parse.test.mjs` | 34 | 解析、坐标系、SSRF 防护、脏输入、短链 |
| `ui.test.mjs` | 38 | 地址路由、页面内容、`?u=` 与 `/g/` 入口（脚本真跑） |
| `manifest.test.mjs` | 43 | 清单规则的路由与安全 |

两个关键手法：

**① 在 Node 里手搓 Loon 运行时。** `vm` 沙箱注入 `$loon` / `$request` / `$response` /
`$persistentStore` / `$done`，跑真实脚本。踩过的坑：沙盒要自己注入
`atob` / `TextDecoder` / `Uint8Array`，否则 route 的 base64 解码报错。

**② 手工构造 Apple 风格回包。** 8 字节头 + 2 字节大端长度 + 根 protobuf，
跑真实改写，然后逐字节确认新经纬度进了输出流、旧值消失了、响应头和
`Content-Length` 同步了。写这个用例时我自己按 ×1e7 断言，脚本是 ×1e8，
差点当成真 bug。

---

## 架构转折：Shortcuts 不执行 JS

v1.8 我把一键入口做成「页面里的 JS 去解析 + 写入」。用户实测：

> 只能靠浏览器打开才会提示已经更改成功

**`获取 URL 内容` 不执行 JavaScript。** 它只把 HTML 拿走了，脚本从没跑过。

参考上游原始做法改成：`https://savues.com/g/<链接>` 命中后，**插件脚本同步完成**
解析、坐标换算、落盘，不碰任何页面代码。

为此把 `geo-bridge.js` 和 `geo-parse.js` 合并成 `geo-control.js`——
`/g/` 要用到解析的坐标系换算，拆成两个远程脚本就只能靠 `$httpClient`
再打一次自己的端点（那种写法没在真机上验证过，我不愿意留）。

---

## 最终形态

```
https://savues.com/g/<地图链接>     切到某个地点（脚本同步完成）
https://savues.com/off              恢复真实定位（别名 /r、/0）
https://savues.com/                 控制台：手填坐标、收藏、历史
https://savues.com/geo-settings/*   桥接端点（gs-loc.apple.com 等价可用）
https://savues.com/geo-parse?u=     只解析，返回 JSON
```

快捷指令 **5 个动作**：

```
文本（共享输入）→ 文本（域名）→ 获取URL内容（/g/<链接>）→ 打开URL（定位服务设置）
```

对上游那个 19 动作的版本，少了 8 个 JSON 取值动作、1 个通知、1 个解析 Worker 依赖。

---

## 如果重做

1. **一开始就把 Loon 运行时模拟搭起来。** 我是到 v1.0 移植完才补的测试，
   前面三个 bug（正则、正则、私网）本该在那时就被抓到。
2. **清单改用行级处理**（按 `[Section]` 拆成 dict 再拼），别用 `str.replace` 改
   多行块。v1.5 那个事故就是这个。
3. **每处 `str.replace` 都加 `assert`。** 后面几次「替换静默失败 → 生成器把
   手工修改覆盖回去」都是这个原因。
4. **别用 `|` 这种符号在文档里表示光标位置。** 用户会照抄。

---

## 相关文件

| 文件 | 内容 |
|---|---|
| [README.md](README.md) | 用法、端点表、边界 |
| [UPSTREAM.md](UPSTREAM.md) | 出处、许可、移植逐条对照 |
| `src/geo-control.js` | 桥接 + 解析 + 一键定位 / 恢复 |
| `src/geo-response.js` | protobuf 改写（上游逻辑，仅改名） |
| `src/geo-route.js` | 动态路线（上游逻辑，仅改名） |
| `src/ui.html` | 控制台页面源码 |
| `smoke.test.mjs` `parse.test.mjs` `ui.test.mjs` `manifest.test.mjs` | 测试 |
