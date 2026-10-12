# Bilibili-UI · 哔哩哔哩界面增强

> 首页标签页与底部导航的自定义，真开关点选。
> Home tab bar and bottom navigation, with real toggle switches.

**v3.1** · 20 参数 / 1 条规则 · 20 parameters, 1 rule

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-UI/Bilibili-UI.lpx
```

**需开启 MitM over HTTP/2。** Enable MitM over HTTP/2.

---

## 功能 · Features

| 功能 | 状态 | Feature | Status |
|---|---|---|---|
| **首页标签页** | ✅ 8 个开关 | Home tabs | ✅ 8 switches |
| **底部导航栏** | ✅ 8 个开关 | Bottom nav | ✅ 8 switches |
| 顶栏左侧头像 | ❌ 移除 | Top-left avatar | ❌ removed |
| 顶栏右侧按钮 | ❌ 移除 | Top-right buttons | ❌ removed |
| 标签栏右侧 | ❌ 未实测 | Tab-bar right | ❌ untested |
| 分区页 / 我的页 | ❌ 移除 | Region / Mine | ❌ removed |

**移除原因**
- 顶栏右侧：B 站接口只下发「消息」一个按钮，可配项无意义
- 我的页：与 Dedup 的会员伪装同端点
- 头像：改它需改上游业务逻辑，超出「只改清单层」边界

---

## 参数 · Parameters

### 首页 · 标签页

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

### 底部 · 导航栏

| 参数 | 默认 | 说明 | 参数 | 默认 | 说明 |
|---|---|---|---|---|---|
| `Home.Bot_home` | **开** | 首页 | `Home.Bot_ogv` | 关 | 番剧 |
| `Home.Bot_dynamic` | **开** | 动态 | `Home.Bot_mall` | 关 | 会员购 |
| `Home.Bot_mine` | **开** | 我的 | `Home.Bot_messages` | 关 | 消息 |
| `Home.Bot_channel` | 关 | 频道 ⚠️ | | | |

> ⚠️ `channel` / `publish` 部分版本可能已下线。

### 其他 · Other
`LogLevel` 日志等级 · log level

---

## 完整标签页 · Full tab list

8 个只是常用项。分区页原生「快捷访问」有近 **60 个**：

```js
if (Reflect.has(storage.Home, "Tab")) set(l, "Home.Tab", storage.Home.Tab)
```

**App 内保存的结果优先于参数页** —— 想用完整的 60 项，去 App 分区页用原生「快捷访问」配置。
App-side config takes precedence over these parameters.

---

## 实现说明 · Implementation

本插件托管改造过的 `response.bundle.js`（原版 163842 → 改造后 163993 字符）。

上游只接受**单个字符串**作为设置，而 Loon 无法把多个开关拼成一个值传入：

```js
(()=>{
  const T=x=>x===!0||x===1||x==="true"||x==="1"||x==="on"||x==="ON"||x==="yes",
        S=["2036","2037","780","545","774","151","801","2280"],
        f=S.filter(x=>T(i.get(l,"Home.Tab_"+x)));
  const c=i.get(l,"Home.Tab");
  i.set(l,"Home.Tab", f.length?f:Array.isArray(c)?c:c?[c]:[]);
})(),
```

| 改造点 | 说明 |
|---|---|
| 两处取参 | 标签页 / 底栏各一组 IIFE |
| **键名不统一** | `Home.Tab` 带前缀，**`Bottom` 是顶层键** — 写成 `Home.Bottom` 会静默失效 |
| 嵌套读取 | `i.get(l,["Home","Tab_"+x])`，参数经 `toPath` 拆路径后是**嵌套**结构 |
| 去 BoxJS | 4 处，配置只读 Loon 参数页 |

---

## 兼容性 · Compatibility

与 [Bilibili-Dedup](../Bilibili-Dedup/) **可共存** —— 端点不重叠（本插件只碰 `x/resource/show/tab/v2`）。
blockAds 需使用**退场版**。

---

## 致谢 · Credits

- **Biliverse** — VirgilClyne, app2smile, Maasea <https://biliverse.github.io/>

上游已停止分发该脚本，本仓库为最终版本。
Upstream has discontinued distribution; this is the final build.
