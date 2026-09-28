# Bilibili-Dedup · 小破站去广告(合并版)

> B 站去广告 + 漫画净化 + 本地会员伪装，与 blockAds 合集去重后独立运行。
> Bilibili ad-block, comics cleanup and local-VIP spoofing, de-duplicated from blockAds.

**v7.15** · 14 参数 / 5 Rule / 18 Rewrite / 10 Script · 更新 `2026-09-28T14:32`

| | 中文 | English |
|---|---|---|
| 端点 | `myinfo`、`account/mine`、`account/mine/ipad`、`x/v2/space`、`x/v2/space/archive/cursor` | same |
| 脚本 | 5 个全部由本仓库托管（含 3 个上游镜像） | all 5 self-hosted |
| 外部依赖 | 脚本与图标均自托管；**空降助手运行时另需两个外部服务**，见[第七章](#七空降助手机制--sponsorblock-mechanism) | scripts & icons self-hosted; SponsorBlock still calls two external services |
| 开关 | `localVIP`、`localVIPSpace` 独立可控 | independently toggleable |
| 历史 | 见 [迭代记录](../../BILIBILI-ITERATION.md) | see the post-mortem |

> 本文只描述**当前状态**。Why things are the way they are → 迭代记录。

### 更新记录 · Changelog

| 时间 | 提交 | 变更 |
|---|---|---|
| `2026-09-28T14:32` | `7ca3ac3` | `#!desc` 版本号 v6.0 → v7.15；修正重复标点；删除 v4 时代失效的「搜 PLUGIN_VERSION」说明（该常量在 5 个脚本中均不存在）；构建时间戳同步为实际提交时间 |
| `2026-09-28T14:25` | `b2b1c0d` | README 新增[第六章](#六上游脚本镜像--upstream-script-mirror)：目录结构、上游对应关系、SHA256 校验方法 |
| `2026-09-28T14:22` | `2b083ea` | 3 个上游 JS 镜像至 `upstream/`；`.lpx` 中 5 处 `script-path` 改指本仓库 |

**本次未升版本号**：脚本内容**逐字节未改**，与 [上游原版](upstream/MANIFEST.json) 比对一致，
变的是**供给方**，不是功能 —— 断掉了对 kokoryh / BiliUniverse 仓库可用性的隐性依赖。

> 版本号无代码依据，仅存在于 `#!name` 与本文档，改动后须手动同步。
> 版本号在代码层面无依据；`#!desc` 里的「搜 `PLUGIN_VERSION`」是 v4 时代残留，已删除。
>
> 表中时间为**各次提交的墙钟时间**（`git log` 原值），非脚本构建时间。
> Times are commit wall-clock (`git log`), not a build timestamp.

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Dedup/Bilibili-Dedup.lpx
```

CDN 缓存可能延迟更新，拉不到新版时加随机参数：`...lpx?cb=v712`

**需开启 MitM over HTTP/2。** Enable MitM over HTTP/2.

---

## 一、与 blockAds 的关系

blockAds（奶思合集）内置了 kokoryh 的完整 B 站规则集，与本插件功能重叠。
[`patch-blockads.py`](../../patches/README.md) 将合集里的 B 站部分**整段移除**：

| 段 | 移除内容 |
|---|---|
| `[Rewrite]` | 23 条 |
| `[Script]` | 4 条 |
| `[Rule]` | 5 条 |
| `[MITM]` | 6 个域名 |

其余 700+ App 的规则逐字节不动，Actions 每 6 小时自动同步。
The other 700+ apps are byte-for-byte untouched; Actions re-syncs every 6 hours.

---

## 二、功能 · Features

### 去广告 · Ad removal
推荐流 / 动态 / 搜索 / 番剧 / 直播 / 评论 / 播放页 / 开屏 / 短视频流 / 视频内插广告
Feed, dynamic, search, PGC, live, comments, playback, splash, shorts, in-video ads.

### 本地会员伪装 · Local VIP

5 种主题可切换，**已开通的真实大会员不会被改动**（判据 `status == 0`）。

| `vipTheme` | 显示 | `role` | 配色 |
|---|---|---|---|
| `fools_day_hundred_annual_vip` | **最强绿鲤鱼** | 15 | 绿底黑字 |
| `hundred_annual_vip` | 百年大会员 | 15 | 粉底白字 |
| `ten_annual_vip` | 十年大会员 | 7 | 粉底白字 |
| `annual_vip` | 年度大会员 | 3 | 粉底白字 |
| `vip` | 大会员 | 1 | 粉底白字 |

**Personal profile (`x/v2/space`) uses a different schema** and needs its own switch:

| | 账号页 / 我的页 | 个人资料页 |
|---|---|---|
| 端点 | `myinfo`、`account/mine` | `x/v2/space`(+`archive/cursor`) |
| 类型 | `type` / `status` | `vipType` / `vipStatus` |
| 到期 | `due_date` | `vipDueDate` |
| 非会员时 | `vip.status == 0` | **整个 `vip` 字段不存在** |

> ⚠️ 空间页有**两份 `vip`**，主页顶栏读的是 `data.card.vip` 而非 `data.vip`。
> 抓包实证：只写 `data.vip` 时顶栏仍显示灰色。**两处现在都会写入**，
> 且 `label` 对象逐字段一致，因此两页显示效果相同。
>
> The profile page has **two** `vip` objects; the header reads `data.card.vip`.
> Writing only `data.vip` leaves the header grey. Both are now written.

### 漫画净化 · Comics
`manga.bilibili.com` 的推荐流、热门搜索、促销弹窗等 · 开关 `mangaAD`

### 其他 · Misc
关闭弹幕 P2P（`[Rule]` 段 5 条，**无开关** · no switch）。

---

## 三、参数 · Parameters

### 本地会员 · Local VIP

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `localVIP` | switch | 开 | 账号页总开关 |
| `localVIPSpace` | switch | 开 | 个人资料页开关 |
| `vipTheme` | select | 最强绿鲤鱼 | 5 种主题 |
| `vipText` / `vipBg` / `vipFg` / `vipImg` | input | 空 | 留空用主题默认 |

### 规则设计约定

| 约定 | 说明 |
|---|---|
| `[Rule]` 层 REJECT 的域名 | 走 DNS 拦截，**不进 `[MITM]`** |
| `[Rewrite]` 规则 | **无条件生效** —— Loon 手册中 `enable=` 仅记载于 `[Script]` |
| URL 正则 | 只写实际使用的域名，不留 `ap[ip]` 这类历史变体分支 |

### kokoryh 脚本 · kokoryh scripts

| 参数 | 默认 | 说明 |
|---|---|---|
| `sponsorBlock` | 开 | 空降助手（自动跳过视频内插广告），依赖两个外部服务，见[第七章](#七空降助手机制--sponsorblock-mechanism) |
| `optimizeRequest` | 开 | 优化评论区加载 |
| `purifyComment` | 开 | 移除评论区置顶商品广告 |
| `displayUpList` | `show` | 最常访问：`show`/`hide`/`auto` |
| `logLevel` | `off` | kokoryh 脚本日志 |
| `LogLevel` | `WARN` | BiliUniverse 脚本日志 |

> 界面（顶栏/标签页/底栏）由 [Bilibili-UI](../Bilibili-UI/) 负责，本插件不控制。

---

## 四、兼容性 · Compatibility

| 冲突 | 说明 |
|---|---|
| Bilibili-UI 的 `Mine` 功能 | 两者都改 `account/mine`。字段不重叠（`vip` vs 服务列表），但同响应两脚本顺序不可控。要用我的页自定义时先关本插件 `localVIP` |
| blockAds | 须使用**已移除 B 站部分的版本**，否则 B 站规则重复执行 |

---

## 五、验证依据 · Verification

字段选择基于**用户实测双抓包对照**（插件开/关各一份），非文档推断：

| 字段 | 原生实测 | 结论 |
|---|---|---|
| `due_date` | `1721577600000` | **毫秒**时间戳 |
| `status` / `type` | 0 / 1 | 置 1 / 2 |
| `vip_section` | 存在 | 已删除 |
| `ott_info` / `super_vip` / `tv_*` | — | 未被误伤 |

墨鱼 `Module.sgmodule` 与原生一致（毫秒），可交叉印证。

> 另：App 对空间页会员标**走文字渲染**（`text` + `bg_color`），
> 抓包里一次 `/bfs/vip/` 图片请求都不发，故 `image` 留空即可。

**空降助手**结论来自一次完整抓包（164 条，含自动跳过全过程）：

| 观察项 | 抓包证据 |
|---|---|
| API 返回真实数据 | `bsbsb.top` 返 `segment:[118.933,157.766]`、`videoDuration:384.986` |
| chronos 已被改写 | `ViewProgress` 响应内 `file` 指向 `raw.githubusercontent.com/kokoryh/chronos/…`，非 `hdslb.com` |
| 原生路径被旁路 | `ObtainChronosPackage` 仍请求，但其 md5 不在脚本映射表内，未被采用 |
| 自动跳转时刻 | 用户实测：播放至 2:00 自动跳至 2:38，与 `segment` 端点吻合 |
| 撤销按钮 | 用户实测：播放器左下弹出粉色「撤销空降」，与 chronos 包 `AirborneToast` 的 `fillColor=BILI_PINK` 一致 |

---

## 六、上游脚本镜像 · Upstream Script Mirror

`[Script]` 段引用的 5 个脚本**全部由本仓库托管**，不依赖任何上游仓库的可用性。
All 5 scripts referenced by `[Script]` are served from this repository.

```
plugins/Bilibili-Dedup/
├── Bilibili-Dedup.lpx
├── icon.png               17 KB  插件图标（256×256）
├── vip-theme.js          2.6 KB  会员主题
├── vip-space.js          3.2 KB  个人资料页会员
└── upstream/                    上游脚本镜像
    ├── protobuf.request.js     62 KB
    ├── protobuf.response.js    95 KB
    ├── adblock.bundle.js      842 KB
    └── MANIFEST.json
```

### 上游对应关系 · Provenance

| 本地文件 | 上游来源 | 用途 |
|---|---|---|
| `upstream/protobuf.request.js` | [kokoryh/Sparkle](https://github.com/kokoryh/Sparkle) `master/dist/bilibili.protobuf.request.js` | 评论请求优化、空降助手 |
| `upstream/protobuf.response.js` | [kokoryh/Sparkle](https://github.com/kokoryh/Sparkle) `master/dist/bilibili.protobuf.response.js` | protobuf 响应处理 |
| `upstream/adblock.bundle.js` | [BiliUniverse/ADBlock](https://github.com/BiliUniverse/ADBlock) `releases/download/v0.6.24/response.bundle.js` | 去广告主逻辑（19 项参数） |
| `icon.png` | BiliUniverse `src/assets/icon_rounded.png` | 插件图标；**原图 1024×1024 缩放至 256×256**（67 KB → 17 KB） |
| `vip-theme.js` / `vip-space.js` | 本仓库自撰 · written in-house | 会员伪装 |

三个上游**脚本**均**逐字节原样镜像**，未修改任何逻辑。版本固定在 BiliUniverse `v0.6.24`，
其余取自 kokoryh 提交 `master` 当时的快照。图标是唯一做过尺寸压缩的文件。

> `.lpx` 中**所有**外部 URL（含 `#!icon`）均指向本仓库，清单层已无指向
> kokoryh / BiliUniverse 的可拉取地址。
> `MANIFEST.json` 的 `source` 字段保留上游地址，仅作溯源，运行时不会被读取。
>
> ⚠️ **但脚本内部仍有硬编码的运行时依赖**，清单层扫不出来：`sponsorBlock` 功能会去拉
> `bsbsb.top` 与 `kokoryh/chronos`，详见[第七章](#七空降助手机制--sponsorblock-mechanism)。

### 校验 · Verification

`upstream/MANIFEST.json` 记录每个文件的原始 URL、字节数、SHA256 与镜像日期。
本地核对（在插件目录下执行）：

```bash
python3 -c "
import json,hashlib,pathlib
m=json.load(open('upstream/MANIFEST.json'))
base=pathlib.Path('upstream')
for k,v in m.items():
    p=base/k
    if not p.exists(): p=pathlib.Path(k)
    ok=p.exists() and hashlib.sha256(p.read_bytes()).hexdigest()==v['sha256']
    print('OK  ' if ok else 'FAIL', k)"
```

脚本项在 `upstream/` 下，图标项 `icon.png` 在插件根目录 —— 故先试 `upstream/k`，回退到 `k`。

> B 站去广告逻辑依赖 B 站接口，上游接口一变即失配。
> 上游发布新版本时，改 `MANIFEST.json` 里的 `source`、替换文件、重算 SHA256。
> Ad-block logic tracks Bilibili's API and breaks when upstream changes.

---

## 七、空降助手机制 · SponsorBlock Mechanism

开关 `sponsorBlock`。**到广告起点后 2 秒自动跳到广告终点**，播放器左下角弹出
「撤销空降」按钮，5 秒后自动消失。下方为抓包逆向所得，非官方文档。

Automatically seeks past in-video ads ~2s in, offering a 5-second "撤销空降" undo.

### 完整链路

```
① protobuf.request.js  Pt()
   GET https://bsbsb.top/api/skipSegments?videoID=<bvid>&cid=<cid>&category=sponsor
   ← 广告时间段在这里（第三方服务，非 B 站接口）
   tn() 过滤：actionType=="skip" 且 segment 时长 ≥ 8 秒

② protobuf.request.js  nn()
   往弹幕流注入一条：
     content = "空指部已就位"        ← 触发钥匙
     progress = 广告起点×1000 + 2000
     action   = airborne:<广告终点×1000>

③ protobuf.response.js  ii()   （仅 ViewProgress 端点）
   改写响应里的 chronos 字段：
     file → raw.githubusercontent.com/kokoryh/chronos/.../<md5>.zip
     sign → 清空

④ App 加载该 chronos 包（弹幕焰火引擎），到点识别 content 匹配
   → 自动 seekTo(广告终点) + 弹出「撤销空降」
```

**两个脚本缺一不可**：② 造弹幕，③ 换引擎。只有 ② 会得到一条需要手点的弹幕；
只有 ③ 则 App 不认识 `airborne:` 动作。

### 撤销按钮的两种触发

| 触发 | 撤销行为 |
|---|---|
| 自动（弹幕到点） | `seekTo(广告起点+1秒)` |
| 手动点弹幕 | `seekTo(点击那一刻)` |

### 三个硬编码阈值

| 值 | 位置 | 含义 |
|---|---|---|
| `≥ 8` 秒 | `tn()` | 短于 8 秒的广告不跳 |
| `+ 2000` ms | `nn()` | 弹幕在广告开始后 2 秒出现 |
| `5` 秒 | chronos 包内 | 撤销按钮停留时长 |

均写死在脚本里，**参数无法调节**。`sponsorBlock` 只控制 `.lpx` 的 `enable=`，
脚本内部并不读这个值。

### 两个外部依赖

| 依赖 | 地址 | 状态 |
|---|---|---|
| 广告时间数据库 | `bsbsb.top`（SponsorBlock 协议分支，Cloudflare） | 活；**个人第三方服务，非 B 站接口** |
| chronos 引擎包 | `kokoryh/chronos` `master` 分支 | 活；最新包 2025-05-30，已 8 个月未更新 |

> 这两个是**脚本内部硬编码**的，`[Script]` 的 `script-path` 管不到，
> 所以[第六章](#六上游脚本镜像--upstream-script-mirror)的镜像覆盖不到它们。
>
> 失效表现：广告照播，**无任何提示**（脚本内 catch 后静默返回空列表）。
> 排查时把 `logLevel` 调到 `debug` 可见。
>
> 关闭本功能可避开这两个依赖：`sponsorBlock` 关掉后 `enable=` 会跳过规则，
> 两个脚本都不执行。

---

## 致谢 · Credits

上游脚本**逐字节原样镜像**至 [`upstream/`](upstream/)，图标缩放后存于插件根目录，均未修改任何逻辑；
仅重组清单条目与参数声明。清单中另有两个本仓库自撰脚本（`vip-theme.js` / `vip-space.js`）。
Upstream scripts are mirrored **byte-for-byte** — no logic modified, only manifest
entries and parameter declarations reorganized. Two in-house scripts added.

| 作者 | 项目 |
|---|---|
| **Maasea** | B 站 protobuf 脚本 |
| **kokoryh** | bilibili protobuf / 空降助手 |
| **VirgilClyne**、**app2smile** | BiliUniverse ADBlock |
| **fmz200（奶思）** | blockAds 合集（规则来源） |
| **zirawell** | 年度大会员实现参考 |

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
