# AntiRevoke · Apple 证书吊销检查屏蔽

> 上游 Salem / [apple-cert-block](https://github.com/salem-2007/apple-cert-block)（Apache-2.0）移植版。
> 17 条域名与上游完全一致 + 分组开关化 + 移除无必要的 `[MITM]`。**v1.1**

| | 中文 | English |
|---|---|---|
| 上游 | Salem，[apple-cert-block](https://github.com/salem-2007/apple-cert-block) | Salem, [apple-cert-block](https://github.com/salem-2007/apple-cert-block) |
| 许可 | Apache-2.0（上游 LICENSE 原文保留在本目录说明中） | Apache-2.0 |
| 改动 | 清单层：7 个分组开关（**未验证**，见下）、移除无必要的 `[MITM]` | Manifest only: 7 group switches (**unverified**, see below), pointless `[MITM]` removed |
| 脚本 | 无（本插件不含任何 JavaScript） | None (no JavaScript at all) |
| 回归测试 | `test/manifest.test.mjs` | `test/manifest.test.mjs` |

---

## 它做什么 · What it does

TLS 握手时，除了验证证书链是否可信，系统还会**主动查询这张证书有没有被吊销**（revocation）：

| 机制 | 含义 |
|---|---|
| **OCSP** | 在线实时查询「这张证书此刻还有效吗」 |
| **CRL** | 下载证书吊销名单（定期更新的一串序列号） |
| **证书验证服务器** | CA 或厂商自己维护的判定接口 |

本插件用 `DOMAIN,xxx,REJECT` 切断这些查询路径。系统拿不到状态，就按「未知」处理，
于是**已被吊销或已过期的证书仍能通过握手**。

> ⚠️ **它不影响 TLS 加密，也不绕过证书链验证。** 链签名对不上的证书照样握手失败。
> 它砍掉的只是「吊销状态」这一步。The chain-of-trust check is untouched; only revocation status lookup is cut.

### 典型用途

- 企业证书、描述文件侧载环境里，系统级证书经常「明明没过期却握手失败」
- 深度 MITM 抓包时，Apple 自己的吊销检查会打断解密
- 证书已被吊销但仍想继续用（比如自签、长期调试用的证书）

---

## ⚠️ 安全影响 · Security impact

**这是一个刻意的降级。** 被吊销的证书通常意味着私钥已泄露，屏蔽查询等于放弃发现这件事的能力。

- 不要在需要防护的场景长期开启
- 仅影响**状态检查**，不影响**加密强度**和**证书链验证**
- 不同 iOS 版本对查询失败的降级策略可能不同

---

## ⚠️ 开关是否真的生效 · Does `enable=` actually work here?

**这一节请务必读完再决定是否依赖开关。**

本插件所有规则都写在 `[Rule]` 段，形如：

```ini
DOMAIN, ocsp.apple.com, REJECT, enable={apple_ocsp}
```

但 `enable=` 在 Loon 里的支持范围**没有官方文档背书**：

| 段 | 官方文档记载 | 状态 |
|---|---|---|
| `[Script]` | `enable={参数}` 有明确示例 | ✅ 确认支持 |
| `[Rewrite]` | 官方给的是 `${参数名}` 引用，**不是** `enable=` | ❌ **实测失效** |
| `[Rule]` | **文档中完全没有**提及参数机制 | ⚠️ **未经验证** |

> 本仓库另一个插件 [PinDuoDuo](https://github.com/Savues/loon-plugin-patches/tree/main/plugins/PinDuoDuo)
> 曾给 20 条 `[Rewrite]` 规则批量挂上 `enable=`。真机实测发现**全部静默失效** ——
> 开关关不掉，规则照常拦截。该插件已于 v1.5 改用 `[Script]` + `argument=` 绕开。

**`[Rewrite]` 与 `[Rule]` 是不同段落，但「文档未记载 + 同类静默失效」的先例已经存在。**
因此本版的 7 个开关属于**未在真机验证**的用法。

### 请这样验证（三步，1 分钟）

1. 装上插件后打开 Loon 参数页，确认 7 个开关**确实渲染出来了**
   （如果连开关都不显示，说明 `[Argument]` 段没被识别）
2. 把 `apple_ocsp` 关掉
3. 看 Loon 日志：访问任意 Apple 服务时，**是否还有 `ocsp.apple.com` 被记录为拦截**

- **第 3 步还能看到拦截** → 开关无效（同 PinDuoDuo 的情况）。
  此时的退路：直接在插件参数页关闭整个插件，或删掉 `AntiRevoke.lpx` 里的对应规则行。
- **看不到拦截** → 开关有效，正常使用。

> 本插件**不含任何脚本**，所以没有 `[Script]` 那条已被验证的退路。
> 这是「纯规则类插件无法可靠做开关」的结构性限制，不是本版的疏忽。

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/AntiRevoke/AntiRevoke.lpx
```

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。拉不到时在地址末尾加随机参数：`?cb=2`
>
> CDN cache may lag up to 24h. Append a random param to force refresh: `?cb=2`

| 文件 | 用途 | Purpose |
|---|---|---|
| [AntiRevoke.lpx](AntiRevoke.lpx) | 插件清单（17 条规则 / 7 个开关） | Plugin manifest |
| [upstream-AntiRevoke.plugin](upstream-AntiRevoke.plugin) | 上游原件，逐字节留存以便对照 | Pristine upstream copy |
| [icon.jpg](icon.jpg) | 图标 | Icon |
| [test/manifest.test.mjs](test/manifest.test.mjs) | 清单层回归测试 | Manifest regression tests |

跑测试：`node test/manifest.test.mjs`

---

## 开关 · Switches

> ⚠️ 下列 7 个开关的 `enable=` 写法**未在真机验证**，请先看上一节。

7 个开关，默认全部开启，**设计上**可在 Loon 插件参数页直接改（不用改文件）：


| 开关 | 覆盖域名 | 作用 |
|---|---|---|
| `apple_ocsp` | `ocsp.apple.com`、`ocsp2.apple.com` | Apple 证书在线状态查询 |
| `apple_valid` | `valid.apple.com` | Apple 证书有效性判定接口 |
| `apple_crl` | `crl.apple.com`、`certs.apple.com` | Apple 证书吊销列表 |
| ⚠️ `app_verify` | `ppq.apple.com`、`ppq-ext.v.aaplimg.com` | **不是吊销端点** —— 侧载 App 验证服务，侧载用户建议关闭 |
| `digicert` | `ocsp.digicert.com`、`ocsp.digicert.cn`、`crl3.digicert.com`、`crl4.digicert.com` | DigiCert |
| `entrust` | `ocsp.entrust.net`、`crl.entrust.net` | Entrust |
| `sectigo` | `ocsp.sectigo.com`、`crl.sectigo.com`、`ocsp.usertrust.com`、`crl.usertrust.com` | Sectigo / USERTrust |

上游是 17 条规则一锅端，没有开关 —— 出问题时**无法只关掉一组**。
本版把每条规则挂到对应开关上，参数页可逐组关闭。

> 📌 顺带一提：上游的 `icon.png` **实际内容是 JPEG**（magic `ffd8ff`）。
> 本仓库按真实格式存为 `icon.jpg`，避免以后有人按扩展名去处理而踩坑。

### 17 条域名逐条核实 · Verification of all 17 domains

移植不能只照搬上游清单。17 条域名分三类核实：

**Apple 证书组（5 条）—— Apple 官方文档直接背书。**
[Use Apple products on enterprise networks](https://support.apple.com/en-us/101555)
把 `certs.apple.com`、`ocsp2.apple.com`、`crl.apple.com`、`valid.apple.com`
列为 Certificate validation；`ocsp.apple.com` 见同一份清单的 OCSP 条目。

**第三方 CA 组（10 条）—— 厂商文档 + 真实证书佐证。**

| 域名 | 证据 |
|---|---|
| `ocsp.digicert.com` / `crl3` / `crl4.digicert.com` | Cisco 官方公告标题即「IP Address Changes for **DigiCert CRL and OCSP Domains**」，正文列出这三者；实际证书内含 `http://crl3.digicert.com/DigiCertGlobalCA.crl` 等 CRL 分发点 |
| `ocsp.digicert.cn` | DigiCert 官方 KB「Certificate Status IP Addresses」收录；DigiCert 自 2020 年起为中国区提供本地化 OCSP 部署 |
| `ocsp.entrust.net` / `crl.entrust.net` | Entrust 官方 OCSP responder 端点 |
| `ocsp.sectigo.com` / `crl.sectigo.com` | Trellix 官方文档在「air-gapped 环境证书链校验失败」一文中明确点名这两个为 CA revocation endpoints |
| `ocsp.usertrust.com` / `crl.usertrust.com` | USERTrust 的 OCSP responder 与 CRL 分发点 |

**App 验证组（2 条）—— 不是吊销端点，但按要求仍然保留。**

| 域名 | 证据 |
|---|---|
| `ppq.apple.com` | Apple 官方文档列为 **Enterprise App validation service** |
| `ppq-ext.v.aaplimg.com` | Apple 的 CDN 重定向目标（社区论坛记录：访问 ppq.apple.com 会被重定向至此） |

> ⚠️ 这两条**不是证书吊销检查端点**，与前 15 条性质不同。
> 按要求保留，但请先读下节的风险提示。

> 17 条里**没有一条是凭猜测添加的**：15 条有厂商/官方文档背书，
> 2 条有 Apple 官方文档定性（虽与本插件目的不同）。上游无域名误植。

---

## 相对上游的改动 · Changes from upstream

| 改动 | 依据 |
|---|---|
| **17 条域名与上游完全一致，无增无删** | 见下节 |
| **删除整个 `[MITM]` 段** | 见下节 |
| 7 个分组开关 | 上游无任何开关（**未验证**，见「开关是否真的生效」） |
| `#!author` 补原作者与改造者 | 保留上游署名 |

### 一、`ppq.apple.com` / `ppq-ext.v.aaplimg.com` 已保留（但请读风险提示）

**17 条域名与上游逐条相同，一条不少、一条不多。**

但这两个域名与其余 15 条**性质不同**，必须单独说明：

> ⚠️ **`ppq.apple.com` 不是证书吊销检查端点，是侧载 App 的验证服务。**
> Apple 官方文档把它列为 **Enterprise App validation service**。
> 2021-06-06 之后加入 Apple Developer Program 的团队，其开发签名与
> Ad Hoc 签名的 App **首次启动时必须完成一次 PPQ 检查**；
> 连不上 PPQ，App 可能直接启动失败。

屏蔽它的后果不是「更抗吊销」，而可能是：

> 装 App 时报 **「Unable to Verify App」** /「需要网络连接才能验证此 App」，
> 侧载的 App 装不上、启动不了。

**如果你的设备需要侧载 App，请优先在参数页关掉 `app_verify` 这一项。**
它被单独拆成一个开关正是为此 —— 其余 15 条（真吊销端点）不受影响。

社区里的 anti-revoke 配置大多**刻意不屏蔽 PPQ**，
iDevice Central 对一份主流配置做拆解时，专门用一节讲
「它没屏蔽 ppq.apple.com 这未必是疏漏，反而降低了破坏 App 初始验证的概率」。
也有社区报告称 PPQ 在较新的 iOS 上参与黑名单的程度比老配置假设的更大 ——
**这是轶事证据，不能与 Apple 官方文档等同。**
两种说法都列在这里，取决于你的用途需要哪一边。

参考：
- [Apple — Use Apple products on enterprise networks（`certs` / `ocsp2` / `crl` / `valid.apple.com` 均列为 Certificate validation）](https://support.apple.com/en-us/101555)
- [Apple Developer Forums — 企业 App 验证与 ppq.apple.com 的证书问题](https://developer.apple.com/forums/thread/738751)
- [iDevice Central — 对 anti-revoke DNS 配置的逐项拆解（含 PPQ 专章）](https://idevicecentral.com/apple/ios-anti-revoke-dns-profile-how-it-works-what-it-blocks-and-how-to-keep-sideloaded-apps-working/)

### 二、`[MITM]` 段已整体移除

上游有：

```ini
[MITM]
hostname = %APPEND% ocsp.apple.com, ocsp2.apple.com, valid.apple.com
```

这三个域名对应的规则是 `REJECT`，而 **`REJECT` 是路由层规则**：

- 规则匹配发生在**解密之前**，Loon 看到 SNI / Host 就能判定并直接拒绝
- 加进 `[MITM]` 不会让 `REJECT` 更早生效，只会让这三个域名**真的走一次 TLS 握手**
- 后果是**净开销**：多一次握手、可能触发证书弹窗，且没有任何功能收益

更关键的是，这些域名**本来就要被拒绝**。让一个注定失败的连接先完成解密，是纯粹的浪费。

> `[MITM]` 在这里是无必要且有害的。`REJECT` 不需要解密域名。
> `[MITM]` forces a pointless TLS handshake for hosts that are about to be rejected anyway.

---

## 上游的注意事项 · Caveats from upstream

> ⚠️ 上游 README 明确要求：**请不要在中国大陆的任何平台传播该项目内容。**
> 本仓库仅作个人技术学习与自用移植，遵循上游该要求，不再另行分发。

上游还提到「不同 iOS/macOS 版本对验证失败的降级策略可能存在差异」，
以及「长期使用可能在某些 Apple 服务中触发备用验证机制」。

---

## 致谢 · Credits

- **原作者**：[Salem](https://github.com/salem-2007/apple-cert-block) —— 全部域名清单与技术思路
- **许可**：Apache License 2.0（上游仓库 LICENSE）
- **改造**：[Savues/loon-plugin-patches](https://github.com/Savues/loon-plugin-patches)

本仓库的贡献仅限于清单层（开关、规则条目、MITM 段），**未修改上游任何业务逻辑**（本插件无脚本）。
上游版权与许可全部适用。
