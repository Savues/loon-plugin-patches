# Douban-Dedup · 豆瓣开屏广告屏蔽

> [honue/rules](https://github.com/honue/rules) `Douban.plugin` 的**纯移植**。
> 规则正文与上游**逐字节相同**，不新增任何功能。**v3.0**

| | 中文 | English |
|---|---|---|
| 上游 | [honue/rules](https://github.com/honue/rules) · `Loon/plugin/Douban.plugin` · 480 B | honue/rules, 480 B |
| 改动 | **仅 `#!homepage` 一行**（指向本仓库） | Only the `#!homepage` line |
| 脚本 | 无 | None |
| 文件 | `Douban-Dedup.lpx`（526 B）+ `upstream-honue.plugin`（480 B 原件）+ 测试 | |

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Douban-Dedup/Douban-Dedup.lpx
```

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。拉不到时加随机参数：`?cb=2`

---

## 这个版本做了什么

**把上游的插件搬进本仓库，仅此而已。**

```
#!homepage=https://github.com/honue/rules            ← 上游
#!homepage=https://github.com/Savues/loon-plugin-patches/...  ← 本版
```

`[Rule]` / `[URL Rewrite]` / `[MITM]` 三段**一个字节都没动**，
连上游那两条被注释掉的规则都原样留着。

`test/manifest.test.mjs` 里有 34 项断言，其中一组专门校验这件事：
剥离 `#!` 元信息后，本版正文与 `upstream-honue.plugin` 的
**SHA256 必须完全相同**，且元信息只允许 `homepage` 一行不同。

---

## 上游原版内容

```ini
[Rule]

[URL Rewrite]
^https?:\/\/api\.douban\.com\/v2\/app_ads.+ reject
# ^https?:\/\/api\.douban\.com\/v2\/app_ads\/splash_preload reject
# ^https?:\/\/api\.douban\.com\/v2\/app_ads\/splash_show reject

[MITM]
hostname = api.douban.com
```

上游作者自己写的说明：**「豆瓣开屏广告屏蔽，只能屏蔽开屏，后期还要改 duration」**。

最后那半句是广告存在本地缓存导致的：`splash_preload` 是 POST，
6423 B 表单体里带着 `preload_ads` —— 已缓存的开屏广告对象，
含曝光标记与有效期。网络层拦接口拦不到它。

⚠️ **网络层能做到的是**：让 `app_ads` 接口失败，App 拿不到新的广告配置。
广告对象若已在本地，最坏情况是多停 1–2 秒，而不是完全跳过。

---

## 为什么是纯移植版

前几个版本（v1.0–v2.0）在上游基础上加了：

- 信息流 / 横幅 / 影视页 / 剧集页 / 小组页广告拦截
- 腾讯优量汇 HTTPDNS 旁路拦截
- 开屏素材图规则（需 `img*.doubanio.com` 进 `[MITM]`）
- 自研脚本剥离搜索页预制广告词

结果用户报告：**浏览几个个人主页 / 小组页后无法加载，重启 App 才能恢复。**

我先后把原因归给 `img*.doubanio.com` 和 HTTPDNS 规则，**两次都被真机证伪** ——
移除后照样复现。抓包显示 21 并发时 5–6 张图片瞬时失败（`status=0`），
10 ms 内全部重试成功，豆瓣侧 62 个接口零失败。

**无法证明是插件造成的，但可以确定：上游原版没有这个问题（用户实测），加了功能的版本有。**

所以 v3.0 全部撤掉，只留上游原版。搜索页广告剥离那个脚本也一并移除了
（它需要 `frodo.douban.com` 进 `[MITM]`，会解密豆瓣全部业务 API）。

> 如果之后还想做搜索广告剥离，正确的前置条件是**先解决主页加载问题**，
> 并用对照实验确认因果 —— 而不是继续叠加规则。

---

## 已知限制 · Known limitations

| 限制 | 说明 |
|---|---|
| 只去开屏 | 信息流、横幅、影视页、剧集页、小组页广告都不拦（上游本来就这样） |
| 搜索页广告词 | 不处理。脚本已随 v2.0 移除 |
| 本地缓存的开屏 | 网络层无法清除，最多少停 1–2 秒 |
| 作者的 TODO | 上游 `#!desc` 写着「后期还要改 duration」，尚未实现 |

---

## 卸载 · Uninstall

如果你只是想用原版，也可以直接订阅上游，**不需要本仓库**：

```
https://raw.githubusercontent.com/honue/rules/master/Loon/plugin/Douban.plugin
```

本仓库这个版本唯一的价值是：**规则正文经测试证明与上游逐字节相同**，
以及一份记录了「加了功能之后出了什么问题」的文档。

---

## 文件 · Files

| 文件 | 用途 |
|---|---|
| [Douban-Dedup.lpx](Douban-Dedup.lpx) | 插件清单（526 B，与上游差 1 行 homepage） |
| [upstream-honue.plugin](upstream-honue.plugin) | 上游原件逐字节留存，SHA256 已钉进测试 |
| [test/manifest.test.mjs](test/manifest.test.mjs) | 零差异校验，34 项（`node test/manifest.test.mjs`） |

---

## 致谢 · Credits

- [honue/rules](https://github.com/honue/rules) —— 全部规则内容的作者
