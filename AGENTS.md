# AGENTS.md

> **AI 开发者入口** — 你（模型）将在这个仓库开发 Loon 插件。

**必读**：[AI-GUIDE.md](AI-GUIDE.md)（约 150 行，3 分钟读完）—— 开发流程、验证命令、已实证铁律、行为准则全在里面。

## 最快的捷径（如果你只有 30 秒）

```bash
# 改动后的三步验证
cd tools/loon-sim
node cli.js check ../../plugins/<Name>/<Name>.lpx          # 0 错误
node cli.js run <lpx> --url "https://目标URL"              # 决策符合预期
sh ci.sh | tail -1                                          # CI 全绿

# 终端实测的前提（第一铁律）
sh tools/loon-sim/version-probe.sh <plugin.lpx              # ✅ 绿了才能测
```

**三条不可违反**：
1. 探针不绿不下终端结论（设备旧配置 = 结论作废）
2. 上游 JavaScript 可改但必须本地化（拉取到 plugins/<Name>/src/ 后改 + README 记录改动与根因，勿直接引用上游 URL 改行为）——见 skill references/upstream-port.md
3. 测试结论必须附证据（命令 + 输出）

**取证手段按环境选**（选错会浪费大量时间）：

| 环境 | 可用手段 | 能拿到 |
|------|---------|--------|
| 实机（正常 iPhone） | 只有 **HAR** | 插件处理**后**的响应（最终验收） |
| LC 容器 | HAR + **目录读写** + **lc-forensics** | 原始响应 + App 沙盒缓存（数据源定位） |

> HAR 与 lc-forensics **数据不同源**：`ads/resource` 在 HAR 是 2B（插件已拦），
> 在 lc-forensics 是 48.8KB（原始响应）。前者证明「生效了」，后者用于「设计规则」。
> 详见 [AI-GUIDE.md §4](AI-GUIDE.md)

详细规范 → [AI-GUIDE.md](AI-GUIDE.md) · 人类向教学 → [PLUGIN-DEV-GUIDE.md](PLUGIN-DEV-GUIDE.md)
**🤖 Skill**: `/var/minis/skills/loon-plugin-dev/SKILL.md`（触发词命中 Loon/去广告/插件开发/HAR 时**必须先读**——含流程、铁律、通道地图）
**🔬 设备侧取证**: `tools/lc-forensics/`（App 进程内 hook——"HAR 全 `{}` 但广告仍出现"时用它拿 App 层真相，README 含使用边界）
**新环境部署模拟器** → [tools/loon-sim/DEPLOY.md](tools/loon-sim/DEPLOY.md)
