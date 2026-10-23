# Loon 插件开发指南 · Loon Plugin Development Guide

> 面向本仓库所有插件的通用开发规范。
> **所有结论均标注证据来源**：`[官方]` = Loon 官方手册 · `[实测]` = 真机/终端/HAR 验证 · `[反例]` = 出现过的失败案例。
> 最后更新：2026-10-23

---

## 目录

1. [五分钟上手](#1-五分钟上手)
2. [**开关的正确写法（段位对照）**](#2-开关的正确写法段位对照最重要) ← 最重要
3. [Argument 参数定义](#3-argument-参数定义)
4. [MITM 配置](#4-mitm-配置)
5. [Script 编写规范](#5-script-编写规范)
6. [Rewrite 与 Script 的相互作用](#6-rewrite-与-script-的相互作用)
7. [HAR 判读速查表](#7-har-判读速查表)
8. [**实测方法论：终端直接验证规则**](#8-实测方法论终端直接验证规则) ← 效率关键
9. [禁止事项清单](#9-禁止事项清单)
10. [发布前自检清单](#10-发布前自检清单)
11. [插件骨架模板](#11-插件骨架模板)
12. [附录：官方文档核对记录](#12-附录官方文档核对记录)

---

## 1. 五分钟上手

### 插件文件结构

```
plugins/<PluginName>/
├── <PluginName>.lpx        # 插件清单（Loon 加载这个）
├── src/
│   └── bundle.js           # 自研脚本（可选，单文件）
├── docs/                   # 分模块 / 分 App 说明
├── tools/                  # 自检工具（可选）
└── README.md               # 面向用户：安装/开关/限制
```

### lpx 骨架（官方字段）

```ini
#!name = 插件名
#!desc = 一句话说明
#!author = YourName
#!homepage = https://github.com/.../plugins/<PluginName>
#!system = iOS,iPadOS
#!date = 2026-10-23 12:00:00
#!tag = 分类标签

[Argument]
removeAds = switch,true,tag=🚫去广告,desc=拦截 xxx 广告

[General]
# 可选：bypass-tun / skip-proxy / real-ip / dns-server / doh-server / ipv6-vif

[Rule]
DOMAIN-SUFFIX, ad.example.com, REJECT

[Mitm]
hostname = api.example.com, cdn.example.com

[Script]
response if ${url} ~= /^https:\/\/api\.example\.com\/ad\//i then script("https://.../bundle.js", {${removeAds}}) with enable=${removeAds}, requires_body=true, tag="广告清理"

[Rewrite]
request if ${url} ~= /^https:\/\/tracker\.example\.com\//i then reject_dict(200)
```

### `#!` 信息字段（官方完整列表）

| 字段 | 说明 |
|------|------|
| `#!name` | 插件名称 |
| `#!desc` | 功能说明 |
| `#!author` | 作者 |
| `#!homepage` | 主页地址 |
| `#!icon` | 图标地址 |
| `#!system` | 支持的系统（不区分大小写，未填=全部）|
| `#!system_version` | 最低系统版本，如 `15.0` |
| `#!loon_version` | 最低 Loon 版本，如 `3.5.1(978)` |
| `#!date` | 版本日期，如 `2026-10-23 12:00:00`（**按原样显示**）|
| `#!tag` | 分类标签 |
| `#!type` | `normal`（默认）或 `parser`（资源解析器）|

> ⚠️ **`#!version` 不在官方字段表中** `[官方]`。本仓库部分插件使用它（历史习惯）。
> 若发现版本号在 Loon 界面不显示，改用 `#!date`。

### 段名大小写

官方示例写作 `[Mitm]` `[General]` `[Rule]` `[Rewrite]` `[Host]` `[Script]`。
本仓库 `[MITM]`（14 个）与 `[Mitm]`（18 个）并用，**均可正常工作** `[实测]` → 段名不区分大小写。
**新插件统一用官方写法 `[Mitm]`。**

### 订阅与测试

```
raw 直链:  https://raw.githubusercontent.com/<user>/<repo>/main/plugins/<PluginName>/<PluginName>.lpx
锁版本:    https://raw.githubusercontent.com/<user>/<repo>/<commit-sha>/plugins/.../xxx.lpx
```
raw CDN 缓存 `max-age=300`，调试时用**带 commit sha 的 URL** 可绕过。

---

## 2. 开关的正确写法（段位对照）★最重要

**只有两种官方支持且经验证可靠的开关写法**：

| 段位 | ✅ 正确写法 | 依据 |
|------|------------|------|
| `[Script]` | `... then script("x.js", {${sw}}) with enable=${sw}` | `[官方]` with 字段表明确列出 `enable` |
| `[Rewrite]` | `... if ${url} ~= /RE/i && ${sw} == true then <action>` | `[官方]` rewrite_v2 示例 |

**❌ 不要用的写法**：

| 写法 | 问题 | 证据 |
|------|------|------|
| `[Rule]` `DOMAIN, x, REJECT, enable={sw}` | **死开关** —— 规则无条件生效，开关无效 | `[反例]` PinDuoDuo：用户截图开关为「关」，同期抓包规则仍 REJECT 24 次；官方 rule 文档**全文无 `enable`** |
| `[Rewrite]` `... then reject, enable={sw}` | **非官方语法** → 规则无效 | `[实测]` `gm.mmstat.com` 返回真实 43B GIF；官方 rewrite 文档无此语法 |
| 任意段 `enable={sw}` 后缀 | 同上 | `[反例]` Spotify-Dedup 报 `Can not find policy: REJECT, enable={blockQuic}` |

### 决策流程

```
规则需要开关吗?
├─ 不需要 → 直接写，最省事
│    [Rule]    DOMAIN-SUFFIX, ad.com, REJECT
│    [Rewrite] request if ${url} ~= /RE/i then reject_dict(200)
│
└─ 需要 → 按目标类型选
     ├─ 纯域名 → [Script]（唯一可行；[Rule] 无法挂开关）
     │    response if ${url} ~= /^https:\/\/ad\.com\//i then script("drop.js", {${sw}}) with enable=${sw}
     │    注: 需配 MITM；或脚本里只返回固定空响应
     │
     └─ 带路径
          ├─ 只需拒绝    → [Rewrite] + ${sw} == true 条件
          └─ 需改响应体  → [Script] + with enable=
```

### 为什么 `[Rule]` 没有开关能力？

官方 `[Rule]` 语法是 `类型, 值, 策略`（可选附加参数如 `no-resolve`），
**没有 `enable` 这个位置** `[官方]` → 多写的 `enable={sw}` 被忽略或误解析 → 开关失效。

### 若必须让纯域名规则可开关

改为 `[Script]` + 脚本返回空响应（需 MITM）：
```ini
[Mitm]
hostname = ad.example.com

[Script]
response if ${url} ~= /^https:\/\/ad\.example\.com\//i then script("drop.js", {${sw}}) with enable=${sw}, requires_body=true
```
```js
// drop.js
$done({ body: "" });
```

**替代方案（更简单）**：接受规则无条件生效，把开关从 `[Argument]` 里删掉，避免给用户"可以关"的错觉。

---

## 3. Argument 参数定义

### 官方格式 `[官方]`

```ini
[Argument]
name    = input,"Loon",tag=名称,desc=输入一个名称
price   = input,9.99,type=number,tag=价格
region  = select,"CN","US","JP",tag=地区
level   = select,1,2,3,type=number,tag=等级
enabled = switch,true,tag=启用
debug   = switch,false,tag=调试模式,desc=默认关闭
```

**结构**：`参数名 = 控件类型, 默认值 [, type=类型] [, tag=标签] [, desc=说明]`

| 控件 | 默认类型 | `type=` 可指定 |
|------|---------|---------------|
| `input` | String | `type=number` |
| `select` | String | `type=number` |
| `switch` | Boolean | （无需指定）|

> 未声明 `type=` 时：`input`/`select` 按 String 解析，`switch` 按 Boolean 解析 `[官方]`。
> 参数值保留其类型，**不会被重新解析为条件或 Action，也不做二次变量展开**。

> 官方两处示例分别写作 `switch,true,tag=启用` 与 `switch,false,true,tag=调试日志`，
> 说明第 3 个位置参数也被接受（含义未在文档说明）。**推荐用两位置形式**。

### 在规则中引用

```ini
[Rule]
# ❌ 无法挂开关（见 §2），只能无条件
DOMAIN-SUFFIX, ad.com, REJECT

[Mitm]
hostname = api.example.com

[Script]
response if ${url} ~= /RE/i then script("x.js", {${region}, ${level}}) with enable=${enabled}, requires_body=true, timeout=20

[Rewrite]
request if ${enabled} == true && ${url} ~= /RE/i then reject_dict(200)
```

### 对象参数的约束 `[官方]`

```ini
script("x.js", {${region}, ${level}})   # ✅
script("x.js", {})                      # ❌ 不能为空
script("x.js", {"CN", 2})               # ❌ 只能写 ${参数名}
script("x.js", {${url}})                # ❌ 不能引用运行变量
script("x.js", {${region}, ${region}})  # ❌ 不能重复
```

### 脚本侧读取

```js
function isEnabled(key) {
  // 官方定义: $argument 是 null / String / Object 三态之一 [官方]
  // 下方做防御性兼容（含数组形态），确保任何传入方式都不会误判
  let arg = $argument;
  if (Array.isArray(arg)) arg = arg.length > 0 ? arg[0] : {};
  if (!arg || typeof arg !== "object") return false;
  const val = arg[key];
  return val === true || val === "true" || val === "1";
}
```

> ★ **必做**：`规则里 {${...}} 引用的 key` 与 `脚本 isEnabled() 用的 key` 必须一一对应。
> 不匹配时**没有任何报错**，过滤器静默不执行 `[反例]` 本仓库已发生 2 起（闲鱼 7 处 / 联盟 metax）。
> → 用 `tools/check_switch_keys.py` 静态检查兜底。

---

## 4. MITM 配置

```ini
[Mitm]
hostname = api.example.com, cdn.example.com
```
插件里的 `hostname` 会与本机 MITM 列表**合并**（与其他插件、主配置一起）`[官方]`。
**没有 `%APPEND%` 之类的前缀**（那是其他代理工具的写法，Loon 不需要也不识别）。

### 核心规则

| 规则 | 说明 |
|------|------|
| **带路径的 `[Rewrite]`/`[Script]` 规则，其域名必须在 MITM** | 否则 HTTPS 未解密 → Loon 只看到 CONNECT 主机名 → **路径规则静默失效** |
| **纯域名拦截用 `[Rule]`** | 域名级匹配，**不需要 MITM**，且匹配最早（连接建立时）|
| `[Rule]` 的匹配顺序 | 域名规则 → 未命中再解析 DNS 匹配 IP 规则 `[官方]` |
| 规则来源优先级 | **本地规则 > 插件规则 > 订阅规则** `[官方]` |

### 血泪案例 `[反例]`

```
orange.tbcdn.cn     缺 MITM → 配置清洗器从未触发
g.alicdn.com        缺 MITM → 搜索门组件拦截全失效
hudong.tbcdn.cn     缺 MITM → 3.4MB 资源完整下载（改用 [Rule] 后解决）
```

**发布前必须做一次「规则引用域名 ⊆ MITM ∪ [Rule] 域名」全量自检。**

---

## 5. Script 编写规范

### 单文件

Loon 不支持 `require()` / 多文件 → 所有函数写在同一个文件里。

### 标准骨架

```js
// ============ 工具 ============
function log(msg) { console.log("[插件名] " + msg); }
function isEnabled(key) { /* 见 §3 */ }
function safeParse(body) {
  try { return typeof body === "string" ? JSON.parse(body) : JSON.parse(body.toString()); }
  catch (e) { return null; }
}

// ============ 处理器 ============
function handleApiA(url, body) {
  if (!isEnabled("switchA")) return null;
  const data = safeParse(body);
  if (!data) return null;
  // ... 清理
  return JSON.stringify(data);   // 有改动返回新 body；无改动返回 null
}

// ============ 入口 ============
function main() {
  const url = $request.url;
  const body = $response.body;
  let out = null;
  if (url.includes("api.a.com")) out = handleApiA(url, body);
  if (out === null) { $done({}); return; }   // 无改动 → 原样放行
  $done({ body: out });
}
main();
```

### `with` 字段（官方完整列表）`[官方]`

| 字段 | 类型 | 默认 | 适用 |
|------|------|------|------|
| `enable` | Boolean / 插件 Boolean | `true` | 全部 |
| `tag` | String | 由路径派生 | 全部 |
| `img_url` | String | 无 | 全部 |
| `timeout` | Number | HTTP 20s / 其他 300s | 全部 |
| `debug` | Boolean | `false` | 全部 |
| `requires_body` | Boolean | `false` | Request / Response |
| `binary_body_mode` | Boolean | `false` | Request / Response |

> ⚠️ **字段名区分大小写，必须小写 snake_case；写入未知字段会导致当前规则无效** `[官方]`。
> （这正是 `[Rewrite]` 段写 `enable={}` 会失效的原因之一）
> `binary_body_mode` 只决定 Body 的表示方式，**不会自动开启** `requires_body`。

### 触发类型（不止 HTTP）`[官方]`

```ini
request  if <条件> then script("a.js") with requires_body=true
response if <条件> then script("b.js") with requires_body=true
cron "0 8 * * *" then script("cron.js") with timeout=300
network-changed then script("net.js") with timeout=30
generic then script("tool.js", "region=CN") with img_url="arrow.triangle.swap.system"
```
Cron 支持 5 段 / 6 段（秒在最前）。`generic` 类型可在 Loon 里手动触发。

### `$argument` 类型由第二参数决定 `[官方]`

| 配置 | `$argument` 类型 |
|------|-----------------|
| 省略第二参数 | `null` |
| `script("x.js", "debug=true")` | String（Loon 不做任何解析）|
| `script("x.js", {${a}, ${b}})` | Object（key=参数名，value 保留原类型）|

### 关键约定

| 约定 | 原因 |
|------|------|
| **无改动必须 `$done({})`** | 传空对象 = 原样返回 |
| `requires_body=true` 才能读 `$response.body` | 否则在 Header 阶段执行，body 为 undefined |
| 二进制/gzip 用 `binary_body_mode=true` → body 是 `Uint8Array` | 需同时设 `requires_body=true` |
| 字节级改动必须**等长** | protobuf 有长度前缀 |
| `script()` 路径必须是固定字符串 | 不能用变量/模板 `[官方]` |
| 一条规则只能有一个 `script(...)` | 不支持 `\|` 管道 `[官方]` |
| 改完必做 `node --check` | 语法错误 = 整个脚本静默失效 |

### 5 项实用技巧

**① 字节级等长替换**（protobuf / 长度前缀）
```js
const i = findBytes(buf, marker);
buf.set(replacement, i);   // replacement.length === marker.length
```

**② 编辑收集法**（多处替换避免索引失效）
```js
const edits = [];
let idx = src.indexOf(marker);
while (idx >= 0) { edits.push([idx, idx + marker.length]); idx = src.indexOf(marker, idx + 1); }
for (let i = edits.length - 1; i >= 0; i--) src = src.slice(0, edits[i][0]) + repl + src.slice(edits[i][1]);
```

**③ 长度中立布尔翻转**（保持字节长度）
```
"false"(7) → "true "(7)     字符串形式
"true"(6)  → "fals"(6)
false(5)   → true +空格(5)  布尔形式；true → 跳过（置 null 会让 NSNull 崩溃）
```

**④ 括号配对扫描**（不依赖 JSON.parse，可容忍截断）

**⑤ 资源全名子串匹配**（同一组件多种 URL 形态一次覆盖）

---

## 6. Rewrite 与 Script 的相互作用

官方明确的禁用关系 `[官方]`：

```
Request 阶段产生终止响应时          → Request / Response Script 均不执行
Request Body Rewrite / Mock 命中时  → Request Script 不执行
Response Body Rewrite 命中时        → Response Script 不执行
只改 Request Header 的 Rewrite      → 不会禁用 Script
```

**⇒ 同一接口同时写 `[Rewrite]`（终止类，如 reject）和 `[Script]` 时，Script 永远不会执行。** `[反例]`
本仓库 13 处此类重叠，其中 `cloudvideo.video.query` 因 blanket `reject_dict` 抢占 Script，
导致 App 收到 `{}` 后**退避重试 6 次**（HAR 实测）→ 应二选一。

### 第一条命中规则 `[官方]`

- Request / Response **分别**最多选一条，按配置顺序取**第一条完整命中**
- 「较早规则需要等待 Response 数据时，不能提前选择它后面已经确定为 true 的规则」

### 其它 Rewrite 要点

```ini
# 阶段与动作必须匹配（错配会在加载时报错并拒绝整条规则）[官方]
request  if ... then request.header.set(...)     # ✅
request  if ... then response.header.set(...)    # ❌ request 阶段不能用 response.*
```
- 变量只展开一次；参数值里的 `${...}` 不会二次展开
- 正则可用 `as <name>` 捕获，后接 `${name.1}`
- 旧语法（`^url reject-dict`）仍兼容，但新写法为 `request if ... then reject_dict(200)`

---

## 7. HAR 判读速查表

| 现象 | 含义 | 处理 |
|------|------|------|
| `size=2` / body 为 `{}` | ✅ `reject_dict` 生效 | — |
| `status=0` 且**域名在规则内** | ✅ `REJECT` 生效（连接被断）| — |
| DNS 解析到 `127.0.0.1` | ✅ `[Rule]` REJECT 生效 | — |
| `size=0` 且**域名不在规则内** | ⚠️ **环境问题，不是插件** | 别改规则 |
| 大响应原样返回 | ❌ 未拦 | 依次查：MITM → 段位/开关语法 → 脚本是否加载 |
| **退避式重复请求**（1s/2s/4s）| ❌ blanket reject 抢占了 Script | 二选一（§6）|
| 接口已拦但界面元素仍在 | 走**原生 fallback** | 找原生 API，别继续改组件规则 |

### 快速定位三步

```
1. HAR 里筛 size=2 / status=0（在规则内的）→ 哪些规则生效
2. 只有 [Rewrite] 生效、[Script] 全无 → 查脚本加载 / isEnabled / 参数 key
3. 目标未拦但规则看似正确 → 查 MITM → 开关语法（§2）→ 是否被 Rewrite 抢占
```

---

## 8. 实测方法论：终端直接验证规则

**重大发现** `[实测]`：若设备已安装 Loon 且终端流量经过它（已信任根证书），
**可直接用 curl 验证任何规则是否生效**，无需抓 HAR。

```bash
# ① 纯域名 REJECT → 看 DNS 是否被黑洞
getent hosts ad.example.com                         # 输出 127.0.0.1 = 被拦
curl -skv https://ad.example.com/ 2>&1 | grep -iE "127.0.0.1|refused"

# ② reject_dict → 看 body 是否变空
curl -sk https://api.example.com/ad | head -c 20    # {} = 生效

# ③ 未拦 → 看真实响应
curl -sk -o /dev/null -w "HTTP %{http_code} size=%{size_download}\n" https://api.example.com/ad
```

> ★★★ **终端测的是「设备上已加载的配置」，不是仓库里的最新提交。**
> 修改仓库后**必须先在 Loon 里更新订阅并重启**，终端测试才有意义。
> 否则你测的是旧版本 —— 这是最容易犯的流程错误。
>
> 正确顺序：**改 → 推送 → 给出订阅地址+版本号 → 用户更新并重启 → 复测**
>
> 判断设备是否已加载新版：可在规则里临时加一条**行为可观测**的测试规则
> （如对某个无害域名 REJECT），更新后该域名应立刻变为不可达；未变则说明未加载。

**注意事项**
- iOS 上 curl 可能报证书错误 → 加 `-k`
- **必须做对照**：同批测试里加「已知生效」和「已知不该拦」的目标，避免把网络问题误判成规则问题
- 只测**纯域名/整 URL 固定**的规则；带查询串或需登录的接口测不了

**三组对照模板**
```bash
# 组1 应被拦（本次新加/修改的规则）
# 组2 已知生效（历史规则，作基线）
# 组3 不应被拦（无关域名，验证无过度拦截）
```

---

## 8.5. 本地模拟器离线验证 —— loon-sim


## 9. 禁止事项清单

| # | 禁止 | 后果 | 案例 |
|---|------|------|------|
| 1 | `[Rule]` 挂 `enable={}` | **死开关**（规则无条件生效，开关无效）| PinDuoDuo 实证 |
| 2 | `[Rewrite]` 挂 `, enable={}` | 规则**完全无效** | 本仓库 57 处 |
| 3 | `with` 里写未知字段 | **当前规则无效** `[官方]` | 同 2 |
| 4 | 同一接口同时有 `[Rewrite]`(终止类) 和 `[Script]` | Script 永不执行；可能触发 App 重试 | `cloudvideo` 重试 6 次 |
| 5 | 规则 `{${key}}` 与 `isEnabled(key)` 不匹配 | 过滤器**静默不执行** | 闲鱼 7 处 |
| 6 | 带路径规则缺 MITM 域名 | 路径不可见 → 规则失效 | orange / g.alicdn / hudong |
| 7 | 拦截功能接口（登录/支付/消息/校验/联想）| 破坏功能 | 见各插件 README |
| 8 | 改脚本后不做调用点检查 | 函数定义丢失 → 整脚本失效 | `scrubPopcdnSchedule` 被冲掉 2 次 |
| 9 | 脚本化重建 lpx 后不校验文件头 | 插件无法识别 | 6 行 `#!` 头全丢 |

**特别提醒**：拦截「疲劳度/频次记录」类接口会**适得其反**
```
wireless.home.pop.fatigue.record   ← 拦了 App 认为"从未展示过" → 弹得更多
```

---

## 10. 发布前自检清单

```bash
P=plugins/<Name>/<Name>.lpx

# ① 文件头齐全（首行必须是 #!name）
head -1 $P | grep -q '^#!name' && echo OK

# ② 段位置正确：request 动作在 [Rewrite]，response 动作在 [Script]
# ③ 无非法开关写法
grep -n "enable={" $P          # [Rule] 段出现即死开关；[Rewrite] 段出现即无效
grep -n "== true then" $P      # 出现在 [Rewrite] 段 = 合法；[Script] 段 = 无意义

# ④ 规则引用域名 ⊆ MITM ∪ [Rule] 域名

# ⑤ 开关 key 与脚本 isEnabled 一一对应
python3 tools/check_switch_keys.py

# ⑥ 脚本语法
node --check src/bundle.js

# ⑦ 每个函数定义都有调用点
# ⑧ 终端三组对照实测（§8）
```

### 版本发布

```bash
# 1. 统一版本号（lpx 的 #!date / README / 提交信息）
# 2. 提交后从 CDN 用 commit-sha URL 二次确认
curl -sL "https://raw.githubusercontent.com/<user>/<repo>/<sha>/plugins/.../x.lpx" | head -6
```

---

## 11. 插件骨架模板

### README.md 推荐结构

```markdown
> **版本 vX.Y.Z** · 日期

## 📥 安装            — 订阅地址 + 版本直链
## 📊 插件规模         — 各段规则数（必须与文件核对一致）
## 🎛️ 开关清单         — 表格: 开关 | 默认 | 作用
## 🌐 MITM 域名        — 完整列表 + "必须保留"标注
## 🏗️ 架构             — 目录 / 分发顺序
## ⚠️ 开发规范         — 本插件踩过的坑（附案例）
## 🧪 验证流程         — 标准步骤 + 生效判据 + 环境限制
## 📖 形态速查         — 指向 docs/*.md
## 🔧 维护指引         — 素材更新流程 / 禁止拦截清单 / 自检清单
```

### 文档维护原则

| 原则 | 说明 |
|------|------|
| **数字必须与文件核对** | 每次改规则后同步；写明"Rewrite 106 条"就要真是 106 |
| **明细集中一处** | 形态清单放 `docs/`，README 只给数量+链接，避免两处漂移 |
| **每条结论附证据** | 「HAR: 35858B→2B」比「已修复」有用得多 |
| **标注验证状态** | ✅ 实证 / ⏳ 待验证 / ❌ 已知失效 |
| **记录失败史** | 排除过的方案写清「为什么不行」，避免后人重走 |

---

## 12. 附录：官方文档核对记录

本指南 §1–§6 的关键结论与官方文档的核对情况：

| 结论 | 来源 | 状态 |
|------|------|------|
| `#!` 字段表（含 `#!date`，无 `#!version`）| Plugin 文档 | ✅ 已核对 |
| `[Argument]` 格式 `控件,默认值[,type=][,tag=][,desc=]` | Plugin / rewrite_v2 | ✅ 已核对 |
| `[Script]` `with` 字段表（7 个，含 `enable`）| script_v2 | ✅ 已核对 |
| `$argument` 三态（null / String / Object）| script_v2 | ✅ 已核对 |
| 对象参数 `{${a}}` 的 4 条约束 | script_v2 | ✅ 已核对 |
| `[Rewrite]` 用 `${sw} == true` 条件引用参数 | rewrite_v2 示例 | ✅ 已核对 |
| `[Rule]` 无 `enable` 字段 | Rule 文档（全文无）| ✅ 已核对 |
| Rewrite(终止类) 命中 → Script 不执行 | script_v2 | ✅ 已核对 |
| HTTP 第一条命中规则 | script_v2 | ✅ 已核对 |
| `[Mitm]` 段名/合并行为 | Plugin 文档 | ✅ 已核对 |
| 规则来源优先级 本地>插件>订阅 | Rule 文档 | ✅ 已核对 |
| `[Rule]` 的 `enable={}` 是死开关 | 官方无此字段 + PinDuoDuo 实证 | ✅ 已核对 |
| `[Rewrite]` 的 `, enable={}` 无效 | 官方无此语法 + 本仓库实测 | ✅ 已核对 |
| 段名大小写不敏感 | 本仓库 14×`[MITM]` + 18×`[Mitm]` 均工作 | ✅ 实测 |

### 官方文档链接

| 主题 | 链接 |
|------|------|
| 插件格式 | https://nsloon.app/docs/Plugin/ |
| Rule 段 | https://nsloon.app/docs/Rule/ |
| Script 语法（新版）| https://nsloon.app/docs/Script/script_v2/ |
| Script 语法（旧版）| https://nsloon.app/docs/Script/ |
| Script API | https://nsloon.app/docs/Script/script_api/ |
| Rewrite 语法（新版）| https://nsloon.app/docs/Rewrite/rewrite_v2/ |
| Rewrite 语法（旧版）| https://nsloon.app/docs/Rewrite/ |
| MitM | https://nsloon.app/docs/category/mitm/ |
| Script 编辑器 | https://nsloon.app/script-builder/ |
| Script 转换器（旧→新）| https://nsloon.app/script-converter/ |
| Rewrite 编辑器 | https://nsloon.app/rewrite-builder/ |
| 插件转换器 | https://nsloon.app/plugin-converter/ |

---

*本指南随实践持续更新。新增结论请附「证据来源」标签，不要写未经验证的推断。*
