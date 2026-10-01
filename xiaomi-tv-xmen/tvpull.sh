#!/bin/bash
# 用法: ./tvpull.sh <远端文件> <本地目标> [分块字节]
# 针对 192.168.31.155 adb 频繁断连,自动分块+断线重连+断点续传
set -u
IP=192.168.31.155
PORT=5555
CHUNK=${3:-2097152}   # 2MB
REMOTE=$1
LOCAL=$2
TMP=/tmp/tvchunk_$$
mkdir -p /tmp/tvpull
RETRY_MAX=8

connect() {
  for i in $(seq 1 $RETRY_MAX); do
    adb connect $IP:$PORT >/dev/null 2>&1
    sleep 2
    if adb devices 2>/dev/null | grep -q "^$IP:$PORT.*device$"; then
      return 0
    fi
    echo "  [重连 $i/$RETRY_MAX] 失败,3s后重试" >&2
    sleep 3
  done
  return 1
}

# 1. 取总大小
connect || { echo "无法连接" >&2; exit 1; }
TOTAL=$(adb -s $IP:$PORT shell "wc -c < $REMOTE" 2>/dev/null | tr -dc '0-9')
[ -z "$TOTAL" ] && { echo "取大小失败" >&2; exit 1; }
echo "总大小: $TOTAL 字节 ($((TOTAL/1024/1024)) MB)"

# 2. 算分块数
N=$(( (TOTAL + CHUNK - 1) / CHUNK ))
echo "分 $N 块,每块 $((CHUNK/1024))KB"

# 3. 逐块拉,断线自动重连+续传
DONE=0
FAILED=0
for i in $(seq 0 $((N-1))); do
  OFF=$((i * CHUNK))
  PART=/tmp/tvpull/p$i
  # 已存在且大小正确则跳过(断点续传)
  if [ -f "$PART" ]; then
    WANT=$CHUNK
    [ $((OFF+CHUNK)) -gt $TOTAL ] && WANT=$((TOTAL-OFF))
    HAVE=$(wc -c < "$PART" 2>/dev/null || echo 0)
    if [ "$HAVE" -eq "$WANT" ]; then
      echo "块 $((i+1))/$N 已存在,跳过"
      DONE=$((DONE+1))
      continue
    fi
  fi
  ADDR="bs=1 skip=$OFF count=$((CHUNK))"
  OK=0
  for r in 1 2 3; do
    connect || continue
    adb -s $IP:$PORT shell "dd if=$REMOTE of=$PART $ADDR 2>/dev/null" >/dev/null 2>&1
    WANT=$CHUNK
    [ $((OFF+CHUNK)) -gt $TOTAL ] && WANT=$((TOTAL-OFF))
    HAVE=$(wc -c < "$PART" 2>/dev/null || echo 0)
    if [ "$HAVE" -eq "$WANT" ]; then
      echo "块 $((i+1))/$N ✅ ($WANT 字节)"
      OK=1; DONE=$((DONE+1))
      break
    else
      echo "块 $((i+1))/$N 传输不全($HAVE/$WANT),重试 $r/3"
      sleep 2
    fi
  done
  [ $OK -eq 0 ] && FAILED=$((FAILED+1))
done

echo "--- 完成 $DONE/$N 块,失败 $FAILED ---"
if [ $FAILED -gt 0 ]; then
  echo "再次运行本脚本会自动跳过已完成块(断点续传)" >&2
  exit 1
fi

# 4. 合并
cat $(for i in $(seq 0 $((N-1))); do echo /tmp/tvpull/p$i; done) > "$LOCAL"
FINAL=$(wc -c < "$LOCAL")
echo "合并后: $FINAL 字节 (应为 $TOTAL)"
[ "$FINAL" -eq "$TOTAL" ] && echo "✅ 完整" || { echo "❌ 不完整"; exit 1; }
rm -rf /tmp/tvpull