# 20 条铁律 + 事故案例

> 每条附事故出处（可溯源到具体版本/日期），勿重复怀疑已实证项。

## 语法层（官方文档实证）

1. **[Rule] 段无 enable 字段** → `enable={}` 是死开关（开关无效，规则无条件生效）。案例: PinDuoDuo 真机 + AntiRevoke 17 处
2. **[Rewrite] 旧语法 `, enable={}` → 整条规则无效**（非"开关关了"而是规则死了）。案例: 本仓库 57 处 v3.38.2
3. **with 未知字段 → 当前规则无效**（官方 script-v2: 字段名区分大小写、须全小写 snake_case）
4. **带路径规则必须域名在 [MitM]** — 否则路径不可见，规则静默失效。案例: orange/g.alicdn 三次事故
5. **裸路径正则可用**（~= 是查找匹配无需 ^）; 双参 `reject(200,"文本")` 真机支持 — 2026-10-24 A/B 双盲实测
5b. **正则字面量必须闭合**（`/re/` 或 `/re/i`）— 缺尾则永不匹配且无提示。probe-setup 生成 bug 事故 → check v1.6.8+ 自动拦截
5c. **探针模板锁定**（check v1.7.0 六项: 锚定/双参/版本同步/MITM在列/仅一条/必埋）— 勿手写, 跑 probe-setup.py; A/B 探针命名 *_bare 自动豁免
6. **同接口 [Rewrite] 终止类 + [Script] 并存 → Script 死代码 + 可能触发 App 退避重试**（cloudvideo 重试 6 次）
7. **插件 [Rule] 策略只能 DIRECT/PROXY/REJECT 系**（官方 plugin.md 白名单）

## 环境层

8. **Loon 订阅更新存在「已点更新但未生效」窗口** → 一切以探针为准; 不绿时第一怀疑对象是更新没生效而非规则语法（2026-10-24 三次穿透复盘）
8b. **真 A/B 必须在同一插件内** — 跨插件同时刻"一绿一穿"不能归因形态差异（各自订阅刷新状态是独立变量）— 2026-10-24 两次误判教训
8c. **iSH 嵌套 node 可能整体失效**（node→node 跑 JS 一律 ETIMEDOUT/Killed, 与内存无关）— selftest 已内置 tExec 探测跳过; 外层 shell 跑 node 不受影响
9. **GitHub raw CDN 缓存 5 分钟** — push 后别急着让用户更新; 带查询参数不绕缓存, commit-sha 直链可绕

## 工程层

10. **bundle.js 加函数 ≠ 生效 — 三件套缺一即静默失效**（①函数定义 ②main 分发 ③lpx [Script] 规则入口）。案例: 摇钱树悬浮窗三轮排查 v3.48.0~3.48.3, 前两轮误判为开关/缓存
11. **改开关默认值不影响已持久化的用户设置** — 老开关复活时必查历史默认值; 开关判断放脚本内（去 with enable）; 功能不依赖单一开关。案例: v3.47 removeSearchWords 曾默认 false 时期被持久化
12. **端到端测试必须走完整链路**（cli.js run: 规则命中→脚本调用）, 禁止 vm 直调函数 — 直调测的是函数对错, 测不出规则入口缺失（正是事故 10 被漏检的原因）
13. **功能主干接口只能清洗不能 reject** — 首页容器类（天猫 infinity.gateway / 一淘 home.metax / fc.resource.tacdata）reject = 白屏。案例: 一淘首页白屏 v3.46 当天回滚
14. **同一功能在不同 App/页面用不同通道和容器名** — 清洗用前缀族匹配; 每个 App 通道独立判定不能类推（天猫滚词典=HTTP 可清, 特价版=ACCS 无解; 我猫页 tm_my_promotion vs 首页 tmall_home_landscape_promotion_grid51）
15. **ACCS 通道 HTTP 层不可达** — 淘宝/特价版滚词典、一淘拍图入口、天猫"创意园艺"内置词等; 词/入口由 ACCS+原生渲染; 插件侧拦干净 HTTP 通道即为终局, 告知用户仅越狱 Hook 可根治
16. **改默认值 = 四层同步** — lpx 首选项 / 脚本兜底值 / 构建产物 / 测试断言 + README 描述, 缺一即"清单默认与实际行为分裂"。产物是构建物: 重生成前先拉上游重打补丁与旧产物 diff, 确认上游未变再覆盖(否则 Actions 同步会混入无关变化)。案例: 字号 25→37 若只改 lpx, 无参数时兜底仍 50
17. **iSH ash 环境怪癖速查**（挂死类, 一次到 python3 不再试 shell）:
    - busybox grep 空模式挂死: `echo "" | grep -qw ""` 无限等待 — refs 空时必挂
    - while/for 循环体含 grep + 【外层 timeout 包装】→ grep 孤儿化(PPid=1), stdout 指向
      iSH anon_inode 管道, 对端死但不返回 EPIPE → 永久阻塞; **自我增殖**: 每次挂死留一个
      僵尸 grep, 之后同形态脚本 100% 挂。诊断: `ps | grep grep` 见僵尸 → `pkill -9 grep` 解
      根因已实证(2026-10-26 /proc/fd 诊断: fd1=anon_inode, 对端销毁)
    - `$(cmd | sort)` 命令替换大输出 → sh -c 内随机挂死（同族: 残留进程恶化触发率）
    - busybox grep 怪癖: 管道+文件参数并存时优先读 stdin; `</dev/null` 反致忽略文件参数
    - **解法: 逻辑全走 python3**（subprocess curl/git + pathlib），sh 只做入口 — audit.py 即此路线;
      调试期若见「不可能的失败」先 `ps` 查僵尸进程再怀疑代码

## 附加工程约束（未列入编号但同权重）

- **删容器 vs 空壳 vs 清词表**: 整删→一次失败 toast(可接受); 空壳→无限重试转圈卡顿(不可); 只清词表→留标题空壳(半吊子)
- **函数内单字段缺失不得提前退出**（obj?.data?.attachment || {} 兜底）— 天猫我猫页无 attachment 事故
- **词藏三处**: 文本字段 / URL 参数(hint= query=) / unwEvents 埋点事件 URL — 断言用全文 includes 逼出全部
- **疲劳度上报类接口拦截会反弹**（弹得更多）— 一律不拦
- **多段文档/代码修改必须每段立即落盘验证** — 一段 assert 失败会丢掉前面所有未 write 的改动（文档更新事故）
- **--check 过 ≠ 脚本能工作** — 顶层执行型脚本截断后语法合法但 done 不调用; check v1.7.2 已静态查; **修改脚本数组类代码后必跑端到端** (horn_clean rfind 截断事故, 端到端抓住)
- **rfind/replace 定位插入代码后必须检查文件尾部完整性** — 执行逻辑被截掉而语法检查照样过

---

## 真机兼容性（2026-10-27 两次事故新增）

18. **`json.replace` 的值参数不能传空容器** — 真实 Loon 静默失败（不报错、不写日志）；批量形态会写入字符串。清空容器一律用 `delete`

| 写法 | 真实 Loon | 模拟器 |
|------|-----------|--------|
| `json.replace("k", [])` / `{}` / `null` | **静默失败**（不报错、不写日志） | 正确解析为容器 |
| `json.replace(["a","b"], ["[]","{}"])` | 写入**字符串**而非容器 | 正确解析 |

- **事故**: RedPaper v1.4.0 `json.replace("data.placeholder", [])` 真机不生效（placeholder 仍 790B，规则生效应为 173B）
- **证据**: 仓库里真机验证通过的 `json.replace` 全是**数字**参数（SMZDM `[0,0]`、JD `[0,0,0]`），空容器写法从未被验证
- **已防护**: `loon-sim v1.7.7` check 3b 段静态检查（单条空容器→⚠️警告不阻断；批量字符串→❌错误退出码 2）

19. **`reject_*` 占位内容类型必须与目标一致** — `reject_img` 拦 `.zip` → App 解压失败 → 用户可见报错；不确定内容类型时宁可不拦

| 目标 | 禁用 | 后果 |
|------|------|------|
| `.zip` | `reject_img` / `reject_video` | App 解压失败 → 用户可见报错 |
| `.mp4` / `.m3u8` | `reject_img` / `reject_dict` / `reject_array` | 播放器解析失败 |
| `.png` / `.jpg` / `.webp` / `.gif` | `reject_video` / `reject_dict` / `reject_array` | 图片解码失败 |

- **事故**: RedPaper v1.4.0/1.4.1 用 `reject_img(200)` 拦 `fe-static.xhscdn.com/xhs-dsl/search_recommend_trending/`（实际是 **zip 模板包**）→ 真机每次打开搜索框提示「网络不太顺畅，请检查网络设置」
- **日志铁证**: `[DslJsRuntime] downloadJs failed, cannot open zip file`
- **已防护**: `loon-sim v1.7.7` check 3c 段静态检查（❌错误退出码 2；含无后缀路径推断：`/xhs-dsl|/dsl/|template/` → zip）

20. **LC 容器目录对 iSH 可读写**（仅 LC 环境，实机无此路径）— HTTP 拦不到的本地缓存可直删；但 App 联网会按需重下，需配合插件拦下载源

**之前误判过三次**「插件无权操作 App 私有数据」。实际：

```
/var/minis/mounts/Live Container/Data/Application/<UUID>/
  ├── Documents/     ← 可读可写可删
  ├── Library/       ← Caches、dsl_template_Directory
  └── SystemData/
```

- 定位容器：`LCContainerInfo.plist` 里 `appIdentifier` 反查
- 权限：root 可读写，无需越狱
- **适用**：清理 HTTP 层拦不到的本地缓存（广告素材/模板/配置）
- **但**：App 联网会按需重新下载 → 必须配合插件拦下载源，否则白删
- 示例：`plugins/RedPaper/clean-ad-cache.sh`

> ⚠️ 仅 **LC 容器**环境有此路径。实机（正常 iPhone）没有，取证手段只有 HAR。
> 环境选择见 `AI-GUIDE.md` §4 决策表。

21. **共享静态 CDN 不能整域拦** — `ossgw.alicdn.com` 是阿里静态模板 CDN（`rapid-oss-bucket/template_online/*`），不是埋点域

- **事故**: Alibaba-AdBlock v3.39.0 把它当埋点域名下沉 `[Rule]` 整域 REJECT → 一淘 10.7.0 结算页底部「提交订单」栏整条消失（v3.50.3 修复）
- **证据**: `mtop.trade.order.build` 响应 154 个 dinamicx 组件中 **103 个**托管该域；按钮 `submitOrder_1` = `dinamicx$475$buysubmit` → `.../buy_submit/1600853389896/buy_submit_h5.js`（HTTP 200 / 6166B 模板）
- **判据**: ① 上游 BlockAds 只拦 `^https?://ossgw.alicdn.com/creatives-assets/image/` 子路径 → 说明整域含功能资源；② 同域下 `template_online/`（功能模板）与 `creatives-assets/`（广告素材）混存 → 域名级规则无法区分
- **做法**: 整域 REJECT 只用于「整域都是埋点/广告」的域名；静态资源/CDN 域必须 MITM + 子路径规则（收益低时宁可不拦）
- **误判成本**: 广告素材没拦住只影响观感，功能模板拦错直接废掉下单/支付主路径
