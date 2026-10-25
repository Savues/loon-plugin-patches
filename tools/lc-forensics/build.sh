#!/bin/sh
# lc-forensics 一键构建 (iSH → iOS arm64 dylib)
# 用法: sh build.sh [版本后缀]
set -e
cd "$(dirname "$0")"
V="${1:-4.0}"
OUT="lc-forensics-v${V}.dylib"

SHIM="$(pwd)/shim"
clang \
  --target=arm64-apple-ios15.0.0 \
  -fPIC -O2 \
  -fno-objc-arc \
  -D__WCHAR_TYPE__=unsigned \
  -nostdinc \
  -isystem "$SHIM" \
  -isystem /usr/include \
  -include "$SHIM/compat.h" \
  -o /tmp/lcf.o -c lc-forensics.c

/usr/bin/ld64.lld \
  -dylib -arch arm64 \
  -platform_version ios 15.0 16.0 \
  -install_name @rpath/lc-forensics.dylib \
  -undefined dynamic_lookup \
  -dead_strip -s \
  -o "$OUT" /tmp/lcf.o

ldid -S "$OUT"
echo "=== 构建完成: $OUT ==="
ls -la "$OUT"
file "$OUT" 2>/dev/null || true
# 基本校验: Mach-O magic + 符号抽查
python3 - "$OUT" <<'EOF'
import struct,sys
d=open(sys.argv[1],'rb').read(4)
magic=struct.unpack('<I',d)[0]
print(f"magic=0x{magic:08x}", "OK(cffaedfe dylib)" if magic==0xfeaedcff or magic==0xcffaedfe else "!!异常")
EOF
nm -gU "$OUT" 2>/dev/null | head -5 || echo "(nm 不可用，跳过符号检查)"
