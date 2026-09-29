# Reven-Mirror

> 托管版 Reven：脚本收进本仓库，作者改不动你设备上跑的代码。
> Mirrored Reven: the script is hosted here, so the author can no longer swap the code your device runs.

**v1.1** · 2026-09-29

```ini
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Reven-Mirror/Reven-Mirror.lpx
```

拉不到新版时在末尾加随机参数 `?cb=2`（raw CDN 最长缓存 24h）。

---

## ⚠️ 先读这段 · Read This First

托管只解决**一半**问题，如实说明：

| | 上游原版 | 本仓库镜像 |
|---|---|---|
| 设备上跑的代码 | 作者站点现取，随时可换 | 本仓库固定，可 diff |
| 作者站点消失 | 已导入的插件**直接加载失败** | 不受影响 |
| 运行时是否仍联系作者 | 是 | **仍然是** |

上游脚本只做一件事：把被劫持的请求**原样转发**到作者自己的 Cloudflare Worker，
伪造的订阅回包是**服务端生成**的（客户端脚本 98 行里没有任何解锁逻辑）。
所以把 `script-path` 指向本仓库**不会**消除对作者域的运行时依赖 ——
被劫持的请求连 `Authorization` 一起，仍然发给作者的服务器。

要真正断掉这条依赖，只能让脚本在本地生成回包。本仓库不做这件事。

The vendored script is a pure pass-through; the response forging lives in the author's Worker.
Mirroring hardens *what code your device runs*, not *who the traffic goes to*.

---

## 这是什么 · What It Does

上游 Reven 通过劫持三套订阅 SDK 的接口，让 App 认为你已购买：

| SDK | 被劫持的域名 |
|---|---|
| RevenueCat | `api.revenuecat.com` · `api.rc-backup.com` · `rc.visionarytech.ltd` · `revenue.cuto.app` |
| Superwall | `subscriptions-api.superwall.com` |
| Linearity | `proxy.linearity.io` |
| Adapty | `api.adapty.io` |

### 参数 · Arguments

| 参数 | 取值 | 说明 |
|---|---|---|
| `Bypass` | 文本，默认 `-` | 遇到改响应就报错/闪退的 App（如 Filebar），填其 UA 关键词，多个用逗号隔开。`-` = 全部解锁 |
| `Strategy` | `auto` / `lifetime_sub` / `year` / `month` / `all` | 注入策略。`auto` 为官方规范；`lifetime_sub` 兼容老 App 把 lifetime 塞进 subscriptions；`year`/`month` 跳过 lifetime；`all` 注入所有 PID |

> Adapty 需要卸载重装 App 才生效。
> lifetime 解锁失败时优先试 `lifetime_sub`。

### 开关 · Switches（v1.1 新增）

上游**一个开关都没有**——`[Argument]` 里只有两个参数，`[Script]` 规则上也没有 `enable={}`，
装上就是无条件劫持 7 个域名的**全部路径**。v1.1 把那条大规则按 SDK 拆成 4 条，各挂一个开关：

| 开关 | 默认 | 管哪些域名 |
|---|---|---|
| `[RevenueCat]` | **开** | `api.revenuecat.com` · `api.rc-backup.com` · `rc.visionarytech.ltd` · `revenue.cuto.app` |
| `[Superwall]` | **开** | `subscriptions-api.superwall.com` |
| `[Linearity]` | **开** | `proxy.linearity.io` |
| `[Adapty]` | **开** | `api.adapty.io`（需卸载重装 App 才生效） |

全部默认开启，装上行为与上游一致；要停就单独关掉对应 SDK。

> **两个做不到的事，如实说明：**
> 1. **关掉开关不会关掉解密**。Loon 的 `[Mitm]` 段不支持 `enable={}`，
>    7 个域名仍然会被解密，只是不再转发了。要连解密一起停，得改清单里的域名。
> 2. **没有「总开关」**。Loon 官方 `script.md` 只记载了 `enable=true` 和单变量形式，
>    `&&` 组合无据可依，所以不编。要全停就关 4 次。

上游的四条域名一条没动，拆分的等价性由测试第 3/5 组覆盖（并集 == 上游那一条、无重叠、
且脚本内部那份域名正则不比清单窄）。

---

## 文件 · Files

| 文件 | 用途 | Purpose |
|---|---|---|
| `Reven-Mirror.lpx` | 插件清单，订阅这个（v1.1 加了 4 个开关） | Plugin manifest — subscribe to this |
| `src/loon-redirect.js` | 托管的上游脚本，**逐字节未改** | Vendored script, byte-for-byte |
| `upstream-Reven.lpx` | 上游清单原件存档 | Pristine upstream manifest |
| `manifest.json` | 托管文件的 sha256 | Hashes of vendored files |
| `UPSTREAM.md` | 出处、外部资源审计、实测记录 | Provenance, resource audit, measurements |

v1.0 改动只有一处：`[Script]` 里的 `script-path` 指向本仓库。
v1.1 在此之上把 `[Script]` 那条规则按 SDK 拆成 4 条并各挂一个 `enable={}` ——
`[Mitm]` 域名、两个参数、URL 匹配范围、`requires-body` **全部原样**，
托管脚本 `src/loon-redirect.js` **一行未改**。

---

## 校验 · Verify

```bash
# 托管文件是否被动过
python3 tools/vendor-check.py --hash

# 上游有没有出新版本、值不值得跟
python3 tools/vendor-check.py --diff

# 作者站点上的外部资源有没有被静默改动
python3 tools/external-watch.py --check --diff
```

`external-watch.py` 是本仓库为此新增的工具，盯的是 `script-path` 指向的 JS、
插件清单与图标——**基线里不只有这一个插件**，见 [`tools/external-watch.json`](../../tools/external-watch.json)。

---

## 致谢 · Credits

脚本与清单版权归 [Reven](https://reven.jsforbaby.workers.dev/reven/reven.lpx) 作者所有
（`https://t.me/Jsforbaby`），本仓库仅作托管与出处记录，**未修改任何一行上游代码**。
**上游版权与许可全部适用。**
