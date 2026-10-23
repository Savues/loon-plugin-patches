# Loon 旧版 Script 语法 (官方文档)

## 概览
适用于 Loon 3.5.1 (982) 及之前版本。Loon 3.5.1 (983) 起请使用新版语法。

## 基础格式

### http-request
```
http-request ^https?:\/\/example\.com script-path=request.js,tag=请求脚本,requires-body=true,binary-body-mode=false,timeout=10,argument="name=loon",enable=true
```

参数说明：
- `requires-body` - 是否读取请求 Body
- `binary-body-mode` - 是否以 Uint8Array 读取 Body
- `argument` - 传给脚本的参数，**建议使用双引号**
- `timeout` - 超时时间，默认 10 秒
- `enable` - **直接布尔值** (true/false)

可用对象：
- `$request.url` - 请求 URL
- `$request.method` - 请求方法
- `$request.headers` - 请求 Header 对象
- `$request.body` - String 或 Uint8Array (需 requires-body=true)
- `$request.h2_trailers` - HTTP/2 Trailers (Build 927+)

### http-response
```
http-response ^https?:\/\/example\.com script-path=response.js,tag=响应脚本,requires-body=true,binary-body-mode=false,timeout=10,argument="name=loon",enable=true
```
参数与 http-request 相同。可用对象：
- `$request` - 原请求信息
- `$response.status` - 响应状态码
- `$response.headers` - 响应 Header 对象
- `$response.body` - String 或 Uint8Array (需 requires-body=true)
- `$response.h2_trailers` - HTTP/2 Trailers (Build 927+)

### $done 用法
```javascript
// 不修改请求/响应
$done({});

// 修改请求
$done({ url: "https://new.example.com/", headers: {"X-Loon": "true"}, h2_trailers: {}, node: "HK" });

// 直接返回响应
$done({ response: { status: 200, headers: {"Content-Type": "application/json"}, body: "{}" } });

// 修改响应
$done({ status: 200, headers: {"Content-Type": "application/json"}, h2_trailers: {}, body: "{}" });
```

### cron
```
cron "0 8 * * *" script-path=cron.js,tag=定时任务,timeout=300,argument="1234",enable=true
```
支持两种格式：
- `* * * * *` - 分 时 日 月 周
- `* * * * * *` - 秒 分 时 日 月 周

### network-changed
网络环境变化时执行。如果配置了多条，只执行第一条。
```
network-changed script-path=network-changed.js,tag=网络变化,timeout=300,argument="1234",enable=true
```

### generic
在 App 中手动触发，可将节点、策略组或规则作为上下文传给脚本。
```
generic script-path=generic.js,tag=通用脚本,img-url=location.fill.viewfinder.system,timeout=300,argument="1234",enable=true
```

### 关键点
- `argument` 使用 **双引号字符串** (如 `"name=loon"`)
- `enable` 使用 **直接布尔值** (true/false)
- 支持 `requires-body` / `binary-body-mode` / `timeout` / `argument` / `enable`
- 旧语法用 `^` 表示 URL 正则，正则本身不含 `/.../` 包裹
- 旧语法用 `^` 表示 URL 正则；正则本身不含 `/.../` 包裹
