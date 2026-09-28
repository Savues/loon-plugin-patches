#!/usr/bin/env python3
"""
把 src/ui.html 注入成 src/geo-ui.js。

为什么要有这一层：Loon 只能用 script-path 远程拉一个 .js，没法读同目录的
.html。所以页面必须整个塞进脚本里。手写转义很容易漏（反斜杠、${、反引号），
于是把页面单独存成 ui.html —— 可读、可改、可 diff —— 再由这个脚本生成。

    python3 build_ui.py          # 生成 + 语法自检
    python3 build_ui.py --check  # 只检查 geo-ui.js 是否与 ui.html 同步

改动 ui.html 后记得重跑。
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
HTML = HERE / "src" / "ui.html"
OUT = HERE / "src" / "geo-ui.js"

TEMPLATE = r'''
/**
 * GeoFix 本地设置页
 *
 * 端点： GET https://gs-loc.apple.com/geo-ui/
 * 由 http-request 规则在本地伪造一个 HTML 响应 —— Safari 直接打开就是控制界面。
 * 页面与 /geo-settings/ /geo-parse/ 同源，**不依赖任何外部服务**。
 *
 * ⚠️ 本文件由 build_ui.py 从 src/ui.html 生成，**不要直接改**。
 *    要改页面请改 src/ui.html，然后重跑 python3 build_ui.py
 *
 * 页面源码 SHA256: __SHA__
 */
(() => {
  // JSON.stringify 把整个 HTML 变成一个安全的 JS 字符串字面量，
  // 换行、反斜杠、反引号、${ 都不用操心。必须先于下面的 $done 声明。
  const PAGE = __PAGE__;
  const requestUrl = (typeof $request !== "undefined" && $request.url) || "";
  const path = String(requestUrl).split("?")[0] || "";
  if (!/\/geo-ui\/?$/.test(path)) {
    if (typeof $done === "function") {
      $done({ response: { status: 404, headers: { "Content-Type": "text/plain" }, body: "not found" } });
    }
    return;
  }
  if (typeof $done === "function") {
    $done({
      response: {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        },
        body: PAGE
      }
    });
  }
})();
'''



def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只检查是否同步，不写入")
    a = ap.parse_args()

    if not HTML.exists():
        sys.exit(f"!! 找不到 {HTML}")
    raw = HTML.read_bytes()
    html = raw.decode("utf-8")
    sha = hashlib.sha256(raw).hexdigest()
    generated = TEMPLATE.replace("__SHA__", sha).replace("__PAGE__", json.dumps(html, ensure_ascii=False))

    if a.check:
        if not OUT.exists():
            sys.exit("!! geo-ui.js 不存在，请跑 python3 build_ui.py")
        cur = OUT.read_text(encoding="utf-8")
        if cur != generated:
            sys.exit("!! geo-ui.js 与 src/ui.html 不同步 —— 改完页面忘了跑 build_ui.py")
        print(f"✔ 已同步（ui.html sha256={sha[:16]}）")
        return

    OUT.write_text(generated, encoding="utf-8")

    # 语法自检
    r = subprocess.run(["node", "--check", str(OUT)], capture_output=True, text=True)
    if r.returncode != 0:
        OUT.unlink()
        sys.exit("!! node --check 失败，已删除产物：\n" + (r.stderr or r.stdout))

    print(f"✔ 已生成 src/geo-ui.js  ({OUT.stat().st_size} bytes)")
    print(f"  页面源码 sha256 = {sha}")
    print("  node --check 语法自检 ✔")
    print("  改页面请编辑 src/ui.html 后重跑本脚本")


if __name__ == "__main__":
    main()
