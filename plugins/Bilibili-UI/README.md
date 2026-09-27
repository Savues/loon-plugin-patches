# Bilibili-UI

> Biliverse Enhanced 的界面自定义功能，独立成插件。

## 为什么独立成插件

原计划把 Enhanced 合并进 [Bilibili-Dedup](Bilibili-Dedup/Bilibili-Dedup.lpx)，
但 v8 实测**空降助手随之失效**：

| 项 | 验证结果 |
|---|---|
| kokoryh 规则的 `argument` | 逐字相同 |
| 端点覆盖 | v8 还**多** 2 条 |
| 脚本内容 MD5 | 相同 |
| script-path 两种写法 | 返回同一文件 |
| 唯一差异 | `timeout=10` |

**静态分析找不到根因。** 唯一确定的变量是「同一个响应上有第二个脚本参与 body 处理」——
即使端点不重叠，protobuf 重序列化的顺序也不可控。

既然 Enhanced 的 6 个端点里有 **5 个 Dedup 根本不用**，拆成独立插件即可彻底避免同链竞争。

## 端点归属

| 端点 | 功能 | 与 Dedup |
|---|---|---|
| `app.bili*/x/resource/show/tab/v2` | 顶栏 / 标签页 / 底部导航 | ✅ 独占 |
| `app.bili*/x/v2/region/index` | 分区页 | ✅ 独占 |
| `app.bili*/x/v2/channel/region/list` | 分区列表 | ✅ 独占 |
| `grpc\|app.bili*/.../show.v1.Mixture/Region(List\|Shortcut)` | 分区 grpc | ✅ 独占 |
| `app.bili*/x/v2/account/mine(+/ipad)?` | 我的页服务入口 | ❌ **与 Dedup 会员伪装同端点** |

**`account/mine` 由 `Mine.Switch` 默认关闭隔离。**
Dedup 的会员伪装（`vip` / `vip_type`）与本插件的服务列表配置改的是不同字段，
但两个脚本同链处理同一响应，顺序不可控 —— 所以默认不共存。

## 开关（12 个，全部在 Loon 参数页）

```ini
Storage = select,"Argument","PersistentStore","database"
                ^^^^^^^^ 默认
```

设成 `Argument` 后脚本**只读本插件参数页**，不依赖 BoxJS。

| 分组 | 参数 |
|---|---|
| 首页 | `Home.Switch` `Home.Tab` `Home.Tab_default` `Home.Top_left` `Home.Top` `Home.Top_more` |
| 底部 | `Bottom` |
| 分区 | `Region.Switch` |
| 我的 | `Mine.Switch`（默认关） `Mine.iPad.Switch`（默认关） |
| 其他 | `Storage` `LogLevel` |

### 可选值

| 参数 | 可选 |
|---|---|
| `Home.Top_left` | `mine`（我的）/ `videoshortcut`（视频快捷方式） |
| `Home.Top` | `game_center` / `mall` / `messages` |
| `Home.Top_more` | `categories` / `search` |
| `Home.Tab` | `2036`直播 `2037`推荐 `780`热门 `545`番剧 `774`动画 `151`影视 `801`韩综 `2280`校园 |
| `Bottom` | `home` `dynamic` `publish` `ogv` `mall` `messages` `mine`（最多 6 个） |

> 完整约 60 个标签页选项无法在参数页列全，**请在 B 站 App 分区页用原生「快捷访问」配置**。

## 安装

1. 导入本插件
2. 确认 **MitM over HTTP/2** 已开启（本插件 `[MitM] h2 = true`）
3. 重启 Loon
4. 与 [Bilibili-Dedup](Bilibili-Dedup/Bilibili-Dedup.lpx) **可共存**

## 致谢

未修改上游脚本任何逻辑，仅重组规则条目与参数声明。

- **Biliverse** — VirgilClyne, app2smile, Maasea <https://biliverse.github.io/>
- 上游分发：<https://github.com/Biliverse/Enhanced>

## v1.1：顶栏可用项提示开关

### 为什么加「不生效的开关」

顶栏三项目前是**自由输入框**（填 id，如 `messages`），用户必须去翻源码才知道能填什么。
参数里新增 **12 个纯提示开关**，只做说明用，不参与 `argument`，不影响任何功能。

### 机制说明

脚本的判定逻辑是**字符串包含匹配**：

```js
set(e, "top", get(a,"Tab.top")
      .map(x => settings.Home.Top.includes(x.id) ? x : null)
      .filter(Boolean).map((x,i)=>({...x, pos:i+1})))
```

- `Tab.top` 是**接口返回的按钮清单**（不是硬编码的）
- `Home.Top` 是你填的字符串，`.includes()` 做子串匹配
- **真正生效的是输入框**，提示开关只是把可填的 id 列出来

### ⓘ 确认可用的项

| 提示开关 | id | 说明 |
|---|---|---|
| `Top.opt` | `messages` | 顶栏右侧 · 消息（唯一默认开启的） |
| `Top.opt2` | `game_center` | 顶栏右侧 · 游戏中心 |
| `Top.opt3` | `mall` | 顶栏右侧 · 会员购 |
| `More.opt1` | `categories` | 标签栏右侧 · 更多分区 |
| `More.opt2` | `search` | 标签栏右侧 · 搜索 |
| `Left.opt1` | `mine` | 顶栏左侧头像 · 我的 |
| `Left.opt2` | `videoshortcut` | 顶栏左侧头像 · 视频快捷方式（粉色版不可改） |

### ⚠️ 存疑项（代码内置但 BoxJS 未暴露）

| 提示开关 | id | 判断依据 |
|---|---|---|
| `Top.dead1` | `home` | Maasea 的脚本硬编码了 7 个顶栏按钮，但 BoxJS 只暴露 3 个 |
| `Top.dead2` | `channel` | 未暴露的 4 个很可能 B 站接口早已不再下发 |
| `Top.dead3` | `dynamic` | `Tab.top` 来自接口响应，接口不返回就完全无效 |
| `Top.dead4` | `publish` | 填进输入框多半没有反应 |

**这四项标了 ⚠️，但仍可填进 `Home.Top` 试试** —— 取决于你当前 B 站版本是否还下发这些按钮。

### 用法

1. 看提示开关，找到想要的项对应的 **id**
2. 把 id 填进下方 **「顶栏实际生效值」** 输入框，多个用逗号分隔
3. 提示开关本身**不用动**

> 提示开关的 `desc` 里也写了对应 id，方便对照。
