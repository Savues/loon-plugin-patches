# loon-sim CI 性能分析报告

> 日期：2026-11-06
> 环境：iSH (Alpine 3.21.8, aarch64) / Node v22.23.2 / 仓库 `Savues/loon-plugin-patches`
> 现象：`sh tools/loon-sim/ci.sh` 一轮 **2–7 分钟**（方差很大）

---

## 一、结论（TL;DR）

**CI 慢的根本原因不是分析慢，是「进程启动次数」多。**

```
一轮 CI ≈ 222 次 node 进程启动 × ~300ms 冷启动 ≈ 95% 的时间在启动 node
实际插件分析只占每条约 100ms，全轮加起来不到 20s
```

Node 冷启动在 iSH 上是 **260ms**（空跑 `node -e "exit(0)"`）。
每段 CI 对**每个插件/文件**单独 `spawn` 一个新 node → 段数 × 插件数的乘积效应。

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

## 六、优化方向（按性价比）

| 方案 | 预期收益 | 改动量 |
|---|---|---|
| **① 合批**：check/parity/dead-fn 改成「一个 node 进程吃整个 glob」 | **~5x**（222→~30 次启动） | 中：cli.js 加 `--glob` 参数 |
| ② 单测常驻 worker | ~2x（⑥ 67s→~10s） | 中：需改造 test runner |
| ③ 并行 `xargs -P4` | ~3x（受 CPU 核数限制） | 低：改 ci.sh for 循环 |
| ④ 跳过未变更插件（增量 CI） | 视改动而定 | 高：需 git diff 集成 |
| ⑤ 砍 redundancy：parity/check 都遍历同一批 lpx，可合并遍历 | ~10% | 低 |

**性价比最高的是 ①：** 把 `cli.js check <file>` 改成 `cli.js check --glob 'plugins/*/*.lpx'`，
在单进程内循环，冷启动从 45 次降到 1 次。dead-fn 同理（68→1）。这一项就能把 3min 压到 ~1min。

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
