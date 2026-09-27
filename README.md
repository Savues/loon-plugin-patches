# Loon 插件修改合集

个人使用的 Loon 插件修改版合集。

**修改范围以「清单层」为主** —— MitM 域名、`[Argument]` 参数、`[Script]` / `[Rewrite]` 规则条目。
个别插件（见下）额外托管了一份改造过的上游脚本，其改动**同样仅限于取参与去远程配置依赖**，不触碰业务逻辑。

---

## 收录列表

| 插件 | 用途 | 状态 |
|---|---|---|
| [Bilibili-Dedup](plugins/Bilibili-Dedup/) | B 站去广告 + 漫画净化 + 本地会员（5 主题可切） | **v7.9** |
| [Bilibili-UI](plugins/Bilibili-UI/) | B 站首页标签页 / 底部导航真开关 | **v3.1** |
| [YouTube-Dedup](plugins/YouTube-Dedup/) | 消除与 blockAds 的重复改写，收敛 MitM 范围 | 可用 |
| [BlockAds-Patched](plugins/BlockAds-Patched/) | 合集 B 站部分整体退场，Actions 自动同步 | 可用 |

### 唯一托管改造脚本的插件

[Bilibili-UI](plugins/Bilibili-UI/Bilibili-UI.lpx) —— 上游 Enhanced 的脚本只接受**单个字符串**作为设置，
而 Loon 无法把多个开关拼成一个值传入，因此要实现真开关必须改取参逻辑。

改动仅两处 IIFE + 四处去 BoxJS，**业务逻辑（界面重建、protobuf 编解码）逐字节未动**。

---

## 收录原则

1. **优先只改清单层** —— 能不改脚本就不改
2. **确需改脚本时**，改动限于取参逻辑与远程配置依赖，保留完整原始注释说明
3. **注明依据** —— 每条改动在插件 README 里写清原因和证据
4. **保留署名** —— 上游作者与许可归属完整保留，见 [LICENSE](LICENSE)
5. **记录踩坑** —— 走过的弯路写进 [BILIBILI-ITERATION.md](BILIBILI-ITERATION.md)，不留在插件 README 里

---

## 🔄 自动同步

`BlockAds-Patched` 由 GitHub Actions **每 6 小时同步上游并重施退场补丁**：
[`.github/workflows/sync-blockads.yml`](.github/workflows/sync-blockads.yml)

| 特性 | 说明 |
|---|---|
| 无变化 | 不提交，避免刷屏 |
| 退场不完整 | **报错终止**，不推送坏产物 |
| 手动触发 | Actions → Sync blockAds → Run workflow |

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h，
> Actions 推送后 Loon 侧最多延迟一天。拉不到新版时在订阅地址末尾加随机参数（如 `?cb=2`）。

---

## 📖 开发记录

- [B 站去广告 · 版本迭代全记录](BILIBILI-ITERATION.md) —— 每个版本改了什么、为什么错、怎么发现的
- [patches/README.md](patches/README.md) —— blockAds 退场范围与判定依据

---

## 免责声明

- 仅供个人学习研究
- 收录不代表对原插件的推荐或背书
- 若上游作者不愿收录，请提 issue 即下架

上游版权与许可全部适用。
