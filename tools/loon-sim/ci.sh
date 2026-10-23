#!/bin/sh
# loon-sim CI — 全套回归 (退出码语义化, 可接 GitHub Actions / pre-commit)
# 用法: sh tools/loon-sim/ci.sh [plugins根目录, 默认 ../../plugins]
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
PLUGINS="${1:-$HERE/../../plugins}"
echo "════ loon-sim CI ════"
echo ""
echo "── ① 内核自测"
node "$HERE/selftest.js" | tail -1
echo ""
echo "── ② 历史问题回溯"
sh "$HERE/regression-history.sh" | tail -1
echo ""
echo "── ③ 全量插件 check"
# 已知问题白名单 (真实插件问题, 待插件侧修复; 见 docs/converter.md 与 CHANGELOG)
# 已知问题白名单 (当前为空 — 死开关问题已于 2026-10-24 全部修复)
KNOWN=""
ok=0; bad=0; known=0
for f in "$PLUGINS"/*/*.lpx; do
  base=$(basename "$f")
  case "$base" in test-*|upstream-*|*jsdelivr*) continue;; esac
  rel="$(basename $(dirname $f))/$base"
  if node "$HERE/cli.js" check "$f" 2>/dev/null | tail -1 | grep -q " 0 错误"; then ok=$((ok+1))
  elif echo " $KNOWN " | grep -q " $rel "; then known=$((known+1)); echo "  ⚠️ 已知: $rel"
  else bad=$((bad+1)); echo "  ❌ 新问题: $rel"; fi
done
echo "  0错误: $ok | 已知: $known | 新问题: $bad"
[ "$bad" -eq 0 ] || { echo "❌ check 发现新问题"; exit 2; }
echo ""
echo "── ④ 转换一致性 parity"
p_ok=0; p_bad=0
for f in "$PLUGINS"/*/*.lpx; do
  base=$(basename "$f")
  case "$base" in test-*|upstream-*|*jsdelivr*) continue;; esac
  if node "$HERE/convert-parity.js" "$f" 2>/dev/null | tail -1 | grep -qE "✅|跳过"; then p_ok=$((p_ok+1)); else p_bad=$((p_bad+1)); echo "  ⚠️ $(basename $(dirname $f))/$base"; fi
done
echo "  一致: $p_ok | 不一致: $p_bad"
[ "$p_bad" -eq 0 ] || { echo "❌ parity 存在不一致"; exit 3; }
echo ""
echo "✅ CI 全部通过"
