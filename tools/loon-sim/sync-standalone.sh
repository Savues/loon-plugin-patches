#!/bin/sh
# 把本目录的模拟器同步到独立仓库 Savues/loon-sim
# 用法: sh tools/loon-sim/sync-standalone.sh [commit-message]
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
TMP=$(mktemp -d)
echo "→ 复制到 $TMP"
cp "$HERE"/*.js "$HERE"/*.sh "$HERE/README.md" "$TMP"/
mkdir -p "$TMP/examples"

# 从独立仓库拉取非代码文件（LICENSE / package.json / examples 等）
REMOTE="https://x-access-token:${GITHUB_TOKEN}@github.com/Savues/loon-sim.git"
git clone -q --depth 1 "$REMOTE" "$TMP/.remote" 2>/dev/null || true
if [ -d "$TMP/.remote" ]; then
  for f in LICENSE package.json .gitignore; do
    [ -f "$TMP/.remote/$f" ] && cp "$TMP/.remote/$f" "$TMP/" || true
  done
  [ -d "$TMP/.remote/examples" ] && cp -r "$TMP/.remote/examples" "$TMP/" || true
  cd "$TMP/.remote" && git checkout -q . 2>/dev/null || true
fi

cd "$TMP"
rm -rf .remote
git init -q
git config user.name "Savues"; git config user.email "Savues@users.noreply.github.com"
git add -A
MSG="${1:-sync: 同步来自 loon-plugin-patches 的模拟器更新}"
git commit -q -m "$MSG"
git branch -M main
git remote add origin "$REMOTE"
git push -f -q origin main
echo "✅ 已同步到 Savues/loon-sim"
cd /; rm -rf "$TMP"
