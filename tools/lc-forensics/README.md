# lc-forensics · Live Container 通用网络取证模块

> iOS 容器化运行器 Live Container 的通用 tweak dylib：hook 容器内**任意 App** 的
> NSURLSession 请求，逐条落盘到各 App 沙盒的 `Documents/forensics.jsonl`。
> 零 App 特定逻辑 —— 装一次，所有 guest App 通用。

## 它能做什么

在 **无 Mac、无越狱** 的环境下（本项目在 iSH / Alpine Linux 交叉编译），
为容器内 App 建立一条独立于抓包工具（Loon MITM / Stream / Charles）的取证通道：

- 记录每个 HTTP(S) 请求的 `method / url / bodyLen / stream` 与返回状态 `ret`
- 直接写进 App 自己的沙盒，读取走文件挂载（iSH 可直接读）
- JSONL 格式，逐行独立，可 `rg` / `jq` 直接分析
- 阶段标记 `stage` 行（S1-ctor / S2-sels / S3-hooked）—— 模块死在哪一步，磁盘上有证据

## 与抓包工具的分工（实测结论）

| 维度 | Loon MITM / HAR | lc-forensics |
|------|----------------|--------------|
| 通道 | MITM 代理 + 证书 | 进程内 hook（无需任何网络配置） |
| 能看到 | 全部明文 HTTP(S) | 仅走 NSURLSession 的请求 |
| 看不到 | 证书锁定、非 HTTP 协议、TCP 长连接业务流 | TCP 长连接、dart:io（Flutter dio）、WKWebView 内部流量 |
| 适用 | 插件规则开发验证 | App 行为取证：谁在什么时刻发了什么请求 |

**重要边界**（豆瓣/JavDB 实测）：很多 App 的业务主流量不走 NSURLSession
（豆瓣业务走 TCP 长连接，JavDB 走 dio/dart:io），本模块抓到的是
**启动链路 + SDK 上报 + 广告联盟 + 部分业务请求**。

豆瓣 v4.5 实测（一次冷启动 + 浏览）：

- **334 行全部合法**，331 条请求全部 `ret:"ok"`
- `req-delegate`（委托版）占 78% —— v4.5 加的第二个 selector 把捕获量拉到 v4.4 的 5 倍
- 内容覆盖：`frodo.douban.com` 主 API 58 条（`feature_switch` / `erebor/feed_ad` /
  `elendil/recommend_feed` 等插件治理目标全在）、erebor 插屏 ×4、
  穿山甲 `pangolin-sdk-toutiao1.com/api/ad/union/sdk/stats/batch/` 批量埋点 **166 条**、
  广点通 17 条、友盟 / 京东 xlog / TRTC license 等启动链路完整

## 目录内容

```
lc-forensics-final.c    # 源码（当前版本 v4.7）
lc-forensics-v40-43-iter.c  # v4.0-4.3 迭代史（含被实证排除的枚举/定时器路径）
lc-forensics-minimal.c  # v4.4 二分诊断版（破案功臣，保留作方法学样本）
build.sh                # 一键构建
shim/compat.h           # Alpine musl → darwin 编译垫片
lcf_macho.py            # Mach-O 结构解析器（iSH 无 macho 工具时用）
lc-forensics-v4.7.dylib # 构建产物（可直接 Import）
CHANGELOG.md            # 详细更新记录（每版：动机/改动/实证/教训）
```

姊妹模块：[../lcf-resp/](../lcf-resp/) —— 响应体捕获（探针阶段，按需安装），
与 base 以 `tid` 拼接请求→响应对。

## 构建（iSH / Alpine aarch64，无需 macOS）

工具链：`clang` (Alpine 15) + `ld64.lld` + `ldid`。

```sh
sh build.sh            # 产出 lc-forensics-vX.Y.dylib + ad-hoc 签名
```

关键编译参数（缺一不可）：

- `--target=arm64-apple-ios15.0.0` —— 必须明确 iOS 平台，`darwin` 目标会被 ld64.lld 拒绝（平台不匹配）
- `-undefined dynamic_lookup` —— 全部 Foundation/ObjC 符号运行时由宿主进程解析（无 SDK 的标准 tweak 做法）
- `-D__WCHAR_TYPE__=unsigned` —— musl 与 darwin 头的 wchar 冲突规避
- 链接校验：外部符号 `n_desc=0xfe00`（`DYNAMIC_LOOKUP_ORDINAL`）= 绑定正确

## 部署（真机）

1. dylib 导入 iOS 文件 App → Live Container → **Tweaks 标签** → `+` Import Tweak
2. LC 自动用自家证书重签（AMFI 只认 LC 信任链，ad-hoc 签名会被拒）
3. **确认 guest App 进程真的重启**（LC 多任务模式下"关闭"只是挂起——用 Restart/强制终止）
4. 冷启动 App，操作几秒后读日志：
   `Live Container/Data/Application/<guest-UUID>/Documents/forensics.jsonl`

## 输出格式

```json
{"ts":1792938830.25,"seq":147,"ev":"req","v":"4.7-seq-anchor","method":"POST",
 "url":"https://api.douban.com/v2/app_ads/splash_show","dup":2,"bodyLen":4509,
 "stream":0,"tid":17,"ret":"ok","cls":"__NSURLSessionLocal","pid":61291}
{"ts":...,"seq":148,"ev":"gap","sec":23.4,...}   ← ts 差∈(10s,60s] 才产；时钟跳变自动忽略
{"ts":...,"seq":1,"ev":"stage","tag":"S3-hooked:2",...}
```

- **`seq` = 行序唯一锚点**：进程内自增序号，零系统调用。【环境事实】LC guest 里
  `CLOCK_MONOTONIC` 也被虚拟化（v4.6 实测 `up` 出现 4 组时钟域），任何系统时钟都不可信——
  AI 分析行序/去重/关联一律以 `seq` 为准
- `tid` = `task.taskIdentifier`，与 `lcf-resp` 模块（响应体捕获，独立按需安装）的 `data` 行以 `tid` 拼接，重建 请求→响应 对
- `ts` 仅作绝对时间参考（会被虚拟化，出现跳变/多域），**不用作行序**
- `dup` = 同 URL 第几次出现（≥2 才写）；批量埋点一眼可辨
- `ret:"NIL"` = 原实现返回 nil（App 拿到空 task，立即值得排查）
- `ev`：`stage` / `req`（completionHandler 版创建）/ `req-delegate`（委托版创建）/ `gap`（消毒后的静默边界）

## 版本史（豆瓣真机二分实证）

| 版本 | 形态 | 结果 |
|------|------|------|
| v2.x | 单 selector swizzle | 能抓，但每启动只 1 条 |
| v4.0 | 14 selector + 全类枚举 + 定时器 | **豆瓣闪退**（getter 返回值误 release） |
| v4.1 | 修 release | 仍闪退（自旋锁不可重入死锁：持锁区调 emit） |
| v4.2 | 修死锁 + 防递归 | 仍闪退（豆瓣 13 个 session 子类 + mssdk 并发，全类改 IMP 高危） |
| v4.3 | 安装面收窄到系统基类 | 仍闪退（死在 ctor+2s 定时回调窗口） |
| **v4.4** | **纯减法二分**：零枚举/零定时器/零 resume，单 selector + 分阶段同步落盘 | **豆瓣稳定，44 条/启动** ✅ |
| **v4.5** | v4.4 安全模式 + 委托版 `dataTaskWithRequest:` | **豆瓣 334 条/会话** ✅ |
| **v4.6** | 纯日志侧增强：`tid` + `up` 单调时钟 + `dup` 计数 + `gap` 行 | 豆瓣 288 行全合法；**发现 CLOCK_MONOTONIC 也被虚拟化（up 出现 4 组时钟域）** |
| **v4.7** | `seq` 进程内序号（唯一行序锚点，零系统调用）替代 `up`；`gap` 搬回 `ts` 域并消毒（差值 ∈ (10s,60s] 才可信，跳变忽略） | 当前版本 |

### 铁律（血泪换来的，动代码前必读）

1. **ObjC getter 返回值绝不 release** —— 不持有就不放，一次都不行
2. **手写自旋锁持锁区禁止调用任何可能 emit/加锁的函数** —— 死锁 = watchdog 击杀
3. **永不引入 objc_getClassList 全类枚举** —— 容器 runtime 有 mssdk 等其他注入者，每个第三方类都是雷
4. **永不引入 dispatch_after 定时器链** —— LC guest 豆瓣环境实证死亡窗口
5. **永不 hook resume** —— 第二安装面，风险无收益
6. 每行带版本号 + 阶段标记同步落盘 —— 版本归属乌龙/取证空白的双保险

## 维护约定

- **模块的每一项改动（源码 / 版本号 / 本 README）都必须 git commit + push 同步到本仓库**，
  与插件变更同标准：改动可追溯、远端即最新。
- **每个版本必须在 CHANGELOG.md 追加详细更新日志**：动机（当时的证据/事故）、
  改动（可验证的具体项）、结果（真机数据或二进制校验）、教训（如有）——
  提交信息标题带版本号与主题，正文引用 CHANGELOG 要点。

## 环境速查

- LC guest 容器路径是**嵌套**的：`LC宿主/Documents/Data/Application/<guest-UUID>`，
  代码里永远 `getenv("HOME")` 实时取，绝不硬编码 `/var/mobile/Containers/...`（不存在，写入静默失败）
- LC 的 Sign 按钮只重签**已有副本**；更新代码必须重新 Import 或覆盖文件
- `ctor` 早期沙盒未就绪，写文件会静默失败 —— 本模块全程同步写 + 实时 HOME，无此问题
