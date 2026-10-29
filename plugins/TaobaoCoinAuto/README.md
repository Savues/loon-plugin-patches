# 淘金币小镇 · 自动喂能量

淘宝「淘金币双11小游戏」（金币小镇 `pages-fast.m.taobao.com/wow/z/tmtjb/town/home`）自动化：
自动喂能量（长按主按钮的等价操作）+ 自动跳过升级动画。

## 原理（为什么不是普通接口拦截）

| 事实 | 证据 |
|------|------|
| 游戏是淘宝 WebView 里的 H5 | HAR `x-page-name: TBWebViewController`，Referer `pages-fast.m.taobao.com/wow/z/tmtjb/town/home` |
| 前端包 | `g.alicdn.com/code/npm/@ali/pegasus-project-taocoin-home/2.6.2/js/p_index.js` |
| 喂养接口 | `mtop.taobao.ia.foundation.feed`，`productCode=promotion1111`，`bizParams={walkGridNum, operationType, displayedSingleEnergyCost, hd_from}` |
| 领能量 | `mtop.taobao.ia.foundation.set` `{bizInterface:"drawTomEnergy"}` |
| 签名不可伪造 | 页面 URL 带 `x-sec=wua`，请求头 `x-sign / x-mini-wua / x-sgext / x-umt / x-devid` 由原生安全 SDK 生成 |

→ 纯 HTTP 重放 / cron 定时调用必被拒（且触发风控）。**唯一可行路线是 MITM 改写页面 JS，在页面内调用它自己的封装**，
签名由 WebView 原生层自动补。

## 游戏自己的喂养逻辑（p_index.js 模块 64003）

```js
单击        → he(1)                          // walkGridNum=1, operationType="SINGLE"
长按≥500ms  → pressingLong
长按≥1.5s   → he(H, "EXHAUST_ENERGY")        // H = min(floor(能量/单次消耗), maxWalkGrids)
能量不足     → toast「你没有能量，快做任务赚能量」
```

服务端错误码：`BIZ_RAISE_EXP_IS_FULL`（经验满要升级）、`BIZ_ENERGY_COST_CHANGED`、`BIZ_CAN_NOT_WALK_IN_OTHER_PHASE`。

## 真机模型（沙盒 SSR 实证，2026-10-30 iPhone 淘宝 10.68.10）

`Library/Caches/WebKit/NetworkCache` 里缓存的 `town/home` SSR HTML 内嵌了完整模型：

```json
{"gameType":"GRID_WALKER","userInfo":{
  "toolAmount":1100,"singleEnergyCost":100,"maxWalkGrids":50,
  "level":2,"canBatchWalk":false,"batchWalkMsg":"达到4级后解锁连续升级",
  "canUpgrade":false,"levelFull":false,"batchWalkCode":"LEVEL_NOT_ENOUGH",
  "taoCoinAmount":103947,...}}
```

- **等级 <4：`canBatchWalk=false`** → 长按也只能 1 格 `SINGLE`
- **等级 ≥4**：满格 = `min(floor(能量/100), 50)` = **一次 5000 能量**（与用户实测一致）
- `canUpgrade=true`（经验满）时应调 `foundation.upgrade`，继续喂能量是浪费

设备缓存的 `p_index.js` 与 CDN 上 2.6.2 字节数完全一致（2,258,843B），版本对得上。

## 本插件做什么

1. `[Script]` http-response 命中 `p_index.js`，在 bundle 尾部追加注入代码（4153B）
2. 注入代码通过 `self.webpackChunk_ali_pegasus_project_taocoin_home.push(...)` 拿 `__webpack_require__`
3. 按**导出特征**（`lv` + `YN` + `a_`）找模块，不写死 id → 抗版本升级
4. 读 `mx.store.get("UserInfo")` 的 `toolAmount / singleEnergyCost / maxWalkGrids`，算满格数后循环调用
5. 每轮后更新 store；能量不足时调 `drawTomEnergy`
6. 升级动画的「跳过」按钮一出现（`opacity>0`）立即点击
7. 能量连续 3 轮不下降 → 退避 30s（防死循环）

## 参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `autoFeed` | 开 | 自动喂能量 |
| `skipUpgradeAnim` | 开 | 自动点「跳过」升级动画 |
| `liteAnim` | 关 | 强制 `$deviceLevel=low_end`，升级 Lottie 换静态图；**副作用：页面图片质量降到 30** |
| `drawEnergy` | 开 | 能量不足时尝试 `drawTomEnergy` |
| `gapMs` | 2500 | 两轮间隔 |
| `idleMs` | 8000 | 能量不足后复查间隔 |
| `maxRounds` | 30 | 单次页面加载最多轮数 |

## 本地模拟器（无需真机即可验证）

`mock/` 目录是一个结构对齐线上包的本地页面：真实 webpack chunk 运行时 + 同名模块导出
（79527 productCode / 19835 mtop / 64003 业务 / 9000 UI），数值取自真机 SSR 模型。

```bash
cd plugins/TaobaoCoinAuto/mock
node build-inject.js          # 用插件响应脚本处理 p_index.js → p_index.injected.js
open index.html               # 对照组：不自动
open index-injected.html      # 注入版：自动喂养 + 自动跳过升级动画
```

可用参数模拟不同档位：`index-injected.html?level=5&energy=12000`、`?level=2&energy=1100&exp=99`。

实测（2026-10-30，内置 WebKit）：

| 场景 | 结果 |
|------|------|
| level=2（未解锁连续升级） | 每轮 `walkGridNum=1, SINGLE`，服务端拒绝 >1 格 ✅ |
| level=5, energy=12000 | `50 格 / 5000 能量` ×2 → `20 格 / 2000 能量`，能量耗尽后 `drawTomEnergy` ✅ |
| 经验满 | 自动调 `foundation.upgrade` → Lv+1，升级动画被「跳过」按钮秒关 ✅ |
| 对照组（未注入） | 能量 12000 不动，Lv 不变 ✅ |

## 验证

```bash
cd tools/loon-sim
node cli.js check ../../plugins/TaobaoCoinAuto/TaobaoCoinAuto.lpx   # 0 错误
node cli.js run ../../plugins/TaobaoCoinAuto/TaobaoCoinAuto.lpx \
  --url "https://g.alicdn.com/code/npm/@ali/pegasus-project-taocoin-home/2.6.2/js/p_index.js" \
  --phase response --response-file <真实 p_index.js>
```

实测：2,258,843B → 2,262,996B，`node --check` 通过；沙盒模拟三轮调用参数
`walkGridNum=500/500/200, operationType=EXHAUST_ENERGY, displayedSingleEnergyCost=10`。

## 风险

- 高频自动喂养有**账号风控/降权**风险，默认间隔已放保守，别把 `gapMs` 调到 500 以下
- 页面版本号会漂；模块 id 会变（所以按导出特征找）。若哪天页面改结构，先看控制台 `[TJB]` 日志
- 经验满 / 活动结束会自然停，不是无限刷
