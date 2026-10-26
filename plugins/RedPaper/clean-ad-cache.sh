#!/bin/sh
# 小红书（LC 容器）广告缓存清理脚本
# 用途: 插件只能拦 HTTP，本地已缓存的广告素材需直接删
# 用法: sh clean-xhs-ad-cache.sh [--dry-run]
# 容器: Live Container 的 com.xingin.discover

set -e

DRY=0
[ "$1" = "--dry-run" ] && DRY=1

# LC 数据容器（xingin.discover）
DATA="/var/minis/mounts/Live Container/Data/Application/CA6E2D16-B835-469E-8B2E-7DC45C02CC0E"

if [ ! -d "$DATA" ]; then
  echo "❌ 容器不存在: $DATA"
  echo "   请确认 LC 内已安装小红书，或修改脚本里的容器 UUID"
  exit 1
fi

DSL="$DATA/Library/dsl_template_Directory"
SPLASH="$DATA/Documents/com.xiaohongshu.SplashAds"
BOX="$DATA/Library/Caches/SurpriseBox"

# 要清的 DSL 模板（正则）
DSL_PATTERN='^ads_|^splash_ad|seller_window|brandzone|mid_roll|engage|^ad_|^search_recommend_trending$'

report() {
  if [ "$DRY" = "1" ]; then
    echo "  [dry-run] $1"
  else
    echo "  ✅ $1"
  fi
}

echo "=== 1. DSL 广告模板缓存 ==="
if [ -d "$DSL" ]; then
  BEFORE=$(ls "$DSL" | wc -l)
  COUNT=0
  for t in $(ls "$DSL" | grep -Ei "$DSL_PATTERN" 2>/dev/null); do
    COUNT=$((COUNT+1))
    if [ "$DRY" = "0" ]; then rm -rf "$DSL/$t"; fi
  done
  AFTER=$([ "$DRY" = "1" ] && echo "$BEFORE" || ls "$DSL" | wc -l)
  echo "  模板 $BEFORE → $AFTER（清除 $COUNT 个）"
  report "DSL 模板已清理"
else
  echo "  ⏭  目录不存在，跳过"
fi

echo ""
echo "=== 2. 开屏广告素材（Lottie/视频/配置）==="
if [ -d "$SPLASH" ]; then
  N=$(find "$SPLASH" -type f 2>/dev/null | wc -l)
  if [ "$DRY" = "0" ]; then
    rm -rf "$SPLASH"/Lottie/* 2>/dev/null || true
    rm -f "$SPLASH"/splash_ads_splashAdsInfoConfig_CPT 2>/dev/null || true
  fi
  echo "  原 $N 个文件 → $([ "$DRY" = "1" ] && echo "$N" || find "$SPLASH" -type f | wc -l) 个"
  report "开屏素材已清理"
else
  echo "  ⏭  目录不存在，跳过"
fi

echo ""
echo "=== 3. 惊喜盒子（双十一等活动弹窗）==="
if [ -d "$BOX" ]; then
  N=$(find "$BOX" -type f 2>/dev/null | wc -l)
  if [ "$DRY" = "0" ]; then rm -rf "$BOX"; fi
  echo "  原 $N 个文件"
  report "惊喜盒子已清理"
else
  echo "  ⏭  目录不存在，跳过"
fi

echo ""
if [ "$DRY" = "1" ]; then
  echo "🔍 dry-run 完成，未做任何修改。去掉 --dry-run 实际执行。"
else
  echo "✅ 清理完成。重启小红书后生效。"
  echo ""
  echo "⚠️  注意：这些是 App 私有缓存，App 联网后会按需重新下载。"
  echo "   插件已拦截广告接口，重新下载的通常是空数据或非广告内容。"
fi
