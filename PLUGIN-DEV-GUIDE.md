# Loon 插件开发指南 · Loon Plugin Development Guide

> 面向本仓库所有插件的通用开发规范。内容来自**真机实测 + HAR 抓包 + 官方文档**三方验证，
> 每条结论都标注了证据来源，可放心作为开发依据。
>
> 最后更新：2026-10-23 · 基于 Alibaba-AdBlock v3.39.1 的开发实践

---

## 目录

1. [五分钟上手](#1-五分钟上手)
2. [**段位选择决策树**](#2-段位选择决策树最重要) ← 最重要
3. [开关（[Argument]）正确用法](#3-开关argument正确用法)
4. [MITM 配置规则](#4-mitm-配置规则)
5. [Script 编写规范](#5-script-编写规范)
6. [**HAR 判读速查表**](#6-har-判读速查表)
7. [**实测方法论：终端直接验证规则**](#7-实测方法论终端直接验证规则) ← 效率关键
8. [禁止事项清单](#8-禁止事项清单)
9. [发布前自检清单](#9-发布前自检清单)
10. [插件文件骨架模板](#10-插件文件骨架模板)

---

## 1. 五分钟上手

### 插件文件结构

```
plugins/<PluginName>/
├── <PluginName>.lpx        # 插件清单（Loon 加载这个）
├── src/
│   └── bundle.js           # 自研脚本（可选，单文件）
├── docs/                   # 分 App / 分模块说明
│   └── <App>.md
├── tools/                  # 自检工具（可选）
│   └── check_switch_keys.py
└── README.md               # 面向用户：安装/开关/限制
```

### lpx 骨架

```ini
#!name=插件名 v1.0.0
#!desc=一句话说明
#!system=iOS, iPadOS
#!version=1.0.0
#!author=YourName <https://github.com/YourName>
#!homepage=https://github.com/.../plugins/<PluginName>

[Argument]
someSwitch = switch, true, false, tag=🔧开关名, desc=说明

[Rule]
DOMAIN-SUFFIX, ad.example.com, REJECT, enable={someSwitch}

[MITM]
hostname = api.example.com

[Script]
response if ${url} ~= /^https:\/\/api\.example\.com\/ad\//i then script("https://raw.githubusercontent.com/.../bundle.js", {${someSwitch}}) with enable=${someSwitch}, requires_body=true, tag="广告清理"

[Rewrite]
request if ${url} ~= /^https:\/\/tracker\.example\.com\//i then reject_dict(200)
```

> ⚠️ 文件头 6 行（`#!name` 到 `#!homepage`）**必须齐全**，缺失会导致 Loon 无法识别插件。
> 任何脚本化重建 lpx 后务必校验首行是 `#!name`。

### 订阅与测试

```
raw 直链:      https://raw.githubusercontent.com/<user>/<repo>/main/plugins/<PluginName>/<PluginName>.lpx
锁定版本:      https://raw.githubusercontent.com/<user>/<repo>/<commit-sha>/plugins/.../xxx.lpx
```
Loon 有 CDN 缓存（`max-age=300`），调试时用**带 commit sha 的 URL** 可绕过。

---

## 2. 段位选择决策树（最重要）

Loon 有 4 个可放拦截规则的段位，**能力完全不同**：

| 段位 | 支持 `enable={开关}` | 需要 MITM | 匹配时机 | 适用 |
|------|:---:|:---:|------|------|
| `[Rule]` | ✅ **有效** | ❌ **不需要** | 连接建立时（最早）| **纯域名拦截**（首选）|
| `[Script]` | ✅ **有效**（`with enable=`）| ⚠️ 需要 | 响应到达后 | 路径+开关 / 改响应体 |
| `[Rewrite]` | ❌ **无效** | ⚠️ 需要 | 请求/响应 | 路径+**不需**开关 |
| `[Rule]` REJECT 实现 | DNS 解析到 `127.0.0.1` | — | — | 域名黑洞 |

### 决策流程

```
要拦一个目标
│
├─ 只需「域名级」拦截?
│   └─ ✅ 用 [Rule]
│        DOMAIN-SUFFIX, ad.example.com, REJECT, enable={开关}
│        优点: enable 有效、无需 MITM、无需解密、性能最好、匹配最早
│
├─ 需要「路径」匹配 + 要开关?
│   └─ ✅ 用 [Script]（注意: 必须配 MITM，且脚本自己要判断开关）
│        response if ${url} ~= /RE/i then script("url", {${开关}}) with enable=${开关}, requires_body=true
│
├─ 需要「路径」匹配 + 不要开关?
│   └─ ✅ 用 [Rewrite] 无条件
│        request if ${url} ~= /RE/i then reject_dict(200)
│
└─ 需要「改响应体」?
    └─ ✅ 用 [Script] + bundle.js
         响应侧规则，requires_body=true（或 binary_body_mode=true 处理二进制/压缩）
```

### 实测证据（2026-10-23，终端经 Loon MITM）

| 写法 | 目标 | 结果 |
|------|------|------|
| `[Rule]` + `enable={}` | `ocsp.apple.com` | ✅ DNS→`127.0.0.1` 被拦 |
| `[Script]` + `with enable=` | 本仓库多数插件 | ✅ 正常工作 |
| `[Rewrite]` + `enable={}` | `gm.mmstat.com` | ❌ 返回**真实 43B GIF** |
| `[Rewrite]` + `&& ${sw} == true` | 同上 | ❌ 同样无效 |
| `[Rewrite]` 无条件 | `dinamicx` 底栏 | ✅ 返回 `{}` |

**旁证**（仓库内既有记录）：
- `PinDuoDuo` 注释：`# [已移除-死开关] 原挂 enable={telemetry_stub}，真机实测该开关无效`
- `Spotify-Dedup` 注释：`# Policy match error. Can not find policy: REJECT, enable={blockQuic}`

---

## 3. 开关（[Argument]）正确用法

### 定义

```ini
[Argument]
removeAds    = switch, true, false, tag=🚫去广告, desc=拦截 xxx 广告
enableFilter = switch, false, true, tag=🧪实验性, desc=默认关闭
someValue    = input, 30, "超时秒数", tag=⚙️超时
mode         = select, ["A", "B"], ["a", "b"], tag=🎛️模式
```
格式：`名称 = 类型, 默认值, 可选值, tag=标签, desc=说明`

### 在规则里引用

```ini
# ✅ [Rule] 段 — key=value 作为规则属性
DOMAIN-SUFFIX, ad.com, REJECT, enable={removeAds}

# ✅ [Script] 段 — with enable= 控制是否调用脚本；参数用 {${key}} 列表
response if ${url} ~= /RE/i then script("path", {${removeAds}, ${enableFilter}}) with enable=${removeAds}, requires_body=true

# ❌ [Rewrite] 段 — 没有任何可行的开关写法
request if ${url} ~= /RE/i then reject_dict(200), enable={removeAds}    # 无效
request if ${url} ~= /RE/i && ${removeAds} == true then reject_dict(200) # 同样无效
```
→ `[Rewrite]` 段要开关，必须**下沉到 `[Rule]`**（纯域名时）或**改写成 `[Script]`**。

### 脚本侧读取（bundle.js）

```js
function isEnabled(key) {
  let arg = $argument;
  // ★ Loon 可能传数组形态 [{...}]，也可能传对象 {...}
  if (Array.isArray(arg)) arg = arg.length > 0 ? arg[0] : {};
  if (!arg || typeof arg !== "object") return false;
  const val = arg[key];
  return val === true || val === "true" || val === "1";
}
```

> **必做**：`规则参数列表` 与 `脚本里 isEnabled() 的 key` 必须一一对应。
> 不匹配时**没有任何报错**，过滤器静默不执行（本仓库已发生 2 起事故）。
> → 用 `tools/check_switch_keys.py` 这类静态检查兜底。

---

## 4. MITM 配置规则

```ini
[MITM]
hostname = %APPEND% api.example.com, cdn.example.com
```
（插件里直接 `hostname = a, b, c`，Loon 会与本机列表合并）

### 核心规则

| 规则 | 说明 |
|------|------|
| **带路径的 `[Rewrite]`/`[Script]` 规则，其域名必须在 MITM** | 否则 HTTPS 未解密 → Loon 只看到 CONNECT 主机名 → **路径规则静默失效** |
| **纯域名拦截用 `[Rule]`** | 域名级匹配，**不需要 MITM**，可减少解密开销 |
| 同一域名既在 `[Rule]` 又在 MITM | 若只为路径规则而加，改用 `[Rule]` 后可移除 |

### 血泪案例

```
orange.tbcdn.cn     缺 MITM → 配置清洗器从未触发（第 1 次）
g.alicdn.com        缺 MITM → 搜索门组件拦截全失效（第 2 次）
hudong.tbcdn.cn     缺 MITM → 3.4MB 资源完整下载（第 3 次，改用 [Rule] 解决）
```

**发布前务必做一次「规则引用域名 ⊆ MITM ∪ [Rule] 域名」全量自检。**

---

## 5. Script 编写规范

### 单文件（重要）

Loon **不支持 `require()` / 多文件** → 所有函数写在同一个 `bundle.js` 里，按「工具函数 → 各 App 处理器 → main()」排列。

### 标准骨架

```js
// ============ 工具函数 ============
function log(msg) { console.log("[插件名] " + msg); }
function isEnabled(key) { /* 见 §3 */ }
function safeParse(body) {
  try { return typeof body === "string" ? JSON.parse(body) : JSON.parse(body.toString()); }
  catch (e) { return null; }
}

// ============ 处理器 ============
function handleAppA(url, body) {
  if (!isEnabled("switchA")) return null;
  const data = safeParse(body);
  if (!data) return null;
  // ... 清理逻辑
  return JSON.stringify(data);   // 返回新 body；无改动返回 null
}

// ============ 入口 ============
function main() {
  const url = $request.url;
  let body = $response.body;
  let out = null;
  if (url.includes("api.a.com")) out = handleAppA(url, body);
  if (out === null) { $done({}); return; }   // 无改动 → 原样放行
  $done({ body: out });
}
main();
```

### 关键约定

| 约定 | 原因 |
|------|------|
| **无改动必须 `$done({})`** | 传空对象 = 原样返回，避免误改 |
| `requires_body=true` 才能读 `$response.body` | 否则 body 为 undefined |
| 二进制/gzip 用 `binary_body_mode=true` → body 是 `Uint8Array` | 字节级操作时用 |
| 字节级改动必须**等长** | protobuf 有长度前缀；压缩流更敏感 |
| 改完必做 `node --check` | 语法错误 = 整条规则静默失效 |

### 5 项实用技巧

#### ① 字节级等长替换（protobuf / 长度前缀场景）
```js
// 目标: 在 Uint8Array 里替换等长子串，保持总长度不变
const i = findBytes(buf, marker);
buf.set(replacement, i);   // replacement.length === marker.length
```

#### ② 编辑收集法（多处替换避免索引失效）
```js
const edits = [];
let idx = src.indexOf(marker);
while (idx >= 0) { edits.push([idx, idx + marker.length, repl]); idx = src.indexOf(marker, idx + 1); }
for (let i = edits.length - 1; i >= 0; i--) { src = src.slice(0, edits[i][0]) + edits[i][2] + src.slice(edits[i][1]); }
```

#### ③ 长度中立布尔翻转（JSON 布尔，保持字节长度）
```js
// "false"(7) → "true "(7)   字符串形式；"true"(6) → "fals"(6)
// 布尔形式: false → true + 空格；true → 跳过（置 null 会导致 NSNull 崩溃）
```

#### ④ 括号配对扫描（不依赖 JSON.parse，容错截断）
```js
// 定位 JSON 对象边界：从 '{' 开始数 { } 深度
```

#### ⑤ 组件/资源全名子串匹配
```
同一个组件可能有多种 URL 形态:
  https://cdn/组件名/版本/muise/main.wlm
  ms_组件名@版本.wlm          ← 资源包形式
→ 用「完整组件名子串」匹配可一次覆盖全部形态
```

---

## 6. HAR 判读速查表

| 现象 | 含义 | 处理 |
|------|------|------|
| `size=2` / body 为 `{}` | ✅ `reject_dict` 生效 | — |
| `status=0` 且**域名在规则内** | ✅ `REJECT` 生效（连接被断）| — |
| DNS 解析到 `127.0.0.1` | ✅ `[Rule]` REJECT 生效 | — |
| `size=0` 且**域名不在规则内** | ⚠️ **环境问题，不是插件** | 别改规则 |
| 大响应原样返回 | ❌ 未拦 | 依次查：MITM → 段位 → 开关 |
| **退避式重复请求**（1s/2s/4s）| ❌ blanket reject 抢占了 Script | 二选一，见 §8 |
| 弹窗/面板仍出现但接口已拦 | 走**原生 fallback** | 找原生 API，别继续改组件规则 |

### 快速定位三步

```
1. HAR 里筛 size=2 → 哪些规则生效
2. 只有 [Rewrite] 生效、[Script] 全无 → 查脚本加载 / isEnabled / $argument 形态
3. 目标未拦但规则看似正确 → 查 MITM → 段位 → 开关语法
```

---

## 7. 实测方法论：终端直接验证规则

**重大发现**：若设备已安装 Loon 且终端流量经过它（已信任根证书），
**可以直接在终端用 curl 验证任何规则是否生效**，无需抓 HAR。

```bash
# ① 纯域名 REJECT → 看 DNS 是否被黑洞
getent hosts ad.example.com            # 输出 127.0.0.1 = 被拦
curl -skv https://ad.example.com/ 2>&1 | grep -iE "127.0.0.1|refused"

# ② reject_dict → 看 body 是否变空
curl -sk https://api.example.com/ad | head -c 20     # {} = 生效

# ③ 未拦 → 看真实响应
curl -sk -o /dev/null -w "HTTP %{http_code} size=%{size_download}\n" https://api.example.com/ad
```

**注意事项**
- iOS 上 curl 可能报证书错误 → 用 `-k` 绕过
- **必须做对照**：同一批测试里加 1-2 个「已知生效」和「已知不该拦」的目标，避免把网络问题误判成规则问题

**推荐的三组对照模板**
```bash
# 组1: 应被拦（自己刚加的规则）
# 组2: 已知生效（历史规则，作基线）
# 组3: 不应被拦（无关域名，验证无过度拦截）
```

---

## 8. 禁止事项清单

| # | 禁止 | 后果 | 案例 |
|---|------|------|------|
| 1 | `[Rewrite]` 用 `enable={}` 或 `&& ${sw} == true` | 规则**完全无效** | 本仓库 57 处 |
| 2 | `[Rule]`/`[Rewrite]` 的动作写错段 | **静默忽略** | 4 条 request 规则误放 `[Script]` |
| 3 | **同一接口同时有 `[Script]` 和 `[Rewrite]`** | Rewrite 抢占 → Script 成死代码；若 Rewrite 返回 `{}`，App 可能**退避重试** | `cloudvideo.video.query` 重试 6 次 |
| 4 | 规则参数缺 key（与 `isEnabled()` 不匹配）| 过滤器静默不执行 | 闲鱼 7 处 |
| 5 | 带路径规则缺 MITM 域名 | 路径不可见 → 规则失效 | orange / g.alicdn / hudong |
| 6 | 拦截**功能接口**（登录/支付/消息/校验/联想）| 破坏功能 | 见各插件 README「禁止拦截」节 |
| 7 | 改动上游 JS 却不做调用点检查 | 函数定义丢失 → 整脚本失效 | `scrubPopcdnSchedule` 被冲掉 2 次 |
| 8 | 脚本化重建 lpx 后不校验文件头 | 插件无法识别 | 6 行 `#!` 头全丢 |

**特别提醒 —— 拦截「疲劳度/频次记录」类接口会适得其反**：
```
wireless.home.pop.fatigue.record   ← 拦截后 App 认为"从未展示过" → 弹得更多
```

---

## 9. 发布前自检清单

```bash
# ① 文件头 6 行齐全
head -6 <Plugin>.lpx | grep -c '^#!'

# ② 段位置正确（request 在 [Rewrite]，response 在 [Script]）
# ③ 无 [Rewrite] + enable=（或条件式）
grep -n "enable={" <Plugin>.lpx          # 只应出现在 [Rule]/[Script] 段
grep -n "== true then" <Plugin>.lpx      # 应为 0

# ④ 规则引用域名 ⊆ MITM ∪ [Rule] 域名
# ⑤ 开关 key 与脚本 isEnabled 一一对应
python3 tools/check_switch_keys.py

# ⑥ 脚本语法
node --check src/bundle.js

# ⑦ 函数定义+调用成对（自定义的每个函数都要有调用点）
grep -c "function 某函数" src/bundle.js ; grep -c "某函数(" src/bundle.js

# ⑧ 终端实测三项对照（§7）
```

### 版本发布

```bash
# 1. 统一版本号（lpx 头 + README + 提交信息）
# 2. 改 bundle.js 后同步递增 script-url 的版本参数（如有）
# 3. 提交后从 CDN 用 commit-sha URL 二次确认内容
curl -sL "https://raw.githubusercontent.com/<user>/<repo>/<sha>/plugins/.../x.lpx" | head -4
```

---

## 10. 插件文件骨架模板

```
plugins/<Name>/
├── <Name>.lpx
├── src/bundle.js
├── docs/<App>.md
├── tools/check_switch_keys.py
└── README.md
```

### README.md 推荐结构

```markdown
> **版本 vX.Y.Z** · 日期

## 📥 安装            — 订阅地址 + 版本直链
## 📊 插件规模         — 各段规则数（与文件核对一致）
## 🎛️ 开关清单         — 表格: 开关 | 默认 | 作用
## 🌐 MITM 域名        — 完整列表 + "必须保留"标注
## 🏗️ 架构             — 目录 / main() 分发顺序
## ⚠️ Loon 铁律        — 本插件开发中的血泪教训（附案例）
## 🧪 验证流程         — 标准步骤 + 生效判据 + 环境限制
## 📖 各 App 形态速查   — 指向 docs/<App>.md
## 🔧 维护指引         — 素材更新流程 / 禁止拦截清单 / 自检清单
```

### 文档维护原则

| 原则 | 说明 |
|------|------|
| **数字必须与文件核对** | README 写「Rewrite 106 条」就要真的数是 106；每次改规则后同步 |
| **明细集中在一处** | 形态清单放 `docs/<App>.md`，README 只给数量+链接，避免两处漂移 |
| **每条结论附证据** | 「v3.37.5 修复 → HAR: xxx 35858B→2B」比「已修复」有用得多 |
| **标注验证状态** | ✅ 真机/HAR 实证 · ⏳ 待验证 · ❌ 已知失效 |
| **记录失败史** | 排除过的方案要写清「为什么不行」，避免后人重走 |

---

## 附录：常用官方文档

| 主题 | 链接 |
|------|------|
| 插件格式 | https://nsloon.app/docs/plugin/ |
| Script 语法（新版）| https://nsloon.app/docs/Script/script_v2/ |
| Script 语法（旧版）| https://nsloon.app/docs/Script/ |
| Script API（`$request`/`$done`/`$argument`）| https://nsloon.app/docs/Script/script_api/ |
| Rewrite 语法（新版）| https://nsloon.app/docs/Rewrite/rewrite_v2/ |
| Rewrite 语法（旧版）| https://nsloon.app/docs/Rewrite/ |
| Rule 段 | https://nsloon.app/docs/Rule/ |
| 官方转换器（旧→新语法）| https://nsloon.app/script-converter/ · https://nsloon.app/rewrite-converter/ |

---

*本指南随实践持续更新。新增结论请附上「实测证据」，不要写未经验证的推断。*
