# iTunes-Spoof · iOS 收据校验回包伪造

把 App 的 iOS 收据校验请求转发到注入服务，回包替换为伪造的高级版凭证。

> ⚠️ 这是绕过付费校验的破解脚本。服务端仍认为你未购买。
> 仅供个人学习研究，请勿用于商业用途。

**🔴 这个插件的运行时依赖无法消除。** 你的收据会离开设备、发到作者的 Cloudflare Worker，
由它生成伪造回包。本仓库做的是**托管 + 修复上游的参数 bug**，不是去依赖。
详见 [「镜像没能消除什么」](#镜像没能消除什么)。

---

## 安装 · Install

订阅地址（Loon → 配置 → 插件 → 右上角 `+` → 粘贴）：

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/iTunes-Spoof/iTunes-Spoof.lpx
```

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。拉不到时在地址末尾加**随机**参数：`?cb=<随机数>`

| 文件 | 用途 | Purpose |
|---|---|---|
| [iTunes-Spoof.lpx](iTunes-Spoof.lpx) | 插件清单 | Plugin manifest |
| [src/itunes-spoof.js](src/itunes-spoof.js) | **实际加载**的脚本（壳层 + 上游） | Script Loon loads |
| [src/prelude.js](src/prelude.js) | 壳层，1.7 KB，本仓库自写 | Our prelude |
| [src/loon-itunes.js](src/loon-itunes.js) | 上游混淆原件，374 KB，逐字节未改 | Upstream, untouched |
| [test/itunes-spoof.test.mjs](test/itunes-spoof.test.mjs) | 主测试，53 个用例，秒级 | Main tests |
| [test/e2e-real-upstream.mjs](test/e2e-real-upstream.mjs) | 与真上游的兼容性验证，**默认不跑** | E2E (manual) |
| [UPSTREAM.md](UPSTREAM.md) | 上游出处、bug 根因、改动逐条依据 | Provenance |

---

## 开关 · Switch

| 参数 | 默认 | 作用 |
|---|---|---|
| **启用转发** | `true` | 填 `true` 转发到注入服务；**填任何其它值即直接放行不转发** |
| **凭证到期日** | `2099-09-09` | 注入凭证会写上这个到期日 |
| **App Store 国家** | `HK` | 查询内购商品用的区，填错可能导致注入的商品在该区不存在 |

> ⚠️ 关闭后 **Loon 仍会解密 `buy.itunes.apple.com`**。`[Mitm]` 段不支持 `enable=`，
> 这是 Loon 的限制。关掉的只是转发。

### `启用转发` 只认小写 `true`

填 `TRUE` / `1` / `yes` / 留空，**一律当关**。

这是刻意收紧的：**宁可误关**（用户会发现没生效），**不可误开**（用户以为关了，
其实还在把收据发给第三方）。

---

## 原生脚本的上游 bug · 已修

上游在参数页放了一个**关不掉的开关**。

**根因**（实测，非推断）：

| | 期望的形状 |
|---|---|
| 上游读的是 | `$argument.Enabled` / `.Expires` / `.Country` —— **驼峰对象** |
| Loon 按 `argument=[{Enabled},{Expires},{Country}]` 传的是 | `"值1,值2,值3"` —— **逗号字符串** |

类型不匹配 → 三个属性读到 `undefined` → 全部落回默认值 → **用户填 `false`，插件照样转发。**

### 本仓库做了什么

在上游运行**之前**插 1.7 KB 壳层：把字符串解析成它期待的对象。
**上游那 374 KB 一个字节没改**（测试第 4 组逐字节校验）。

```
壳层 1.7 KB  +  上游 374259 B  =  合成脚本
剥掉壳层后 == 上游原件（逐字节）
```

### 实测对照

| 参数页填的 | 上游原版 | 本仓库 |
|---|---|---|
| `true,2099-09-09,HK` | 转发，默认值 | 转发，默认值 |
| **`false,...`** | **照样转发** 🔴 | **不转发，`$done({})` 放行** ✅ |
| **`true,2027-01-01,CN`** | 落回默认值 🔴 | **`expires=2027-01-01&country=CN`** ✅ |
| `TRUE,...` | 转发 | 不转发（只认小写） |

---

## 镜像没能消除什么 · 🔴

**收据仍然会离开你的设备。**

上游脚本的全部功能是**透明转发**：

```
你的收据 → reven.lovebabyforever.workers.dev → 伪造回包 → App
```

| | 上游原版 | 本仓库镜像 |
|---|---|---|
| 设备上跑谁家的代码 | 作者站点现取，**随时可换** | 本仓库固定，可 diff、可复现 |
| 站点消失 | 已导入的插件**直接加载失败** | 不受影响 |
| 运行时是否仍联系作者 | 是 | **仍然是** |

> 把 `script-path` 指向本仓库 ≠ 去掉作者域。
>
> 要真正去掉，只能把 Worker 的伪造逻辑也本地重写 —— 那需要先搞清楚它怎么查 App Store
> 的内购商品列表。工作量与风险都比托管大一个量级，且做错会让所有 App 解锁失败。
> 本仓库没做，也不假装做了。

---

## 风险 · Risk

1. **🔴 收据外发**：请求体（Apple 收据凭据）原样送到第三方 Worker。
   本仓库**不改变这一点**。脚本不转发原始请求头（`headers: {}`），但 body 走了。
2. **🔴 运行时依赖**：Worker 不可用时，收据校验全部失败。
3. **MITM 不可关**：关开关不解密，见上。
4. **注入 MITM 到苹果域名**：`buy.itunes.apple.com` 是 Apple 的收据校验服务器。
5. **许可未声明**：上游未声明任何许可条款，使用前请自行确认。

---

## 致谢 · Credits

脚本与清单版权归原作者 [Jsforbaby](https://reven.jsforbaby.workers.dev/reven/iTunes.lpx) 所有。
**上游版权与许可全部适用。**

本仓库的贡献：托管上游脚本与清单、**新增壳层修复上游的参数接线 bug**、
修正清单里 `http-request` → `http-response`。
**上游 374 KB 混淆代码一行未改**，逐条依据见 [UPSTREAM.md](UPSTREAM.md)。
