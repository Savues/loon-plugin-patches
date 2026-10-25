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

详细规范 → [AI-GUIDE.md](AI-GUIDE.md) · 人类向教学 → [PLUGIN-DEV-GUIDE.md](PLUGIN-DEV-GUIDE.md)
**🤖 Skill**: `/var/minis/skills/loon-plugin-dev/SKILL.md`（触发词命中 Loon/去广告/插件开发/HAR 时**必须先读**——含流程、铁律、通道地图）
**新环境部署模拟器** → [tools/loon-sim/DEPLOY.md](tools/loon-sim/DEPLOY.md)
