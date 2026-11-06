# 上游插件改造（kelee 等）

> 从上游（kelee.one 等）拉取现成插件到本仓库维护的流程。
> 适用: 上游停更、上游有 bug、或需补充拦截。2026-10-24 实战（SMZDM/RedPaper）。

## 1. 拉取（注意 UA 限制）

```bash
UA="Loon/1005 CFNetwork/3860.500.112 Darwin/25.4.0"   # 从用户 HAR 里取真实 UA
curl -s -A "$UA" -o plugins/<Name>/<name>.lpx "https://kelee.one/Tool/Loon/Lpx/<name>.lpx"
# 上游引用的远程资源（jq_file 脚本等）一并拉取到 plugins/<Name>/src/
```

## 2. 摸底与 check

```bash
cd tools/loon-sim && node cli.js check ../../plugins/<Name>/<name>.lpx
node cli.js rules <lpx>    # 结构盘点: Rule/Script/Rewrite/MitM 各几条
```
注意: `response.json.jq_file`（远程 jq）在模拟器是未知 Action — 需本地化（见 4）。

## 3. 二进制审计（App 不常用可大胆拦）

上游之外补齐: IPA 解包 → strings 提取 API → 与上游规则对照找缺口 → HAR 实测只拦活跃的。
审计方法同自研流程（app-notes.md 二进制审计基线）。

## 4. jq_file 本地化（上游常见依赖）

上游用远程 jq 脚本做响应清洗 → 翻译成语义等价的本地 JS（放 `plugins/<Name>/src/`）,
lpx 里 `[Rewrite] jq_file` 规则改为 `[Script]` 指向本地文件。收益: 摆脱远程依赖 + 模拟器可验证。

## 5. 命名与版本规范

- `#!name=<纯名称> v1.0.0`（不带作者昵称）+ `#!version=1.0.0`
- README 按仓库统一格式: 版本引用行 / 双表头（上游署名 + 本仓库改动）/ 改动版本表 / 验证记录 / 已知边界
- 埋探针: `version-probe.sh <lpx> setup`

## 6. 上游 bug 修复（例: RedPaper livephoto）

上游脚本可能有隐藏 bug（如 url.replace 只换前段保留畸形尾巴）:
取证方法 — 真实 HAR 双响应对比 + CDN 可达性实测（畸形 403 / 干净 200）+ 端到端验证 → README 记录根因链。

## 7. 多窗口并行开发协调

同仓库双窗口（或双会话）并行时:
- **commit 前先 `git pull`** — 避免覆盖另一窗口改动; 自己的改动可能被对方提交"搭车"带上远端（内容无损, 属正常）
- 探针/模拟器结论写记忆 — 另一窗口可直接引用, 避免重复踩坑
- 大任务前 `ps aux | grep node` 看内存压力 — iSH 4G, 嵌套 node 是重灾区
