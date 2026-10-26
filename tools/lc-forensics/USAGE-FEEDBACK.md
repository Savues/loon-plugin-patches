# lc-forensics 使用体验反馈

> 来源：RedPaper 插件开发全程（2026-10-26 ~ 10-27）
> 视角：**纯使用者**（模块由另一窗口维护，本文只描述「用的时候遇到什么」）
> 数据：3 个 session 实测，小红书 9.51.1 / LC 容器 `CA6E2D16`

---

## 一、致命问题：tid 复用导致响应体不可靠

### 实测数据

| 日志文件 | tid 总数 | 复用数 | 占比 | 最大复用 |
|---|---:|---:|---:|---:|
| `forensics-20261026T130825Z-66785` | 136 | 17 | 12% | **14 个不同 URL** |
| `forensics-20261026T173242Z-68499` | 110 | 51 | **46%** | **19 个不同 URL** |

### 表现

`lcf-resp/<tid>-<status>-<type>.bin` 会被后到的请求覆盖。
读某个接口的响应体时，经常拿到**另一个接口的数据**。

### 因此被误导过两次

| 接口 | 文件显示 | 实际 |
|---|---:|---:|
| `followings/reddot` | **8MB** | 300B |
| `lng/collect` | **8MB** | 41B |

### 我的绕法（很痛苦）

放弃响应文件，改用 `data` 行的 `requrl` + `src=didd1` 累计 `bytes`。
**但这只能拿到字节数，拿不到内容。**

### 建议

**首选**：文件名加 taskkey 短哈希
```
<tid>-<taskkey8>-<status>-<type>.bin
```
> 代码里 v7.1 注释说加了，实际没生效。

**退一步**：`data` 行加 `taskkey` 字段，使用者自行按 taskkey 聚合。

---

## 二、preview 太短，完全不够用

### 实测

```
样本 2000 条 data 行：
平均 95 字符，最大 121，最小 2
```

### 问题

JSON 结构根本看不全。例如：

```json
{"code":0,"success":true,"msg":"成功","data":{"in_app_push":{"permit_num":1,"period_m
```
到关键字段就断了。

想看 `splash_config` 里的 48 条广告，preview 只给到第一个广告的开头。
**只能靠响应文件，但响应文件又被 tid 复用污染。**

### 建议

- preview 长度可配置（默认 512 或 1024）
- 或对 JSON 响应做**结构摘要**：
  ```json
  {"data.ads_groups[0].ads": "22 条", "data.bidding_ads": "0 条"}
  ```

---

## 三、响应文件扩展名全是 `.bin`

### 实测

```
lcf-resp 共 1638 个文件，扩展名统计：
  1638  bin
```

### 问题

代码里有类型判断：
```c
if (strstr(mime, "json")) type = "json";
else if (strstr(mime, "html")) type = "html";
```
但实际全部落到 `bin` → **mime 传进来是空或不匹配**。

**影响**：必须先 `head -c` 看内容才能判断是 JSON 还是图片，很费事。

### 建议

修 mime 传递链路，或改用 **magic bytes** 判断：
```
{ 或 [        → json
PK            → zip
\xff\xd8\xff  → jpg
RIFF....WEBP  → webp
\x89PNG        → png
```

---

## 四、缺少「响应体与请求的关联索引」

### 问题

要定位某个接口的响应，流程是：

1. 从 `lcf-log` 找 `data` 行的 `tid`
2. 去 `lcf-resp` 找 `<tid>-*.bin`
3. 发现被覆盖了
4. 放弃

### 建议

输出 `index.jsonl`，每行：
```json
{"tid":1,"taskkey":"0x8f3a","url":"https://...","status":200,"bytes":51528,"file":"1-8f3a-200-bin.bin"}
```
这样 `jq` 一行就能定位。

---

## 五、`fin` 行与 `data` 行关联困难

### 问题

`fin` 行有 `status`/`mime`/`errCode`，但**没有 `url`**。

要判断「哪个请求失败了」，得：
1. 从 `fin` 行拿 `tid`
2. 回 `req`/`req-delegate` 行找同 tid 的 url
3. 但 tid 复用了，找到的可能不是同一个

### 实测例子

想查 placeholder 是否 200，结果 `tid=1` 对应了 20+ 个请求，无法判断。

### 建议

`fin` 行直接带 `url`（或至少带 `taskkey`）。

---

## 六、日志按 pid 分文件很好，但没有「启动序号」

### 现状（好的部分）

`forensics-<UTC>-<pid>.jsonl`，每次启动一个文件 —— **这个设计很好**，解决了覆盖问题。

### 小问题

文件名里的时间戳不可靠（时钟虚拟化）。想按时间顺序分析时，只能靠 `seq`。

### 建议

文件名加启动序号：`forensics-<UTC>-<pid>-<boot#>.jsonl`，
或 `latest.txt` 里记录「第几次启动」。

---

## 七、stage 行信息量不足

### 现状

```json
{"ev":"stage","tag":"S3-hooked:2"}
{"ev":"stage","tag":"S4-data-hooked:3"}
```

### 问题

`hooked:2` 是 hook 了 2 个 selector，但**没说是哪 2 个**。
排查时想知道具体 hook 了什么。

### 建议

`S3-hooked` 行带 selector 名单，或至少带数量 + 前 3 个名字。

---

## 八、做得好的地方（希望保持）

| 特性 | 为什么好 |
|---|---|
| **每次启动独立文件** | 彻底解决覆盖问题，v9.7 的核心改进 |
| **seq 严格连续锚序** | 时钟不可靠时，seq 是唯一可靠的时间线 |
| **req / fin / data 三类行分离** | 职责清晰，比混在一起好分析 |
| **响应体落盘** | 最有价值的能力，HAR 拿不到原始字节 |
| **零 App 特定逻辑** | 装一次通用，很好 |
| **`req` 行带 `bodyLen`** | 能快速找最大的 POST 请求 |

---

## 九、优先级建议

| 优先级 | 问题 | 理由 |
|---|---|---|
| **P0** | tid 复用 | 直接导致响应体不可信，最影响使用 |
| **P0** | preview 太短 | 看不到 JSON 结构，等于没有 |
| **P1** | `fin` 行缺 `url` | 无法判断「哪个请求失败了」 |
| **P1** | 扩展名全 `bin` | 增加判断成本 |
| **P2** | `index.jsonl` | 大幅提升定位效率 |
| **P2** | `stage` 行 selector 名单 | 排查 hook 问题时有用 |

---

## 十、一句话总结

> **这个模块最有价值的能力是「响应体落盘」和「每次启动独立文件」，
> 但 tid 复用把前者废掉了一半，preview 太短又让日志本身不够用。**
>
> 如果能修好 tid 复用（加 taskkey 到文件名）和 preview 长度，
> 使用体验会有质的变化。

---

## 附：实际使用中的绕法（供参考）

在模块修好前，我采用这些临时方案：

### 1. 判断响应真实大小
```python
# 不用文件大小（会被覆盖），用 data 行累计
agg = collections.defaultdict(int)
for line in open(log):
    o = json.loads(line)
    if o.get('ev') == 'data' and o.get('src') == 'didd1':
        agg[o['requrl'].split('?')[0]] += o.get('bytes', 0)
```

### 2. 读响应内容
```python
# 用 data 行的 preview 拼接（只能拿前 100 字符/分片）
chunks = []
for line in open(log):
    o = json.loads(line)
    if o.get('ev') == 'data' and 'target/url' in o.get('requrl','') and o.get('src')=='didd1':
        chunks.append(o.get('preview',''))
```

### 3. 交叉验证
HAR（实机）确认「插件生效」，lc-forensics（LC）确认「原始数据长什么样」。
**两者数据不同源，不能互相替代。**
