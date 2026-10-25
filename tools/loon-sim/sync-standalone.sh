#!/bin/sh
# 把本目录的模拟器同步到独立仓库 Savues/loon-sim（保留仓库历史）
# 用法: sh tools/loon-sim/sync-standalone.sh ["commit message"]
# 依赖: GITHUB_TOKEN 环境变量
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
REMOTE="https://x-access-token:${GITHUB_TOKEN}@github.com/Savues/loon-sim.git"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 克隆现有仓库（保留历史）；失败则初始化
if git clone -q "$REMOTE" "$TMP/repo" 2>/dev/null; then
  echo "→ 已克隆现有仓库（保留历史）"
else
  echo "→ 新建仓库"
  mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q
  git remote add origin "$REMOTE"
  # 首次需要基础文件（LICENSE / package.json / examples 由本仓库提供时跳过）
fi

cd "$TMP/repo"
git config user.name "Savues"; git config user.email "Savues@users.noreply.github.com"

# 同步代码文件（保留仓库自有的 LICENSE/package.json/.gitignore/examples）
cp "$HERE"/*.js "$HERE"/regression-history.sh "$HERE"/probe-setup.py "$HERE"/version-probe.sh "$HERE"/README.md "$HERE"/CHANGELOG.md "$HERE"/DEPLOY.md "$HERE"/package.json .
# 官方文档存档目录
if [ -d "$HERE/docs" ]; then
  rm -rf docs && cp -r "$HERE/docs" docs
fi

git add -A
if git diff --cached --quiet; then
  echo "✅ 无变化，未提交"
else
  git commit -q -m "${1:-sync: 同步来自 loon-plugin-patches 的模拟器更新}"
  git branch -M main
  git push -q origin main
  echo "✅ 已同步到 Savues/loon-sim"
  git log --oneline -1 | sed 's/^/   /'
fi
