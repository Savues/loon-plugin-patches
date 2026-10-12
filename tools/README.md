# tools · 抓包对比工具 · HAR Diff Tool

## har-diff.py — 抓包对比 · HAR Diff

对比两份 HAR，输出「插件改了哪些字段」并**检测无效改动**。

### 为什么需要它 · Why

Loon 插件改响应体时，**「注入成功」不等于「生效」**。

2026-09-27 踩过的坑：空间页响应里有**两份 `vip`** ——

| | 注入前 | 注入后 | 谁在读 |
|---|---|---|---|
| `data.vip.vipStatus` | 无字段 | `1` | 其他页面 |
| **`data.card.vip.vipStatus`** | **`0`** | **`0`** | **主页顶栏** |

字段值全对，**但写在没人读的字段上** —— 顶栏一直显示灰色，连改两版才通过抓包对比定位。

这个坑靠读代码发现不了，**只能靠「注入前 vs 注入后」的抓包对比**。

### 用法 · Usage

```bash
# 插件关 vs 插件开
python3 har-diff.py baseline.har modified.har

# 只列端点
python3 har-diff.py --list modified.har

# 只看某端点
python3 har-diff.py baseline.har modified.har --endpoint /x/v2/space

# 机器可读
python3 har-diff.py baseline.har modified.har --json
```

### 输出 · Output

```
▌/x/v2/space   +22 -0 ~1
     + data.vip.vipStatus = 1
     ⚠ vipStatus 两处不一致：
        data.card.vip.vipStatus = 0   (未跟随)
        data.vip.vipStatus = 1         (本次已改)
       若 App 读后者，前者改动不会生效
```

**`⚠` 是核心** —— 它把「改了 A 副本却漏了孪生副本 B」直接指出来。

### 检测规则 · Detection rules

1. **base64 自动解码** —— iOS 抓包的 `content.text` 常是 base64
2. **递归拍平** —— `data.card.vip.vipStatus` 变成点路径，逐字段对比
3. **孪生字段检测** —— 同名字段分布在多个容器时（`data.vip` ↔ `data.card.vip`），
   **改完后值不一致**就报警。判据是「值是否一致」而非「是否被碰过」
   —— 值本来就对、被重复写入，同样算一致，不该误报
4. **容器末段约束** —— 只比较 `data.vip` ↔ `data.card.vip` 这类孪生，
   否则 `text`/`name` 这类叶子会满树误报
5. **端点集合校验** —— 两次抓包范围不同会提示，对比结果不可靠

### 验证 · Regression

用 2026-09-27 的真实抓包回归：

| 对比 | 警告数 | 结论 |
|---|---|---|
| 基线 vs v7.10（有 bug） | **11** | 精准命中 `vipStatus` / `label_theme` / `text` |
| 基线 vs v7.11（已修） | **1** | 残留提示 |
