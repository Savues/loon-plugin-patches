# Forward · 订阅凭据转发（存档与实测记录）

> 上游：[Yu9191 的 Loon 规则](https://t.me/GithubYu9191/174853)，
> 一行 `[Rewrite]` 即可，本仓库**只做存档与实测结论**，不提供更优实现。

**完整出处、实测数据、取舍记录见 [UPSTREAM.md](UPSTREAM.md)。**

---

## 最简可用方案

作者原版，逐字符原样保留在 [upstream-Forward.lpx](upstream-Forward.lpx)：

```ini
[Rewrite]
^https:\/\/fluxapi\.vvebo\.vip\/v1\/(purchase\/iap\/subscription) header https://mock.forward1.workers.dev/forward/v1/$1

[MITM]
hostname = fluxapi.vvebo.vip
```

`header <url>` 是 Loon 的 **URL 类型复写**（不是改 header）——把请求整条转发到作者的 mock 服务器。
**零脚本、零 `script-path`**，因此没有额外的远程依赖。

不想用插件文件的话，在 Loon 的「重写」界面填同一条规则即可：
**类型选「URL 改写」**（不是 307/302 —— 那是直接响应类复写，
由 App 自己去跟随，`X-Auth-Key` 很可能在中途丢掉，而 mock 只认这个头），
再把 `fluxapi.vvebo.vip` 加进「域名解密」。

---

## ⚠️ 硬约束：只支持 App 1.3.13

作者原话：**「最高只支持 1.3.13，其他版本不支持 mitm」**，
并给出降级渠道 <https://assppweb.com/zh-CN/>。

App 一升级，此方案即失效。**这比「服务器可能下线」更值得注意。**

---

## 一句话结论

| | 结论 |
|---|---|
| 凭据能否本地伪造 | **不能**。是有密钥的密文，App 解密校验 |
| 回放是否可行 | **不可行**。40 份凭据无一重复，且与请求一一对应 |
| mock 唯一必需的输入 | **`X-Auth-Key`**。签名/时间戳/Authorization 全都无用，编造的 UUID 也能过 |
| 谁维护着 mock | **Yu9191 个人**（Telegram @GithubYu9191），非 Forward 官方 |

---

## 目录

| 文件 | 用途 |
|---|---|
| [upstream-Forward.lpx](upstream-Forward.lpx) | 上游清单原件（逐字节，SHA256 见 `upstream-SHA256SUMS`） |
| [UPSTREAM.md](UPSTREAM.md) | **出处、实测结论、取舍记录** |
| [Forward-Proxy.lpx](Forward-Proxy.lpx) | 脚本转发版（真机验证通过，但**非必要**） |
| [forward-proxy.js](forward-proxy.js) | 同上脚本 |
| [Forward-Offline.lpx](Forward-Offline.lpx) | ❌ 已废弃：本地伪造，两次均失效 |
| `test/` | 回归测试 |

> `Forward-Proxy` 与作者原版功能等价，但多一个 `script-path` 依赖
> （GitHub raw）。**若只求可用，用原版更省事。**
