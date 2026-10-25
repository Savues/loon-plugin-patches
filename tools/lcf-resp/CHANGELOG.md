# 更新记录 · lcf-resp

每版四要素：动机 / 改动 / 实证 / 教训。

---

## [0.1-probe] - 2026-10-25 · introspect

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
