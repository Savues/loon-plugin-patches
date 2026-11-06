# loon-sim CI 性能分析报告

> 日期：2026-11-06
> 环境：iSH (Alpine 3.21.8, aarch64) / Node v22.23.2 / 仓库 `Savues/loon-plugin-patches`
> 现象：`sh tools/loon-sim/ci.sh` 一轮 **2–7 分钟**（方差很大）

---

**CI 慢的根本原因不是分析慢，是「进程启动次数」多。**

```
一轮 CI ≈ 222 次 node 进程启动 × ~260ms 冷启动 ≈ 大半时间在启动 node
实际插件分析只占每条约 100ms
```

Node 冷启动在 iSH 上是 **260ms**（空跑 `node -e "exit(0)"`）。
每段 CI 对**每个插件/文件**单独 `spawn` 一个新 node → 段数 × 插件数的乘积效应。

> ⚠️ **但这不等于能大幅优化**：单测+selftest 占 64% 且无法合批（见第六节），
> 合批 check/parity/dead-fn 的真实上限只有 **1.55x**，不是 5x。
> 3min 是 iSH 上 node 冷启动的**平台固有代价**。

---

## 二、各段计时

实测分段计时（`date +%s` 包裹，单次连续运行）：

| 段 | 内容 | 进程数 | 耗时 | 占比 |
|---|---|---:|---:|---:|
| ⑥ | 插件单测 `*/*.test.mjs` | 40 | 67s | **36%** |
| ⑤ | dead-fn `*/src/*.js` | 68 | 43s | **23%** |
| ① | selftest | ~24 | 36s | 19% |
| ③ | 全量 check `*/*.lpx` | 45 | 17s | 9% |
| ④ | parity `*/*.lpx` | 45 | 17s | 9% |
| ② | regression-history | 3 | 2s | 1% |
| | **合计** | **~225** | **182s ≈ 3.0 min** | |

## 三、单次开销拆解

| 测量 | 耗时 |
|---|---|
| `node -e "exit(0)"` 纯冷启动 | **260ms** |
| `cli.js check` 实际单次 | 359ms（= 260 启动 + ~100 分析） |
| `dead-fn.js` 最大文件(653KB) | 356ms（= 260 启动 + ~96 分析） |

→ **分析只占单次的 28%，其余 72% 是 node 启动 + V8 初始化 + 模块加载。**

## 四、进程数怎么算出来的

```
③ check    : plugins/*/*.lpx            → 45 个 lpx → 45 × node
④ parity   : plugins/*/*.lpx            → 45 × node
⑤ dead-fn  : plugins/*/src/*.js         → 68 × node
⑥ 单测     : plugins/*/test/*.test.mjs  → 40 × node
① selftest: 内部 execSync('node cli.js'/'dead-fn.js') × ~24
                                          ────
                                          ~222 次串行 node 启动
```

`222 × 260ms ≈ 58s` 纯冷启动 + `222 × 100ms ≈ 22s` 实际工作 ≈ 80s
剩余 ~100s 来自 ci.sh 的 shell 管道开销（`| tail -1 | grep`、`$(...)` 子 shell）
和 iSH 在 iOS 上的进程 fork/cow 抖动 —— 这也是 2min vs 7min 方差的来源。

---

## 五、为什么「分析」不慢

最重的单文件也只有几百 ms：

```
653KB  YouTube_Subtitles_Translate_response.js  → dead-fn 356ms
374KB  loon-itunes.js                           → 同量级
```

fixture 最大 81KB（YouTube-Dedup）。Allinone 的 `vip.test.mjs` 66 个 case 仅 **457ms**。

**没有单次操作是重的，慢在「重复启动 222 次」。**

---

## 六、优化方向（诚实核算 —— 已修正最初的高估）

我最初估算「合批可 3min→1min (5x)」是**错的**。重新核算如下：

| 段 | 现状 | 合批后(理论) | 可省 |
|---|---:|---:|---:|
| check(45) | 16.2s | 4.8s | 11.4s |
| parity(45) | 16.2s | 4.8s | 11.4s |
| dead-fn(68) | 24.2s | 6.8s | 17.4s |
| 单测(40) | 67.0s | **56.9s** | 仅 10s |
| selftest | 36.0s | **30.0s** | 仅 6s |
| **合计** | **160s** | **~103s** | **56s = 35%** |

**真实加速比：1.55x，不是 5x。**

### 为什么达不到 5x

单测(67s) 和 selftest(36s) = **103s，占 64%**，这两块**无法合批**：
- **单测**：40 个 `.test.mjs` 各测不同插件、不同 fixture，本身需要隔离进程
- **selftest**：测的就是「loon-sim 这个 CLI 的行为」，每个 case 必须重新 spawn 模拟器 —— 这是被测对象的固有属性，省不掉

所以合批的天花板是 **160s→~103s ≈ 2min**，肥肉（64%）碰不到。

### 合批可行性（已核实代码）

- `cmdCheck()` 的 `errs/warns/allScriptCode/definedKeys/usedInRules` 全是**函数内局部变量**，从 `lpx` 现场解析 → **无跨插件状态，合批安全**
- `dead-fn.js` 读单文件、`fs.readFileSync`，**stateless** → 合批安全
- 改动：`cli.js check --glob` / `dead-fn.js --glob`，进程内循环 + 逐个 re-parse

### 并行（xargs -P4）的现实性 —— 不推荐

- 单个 node 60–120MB，4 并行 ~400MB，iOS 后台易被 jettison
- iSH 已知 fork 僵死问题，**并行会放大**触发概率
- 收益不确定（iOS 热节流 + iSH 单进程调度）
- **风险 > 收益，不建议做**

### 最终建议（权衡后）

CI 是**偶尔跑的开发工具，不是热路径**。3min 的绝对耗时可以接受。

| 选项 | 收益 | 风险 | 建议 |
|---|---|---|---|
| 合批 dead-fn + check + parity | 省约 40s (1.4x) | 低（stateless 已核实） | 可做，但**非必需** |
| 砍单测/selftest | 碰不到（占 64%） | — | 无解 |
| 并行 | 不确定 | 高（iSH 僵死 + 内存） | **别做** |

**结论：优化现实可行，但收益远小于我最初声称的 5x。** 除非 CI 频繁到碍事，
否则**不值得投入**——3min 是 iSH 上 node 冷启动 260ms 的固有代价，根子是平台不是代码。

---

## 七、不构成问题的部分

- 单个插件的分析逻辑本身很快，**不需要**优化解析/正则
- fixture 体积合理（最大 81KB），不是瓶颈
- ② regression 2s、③④ check/parity 各 17s 已经很轻，主要肥肉在 ⑤⑥①

---

## 附：复现测量命令

```sh
cd /var/minis/shared/loon-plugin-patches
# 单次冷启动
python3 -c "import subprocess,time;t=time.time();subprocess.run(['node','-e','']);print((time.time()-t)*1000)"
# 各段计时
t0=$(date +%s); for f in plugins/*/src/*.js; do node tools/loon-sim/dead-fn.js "$f" >/dev/null 2>&1; done; echo "dead-fn: $(( $(date +%s)-t0 ))s"
# 进程数
printf 'lpx:%s src:%s test:%s\n' "$(ls plugins/*/*.lpx|wc -l)" "$(ls plugins/*/src/*.js|wc -l)" "$(ls plugins/*/test/*.test.mjs|wc -l)"
```
