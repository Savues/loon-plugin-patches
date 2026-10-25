# 更新记录 · lcf-resp

每版四要素：动机 / 改动 / 实证 / 教训。

---

## [0.2-probe] - 2026-10-25 · introspect+retry

### 动机：v0.1 两轮真机零产出

豆瓣两轮冷启动（pid 61693/61706）都没有 `lcf-resp.jsonl`。排查链：
Mach-O 结构级对比（flags/platform/LC_ID）与 base 完全一致、Sign 时序无问题、
用户确认全局 Tweaks 目录默认生效——嫌疑收敛到**探针自身的写入设计**：
v0.1 的全部写入都发生在 ctor（5 行一次写完），而 ctor 时刻 guest 沙盒未就绪
（base v2.x 时代已实证"ctor 早期写入必静默失败"），**open 全失败且 v0.1
没有重试机制 → 产物全部蒸发**。base 没这个问题是因为它每次 hook 触发都会
重开 fd——探针版漏掉了这个惰性重试设计。

### 改动

- introspection 从 ctor 移到后台线程：轮询 base 日志（`forensics.jsonl`）
  的出现作为"沙盒已就绪"信号（最多等 120s），就绪后再 introspect
- 写入前置探活：introspect 前先确认目标文件可 open（3 次重试）
- `lc_write` 保留每次重开 fd 的重试语义（与 base 同款）
- 版本号 `0.2-probe`，二进制自证不变（无 `method_setImplementation` /
  无 `objc_getClassList`）

### 实证（待真机）

构建校验 67904B，`pthread_create` 引用确认等待线程已入链，md5 `d28c7080`。
预期：豆瓣启动后 `lcf-resp.jsonl` 出现 `ctor → probe×3 → done`。

### 教训

**探针/模块的任何写盘动作都不能只依赖 ctor 时机**——沙盒就绪信号必须显式等待。
"同目录另一个模块能写"不是"我的 ctor 也能写"的证明：base 的首写发生在
hook 触发时（晚于沙盒就绪），探针的首写在 ctor（早于）——同类机制在不同
时机下行为完全不同。


### 动机

base 模块（lc-forensics v4.7）已定型且真机验证通过，按既定拆分决策启动 P2
（响应体捕获）。第一性问题：数据到达的私有 selector 名随 iOS 版本浮动，
不能靠猜——v4.0~v4.4 的教训是"碰运气 hook = 闪退三连"，必须先 introspect 后 hook。

### 改动

- **零 hook 探针**：仅对 3 个确定性系统类做 `class_copyMethodList` 单类方法表
  introspection（`__NSCFLocalSessionTask` / `__NSCFURLSessionTask` /
  `__NSCFLocalSessionDataTask`），全部 selector 名落盘
- 文件独立：`Documents/lcf-resp.jsonl`（与 base 的 forensics.jsonl 完全隔离）
- 候选自动标记：`cands` = 名字含 `didReceiveData`/`didReceive`/`_onqueue` 的方法数
- 二进制安全自证：**无 `method_setImplementation` 引用、无 `objc_getClassList` 引用**
  （探针零 hook 的结构性证明，md5 见 git）

### 实证（待真机）

- 构建校验：外部符号 19 个全部 dynamic_lookup，introspection 所需
  `class_copyMethodList`/`method_getName`/`sel_getName` 全部在绑定表 ✅
- 预期：豆瓣/JavDB 任意运行后 `lcf-resp.jsonl` 出现 `ctor → probe×3 → done` 四类行

### 判读目标（下一步）

从名单中锁定数据接收 selector（优先 `_onqueue_didReceiveData:` 一族），
出 v0.2-probe 单 selector hook 版——流程照搬 v4.4：单点安装、分阶段同步落盘、豆瓣二分。
