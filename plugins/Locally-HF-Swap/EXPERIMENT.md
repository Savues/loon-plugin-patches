# Locally 实验记录 · 为什么会走到尽头

> 这份记录写于 2026-10-03，是插件从「跑通」到「撞墙」的完整过程。
> 结论先说：**网络层能做的都做完了，剩下的在App 内部，Loon 解决不了。**
> 但过程里的每个坑、每次误判、每个判据，都留着给以后遇到同类问题的人。

---

## 一句话结论

插件成功把Locally 下载的 HF 仓库整体换成了任意指定仓库（URL 改写 + 元数据改写全部正确、
逐字节对齐），文件也能完整下载 —— **但 App 仍报「请求超时」。**

已经修好的：

| 层 | 状态 | 证据 |
|---|---|---|
| URL 改写（三层形态） | ✅ 正确 | 真机抓包 14/14 命中脚本，`modifiedRequest: True` |
| 目录名 / 身份 | ✅ 已修 | v1.5 起 `_loon.modifiedResponse: True`，`id` 确已改回原模型 |
| `usedStorage` 总量 | ✅ 已修 | v1.6 起改为 347831164，与 App 期望**一字不差** |
| 文件下载完整性 | ✅ 能下完 | 曾实测 337,886,921 字节一个不少 |
| App 端加载 | ❌ **未解决** | 始终报「出了点问题 请求超时」 |

---

## 三层形态：网络层已无死角

一次完整下载抓包（15 条请求）显示 Locally 只用到 3 种 URL 形态：

| # | 形态 | 用途 | 处理方式 |
|---|---|---|---|
| 1 | `/api/models/{repo}/revision/main` | 元数据 | 换仓库 + 响应阶段修正身份 |
| 2 | `/{repo}/resolve/{sha}/{file}` | 大文件 | `resolve/main/`（307跳 CDN） |
| 3 | `/api/resolve-cache/models/{repo}/{sha}/{file}` | 小文件直回 | 换仓库 + **换真实 sha** |

`sha` 是**仓库专属**的，这是唯一的真难点。实测（curl 打真网）：

| 改写方式 | 结果 |
|---|---|
| `/api/models/{新repo}/revision/main` | 200 ✅ |
| `/{新repo}/resolve/main/{file}` | 307 ✅ |
| `/{新repo}/resolve/{别家sha}/{file}` | **404** ❌ |
| `resolve-cache` 用 `main` 冒充 sha | **400** ❌ |
| `resolve-cache` 用真实 sha（etag 可省） | 200 ✅ |

⇒ 形态 2 可以用 `main` 偷懒；**形态 3 必须查真实 sha**（`$httpClient` 查一次并缓存）。

---

## 撞墙的四个坑（每个都静默失效）

### 坑 1：`#!system=ios` —— iPad 上装不进去

抄官方 `Plugin_Arg.plugin` 时写成 `#!system=ios`，iPadOS 18.7.3 上直接报**「操作系统不支持」**。
iPadOS 13+ 是独立系统标识，只声明 `ios` 会被拒。

同时 `#!loon_version=3.5.1(988)` 也是白设的门槛：988 是**新语法**
（`request if ${url} then script()`）的要求，本插件用**旧语法** `http-request ^re script-path=`，
3.x 全版本都支持。

⇒ 改为 `#!system=iOS, iPadOS` + `#!loon_version=3.2.0`。

### 坑 2：raw 的 CDN 按完整 URL 缓存

改完脚本推送，真机仍跑旧代码，**连测三轮才发现**。
`raw.githubusercontent.com` 一旦把 `.../main/plugins/.../src.js` 缓存住，
之后改脚本也不更新，且无任何提示（`?cb=随机数` 拦不住，实测连续 3 次仍返回旧内容）。

⇒ `script-path` 钉到 **commit SHA**。SHA 直链与任何已缓存的 main 直链都不同，永不命中旧缓存。

⚠️ 验证线上内容是否已更新要用 GitHub API 读blob，不要信 raw：

```bash
curl -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github.raw" \
  "https://api.github.com/repos/OWNER/REPO/contents/PATH?ref=main"
```

### 坑 3：`argument="{targetRepo}"` —— 参数传不进去

最费时间的一个，因为我**连续三轮都在错误的方向上加补丁**。

当时的判断是「Loon 把参数传成了字符串」，于是：
给脚本加 5 种形态兼容（`k=v`/`[a,b]`/纯字符串/对象/数组）、加 `$persistentStore` 兜底、
按官方文档「请将参数用双引号包裹」加了引号 —— **全都没用**。

**直到去翻别人的插件**。GitHub 上 1316 个 `.lpx` 的对照结果：

| 写法 | 实例 | 说明 |
|---|---|---|
| `argument="{"k":"v"}"` | 有，但**引号内必须是完整 JSON** | 引号里只包一个裸变量名是**无效语法** |
| `argument=[{A},{B}]` | 通行写法，**不需要引号** | iRingo WeatherKit（14 个参数）即如此 |

⇒ 改回 `argument=[{targetRepo}]`，**一次通过**。

顺带排除了两个我一直在怀疑的嫌疑（均有官方示例或多个实例佐证）：
正则 `^https:\/\/` 写法正确（与官方 Spotify 示例同构）、`$done({url})` 正确（61 个实例佐证）。

### 坑 4：目录名 + usedStorage —— App 只认白名单目录

用户用「可读 App 私有目录的设备」确认：**Locally 只认白名单里的文件夹名**。
插件把元数据换成目标仓库后，App 收到的 `id` 是目标仓库名 → 按目标仓库名落盘 →
该目录不在白名单 → 文件完整下载了也**读不到**。

⇒ v1.5 加 `meta-fix.js`（`http-response`）把 `id/modelId/author/_id` 改回原模型，
但保留目标仓库的 `sha`/`siblings`。

紧接着发现第二个问题：**HF 的 `usedStorage` 与文件总和并不相等**。

```
usermma/Huihui-MiniCPM5-1B-abliterated-mlx-2Bit
  usedStorage   = 675,773,842
  文件总和       = 347,832,341     ← 差 1.94 倍
```

App 拿 `usedStorage` 当「应下载总量」，永远等不到剩余部分，
日志里出现 `Left stream RST:8`，传输到 53.8% 被 App 主动掐断。

⚠️ **这里我犯了一个反复出现的错误**：v1.5 想「按 siblings 实算」，
但判断条件是 `typeof sib[0].size === 'number'` —— 而**App 请求的 URL 不带 `?blobs=true`，
HF 返回的 siblings 只有 `{"rfilename":"xxx"}`，根本没有 size 字段**。
条件永远不成立，**等于什么都没做**。

⇒ v1.6 主动用 `$httpClient` 查一次 `?blobs=true` 取真实大小，填进 siblings 后重算
`usedStorage`，结果缓存（`$persistentStore`，key=`hf_blobs_{repo}`），只查一次。

---

## v1.6 的实测结果：元数据已完全对齐，但依然失败

真机抓包解码出的元数据（v1.6 改写后交给 App 的）：

```
id           = mlx-community/MiniCPM5-1B-mlx-6Bit   ← 已改回原模型 ✅
sha          = 338e97683bcbd3d454db3fd25296f953cd263254 ← 目标仓库 ✅
usedStorage  = 347831164                            ← 与原模型一字不差 ✅
siblings 7 个文件，每个 size 均为真实值 ✅
README.md / .gitattributes 已过滤 ✅
```

更关键的是核对发现：**原模型 `mlx-community/MiniCPM5-1B-mlx-6Bit` 与目标仓库
`usermma/Huihui-...` 是同一个 commit**（sha 均为 `338e9768…`），7 个文件大小逐个字节一致。

也就是说 **v1.6 交付给 App 的元数据，与 App 期望的完全一模一样**。

**但 App 仍然报「请求超时」。**

最后一次抓包只有 5 条请求，元数据请求反而排在 `tokenizer.json` 之后——
因为 `meta-fix.js` 里的 `$httpClient.get` 会**同步阻塞**响应（Loon 挂起响应直到回调返回），
查询耗时 3 秒，而 `tokenizer.json` 传输被掐断在 85% 后 App 直接 `RST:8` 放弃。

---

## 结论：为什么这条路到头了

网络层能做的都做了，而且都能验证：

1. **URL 改写正确** —— 三层形态全覆盖，真机 14/14 命中脚本
2. **元数据改写正确** —— 与 App 期望逐字节对齐（v1.6 已做到）
3. **文件能完整下载** —— 曾实测 337,886,921 字节完整落盘

三项全部达标，App 依然失败。**说明 App 的校验不止这些**——
它内部还有 HTTP 层无法观测的状态（历史下载记录、目录哈希、或某个我没抓到的请求）。

继续在 URL 与响应体层面打补丁，已经没有信息可以支撑。

### 如果还想试，需要什么

**App 下载完成后那个文件夹的完整状态**（有哪些文件、多大、有无隐藏校验文件）。
用户有能读私有目录的设备——这能直接回答「App 到底认了什么、为什么不认」。

### 建议的替代路线

若目标是「在 iPad 上跑任意 HF 模型」，**转向支持导入本地模型的 MLX App**：
把权重下到本地目录直接加载，完全绕开 Locally 这套校验。这条路确定可行。

---

## 方法论：这段路留下的四条教训

### 1. 现象与假设对不上时，换信息源，别继续加固

坑 3 上我连打三轮补丁（参数形态兼容、持久化兜底、诊断日志），
全是修不存在的问题。**是用户要求「去搜别的插件看规则怎么写」才查出来**——
GitHub 1316 个 `.lpx` 对照后一次通过。

⇒ **下插件脚本问题前，先 grep 同仓库里已真机验证过的同类脚本。**
本仓库 `Reven-Mirror/src/loon-redirect.js` 开头 40 行就是现成的答案，就在隔壁目录。

### 2. mock 形态必须来自真机证据（我犯了两次）

| 场景 | 我喂的 mock | 真机实际 | 后果 |
|---|---|---|---|
| v1.1 参数 | `$argument = {repo}` | 字符串/其他形态 | 测试全绿，真机无效 |
| v1.5 usedStorage | `?blobs=true` 的**带 size** 样本 | App 拿到**无 size** 形态 | 分支永远走不到，等于没改 |

⇒ 写 mock 前先从 HAR 里解码真实响应体，**别用「更方便的那份」**。

### 3. 静默失效的代码必须有「响亮的失败」

「参数非法就放行」这类安全网会把配置错误一并吞掉：
脚本行为完全符合设计，日志干净，请求正常，**只有功能没生效**。

### 4. 诊断要选对渠道

`console.log` 的输出**不会出现在 Loon HAR 里**（只记引擎级事件）——
我在 v1.2/v1.3 加的版本标记日志因此一次都没被看到，加它时选错了渠道。

**真正有用的是 `_loon` 字段**：

| 字段 | 含义 |
|---|---|
| `script: ['名字']` | 脚本**确实被调用了**（别误判成没执行） |
| `modifiedRequest: True/False` | 该请求是否被改写过 |
| `modifiedResponse: True/False` | 响应体脚本是否生效 |
| `mitmHost` | MITM 是否生效 |
| `log` | 引擎级事件（`Trigger script`/`Reuse connection`…） |

⚠️ 三个判读要点：

- **`modifiedRequest: False` 不等于失败** —— 脚本按幂等设计，已指向目标仓库的 URL 直接放行
- **HAR 的 `url` 字段是改写前的原始 URL** —— 会出现两个仓库名成对出现，那是改写证据不是泄漏
- **`time` 字段能暴露异常耗时** —— 本项目里正是 `time: 63818` 的那条请求锁定了问题

---

## 附：最终形态与测试

| 文件 | 用途 | 用例 |
|---|---|---|
| `Locally-HF-Swap.lpx` | 插件清单 | — |
| `src.js` | URL 改写（`http-request`） | 29 个 |
| `meta-fix.js` | 元数据修正（`http-response`） | 24 个 |
| `locally-hf-swap.test.mjs` | 前者回归测试 | — |
| `meta-fix.test.mjs` | 后者回归测试 | — |

共 **53 个用例**，样本取自真机抓包解码后的真实元数据。

跑测试：

```bash
node locally-hf-swap.test.mjs
node meta-fix.test.mjs
```

**插件功能层面（网络层改写）已完整验证可用**；
未验证的是 App 端的加载，那不在本插件的能力范围内。
