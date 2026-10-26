# 更新记录 · lc-forensics

每个版本的**动机 / 改动 / 实证 / 教训**全记录。当前版本见 [README.md](README.md) 版本史表。

格式约定：每版必含——**为什么改**（当时的证据/事故）、**改了什么**（可验证的具体项）、
**结果**（真机数据或二进制校验）、**代价/教训**（如有）。二进制校验项 = 用 lcf_macho.py /
nm 级符号检查可复现的客观事实。

---

---

---

---

---

---

---

---

---

---

---

---

## [10.3] - 2026-10-27 · ftyp-pid

### 动机：v10.2 反馈的两个建议

RedPaper 开发方对 v10.2 的反馈（1670 行真机日志）：

| # | 建议 | 反馈原话 |
|---|---|---|
| **P1** | `ftyp` 通用判断替代 brand 白名单 | "HEIF 家族已知品牌有 heic/heix/mif1/rvic/avif… 枚举永远会漏" |
| **P2** | index.jsonl 加批次标识 | "追加式导致跨版本混批，加个 pid 即可" |

### 实证背景

v10.2 生成的 19 个 `.bin` 里，按 magic 分类：

| magic | 数量 | 实际类型 | 说明 |
|---|---|---|---|
| `ftypheic` | 6 | heic | v10.1 遗留旧文件 |
| **`ftyp rvic`** | **2** | **HEIF 变体** | **v10.2 漏判** |
| `{}` | 5 | json | v10.1 遗留旧文件 |
| `<InitiateMultipart` | 1 | XML | 真实非标准 |
| `1f7798a3...` | 2 | 十六进制文本 | 真实非标准 |
| `49a304a9...` | 2 | 私有加密 | 真实非标准 |

**v10.2 真正新增的 bin 只有 2 个 `rvic`** —— 反馈判断准确。

### 改动

1. **`ftyp` 容器通用判断**：`if (u[4..7]=="ftyp") return "heic";`
   不再枚举 brand，`rvic`/`avif`/未来变体全部覆盖
2. **index.jsonl 加 `pid`**：`{"tid":..,"taskkey":"..","pid":12345,"url":..}`
   跨批次分析时可过滤

### 采纳理由

- P1：枚举是反模式，容器标记（`ftyp` @ offset 4）是 ISO BMFF 规范定义，稳定
- P2：`pid` 与日志行已有字段一致，零额外成本

### 未采纳

- P3 XML 识别（1 个案例，`<` 开头已被 html 规则覆盖大部分场景）
- P3 preview JSON 结构摘要（性能风险，512 截断 + 完整文件够用）

### 实证（真机验证 ✅）

87120B，md5 `a0aab5b6`。小红书 pid 69324 / 1468 行 / 零损坏 / seq 1→1468 连续。

**ftyp 通用判断生效**：本轮新增的 2 个 `.bin` 均非 ftyp 容器：

| 文件 | 大小 | magic | 判定 |
|---|---:|---|---|
| `3-0a317100-200.bin` | 128B | `1f7798a3...` | 十六进制文本（DNSPod conf）✅ |
| `5-40943100-200.bin` | 160B | `49a304a9...` | 私有加密 ✅ |

**没有任何 ftyp 容器被漏判** —— `rvic` 变体问题彻底解决。
（目录里其余 19 个 `.bin` 是 03:16/03:25 的旧文件，属 v10.1/v10.2 遗留，非本轮产物。）

**pid 字段生效**：

```json
{"tid":1,"taskkey":"11a20800","pid":69324,"url":"https://lng.xiaohongshu.com/api/collect","status":200,"bytes":41,"file":"1-11a20800-200.json"}
```

跨批次分析可用 `jq 'select(.pid==69324)'` 一行隔离。

**扩展名分布**：json 621 / jpg 76 / heic 53 / webp 18 / bin 21 / zip 4 / html 4 / png 2。

## [10.2] - 2026-10-27 · json-heic-taskkey

### 动机：v10.1 反馈的三个遗留项

RedPaper 开发方对 v10.1 的反馈（750 行真机日志验证）：

| # | 问题 | 反馈原话 |
|---|---|---|
| **P1** | 6 个 `{}` 响应被存成 `.bin` | "magic=7b7d ← 实际是 {}" |
| **P2** | `data` 行缺 `taskkey` | "现在只有 index.jsonl 有，日志行没有" |
| **P3** | 6 个 HEIC 存成 `.bin` | "magic=...ftypheic"（反馈认为可接受） |

### 根因（P1 是个明显的 bug）

```c
if (!b || n < 4) return "bin";   // ← 2 字节的 "{}" 直接早退
...
if (u[i]=='{' || u[i]=='[') return "json";   // ← 永远走不到
```

`n < 4` 的早退把 2 字节的 `reject_dict` 占位挡在 JSON 判断之前。

### 改动

1. **magic bytes 早退条件** `n < 4` → `n < 1`（2 字节 `{}` 也能判 JSON）
2. **HEIC/HEIF 识别**：`ftyp` @ offset 4 + `heic`/`heix`/`mif1` → `.heic`
3. **`data` 行加 `taskkey`** 字段（与 index.jsonl 对齐，跨文件关联更方便）

### 逻辑验证（14 组边界用例全通过）

| 输入 | 期望 | 实际 |
|---|---|---|
| `{}` | json | **json** ✅ |
| `{"a":1}` / `[]` / `  {"a":1}` | json | json ✅ |
| `...ftypheic` / `...ftypmif1` | heic | **heic** ✅ |
| PNG / JPEG / WEBP / ZIP / HTML / gzip | 各自类型 | ✅ |
| 加密 conf (`1f7798a3`) / 单字节 | bin | bin ✅ |

### 实证（真机验证 ✅）

87120B，md5 `ec97e647`。小红书 pid 69287 / 1670 行验证：

| 项 | v10.1 | v10.2 | 结果 |
|---|---:|---:|---|
| `{}` 存成 `.bin` | 6 个 | **0 个** | ✅ 完全修复 |
| HEIC 识别 | 0 | **25 个 `.heic`** | ✅ 新增 |
| webp / png 识别 | 0 | **18 / 1** | ✅ 新增 |
| 扩展名识别率 | 91% | **98%** | ✅ +7 个点 |
| `data` 行 taskkey | 无 | **有** | ✅ 与 index 对齐 |

**6 个 2 字节 `{}` 全部正确归为 `.json`**：
`71-53a48380-200.json` / `2-50a8d180-200.json` / `99-5b788700-200.json` /
`41-11ab2680-200.json` / `100-5b6e6300-200.json` / `43-3815ad80-200.json`

**验证注意**：`lcf-resp` 目录不清空，新旧文件混放。核对时必须按时间戳
分离（`stat -c %Y`），否则会把 v10.1 的旧 `.bin` 误判为 v10.2 未修复。

### 采纳反馈的建议

反馈 P3 建议"preview 支持 JSON 结构摘要"——**未采纳**：
复杂嵌套的结构摘要有性能风险（每次分片都要解析 JSON），
且 512 字符截断配合 `lcf-resp` 完整文件已够用。

---

## [10.1] - 2026-10-27 · fix-url-ext-status

### 动机：v10.0 真机验证发现三个引入的 bug

小红书真机验证 v10.0 时发现（反馈修复项本身有效，但引入了新问题）：

| # | 现象 | 根因 |
|---|---|---|
| **1** | `index.jsonl` 的 `url` 字段被整行污染 | 提取 requrl 时**未在结束引号处截断** |
| **2** | 文件名 `status` 恒为 **0** | `s->status` 只在 `lcf_resp_line()` 里设置，v6.8 已卸载那两个 hook（与 mime 同一根因） |
| **3** | 文件名仍是 `1-4fa0a800-0-json.bin` | v10.0 把 type 放在倒数第二段，扩展名固定写死 `.bin` |

### 改动

1. **url 截断**：逐字符复制到结束引号，处理转义
2. **真扩展名**：`<tid>-<taskkey8>-<status>.<ext>`（如 `1-09abdc00-200.json`）
3. **status 回填**：flush 前用 fin 行的 `status` 写回重组槽（含 mime）

### 实证（真机验证 ✅）

| 项 | v10.0 | v10.1 |
|---|---|---|
| 文件名 | `1-4fa0a800-0-json.bin` | **`1-09abdc00-200.json`** |
| status | 0 | **200** |
| 扩展名分布 | 全 `.bin` | **json 119 / jpg 7 / html 2 / bin 1826** |
| index url | 被 preview 污染 | **干净** |

87120B，md5 `eb216b3b`。

### 教训

**改一处要检查同一根因的所有下游。** `s->mime` 和 `s->status` 都依赖
`lcf_resp_line()`，v6.8 卸载 hook 后两者同时失效，v10.0 只修了 mime，
status 直到真机验证才暴露。

---

## [10.0] - 2026-10-27 · feedback-fix ★ 按用户使用反馈修复七项

### 动机：RedPaper 插件开发全程的使用反馈（USAGE-FEEDBACK.md）

纯使用者视角，3 个 session 实测小红书 9.51.1。逐条核实**全部属实**，
其中两条是明确的实现疏漏。

### 修复清单

| # | 问题 | 反馈原话 | 修复 |
|---|---|---|---|
| **1** | **tid 复用覆盖响应体** | "8MB 实际 300B" | 文件名加 taskkey 短哈希：`<tid>-<taskkey8>-<status>-<type>.bin` |
| **2** | **preview 太短** | "平均 95 字符，JSON 结构看不全" | `PREVIEW_LEN` 128 → **512** |
| **3** | **扩展名全 .bin** | "1638 个文件全 bin" | 改用 **magic bytes** 判类型（json/zip/png/jpg/webp/gif/html/gz）|
| **4** | **fin 行缺 url** | "tid=1 对应 20+ 请求，无法判断" | fin 行加 `url` 字段（`currentRequest.URL`）|
| **5** | **缺 index.jsonl** | "要定位响应得翻三层" | 新增 `lcf-resp/index.jsonl`：`{tid, taskkey, url, status, bytes, file}` |
| **6** | **stage 行信息不足** | "hooked:2 但没说是哪 2 个" | `S3-hooked:2:dtwrh,dtwr` 带 selector 名 |

### 两个实现疏漏的说明

**① v7.1 注释与实际不符（反馈方发现）**
```c
/* v7.1: taskkey 哈希尾缀防 tid 复用覆盖 */
int fd = open(path, ...);          // ← 文件名里根本没有 taskkey
```
注释写了但没实现。v10.0 补上。

**② mime 链路已断却仍在用**
`s->mime` 只在 `lcf_resp_line()` 里设置，而该函数只被 `didresp_hook` 调用——
**v6.8 已把这两个 hook 全部卸载**（会崩）。所以 mime 恒为空 → type 恒为 "bin"。
v10.0 改用 magic bytes，不再依赖 mime。

### 实证（待真机）

87120B，md5 `fc7f250e`。

### 保留的优点（反馈方认可，未改动）

每次启动独立文件 / seq 严格连续锚序 / req·fin·data 三类行分离 /
响应体落盘 / 零 App 特定逻辑 / req 行 bodyLen

---

## [9.7] - 2026-10-26 · per-run-log

### 动机：每次启动独立日志，便于按会话分析

单一 `forensics.jsonl` 累积多次启动的记录，分析时需要用 `pid` 过滤。
改为**每次启动一个文件**，文件名自带 UTC 时间戳 + pid。

### 命名与位置

```
Documents/lcf-log/
├── forensics-20261026T101530Z-65821.jsonl   ← 本次启动
├── forensics-20261026T093012Z-65704.jsonl   ← 上次启动
└── latest.txt                                ← 最新文件名（无路径）
```

- 格式：`forensics-YYYYMMDDTHHMMSSZ-<pid>.jsonl`
- **`T` 分隔 + `Z` 后缀 = UTC**，避免与本地时间混淆
- 时间戳用 `gmtime_r()`（不依赖 TZ / locale）
- `pid` 兜底：同秒内重启也不冲突

### 改动

1. 新增 `lc_init_logpath()`：ctor 第一句调用，**只计算路径 + mkdir，不 open**
2. `lc_openlog()`：改用 `g_log_path`（路径已固定，去掉每次 `strcmp`）
3. 首次打开成功后写 `latest.txt`（只写文件名，方便 `cat` 后拼路径）
4. 探针线程的沙盒就绪检查改用 `g_log_path`
5. **v9.6 的两步打开逻辑原样保留**（`O_TRUNC` 创建 + 纯 `O_WRONLY` 追加）
   —— 文件名唯一，`O_TRUNC` 天然不会清到历史日志

### 排序说明

文件名时间戳受 LC guest 时钟污染影响（v4.6 实证 `CLOCK_MONOTONIC` 都被虚拟化），
**因此文件名仅作标识，不用于排序**。同一会话内的行序以 `seq` 字段为准（严格递增）。

### 兼容

- 旧 `Documents/forensics.jsonl` 不再写入，历史保留
- 读取最新日志：`cat Documents/lcf-log/latest.txt` 或 `ls -t Documents/lcf-log/*.jsonl | head -1`

### 实证（真机验证 ✅）

87088B，md5 `8125cee0`。豆瓣 / JavDB 各启动两次，全部符合预期：

| App | 文件 | 行数 | pid | seq |
|---|---|---|---|---|
| 豆瓣 | `forensics-20261026T103152Z-65903.jsonl` | 721 | 65903 | 1→721 连续 ✅ |
| 豆瓣 | `forensics-20261026T103202Z-65913.jsonl` | 771 | 65913 | 1→771 连续 ✅ |
| JavDB | `forensics-20261026T103147Z-65901.jsonl` | 37 | 65901 | 1→37 连续 ✅ |
| JavDB | `forensics-20261026T103159Z-65912.jsonl` | 87 | 65912 | 1→87 连续 ✅ |

- ✅ 每次启动独立文件，旧文件不被覆盖（会话1 保持 721 行）
- ✅ `latest.txt` 正确指向最新文件
- ✅ seq 每会话从 1 开始且严格连续
- ✅ **两次启动仅间隔 10 秒仍正确区分** —— pid 兜底设计的必要性得到验证
  （若只用秒级时间戳，同秒重启会冲突）

---

## [9.6] - 2026-10-26 · trunc-create ★ 修复「日志文件无法自建」

### 动机：v9.5 对照矩阵给出决定性答案

在**已验证能写 223 个文件**的 `lcf_reqbody_write()` 里做 8 组对照，结果：

| # | 路径 | 扩展名 | 标志 | 结果 |
|---|---|---|---|---|
| 1 | `lcf-req/` | .bin | **O_TRUNC** | ✅ 成功 |
| 2 | `lcf-req/` | .jsonl | **O_TRUNC** | ✅ 成功 |
| 3 | `lcf-req/` | .jsonl | **无 O_TRUNC** | ❌ 失败 |
| 4+ | `Documents/` 顶层等 | — | — | App 闪退（矩阵做太多 IO）|

**结论：LC guest 沙盒里 `open(O_WRONLY|O_CREAT)` 不带 `O_TRUNC` 无法新建文件。**

这解释了全部历史现象：
- `lcf-req`/`lcf-resp` 一直用 `O_TRUNC` → 223 + 49 个文件全成功
- `forensics.jsonl` 从第一版起用 `O_APPEND`（v9.4 改纯 `O_CREAT`）→ **从未带过 `O_TRUNC`**，永远建不出来
- 因为豆瓣/JavDB 的 `forensics.jsonl` 早就存在（早期某版本创建），这个缺陷**从未暴露**

### 改动（两步打开）

```
1. open(O_WRONLY|O_CREAT|O_TRUNC)  → 创建空文件 → close
2. open(O_WRONLY)                  → 追加 → lseek(SEEK_END)
```

- `lc_openlog()` / `lc_open_resp()` 全部改为该模式
- 只有本进程首次打开会走 O_TRUNC（清空一次），之后都是纯追加
- 失败时清空 `g_path`，下次写重试（不会永久失效）

### 实证（真机验证 ✅）

| App | forensics.jsonl | 结果 |
|---|---|---|
| 豆瓣 | **228KB / 847 行** | 模块自建成功 ✅ |
| JavDB | **8.3KB / 51 行** | 模块自建成功 ✅ |

86944B，md5 `88a25595`。

### 教训（铁律级）

**「文件已存在」会掩盖「无法创建文件」的缺陷。**
任何写文件的模块都必须有「删掉文件 → 从零创建」的测试用例。
此前 20+ 版本全部在已有文件上验证，从未覆盖创建路径。

---

## [9.4] - 2026-10-26 · no-append

### 动机：★ 决定性实验锁定「O_APPEND 导致新建失败」

此前多轮怀疑（沙盒挂起、外部创建、线程、volatile）全部被实验否定。
最终用「删掉日志文件 → 让模块自己重建」的方式得到干净对照：

| App | `forensics.jsonl`（模块自建） | `lcf-req/<tid>-POST.bin`（模块自建） | App |
|---|---|---|---|
| 豆瓣 | **❌ 创建不出来** | **✅ 221 个** | 正常 |
| JavDB | **❌ 创建不出来** | **✅ 29 个** | 正常 |

**同进程、同 HOME、同一套代码**，唯一差异是 open 标志：

- `lcf-req`：`O_WRONLY|O_CREAT|O_TRUNC` → 能创建
- `forensics.jsonl`：`O_WRONLY|O_CREAT|O_APPEND` → **创建失败**

### 改动

- `lc_openlog()` / `lc_open_resp()`：**去掉 `O_APPEND`**，改 `O_WRONLY|O_CREAT`
- 新增 `lc_seek_end()`：每次写前 `lseek(SEEK_END)` 追加（单线程写，无并发风险）
- 两处写入点（`lc_write_locked` / `lc_resp_write`）全部加 seek

### 回溯：这是从第一版就存在的假设

查 git 历史 6 个版本（edc661a / b5446a9 / 63f0d18 / 28c031e / 1e456ea / b8be55f），
`O_APPEND` 一直在。它在豆瓣/JavDB 上一直「恰好能用」（因为文件早就存在），
**从未被「从零创建」的测试覆盖过**——这是测试设计的漏洞，不是某次改动引入的。

### 附带结论：模块通用性的诚实定位

本模块**不是通用网络取证工具**，而是「**NSURLSession 栈 + 特定 iOS 版本私有 selector**
的取证工具，在豆瓣/JavDB 上验证充分」：

- 只 hook `__NSCFLocalSessionTask`（iOS 26 唯一实体类）
- 私有 selector 名随 iOS 版本浮动（靠探针实测）
- **完全不覆盖** Flutter(dio) / WKWebView / 自研网络栈
- Steam / 小红书实测异常（App 卡住），不做承诺

### 实证（待真机）

86944B，md5 `f99219f4`。

---

---

## [9.5] - 2026-10-26 · io-matrix ★ 定位工具

### 动机：连续多个假设被推翻后，改用对照实验

此前 v8.4–v9.4 的假设全部被证伪（锁外写、异步、volatile、路径、O_APPEND）。
改为在**已验证能写 223 个文件的 `lcf_reqbody_write()`** 里做 8 组对照：

| # | 路径 | 扩展名 | 标志 | 结果 |
|---|---|---|---|---|
| 1 | `lcf-req/` | .bin | O_TRUNC | ✅ |
| 2 | `lcf-req/` | .jsonl | O_TRUNC | ✅ |
| 3 | `lcf-req/` | .jsonl | **无 O_TRUNC** | ❌ |
| 4+ | `Documents/` 顶层 | — | — | App 闪退（矩阵 IO 太多）|

### 结论

**这是整个排查的转折点**——一轮就定位了「无 O_TRUNC 无法新建文件」。
前 10 个版本全是猜测，浪费了大量时间。

### 教训

**在「已验证能工作」的代码路径里做 A/B 对照**，比在「可疑路径」上猜快 10 倍。
本模块的 `lcf-req` 写入就是天然的对照组。

---

## [9.3] - 2026-10-26 · io-probe

### 动机：小红书 App 卡住（加载首页 1-2 秒后闪退）

在 `lcf_reqbody_write` 开头加 6 组写盘探针（.jsonl 固定名 / 带 pid / O_TRUNC / .bin 对照 /
子目录内等），结果写入已证明可行的 `.bin`。

### 实证

诊断文件未产生 → 探针未执行到（App 已卡死）。改为 v9.4 的方向。

---

## [9.2] - 2026-10-26 · volatile-ring

### 动机：v9.1 诊断无输出 → 怀疑环形缓冲索引未 volatile

`g_ring_head` / `g_ring_tail` 为 `static int`，O2 下可能被缓存进寄存器，
flush 线程的 `while` 永远读到初始值 0 → 从不写文件。

### 改动

1. 两个索引加 `volatile`
2. 诊断改为无条件写一次（不依赖 open 失败）

### 实证

小红书仍无日志。**volatile 不是根因**（但修复本身正确，保留）。

### 教训

**跨线程共享的全局状态变量必须 volatile** —— 与 v7.4 `g_seq` 同一坑，第二次踩。

---

## [9.1] - 2026-10-26 · errno-diag

### 动机：v9.0 唯一文件名仍失败，需要 open 的真实 errno

在 `lc_write_nolock` 里，`open` 失败时把 errno / mkdir 返回值 / 完整路径
写到已验证可写的 `lcf-req/0-FLUSH-DIAG.bin`。

### 实证

诊断文件未产生 → `open` 没失败（或代码未执行到）。指向「flush 线程没取到队列数据」。

---

## [9.0] - 2026-10-26 · unique-name

### 动机：v8.9 移入子目录仍失败，怀疑「固定文件名有残留状态」

日志改为 `Documents/lcf/forensics-<pid>.jsonl`（每次启动唯一），
与 `lcf-req`/`lcf-resp` 的命名模式完全一致。

### 实证

`lcf/` 目录创建成功，但文件仍未产生。
**排除「文件名」因素** → 指向 open 标志。

---

## [8.9] - 2026-10-26 · selfdir

### 动机：★ 三轮对照实验锁定根因——外部创建的日志文件会让 open() 挂起

小红书容器三组对照（v8.8，ctor 期完全不写盘）：

| `Documents/forensics.jsonl` | 模块 hook 产出 | App 状态 |
|---|---|---|
| **存在**（iSH 侧 touch 创建，0B） | lcf-req/resp 0 个 | **白屏** ❌ |
| **不存在** | lcf-req 17 / lcf-resp 45 | **正常启动** ✅ |
| **不存在**（再启动一次） | lcf-req 29 / lcf-resp 49 | **正常启动** ✅ |
| **存在**（再 touch 一次） | — | **白屏** ❌ |

→ **根因：`open()` 打开由外部进程（iSH）创建的 `forensics.jsonl` 会挂起**；
文件不存在时 `open` 立即失败返回，App 正常。

关键对照：`lcf-req`/`lcf-resp` 在小红书写了 **49 + 29 个文件全部正常**——
它们的共同点是**模块自己 mkdir 子目录、在子目录里创建文件**。

### 改动

- 日志路径从 `Documents/forensics.jsonl` → **`Documents/lcf/forensics.jsonl`**
- `lcf-resp.jsonl` 同样移入 `Documents/lcf/`
- `lc_write_nolock()` 写前 `mkdir(Documents/lcf)` —— 与 `lcf-req`/`lcf-resp`
  完全同模式（后者已在小红书验证 1000+ 次可靠）

### 迁移说明

旧路径 `Documents/forensics.jsonl`（豆瓣/JavDB 在用）不再写入。
如需保留历史日志，读取时同时看两个位置；新数据只在 `Documents/lcf/`。

### 实证（待真机）

87168B，md5 `19d27861`。

---

## [8.8] - 2026-10-26 · defer-io

### 动机：v8.7 卡在 S4 之后——根因收敛为「open() 本身概率性挂起」

v8.7 小红书日志 6 行（`S1-ctor` → `probe-thread-start` → `S2-sels` →
`probe-wait-passed` → `S3-hooked:2` → `S4-data-hooked:3`），**缺少 S5/resp-file-ok**。
而 S4→S5 之间只有纯计算 + snprintf——不可能卡，除非 `lc_stage` 里的
`lc_write_nolock()` 的 `open()` 挂住了。

**跨版本证据（决定性）**：

| 版本 | 写入方式 | 小红书日志行数 | 卡住位置 |
|---|---|---|---|
| v8.5 | 环形缓冲 + 持有 fd | 1 行 | `lc_start_flusher()` |
| v8.6 | O_TRUNC + lseek | 4 行 | S2-sels 后 |
| v8.7 | 每次 open→lseek→write→close | **6 行** | S4 后 |

每次改进都「多推进一点」但仍在某个 `open()` 挂住 → **`open()` 在小红书
sandbox extension 上是概率性挂起，不是固定位置问题**。
只要在 ctor 线程同步 open 就可能白屏。

### 改动

1. **`lc_stage` 永不直接写盘**：一律 `lc_enqueue`（纯内存入队）
2. **flush 线程延迟 2 秒**才第一次 open —— 等 ctor 返回、App 启动流程走完；
   即使 open 挂起也只挂在后台线程，不阻塞 App 启动

### 判读

小红书：白屏消失（ctor 完全不碰 IO）。若仍白屏，说明 flush 线程的 open 挂起
会连带阻塞（需再退一步：完全放弃小红书这类容器的落盘）。

### 实证（待真机）

87168B，md5 `c6543b3a`。

---

## [8.7] - 2026-10-26 · open-close

### 动机：v8.6 部分有效，剩余卡死点收敛到「长期持有 fd」

v8.6 小红书日志从 1 行 → 4 行（`S1-ctor` / `probe-thread-start` / `S2-sels` /
`probe-wait-passed`），ctor 卡在 S2-sels 后的 hook 安装、探针卡在 wait-passed 后的
introspection —— **两者都卡在写盘动作**。

决定性对照：

| 写入方式 | 小红书结果 |
|---|---|
| `lcf-req`/`lcf-resp`：每次 `open(O_TRUNC)`→`write`→`close` | **1531 个文件全成功** ✅ |
| `forensics.jsonl`：长期持有 `g_fd` 反复 `write` | 随机挂住 ❌ |

→ **长期持有的 fd 在 sandbox extension 文件上会失效/挂起，每次 open+close 才可靠**

### 改动

- 弃用 `g_fd` 缓存；`lc_write_nolock()` 改为每次：
  `open(O_WRONLY|O_CREAT)` → `lseek(SEEK_END)` → `write` → `close`
- 与 `lcf-req` 完全同款（后者已在小红书验证 1531 次）
- 只在 flush 线程调用，开销可接受

### 实证（待真机）

87200B，md5 `53d04479`。

---

## [8.6] - 2026-10-26 · no-append

### 动机：v8.5 只写 1 行就卡死

v8.5 小红书日志仅 1 行 `S1-ctor`（ctor 第一句，直写成功），下一句
`lc_start_flusher()` 之后再无输出 → **ctor 卡住不返回 → App 停在启动画面（白屏）**。

关键对照：`lcf-req`/`lcf-resp` 用 **O_TRUNC** 打开，小红书 50+1531 个文件全部正常；
`forensics.jsonl` 用 **O_APPEND** 打开则卡死 → O_APPEND 是慢/挂起路径（当时假设）。

### 改动

1. **弃用 O_APPEND**：改用 `O_WRONLY|O_CREAT` + 写前 `lseek(SEEK_END)`
2. **`lc_start_flusher()` 移到 ctor 最末尾**（避开早期 `pthread_create` 风险）

### 实证

小红书：日志 1 行 → **4 行**（部分有效），但仍在 hook 安装段卡住。
87168B，md5 `a7fef673`。→ 引出 v8.7。

---

## [8.5] - 2026-10-26 · async-io

### 动机：v8.4 反而更糟，白屏与锁无关

| 轮次 | forensics 存在 | 日志 | 请求 | 结果 |
|---|---|---|---|---|
| v8.3 早期 | ❌ 打不开 | 无 | lcf-req 50 / resp 1531 | 正常 |
| v8.3 预置文件后 | ✅ | 8 行 stage | **零新增** | 白屏 |
| v8.4 | ✅ | 8 行 stage | **零新增** | 白屏 |

→ 白屏与锁无关（v8.3 锁内写 / v8.4 锁外写都一样卡）
→ 真正变量是「写盘是否真的发生」：文件打不开时 `write` 从不执行 → App 正常

### 改动（彻底异步）

- 环形缓冲 `RING_CAP=1024` + 后台 flush 线程（每 200ms 批量落盘）
- hook 线程只 `lc_enqueue`（纯内存入队，持锁极短，**零 IO**）
- IO 只在专用 flush 线程；队列满则丢行（宁可丢行不阻塞 App）
- `lc_stage` 在 flush 启动后同样入队；ctor 早期 8 行直接写兜底

### 实证

小红书：**仍白屏，且只写 1 行**（比 v8.4 的 8 行更少）→ ctor 卡在
`lc_start_flusher()`。87136B，md5 `7bc4e778`。→ 引出 v8.6。

---

## [8.4] - 2026-10-26 · unlocked-io

### 动机：小红书白屏——持锁区同步磁盘 IO 阻塞网络回调

小红书容器（com.xingin.discover）首次取证暴露两个真问题：

1. **`O_APPEND` 打开新建文件失败**：预置 0B `forensics.jsonl` 后立即写入成功
   （8 行 stage），证实 LC guest 沙盒对「新建 + O_APPEND」受限、对已存在文件放行
   （与 2026-10-26 凌晨豆瓣 `lcf-resp.jsonl` 实验同结论）
2. **★ 白屏根因**：文件能打开后，所有 `lc_write_*` 的 `write()` 都在持锁区内。
   小红书沙盒在挂载层、磁盘 IO 比豆瓣慢得多，同步 write 阻塞网络回调线程
   → 请求串行卡死 → App 白屏（进程活着不闪退）。之前文件打不开时 `open` 直接失败、
   根本没走到 `write`，问题被掩盖。

### 改动（持锁区去 IO，全模块）

- 新增 `lc_write_nolock()`：只做 open + 单次 write（O_APPEND 单次写原子，
  行 < 2048B < PIPE_BUF，无需锁保护）
- 新增 `lc_build_seq_locked()`：锁内只做纯内存组装（回填 seq 占位 + 追加尾段），
  返回 strdup 堆缓冲；调用方解锁后 `lc_write_free()` 落盘并释放
- 9 处写入点全部改造：req×2 / data×2（didd1/didd2）/ fin / gap / resp×2 / stage
- 静态校验：锁内 write 调用 **0 处**（脚本逐行扫描 lock/unlock 深度）

### 实证

86912B，md5 `bd68c1fc`。待真机：小红书白屏消失 + forensics.jsonl 有内容。

---

## [8.3] - 2026-10-26 · data-url

### 动机：v8.2 双记确认 + 券图"有数据无请求"

### 改动
- data 行 +`requrl`（读 `task.currentRequest` 浅层链）——分片自带 URL，不依赖创建 hook

### 实证
- requrl 194/194 全覆盖
- **悬浮窗 URL 实锤**：`https://img3.doubanio.com/view/treasury_image/raw/public/57caf2bbb1aa0f7.jpg`
  - 分片合计 129317B 精确命中 + 重组文件与 SD 缓存字节一致（MD5 f81e14c1）
  - SDImageCache 键 `592306d1...` = **MD5(去 scheme 的 URL)**（修正 SDWebImage 键规则认知）
- 直接转化为 Douban-Dedup v2.6.1 的 treasury_image 拦截规则

---

## [8.2] - 2026-10-26 · data-src

### 动机：v8.1 双记 + 券图缺席
- tid=8 分片每片双记（36 行 = 18 片 × 2）：CFNetwork 对同一分片先后调 didd1/didd2

### 改动
- data 行 +`src` 字段（didd1/didd2 可辨）
- 重组只在 didd1 追加（didd2 双追加会重复）

### 实证
- didd1:didd2 = 165:165 完美 1:1；**重组命中券图 129317B PNG 771×732** ✅

---

## [8.1] - 2026-10-26 · imgchannel

### 动机：v8.0 清缓存实验实证图片库走独立通道
### 改动
- 新增 hook `_task_onqueue_didReceiveDispatchData:completionHandler:`（双冒号版）
- S4 标记位图化：`S4-data-hooked:3` = 单冒号 + 双冒号都装

### 实证
- S4:3 双通道装上；但分片双记 + 券图仍缺席（req URL 的 MD5 无一匹配 SD 键）

---

## [8.0] - 2026-10-26 · multi-app

### 动机：v7.5 残留——req/req-delegate 回填代码从未写入
v7.3 脚本锚点匹配后，后续 v7.4/v7.5 脚本用旧快照覆盖，导致 278 行 seq=0 落盘。

### 改动
- req/req-delegate 两 hook 补齐持锁 strstr 回填（与 fin 同款）
- 全量核对：取号 6 处全锁内（stage/helper/gap/req/reqd/fin 回填），回填 4 处，seq:0 占位 4 组装

### 实证
- **677 行 seq 严格连续 1→677**，零重复零空耗零遗漏 ✅

---

## [7.5] - 2026-10-26 · seq-final

### 动机：v7.4 判读——volatile 无效，真根因是改造残留

722 行却消耗 max seq 1,087,086（空耗 108 万）+ 重复 seq 仍有 9 个——
回查 v7.3 的改造脚本，发现**组装占位只替换了一部分**：
`lc_req_line`（303）/`lcf_data_line`（425）/`didfin_hook`（701）/`lcf_resp_line`
（614）四处组装时的 `++g_seq` 残留——设计上组装应该写 `0` 占位、锁内回填，
实际变成"锁外组装 ++ 一次 + 锁内回填再 ++ 一次"。

**真根因**：组装处锁外 `++` 与另一线程锁内回填 `++` 的竞态
（volatile 只治了编译器优化，治不了两处都在 ++ 的逻辑错误）；
空耗 108 万也由此而来（每个 resp/data/fin 组装都空 ++）。

### 改动

四处组装点 `++g_seq` → `0`（纯占位，与 v7.3 设计对齐）。
现在 `++g_seq` 仅剩 4 处，全部在锁内：stage / helper(data 回填) /
gap / fin 回填。

### 教训

**批量改造必须全量核对**——v7.3 的 python 脚本只替换了它断言过的
锚点片段，残留的组装处 `++` 让"锁内取号"名存实亡。真根因被
volatile 假象掩盖了一轮。

### 实证（待真机）

判读：重复 seq 0 + max seq ≈ 行数（空耗消失）。

## [7.4] - 2026-10-26 · volatile-seq

### 动机：v7.3 判读——重复 seq 6 个 ×2（fin 与 req-delegate 撞号）

回填逻辑本身正确（JSON 全合法、无损坏、无 seq=0 泄漏），但撞号在
**两把锁都持有时**发生——纯软件解释只剩一个：**`g_seq` 非 volatile**，
O2 下编译器把锁内 `++g_seq` 视为单线程语义优化（缓存寄存器跨锁边界），
两个线程读到同一旧值 → 撞号。锁 protect 的是访存次序，编译器不知道。

### 改动

`g_seq` 声明加 `volatile`（一行）——取号必须真访存，编译器不得优化。

### 判读

豆瓣稳定 + 重复 seq 6 → 0。乱序"大跳"（331 处 >100）另案：大跳 = 消费
规范已知的 fin 多态 + diag 标记 + 多时钟域 ts 不可排序的合成现象，
seq 本身无重复即锚序可用（AI 消费以"seq 唯一且递增"为准）。

### 实证（待真机）

86736B，md5 `0901ad69`。

## [7.3] - 2026-10-26 · seq-atomic

### 动机：v7.2 数据体检——seq 锚序偶发 ±1 错位

740 行体检发现 seq 乱序 6 处，全部为相邻 swap（±1~2）：
`++g_seq`（锁外分配）与写盘**非原子成对**——两个线程各自拿到 seq 后，
落盘顺序可交错。seq 定位是"唯一可靠锚点"，不该有毛刺。

### 改动（四处调用点统一模式）

- 行组装时 `seq` 写 **0 占位**
- 写盘时持锁**原位回填**：`strstr(line, "\"seq\":")` 定位占位符，
  `++g_seq` 后 snprintf 覆盖（数字可右移，缓冲尺寸按原 line 计算）——
  **分配与写盘在同一临界区内**，落盘顺序 ≡ seq 顺序
- fin/data/req/req-delegate 四处全部改造；本地单测验证回填后 JSON 合法
  （多位数右移安全）
- 附加 `lc_write_seq_locked` helper（data 行用；req/fin 因行已整体组装
  用内联回填）

### 判读

豆瓣稳定 + 下一轮日志 seq 乱序 6 → 0。

### 实证（待真机）

86736B，md5 `3a2d8781`。

## [7.2] - 2026-10-26 · reqbody

### 动机：广告 SDK 上报内容取证

POST 请求的 `bodyLen` 有、内容无——穿山甲 `stats/batch`、腾讯
`sdk.e.qq.com/event` 这类上报的**请求体**正是"SDK 在传什么数据"的直接证据
（设备指纹 / 行为流标 / 归因字段都在里面）。

### 改动

- 两个创建 hook 里对 `HTTPBody`（NSData）非空且 ≤2MB 的请求，
  `bytes` 浅层 selector 取指针后写 `Documents/lcf-req/<tid>-<method>.bin`
  （锁外 IO——铁律）。HTTPBodyStream 的请求跳过（流式无内容可取）。
- 目录 `lcf-req/` 与 `lcf-resp/` 平行，tid 仍是对接键。

### 判读

豆瓣稳定 + `lcf-req/` 出现 `*-POST.bin` 文件，内容与 `stats/batch` 等
URL 对上 = SDK 上报取证能力达成。

### 实证（待真机）

70176B，md5 `af1b1328`。

## [7.1] - 2026-10-26 · taskkey

### 动机：v7.0 数据挖出 tid 复用——重组串写风险

深挖 v7.0 会话发现 **tid 非全局唯一**：fin 之后同 tid 会再开新请求
（连接池复用 task 对象），一轮 57 次复用、20 个 tid 被多 URL 共用。
重组槽以单 tid 为键 → 结构上会串写（本轮 18 文件=18 data tid 是侥幸）。
另 fin 236/303 条 status=-1（fin 时 task.response 未填充——失败/取消/重定向中）。

### 改动

- **重组键 (tid, taskkey) 双键**：taskkey = self 指针（task 对象唯一），
  slot 查找/创建/摘槽全部双键；文件名不变（tid 仍首选标识），
  同 tid 不同 task 的槽互不干扰
- **fin 行 +errCode**：status=-1 时可区分失败类型——
  `errCode` 是 NSError 的 @property（浅层 selector，安全；
  与 localizedDescription 的 UserInfo 深求值不同）

### 实证（待真机）

70096B，md5 `90cd370e`。判读：豆瓣稳定 + lcf-resp/ 文件持续产出 +
fin 行 errCode 字段出现。

## [7.0] - 2026-10-26 · threadsafe-take

### 动机：v6.9 重组功能验证通过但豆瓣不可用（黑屏/卡死待定性）

v6.9 的重组落盘功能本身验证通过（4 个 `.bin` 文件落盘，JSON 内容可读：
`{"id":0,...,"type":"group"}` / `{}` / HTTPDNS ping 配置——content.text 对标达成），
但豆瓣不可用。代码复审发现 `lcf_reasm_take_slot` 的 **`static reasm_t out`
线程不安全**：线程 A 摘槽 → write_file（IO 慢）期间线程 B 摘槽会覆盖
static 区 → A 写的是 B 的指针 → use-after-overwrite / 双重 free。
豆瓣并发高（26 fin/107 行），JavDB 低（首个 fin 都晚）——暴露模式吻合。

### 改动

- `take_slot` 改堆分配返回（调用方 free 本体 + buf），竞态根除
- `didfin` 调用点适配（buf/本体分别 free）

### 实证（待真机）

70064B，md5 `707b51c3`。

## [6.9] - 2026-10-26 · reasm-flush

### 动机：HAR 对标最后一块——完整响应体落盘

重组槽（v6.4 起在数据通路正常工作）的 flush 自 v6.0 起禁用至今。
v6.9 用锁纪律重构恢复：**持锁区只做浅层摘槽（指针交换），IO 全部锁外**。

### 改动

- `lcf_reasm_flush_locked` 拆分为：
  - `lcf_reasm_take_slot`（持锁）：槽内容浅拷贝到静态 out + 槽清零，零 IO
  - `lcf_reasm_write_file`（锁外）：mkdir + open + write
- `didfin_hook` 锁序（静态校验通过）：
  `lock→write_locked(fin行)→unlock` → `lock→take_slot→unlock` → `write_file` → survived
- fin 行与 flush 全部恢复，task 生命周期 + 完整响应体能力闭合

### 判读

豆瓣稳定 + `Documents/lcf-resp/` 目录出现 `<tid>-<status>-<type>.bin` 文件
（json/html/img…）且内容可解析 = **HAR 对标 100% 闭环**（含超越项）。

### 实证（待真机）

70112B，md5 `20971e32`。

## [6.8] - 2026-10-26 · task-resp

### 动机：v6.7 排除法收口——崩在 hook 存在本身

allHeaderFields 剥除后豆瓣仍在 `diag-resp-enter` 崩。此时 `lcf_resp_line`
剩余代码全部浅层安全（statusCode/MIMEType/UTF8String/判空/持锁写）——
排除法只剩结论：**`connection:didReceiveResponse:completion:` 这个 hook
的存在本身致崩**（疑 CFNetwork 内部存在非 msgSend 调用路径，与我们的
C 函数签名不匹配）。`diag-resp2-enter` 也从未出现 = redirect 变体不在通路。

### 改动（换思路：零新 hook 面拿状态码）

- 卸载 connection:/redirect: 两个 resp hook（回 v6.4 安全面）
- **fin 行加 status/mime**：`task.response`（NSURLSessionTask 公开属性）→
  isKindOfClass 判别 → statusCode（全浅层）——resp 能力等价达成
  （时点从"响应到达"挪到"task 结束"，对 AI 分析无差）
- fin 行格式：`state / status / mime / tid`

### 实证（待真机）

70016B，md5 见 git。判读：豆瓣 fin 行带 status 出现且稳定 = resp 能力
以零风险方式达成；后续仅剩 flush 移锁外。

## [6.7] - 2026-10-26 · shallow-resp

### 动机：v6.6 巨大进展 + 新崩点精准暴露

- **fin 行全线打通**（JavDB 7 条 / 豆瓣 3 条，survived 成对）——
  localizedDescription 根因修复 ✅
- **`diag-resp-enter` 首次出现**（豆瓣）——`connection:didReceiveResponse:completion:`
  在数据通路上！resp 通路打通的**瞬间**豆瓣崩 = 崩点在 `lcf_resp_line`
  的 ishttp 判别之后：**`allHeaderFields`**——又一个惰性求值深属性，
  与 localizedDescription 同坑（v6.6 铁律的第一例案）。

### 改动

encjson 段（allHeaderFields → objectForKeyedSubscript → Content-Encoding）
整体剥除。resp 行只留 `status` + `mime`（浅层 selector）。
Content-Encoding 需求由 mime 字段近似覆盖。

### 实证（待真机）

70160B，md5 `cfff3c01`。判读：豆瓣 resp 行出现 + 稳定 = v6.6 铁律再次验证，
HAR 对标仅剩 flush 移锁外一项。

---

## [6.6] - 2026-10-26 · no-errdesc

### 动机：v6.5 双 App 崩在 diag-fin-enter——凶手二分完成

v6.3 空壳稳定 / v6.5 只加回 fin 行就崩——差异只剩 fin 行写入的三步：
`msgSend(self, s_tid)`（空壳也有，安全）／ `lc_write_locked`（v5.x 同款，安全）／
**`msgSend(error, localizedDescription)`（v6.0 与 v6.5 都有，v6.3 没有）**。
统一解释成立：**localizedDescription 就是崩点**——NSError 的 UserInfo
惰性求值在 LC guest 环境触发链式内部调用，不安全。

### 改动

fin 行**不碰 error 对象**：`state:"err"/"ok"` 只按 error 非 nil 判定，
错误摘要放弃。fin 能力保住。

### 教训（铁律候选第三条 ObjC 版）

**不要对 hook 回调的参数做深属性求值**（localizedDescription / debugDescription /
UserInfo 这类惰性求值属性）——LC guest 环境下不安全；浅层 selector
（statusCode / length / 指针判空）才可以。

### 实证（待真机）

86672B，md5 `3f8b5bec`。判读：fin 行（无 err 字段）+ survived 成对 = 全绿；
flush 重组恢复（移锁外）留 v6.7。

## [6.5] - 2026-10-26 · fin-restore

### 动机：v6.4 双 App 全绿后的两项收尾

1. **fin 行恢复**（第一步）：didfin 主体只恢复 fin 行写入（持锁写，
   无 flush——v6.0 崩点嫌疑是 flush 的 open/mkdir/write，先隔离验证）。
   fin 行 state:ok/err + 错误摘要，task 生命周期闭合。
2. **resp 行换 selector**：`_onqueue_didReceiveResponse:completion:` 已被
   v6.2-v6.4 诊断证实不在豆瓣/JavDB 数据通路（enter 从未出现），改装两个
   探针名单内的替代并观察谁在通路上：
   - `connection:didReceiveResponse:completion:`（delegate 回调同形）
   - `_onqueue_didReceiveResponse:redirectRequest:withCompletion:`（redirect 变体，
     独立 hook 函数 didresp2_hook，3 参直调）

### 判读

- fin 行出现且 App 稳定 = fin 行写入安全（v6.0 崩点锁定 flush），
  下版解锁外 flush
- `diag-resp2-enter` 或 resp 行出现 = resp 通路打通（HAR 对标最后一格）
- 任何不稳 → 按标记回退对应项

### 实证（待真机）

86672B，md5 `101d6899`。S5-meta-hooked 计数含 resp2（最高 3）。

## [6.4] - 2026-10-26 · deadlock-fix

### 动机：v6.3 双 App 分流——JavDB 恢复、豆瓣黑屏（非闪退）

- **JavDB**：`fin-enter → fin-survived` 成对出现，3 条 req 正常——
  **v6.0/v6.1 的闪退凶手确认在 didfin 主体** ✅
- **豆瓣**：进程活着但黑屏，日志停在 `data` 行（tid=1 第一片）——
  stage 序列里**没有 `diag-reasm-enter`**，而 data 行（写在 append 之前）
  已落盘 → 卡死点 = `lc_stage("diag-reasm-enter")` 本身！

### 根因（与 v4.1 同型的死锁第二次复发）

`didd_hook` 的执行序是 `lc_lock() → lc_write_locked → [持锁区] lc_stage(...)`，
而 `lc_stage` 内部会 `lc_lock()`——**同一自旋锁不可重入**，
网络队列线程自己等自己 → 主线程等网络 → 黑屏挂起（死锁不崩溃，
所以不是闪退而是僵死）。v6.2 的诊断标记本身成了死锁点。

### 改动

- `didd_hook`：诊断标记移到拿锁**之前**/锁释放**之后**；
  持锁区内只剩 `lc_write_locked`（不拿锁）和 `lcf_reasm_append_locked`
  （不拿锁）——持锁区净空
- `didfin_hook` 主体继续禁用（其 flush 含 open/mkdir/write，
  恢复时必须移到锁外，留待下版）

### 判读

豆瓣恢复（data 行后继续 req 流）+ `diag-reasm-enter/survived` 成对出现。

### 实证

70048B，md5 `c92afebd`。

### 铁律重申（第三次踩同一坑）

**持锁区内禁止调用任何内部拿锁的函数**（lc_stage/lc_emit/…）。
v4.1 教训只写了"emit"，lc_stage 是同一个坑的另一个入口——
规则应表述为：自旋锁不可重入，持锁区只调 *_locked 变体。

---

## [6.3] - 2026-10-26 · fin-nop

### 动机：v6.2 诊断标记锁定凶手范围

双 App 的 base 日志都停在 **`diag-fin-enter`**（survived 未出现）——
凶手在 `didfin_hook` 的主体内。另有重大旁证：`diag-resp-enter` 双 App
**一次都没出现**——`_onqueue_didReceiveResponse:completion:` 根本不在
豆瓣/JavDB 的数据通路上（response 事件走的是其他 selector，
如 `_onqueue_didReceiveResponse:redirectRequest:withCompletion:`），
它只是恰好存在所以 hook 装上了。

### 改动（二分）

`didfin_hook` 主体整段 `#if 0` 禁用（fin 行 + 重组 flush），
只留 enter/survived 标记 + 原 IMP 直调。

### 判读

| 结果 | 结论 |
|------|------|
| 稳定（fin-enter → fin-survived 成对出现） | 凶手在主体内，v6.4 逐段恢复定位 |
| 仍崩在 fin-enter 后 | 凶手在 `msgSend(self, s_tid)` 或 **原 IMP 直调本身**（hook 这个 selector 的行为就不安全，放弃 fin 能力）|

### 实证（待真机）

70048B，md5 `6a88e72a`。

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
