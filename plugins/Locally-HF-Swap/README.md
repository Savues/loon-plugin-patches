# Locally 模型劫持 · Locally-HF-Swap

把 Locally 从 HuggingFace 下载的模型仓库，**整体换成你指定的任意仓库**。
App 列表里没有的模型，填个 repo id 就能下。

完全自研（无上游代码）—— 起因是 Locally 不提供手动导入模型的入口，
而 App 内置的模型列表是写死的。

---

## 安装 · Install

订阅地址（Loon → 配置 → 插件 → 右上角 `+` → 粘贴）：

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Locally-HF-Swap/Locally-HF-Swap.lpx
```

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。拉不到时在地址末尾加随机参数：`?cb=2`

| 文件 | 用途 | Purpose |
|---|---|---|
| [Locally-HF-Swap.lpx](Locally-HF-Swap.lpx) | 插件清单 | Plugin manifest |
| [src.js](src.js) | 改写脚本（4.8 KB） | Rewrite script |
| [locally-hf-swap.test.mjs](locally-hf-swap.test.mjs) | 回归测试，29 个用例 | Regression tests |

跑测试：`node locally-hf-swap.test.mjs`

> 💡 订阅地址用 `main` 即可。本插件内部的 `script-path` 已钉到 commit SHA，
> 不受 CDN 缓存影响 —— 详见「真机排障记录」的坑 2。

---

## 用法 · Usage

插件设置里两个参数：

| 参数 | 默认 | 说明 |
|---|---|---|
| **目标模型仓库** | `mlx-community/Qwen3-4B-4bit` | HF 仓库 id，格式 `owner/name` |
| **启用劫持** | 开 | 关掉即完全放行 |

然后在 App 里点**任意**模型的下载 —— 下到的会是你指定的那个仓库。

⚠️ 目标仓库得是 **MLX 量化版**（`mlx-community/xxx-4bit` 这类，safetensors 格式）。
普通 GGUF 仓库 Locally 加载不了。

---

## 原理 · How it works

一次完整下载（15 条请求）抓下来，Locally 只用到 **3 种 URL 形态**，全在 `huggingface.co`：

| # | 形态 | 用途 |
|---|---|---|
| 1 | `/api/models/{repo}/revision/main` | 元数据（sha、文件清单） |
| 2 | `/{repo}/resolve/{sha}/{file}` | 大文件，302/307 跳 CDN |
| 3 | `/api/resolve-cache/models/{repo}/{sha}/{file}?…` | 小文件直回内容 |

脚本在 `http-request` 阶段把三者全部重写到目标仓库，用 `$done({url})` 交还。

### sha 是唯一的真难点

`sha` 是**仓库专属**的，不能沿用原仓库的。实测（curl 打真网，非推断）：

| 改写方式 | 实测结果 |
|---|---|
| `/api/models/{新repo}/revision/main` | **200** ✅ |
| `/{新repo}/resolve/main/{file}` | **307** 正常跳 CDN ✅ |
| `/{新repo}/resolve/{别家sha}/{file}` | **404** ❌ |
| `resolve-cache` 里用 `main` 冒充 sha | **400** ❌ |
| `resolve-cache` 用真实 sha（etag 可省） | **200** ✅ |

⇒ 形态 2 可以偷懒用 `main`；**形态 3 必须拿到真实 sha**，
脚本用 `$httpClient.get` 查一次并缓存进 `$persistentStore`（key = `hf_sha_{repo}`），
整个下载过程只查一次。查失败时降级用 `main`，不会挂住请求。

---

## 安全网 · Safety nets

脚本有三层保护，任何一层触发都**原样放行**，绝不挡下载：

1. **幂等跳过** —— URL 已指向目标仓库就不处理（防止自触发死循环）
2. **参数校验** —— repo id 必须匹配 `^[\w.\-]+\/[\w.\-]+$`，多斜杠/空格/路径穿越一律放行
3. **路径白名单** —— 只处理上面那 3 种形态，`whoami-v2` 等其他端点不受影响

MITM 范围只有 `huggingface.co` 一个域名，不碰 CDN（`us.aws.cdn.hf.co`）——
CDN 上的签名 URL 是服务端生成的，改写反而会失效。

---

## 已知限制 · Known limitations

- ✅ **真机已验证**：2026-10-03 在 iPadOS 18.7.3 / iPad16,1 上跑通 ——
  14/14 请求命中脚本，URL 全部改写到目标仓库 `bumblebuttpow/MiniCPM5-2B-heretic-abliterated-MLX-8bit`，
  三种 URL 形态均返回正常（详见下方「真机排障记录」）。
- **App 内显示的模型名 / 大小 / 量化标签仍会是原模型的元数据**（来自被劫持前已缓存的列表），
  实际权重是目标仓库的。加载后看输出是否正常来判断有没有生效。
- **换仓库 ≠ 换架构。** 若目标模型的 `architectures` 与 App 运行时预期不符，可能加载失败。
  建议先拿同族模型（都是 `LlamaForCausalLM`）试，再换架构。
- 目标仓库若无 App 请求的某个子路径（如 `onnx/`），会 404 —— 这是预期行为，
  说明那个文件本来就不存在。

---

## 开发中踩的两个坑

都是靠 node 沙盒跑真实抓包 URL 抓出来的，值得记一笔：

1. **正则 `^` 锚点** —— 直接对 `$request.url`（含 `https://huggingface.co`）用
   `^/api/models/...` 匹配，**永远不命中**。必须先剥掉 scheme+host 再匹配 path。
   这个 bug 让首版 6 个用例全部静默返回 `(unchanged)`。
2. **`split("/")` 索引错位** —— `/api/resolve-cache/models/owner/repo/sha/file`
   有 5 段前缀，`seg[4]` 不是文件名。改用正则捕获组取尾部才稳。

⇒ 测试 mock 直接喂**未经预处理的真实抓包 URL**，不做任何"帮它对齐"的处理，
否则这类 bug 会被 mock 悄悄吃掉。
---


## 真机排障记录（2026-10-03）

这个插件在真机上前前后后调了六轮才跑通，过程比代码本身更值得记 ——
**三个独立的坑叠在一起，而每一个的表现都是「静默失效」：装得上、开是绿的、
请求正常、日志无报错，就是不生效。**

### 坑 1：`#!system=ios` —— iPad 上直接装不进去

首版抄 Loon 官方 `Plugin_Arg.plugin` 示例时写成 `#!system=ios`，
用户在 iPadOS 18.7.3 上报**「操作系统不支持」**，插件根本装不进去。
iPadOS 13+ 是独立系统标识，只声明 `ios` 会被拒。

同时 `#!loon_version=3.5.1(988)` 也是白设的版本门槛：988 是**新语法**
（`request if ${url} then script()`）的要求，而本插件用的是**旧语法**
`http-request ^re script-path=`，3.x 全版本都支持。

改为 `#!system=iOS, iPadOS` + `#!loon_version=3.2.0`，与本仓库其余 12 个插件一致。

### 坑 2：`raw.githubusercontent.com` 的 CDN 缓存

改完脚本推送后，真机仍加载旧代码，连测三轮才发现。
**raw 的缓存键是完整 URL** —— 一旦 `.../main/plugins/.../src.js` 这条被缓存住，
之后改脚本它也不更新，且无任何提示（`?cb=随机数` 也拦不住，实测连续 3 次都返回旧内容）。

**修法**：`script-path` 钉到 commit SHA 而不是 `main` 分支。
SHA 直链与任何已缓存的 main 直链都不同，永不命中旧缓存：

```ini
script-path=https://raw.githubusercontent.com/Savues/loon-plugin-patches/<40位SHA>/plugins/Locally-HF-Swap/src.js
```

验证线上内容是否已更新，用 GitHub API 读 blob，不要信 raw：

```bash
curl -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github.raw" \
  "https://api.github.com/repos/OWNER/REPO/contents/PATH?ref=main"
```

### 坑 3：`argument="{targetRepo}"` —— 参数传不进去

这个坑最费时间，因为我一直在**错误的方向上打补丁**。

当时的判断是「Loon 把参数传成了字符串」，于是给脚本加了 5 种形态的兼容
（`k=v` / `[a,b]` / 纯字符串 / 对象 / 数组）、加了 `$persistentStore` 兜底、
还把 `argument` 按官方文档「请将参数用双引号包裹」加了引号 —— 全都没用。

**直到去翻别人的插件才看明白**。GitHub 上 1316 个 `.lpx` 的对照结果：

| 写法 | 实例 | 说明 |
|---|---|---|
| `argument="{"k":"v"}"` | 有，但**引号内必须是完整 JSON** | 引号里只包一个裸变量名是**无效语法** |
| `argument=[{A},{B}]` | 通行写法，**不需要引号** | iRingo WeatherKit（14 个参数）即如此 |

改回 `argument=[{targetRepo}]` 后**一次通过**。

### 定位手段：Loon HAR 里的 `_loon` 字段

前几轮之所以反复误判，是因为只看「URL 没被改写」这一个现象。
Loon 导出的 HAR 每条 entry 都带 `_loon`，里面有决定性字段：

| 字段 | 含义 |
|---|---|
| `script: ['Locally模型劫持']` | 脚本**确实被调用了**（我一度误判成没执行） |
| `mitmHost: huggingface.co` | MITM 生效 |
| `modifiedRequest: True/False` | 该请求是否被改写过 |
| `log` | 引擎级事件（`Trigger script`、`Reuse connection`…） |

有了它才能区分「脚本没跑」和「脚本跑了但走了放行分支」——
这正是之前两轮误判的根源。

⚠️ **但 `console.log` 的输出不会出现在 HAR 里**，它只记录引擎级事件。
我在 v1.2/v1.3 加的版本标记日志因此一次都没被看到 —— 选错了观察渠道。

### 结果（04:56 抓包确认）

```
仓库     mlx-community/MiniCPM5-1B-mlx-6Bit  →  bumblebuttpow/MiniCPM5-2B-heretic-abliterated-MLX-8bit
形态 1   /api/models/…/revision/main              200
形态 2   /{repo}/resolve/main/{file}              307 → 302 跳 CDN
形态 3   /api/resolve-cache/…/{真实sha}/{file}    200
命中     14/14 请求命中脚本，8 条 modifiedRequest: True
```

`modifiedRequest: False` 的 6 条是 `resolve-cache` 分支 —— 它们的 URL 已指向目标仓库，
脚本按幂等设计直接放行，属**正确行为**而非失败。

### 教训

1. **别在错的方向上加补丁。** 连续三轮加参数兼容、加兜底、加诊断，都是在修一个
   本来就不存在的问题。现象和假设对不上时，该做的是**换信息源**（去翻真实用例），
   而不是继续加固。
2. **静默失效的代码必须有「响亮的失败」。** 「参数非法就放行」这类安全网会把
   配置错误一并吞掉 —— 脚本行为完全符合设计，日志干净，请求正常，只有功能没生效。
3. **诊断要选对渠道。** `console.log` 在 Loon HAR 里看不到，得看 `_loon` 字段。
4. **mock 的形态必须来自真机证据。** 我在 node 沙盒里默认喂 `$argument = {repo}`，
   这个默认值本身就是错的假设 ——
   若当时多写一句「参数也可能是字符串」，第一版就能暴露问题。
