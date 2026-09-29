# Forward · 订阅解锁

> 上游原版规则，逐字沿用。零脚本、零 `script-path`。
> 出处：[Yu9191 的 Loon 规则](https://t.me/GithubYu9191/174853) · 完整记录见 [UPSTREAM.md](UPSTREAM.md)

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Forward/Forward.lpx
```

> ⚠️ 拉不到时加随机参数破 CDN 缓存：`?cb=2`
> ⚠️ 拉取 `raw.githubusercontent.com` 的 CDN 缓存最长 24h

## 它做什么

```ini
[Rewrite]
^https:\/\/fluxapi\.vvebo\.vip\/v1\/(purchase\/iap\/subscription) header https://mock.forward1.workers.dev/forward/v1/$1
[MITM]
hostname = fluxapi.vvebo.vip
```

`header <url>` 是 Loon 的 **URL 类型复写**（不是改 header）——
把 App 的订阅查询请求整条转发到作者的 mock 服务器，由它返回凭据。
密钥在服务器侧，客户端不做任何加解密。

**没有 `[Script]` 段。** 因此没有 `script-path`，也就没有额外的远程依赖。

## ⚠️ 硬约束：只支持 App 1.3.13

上游原话：**「最高只支持1.3.13，其他版本不支持mitm」**，
降级渠道 <https://assppweb.com/zh-CN/>。

App 一升级，此方案即失效。**这比「mock 服务器可能下线」更值得注意。**

## 不想用插件文件

Loon 的「重写」界面填同一条规则，再把 `fluxapi.vvebo.vip` 加进「域名解密」即可。

**类型选「URL 改写」** —— 不是 307/302。307 属「直接响应类复写」，
由 App 自己去跟随，`X-Auth-Key` 很可能在中途丢失，而 mock 只认这个头。

## 目录

| 文件 | 说明 |
|---|---|
| [Forward.lpx](Forward.lpx) | 插件清单（上游规则 + 补 author/date） |
| [upstream-Forward.lpx](upstream-Forward.lpx) | **逐字节原件**，SHA256 见 `upstream-SHA256SUMS` |
| [UPSTREAM.md](UPSTREAM.md) | 出处、实测结论、密钥逆向判定 |
| `samples/` | 响应采样（取证用，非插件运行所需） |

## 本仓库的贡献

**只有清单层**：
- 另存 `Forward.lpx`，补 `#!author` / `#!date`，并把 `#!desc` 写清楚
- 逐字保留上游原件作取证底本
- 记录出处、实测结论与逆向判定（见 `UPSTREAM.md`）

**规则本身一字未改。** 本仓库曾尝试用脚本显式转发（`Forward-Proxy`），
功能等价但多一个 `script-path` 依赖，**已删除**。
