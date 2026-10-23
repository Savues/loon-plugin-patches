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
2. 不修改上游 JavaScript 的任何一行
3. 测试结论必须附证据（命令 + 输出）

详细规范 → [AI-GUIDE.md](AI-GUIDE.md) · 人类向教学 → [PLUGIN-DEV-GUIDE.md](PLUGIN-DEV-GUIDE.md)
**新环境部署模拟器** → [tools/loon-sim/DEPLOY.md](tools/loon-sim/DEPLOY.md)
