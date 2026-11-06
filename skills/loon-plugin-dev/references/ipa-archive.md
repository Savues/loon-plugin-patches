# 逆向 IPA 归档（私库备份流程）

> 审计完成的脱壳 IPA 上传到私库 `Savues/ios-reverse-engineering`，防 /tmp 被清后无法复现。
> 2026-10-24 实战沉淀（阿里五 App + 小红书 + 一淘 + Moon + 大淘客，共 ~926MB）。

## 1. 为什么要归档

- `/tmp` 会被清空（历史上全套逆向文件曾因此丢失）— IPA 是不可再生的分析材料
- 未来版本升级时需要**新旧二进制 diff**（找新增广告接口）
- 多窗口/新会话可从私库直接拉取，不依赖当时的工作目录

## 2. 归档格式（GitHub 限制下的方案）

GitHub 单文件硬限 **100MB**；脱壳 Mach-O gzip 压缩率约 46%，大多数 App 主二进制压后 <100MB 单文件直传：

```bash
# 单文件方案（压缩后 <95MB, 最简）
gzip -c -1 <主二进制> > <App名>_<版本>.bin.gz

# 拆分方案（压缩后仍 >95MB, 如小红书 388MB → 160MB）
gzip -c -1 <主二进制> > x.bin.gz
split -b 95m x.bin.gz x.bin.gz.part    # BusyBox split 无 -d, 后缀是字母
```

## 3. 目录结构与 RESTORE.md（每个目录必带）

```
<Sdk族或App>/<App名>_<版本>/
├── <App名>_<版本>.bin.gz(.partaa/ab)   # 主二进制压缩件
└── RESTORE.md                          # 恢复命令 + 原始大小 + 提取产物说明
```

RESTORE.md 模板：
```markdown
# <App名> <版本> 逆向备份
- 来源: <原ipa文件名>（脱壳版）
- 内容: 主二进制 <原始大小>, gzip 压缩后 <压缩大小>
- 恢复: `gunzip -c <name>.bin.gz > <binary>`（拆分版: 先 `cat *.part* > x.bin.gz`）
- 配套: API 清单/审计结论见 <相关位置>
```

## 4. 上传

```bash
cd /tmp && git clone --depth 1 https://$GITHUB_TOKEN@github.com/Savues/ios-reverse-engineering.git ire-clone
cd ire-clone && git config user.name "Savues" && git config user.email "Savues@users.noreply.github.com"
# 放入文件 + RESTORE.md 后:
git add -A && git commit -m "<族>/<App>_<版本>: 主二进制备份" && git push -q origin main
```

- 50MB 以上文件会有 GitHub LFS 建议警告 — 不影响使用，忽略
- **完整性抽验（必做）**: 下载回一个分块 md5sum 对比本地（曾验证 partab 完全一致）

## 5. 顺手归档的提取产物

strings 提取的 API 清单（`<App>_apis.txt`）体积小价值高 — 一并放入同目录，未来审计直接用不用重新解包。

## 6. 何时归档

一个 App 的逆向审计**完成后立即归档**（不要攒）—— /tmp 清空随时可能发生；ipa 原包 100MB+ 的不必重复传（能从脱壳包重建分析环境）。
