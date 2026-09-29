# AntiRevoke · Apple 证书吊销检查屏蔽

> 上游 Salem / [apple-cert-block](https://github.com/salem-2007/apple-cert-block)（Apache-2.0）移植版。
> 分组开关化 + 移除两处有害内容。**v1.0**

| | 中文 | English |
|---|---|---|
| 上游 | Salem，[apple-cert-block](https://github.com/salem-2007/apple-cert-block) | Salem, [apple-cert-block](https://github.com/salem-2007/apple-cert-block) |
| 许可 | Apache-2.0（上游 LICENSE 原文保留在本目录说明中） | Apache-2.0 |
| 改动 | 清单层：5 个分组开关、移除 2 个非吊销域名、移除无必要的 `[MITM]` | Manifest only: 5 group switches, 2 non-revocation domains dropped, pointless `[MITM]` removed |
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

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/AntiRevoke/AntiRevoke.lpx
```

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。拉不到时在地址末尾加随机参数：`?cb=2`
>
> CDN cache may lag up to 24h. Append a random param to force refresh: `?cb=2`

| 文件 | 用途 | Purpose |
|---|---|---|
| [AntiRevoke.lpx](AntiRevoke.lpx) | 插件清单（15 条规则 / 6 个开关） | Plugin manifest |
| [upstream-AntiRevoke.plugin](upstream-AntiRevoke.plugin) | 上游原件，逐字节留存以便对照 | Pristine upstream copy |
| [icon.jpg](icon.jpg) | 图标 | Icon |
| [test/manifest.test.mjs](test/manifest.test.mjs) | 清单层回归测试，46 个用例 | Manifest regression tests |

跑测试：`node test/manifest.test.mjs`

---

## 开关 · Switches

5 个开关，全部默认开启，**可在 Loon 插件参数页直接改**（不用改文件）：


| 开关 | 覆盖域名 | 作用 |
|---|---|---|
| `apple_ocsp` | `ocsp.apple.com`、`ocsp2.apple.com` | Apple 证书在线状态查询 |
| `apple_valid` | `valid.apple.com` | Apple 证书有效性判定接口 |
| `apple_crl` | `crl.apple.com`、`certs.apple.com` | Apple 证书吊销列表 |
| `digicert` | `ocsp.digicert.com`、`ocsp.digicert.cn`、`crl3.digicert.com`、`crl4.digicert.com` | DigiCert |
| `entrust` | `ocsp.entrust.net`、`crl.entrust.net` | Entrust |
| `sectigo` | `ocsp.sectigo.com`、`crl.sectigo.com`、`ocsp.usertrust.com`、`crl.usertrust.com` | Sectigo / USERTrust |

上游是 17 条规则一锅端，没有开关 —— 出问题时**无法只关掉一组**。
本版把每条规则挂到对应开关上，参数页可逐组关闭。

> 📌 顺带一提：上游的 `icon.png` **实际内容是 JPEG**（magic `ffd8ff`）。
> 本仓库按真实格式存为 `icon.jpg`，避免以后有人按扩展名去处理而踩坑。

---

## 相对上游的改动 · Changes from upstream

| 改动 | 依据 |
|---|---|
| **删除 `ppq.apple.com`** | 见下节 |
| **删除 `ppq-ext.v.aaplimg.com`** | 见下节 |
| **删除整个 `[MITM]` 段** | 见下节 |
| 5 个分组开关 | 上游无任何开关 |
| `#!author` 补原作者与改造者 | 保留上游署名 |

### 一、`ppq.apple.com` / `ppq-ext.v.aaplimg.com` 已移除

上游 README 把这两个域名和 `ocsp.apple.com` 并列称为「Apple 的验证接口」，放进了同一组规则。
**但它们不是证书吊销检查端点，而是侧载 App 的验证服务。**

Apple 官方文档把 `ppq.apple.com` 列为 **Enterprise App validation service**（企业 App 验证服务）。
2021-06-06 之后加入 Apple Developer Program 的团队，其开发签名与 Ad Hoc 签名的 App
**首次启动时必须完成一次 PPQ 检查**；连不上 PPQ，App 可能直接启动失败。

屏蔽它的后果不是「更抗吊销」，而是：

> 装 App 时报 **「Unable to Verify App」** /「需要网络连接才能验证此 App」，
> 侧载的 App 根本装不上、启动不了。

社区里的 anti-revoke 配置大多**刻意不屏蔽 PPQ**，
常见做法是安装/验证 App 时临时放行，装好后再屏蔽。
把 PPQ 和 OCSP 一起 REJECT 掉的配置，会让用户卡在「无法验证 App」。

iDevice Central 对一份主流 anti-revoke DNS 配置做过拆解，明确把
「该配置没有屏蔽 ppq.apple.com」单列为一个章节，结论是
**这未必是疏漏，反而降低了配置破坏 App 初始验证流程的概率**。
同一份分析还指出：盲目屏蔽「所有 Apple 验证服务器」，
反而会阻止 App 完成首次验证 —— 这正是本仓库移除 PPQ 的依据。

> ⚠️ 反面证据也一并记下：也有社区报告称 PPQ 在较新的 iOS 上
> 参与证书/App 黑名单的程度比老配置假设的更大。
> **这是轶事证据，不能与 Apple 官方文档等同。**
> 如果你的用途确实需要屏蔽 PPQ，自行在 Loon 里加一条规则即可 ——
> 这也正是本版把它从「一锅端 17 条」拆成可分组开关的原因之一。

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
