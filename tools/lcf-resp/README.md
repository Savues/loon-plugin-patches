# lcf-resp · 响应体捕获模块（探针阶段）

> Live Container 的第二个取证 dylib，与常驻的
> [lc-forensics](../lc-forensics/)（base）互补：base 记录**请求流**，
> lcf-resp 记录**响应体**，用 `tid`（task.taskIdentifier）拼接成
> "请求→响应"对——这是清洗类规则定位的原料。

## 模块定位（用户裁决的拆分原则）

| | lc-forensics (base) | lcf-resp |
|---|---|---|
| 生命周期 | 常驻（每次冷启动都取证） | **按需** Import / 删除 |
| hook 面 | 基类 2 个创建 selector（已实证安全） | 数据接收 selector（探针验证中） |
| 产出 | `forensics.jsonl`（请求流） | `lcf-resp.jsonl`（响应体） |
| 拼接键 | `tid` | `tid` |

**风险隔离**：resp 崩溃/触发风控 → 删掉它，base 照常工作，主取证能力永不陪葬。
**文件隔离**：独立写 `Documents/lcf-resp.jsonl`，绝不与 base 共享文件（并发写交错）。

## 探针路线（v4.4 二分方法学的复用）

数据到达的内部 selector 名随 iOS 版本浮动，**不能靠猜**，流程：

```
v0.1-probe (零hook, 零风险)
  └─ 对 __NSCFLocalSessionTask / __NSCFURLSessionTask / __NSCFLocalSessionDataTask
     做 class_copyMethodList 单类方法表 introspection (非铁律3禁止的全局枚举)
  └─ 名单落盘 → 真机日志确定带 didReceiveData/_onqueue 语义的候选
v0.2-probe
  └─ hook 候选 selector (setImplementation + 原IMP直调, 同 base 安全模式)
  └─ 豆瓣真机验证: 不崩 + 能抓到数据分片
v0.1+ (转正)
  └─ 分片重组 + tid 关联 + preview 上限 (64KB) + CHANGELOG 起步
```

每一步都可以"遇风控即删"，base 无感。

## 输出格式（探针版）

```json
{"ts":1792949xxx.xxx,"ev":"probe","cls":"__NSCFLocalSessionTask",
 "methods":37,"cands":4,"list":"init|resume|_onqueue_didReceiveData:...|...","v":"0.1-probe","pid":N}
```

- `methods` = 方法表总数；`cands` = 名字含 `didReceiveData`/`didReceive`/`_onqueue` 的候选数
- `list` = 全部 selector 名（`|` 分隔）——探针版的判读对象
- `absent:1` = 该类在当前 App runtime 不存在（对照信息）

## 判读指南（v0.1 → v0.2）

优先级（按 iOS CFNetwork 内部结构常识 + 名字语义）：

1. `_onqueue_didReceiveData:` 一类——session task 的队列内数据回调，**首选**
2. `URLSession:dataTask:didReceiveData:` 的 task 侧对应物
3. 名单出来后与 HAR 已知的豆瓣响应（如 `erebor/interstitial` 1.2KB）交叉验证字节量

## 版本史

见 [CHANGELOG.md](CHANGELOG.md)。

## 维护约定

与 base 相同：每一项改动同步 git + 每版 CHANGELOG 四要素
（动机/改动/实证/教训）。提交标题带版本号。
