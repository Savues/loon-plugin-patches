# 交接材料 · Handoff (2026-10-26)

> 设备切换时用。换到新设备后，按「复测流程」跑一遍，与「基线结果」对照即可。

## 当前状态快照

| 项 | 值 |
|---|---|
| 仓库 | `Savues/loon-plugin-patches` @ `3024e0e`（已推，远端一致） |
| **Allinone** | **v8.0.2**（探针 `8.0.2`，`protobuf.response.js?v=725`） |
| **loon-sim** | **v1.7.5**（package.json + CHANGELOG 一致） |
| skill | loon-plugin-dev **v1.5.0**（pitfalls 17 条） |
| 插件数 | 37 个启用中（四旧件已归档到 `Bilibili-Allinone/archive/`） |

## 复测流程（新设备按序执行）

```bash
cd /var/minis/shared/loon-plugin-patches
git fetch origin && git merge --ff-only origin/main      # ① 对齐远端，必须到 3024e0e

# ② 版本核对（四行必须全部对得上）
python3 -c "import json;print('sim',json.load(open('tools/loon-sim/package.json'))['version'])"   # 1.7.5
head -1 plugins/Bilibili-Allinone/Bilibili-Allinone.lpx                                            # v8.0.2
grep -o 'reject(200, "[0-9.]*")' plugins/Bilibili-Allinone/Bilibili-Allinone.lpx                  # "8.0.2"
grep -o 'protobuf.response.js?v=[0-9]*' plugins/Bilibili-Allinone/Bilibili-Allinone.lpx            # v=725

# ③ 模拟器自测（必须 80 通过 0 失败）
node tools/loon-sim/selftest.js | tail -1

# ④ 清单静态检查（必须 0 错误 0 警告）
cd tools/loon-sim && node cli.js check ../../plugins/Bilibili-Allinone/Bilibili-Allinone.lpx

# ⑤ 探针命中实测（必须看到 reject(200, "8.0.2") ← 命中）
node cli.js run ../../plugins/Bilibili-Allinone/Bilibili-Allinone.lpx \
  --url "https://line3-h5-mobile-api.biligame.com/gw/loon-sim.probe/bilibili_allinone" --phase request

# ⑥ Allinone 五测试
cd ../../plugins/Bilibili-Allinone
node tests/test-ii.js        # 全部通过（11 项）
node tests/vip.test.mjs      # OK 66 cases
node tests/replay-splash.mjs # PASS: 全部通过
node tests/replay-mine.js    # Pass: 3, Fail: 0
node tests/lpx-verify.mjs    # 无 ✗

# ⑦ patches 五件套
cd ../../
node patches/test-airborne.js && node patches/test-airborne-proto.js \
  && node patches/test-airborne-fuzz.js && node patches/test-chronos.js \
  && python3 patches/check-airborne-lpx.py

# ⑧ loon-sim CI 六段（必须 ✅ 全部通过）
sh tools/loon-sim/ci.sh | tail -8

# ⑨ 部署物流审计（必须 ✅ 全过）
python3 tools/loon-sim/audit.py plugins/Bilibili-Allinone/Bilibili-Allinone.lpx
```

## 基线结果（2026-10-26 本设备实测，用于对照）

| 检查 | 期望输出 |
|---|---|
| selftest | `结果: 80 通过, 0 失败` |
| cli.js check | `0 错误, 0 警告  [Rule] 5 · [Script] 9 · [Rewrite] 15 · [Mitm] 6 · [Argument] 67` |
| 探针 run | `✓ request/reject(200, "8.0.2") ← 命中` |
| test-ii | `全部通过`（11 项） |
| vip.test | `OK 66 cases` |
| replay-splash | `PASS: 全部通过` |
| replay-mine | `Pass: 3, Fail: 0` |
| lpx-verify | `每个端点上运行的脚本集合一致 ✓` + `弹窗规则 命中 setting 且不误伤同形 ✓` |
| patches 五件套 | 全部通过 / 没有任何异常逃出 handler / 清单结构全部通过 |
| CI | `✅ CI 全部通过`（③ 段 `0错误: 37`） |
| audit | `══ audit 完成: 9 URL / 6 组多副本 ══` + `✅ 全过` |

## 已知的环境抖动（不是代码问题，别慌）

1. **selftest 偶发 4 项失败**（Rewrite 共享 state / timeout 检查 / dead-fn×2）
   → iSH 进程环境抖动。**直接复跑**，通常第二次就 79/80 全绿；连续 3 次仍红才算真问题。
   若持续红：`ps | awk '$4=="grep"'` 查僵死进程 → `pkill -9 grep` → 复跑。

2. **sh 脚本随机挂死**（卡点漂移、`$(cmd|sort)` 命令替换、循环体 grep）
   → iSH anon_inode EPIPE 缺陷（上游 ish-app/ish#1890 同族）。详见
   `tools/loon-sim/docs/ish-bug-report.md`。规避：逻辑走 python3；应急 `pkill -9 grep`。

3. **raw.githubusercontent CDN 缓存 5 分钟**
   → 核对线上内容一律用 GitHub API（`contents/<path>?ref=main`），不要用 raw。

## 两份 test-ii / 双副本提醒

`protobuf.response.js` 在 Allinone 里有**两份**：
- `upstream/` ← **lpx 实际引用**（权威版）
- `scripts/` ← test-ii 读取的副本

**改任何一份必须同步另一份**，否则出现「测试全绿但设备行为不对」或反过来。这是 2026-10-26 两次事故（伞复发 / 幂等守卫只改一份）的直接原因。audit.py 的②段会检查这一点。

## 待办 / 挂起项

| 事项 | 状态 |
|---|---|
| 青少年模式弹窗 | 新 mock（CloseStatus）已上线，等日常使用自然观察；弹窗有冷却机制无法专项测试 |
| 我的页国际版隐藏 id | 默认值已改 `741,1028`；**设备上已持久化的参数不会自动更新**，需手动改 |
| 四合一浸泡观察 | 换设备正好是一次新的真机验证窗口 |
| 归档 | 已完成（四旧件 → `Allinone/archive/`） |

## 换设备后要做的第一件事

```bash
cd /var/minis/shared/loon-plugin-patches && git fetch origin && git merge --ff-only origin/main && git log --oneline -1
```
确认到 `3024e0e`，然后从「复测流程」第②步开始。
