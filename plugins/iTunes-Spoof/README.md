# iTunes-Spoof · iOS 收据校验回包伪造

把 App 的 iOS 收据校验请求转发到注入服务，回包替换为伪造的高级版凭证。

> ⚠️ 这是绕过付费校验的破解脚本。服务端仍认为你未购买。
> 仅供个人学习研究，请勿用于商业用途。
>
> **本插件 = 上游原版 + 托管，脚本逐字节未改。**
> 曾有两版试图「修」上游的参数接线，结果真机证明那个 bug 不存在，
> 而我的「修复」才是失效的原因 —— 已全部删除。教训见
> [UPSTREAM.md](UPSTREAM.md#我走过的两轮弯路)。

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
| [src/loon-itunes.js](src/loon-itunes.js) | **实际加载**的脚本，374 KB，**逐字节等于上游** | Script Loon loads |
| [test/itunes-spoof.test.mjs](test/itunes-spoof.test.mjs) | 主测试，31 个用例，秒级 | Main tests |
| [test/e2e-real-upstream.mjs](test/e2e-real-upstream.mjs) | 运行时验证，**默认不跑** | E2E (manual) |
| [diag/ArgShape-Diag.lpx](ArgShape-Diag.lpx) | 参数形状诊断插件（真机取证留存） | Diagnostic plugin |
| [UPSTREAM.md](UPSTREAM.md) | 出处、我走过的弯路与证据 | Provenance |

> **本插件的脚本是上游原件，一个字节没改。** 托管只把「设备上跑谁家的代码」固定下来。

---

## 开关 · Switch

| 参数 | 默认 | 作用 |
|---|---|---|
| **启用转发** | `true` | 填 `true` 转发到注入服务 |
| **凭证到期日** | `2099-09-09` | 注入凭证会写上这个到期日 |
| **App Store 国家** | `HK` | 查询内购商品用的区，填错可能导致注入的商品在该区不存在 |

> ⚠️ 关闭后 **Loon 仍会解密 `buy.itunes.apple.com`**。`[Mitm]` 段不支持 `enable=`，
> 这是 Loon 的限制。关掉的只是转发。

### 参数是真的接通的（真机实测）

一度以为开关失效。真机诊断插件回显：

```
TYPE=object
KEYS=["Enabled","Expires","Country"]
K=Enabled TYPE=string VAL="true"
K=Expires TYPE=string VAL="2099-09-09"
K=Country TYPE=string VAL="HK"
```

**Loon 传的 `$argument` 就是对象，键名与上游读取的完全一致。**
上游一直读得到参数 —— 之前「收不到参数」的判断来自 Node 沙盒（沙盒里我传的是字符串），
真机与之相反。那个「修复」把插件弄坏了，已删除。

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

本仓库的贡献：托管上游脚本与清单、**新增壳层修复上游的参数接线 bug**。
**上游 374 KB 混淆代码一行未改**，逐条依据见 [UPSTREAM.md](UPSTREAM.md)。

> v1.0 曾把清单里的 `http-request` 改成 `http-response`，导致插件完全失效（v1.01 已修）。
> 教训见 UPSTREAM.md。
