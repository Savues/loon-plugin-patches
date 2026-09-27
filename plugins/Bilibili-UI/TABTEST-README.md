# 标签页真开关 · 测试版

Biliverse Enhanced 的**首页标签页**功能单点测试。真开关由本仓库托管的改造版脚本支持。

## 为什么要托管脚本

原始脚本只认**一个** `Home.Tab` 值：

```js
set(e,"tab", La.#E(settings.Home.Tab, RegionList, settings.Home.Tab_default))
```

Loon 无法把多个开关的值拼成一个值传给脚本，所以真开关必须改取参逻辑。

**Biliverse 已弃坑该脚本**，不存在与上游失同步的问题 —— 这是托管改造的前提。

## 改了什么

`Enhanced.response.js`，**仅一处**，净增 142 字符（163842 → 163984）：

```js
// 改前
Array.isArray(l?.Home?.Tab) || set(l,"Home.Tab", l?.Home?.Tab ? [l.Home.Tab] : []),
l.Home.Tab = l.Home.Tab.map(String),

// 改后
(()=>{
  const T = x => x===!0 || x==="true",
        S = ["2036","2037","780","545","774","151","801","2280"],
        f = S.filter(x => T(l["Home.Tab_"+x]));
  l.Home.Tab = f.length ? f
            : Array.isArray(l?.Home?.Tab) ? l.Home.Tab
            : l?.Home?.Tab ? [l.Home.Tab] : [];
  l.Home.Tab = l.Home.Tab.map(String)
})(),
```

**行为**：任一开关为开 → 用开关组合；全部为关 → 回退到 `Home.Tab` 输入框。

其余 15 万字符**逐字节未动**，MD5 从 `34f244cba107` 变为 `ce4323b90ce3`。

## 参数

| 参数 | 类型 | 默认 |
|---|---|---|
| `Home.Tab_2036` 直播 | switch | 关 |
| `Home.Tab_2037` 推荐 | switch | **开** |
| `Home.Tab_780` 热门 | switch | **开** |
| `Home.Tab_545` 番剧 | switch | **开** |
| `Home.Tab_774` 动画（港澳台） | switch | 关 |
| `Home.Tab_151` 影视 | switch | **开** |
| `Home.Tab_801` 韩综（港澳台） | switch | 关 |
| `Home.Tab_2280` 校园 | switch | 关 |
| `Home.Tab_default` 默认标签页 | select | `2037` 推荐 |
| `Home.Tab` 备用输入框 | input | 空 |
| `Storage` | select | `Argument` |
| `LogLevel` | select | `WARN` |
| `Home.Switch` | switch | 开 |

默认值与原版一致（推荐/热门/番剧/影视）。

## ⚠️ 一个容易漏的坑

**Loon 只传 `argument=[...]` 里列出的参数。** 8 个标签页开关必须逐个列进 argument，否则到不了脚本，表现为「开关点了没反应」。

## 逻辑验证

| 场景 | 结果 |
|---|---|
| 开关开 2037/780/545/151 | `["2037","780","545","151"]` |
| 开关 2036/545 + 输入框 `2037,780` | `["2036","545"]`（开关优先） |
| 只用输入框 | 回退到输入框值 |
| 开关全关 | `[]` |
| Loon 传字符串 `"true"` | 正确识别为开 |
| 真假混合 | 只取为开的 |

## 局限

8 个只是**常用项**。脚本还支持接口下发的其他 id，走 `Home.Tab` 输入框填写。
完整约 60 项建议在 **B 站 App 分区页用原生「快捷访问」**配置 —— 脚本有这段逻辑：

```js
Reflect.has(storage.Home, "Tab") && set(l,"Home.Tab", storage.Home.Tab)
```

**App 内保存的结果优先于参数页。**

## 订阅

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-UI/TabTest.lpx
```

需开启 **MitM over HTTP/2**。
