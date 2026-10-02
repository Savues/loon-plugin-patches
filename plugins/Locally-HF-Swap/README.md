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
| [src.js](src.js) | 改写脚本（2.8 KB） | Rewrite script |
| [locally-hf-swap.test.mjs](locally-hf-swap.test.mjs) | 回归测试，17 个用例 | Regression tests |

跑测试：`node locally-hf-swap.test.mjs`

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

- **真机已确认插件能装上、MITM 正常、开关生效**（2026-10-03 iPadOS 18.7.3）。
  但**模型替换本身当时未生效**——原因是脚本只认 `$argument` 的对象形态，
  而 Loon 实际把参数传成了字符串，导致脚本静默走「原样放行」。
  已修（参数兼容 5 种形态 + 清单加双引号），**修复后仍需重新实测确认**。
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

两次真机抓包定位到一个**静默失效**的坑，值得单独记：

**现象**：插件装得上、`支持的系统` 显示 iPadOS、开关是绿的、MITM 域名也在，
但抓包里 14 条 huggingface.co 请求的 URL **一条都没被改写**，全是原仓库。

**根因**：脚本首版只写 `$argument.repo`（对象形态）。而 Loon 在
`argument=[{targetRepo}]` 这种写法下把参数传成了**字符串**，
于是 `$argument.repo` 是 `undefined` → `TARGET` 为空 →
命中校验失败 → 走「原样放行」分支 → 请求正常通过，**但什么都没改**。

这类失效最坏的地方在于**没有任何报错**：脚本按设计「安全地」放行了所有请求，
日志里也看不出异常。用户只会看到「插件装了但没效果」。

**修法**：
1. 脚本兼容 `$argument` 的全部 5 种形态（`k=v` 字符串 / `[a,b]` / 纯字符串 / 对象 / 数组），
   写法参照本仓库 `Reven-Mirror/src/loon-redirect.js` 的既有做法
2. 清单里给 `argument` 加双引号（Loon 文档要求「为了能够准确解析到参数，请将参数用双引号包裹」）
3. 补 6 个用例锁住参数形态，防止再退化 —— 现在共 25 个用例

**教训**：「原样放行」这类安全网会把配置错误也一并吞掉。
凡是参数解析失败就放行的脚本，都必须有测试覆盖**每种传参形态**，
否则真机上是「装得上、没报错、也没效果」。
