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
