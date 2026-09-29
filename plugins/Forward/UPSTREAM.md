# UPSTREAM — Forward 插件出处

> 本文件记录上游来源与实测结论。
> `upstream-Forward.lpx` 为逐字节原件，SHA256 见 `upstream-SHA256SUMS`。

---

## 作者与出处

| | 内容 |
|---|---|
| 作者 | **Yu9191**（Telegram: [@GithubYu9191](https://t.me/GithubYu9191)） |
| 原始帖 | https://t.me/GithubYu9191/174617 |
| Loon 参考来源 | https://t.me/GithubYu9191/174853 |
| 身份线索 | `BOBOLAOSHIV587/Rules` 中该插件 `#!author=baby[https://github.com/Yu9191]`，署名一致 |
| 许可 | **未声明** |

### 作者帖一（174617）原文

```
#脚本 #QuantumultX #Loon #Surge #Shadowrocket #Stash #Crack #ios
forward解锁版本1.3.13
最高只支持1.3.13
其他版本不支持mitm
QuanX：添加重写资源
https://mock.forward1.workers.dev/forward/forward.conf

Surge：
https://mock.forward1.workers.dev/forward.sgmodule
loon：
https://mock.forward1.workers.dev/forward/forward.lpx
loon参考来源：https://t.me/GithubYu9191/174853
```

### 作者帖二（174853）原文 —— Loon 规则的出处

```
^https:\/\/fluxapi\.vvebo\.vip\/v1\/(purchase\/iap\/subscription) header https://mock.forward1.workers.dev/forward/v1/$1
复制粘贴到配置文件[Rewrite]下方，另需添加mitm域名

https://assppweb.com/zh-CN/
版本降级使用该网站在线下载安装即可
```

**`upstream-Forward.lpx` 的 `[Rewrite]` 段与帖中规则逐字符一致**，仅补了插件头字段。

---

## 关键约束：只支持 1.3.13

作者明确写了「最高只支持 1.3.13，其他版本不支持 mitm」，并给出降级渠道
`https://assppweb.com/zh-CN/`。

⇒ **App 一旦升级，凭据格式或校验方式改变，本方案即失效。**
这比「服务器可能下线」更值得注意。

---

## 他是怎么做到的（证据与推断分离）

### 已证实

- mock 部署在 **Cloudflare Workers**，真实站在**阿里云 ESA**（`47.246.23.185`，证书 `*.certfallback-esa.com`）——
  两套独立基建，不是同一台机器改配置
- 降级响应（288 字节）与真凭据（352 字节）**共享 128 字节固定前缀**，内容不同
  ⇒ mock 知道凭据的**格式**，是刻意构造的
- 官方确实存在：`InchStudio/ForwardWidgets`（216 star，资源域名 `assets.vvebo.vip`，
  加密服务 `widgetencrypt.inchmade.ai`）
- App 自称 `Forward-Simulator/1.3.13 (flux.inchmade.app; build:2026010309; iOS 18.7.3)`，
  **build 号与版本号明文暴露**

### 推断（无直接证据）

他能造出合法凭据，可能路径：

1. 从 App 二进制提取加密逻辑 —— build 号暴露，逆向门槛不高
2. 官方内部人员
3. 官方主动提供

`#!desc=Crack` 说明他自己也将其视为破解，而非授权。

---

## 实测结论（2026-09-29，4 份 HAR / 40 个样本）

### mock 的输入要求

| 请求内容 | 响应 | 结论 |
|---|---|---|
| 无任何头 | 386 B | 降级响应，解不开 |
| **只带 `X-Auth-Key`** | **450 B** | ✅ 拿到真凭据 |
| 只带 `Authorization` | 386 B | 无效 |
| 带全签（`x-signature` + `x-timestamp`） | 450 B | 与只带 auth-key **完全一样** |
| **编造的 UUID** 作 auth-key | **450 B** | ✅ 连鉴权都没有 |

⇒ **`X-Auth-Key` 是唯一必需项**，且只是 App 每次本地随机生成的 UUID v4
（40 个样本 40 个不同值），不是签名、不校验。

与社区实现一致：`BOBOLAOSHIV587/Rules` 的 Surge 版 `Forward.js`
只发 `X-Auth-Key` 和请求体。

### 凭据结构

```
服务器响应 = base64(密文)
密文 = 128 字节恒定前缀 + 变长载荷（336 / 352 字节，每次都变）
```

40 个样本中 128 字节前缀**逐字节相同**；载荷长度在 336 / 352 间抖动；
密文每次不同 ⇒ 随机 IV 加密同一明文 ⇒ App 解密后检查是否「已订阅」。

> ⚠️ 比长度前先确认传输形态。带 `accept-encoding: br` 时实际传输 364 B，
> 不带时 450 B，HAR 记录的是解压后内容。
> 排查中曾因此把 450 与 632 当成两种格式，浪费数轮。

### 真实服务器对照

绕过 Loon 改写直连 `fluxapi.vvebo.vip/v1/purchase/iap/subscription`：

| 方式 | 结果 |
|---|---|
| 带合法签名 | 200，336 字节密文（与 mock 同前缀） |
| 不带 `X-Auth-Key` | 200，288 字节降级响应 |
| `GET /health` | `{"status":"ok","version":"1.0.0"}` |
| 根路径 | 「Flux Backend - 刮削数据管理面板」 |

⇒ 真实服务器自己也会发放凭据，但那是「未订阅」版；
mock 返回的是「已订阅」版，差别在密文内容。

---

## 为什么客户端不能自己造

密文用只有服务器掌握的密钥加密。App 拿到随机数解密后是乱码，判定未订阅。

**这不是「还没逆向出来」，是密码学上做不到** —— 除非提取 App 内的密钥。

回放同样不可行：40 份凭据**无一重复**，且与请求一一对应
（16 次请求 = 16 个不同组合）。

---

## 四个社区实现的对照

| 仓库 | 平台 | 机制 |
|---|---|---|
| 作者原版 | Loon | `[Rewrite] header <url>`，10 行零脚本 |
| `BOBOLAOSHIV587/Rules` | Surge | `$task.fetch` + 手动带 `X-Auth-Key` |
| 同上 | Quantumult X | 重写资源（同作者的 `.conf`） |
| 同上 | Loon | `[Rewrite] header <url>`（抄作者帖） |

**Loon 上作者的方案最简**：URL 改写是 Loon 内置功能，不需要拉任何代码，
因此也没有 `script-path` 这个额外失效点。

---

## 密钥逆向判定：绕开中转站不可行

2026-09-29 对 App 1.3.13（build 2026010309）做过完整静态逆向，结论如下。
**这不是「还没找到」，是架构决定的死路。**

### 证据

| 检查项 | 结果 |
|---|---|
| `EncryptionTool` 的日志 | 只有 `Invalid base64 string:` / `Decryption failed with status:` / `Encrypted string:` —— **只有解密，无加密路径** |
| 源文件 | `/Users/johnil/Work/git/Flux_Apple/Packages/Client/Sources/Client/Encryption.swift` |
| 加密原语 | CommonCrypto（`CCCrypt` / `CCHmac` / `CCRandomGenerateBytes`），**对称** |
| `_SecKeyVerifySignature` | **0 处** |
| `_SecKeyCreateEncryptedData` | **0 处** |
| 二进制内密钥常量 | **搜不到**。24 字符 base64 候选仅 2 个，均为误报 |
| 拉取密钥的端点 | **无**。API 清单里没有 key / init / config 类路径 |
| 非对称验签 | **无**。全为对称加密 |

### 佐证

官方 widget 加密服务 `widgetencrypt.inchmade.ai` 的实测输出：

```
FWENC2
{"v":2,"mkv":"1","alg":"A256GCM","iv":"<12字节>","kb":"<60字节>"}
```

连续三次加密同一文件，`iv` 与 `kb` **每次都不同** ⇒ **服务端现场生成密钥**。

⇒ 客户端只持有解密器，密钥在服务器。**本地造凭据在密码学上不可行。**

> 排查中曾把 FFmpeg / OpenSSL 里的 `GCM` / `CTR` / `AES-GCM` 字符串误认为业务加密，
> 实际来自 SRT 音视频加密。已排除。

### 公开信息检索结果：无

| 检索项 | 结果 |
|---|---|
| GitHub 代码 `Decryption failed with status:` | 0 条 |
| GitHub 代码 `FORWARD.TMDB.PROXY.SECRET` | 0 条 |
| GitHub 仓库 `vvebo` | 29 个，全为 YY 开源的 VVebo，与 Forward 无关 |
| GitHub `Forward-Simulator` | 316 条，全部无关 |
| `Yu9191` 的 GitHub 账号 | 不存在 |

**加密逻辑从未开源。** App 闭源、密钥在服务端、社区只流传改写规则。

### 作者归属更正

- `Forward.js`（Surge 版 `$task.fetch` 脚本）由**波波老师V587** 编写（提交 `1ea64e67`，2026-03-20），
  其头部 `#!author=baby[https://github.com/Yu9191]` 指向 Yu9191（转述来源）
- **Yu9191 的 Telegram 帖只提供 3 个文件**（`forward.conf` / `forward.sgmodule` / `forward.lpx`），
  **不含** `Forward.js`

## 本仓库的取舍记录

### 走过的两条弯路（均已删除，仅记于此）

- **本地伪造凭据**（`Forward-Offline` v1.0 / v1.1）：v1.0 猜长度得 386 字节、v1.1 猜 base64
  层数得 632 字节，**两次均实测失效**。根因是把「外壳结构对齐」误当成「内容正确」——
  变化段是有密钥的密文，填随机数必然被判未订阅
- **脚本显式转发**（`Forward-Proxy`）：功能等价且真机验证通过（2026-09-29 16:13，
  `mock.forward1.workers.dev` 正常命中、632 字节、密文前缀一致），
  但**比原版多一个 `script-path` 依赖**（GitHub raw），而原版零脚本
  ⇒ 收益不抵成本，已删除

### 唯一有价值的产出

- 实测确认 mock **只认 `X-Auth-Key`**，签名/时间戳/Authorization 全都无用
- 实测确认 App 1.3.13 是硬约束
- 逆向确认**本地造凭据不可行**，省去后续尝试

### 一条通用教训

采样必须复现真实调用方的全部输入。本轮曾用**不带签名头**的简化请求采样，
拿到的是 mock 的降级响应（386 字节），据此得出的「只校验结构」结论完全错误，
后续三轮都在修一个建立在错数据上的判断。
