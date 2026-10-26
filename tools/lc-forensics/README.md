# lc-forensics · Live Container 通用网络取证模块

> iOS 容器化运行器 Live Container 的通用 tweak dylib：hook 容器内**任意 App** 的
> NSURLSession 请求，逐条落盘到各 App 沙盒的 `Documents/forensics.jsonl`。
> 零 App 特定逻辑 —— 装一次，所有 guest App 通用。

## 它能做什么

在 **无 Mac、无越狱** 的环境下（本项目在 iSH / Alpine Linux 交叉编译），
为容器内 App 建立一条独立于抓包工具（Loon MITM / Stream / Charles）的取证通道：

- **请求流**：每个 HTTP(S) 请求的 `method / url / tid / bodyLen` + `seq` 严格连续锚序
  （时钟虚拟化免疫）+ `dup` 重复计数 + `gap` 静默边界（用户操作推断）
- **响应体**：`data` 行（分片字节量 + ASCII 预览）+ **重组落盘**
  `lcf-resp/<tid>-<status>-<type>.bin`（完整原始字节——海报/JSON/HTML 全可还原）
- **请求体**：POST body 落盘 `lcf-req/<tid>-<method>.bin`（广告 SDK 上报内容取证）
- **生命周期**：`fin` 行（state ok/err + HTTP 状态码 + mime + errCode 失败分类）
- **输出形态**：全部写进 App 自己的沙盒（iSH 文件挂载直接读），JSONL 逐行独立，
  可 `rg` / `jq` 直接分析；阶段标记 `stage` 行——模块死在哪一步，磁盘上有证据
- 实战产出示例：豆瓣"每日福利"悬浮窗的图片 URL（`treasury_image` 图床）
  就是从重组文件+requrl 字段三重验证实锤的，直接转化为 Douban-Dedup v2.6.1 的拦截规则

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
lc-forensics-final.c    # 源码（当前版本 v8.9）
lc-forensics-v40-43-iter.c  # v4.0-4.3 迭代史（含被实证排除的枚举/定时器路径）
lc-forensics-minimal.c  # v4.4 二分诊断版（破案功臣，保留作方法学样本）
build.sh                # 一键构建
shim/compat.h           # Alpine musl → darwin 编译垫片
lcf_macho.py            # Mach-O 结构解析器（iSH 无 macho 工具时用）
lc-forensics-v8.9.dylib # 构建产物（可直接 Import）

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
| **v4.7** | `seq` 进程内序号（唯一行序锚点，零系统调用）替代 `up`；`gap` 搬回 `ts` 域并消毒（差值 ∈ (10s,60s] 才可信，跳变忽略） | 豆瓣 248 行，seq 1→248 严格递增 ✅ |
| **v4.8** | lcf-resp 探针并入（独立 dylib 加载层谜题 → 单文件并体）：ctor 后台线程 → 沙盒就绪 → 三类 Task 方法表 introspection → `lcf-resp.jsonl` | 双 App 加载但探针线程零产出 |
| **v6.0-v6.4** | resp/fin/reqbody 元数据 hook（task 内部方法）四轮闪退/黑屏 | didfin 主体=闪退凶手；localizedDescription/allHeaderFields 深求值=雷 |
| **v6.5-v6.8** | 状态码换路线：`task.response` 公开属性（fin 行承载） | **双 App 全绿**，resp 能力达成 |
| **v6.9-v7.0** | 重组 flush 恢复（锁纪律：持锁区只摘槽，IO 锁外）+ take_slot 堆分配 | 18 个重组文件落盘 JSON 可读；豆瓣竞态修复 |
| **v7.1** | 重组键 (tid, taskkey) 双键防串写 + fin errCode | 豆瓣恢复：errCode 全线，-1004×221 证实长连接架构 |
| **v7.2** | POST body 落盘 lcf-req/<tid>-<method>.bin | 200 个 POST 文件；splash_show 明文归因参数全解 |
| **v7.3-v7.5** | seq 原子化（占位+回填）三轮修复：±1 毛刺 → 撞号 → 改造残留 | 677 行 seq 严格连续 1→677 |
| **v8.0** | req/req-delegate 回填补齐（全量核对）| seq 零重复零空耗零遗漏 |
| **v8.1** | +图片通道 hook（双冒号版 didReceiveDispatchData）| S4:3 双通道装上；但分片双记 + 券图仍缺席（URL MD5 无一匹配）|
| **v8.2** | data 行加 src 字段（didd1/didd2 可辨）；重组只在 didd1 追加 | **1:1 双记确认**；重组命中券图 129317B PNG ✅ 但创建请求漏抓 |
| **v8.3** | data 行 +requrl（读 task.currentRequest）| **悬浮窗 URL 实锤**：treasury_image 图床 → Douban-Dedup v2.6.1 规则 |
| **v8.4** | 持锁区去 IO：lc_write_nolock + lc_build_seq_locked（锁内只组装，锁外写）| 小红书仍白屏 → 证明白屏与锁无关（真正变量是「写盘是否发生」）|
| **v8.5** | 彻底异步：环形缓冲 + 后台 flush 线程（hook 线程零 IO）| 小红书仍白屏且只写 1 行 → ctor 卡在 lc_start_flusher() |
| **v8.6** | 弃用 O_APPEND（改 lseek(SEEK_END)）+ flusher 移到 ctor 末尾 | 小红书 1 行 → 4 行（部分有效），仍卡在 hook 安装段 |
| **v8.7** | 每次 open→lseek→write→close（弃用长期 fd，与 lcf-req 同款）| 小红书 6 行（逐步推进）→ 根因收敛为 open() 概率性挂起 |
| **v8.8** | ctor 期绝不 open（lc_stage 只入队）+ flush 线程延迟 2s 首次落盘 | 小红书仍白屏但 0 行 → 排除 ctor 期 IO；三轮对照锁定「外部创建的文件」 |
| **v8.9** | 日志移入自建目录 Documents/lcf/（与 lcf-req/resp 同模式）+ mkdir | 当前版本 |

### 铁律（血泪换来的，动代码前必读）

1. **ObjC getter 返回值绝不 release** —— 不持有就不放，一次都不行
2. **手写自旋锁持锁区禁止调用任何可能 emit/加锁的函数** —— 死锁 = watchdog 击杀
3. **永不引入 objc_getClassList 全类枚举** —— 容器 runtime 有 mssdk 等其他注入者，每个第三方类都是雷
4. **永不引入 dispatch_after 定时器链** —— LC guest 豆瓣环境实证死亡窗口
5. **永不 hook resume** —— 第二安装面，风险无收益
6. 每行带版本号 + 阶段标记同步落盘 —— 版本归属乌龙/取证空白的双保险
7. **不对 hook 回调参数做深属性求值**（localizedDescription / allHeaderFields / UserInfo
   等惰性求值属性）—— LC guest 环境不安全；浅层 selector（statusCode / length / 判空）才可以
8. **CFNetwork task 内部方法（connection:* / _task_*）慎 hook** —— 存在非 msgSend 调用路径，
   C 函数签名不匹配即崩；优先用 task 公开属性（currentRequest / response）
9. **持锁区只调 `*_locked` 变体** —— lc_stage / lc_emit 内部都拿锁，重入即死锁（黑屏型，两次踩坑）
10. **批量改码必须全量核对** —— `rg` 计数关键模式（如 ++g_seq 出现次数应为恒定值），
    改造残留会让真根因被表象掩盖（v7.3-v7.5 三轮教训）

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
