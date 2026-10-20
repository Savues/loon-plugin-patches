# Bilibili-UI · 小破站界面增强

> 首页标签页与底部导航的自定义，真开关点选。
> Home tab bar and bottom navigation, with real toggle switches.

**v3.2** · 27 参数 / 3 条规则 · 27 parameters, 3 rules · 更新 `2026-10-20`

| | 中文 | English |
|---|---|---|
| 脚本 | 2 个，**由本仓库托管** | 2 scripts, self-hosted |
| 图标 | **自托管** `icon.png` | self-hosted |
| 外部依赖 | **无** —— 所有 URL 指向本仓库 | none |

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-UI/Bilibili-UI.lpx
```

**需开启 MitM over HTTP/2。** Enable MitM over HTTP/2.

---

## ⚠️ 重要：iPad HD 布局限制

**首页标签页、底部导航栏、顶栏按钮在 iPad HD (iPadOS) 上完全无效**。

**根因**：iPad HD 3.71 的首页顶栏/底栏由本地 Swift 类 `TabDisplayConfig` 直接驱动（属性 `homeTabData`/`bottomTabData`），**不读任何网络响应**（`x/resource/show/tab/v2` 已被插件注入但客户端不消费）。Loon 只能改写网络层，因此**彻底无法**在 iPad HD 上实现首页/底栏自定义。

> 同端点 `x/resource/show/tab/v2` 在手机版/国际版（手机布局）上有效。

---

## 功能 · Features

| 功能 | 状态 | 适用布局 | Feature | Status | Layout |
|---|---|---|---|---|---|
| **首页标签页** | ✅ | 手机/国际版 | Home tabs | ✅ | Phone/Intl |
| **底部导航栏** | ✅ | 手机/国际版 | Bottom nav | ✅ | Phone/Intl |
| **我的页服务项** | ✅ **v3.2 新增** | **iPad HD** | Mine sections | ✅ **v3.2 new** | **iPad HD** |
| 顶栏按钮 | ❌ | 全部 | Top buttons | ❌ | All |
| 分区页自定义 | ❌ | 全部 | Region tabs | ❌ | All |

**移除/不可实现原因**
- 顶栏/首页/底栏：iPad HD 走本地 `TabDisplayConfig`，非网络驱动；Loon 无法触达
- 我的页：iPad HD 走 `x/v2/account/mine/ipad` 网络驱动，**可自定义服务项**（投稿区/推荐区/更多区）
- 分区页：自定义标签页保存端点未知（可能 gRPC）

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-UI/Bilibili-UI.lpx
```

**需开启 MitM over HTTP/2。** Enable MitM over HTTP/2.

---

## 参数 · Parameters

### 首页 · 标签页（仅手机/国际版布局）

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `Home.Switch` | switch | **开** | 首页总开关 |
| `Home.Tab_2036` | switch | 关 | 直播 |
| `Home.Tab_2037` | switch | **开** | 推荐 |
| `Home.Tab_780` | switch | 关 | 热门 |
| `Home.Tab_545` | switch | 关 | 番剧 |
| `Home.Tab_774` | switch | **开** | 动画（港澳台） |
| `Home.Tab_151` | switch | 关 | 影视 |
| `Home.Tab_801` | switch | **开** | 韩综（港澳台） |
| `Home.Tab_2280` | switch | 关 | 校园 |
| `Home.Tab_default` | select | `2037` | 默认标签页，需先勾选 |
| `Home.Tab` | input | 空 | 备用输入框，开关全关时兜底 |

### 底部 · 导航栏（仅手机/国际版布局）

| 参数 | 默认 | 说明 | 参数 | 默认 | 说明 |
|---|---|---|---|---|---|
| `Home.Bot_home` | **开** | 首页 | `Home.Bot_ogv` | 关 | 番剧 |
| `Home.Bot_dynamic` | **开** | 动态 | `Home.Bot_mall` | 关 | 会员购 |
| `Home.Bot_mine` | **开** | 我的 | `Home.Bot_messages` | 关 | 消息 |
| `Home.Bot_channel` | 关 | 频道 ⚠️ | | | |

> ⚠️ `channel` / `publish` 部分版本可能已下线。

### 我的页 · 服务项（iPad HD 专用，网络驱动）v3.2 新增

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `Mine.Enable` | switch | **开** | 总开关 |
| `Mine.HideIds` | input | 空 | 隐藏 id（逗号分隔），如 `751,755,763` |
| `Mine.HideTitles` | input | 空 | 隐藏标题（逗号分隔），如 `投稿,我的关注,我的客服` |
| `Mine.Order` | input | 空 | 自定义顺序（id 逗号分隔），如 `751,755,763` |
| `Mine.BlockUpper` | switch | 关 | 隐藏投稿区（`ipad_upper_sections`） |
| `Mine.BlockRecommend` | switch | 关 | 隐藏推荐区（`ipad_recommend_sections`） |
| `Mine.BlockMore` | switch | 关 | 隐藏更多区（`ipad_more_sections`） |
| `Mine.SectionStyle` | select | `0` | 区块样式（需真机验证取值含义） |

**可自定义的区块（字段 → 对应 UI）：**
- `ipad_upper_sections` → 投稿区（投稿/发布等）
- `ipad_recommend_sections` → 推荐区（我的关注/收藏/历史记录等）
- `ipad_more_sections` → 更多区（我的客服/设置/反馈等）

> ⚠️ `ipad_sections`（首页网格服务项：离线缓存/历史记录等）为**死字段**，客户端不读取，修改无效。

### 其他 · Other
`LogLevel` 日志等级 · log level

---

## 实现说明 · Implementation

**两个脚本：**
- `Enhanced.response.js` (166 KB) —— 首页标签页/底栏（改造自 Biliverse response.bundle.js）
- `Enhanced-mine.response.js` (5.5 KB) —— 我的页服务项（全新编写，纯 Loon 原生 API）

**关键技术点：**
- 首页/底栏拦截 `x/resource/show/tab/v2`，参数拼装同 v3.1（IIFE 取参拼数组）
- 我的页拦截 `x/v2/account/mine/ipad`，按 `id`/`title` 双键过滤，支持 `include`/`exclude`/`order` 三模式
- 持久化用 `$persistentStore.write(value, key)`（值在前、键在后）
- iPad HD 自动跳过首页/底栏改写（检测 `bili-hd2` UA 直接 `$done`）

---

## 兼容性 · Compatibility

- 与 [Bilibili-Dedup](../Bilibili-Dedup/) **可共存** —— 端点不重叠
- iPad HD 用户：**首页/底栏不可用，我的页可用**
- 手机/国际版用户：全功能可用

---

## 文件 · Files

```
plugins/Bilibili-UI/
├── Bilibili-UI.lpx
├── Enhanced.response.js           # 首页/底栏（改造自 Biliverse）
├── Enhanced-mine.response.js      # 我的页（全新编写）
├── icon.png                       # 256×256
├── MANIFEST.json                  # 脚本来源记录
└── README.md
```

| 文件 | 说明 |
|---|---|
| `Enhanced.response.js` | 166 KB，改造自 Biliverse `response.bundle.js` |
| `Enhanced-mine.response.js` | 5.5 KB，全新编写，我的页服务项自定义 |
| `icon.png` | Biliverse `icon_rounded.png`，**1024×1024 缩放至 256×256** |
| `MANIFEST.json` | 记录所有脚本的原始 URL、字节数、SHA256、镜像日期 |

---

## 致谢 · Credits

- **Biliverse** — VirgilClyne, app2smile, Maasea <https://biliverse.github.io/>

上游已停止分发该脚本，本仓库为最终版本。
Upstream has discontinued distribution; this is the final build.