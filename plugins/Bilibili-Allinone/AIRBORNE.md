# 空降助手 · 上游依赖与封存记录

> 这份文档只讲 `scripts/bilibili.airborne.js` 一个文件：它从哪来、怎么被打补丁、
> 为什么 2026-11-01 停止跟进上游、将来要恢复该怎么做。
> 插件其余部分（去广告 / UI / 开屏 / 会员）与本文无关。

## 一、它是什么

| 项 | 值 |
|---|---|
| 产物 | `scripts/bilibili.airborne.js` |
| 上游 | [`kokoryh/Sparkle`](https://github.com/kokoryh/Sparkle) `dist/bilibili.protobuf.request.js` |
| 补丁器 | `patches/patch-airborne.py`（16 个锚点，逐条精确命中 1 次才放行） |
| 同步工作流 | `.github/workflows/sync-airborne.yml` |
| 挂载端点 | `bilibili.community.service.dm.v1.DM/DmSegMobile`（`Bilibili-Allinone.lpx` 中 `tag=空降助手`） |

工作流做的事：拉上游 → 跑补丁器 → 9 步测试（逻辑单测 / protobuf 往返 / 畸形响应 /
清单结构 / chronos 重签 / 校验补丁落进产物）→ 有变化才提交。

**它只产出这一个文件**，插件其它 8 个脚本不受影响。

## 二、为什么封存（2026-11-01）

### 直接原因：上游 dist 冻结三周后重建，terser 把标识符表整体重排

上游 `kokoryh/Sparkle` 是「TS 源码 + 构建产物一起提交进仓库」的模式，用户直接拉 `dist/*.js`。
逐版本查 `dist/bilibili.protobuf.request.js` 的实际内容：

| 上游 commit | 日期 | dist 大小 | sha256 前 12 位 | `Built at` |
|---|---|---|---|---|
| `315af65d` | 10-09 | 63,273 B | `213ae859b871` | 2026/10/7 08:31:48 |
| `e94110a1` | 10-10 | 63,263 B | `c95c8107478a` | 2026/10/9 20:50:34 |
| `44d34726` | 10-13 | 63,263 B | `c95c8107478a` | 同上（**未变**） |
| `09c43477` | 10-20 | 63,263 B | `c95c8107478a` | 同上（**未变**） |
| `98b846e5` | 10-29 | 63,263 B | `c95c8107478a` | 同上（**未变**） |
| `0c3bc09b` | 10-30 | **90,274 B** | `16de65b5ea3c` | **2026/10/30 22:54:41** |

也就是说：**10/10 到 10/29 的四次提交，dist 文件一个字节都没变**（sha 完全相同）——
源码改了、产物没重建。10/30 的 `0c3bc09` 才真正重建。

重建后体积 +43%、标识符整张表换掉。原因是 terser 的 mangler **按代码结构顺序分配名字**，
不看源码里的变量名：源码攒了三周的改动，结构一变，后面所有标识符依次重排
（`en→Mn`、`tn→Zn`、`nn→zn`…），跟"上游故意改名"无关。
所以 10/10 那次 `chore: optimize code naming` 对产物几乎没影响（只差 10 字节），
真正的引爆点是 10/30 的功能改动。

失败信息形如：

```
::error::锚点「空类别短路」命中 0 次（应为 1 次）。上游结构可能已变，需要更新 patches/patch-airborne.py。
```

### 根因一：压缩器重命名（11 个锚点）

失效锚点覆盖空降助手的**两条完整链路**，不是边角：

| 链路 | 失效锚点 |
|---|---|
| SponsorBlock 拉取 / 类别过滤 | 空类别短路、过滤函数调用、过滤函数本体、bsbsb 瞬断重试 |
| 空指部弹幕注入 | 注入入口、弹幕构造签名、空降落点、弹幕 id、弹幕 idStr、空降动作、暂存 cid |

仍是纯字符串/常量、因此没受影响的 5 个：查询参数、提示文案、弹幕字号、弹幕 oid、弹幕属性位。

**重命名映射表**（将来重钉锚点时直接用）：

| 旧 | 新 | 用途 |
|---|---|---|
| `en` | `Mn` | SponsorBlock 拉取主函数 |
| `Pt` | `Pn` | bsbsb 请求 |
| `tn` | `Zn` | 类别过滤函数 |
| `nn` | `zn` | 弹幕构造函数 |
| `B` | `I` | 日志对象 |
| `le` | `q` | aid → bvid |
| 终点变量 `l` | `f` | `Math.floor(t[1]*1e3)` 里的那个 |

### 根因二：上游对 9.17.0+ 改了实现路线（真语义变更，不是改名）

```
Sn = async (s,e) => { s.state.biliVersion >= 917e5 && J(); ... }   // 9.17.0+ 直接放弃 DmSegMobile
En = async (s,e) => {
  if (s.state.biliVersion < 917e5) { ...老路... return e() }        // <9.17.0 走老路
  Gn(s); ... R.length && (s.state.segments = R)                     // >=9.17.0 走 playerunite
}
An = (s,e) => { ... t.supplement = PGCAnyModel{ clipInfo: ... } }   // 原生跳过片段
```

上游 README 的原话：

> 哔哩哔哩 App 自 **9.17.0 起启用强制 RSA 验签**。空降助手对 9.17.0 及以上版本客户端将改用备用方案：
> - 备用方案仅适用于 iOS
> - 触发空降的视频不保留播放历史记录，且历史记录会被替换为特定番剧
> - 触发空降的视频不支持杜比视界画质

**对我们的影响**：我们打补丁的是 `DmSegMobile` 弹幕注入链路（空指部 + `__airOK` 类别过滤）。
9.17.0+ 上这条链路被上游自己关掉了，重钉锚点也救不回来 —— 只能另写 `playerunite` 分支的适配。

### 决定

使用者仍在**老版本 B 站客户端**，空降功能正常；上游新方案自带副作用（历史记录被替换、
不支持杜比视界），跟进没有收益。**停止跟进上游，脚本冻结在当前构建。**

## 三、冻结状态（勿动）

| 项 | 值 |
|---|---|
| 插件版本 | `Bilibili-Allinone` v8.0.8（`check` 0 错误 0 警告） |
| airborne 构建戳 | `// Built at: 2026/10/9 20:50:34` |
| 补丁命中 | 16/16 |
| 定时同步 | **已关闭**（commit `2e9d32f`） |
| 手动入口 | 保留 `workflow_dispatch`（含 `only_local` 输入） |

关闭方式是**注释掉 `schedule`**，不是 `gh workflow disable`：

```yaml
on:
  # schedule:
  #   - cron: '30 */6 * * *'
  workflow_dispatch:
```

> ⚠️ 不要用 `gh workflow disable` 或 `PUT /actions/workflows/<id>/disable` ——
> GitHub 禁用工作流后 `workflow_dispatch` **也一起失效**，想手动跑还得先 enable。

## 四、将来要恢复的话

1. **先判断上游到底变没变**：只看产物第一行 `// Built at: ...`。
   与 `2026/10/9 20:50:34` 相同 → 没重建，锚点不会因命名而失效。
2. **重钉锚点**：按上表把 11 处换成新名字，注意替换串里的标识符也要跟着换
   （例如 `tn(i,s.argument)` → `Zn(r,s.argument)`）；`过滤函数本体` 这类要整条替换，
   只换函数名会拼出双函数体（`node --check` 会报 `Unexpected token '=>'`）。
3. **跑工作流自带的 9 步测试**，全绿才提交。
4. **是否适配 9.17.0+** 是独立决策，不是修 bug：
   需要在 `En`/`An`（playerunite 分支）里注入 `supplement.clipInfo`，
   并把 `__airOK` 类别过滤挪过去；且要接受上游 README 里那三条副作用。

## 五、验证与排错

```bash
# 本地重打补丁（不联网，用仓库里现有产物验证补丁器）
python3 patches/patch-airborne.py <上游文件> -o /tmp/x.js --dry-run

# 只看锚点命中情况
python3 patches/patch-airborne.py <上游文件> -o /tmp/x.js
#   每行 "✓ 名称" 对应一处锚点；报 "命中 0 次" 就是上游又变了
```

`patch-airborne.py` 在第一个失配锚点就会 `sys.exit`，所以报错信息只能看到一个。
想一次看全部，把 `PATCHES` 逐个 `out.count(old)` 统计即可（不改逻辑，只诊断）。
