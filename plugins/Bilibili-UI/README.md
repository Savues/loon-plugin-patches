# Bilibili-UI 小破站界面增强

> 基于 [Biliverse Enhanced](https://github.com/luestr/ProxyResource) 移植改造，适配 Loon 插件规范

---

## ✨ 功能概览

| 功能 | 支持平台 | 状态 | 说明 |
|------|---------|------|------|
| 首页标签页自定义 | iPhone / 国际版 | ✅ 可用 | 仅手机布局生效 |
| 底部导航栏自定义 | iPhone / 国际版 | ✅ 可用 | 仅手机布局生效 |

> **我的页服务项自定义（iPad HD）已于 v3.6.0 移交 [Bilibili-Dedup](https://github.com/Savues/loon-plugin-patches/tree/main/plugins/Bilibili-Dedup)。**
> 原因：`x/v2/account/mine/ipad` 这一个端点上，Loon 对同一请求**只执行先命中的那一条规则**，
> 两条 `http-response` 规则同时匹配时先到的脚本 `$done` 后整条管线即终止。本插件的规则排在前面时，
> Bilibili-Dedup 的 `vip.js` 完全不会执行 —— 会员伪装与头像角标全部失效（2026-10-20 iPad 抓包实证：
> `data.vip` 原样未改、`data.avatar` 里 0 个 `ICON_LAYER`）。故该功能并入 Dedup，参数名沿用 `MineHideIds`。

---

## 📱 平台差异说明（重要）

### iPad HD（哔哩哔哩 HD 3.71+）
- **首页顶栏/底栏**：**完全本地化**，数据源为 Swift 类 `TabDisplayConfig`（`homeTabData`/`bottomTabData` 硬编码），**不走任何网络端点**，Loon 层面**无法修改**
- **我的页**：走 `x/v2/account/mine/ipad`，**网络驱动**；v3.6.0 起由 Bilibili-Dedup 统一处理（服务项过滤 + 会员伪装 + 头像角标）

### iPhone / 国际版（手机布局）
- 首页顶栏/底栏走 `x/resource/show/tab/v2` 端点，插件原有功能完全生效
- 我的页由 Bilibili-Dedup 处理（`sections_v2`）

---

## 🎛️ iPad HD「我的页」服务项过滤（改由 Bilibili-Dedup 提供）

### 端点
```
x/v2/account/mine/ipad
```

### 响应结构（四大区块）
| 字段 | 说明 | 默认项（ID） |
|------|------|-------------|
| `ipad_upper_sections` | 创作中心区块 | 751 投稿 / 752 创作首页 / 753 稿件管理 / 754 有奖活动 |
| `ipad_recommend_sections` | 推荐服务区块 | 755 我的关注 / 756 我的消息 / 757 我的钱包 / 758 直播中心 / 759 大会员 / 2541 我的游戏 / 760 我的课程 |
| `ipad_more_sections` | 更多服务区块 | 763 我的客服 / 764 设置 / 965 青少年守护 |
| `ipad_sections` | 常用功能区块 | 747 离线缓存 / 748 历史记录 / 749 我的收藏 / 750 稍后再看 |

### 配置参数（在 Bilibili-Dedup 插件里）

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `MineHideIds` | `input` | `751,752,753,754,755,756,757,758,759,760,763,965,2541,750,747` | 逗号分隔的 ID 列表，匹配项将被隐藏 |

**默认效果**：仅保留 **历史记录(748)**、**我的收藏(749)**、**设置(764)** 三项

### 自定义示例

```
# 仅隐藏“投稿”和“我的关注”
MineHideIds = 751,755

# 隐藏整个“创作中心”区块
MineHideIds = 751,752,753,754

# 全部显示（清空）
MineHideIds =
```

---

## 🔧 安装与配置

### 1. 安装插件
Loon → 配置 → 插件 → 添加 → 粘贴以下链接：
```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-UI/Bilibili-UI.lpx
```

### 2. 启用 MitM
确保 Loon 已配置 MitM 并信任证书：
- **Hostname**：`app.bilibili.com`
- **开启 HTTP/2**：`h2 = true`

### 3. 配置参数
插件安装后在 Loon 参数面板中调整：
- **首页标签页/底栏**：仅手机布局有效
- **我的页服务项**：iPad HD 专用，请到 Bilibili-Dedup 修改 `MineHideIds`
- **日志等级**：调试用，默认 `WARN`

---

## 📝 更新日志

### v3.6.0 (2026-10-20)
- **移除**：`mine/ipad` 规则与 `MineHideIds` 参数（与 Bilibili-Dedup 争抢同一端点，导致后者的会员伪装/头像角标完全不执行）
- 我的页服务项过滤功能已并入 Bilibili-Dedup `vip.js`，参数名与默认值不变

### v3.5.1 (2026-10-20)
- **新增**：iPad HD「我的页」服务项自定义（`MineHideIds`）
- **修复**：脚本语法错误（重复声明导致静默失败）
- **修正**：默认值覆盖所有已知 ID，默认仅保留 748/749/764
- **文档**：明确平台差异，iPad HD 首页顶栏/底栏不可改

### v3.3.x
- 修复 `mine/ipad` 与主脚本冲突
- 参数名去点号兼容
- MitM hostname 精确匹配

---

## ⚠️ 已知限制

1. **iPad HD 首页顶栏/底栏无法修改** — 客户端本地 Swift 类 `TabDisplayConfig` 硬编码，需越狱/TrollStore hook
2. **Section 标题（常用功能/更多服务等）为客户端硬编码** — 无法单独隐藏标题，只能通过清空对应数组间接隐藏
3. **需完全关闭 App 重启** — 修改参数后需杀进程重启 B 站才能生效

---

## 🔗 相关资源

- **插件源码**：[plugins/Bilibili-UI/](https://github.com/Savues/loon-plugin-patches/tree/main/plugins/Bilibili-UI)
- **上游项目**：[Biliverse Enhanced](https://github.com/luestr/ProxyResource)
- **我的页/会员伪装**：[plugins/Bilibili-Dedup/](https://github.com/Savues/loon-plugin-patches/tree/main/plugins/Bilibili-Dedup)

---

## 📄 许可证

原作者：VirgilClyne, app2smile, Maasea (Biliverse)
改造维护：Savues
遵循上游仓库许可证
