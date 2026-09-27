# Bilibili-UI

Biliverse Enhanced 的界面自定义功能，**真开关版**。

## v2.0.1 · 修复「完全不起作用」

**症状**：v2.0.0 导入后插件完全无效果（标签页、顶栏、底部导航全部不生效）。

**根因**：v2.0.0 的补丁把原版的 `i.set(l,"Home.Top",...)` 改成了**直接赋值** `l.Home.Top = ...`。
当 `l.Home` 不存在时（某些请求路径不会加载默认设置），直接赋值抛
`Cannot set properties of undefined`，而脚本的 4 个 `catch` **全在内部工具**
（protobuf / base64 / 特性检测），**没有一个包住主流程** ——
异常直接冒泡，脚本死掉，响应原样返回。**症状就是「完全不起作用」。**

**修复**：全部改回 `i.get` / `i.set`。`i.set` 内部会安全地创建缺失的中间对象：

```js
// 改前（危险）
l.Home.Top = f.length ? f : (...)

// 改后（安全，与原版同风格）
(()=>{const T=x=>x===!0||x==="true",S=["game_center","mall","messages"],
      f=S.filter(x=>T(i.get(l,"Home.Top_"+x))),
      c=i.get(l,"Home.Top");
  i.set(l,"Home.Top", f.length?f:Array.isArray(c)?c:c?[c]:[]);})(),
```

Node 实测（复刻 `i.get`/`i.set`/`toPath`）：

| 场景 | 结果 |
|---|---|
| `l` 为空对象 | ✅ 不抛异常，四组均为 `[]` |
| 全部开关按默认开启 | ✅ `Tab=[2037,780,545,151]` `Top=[messages]` `Top_more=[categories,search]` `Bottom=[home,dynamic,ogv,mall,messages,mine]` |

> 注：TabTest v0.2.0 用的是同一套补丁且能正常工作，是因为它只匹配 `tab/v2` 一个端点，
> 走的是会加载默认设置的代码路径。v2.0.0 扩展到 5 个端点后触发了没有默认设置的路径。

---

## v2.0.0 · 真开关 + 彻底去 BoxJS

### 做了什么

| 项 | v1.1 | **v2.0** |
|---|---|---|
| 标签页 | 自由输入框 | **8 个真开关** |
| 顶栏右侧 | 自由输入框 | **3 个真开关** |
| 标签栏右侧 | 自由输入框 | **2 个真开关** |
| 底部导航 | 自由输入框 | **8 个真开关** |
| 顶栏左侧头像 | select（本就单选） | select |
| 12 个「提示开关」 | 有 | **删除**（真开关后不再需要） |
| BoxJS / PersistentStore | 支持 | **完全移除** |
| `Storage` 参数 | 暴露三选一 | **删除** |

### 脚本改造

托管 `Enhanced.response.js`（Biliverse 已弃坑，无失同步问题）。
原版 **163842 字符**，现版 **164450 字符**，净增 **608**，**共改 4 处 + 去 BoxJS 4 处**。

#### 1. 参数解析的关键坑（第一版真开关失效的根因）

`a.parse()` 对 object 形式的 `$argument` 走 `i.set`，而 `i.set` 内部 `toPath` **按点号拆路径**：

```
{"Home.Tab_2036": true}  →  { Home: { Tab_2036: true } }     ← 嵌套，不是扁平
```

所以读取必须写 `l?.Home?.["Tab_"+x]`，写成 `l["Home.Tab_"+x]` 永远 `undefined`。
第一版正是这样，8 个开关全部失效、脚本退回内置默认值。

Node 实测：

```
扁平读取 → 命中 0 项
嵌套读取 → 命中 4 项: ['2037','780','545','151']
```

#### 2. 四组取参改造

```js
// 以标签页为例，其余三组同理
(()=>{
  const T = x => x===!0 || x==="true",
        S = ["2036","2037","780","545","774","151","801","2280"],
        f = S.filter(x => T(l?.Home?.["Tab_"+x]));
  l.Home.Tab = f.length ? f
    : Array.isArray(l?.Home?.Tab) ? l.Home.Tab
    : l?.Home?.Tab ? [l.Home.Tab] : [];
  l.Home.Tab = l.Home.Tab.map(String)
})(),
```

**行为**：任一开关为开 → 用开关组合；**全关 → 回退到 `Home.Tab` 输入框**（可填接口下发的其他 id）。

#### 3. 去 BoxJS（4 处）

| 改动 | 作用 |
|---|---|
| `Reflect.has(o.Home,"Tab") && set(l,"Home.Tab",o.Home.Tab)` → 删除 | 不再被 PersistentStore 里的旧数据覆盖 |
| Argument 模式不再 merge store | 配置只来自参数页 |
| 强制 `Storage="Argument"` | 忽略传入的 Storage |
| 移除结尾 Storage 还原 | — |

## 参数（28 个）

### 首页 · 标签页（多选）

| 开关 | 默认 |
|---|---|
| `Home.Tab_2036` 直播 | 关 |
| **`Home.Tab_2037` 推荐** | **开** |
| **`Home.Tab_780` 热门** | **开** |
| **`Home.Tab_545` 番剧** | **开** |
| `Home.Tab_774` 动画（港澳台） | 关 |
| **`Home.Tab_151` 影视** | **开** |
| `Home.Tab_801` 韩综（港澳台） | 关 |
| `Home.Tab_2280` 校园 | 关 |
| `Home.Tab_default` 默认标签页 | select，`2037` |
| `Home.Tab` 备用输入框 | 空（仅在开关全关时生效） |

### 顶栏

| 开关 | 默认 | 备注 |
|---|---|---|
| `Home.Top_left` 左侧头像 | select `mine` | `mine` 我的 / `videoshortcut` 视频快捷；粉色版不可改 |
| **`Home.Top_messages` 消息** | **开** | |
| `Home.Top_game_center` 游戏中心 | 关 | ⚠️ 部分版本可能已下线 |
| `Home.Top_mall` 会员购 | 关 | |

### 标签栏右侧

| 开关 | 默认 |
|---|---|
| **`Home.TopMore_categories` 更多分区** | **开** |
| **`Home.TopMore_search` 搜索** | **开** |

### 底部导航（最多 6 个）

| 开关 | 默认 | 备注 |
|---|---|---|
| **`Home.Bot_home` 首页** | **开** | |
| `Home.Bot_channel` 频道 | 关 | ⚠️ 部分版本可能已下线 |
| **`Home.Bot_dynamic` 动态** | **开** | |
| `Home.Bot_publish` 发布 | 关 | ⚠️ 部分版本可能已下线 |
| **`Home.Bot_ogv` 番剧** | **开** | |
| **`Home.Bot_mall` 会员购** | **开** | |
| **`Home.Bot_messages` 消息** | **开** | |
| **`Home.Bot_mine` 我的** | **开** | |

### 其他

`Home.Switch` 启用自定义 · `Region.Switch` 分区页 · `Mine.Switch` 我的页（**默认关**）·
`Mine.iPad.Switch`（默认关）· `LogLevel` 日志等级

## ⚠️ 两个必知

**1. 「我的」页与 Bilibili-Dedup 冲突**

`Mine.Switch` 默认**关**，因为 `account/mine` 端点被 Dedup 的会员伪装占用。
两脚本同链处理同一响应，顺序不可控。**要用我的页功能，先关掉 Dedup 的 `localVIP`。**

**2. 完整约 60 个标签页**

8 个只是常用项。脚本有这段逻辑：

```js
Reflect.has(storage.Home, "Tab") && set(l, "Home.Tab", storage.Home.Tab)
```

App 内保存的结果**优先于**参数页 —— 所以在**分区页用原生「快捷访问」**配置才会最完整。

## 订阅

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-UI/Bilibili-UI.lpx
```

需开启 **MitM over HTTP/2**。与 [Bilibili-Dedup](../Bilibili-Dedup/Bilibili-Dedup.lpx) 可共存。

## 致谢

上游 Biliverse 已弃坑该脚本，仓库不再分发 Biliverse.Enhanced。
未修改上游逻辑之外的部分，改动均为清单层取参与去 BoxJS。

- **Biliverse** — VirgilClyne, app2smile, Maasea <https://biliverse.github.io/>
- 原始分发：<https://github.com/Biliverse/Enhanced/releases>

## v2.2.0 · 修正 Bottom 键名

**症状**：顶栏开关正常增减，底部导航**看得到默认值但开关无效**，其余功能不可用。

**根因**：`La.replace` 读取底部导航用的键和前三组不一样 ——

```js
i.set(e,"top",     ... i.get(t,"Home.Top") ...)      // 顶栏
i.set(e,"top_more",... i.get(t,"Home.Top_more") ...) // 标签栏
i.set(e,"tab",      ... i.get(t,"Home.Tab") ...)     // 标签页
i.set(e,"bottom",   ... i.get(t,"Bottom") ...)       // 底部 ← 顶层，没有 Home. 前缀
```

补丁写的是 `l.Home.Bottom`，脚本读的是 `l.Bottom` —— **永远读不到，于是回退默认值**。

这也解释了「顶栏能用、底栏不能」：**两组补丁代码完全一样，唯一差别就是键名**。

**修正**：`i.set(l,"Home.Bottom")` → `i.set(l,"Bottom")`，读取同步改为 `i.get(l,"Bottom")`。

四组读写配对现已全部一致：

| 字段 | 读 | 写 |
|---|---|---|
| 顶栏右侧 | `Home.Top` | `Home.Top` ✅ |
| 标签栏右侧 | `Home.Top_more` | `Home.Top_more` ✅ |
| 标签页 | `Home.Tab` | `Home.Tab` ✅ |
| 底部导航 | `Bottom` | `Bottom` ✅ |

## v2.1.0 · 放宽真值判断

原 `T(x)` 只认布尔 `true` 与字符串 `"true"`。若 Loon 以 `1` / `"1"` / `on` / `"ON"` 传递 switch，
全部误判为 false。改为：

```js
T = x => x===!0 || x===1 || x==="true" || x==="1" || x==="on" || x==="ON" || x==="yes"
```
