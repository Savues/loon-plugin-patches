# Loon 新版 Script 语法 v2 (官方文档)

## 概览
Loon 3.5.1 (983) 起支持的新版 Script 语法，统一了 Request、Response、Cron、Network Changed 和 Generic Script 的配置格式。

## 语法格式

### 统一格式
```
request if <condition> then script("path" [, <argument>]) [with <options>]
response if <condition> then script("path" [, <argument>]) [with <options>]
cron <cron-expression> then script("path" [, <argument>]) [with <options>]
network-changed then script("path" [, <argument>]) [with <options>]
generic then script("path" [, <argument>]) [with <options>]
```

### script() Action
```javascript
script("path" [, <argument>])
```
- 第一个参数：脚本路径 (本地/相对/远程 URL)
- 第二个参数可选：传给脚本的 `$argument`

### with 指令
```javascript
with enable=true, tag="name", timeout=20, requires_body=true
```

### $argument 参数
| 配置 | 类型 |
|------|------|
| 省略 | null |
| 字符串 | String |
| Raw String (反引号) | String (字面量) |
| 插件对象参数 | Object |

插件对象参数：`{${region}, ${level}}` - 只能引用当前插件 [Argument] 声明的参数

### with 指令支持字段
| 字段 | 类型 | 默认值 | 适用 |
|------|------|--------|------|
| enable | Boolean / 插件 Boolean | true | 全部 |
| tag | String | 从脚本路径派生 | 全部 |
| img_url | String | 无 | 全部 |
| timeout | Number/插件 Number/可解析数字字符串 | Request/Response 20，其他 300 | 全部 |
| debug | Boolean/插件 Boolean | false | 全部 |
| requires_body | Boolean | false | Request/Response |
| binary_body_mode | Boolean | false | Request/Response |

### 动态 Option 缺值回退
| 字段 | 无值时默认 |
|------|-----------|
| enable=${name} | true |
| timeout=${name} | Request/Response 20，其他 300 |
| debug=${name} | false |

### 条件表达式
操作符：`==` `~=` `&&` `||` `()` 
优先级：比较 > && > ||

### Response URL Guard
每条 Response Script 必须包含 URL Guard。

### 关键变量
| 变量 | 类型 | Request | Response |
|------|------|---------|----------|
| ${url} | String | ✓ | ✓ |
| ${request.method} | String | ✓ | ✓ |
| ${request.header['name']} | String/null | ✓ | ✓ |
| ${response.status} | Number | - | ✓ |
| ${response.header['name']} | String/null | - | ✓ |

### 关键限制
- Script 条件不能绕过 Rewrite 已确定的禁用结果
- Rewrite 与 Script 执行顺序有严格限制
- 插件 Script 只能引用自己 [Argument] 声明的参数
- 不支持正则 as 命名捕获
