# Bilibili-UI

首页标签页与底部导航的自定义，真开关点选。

**当前版本：v3.1** · 20 参数 / 1 条规则

> 📖 版本演进与踩坑复盘见 [BILIBILI-ITERATION.md](../../BILIBILI-ITERATION.md)
> 本文只描述**当前状态**。

---

## 订阅

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-UI/Bilibili-UI.lpx
```

**需要开启 MitM over HTTP/2。**

---

## 功能

| 功能 | 状态 |
|---|---|
| **首页标签页** | ✅ 8 个开关增删，即时生效 |
| **底部导航栏** | ✅ 8 个开关，最多 6 个 |
| 顶栏左侧头像 | ❌ 移除（需改上游脚本，超出「只改清单层」边界） |
| 顶栏右侧按钮 | ❌ 移除（B 站接口只下发「消息」一个，可配项无意义） |
| 标签栏右侧 | ❌ 未实测 |
| 分区页 / 我的页 | ❌ 移除（我的页与 Dedup 会员伪装同端点） |

---

## 参数（20 个）

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
| `Home.Tab_default` | select | `2037` 推荐 | 默认标签页，需先在上方勾选 |
| `Home.Tab` | input | 空 | 备用输入框，开关全关时兜底，可填接口下发的其他 id |

### 底部 · 导航栏

| 参数 | 默认 | 说明 |
|---|---|---|
| `Home.Bot_home` | **开** | 首页 |
| `Home.Bot_dynamic` | **开** | 动态 |
| `Home.Bot_mine` | **开** | 我的 |
| `Home.Bot_channel` | 关 | 频道 ⚠️ 部分版本可能已下线 |
| `Home.Bot_publish` | 关 | 发布 ⚠️ 同上 |
| `Home.Bot_ogv` | 关 | 番剧 |
| `Home.Bot_mall` | 关 | 会员购 |
| `Home.Bot_messages` | 关 | 消息 |

### 其他

`LogLevel` 日志等级。

---

## 完整标签页（60 项）

8 个只是常用项。B 站分区页的原生「快捷访问」有接近 **60 个**选项，且脚本中：

```js
if (Reflect.has(storage.Home, "Tab")) set(l, "Home.Tab", storage.Home.Tab)
```

**App 内保存的结果优先于参数页。** 想用完整的 60 项，去 App 分区页用原生「快捷访问」配置。

---

## 实现说明

本插件托管了一份改造过的 `response.bundle.js`（原版 163842 字符 → 改造后 163993）。

原版只认**单个字符串**，Loon 无法把多个开关拼成一个值传入，因此真开关必须改取参逻辑：

```js
// 标签页
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
| **两处取参** | 标签页 / 底栏各一组 IIFE |
| **键名不统一** | `Home.Tab` 带前缀，**`Bottom` 是顶层键** —— 写成 `Home.Bottom` 会静默失效 |
| **嵌套读取** | `i.get(l,["Home","Tab_"+x])`，参数经 `toPath` 拆路径后是**嵌套**结构 |
| **去 BoxJS** | 4 处，配置只读 Loon 参数页 |

---

## 兼容性

与 [Bilibili-Dedup](../Bilibili-Dedup/README.md) **可共存** —— 两者改写的端点不重叠
（本插件只碰 `x/resource/show/tab/v2`）。

blockAds 需使用**退场版**，否则 `show/tab/v2` 会被重复改写。

---

## 致谢

未修改上游脚本逻辑之外的部分，改动仅为清单层取参与去 BoxJS。

- **Biliverse** — VirgilClyne, app2smile, Maasea <https://biliverse.github.io/>

上游已停止分发该脚本（弃坑），本仓库为最终版本。
