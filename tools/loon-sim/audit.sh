#!/bin/sh
# audit.sh — 部署物流审计入口（逻辑在 audit.py；iSH ash 循环+grep 有挂死怪癖，故逻辑走 python）
exec python3 "$(dirname "$0")/audit.py" "$@"
