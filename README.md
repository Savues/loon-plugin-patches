# Loon 插件修改合集

个人使用的 Loon 插件修改版合集。**仅收录 .lpx / .plugin 清单层改动，不修改任何上游 JavaScript 逻辑。**

## 收录列表

| 插件 | 说明 | 状态 |
|---|---|---|
| [YouTube-Dedup](plugins/YouTube-Dedup/) | 消除与 blockAds.plugin 的重复改写，收敛 MitM 范围 | 可用 |
| [BlockAds-Patched](plugins/BlockAds-Patched/) | blockAds 打补丁版，自动同步上游，补齐 3 个缺失参数声明 |
| [Bilibili-Dedup](plugins/Bilibili-Dedup/) | 合并 BiliUniverse + kokoryh，与 blockAds 合集去重 | 可用 v2 |

## 收录原则

1. **只改清单层** —— MitM 域名、`[Argument]` 参数、`[Script]` / `[Rewrite]` 规则条目
2. **不改上游逻辑** —— 所有 `script-path=` 远程 JS 保持原样引用
3. **注明依据** —— 每条改动都在插件自己的 README 里写清原因和证据
4. **保留署名** —— 致谢与许可归属完整保留，详见 [LICENSE](LICENSE)

## 订阅更新

```
# Loon 插件地址（示例）
https://raw.githubusercontent.com/<你的用户名>/<仓库名>/main/plugins/YouTube-Dedup/YouTube-Dedup.lpx
```

## 🔄 自动同步

`BlockAds-Patched` 由 GitHub Actions **每 6 小时自动同步上游并重施补丁**：

```
.github/workflows/sync-blockads.yml
```

- 手动触发：Actions 页面 → Sync blockAds → Run workflow
- 可勾选是否同时应用 P002（禁用与 Biliverse Enhanced 冲突的 jq）
- 上游无变化则不提交，避免刷屏
- 补丁失效时**直接报错并终止**，不会推一个坏文件上去

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。
> Actions 推完，Loon 侧最多延迟一天才拿到新版 —— 属正常现象。

---

## 已收录案例

| 案例 | 暴露的问题类型 |
|---|---|
| [YouTube-Dedup](plugins/YouTube-Dedup/) | 合集内置同一份脚本（字节级相同）→ 功能时好时坏；`initplayback` 被无条件 reject |
| [Bilibili-Dedup](plugins/Bilibili-Dedup/) | 参数名大小写不匹配、嵌套开关默认值写反、`[Rewrite]` 误用 Surge 语法、指向脚本未处理的死端点 |

> Bilibili-Dedup 的复盘记录了一个通用教训：
> **引用远程脚本的插件，清单层的参数名、顺序、大小写必须与脚本实际读取的键逐一核对** ——
> 三个缺陷全部无法通过阅读清单文件发现，且都**不报错、只静默失效**。
> 详见该插件 README 第四节「v2 复查」与第五节「怎么发现这些问题的」。

## 免责声明

- 仅供个人学习和研究使用
- 收录不代表对原插件的推荐或背书
- 若上游作者不愿收录，请提 issue 即下架

## 致谢与许可

本仓库所有修改版均保留原作者署名。未修改上游 JavaScript 任何部分，上游版权与许可条款同样适用。完整声明见 [LICENSE](LICENSE)。
