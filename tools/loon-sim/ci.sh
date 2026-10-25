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
echo "── ⑤ bundle.js 死代码检测 (定义行唯一出现的孤儿函数)"
dead_fail=0
for f in "$PLUGINS"/*/src/*.js; do
  [ -f "$f" ] || continue
  out=$(node "$HERE/dead-fn.js" "$f" 2>/dev/null)
  if echo "$out" | grep -q "死代码: [1-9]"; then
    echo "  ❌ $(basename $(dirname $(dirname $f)))/$(basename $f)"
    echo "$out" | grep "L[0-9]" | head -5
    dead_fail=1
  fi
done
[ "$dead_fail" -eq 0 ] && echo "  全部通过 ✅" || { echo "❌ 存在死代码"; exit 4; }

echo ""
echo "── ⑥ 独立仓同步一致性 (loon-sim) — 防止改了本仓漏同步独立仓"
if [ -n "$GITHUB_TOKEN" ]; then
  SYNC_TMP=$(mktemp -d)
  if git clone -q "https://x-access-token:${GITHUB_TOKEN}@github.com/Savues/loon-sim.git" "$SYNC_TMP/repo" 2>/dev/null; then
    sync_bad=0
    for f in CHANGELOG.md README.md DEPLOY.md package.json cli.js lpx.js matcher.js runtime.js trace.js report.js relevance.js rewrite-exec.js selftest.js dead-fn.js probe-setup.py version-probe.sh docs/plugin.md docs/rewrite-v2.md docs/script-v2.md docs/rule.md docs/script-api.md docs/converter.md docs/rewrite-legacy.md docs/script-legacy.md docs/version-probe.md; do
      [ -f "$HERE/$f" ] || continue
      if ! diff -q "$HERE/$f" "$SYNC_TMP/repo/$f" >/dev/null 2>&1; then
        # 独立仓缺文件也算不一致
        echo "  ❌ 不一致: $f"
        sync_bad=1
      fi
    done
    [ "$sync_bad" -eq 0 ] && echo "  双仓一致 ✅" || { echo "❌ 独立仓落后 — 跑 sync-standalone.sh 同步后重推"; rm -rf "$SYNC_TMP"; exit 5; }
    rm -rf "$SYNC_TMP"
  else
    echo "  ⚠️ 无法克隆独立仓 (跳过 — 检查 GITHUB_TOKEN/网络)"
    rm -rf "$SYNC_TMP"
  fi
else
  echo "  ⚠️ 无 GITHUB_TOKEN (跳过双仓检查)"
fi

echo ""
echo "✅ CI 全部通过"
