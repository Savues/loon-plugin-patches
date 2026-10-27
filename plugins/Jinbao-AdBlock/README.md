# 多多进宝净化（Jinbao-AdBlock）

> **v0.3.0** — 覆盖：热门搜索 / 弹窗（普通·专属·互斥）/ 首页营销 banner / 开屏（预防性）。
> 全部规则基于**真机 HAR 实证**（200 条 + 140 条两轮抓包）。

## 一、域名事实（v0.2.0 修正，勿再写错）

| 域名 | 用途 | 典型路径 |
|---|---|---|
| **`jinbaoh5.pinduoduo.com`** | **业务 API（主要）** | `/network_h5/auth/*`、`/network_h5/weak_auth/*` |
| `jinbao.pinduoduo.com` | 原生 API | `/network/api/*` |

> v0.1.0 只写了 `jinbao.pinduoduo.com/network_h5/`，**一条都没命中**。
> 现统一为 `^https://jinbao(h5)?\.pinduoduo\.com/network(_h5)?/`。

## 二、已覆盖的净化点

### 1. 热门搜索（默认开）
```
GET /network_h5/auth/goods/query_top_keywords
→ {"success":true,"errorCode":1000000,"errorMsg":null,
   "result":["裤子","飞天茅台","猫砂","富士xm5","华为mate80","蓝牙耳机","外套","一加ace6t","牛奶","卫生纸"]}
```
处理：`result` 置空 → `result: []`（132B → 64B，10 → 0 条）。
**真机已验证生效**：第二轮 HAR 里该接口返回值就是 `result: []`。

### 2. 弹窗（默认开）
| 接口 | 处理 |
|---|---|
| `auth/popups/query/pop_window_info` | `popupWindow=false`、`popupsContentVOList=[]`、`popupsGoods=null` |
| `auth/popups/query/exclusive_info` | 同上 |
| `auth/popups/query/mutuality_exclusive_type` | `result.type=[]` → 互斥弹窗全部失去弹出资格 |

真机当前返回 `{"popupWindow":false,"popupsContentVOList":[],...}`（无弹窗），
合成样本 `{"popupWindow":true,"popupsContentVOList":[{...}],"popupsGoods":{...}}` 验证：313B → 136B，弹窗内容全清。
`mutuality_exclusive_type` 真机 `type:[1,11,9,7]` → `[]`（81B → 73B）。

### 3. 首页营销 banner（默认开）
```
GET /network_h5/weak_auth/common/label_info
result.bannerList = [{title:"超级红包活动", imgUrl:"…promotion.pddpic.com…", router:"…muti_coupon_rec.html…"}]
result.labelList  = [{title:"精选频道"},{title:"活动日历"}]   ← 功能入口，保留不动
```
处理：只清 `bannerList`（1474B → 999B），`labelList` 原样保留。

### 4. 任务卡片（**默认关**）
`auth/mission_system/card` → 强制 `missionCard.missionClosed=true`。
真机当前本就是 `missionClosed:true`，默认关闭以免影响你薅任务佣金。

### 5. 开屏（预防性）
- `[Script]` 递归剪除 `splash / launch_ad / open_screen / startup_ad / boot_ad / welcome_ad` 类字段
- `[Rewrite]` 路径含 `splash` 的接口 → 返回成功空结果
- 真机两轮 HAR（340 条）+ LC 进程内探针一致确认：**当前无开屏流量**

## 三、明确「不处理」的接口（功能，不是广告）

| 接口 | 原因 |
|---|---|
| `weak_auth/common/activity_list` | 9 个活动筛选（官方精选/百亿补贴/直播闪降…）= **频道入口** |
| `weak_auth/announcement/overview` | 官方通知（隐私政策更新、佣金比例调整）= **重要信息** |
| `weak_auth/common/need_upgrade` | 版本升级提示 |
| `auth/activity/super_red_packet/info` | 超级红包活动数据（含你的推广 token），动它会掉活动入口 |
| `weak_auth/goods/query_channel_config` | 首页频道配置（HOT_SALE_LIST 等） |
| `auth/goods/collect/query_pdd_collects` | 收藏夹商品 |
| `income/*` | 收益数据 |

## 四、开关

| 开关 | 默认 | 说明 |
|---|---|---|
| `enabled` 插件总开关 | 开 | 关闭后所有脚本直接返回 |
| `hideHotSearch` 屏蔽热门搜索 | 开 | `query_top_keywords.result = []` |
| `killPopups` 屏蔽弹窗 | 开 | 普通/专属/互斥三类 |
| `hideBannerAds` 隐藏首页营销banner | 开 | 只清 `bannerList` |
| `closeMissionCard` 关闭任务卡片 | **关** | 强制 `missionClosed=true` |
| `stripSplashKeys` 剪除开屏字段 | 开 | 递归删 splash 类字段 |

## 五、验证记录（v0.3.0）

```bash
cd tools/loon-sim
node cli.js check ../../plugins/Jinbao-AdBlock/Jinbao-AdBlock.lpx
# → 0 错误 0 警告 · [Script] 4 · [Rewrite] 2 · [Mitm] 2 · [Argument] 6

# ① 热门搜索（真机原样响应）
--url .../auth/goods/query_top_keywords --response-file test/fixture-hotsearch.json
# → 热门搜索已清空（10 条）· 132B → 64B · result[]: 10 → 0

# ② 互斥弹窗（真机原样响应）
--url .../auth/popups/query/mutuality_exclusive_type --response-file test/fixture-popup-mutuality.json
# → 弹窗已屏蔽 · {"result":{"type":[]}} · 81B → 73B

# ③ 弹窗主体（合成「有弹窗」样本）
--url .../auth/popups/query/pop_window_info --response-file test/fixture-popup-active.json
# → 弹窗已屏蔽 · 313B → 136B

# ④ 首页 banner（真机原样响应）
--url .../weak_auth/common/label_info --response-file test/fixture-label-info-real.json
# → 首页营销位已清理 · 1474B → 999B · bannerList [] / labelList 保留

# ⑤ 真机 HAR 全量回放（140 条）
node cli.js har ../../plugins/Jinbao-AdBlock/Jinbao-AdBlock.lpx <har>
# → 扫描 140 条：命中 Script 61 · 实际改动 2 · 被 Rewrite 终止 0
```

`test/fixture-*.json` 中除 `fixture-popup-active.json`（合成，用于验证真弹窗清除）
与 `fixture-splash.json`（真实结构 + 注入 splashInfo）外，**均为真机 HAR 原样导出**。

## 六、已知边界

1. **开屏无真实样本**：字段名族为推测，真出现时按实际响应补 `SPLASH_KEY`。
2. 若弹窗改由 **Titan 长连接推送**下发，HTTP 层拦不到（LC 探针已覆盖该路径，可再取证）。
3. H5 页面内联的推广（`jinbao.pinduoduo.com/mobile/*.html` 里的 JSON）不在覆盖范围。
4. 未处理：`popups/callback`（上报，无害）、`activity_list`（功能）。

## 七、取证工具

- 进程内探针源码：`/var/minis/workspace/ddjb/probe/ddjb-probe.c`（独立模块，不修改 lc-forensics）
- 探针日志：`Documents/lcf-ddjb/probe-<UTC>-<pid>.jsonl` + `bodies/`
