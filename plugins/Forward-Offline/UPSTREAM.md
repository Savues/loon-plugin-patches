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

## 本仓库的取舍记录

- `Forward-Offline`（v1.0 / v1.1）：试图**本地伪造**凭据，两次均已实测失效，仅留作失败记录
- `Forward-Proxy`：用脚本显式转发，与作者原版**功能等价但多一个 GitHub 依赖**
- 真机验证通过（2026-09-29 16:13），但不是必要产物
