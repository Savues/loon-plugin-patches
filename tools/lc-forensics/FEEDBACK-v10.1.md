# lc-forensics v10.1 更新反馈

> 来源：RedPaper 插件开发全程（2026-10-26 ~ 10-27）
> 视角：**纯使用者**（模块由另一窗口维护）
> 验证数据：小红书 9.51.1 / LC 容器 `CA6E2D16` / 单 session 750 行日志

---

## 一、总体评价

**这次更新解决了使用中最痛的两个问题，体验有质的变化。**

| 维度 | 评价 |
|---|---|
| 修复完整度 | **5 项反馈全部修复 + 额外修了 1 项** |
| 数据可信度 | 从「经常拿错数据」变成「可以直接信任」 |
| 分析效率 | 从「翻日志 + 猜」变成「一行 index 定位」 |

---

## 二、五项反馈修复验证

### ① tid 复用（P0）✅ 彻底解决

**旧版问题**
```
tid 复用率：12% ~ 46%
最大复用：单个 tid 对应 19 个不同 URL
后果：lcf-resp/<tid>-*.bin 互相覆盖
```

实测被误导过两次：

| 接口 | 文件显示 | 实际 |
|---|---:|---:|
| `followings/reddot` | 8MB | 300B |
| `lng/collect` | 8MB | 41B |

**新版表现**
```
文件名格式：<tid>-<taskkey8>-<status>.<ext>
示例：1-334a2000-200.json
实测：tid=1 产生 17 份独立文件，互不覆盖
```

**验证**：`followings/reddot` 现在正确显示 **51B**，不再是 8MB 假数据。

**评价**：这是最有价值的修复。响应体落盘能力终于可以信任了。

---

### ② preview 长度（P0）✅ 提升 3 倍

| 指标 | 旧版 | 新版 | 变化 |
|---|---:|---:|---|
| 平均长度 | 95 字符 | **302 字符** | 3.2 倍 |
| 最大长度 | 121 字符 | **505 字符** | 4.2 倍 |

**实际影响**：以前 JSON 结构看不全，必须依赖响应文件；现在大部分场景 preview 就能判断。

**建议（可选）**：如果未来还要加长，考虑对 JSON 做**结构摘要**而非纯截断，例如：
```json
{"data.ads_groups[0].ads": "22 条", "data.bidding_ads": "0 条", "_truncated": true}
```

---

### ③ 扩展名识别（P1）✅ 基本修复

| 类型 | 旧版 | 新版 |
|---|---:|---:|
| json | 0 | **135** |
| jpg | 0 | **8** |
| html | 0 | **1** |
| bin | **1638（100%）** | **14** |

识别率从 0% 提升到 **91%**（144/158）。

**遗留问题**（详见第四节）：14 个 bin 里有 **6 个其实是 JSON**。

---

### ④ index.jsonl（P2）✅ 新增，超出预期

```json
{"tid":1,"taskkey":"35ebe300","url":"http://sns-na-i1.xhscdn.com/","status":403,"bytes":150,"file":"1-35ebe300-403.html"}
```

**实际使用对比**

| 场景 | 旧版 | 新版 |
|---|---|---|
| 找某接口的响应文件 | 翻日志找 tid → 找文件 → 发现被覆盖 | `index.jsonl` 一行定位 |
| 判断是否被拦截 | 只能看 data 行累计字节 | 直接看 `bytes` + `file` |

**我的实际用法**：
```python
for line in open('lcf-resp/index.jsonl'):
    o = json.loads(line)
    if 'ads/resource' in o['url']:
        print(o['file'], o['bytes'])   # → 53-59041880-200.bin  2
```

**评价**：这个字段组合（tid/taskkey/url/status/bytes/file）刚好覆盖定位需求，没有多余字段。

---

### ⑤ fin 行带 url（P1）✅ 修复

```
旧版：fin 行只有 tid / state / status / errCode / mime
新版：165/166 条带 url（99%）
```

**唯一缺失的 1 条**：
```json
{"seq":24,"ev":"fin","tid":1,"url":"","state":"err","status":-1,"errCode":-999,"mime":""}
```
`errCode=-999` 是网络失败请求，**本就无 URL**，合理。

**评价**：现在可以直接回答「哪个请求失败了」，不用回查 req 行（以前因为 tid 复用，回查也不可靠）。

---

### ⑥ stage 行加 selector 名单（额外修复，我没提但很实用）

```diff
- "tag":"S3-hooked:2"
+ "tag":"S3-hooked:2:dtwrh,dtwr"

- "tag":"S4-data-hooked:3"
+ "tag":"S4-data-hooked:3:didd1,didd2"

- "tag":"S5-meta-hooked:1"
+ "tag":"S5-meta-hooked:1:fin"
```

**价值**：排查 hook 问题（比如「为什么某些请求抓不到」）时，能直接看到 hook 了哪些 selector，不用去翻模块源码。

---

## 三、用新日志验证插件效果

配合 `index.jsonl`，验证 RedPaper v1.5.1 的实际效果变成了一行命令的事：

| 接口 | 响应 | 结论 |
|---|---:|---|
| `ads/resource` | **2B `{}`** | reject_dict 生效 |
| `search/trending` | **25B** | delete data 生效 |
| `fls/placeholder` | **173B** | delete placeholder 生效 |
| `splash_config` | **2944B**（原 97KB） | 清空 ads 生效 |
| `message/config` | 42650B | in_app_push 已删 |
| `getflowlist` | **77B**（原 24KB） | behaviorFlowList 已删 |

**验证脚本**（现在只需 5 行）：
```python
import json
for line in open('lcf-resp/index.jsonl'):
    o = json.loads(line)
    for t in ['ads/resource','search/trending','fls/placeholder']:
        if t in o['url']:
            print(f"{t}: {o['bytes']}B → {o['file']}")
```

---

## 四、遗留问题（不阻塞使用）

### 1. 6 个 `{}` 响应被存成 `.bin` 🟡

**现象**
```
73-59a19c00-200.bin   2B   magic=7b7d   ← 实际是 {}
43-33c0ea00-200.bin   2B   magic=7b7d
1-59291f80-200.bin    2B   magic=7b7d
...共 6 个
```

**根因推断**：`reject_dict` 拦截后返回 2 字节 `{}`，响应头里没有 Content-Type → `mime` 为空 → 落到 `bin` 分支。

**建议**：加 magic bytes 兜底
```c
if (len >= 2 && ((buf[0]=='{' && buf[1]=='}') || (buf[0]=='{' && buf[1]=='"') || buf[0]=='['))
    type = "json";
```

**影响评估**：**很小**。这 6 个都是插件 reject 的占位，恰好是「规则生效」的证据。只是扩展名不直观。

---

### 2. 6 个 HEIC 图片存成 `.bin` 🟢 可接受

```
magic = 00 00 00 1c 66 74 79 70 68 65 69 63   → "....ftypheic"
```

HEIC 没有通用扩展名（`.heic` 在多数工具里不识别），存 `.bin` 合理。

**如果想让类型更清晰**：可以用 `.heic` 或保持 `.bin`，两者差别不大。

---

### 3. 2 个未知 magic 🟢 正常

```
3-35717800-200.bin   128B   magic=31663737  → "1f7798a3..." 加密数据（DNSPod conf）
5-3744b100-200.bin   160B   magic=49a304a9  → 未知二进制
```

都是加密/私有格式，存 `.bin` 正确。

---

## 五、对未来版本的期望（按优先级）

| 优先级 | 期望 | 理由 |
|---|---|---|
| **P1** | magic bytes 兜底判 JSON（`{}` / `{"` / `[`） | 6 个误判，修复成本低 |
| **P2** | `data` 行也带 `taskkey` 字段 | 现在只有 index.jsonl 有，日志行没有；跨文件关联时更方便 |
| **P3** | preview 支持 JSON 结构摘要 | 505 字符对复杂嵌套仍不够，摘要比截断信息密度高 |
| **P3** | index.jsonl 增加 `requrl` 完整版 | 当前 url 是完整 URL（含 query），很好；仅提示保持 |

---

## 六、做得好的地方（希望保持）

| 特性 | 为什么好 |
|---|---|
| **taskkey 进文件名** | 彻底解决覆盖问题，且向后兼容（旧文件仍可读） |
| **index.jsonl 字段设计** | tid/taskkey/url/status/bytes/file 刚好够用，无冗余 |
| **每次启动独立文件** | v9.7 起的核心设计，避免跨 session 污染 |
| **seq 连续锚序** | 时钟不可靠时唯一可靠的时间线 |
| **req / fin / data 三类行分离** | 职责清晰，比混在一起好分析 |
| **stage 行带 selector 名单** | 排查 hook 问题不用翻源码 |
| **零 App 特定逻辑** | 装一次通用 |

---

## 七、一句话总结

> **v10.1 把「响应体落盘」这个核心能力从「经常不可信」变成「可以直接信任」，
> 加上 index.jsonl 的定位能力，使用体验是质变。**
>
> 唯一值得再修的是 6 个 `{}` 被存成 `.bin`（magic bytes 兜底即可），
> 其余遗留项都不影响实际使用。

---

## 附：本次验证的完整数据

```
模块版本：10.1-fix-url-ext-status
dylib 大小：106544B
日志文件：forensics-20261026T191645Z-69208.jsonl（750 行）
响应文件：158 个（json 135 / jpg 8 / html 1 / bin 14）
index.jsonl：161 行
行类型：data 454 / fin 166 / req-delegate 103 / req 10 / stage 17
```
