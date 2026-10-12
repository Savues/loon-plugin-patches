#!/usr/bin/env python3
"""
重建 / 改写 GeoFix 配套快捷指令（.shortcut = binary plist）。

不是"从零重建"，而是"加载原件 → 定点替换字符串 → 写回 plist"。

用法:
    # 换解析后端（推荐指向自建 Worker）
    python3 build_shortcut.py --worker https://geofix-parse.<你的子域>.workers.dev

    # 改定位精度（插件会夹到 5–200 米）
    python3 build_shortcut.py --acc 30

    # 全部重置
    python3 build_shortcut.py
"""
import argparse
import copy
import json
import plistlib
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "GeoFix位置.shortcut"

UPSTREAM_PARSE_HOST = "wloc-spoofer.wloc.workers.dev"
UPSTREAM_SAVE_PATH = "/wloc-settings/save"
MARK = "￼"  # OBJECT REPLACEMENT CHARACTER


def patch_string(value: dict, edits) -> bool:
    """
    对 WFTextTokenString 的 Value 字典做替换，并**同步平移附件偏移**。

    附件用 ￼ 标记，attachmentsByRange 的 {start,len} 是原字符串的字符下标。
    替换点之前的 offset 不变，之后的全部要加上长度差，否则变量错位。
    从后往前替换，前面所有下标天然保持有效。
    """
    s = value.get("string")
    if not isinstance(s, str) or MARK not in s:
        return False
    original = s
    for old, new in sorted(edits, key=lambda e: -original.find(e[0]) if e[0] in original else 0):
        idx = original.find(old)
        if idx < 0:
            return False
        delta = len(new) - len(old)
        original = original[:idx] + new + original[idx + len(old):]
        if delta:
            for key in list(value.get("attachmentsByRange", {})):
                m = re.match(r"\{(\d+),\s*(\d+)\}$", key)
                if not m:
                    continue
                start, ln = int(m.group(1)), int(m.group(2))
                if start >= idx:
                    value["attachmentsByRange"][f"{{{start + delta}, {ln}}}"] = \
                        value["attachmentsByRange"].pop(key)
    if original.count(MARK) != s.count(MARK):
        raise ValueError("替换改变了 ￼ 标记数量，附件会丢失")
    if original == s:
        return False
    value["string"] = original
    return True


def walk(obj, fn):
    if isinstance(obj, dict):
        fn(obj)
        for v in obj.values():
            walk(v, fn)
    elif isinstance(obj, list):
        for v in obj:
            walk(v, fn)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--worker", default=None,
                    help="解析 Worker 基地址，如 https://xxx.workers.dev（不含 /api/parse）")
    ap.add_argument("--acc", type=int, default=None, help="定位精度，米（插件夹到 5–200）")
    ap.add_argument("-o", "--out", default=None)
    a = ap.parse_args()

    with open(SRC, "rb") as f:
        doc = plistlib.load(f)
    doc = copy.deepcopy(doc)

    # ① 端点路径改名：上游是 /wloc-settings/save，本插件用 /geo-settings/save
    #    （两者都是插件自己伪造的虚拟端点，Apple 那边并不存在，不影响兼容性）
    host_edits = [(UPSTREAM_PARSE_HOST, (a.worker or "").rstrip("/").removeprefix("https://").removeprefix("http://"))]
    acc_edits = [("&acc=25", f"&acc={a.acc}")] if a.acc is not None and a.acc != 25 else []
    path_edits = [(UPSTREAM_SAVE_PATH, "/geo-settings/save")]

    applied = {"parse": 0, "save": 0}

    def visit(d):
        if not isinstance(d, dict):
            return
        s = d.get("string")
        if not isinstance(s, str) or MARK not in s:
            return
        if "/api/parse" in s:
            if a.worker:
                patch_string(d, host_edits)
            applied["parse"] += 1
        elif UPSTREAM_SAVE_PATH in s:
            if patch_string(d, path_edits + acc_edits):
                applied["save"] += 1
            else:
                raise SystemExit("!! save 端点改名失败，原件格式可能变了")

    walk(doc, visit)
    if applied["parse"] != 1 or applied["save"] != 1:
        raise SystemExit(f"!! 预期各命中 1 处，实际 parse={applied['parse']} save={applied['save']}；"
                         "原件格式可能变了，先看一眼 GeoFix位置.shortcut")

    # ② 注释文案与通知标题改名（纯展示文本，不涉及附件偏移）
    def rename(node):
        if isinstance(node, dict):
            for k, v in node.items():
                if k == "WFNotificationActionTitle":
                    node[k] = "GeoFix"
                elif isinstance(v, str):
                    node[k] = v.replace("调用 wloc 储存接口", "调用 GeoFix 储存接口")
                else:
                    rename(v)
        elif isinstance(node, list):
            for v in node:
                rename(v)

    rename(doc)

    out = Path(a.out) if a.out else HERE / "GeoFix位置.build.shortcut"
    with open(out, "wb") as f:
        plistlib.dump(doc, f, fmt=plistlib.FMT_BINARY, sort_keys=True)

    # 自检：每个附件偏移必须仍落在 ￼ 上
    bad, checked = [], 0
    for act in doc.get("WFWorkflowActions", []):
        for key, val in (act.get("WFWorkflowActionParameters") or {}).items():
            v = val.get("Value") if isinstance(val, dict) else None
            if isinstance(v, dict) and "string" in v:
                s = v["string"]
                for k in v.get("attachmentsByRange", {}):
                    st, ln = int(k[1:k.index(",")]), int(k[k.index(",") + 2:-1])
                    checked += 1
                    if s[st:st + ln] != MARK:
                        bad.append(f"{key} {k} → {s[st:st+ln]!r}")
    if bad:
        raise SystemExit("!! 附件偏移错位：\n   " + "\n   ".join(bad))

    print(f"✔ 已生成 {out}  ({out.stat().st_size} bytes)")
    print(f"  解析后端: {a.worker or '（沿用上游地址）'}")
    print(f"  精度 acc: {a.acc if a.acc is not None else 25}")
    print(f"  附件偏移自检: {checked} 处全部落在标记上 ✔")

    dump = {
        "name": "GeoFix设置位置",
        "clientVersion": doc.get("WFWorkflowClientVersion"),
        "types": doc.get("WFWorkflowTypes"),
        "inputContentTypes": doc.get("WFWorkflowInputContentItemClasses"),
        "actions": [
            {
                "index": i,
                "id": act.get("WFWorkflowActionIdentifier"),
                "params": {k: v for k, v in (act.get("WFWorkflowActionParameters") or {}).items() if k != "UUID"},
            }
            for i, act in enumerate(doc.get("WFWorkflowActions", []))
        ],
    }
    jp = HERE / "shortcut-source.json"
    jp.write_text(json.dumps(dump, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✔ 结构化拆解 {jp}")


if __name__ == "__main__":
    main()
