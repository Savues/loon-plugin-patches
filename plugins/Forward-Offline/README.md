# Forward-Proxy · Forward 订阅凭据转发

> 把 App 的订阅查询请求转给作者的 mock 服务器，响应原样送回。
> **客户端不做任何加解密** —— 密钥在服务器侧。**v1.0**

## 安装 · Install

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Forward-Offline/Forward-Proxy.lpx
```

> ⚠️ 拉不到新版时加随机参数破 CDN 缓存：`?cb=2`
> ⚠️ **不要与原版 `Forward.lpx` 或 `Forward-Offline` 同时启用**，三者会争同一个请求。

| 文件 | 用途 | Purpose |
|---|---|---|
| [Forward-Proxy.lpx](Forward-Proxy.lpx) | 插件清单 | Manifest |
| [forward-proxy.js](forward-proxy.js) | 转发脚本（2.4 KB） | Proxy script |
| [test/forward-proxy.test.mjs](test/forward-proxy.test.mjs) | 回归测试 30 例 | Tests |
| [forward-offline.js](forward-offline.js) | ❌ 已废弃，见文末 | Deprecated |
| `upstream-Forward.lpx` | 上游清单原件存档 | Pristine upstream |

---

## 实测结论：转发什么就够了

2026-09-29 用 4 份 HAR（40 个样本）实测，mock 服务器的输入要求：

| 请求内容 | 响应 | 结论 |
|---|---|---|
| 无任何头 | 386 B | 降级响应，解不开 |
| **只带 `X-Auth-Key`** | **450 B** | ✅ 拿到真凭据 |
| 只带 `Authorization` | 386 B | 无效 |
| 带全签（`x-signature` + `x-timestamp`） | 450 B | 与只带 auth-key **完全一样** |
| **编造的 UUID** 作 auth-key | **450 B** | ✅ 连鉴权都没有 |

⇒ **`X-Auth-Key` 是唯一必需项**，它只是 App 每次本地随机生成的 UUID v4（40 个样本 40 个不同值），
不是签名、不校验。`x-signature` / `x-timestamp` / `Authorization` 传不传都一样。

这与社区第三个实现（[BOBOLAOSHIV587/Rules](https://github.com/BOBOLAOSHIV587/Rules) 的 Surge 版）一致 ——
它的 `Forward.js` 也只发 `X-Auth-Key` 和请求体。

## 凭据结构（黑盒实测）

```
服务器响应 = base64(密文)
密文 = 128 字节恒定前缀 + 变长载荷（336 / 352 字节，每次都变）
```

| 观察 | 说明 |
|---|---|
| 128 字节前缀 40 个样本逐字节相同 | 见 `samples/prefix-128.hex` |
| 载荷长度在 336 / 352 之间抖动 | 是密文的正常长度抖动，**不是格式差异** |
| 密文每次都不同 | 随机 IV 加密同一明文 |
| App 会解密它并检查是否「已订阅」 | —— 这就是本地伪造不可能的原因 |

> ⚠️ 传输形态受 `accept-encoding` 影响：带 `br` 时实际传输 364 B，
> 不带时 450 B。**比长度前先确认形态**，否则会得出错误结论
> （本次排查中曾因此把 450 与 632 当成两种格式，浪费了几轮）。

## 为什么客户端不能自己造

密文用只有服务器掌握的密钥加密。App 拿到随机数解密后是乱码，判定未订阅。

这不是"还没逆向出来"，是**密码学上做不到**——除非从 App 二进制里提取密钥。

回放也不可行：40 份凭据**无一重复**，且与请求一一对应（16 次请求 = 16 个不同组合）。

## 方案取舍

| | 作者原版 | 本插件 |
|---|---|---|
| 实现 | `[Rewrite] header <url>` | `[Script]` + `$httpClient.fetch` |
| 行数 | 10 行，零脚本 | 清单 3 行 + 脚本 2.4 KB |
| 转发内容 | 隐式（Loon 自动带全部头） | 显式可测 |
| mock 换地址 | 改清单 | 改脚本顶部常量 |

**如果你不打算改 mock 地址，作者原版更简单**（少一跳脚本解释）。
本插件的价值在于转发内容显式、可测、可单独调整。

## 测试

```bash
node test/forward-proxy.test.mjs      # 30 例
node test/manifest.test.mjs           # 46 例
```

覆盖：转发目标、请求体原样透传、头过滤（`accept-encoding` / `content-length` / `host`）、
大小写不敏感、content-type 缺省兜底、成功透传、非 2xx 放行、网络异常放行、
以及「脚本内无任何加解密调用」。

---

## ❌ Forward-Offline（已废弃）

同目录下的 `forward-offline.js` / `Forward-Offline.lpx` 曾试图**在本地伪造凭据**，
v1.0（386 字节）与 v1.1（632 字节）均已实测**失效**。

根因：变化段是有密钥的密文，填随机数必然被 App 判为未订阅。
两次失败都是把「外壳结构对齐」误当成「内容正确」——结构逐字节一致，内容完全不同。

保留这两个文件作为失败记录，避免后人重走。**不要使用。**

---

## 上游与出处

- 上游清单原件逐字节保留在 `upstream-Forward.lpx`，SHA256 见 `upstream-SHA256SUMS`，**未做任何修改**。
- 上游未附许可声明。
- 本插件脚本为独立编写，不含上游任何代码（上游本就没有 JavaScript）。
- 响应结构由黑盒实测得出，未参考任何反编译代码。
- 社区实现参考：`BOBOLAOSHIV587/Rules`（`JS/Forward/`），其信息量最大（第三个独立实现）。
- 官方仓库：`InchStudio/ForwardWidgets`（216 star，`assets.vvebo.vip`），证明密文由官方服务生成。
