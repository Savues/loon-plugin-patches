# Loon 插件修改合集

个人使用的 Loon 插件修改版合集。**仅收录 .lpx / .plugin 清单层改动，不修改任何上游 JavaScript 逻辑。**

## 收录列表

| 插件 | 说明 | 状态 |
|---|---|---|
| [YouTube-Dedup](plugins/YouTube-Dedup/) | 消除与 blockAds.plugin 的重复改写，收敛 MitM 范围 | 可用 |

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

## 免责声明

- 仅供个人学习和研究使用
- 收录不代表对原插件的推荐或背书
- 若上游作者不愿收录，请提 issue 即下架

## 致谢与许可

本仓库所有修改版均保留原作者署名。未修改上游 JavaScript 任何部分，上游版权与许可条款同样适用。完整声明见 [LICENSE](LICENSE)。
