# AI 协作开发指南 · AI Developer Guide

> **本文件写给 AI 开发者（模型）**。人类读者请看 [PLUGIN-DEV-GUIDE.md](PLUGIN-DEV-GUIDE.md)。
> 你（模型）被叫来开发/修改这个仓库的 Loon 插件。**先读完本文件再动手**，可避免重复踩坑。

---

## 0. 30 秒认知

- **仓库**：Loon 插件合集（27 个插件），改动以**清单层**为主（[MitM]/[Argument]/[Script]/[Rewrite]/[Rule]），原则上不改上游 JS
- **环境**：iOS 设备跑 Loon（真机），ISH 终端可 curl 实测（已装 Loon 根证书），开发与验证全离线优先
- **工具链**：`tools/loon-sim/` —— 本地模拟器（v1.6.1），官方文档存档在 `tools/loon-sim/docs/`
- **用户角色**：只有用户能在 Loon 里更新订阅。**任何改动必须经用户更新才在真机生效**

## 1. 强制开发流程（违反 = 结论无效）

```
需求 → 计划（对齐 §3 流程模板）→ 改代码 → loon-sim 验证 → push
     → 告知用户「订阅地址 + 版本号」→ 用户更新 Loon
     → 版本探针转绿 → 才能终端实测 → 真机确认
```

### ★ 第一铁律：探针不绿，不下结论
终端 curl 测的是**设备已加载的配置**，不是仓库最新提交。
```bash
sh tools/loon-sim/version-probe.sh plugins/<Name>/<Name>.lpx
# exit 0 = ✅ 可测 | exit 2 = 设备旧版（结论作废）| exit 3 = 未埋探针
```
探针不绿时第一怀疑对象是**「订阅更新未生效」**（Loon 更新存在缓存窗口），不是规则语法。
新插件首次发版先跑 `version-probe.sh <lpx> setup` 埋探针。

## 2. 三步验证工作流（每次改动必跑）

```bash
cd tools/loon-sim
node cli.js check ../../plugins/<Name>/<Name>.lpx   # ① 静态校验（0 错误才继续）
node cli.js run <lpx> --url "https://目标URL" --response-file body.json   # ② 决策追踪
sh ci.sh | tail -3                                   # ③ 全套回归（自测65+全插件check+parity）
```

- 有 HAR 抓包用 `node cli.js har <lpx> <capture.har> --report out.md` 回放
- cron/签到类用 `node cli.js trigger <lpx> cron --mock mock.json --persist store.json`
- 语法疑问查 `tools/loon-sim/docs/`（官方文档完整存档，8 份）
- 详细命令见 `tools/loon-sim/README.md`

## 3. 需求 → 实现的流程模板

接到插件需求后，按此顺序与用户协作：

1. **定位目标**：哪个 App、哪个广告/功能、什么触发场景（开屏/弹窗/Feed…）
2. **找接口**：让用户提供 HAR 抓包（Loon 抓包导出），或从现有插件/反编译资料找同类接口
3. **选段位**（决策树，详见 PLUGIN-DEV-GUIDE §2）：
   - 纯域名拦截 → `[Rule]`（无需 MITM，性能最好）
   - 路径拦截无开关 → `[Rewrite]` 无条件
   - 路径 + 开关 / 改响应体 → `[Script]` + `with enable=${sw}`
4. **写规则** → §2 三步验证 → push → 告知用户更新
5. **真机确认**：探针转绿后 `curl` 对照（§4 实测方法论）
6. **文档**：插件目录 README 记录接口清单与开关语义；CHANGELOG 记版本

## 4. 终端实测方法论（探针绿后）

```bash
getent hosts <域名>                    # 127.0.0.1 = [Rule] REJECT 生效
curl -s https://<域名>/<路径> | head -c 50   # {} = reject_dict 生效；真实内容 = 未拦
```
判读速查表见 PLUGIN-DEV-GUIDE §7（size=2/status=0/DNS 127.0.0.1 等）。
ISH 已信任 Loon 根证书，**不需要 `-k`**。

## 5. 已实证铁律（勿重复怀疑，证据可查）

| # | 铁律 | 证据 |
|---|------|------|
| 1 | `[Rule]` 段**无 enable 字段** → `enable={}` 是死开关 | PinDuoDuo 真机 + 官方文档 |
| 2 | `[Rewrite]` 旧语法 `, enable={}` → 整条规则无效 | 本仓库 57 处事故 v3.38.2 |
| 3 | `with` 未知字段 → 当前规则无效 | 官方 script-v2 文档 |
| 4 | 带路径规则必须域名在 [Mitm] | orange/g.alicdn 三次事故 |
| 5 | 裸路径正则**可用**（~= 查找匹配），双参 `reject(200,"文本")` 可用 | 2026-10-24 A/B 实证 |
| 6 | 同接口 [Rewrite] 终止类 + [Script] 并存 → Script 死代码 + 可能触发 App 重试 | cloudvideo 重试 6 次 |
| 7 | 拦「疲劳度记录」接口会**弹得更多** | 实证 |
| 8 | Loon 订阅更新存在「已点更新但未生效」窗口 → 一切以探针为准 | 2026-10-24 三次穿透复盘 |
| 9 | CDN（GitHub raw）缓存 5 分钟 → push 后别急着让用户更新 | etag 实测 |
| 10 | 插件 [Rule] 策略只能 DIRECT/PROXY/REJECT 系 | 官方 plugin.md |

完整禁止事项（9 条）+ 案例见 PLUGIN-DEV-GUIDE §9。

## 6. 代码规范

- **lpx 文件头**：`#!name` 必须首行；版本号 `#!version=`；改动后必 bump 版本（探针 setup 会同步更新探针值）
- **开关命名**：camelCase（如 `removeSplashAd`）；desc 写清楚拦什么 + 已知副作用
- **脚本**：单文件 bundle.js；每个函数定义必须有调用点（历史事故：定义了没调用→静默失效）
- **commit**：`<插件名> vX.Y.Z: 摘要` 或 `fix/docs/feat(scope): 摘要`
- **同步**：模拟器改动后跑 `sh tools/loon-sim/sync-standalone.sh "msg"` 同步独立仓库
- **不修改上游 JavaScript 的任何一行**（本仓库根本原则）

## 7. 文档地图

| 想知道 | 去哪 |
|--------|------|
| 完整开发教学（段位选择/Script 技巧/HAR 判读）| `PLUGIN-DEV-GUIDE.md` |
| Loon 官方语法（Script/Rewrite/Plugin/Rule/API）| `tools/loon-sim/docs/*.md`（8 份存档）|
| 模拟器全部命令 | `tools/loon-sim/README.md` |
| 某插件接口清单/开关语义 | `plugins/<Name>/README.md` |
| 模拟器版本历史 | `tools/loon-sim/CHANGELOG.md` |
| 官方转换器的 6 个已知问题 | `tools/loon-sim/docs/converter.md` |

## 8. 你（模型）的行为准则

1. 动手前读完本文件；细节按 §7 索引按需查阅，不要一次全读
2. 修改前先 `git status` 确认工作区干净；不确定的改动先问用户
3. **不要**在探针不绿时宣称「已修复/已生效」
4. **不要**为通过测试而修改插件本身来适配工具（修工具，不是修样本）
5. 测试结论必须附证据（命令 + 输出），失败要如实报告
6. 一次只做一个改动点，改完即验证，避免大爆炸式提交
