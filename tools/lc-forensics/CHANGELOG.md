# 更新记录 · lc-forensics

每个版本的**动机 / 改动 / 实证 / 教训**全记录。当前版本见 [README.md](README.md) 版本史表。

格式约定：每版必含——**为什么改**（当时的证据/事故）、**改了什么**（可验证的具体项）、
**结果**（真机数据或二进制校验）、**代价/教训**（如有）。二进制校验项 = 用 lcf_macho.py /
nm 级符号检查可复现的客观事实。

---

## [6.2] - 2026-10-26 · diag-enter

### 动机：v6.1 双 App 仍闪退——且分流证据变了

- 豆瓣：ctor 九行全落，零 req（同 v6.0）
- **JavDB：1 条 req 成功落盘后死**——req→resp/data/fin 之间的触发链有凶手
- 静态审查到头：`isKindOfClass` 判别（v6.1）、error 判 nil、realloc 守卫
  全部在位，纯 C 下无更多可静态排除的崩溃点（objc_msgSend 崩溃无法 catch）

### 改动（诊断，不改功能）

三个新 hook（didresp / didfin / reasm-append）各加**前 3 次入口/幸存标记**
（走 base 文件通道）：`diag-resp-enter` → `diag-resp-survived` 等六种。
崩溃瞬间 base 日志停在哪个标记上，凶手即锁定。

### 判读表

| base 日志最后标记 | 凶手 |
|------|------|
| `diag-resp-enter`（无 survived） | lcf_resp_line 内（encjson/msgSend 段）|
| `diag-fin-enter` | didfin_hook 内 |
| `diag-reasm-enter` | 重组追加（dispatch API/realloc）|
| 全 survived 且有 resp/fin 行 | 崩在更后面（排除法重排）|

### 实证（待真机）

86608B，md5 `c56c3b35`。

---

## [6.1] - 2026-10-26 · httpcheck

### 动机：v6.0 闪退——ctor 全过，死在第一个响应触发时

闪退取证（pid 62124）：`S1→S5-meta-hooked:2→resp-file-ok→probe-done` 九行
ctor 期全落盘，**零 req/resp/data 行** = 崩在新 hook 的第一次触发。
根因：`_onqueue_didReceiveResponse:completion:` 的 `response` 参数是
**NSURLResponse 通用型**——非 HTTP 响应（file:// 等）时对它发
`statusCode` → `doesNotRecognizeSelector` → 崩。

### 改动

- `lcf_resp_line` 入口加 `isKindOfClass:`（NSHTTPURLResponse）判别，
  非 HTTP 响应静默跳过（line 置空）
- `didresp_hook` 仅在 line 非空时写盘
- 判别用的 `objc_msgSend` 以 char 返回签名调用（BOOL 走寄存器低位，正确）

### 实证（待真机）

86432B（比 v6.0 大——isKindOfClass 路径新增），md5 `55f36e00`。

### 教训

hook 系统回调的参数类型是**声明的宽类型**（NSURLResponse），
HTTP 专属 selector 发送前必须运行时判别——与"ObjC getter 不 release"
同级的铁律候选。

---

## [6.0] - 2026-10-26 · har-parity

### 动机：对标 Loon HAR 的字段能力

用户提供 Loon 抓包 HAR（豆瓣，Douban-Dedup 开启态）作为对标物。逐字段判定：
HAR 有的（status/headers/mime/完整 body/redirect/cookies）模块全部可达；
另有 4 项天然超越（长连接业务流可见 / dart:io 部分可见 / 证书锁定 App 抓取 /
零网络配置 + seq 锚序）。用户裁决：重组配额不做——模块仅测试时启用。

### 改动

- **+resp 行**（对标 `response.*`）：hook `_onqueue_didReceiveResponse:completion:`
  （探针名单 ◆），产 `{tid, status, mime, enc}`——`enc` 取 Content-Encoding，
  gzip/br 分片的 preview 可判定为压缩体
- **+fin 行**（task 生命周期闭合）：hook `_onqueue_didFinishWithError:`
  （探针名单 ●），`state:ok/err` + 错误摘要；fin 时触发重组落盘
- **+重组落盘**（对标 `content.text`）：data hook 分片按 tid 进重组槽
  （32 槽环形，单 task 上限 8MB，超限丢弃后续——fin 行 bytes 对比可见截断），
  task 结束写 `Documents/lcf-resp/<tid>-<status>-<type>.bin`，
  原始字节（gzip/br 压缩体原样存，与 HAR base64 同 philosophy），
  扩展名由 mime 判定（json/html/js/xml/img/bin）
- **+阶段标记 S5-meta-hooked:N** 与 `resp-file-ok`/fallback 标记
- 安全模式不变：同一类上真实定义的 5 个 hook（创建2+数据1+响应头1+结束1），
  无枚举/定时器/resume/release，36 个外部符号全 dynamic_lookup

### 实证（待真机）

69872B，md5 `fbbc693e`。判读：S5-meta-hooked:2 出现 = 两个新 hook 装上；
`resp` 行 status 与 `fin` 行 tid 对上 req 行 = HAR 对标闭环；
`lcf-resp/` 目录出现重组文件 = 完整响应体能力达成。

### 工作流意义（对去广告开发）

关插件跑一次 → 重组文件 = 原始广告 JSON（HAR 的 MITM 价值，无需证书）；
开插件跑一次 → `resp` 行 status + 重组文件 = 清洗效果设备侧验证。
"看到请求 → 看到响应全貌 → 看到拦截效果"三步闭环。

---

## [5.3] - 2026-10-26 · lineguard

### 动机：v5.2 实测 34/561 行损坏——但根因不是编码

拆解损坏行发现：**不是内容非法，是两行粘连**（seq 83 的 JSON 后面直接跟
seq 84 的 `{`，两者各自完整合法，`raw_decode` 可拆开且零数据丢失）。
根因：`didd_hook` 的行缓冲只有 `line[256]`，而 preview 最长 127B +
头部 ~130B 正好逼近上限——`snprintf` 截断时**吞掉了结尾的 `\n`**，
下一行 write 直接接上。ASCII 化修复（v5.2）只是碰巧把损坏率从"内容非法"
换成了"截断粘连"——真正的 bug 一直是缓冲区大小。

### 改动（三重防线）

1. `didd_hook` 行缓冲 256 → 1600（截断不再发生）
2. `lc_write_locked` 兜底：写前检查末字符，非 `\n` 一律补——**任何未来
   的格式串 bug 都不会再产生粘连行**

### 实证（待真机）

69504B，md5 `879bf79b`。判读：下一轮日志 0 损坏行（v5.2 的 34 → 0）。

---

## [5.2] - 2026-10-26 · ascii-preview

### 动机：v5.1 的 data 行 6/356 JSON 损坏（1.7%）

preview 转义只处理了控制符（`<0x20`）和 `"`/`\`，但二进制分片里的
**高位字节（如 `0xa4`）原样写入**——它们不是合法 UTF-8 序列，直接产生
非法 JSON（消费端 `Expecting ':' delimiter` 等解析错误）。

### 改动

- preview 生成条件从 `c >= 0x20 && c != 0x7f` 收紧为 **`c >= 0x20 && c < 0x7f`**
  ——`>=0x80` 的高位字节与 `0x7f` 一并替换为 `'.'`，输出保证纯 ASCII，
  任何分片（二进制 protobuf / gzip / 密文）都不再损坏整行
- 这是有意取舍：preview 定位是"人/AI 看一眼判断内容形态"，
  非文本分片本来就只需知道"这是二进制"——完整字节流需求留给将来的
  base64 模式（未立项）

### 实证（待真机）

69408B，md5 `d11b3037`。判读：下一轮豆瓣日志 0 损坏行。

---

## [5.1] - 2026-10-26 · data-capture

### 动机：预置文件实验实锤"新建受限" + 方法表名单到手

在两个 guest 容器手动 `touch` 预置 `lcf-resp.jsonl` 后，探针立即写满
2741B——**"沙盒对 Documents 新建文件受限、append 已存在文件放行"实锤**。
同时拿到 `__NSCFLocalSessionTask` 全部 63 个方法（豆瓣=JavDB 完全一致），
数据接收候选定案：

- ★ 首选 `_onqueue_didReceiveDispatchData:completion:`（CFNetwork 内部数据泵）
- ◆ 响应头 `_onqueue_didReceiveResponse:completion:` 等
- ● 结束 `_onqueue_didFinishWithError:` 等
- `__NSCFURLSessionTask`/`__NSCFLocalSessionDataTask` 在 iOS 26 已不存在

### 改动

- **+数据分片捕获 hook**：`__NSCFLocalSessionTask` 真实定义的
  `_onqueue_didReceiveDispatchData:completion:`（探针定案首选），
  `setImplementation` + 原 IMP 直调；`dispatch_data_create_map` 只读映射
  （不持有——铁律 1），产 `data` 行：`tid` + `bytes` + 128B 预览（控制符转义）
- **fallback**：`lcf-resp.jsonl` open 失败 → 永久切 base 文件通道
  （`lcf-resp-fallback` stage 标记），data 行 `ev:"data"` 与 base 行天然区分
- **探针幂等**：resp 文件已有 `probe` 行则跳过（免每轮重写 63 方法大名单）
- 阶段标记增 `S4-data-hooked` / `S4-data-miss`

### 实证（待真机）

69408B，33 个外部符号全 dynamic_lookup（新增 `dispatch_data_get_size/create_map`），
无 `getClassList`/`release`/`dispatch_after`，md5 `5d59e9e5`。
判读：`S4-data-hooked` 出现后，`data` 行的 `tid` 应能对上 `req` 行——
请求→响应对正式建成。

---

## [5.0] - 2026-10-25 · probe-observable

### 动机：v4.9 判别行全无 → 但判别行设计有盲区

v4.9 的 `thread-start` 写在**等待循环之前**、却走 `lc_resp_write`——如果
resp 文件的 open 本身有问题，判别行会与产出一起被静默吞掉，"线程没跑"和
"线程跑了但写不进 resp 文件"依然无法区分。判读通道自身有单点故障。

### 改动

- 探针线程关键节点全部改写 **base 日志**（`forensics.jsonl`，已验证可写）：
  `probe-thread-start` → `probe-wait-passed:<N>` → `probe-done`（stage 行形态）
- `pthread_create` 失败也留痕：`probe-pthread-fail`
- introspection 名单照旧写 `lcf-resp.jsonl`（职责分离不变）

### 判读表（base 日志里的探针事件）

| base 日志所见 | 结论 |
|------|------|
| `probe-pthread-fail` | ctor 里线程创建失败 |
| 无任何 probe 事件 | 线程函数没被调度（罕见） |
| `thread-start` + `wait-passed` + `done` 全有，resp 文件仍无 | **resp 文件写入路径问题**（新靶子） |
| 全有 + resp 文件有 probe 名单 | 一切正常 |

### 实证（待真机）

69056B，md5 `9b5a0da4`。

---

## [4.9] - 2026-10-25 · probe-diag

### 动机：v4.8 并体探针仍零产出（双 App 验证）

豆瓣/JavDB 双双运行 v4.8（`S1→S2→S3-hooked:2` 全在，hook 正常），
但 `lcf-resp.jsonl` 依然不存在。静态审查发现探针线程的行为不可观测：
`pthread_create` 失败会静默跳过、写失败也静默——两种失败无法区分。

### 改动（诊断标记，不改功能）

- 探针线程的第一个动作（等待循环**之前**）写 `{"ev":"thread-start"}`
  ——线程活着的直接证据
- 结束时写 `{"ev":"done2","waited":N}`——区分"沙盒就绪即跑"与"120s 超时强跑"
- 版本号 `4.9-probe-diag`

### 判读表（下一轮真机）

| 现象 | 结论 |
|------|------|
| 全无 | 线程根本没跑（pthread_create 失败/ctor 环境异常） |
| 只有 thread-start | introspection 崩溃/挂起在线程里 |
| thread-start + probe + done | 一切正常（v4.8 是别的原因） |

### 实证（待真机）

69056B，md5 `80d3395d`。

---

## [4.8] - 2026-10-25 · resp-probe-merged

### 动机：lcf-resp 独立 dylib 无法加载（加载层谜题）

独立探针 dylib（v0.1/v0.2）在豆瓣四轮启动中零产出。排查证据链：

- Mach-O 结构级与 base 完全一致（flags/platform/filetype/LC_ID）
- Sign 生效（文件膨胀 +19.6KB，与 base 同规格）
- Import 流程走过后仍不加载（mtime 23:42 重签确认）
- **用户确认从未出现错误弹窗**——而 LC 源码（TweakLoader.m GitHub 实读）
  规定 dlopen 失败必弹 alert → dlopen 没失败
- LC 源码：全局 tweaks = 目录遍历无注册表，每个文件要么成功要么弹窗
- base 的 S1-ctor 也是 ctor 期写入且每轮都在 → "ctor 沙盒未就绪"假设被推翻

四者合取：**探针 dylib 不在 LC 进程实际枚举的目录列表里**（LC 视图的
Tweaks 目录与 iSH 挂载投影可能不同步；base 生效因它初始经 Import UI 进的
是真身目录）。继续追这个加载层谜题性价比低——探针逻辑是现成的，并进 base
单文件运行即可绕开。

### 改动

- lcf-resp v0.2 的 introspection 探针**并入 base**：ctor 启动后台线程 →
  轮询 base 日志出现（沙盒就绪）→ 对 `__NSCFLocalSessionTask` /
  `__NSCFURLSessionTask` / `__NSCFLocalSessionDataTask` 三类做
  `class_copyMethodList` 单类方法表 introspection → 名单写
  `Documents/lcf-resp.jsonl`（文件独立，ev 字段区分职责）
- 零 hook 不变（introspection 只读；单类查询不属铁律 3 的全局枚举）
- 新增符号：`class_copyMethodList` / `sel_getName` / `method_getName` /
  `pthread_create/detach` / `usleep`（全部 dynamic_lookup）

### 实证（待真机）

构建校验 69056B，30 个外部符号全部 dynamic_lookup，无
`getClassList`/`dispatch_after`/`release`，md5 `bd549250`。
预期：豆瓣启动后 `lcf-resp.jsonl` 出现 `probe×3 → done`。
**反向判读价值**：若本轮出现 → 100% 实锤独立 dylib 未被加载（而非探针代码问题）。

---

## [4.7] - 2026-10-25 · seq-anchor

### 动机：v4.6 真机取证发现 CLOCK_MONOTONIC 也被虚拟化

v4.6 的 `up` 字段（设计初衷 = 时钟虚拟化免疫的行序锚点）在豆瓣真机上出现
**四组时钟域混流**：

| 组 | 值域 | 实际含义 | 行数 |
|----|------|---------|------|
| A | 0–6.21s | 真 monotonic ✅ | 235 |
| B | ~1.79e9 | wall clock（与 `ts` 同源）| 少量 |
| C | ~4.3e9 | mach 基准秒 | 少量 |
| D | 1.25e18 | 纳秒级误差 | 4（gap 行） |

组 A 内部仍有 69 次小回跳（最长递增子序列仅 89/235 行）——不同线程绑到不同时钟实现。
**结论：LC guest 里任何系统时钟都不可信。** 23 条 `gap` 行全部是误触发
（"静默 44 亿秒"）。v4.6 的 23 条假 gap 直接污染 AI 消费。

### 改动

- **+`seq` 字段**：进程内自增序号（ctor 起 1,2,3...），零系统调用——唯一绝对单调的行序锚点
- **−`up` 字段**：四组噪声无分析价值，删除（连带 `clock_gettime` 引用与 `g_mono0` 基准）
- **gap 消毒**：检测搬回 `ts` 域，相邻行差值 ∈ **(10s, 60s]** 才产 gap 行；
  跳变（巨大/负值）一律忽略——宁漏勿假

### 实证（豆瓣 248 行）

- `seq` 严格递增 1→248，无一回跳 ✅
- `gap` 0 条 = 跳变全部被消毒 ✅（对照 v4.6 的 23 条假 gap）
- `tid` 245/245、`dup` 196 行（穿山甲 171x）、`ret` 全 ok、`S1→S2→S3-hooked:2` ✅
- `ts` 仍见跳变（seq124 的 ts 比邻行倒退约 8000s）——已无害，行序靠 seq
- 二进制校验：`_clock_gettime` 引用已移除，外部符号 20 个全部 dynamic_lookup，
  hook 面与 v4.5/4.6 完全一致（基类 2 selector），md5 `ef22845d`

### AI 消费规范（随本版固化进 README）

行序/去重/关联 → 一律用 `seq`；`ts` 只作绝对时间参考（会跳变）；
请求→响应拼接 → `tid`（lcf-resp）。

---

## [4.6] - 2026-10-25 · tid-session

### 动机：模块要升级为"AI 协作开发工具"，缺三个能力

lcf-resp（响应体捕获）立项铺路 + AI 分析体验升级。用户裁决：
P1（日志增强）并入 base 模块，P2（响应体）独立为 lcf-resp——风险隔离、生命周期正交。

### 改动（纯日志侧，零新增 hook 面）

- **+`tid`**：`task.taskIdentifier` 入行——lcf-resp 的请求→响应拼接键
- **+`up`**：CLOCK_MONOTONIC 相对秒（本意时钟免疫——后被 v4.7 证伪，见 [4.7]）
- **+`dup`**：同 URL 第 N 次出现才标 `dup:N`（环形表 512 条，淘汰最小计数）
- **+gap 行**：静默 >10s 插 `{"ev":"gap","sec":N}` 作隐式操作边界（初版无消毒）

### 实证（豆瓣 288 行，两次"启动"实为一次冷启动+一次挂起唤醒，同 pid）

- `tid` 262/262、`dup` 197 行（穿山甲 169x 一眼可辨）、JSON 全合法 ✅
- `up` 四组时钟域（见 [4.7] 动机）❌ → 催生 v4.7
- 多任务模式下"启动两次"只有一个 pid = 单 session 设计与挂起唤醒天然兼容（验证了设计）

### 教训

- `clock_gettime(CLOCK_MONOTONIC)` 在 LC guest 不可信——"换个系统时钟"不是出路，
  唯一免疫的是**不调用任何系统时钟**
- gap 阈值判定放在被虚拟化的时钟域 = 大量假边界；先验证时钟可信再产出时间结论

---

## [4.5] - 2026-10-25 · dual-sel

### 动机：v4.4 二分破案后转正

### 改动

- 保持 v4.4 全部安全模式（零枚举/零定时器/零 resume/同步落盘/S1S2S3 阶段标记）
- **+1 selector**：`dataTaskWithRequest:`（delegate 版）——豆瓣这类原生 Swift App
  常用委托模式创建任务，v4.4 只覆盖 completionHandler 版

### 实证（豆瓣 334 行 / JavDB 正常）

- 331 条请求全 `ret:"ok"`，JSON 334/334 可解析
- **`req-delegate` 占 78%**——第二个 selector 把捕获量拉到 v4.4 的 5 倍
- 内容含金量：`frodo.douban.com` 主 API 58 条（`feature_switch`/`erebor/feed_ad`/
  `elendil/recommend_feed` 等）、erebor 插屏 ×4、穿山甲埋点 166 条、广点通 17 条
- 已知瑕疵确认：`ts` 多组偏移（时钟虚拟化），行序仍可信

---

## [4.4] - 2026-10-25 · minimal-probe（破案功臣）

### 动机：v4.3 豆瓣仍闪退 + 时间线取证

容器内文件 mtime 显示豆瓣 22:21 轮写盘到 22:21:11 戛然而止（进程活过网络栈初始化，
死于启动后 ~2-3s，恰在 ctor+2s 定时回调窗口附近）。嫌疑收敛到被 v4.3 保留的三样：
全类枚举（late 补装）/ resume hook / dispatch_after 定时器。

### 改动：纯减法二分

删定时器链、删 late 补装、删 `objc_getClassList`、删 resume hook——只保留
**NSURLSession 基类单 selector**（`dataTaskWithRequest:completionHandler:`）。
关键工程改进：**S1-ctor / S2-sels / S3-hooked 阶段标记立即同步落盘**（不再缓冲），
进程死在任何瞬间，磁盘上都有证据。

### 实证（决定性）

豆瓣稳定启动，44 条请求全 `ret:ok`（`app_ads/splash_show+preload`、`erebor/stock`、
`mssdk.volces.com/ri/report` 风控上报、gdt 联盟全在）→
**闪退因 ∈ {枚举, resume, 定时器}**，且这三样从此进入铁律黑名单。

### 方法学遗产

"纯减法 + 分阶段同步落盘" 的二分模板，成为后续一切探针版（lcf-resp 等）的标准流程。

---

## [4.3] - 2026-10-25 · narrow-install

### 动机：v4.2 豆瓣仍崩，但 JavDB 正常——强分流证据

双容器日志对比：JavDB（0 个 session 子类）全链路正常；豆瓣（**13 个 session 子类**
+ mssdk 风控常驻）崩。v4.2 会枚举全部类并对每个子类改 IMP——第三方/混淆类的
`method_setImplementation` 交互面不可控。

### 改动

安装面收窄到 3 个确定性系统基类：`NSURLSession` / `__NSCFURLSession` /
`__NSURLSessionLocal`（resume 同理收窄到 Task 基类）。基类 hook 的语义：
objc_msgSend 派发下，子类不覆盖方法时必经基类 IMP——覆盖面接近全量，雷区避开。

### 结果

豆瓣仍闪退（死于 ctor+2s 窗口）→ 证明雷不止在枚举，定时器链/resume 同样有份，
推动 v4.4 纯减法二分。

---

## [4.2] - 2026-10-25 · reenter-safe

### 动机：v4.1 仍闪退（用户确认为 4.1 后仍崩）

### 改动

- **修死锁（R6）**：v4.1 的 `lcf_late_cb` 持自旋锁调 `lcf_install_all`，
  后者末尾 `lc_emit` 再拿锁——同线程自旋等自己 → App 启动 2s 冻结 →
  iOS watchdog（0x8badf00d）击杀。修复：拆出已持锁变体，持锁区禁 emit
- **防 hook 递归（R7）**：每个 selector 全局只 hook 首个真实定义类
  （此前 resume 在 Task 与 __NSCFURLSessionTask 双层装 hook，
  子类原实现内部 `[super resume]` 会再进 hook → 无限递归爆栈）

### 结果

豆瓣仍闪退 → 死锁只是雷之一，主雷（全类枚举）还在。

### 教训（升华为铁律 2）

手写自旋锁必须回答"这条调用链有没有重入"——持锁区内禁止调用任何可能 emit/加锁的函数。

---

## [4.1] - 2026-10-25 · safe-dual

### 动机：v4.0 首次投放即闪退（用户反馈"加载模块后 App 闪退"）

### 改动

- **修过度释放（R1，主嫌）**：v4.0 对 `URL`/`absoluteString`/`HTTPBody`/
  `currentRequest` 等 getter 返回值调了 `objc_release`——getter 不 +1、我们不持有，
  release = 过度释放，首个被 hook 的请求触发即崩。修复：移除全部
  `objc_release`/`objc_retain`（二进制验证无 `_objc_release` 引用）
- **R2**：`class_respondsToInstance`（导出性不确定，懒绑定缺失符号 = 首调即崩）
  → `class_getInstanceMethod(...) != NULL`
- **R3**：HOME 每次 flush 实时重解析，变化即重开 fd（防日志写进宿主容器不可见文件）
- **R4**：hook 记账表 `(class, sel, orig, idx)`，原 IMP 沿 self 类链精确反查

### 结果

仍闪退 → 死锁（v4.2 修）叠在下面。

### 教训（升华为铁律 1）

**ObjC getter 返回值绝不 release**——无 SDK 手写 hook 代码里，只读不持有，一次都不行。

---

## [4.0] - 2026-10-25 · setimp-dual（重写版）

### 动机

工作区被重置，v2.x/v3.x 源码丢失（唯一幸存物：挂载 Tweaks 里的 v3.3f 二进制）。
依据交接文档重建，针对性消灭"候选 A（swizzle 转发链路缺陷）"。

### 设计

- 层A：`objc_getClassList` 枚举全部类，凡 NSURLSession 子类 hook 其真实定义的
  14 个任务创建 selector（data/upload/download 全家族 × 委托/handler 变体）
- 层B：Task 家族 resume hook 兜底
- `method_setImplementation` + 保存原 IMP 直调（无 selector 交换——转发缺陷按构造不可能）
- 每行带 `ret` 字段（原实现返回值 NIL 即实锤）
- 惰性写入：ctor 只装 hook，日志缓冲 + 2s/10s/30s dispatch 异步刷新

### 结果

**豆瓣闪退**（JavDB 当时未测）。两个根因：getter 误 release（v4.1 修）+
自旋锁死锁（v4.2 修），且全类枚举+定时器本身就是雷（v4.3/4.4 逐步定位）。

### 环境级发现（本版贡献）

- LC guest 的 HOME 是嵌套路径，ctor 中途被 LC 重定向——印证"永不硬编码
  `/var/mobile/Containers/...`"
- iSH 无 Mac 交叉编译链定型：`clang --target=arm64-apple-ios15.0.0`（不能 darwin——
  ld64.lld 拒绝平台不匹配）+ `-undefined dynamic_lookup` + 外部符号
  `n_desc=0xfe00`（DYNAMIC_LOOKUP_ORDINAL）= 绑定正确性判据

---

## [v2.x–v3.x] - 2026-10-25（历史，源码已佚，结论由交接文档与真机日志推定）

| 版本 | 形态 | 真机结果 |
|------|------|---------|
| v2.x | 单 selector swizzle（`dataTaskWithRequest:completionHandler:`） | 能跑通，但每启动只抓 1 条 |
| v3.x protocol | NSURLProtocol 注入 session 工厂 | 豆瓣 session 创建早于 hook 安装 → 0 条 |
| v3.3f | ctor 探针版 | init 行落盘，HOME 嵌套路径实锤 |

"每次只 1 条"的最终解释（20:36 定案）：模块一直正常——豆瓣的 NSURLSession
本来就只承载启动序列的少数请求（业务主流量走 TCP 长连接），v4.5 的 5 倍提升
靠的是补上 delegate 版 selector，而非 v2.x"坏了"。
