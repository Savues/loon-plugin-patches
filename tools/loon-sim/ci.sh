#!/bin/sh
# loon-sim CI — 全套回归 (退出码语义化, 可接 GitHub Actions / pre-commit)
# 用法: sh tools/loon-sim/ci.sh [plugins根目录, 默认 ../../plugins]
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
PLUGINS="${1:-$HERE/../../plugins}"
UNVERIFIED=0
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
echo "── ⑥ 插件单测 (plugins/*/test/*.test.mjs)"
# 已知失败白名单：陈旧用例，修好后必须从名单移除（禁止新增）
KNOWN_TEST_FAIL="
AdGuard-Spoof/equivalence.test.mjs
AgentRouter/manifest.test.mjs
AntiRevoke/manifest.test.mjs
Douban-Dedup/manifest.test.mjs
PinDuoDuo/homepage.test.mjs
PinDuoDuo/manifest.test.mjs
PinDuoDuo/stub-wiring.test.mjs
PinDuoDuo/stub.test.mjs
PinDuoDuo/subsidy2.test.mjs
PinDuoDuoTest/homepage.test.mjs
PinDuoDuoTest/manifest.test.mjs
PinDuoDuoTest/stub-wiring.test.mjs
PinDuoDuoTest/stub.test.mjs
PinDuoDuoTest/subsidy2.test.mjs
YouTube-Test/shorts-arg.test.mjs
"
t_pass=0; t_known=0; t_fail=0
for f in "$PLUGINS"/*/test/*.test.mjs; do
  [ -f "$f" ] || continue
  name="$(basename "$(dirname "$(dirname "$f")")")/$(basename "$f")"
  if timeout 60 node "$f" >/tmp/t.out 2>&1; then t_pass=$((t_pass+1))
  elif echo "$KNOWN_TEST_FAIL" | grep -qxF "$name"; then t_known=$((t_known+1)); echo "  ⚠️ 已知失败: $name"
  else t_fail=$((t_fail+1)); echo "  ❌ 新失败: $name"; echo "----- OUTPUT $name -----"; tail -40 /tmp/t.out; echo "----- END -----"; fi
done
echo "  通过: $t_pass | 已知失败: $t_known | 新失败: $t_fail"
[ "$t_fail" -eq 0 ] || { echo "❌ 插件单测出现新失败"; exit 6; }

echo ""
echo "── ⑦ 独立仓同步一致性 (loon-sim) — 防止改了本仓漏同步独立仓"
if [ -n "$GITHUB_TOKEN" ]; then
  CLONE_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/Savues/loon-sim.git"
else
  CLONE_URL="https://github.com/Savues/loon-sim.git"
fi
SYNC_TMP=$(mktemp -d)
sync_ok=0
for i in 1 2 3; do
  if git clone -q --depth 1 "$CLONE_URL" "$SYNC_TMP/repo" 2>/dev/null; then sync_ok=1; break; fi
  rm -rf "$SYNC_TMP/repo"; sleep 2
done
if [ "$sync_ok" -eq 1 ]; then
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
  rm -rf "$SYNC_TMP"
  if [ "$SKIP_SYNC" = "1" ]; then
    echo "  ⚠️ 跳过（SKIP_SYNC=1）— 双仓一致性未验证"
    UNVERIFIED=1
  else
    echo "❌ 无法克隆独立仓（网络/权限）。确认可跳过请设 SKIP_SYNC=1"
    exit 7
  fi
fi

echo ""
if [ "$UNVERIFIED" = "1" ]; then
  echo "✅ CI 通过（⑦ 未验证）"
else
  echo "✅ CI 全部通过"
fi
