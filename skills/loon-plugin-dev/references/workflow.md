# 完整工作流

> 7 步流程的完整版，含每步的命令、判定标准和事故出处。

## 0. 环境与入口

- 仓库: `/var/minis/shared/loon-plugin-patches`
- 新会话先读: 仓库根 `AGENTS.md` → `AI-GUIDE.md`
- 模拟器: `tools/loon-sim/`（部署见其 DEPLOY.md；探针/自测见其 README）
> 探针唯一合法模板/六项校验/穿透排障表 → `tools/loon-sim/docs/version-probe.md`（勿手写探针, 跑 probe-setup.py）
- 官方语法: `tools/loon-sim/docs/`（8 份存档 — script-v2 / rewrite-v2 / plugin / rule / script-api / 旧语法×2 / converter）

## 1. 需求定位

问清: 哪个 App、什么形态（开屏/热启动/弹窗/悬浮窗/搜索域/信息流/角标）、期望行为（消失/清空/保留功能）。
形态决定调查路径: 开屏→素材+接口双查; 搜索域→多通道(接口/容器/ACCS)逐个排; 弹窗→调度器+注册表+专用体系。

## 2. HAR 取证

- 让用户抓包（Loon 抓包导出），**必须覆盖问题发生的时段**
- 导出文件常在 `/var/minis/attachments/uploads/`（注意 attachments 会被清空，真身可能要重新上传）
- 分析方法见 `har-analysis.md`

## 3. 通道判定（决定方案生死）

三源交叉: HAR（网络） + 沙盒挂载（本地缓存） + App 二进制（strings，路径 `/tmp/taobao-re/`）:

| 现象 | 判定 | 行动 |
|------|------|------|
| HAR 响应含数据 | HTTP 通道 | 拦/清洗 |
| HAR 零命中 + 沙盒有（gateway/cache_* 文件） | ACCS 下发 | **无解**，告知用户（仅越狱 Hook 根治）|
| HAR/沙盒零命中 + 二进制有 | 本地内置/原生 fallback | 无解 |
| 词在请求体(上行) | 源头是某次未捕获的下发 | 扩大抓包窗口或查沙盒 |

已知 ACCS 死角清单见 `app-notes.md`（淘宝轮播词、特价版滚词典、一淘拍图入口…）。

## 4. 语义层级判定

| 层级 | 特征 | 处置 |
|------|------|------|
| 纯广告接口 | 单一用途，无页面数据 | `[Rewrite]` reject_dict(200) |
| 功能主干 | 首页容器/搜索中间页/多页面配置 | bundle.js 清洗（reject = 白屏，一淘 home.metax 事故）|
| 功能内嵌广告 | 容器里的营销节点 | 清洗该节点，前缀族匹配 |
| 素材层 | 图片/动画 CDN | 图 URL 特征拦截（如 15TUA 素材库标识，不依赖尺寸）|

## 5. 实现规范

### lpx 规则
- 版本号三处同步: `#!name vX.Y.Z` / `#!version=` / 探针 reject(200, "X.Y.Z") + `.probe.meta`
- 改动后必跑 `version-probe.sh <lpx> setup`（探针值随版本更新）
- `[Script]` 规则: 开关判断放脚本内（不写 with enable=，防开关持久化陷阱）
- **lpx 元信息三件套** (Loon 列表显示, 发布前必齐): `#!desc=` bullet格式, 开头措辞自由(开头措辞自由，不必"去广告"起头): 支持App范围·拦截内容·已知边界 + `#!author=@Savues <https://github.com/Savues>` + `#!homepage=` 仓库插件目录 URL
- **图标**: App 原版 (`Payload/<App>.app/AppIcon60x60@2x.png`, 120×120) → `plugins/<Name>/icon.png` 仓库自托管, `#!icon` 用本仓 raw 直链 (勿用第三方图标库)
- 域名锚定正则优先（`^https?://…`），仓库实测最稳

### bundle.js 清洗
- 三件套: 函数定义 + main() 分发 + lpx 规则入口（**每次新增清洗后 `rg` 验证三处都在**）
- 匹配用前缀族（tm_my_promotion / tmall_home_landscape_promotion 同功能不同名）
- 保留结构防 UI 破坏: 点击载体字段（link/action/middlePageUrl）不能删; 词藏三处: 文本字段 / URL 参数(hint=query=) / unwEvents 埋点
- 删容器 vs 空壳: 整删→App弹一次失败toast后放弃(可接受); 空壳→App无限重试转圈卡顿(不可接受); 只清词表→留空壳标题
- 函数内单字段缺失不得放弃整个处理（obj?.a?.b || {} 兜底，天猫 attachment 缺失事故）

### 禁止拦截
- 疲劳度上报类（fatigue.expose）— 拦了反弹（弹得更多）
- 搜索主链路（suggest/联想/一淘 fe.search）— 功能非广告
- 用户可能用的功能接口（msgbox 等）— 误伤风险

## 6. 验证（三层递进）

```bash
# ① 静态
node cli.js check <lpx>                       # 0 错误
python3 <repo>/plugins/Alibaba-AdBlock/tools/check_switch_keys.py   # 开关缺口 0

# ② 决策+执行（完整链路! 禁止 vm 直调函数）
node cli.js run <lpx> --url "<构造的完整URL含版本段>" --phase response --response-file <HAR提取的真实body> [--arg k=v] [--diff-full]
#   必须看到「生效规则」; 输出断言: 目标词消失 + 结构字段保留 + JSON 合法

# ③ 全量回归
sh ci.sh    # selftest + 历史回溯 + 全插件 check + parity
```

## 7. 发布与真机闭环

```
push → 告知用户「订阅地址 + 版本号」→ 用户 Loon 更新订阅
→ sh tools/loon-sim/version-probe.sh <lpx>   # exit 0 才能继续
→ 终端实测 (curl 对照; ISH 已信任 Loon 根证书, 无需 -k)
→ 用户肉眼确认 → 必要时再抓包验证
```

- 探针 exit: 0=可测 / 1=用法错 / 2=设备旧版 / 3=未埋探针
- CDN 缓存 5 分钟: push 后别急着让用户更新
- 真机语义验证法: 同版本埋多条对照规则（A/B 探针法）
- 更新订阅后若 lpx 规则生效但 bundle 清洗不生效 → 检查三件套第③项（lpx 规则入口），历史上最常漏

## 7.5 模拟器双仓同步 (改了 loon-sim 任何文件后必做)

loon-sim 在两仓各一份 (插件仓 tools/loon-sim = 开发区 / Savues/loon-sim = 发布区):
```bash
sh tools/loon-sim/sync-standalone.sh "同步说明"   # 同步到独立仓
sh tools/loon-sim/ci.sh                            # 第⑥段自动校验双仓一致, 忘跑 sync = 红灯
```
⚠️ 历史盲区: sync 曾漏 probe-setup.py/version-probe.sh (cp 列表不全), CI 第⑥段已强制拦截。
**改模拟器后必须 sync + CHANGELOG 补记 + ci.sh 全绿三件套**。

## 8. 版本发布规约

- commit: `<插件名> vX.Y.Z: 摘要` / `fix/docs/feat(scope): 摘要`
- 语义化: 补规则=minor; 修事故/回滚=patch; 新 App 专项=major
- 每个版本都走完整验证链; 事故修复当天回滚验证
