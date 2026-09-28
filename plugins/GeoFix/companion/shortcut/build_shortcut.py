#!/usr/bin/env python3
"""
重建 / 改写 GeoFix 配套快捷指令（.shortcut = binary plist）。

不是"从零重建"，而是"加载原件 → 定点改写 → 写回 plist"。

做四件事：
  ① 虚拟端点改名        /wloc-settings/save  →  /geo-settings/save
  ② 解析链接可控        硬编码的第三方域名 →  独立成第一个「文本」动作，用户可自行编辑
  ③ 写完自检            多取一次 status，把 mode 塞进通知，不再无条件报成功
  ④ 精度可调            --acc

为什么 ②③ 需要动结构：
.shortcut 里的 URL 不是普通字符串，而是 WFTextTokenString：
  "string": "https://…/api/parse?format=json&u=￼"
  "attachmentsByRange": { "{54, 1}": { "Type": "ActionOutput", "OutputName": "EncURL" } }
￼（U+FFFC）标记变量插入点，{54,1} 是它在**原字符串里的字符下标**。
换域名会改变前缀长度 ⇒ 后面所有标记的下标都得平移，否则变量插到错位置。
漏了这步的症状很隐蔽：一切照常运行，只是某个变量变成了 lat 里的某个字符，
被当成坐标发了出去。本脚本用 build_token() 自动算偏移，并在写盘前逐个核回标记。

g 模式：三动作一键入口，对应「https://savues.com/g/<链接>」
    python3 build_shortcut.py --g https://savues.com
    从分享菜单拿到链接 → 请求一次那个 URL → 解析和写入全在页面里自动完成
    → 跳到系统「定位服务」。比 local 模式少 15 个动作。

local 模式：照参考件原样保留 19 个动作（含 8 种输入类型声明），
只把两处 URL 换成本地插件端点。
    python3 build_shortcut.py --local https://map.com
参考这个件的关键是 WFWorkflowInputContentItemClasses 里有
WFMapsLinkContentItem —— 地图 App 分享地点时传的就是这个类型。
少声明它，手工重搭的版本从地图分享会失败，而界面里没法补。

网页模式（纯入口，6 个动作）：快捷指令退化成纯入口，把链接喂给控制页。
解析和写入全在插件的本地页面里完成，**不需要任何外部解析服务**。
    python3 build_shortcut.py --web https://map.com
    python3 build_shortcut.py --web https://map.com --auto   # 解析完直接写入，少点一下

独立模式：快捷指令自己解析+写入，需要一个解析服务。
    python3 build_shortcut.py --worker https://geofix-parse.<你的子域>.workers.dev
    python3 build_shortcut.py --worker <地址> --acc 30
    python3 build_shortcut.py --safe          # 只做纯字符串替换，不动结构（最保守）
    python3 build_shortcut.py --no-status      # 不加写入结果自检
"""
import argparse
import copy
import json
import plistlib
import re
import uuid as _uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "GeoFix位置.shortcut"

UPSTREAM_PARSE_HOST = "wloc-spoofer.wloc.workers.dev"
UPSTREAM_SAVE_PATH = "/wloc-settings/save"
MARK = "￼"          # OBJECT REPLACEMENT CHARACTER
PH_OPEN, PH_CLOSE = "{{", "}}"

# 固定 UUID（不用随机，方便 diff 和复现）
UUID_PARSE_WORKER = "a1a10001-0000-4000-8000-000000000001"
UUID_STATUS_FETCH = "a1a10002-0000-4000-8000-000000000002"
UUID_MODE_KEY = "a1a10003-0000-4000-8000-000000000003"
UUID_WEB_BASE = "a1a10004-0000-4000-8000-000000000004"
UUID_OPEN_URL = "a1a10005-0000-4000-8000-000000000005"
UUID_G_LINK = "a1a10006-0000-4000-8000-000000000006"
UUID_G_FETCH = "a1a10007-0000-4000-8000-000000000007"
UUID_G_ENC = "a1a10008-0000-4000-8000-000000000008"


# ── token string 构造 ──────────────────────────────────────────────────────
def build_token(template: str, refs: dict):
    """
    把 "{{Name}}" 占位符换成 ￼，并生成 attachmentsByRange。
    refs: {Name: {"Type": "ActionOutput"|"ExtensionInput", "OutputName": str, "OutputUUID": str}}
    返回 (string, attachmentsByRange)。偏移由代码算，不手写。
    """
    s, att, out = "", {}, []
    i = 0
    while i < len(template):
        j = template.find(PH_OPEN, i)
        if j < 0:
            s += template[i:]
            break
        s += template[i:j]
        k = template.index(PH_CLOSE, j)
        name = template[j + len(PH_OPEN):k]
        if name not in refs:
            raise SystemExit(f"!! 模板里的 {{{{{name}}}}} 没有对应的变量")
        att[f"{{{len(s)}, 1}}"] = dict(refs[name])
        out.append(name)
        s += MARK
        i = k + len(PH_CLOSE)
    return {"Value": {"string": s, "attachmentsByRange": att}, "WFSerializationType": "WFTextTokenString"}, out


def attachment_ref(uuid_str, output_name):
    return {"Type": "ActionOutput", "OutputUUID": uuid_str, "OutputName": output_name}


def find_action(doc, ident, nth=0):
    hits = [a for a in doc["WFWorkflowActions"] if a.get("WFWorkflowActionIdentifier") == ident]
    if len(hits) <= nth:
        raise SystemExit(f"!! 原件里找不到第 {nth} 个 {ident}")
    return hits[nth]


# ── 主流程 ─────────────────────────────────────────────────────────────────
def write_out(doc, actions, report, a):
    # ── 写盘前自检：每个附件偏移必须仍落在 ￼ 上 ────────────────────────
    bad, checked = [], 0
    for act in actions:
        for k, v in (act.get("WFWorkflowActionParameters") or {}).items():
            val = v.get("Value") if isinstance(v, dict) else None
            if isinstance(val, dict) and "string" in val:
                s = val["string"]
                for key in val.get("attachmentsByRange", {}):
                    st, ln = int(key[1:key.index(",")]), int(key[key.index(",") + 2:-1])
                    checked += 1
                    if s[st:st + ln] != MARK:
                        bad.append(f"{k} {key} → {s[st:st+ln]!r}")
    if bad:
        raise SystemExit("!! 附件偏移错位，中止：\n   " + "\n   ".join(bad))

    # 每个被引用的 OutputUUID 都必须真实存在
    uuids = set()
    for act in actions:
        uuids.add(act.get("WFWorkflowActionParameters", {}).get("UUID"))
    for act in actions:
        uuids.add(act.get("WFWorkflowActionParameters", {}).get("WFUUID"))
    dangling = []
    for act in actions:
        for v in (act.get("WFWorkflowActionParameters") or {}).values():
            val = v.get("Value") if isinstance(v, dict) else None
            if isinstance(val, dict) and "attachmentsByRange" in val:
                for ref in val["attachmentsByRange"].values():
                    if ref.get("Type") == "ActionOutput" and ref.get("OutputUUID") not in uuids:
                        dangling.append(f"{ref.get('OutputName')} → {ref.get('OutputUUID')}")
            if isinstance(val, dict) and val.get("Type") == "ActionOutput" and val.get("OutputUUID") not in uuids:
                dangling.append(f"{val.get('OutputName')} → {val.get('OutputUUID')}")
    if dangling:
        raise SystemExit("!! 引用了不存在的动作 UUID，中止：\n   " + "\n   ".join(sorted(set(dangling))))

    out = Path(a.out) if a.out else HERE / "GeoFix位置.build.shortcut"
    with open(out, "wb") as f:
        plistlib.dump(doc, f, fmt=plistlib.FMT_BINARY, sort_keys=True)
    # 回读一次，确认写出来的 plist 结构没坏
    plistlib.load(open(out, "rb"))

    print(f"✔ 已生成 {out.name}  ({out.stat().st_size} bytes, {len(actions)} 个动作)")
    for line in report:
        print(f"  · {line}")
    print(f"  · 附件偏移自检 {checked} 处 ✔　引用完整性 ✔")



def build_save_u_mode(doc, actions, a):
    """一键形态：把链接交给插件脚本去解析并写入，全程不需要 JS。"""
    base = a.save_u.rstrip("/")
    if not base.startswith("http"):
        raise SystemExit("!! --save-u 要带 http(s):// 前缀")

    def new(ident, params):
        return {"WFWorkflowActionIdentifier": ident, "WFWorkflowActionParameters": params}

    raw_act = new("is.workflow.actions.gettext", {
        "CustomOutputName": "RawLink", "UUID": UUID_G_LINK,
        "WFTextActionText": {"Value": {"Type": "ExtensionInput"}, "WFSerializationType": "WFTextTokenAttachment"},
    })
    enc_act = new("is.workflow.actions.urlencode", {
        "WFInput": {"Value": {"string": "\ufffc", "attachmentsByRange": {"{0, 1}": {"Type": "ActionOutput", "OutputUUID": UUID_G_LINK, "OutputName": "RawLink"}}},
                    "WFSerializationType": "WFTextTokenString"},
        "WFEncodeMode": "Encode", "CustomOutputName": "EncLink", "UUID": UUID_G_ENC,
    })
    tok, _ = build_token(
        "{{WebBase}}/geo-settings/save?u={{EncLink}}&acc=" + str(a.acc or 25),
        {"WebBase": attachment_ref(UUID_WEB_BASE, "WebBase"), "EncLink": attachment_ref(UUID_G_ENC, "EncLink")},
    )
    fetch_act = new("is.workflow.actions.downloadurl", {"WFURL": tok, "WFHTTPMethod": "GET", "WFUUID": UUID_G_FETCH})
    web_act = new("is.workflow.actions.gettext", {
        "CustomOutputName": "WebBase", "UUID": UUID_WEB_BASE,
        "WFTextActionText": {"Value": {"string": base, "attachmentsByRange": {}},
                             "WFSerializationType": "WFTextTokenString"},
    })
    open_act = new("is.workflow.actions.openurl",
                   {"WFInput": "prefs:root=Privacy&path=LOCATION", "WFUUID": UUID_OPEN_URL})

    doc["WFWorkflowActions"] = [raw_act, enc_act, web_act, fetch_act, open_act]
    return doc, [
        f"一键 → GET {base}/geo-settings/save?u=…&acc={a.acc or 25}",
        "解析与写入全在插件脚本里，不依赖页面 JS（Shortcuts 不执行 JS）",
        f"动作数 {len(actions)} → 5",
        "输入类型原样保留，含 WFMapsLinkContentItem",
    ]



def build_g_mode(doc, actions, a):
    """三动作：取文本 → 请求 https://<base>/g/<文本> → 跳定位服务设置。"""
    base = a.g.rstrip("/")
    if not base.startswith("http"):
        raise SystemExit("!! --g 要带 http(s):// 前缀")

    def new(ident, params):
        return {"WFWorkflowActionIdentifier": ident, "WFWorkflowActionParameters": params}

    text_act = new("is.workflow.actions.gettext", {
        "CustomOutputName": "Link",
        "UUID": UUID_G_LINK,
        "WFTextActionText": {"Value": {"Type": "ExtensionInput"}, "WFSerializationType": "WFTextTokenAttachment"},
    })
    tok, _ = build_token(
        "{{WebBase}}/g/{{Link}}",
        {"WebBase": attachment_ref(UUID_WEB_BASE, "WebBase"), "Link": attachment_ref(UUID_G_LINK, "Link")},
    )
    fetch_act = new("is.workflow.actions.downloadurl", {"WFURL": tok, "WFHTTPMethod": "GET", "WFUUID": UUID_G_FETCH})
    web_act = new("is.workflow.actions.gettext", {
        "CustomOutputName": "WebBase", "UUID": UUID_WEB_BASE,
        "WFTextActionText": {"Value": {"string": base, "attachmentsByRange": {}},
                             "WFSerializationType": "WFTextTokenString"},
    })
    delay_act = new("is.workflow.actions.delay", {"WFDelayTime": 1})
    open_act = new("is.workflow.actions.openurl",
                   {"WFInput": "prefs:root=Privacy&path=LOCATION", "WFUUID": UUID_OPEN_URL})

    doc["WFWorkflowActions"] = [text_act, web_act, fetch_act, delay_act, open_act]
    return doc, [
        f"一键入口 → GET {base}/g/<分享进来的链接>",
        "解析与写入全在页面里自动完成，零点击",
        f"动作数 {len(actions)} → 5",
        "输入类型原样保留，含 WFMapsLinkContentItem",
    ]



def apply_local(doc, actions, a):
    """把参考件的两处 URL 换成本地插件端点，动作结构与输入类型声明原样保留。"""
    base = a.local.rstrip("/")
    if not base.startswith("http"):
        raise SystemExit("!! --local 要带 http(s):// 前缀")
    hits = {"parse": 0, "save": 0}

    for act in actions:
        p = act.get("WFWorkflowActionParameters") or {}
        val = (p.get("WFURL") or {}).get("Value")
        if not isinstance(val, dict) or "string" not in val:
            continue
        s = val["string"]
        if "/api/parse" in s:
            tok, order = build_token(
                "{{WebBase}}/geo-parse?u={{EncURL}}",
                {"WebBase": {"Type": "ActionOutput", "OutputUUID": UUID_WEB_BASE, "OutputName": "WebBase"},
                 "EncURL": next(r for r in val["attachmentsByRange"].values() if r.get("OutputName") == "EncURL")},
            )
            p["WFURL"] = tok
            web_act = {
                "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
                "WFWorkflowActionParameters": {
                    "CustomOutputName": "WebBase",
                    "UUID": UUID_WEB_BASE,
                    "WFTextActionText": {"Value": {"string": base, "attachmentsByRange": {}},
                                         "WFSerializationType": "WFTextTokenString"},
                },
            }
            actions.insert(actions.index(act), web_act)
            hits["parse"] += 1
        elif "/wloc-settings/save" in s:
            tok, _ = build_token(
                "{{WebBase}}/geo-settings/save?lat={{Latitude}}&lon={{Longitude}}&acc=" + str(a.acc or 25),
                {"WebBase": {"Type": "ActionOutput", "OutputUUID": UUID_WEB_BASE, "OutputName": "WebBase"},
                 "Latitude": next(r for r in val["attachmentsByRange"].values() if r.get("OutputName") == "Latitude"),
                 "Longitude": next(r for r in val["attachmentsByRange"].values() if r.get("OutputName") == "Longitude")},
            )
            p["WFURL"] = tok
            hits["save"] += 1

    if hits != {"parse": 1, "save": 1}:
        raise SystemExit(f"!! 两处 URL 都要命中，实际 parse={hits['parse']} save={hits['save']}")
    for act in actions:
        for k, v in (act.get("WFWorkflowActionParameters") or {}).items():
            if isinstance(v, str) and re.search("(?i)wloc", v):
                act["WFWorkflowActionParameters"][k] = re.sub("(?i)wloc", "GeoFix", v)
    return [
        f"解析 URL → {base}/geo-parse?u=…（写入后：WebBase 文本动作，可自行改）",
        f"写入 URL → {base}/geo-settings/save?…",
        f"动作数 {len(actions)}（参考件结构原样保留）",
        "输入类型声明原样保留，含 WFMapsLinkContentItem",
    ]


def build_web_mode(doc, actions, a):
    """网页模式：只保留「取链接 → 编码 → 打开控制页」，其余动作全删。"""
    def find(ident, out=None):
        for x in actions:
            if x.get("WFWorkflowActionIdentifier") != ident:
                continue
            if out is None or (x.get("WFWorkflowActionParameters") or {}).get("CustomOutputName") == out:
                return x
        raise SystemExit("!! 原件里找不到 " + ident + " / " + str(out))

    inp = find("is.workflow.actions.gettext", "InputURL")
    enc = find("is.workflow.actions.urlencode", "EncURL")
    opener = find("is.workflow.actions.openurl")
    comment = actions[0] if actions[0].get("WFWorkflowActionIdentifier") == "is.workflow.actions.comment" else None

    base = a.web.rstrip("/")
    if not base.startswith("http"):
        raise SystemExit("!! --web 要带 http(s):// 前缀")

    web_act = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
        "WFWorkflowActionParameters": {
            "CustomOutputName": "WebBase",
            "UUID": UUID_WEB_BASE,
            "WFTextActionText": {"Value": {"string": base, "attachmentsByRange": {}},
                                 "WFSerializationType": "WFTextTokenString"},
        },
    }
    inp_uuid = inp["WFWorkflowActionParameters"]["UUID"]
    enc_uuid = enc["WFWorkflowActionParameters"]["UUID"]
    suffix = "&auto=1" if a.auto else ""
    tok, _ = build_token(
        "{{WebBase}}/?u={{EncURL}}" + suffix,
        {"WebBase": attachment_ref(UUID_WEB_BASE, "WebBase"),
         "EncURL": attachment_ref(enc_uuid, "EncURL")},
    )
    opener["WFWorkflowActionParameters"] = {
        "WFInput": tok,
        "WFUUID": UUID_OPEN_URL,
    }
    if comment:
        comment["WFWorkflowActionParameters"]["WFCommentActionText"] = "从地图 App 分享链接过来，交给控制页处理"

    keep = [x for x in actions if x in (comment, inp, enc, opener)]
    doc["WFWorkflowActions"] = [x for x in [comment, web_act, inp, actions[actions.index(enc) - 1], enc, opener]
                                if x is not None]
    return doc, [
        f"网页模式 → 打开 {base}{'/?u=…&auto=1' if a.auto else '/?u=…'}",
        "解析与写入全部交给控制页（本地完成，无需解析服务）",
        f"动作数 {len(actions)} → {len(doc['WFWorkflowActions'])}",
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--worker", default=None, help="解析服务基地址，如 https://xxx.workers.dev")
    ap.add_argument("--web", default=None, help="网页模式：控制页地址，如 https://map.com")
    ap.add_argument("--save-u", default=None, help="一键形态：GET <base>/geo-settings/save?u=<链接>，如 https://savues.com")
    ap.add_argument("--g", default=None, help="g 模式：三动作一键入口，如 https://savues.com")
    ap.add_argument("--local", default=None, help="local 模式：保留参考件结构，两处 URL 指向本地插件，如 https://map.com")
    ap.add_argument("--auto", action="store_true", help="网页模式下加 &auto=1，解析完直接写入")
    ap.add_argument("--acc", type=int, default=None, help="定位精度，米（插件夹到 5–200）")
    ap.add_argument("--safe", action="store_true", help="只做纯字符串替换，不动结构")
    ap.add_argument("--no-status", action="store_true", help="不加写入结果自检")
    ap.add_argument("-o", "--out", default=None)
    a = ap.parse_args()

    with open(SRC, "rb") as f:
        doc = plistlib.load(f)
    doc = copy.deepcopy(doc)
    actions = doc["WFWorkflowActions"]
    report = []

    def out_name_of(act):
        return (act.get("WFWorkflowActionParameters") or {}).get("CustomOutputName")

    by_out = {out_name_of(act): act for act in actions if out_name_of(act)}

    if a.web:
        doc, report = build_web_mode(doc, actions, a)
        write_out(doc, doc["WFWorkflowActions"], report, a)
        return
    if a.save_u:
        doc, report = build_save_u_mode(doc, actions, a)
        write_out(doc, doc["WFWorkflowActions"], report, a)
        return
    if a.g:
        doc, report = build_g_mode(doc, actions, a)
        write_out(doc, doc["WFWorkflowActions"], report, a)
        return
    if a.local:
        report = apply_local(doc, actions, a)
        write_out(doc, actions, report, a)
        return

    # ── ① 虚拟端点改名 ──────────────────────────────────────────────────
    save_act = next((x for x in actions
                     if isinstance(x.get("WFWorkflowActionParameters", {}).get("WFURL", {}).get("Value", {}).get("string"), str)
                     and UPSTREAM_SAVE_PATH in x["WFWorkflowActionParameters"]["WFURL"]["Value"]["string"]), None)
    if save_act is None:
        raise SystemExit("!! 找不到写入端点动作，原件格式可能变了")

    acc_val = a.acc if a.acc is not None else 25
    sv = save_act["WFWorkflowActionParameters"]["WFURL"]["Value"]
    refs = {r.get("OutputName"): r for r in sv["attachmentsByRange"].values()}
    for need in ("Latitude", "Longitude"):
        if need not in refs:
            raise SystemExit(f"!! 写入端点里找不到 {need} 引用")
    tok, _ = build_token(
        "https://gs-loc.apple.com/geo-settings/save?lat={{Latitude}}&lon={{Longitude}}&acc="
        + str(acc_val),
        {"Latitude": refs["Latitude"], "Longitude": refs["Longitude"]},
    )
    save_act["WFWorkflowActionParameters"]["WFURL"] = tok
    report.append(f"写入端点 → {UPSTREAM_SAVE_PATH} 改为 /geo-settings/save，acc={acc_val}（偏移已重算）")

    # ── ② 解析链接可控 ──────────────────────────────────────────────────
    parse_act = next((x for x in actions
                      if isinstance(x.get("WFWorkflowActionParameters", {}).get("WFURL", {}).get("Value", {}).get("string"), str)
                      and "/api/parse" in x["WFWorkflowActionParameters"]["WFURL"]["Value"]["string"]), None)
    if parse_act is None:
        raise SystemExit("!! 找不到解析动作，原件格式可能变了")
    enc_ref = None
    for ref in parse_act["WFWorkflowActionParameters"]["WFURL"]["Value"]["attachmentsByRange"].values():
        if ref.get("OutputName") == "EncURL":
            enc_ref = ref
    if enc_ref is None:
        raise SystemExit("!! 解析动作里找不到 EncURL 附件引用")

    worker = (a.worker or "").strip().rstrip("/")
    if worker.startswith("http://") or worker.startswith("https://"):
        worker = re.sub(r"^https?://", "", worker)

    if a.safe or not worker:
        # 保守模式：只把域名换成新的，结构不动
        val = parse_act["WFWorkflowActionParameters"]["WFURL"]["Value"]
        if worker:
            val["string"] = val["string"].replace(UPSTREAM_PARSE_HOST, worker)
            shift = len(worker) - len(UPSTREAM_PARSE_HOST)
            for k in list(val["attachmentsByRange"]):
                st, ln = int(k[1:k.index(",")]), int(k[k.index(",") + 2:-1])
                val["attachmentsByRange"][f"{{{st + shift}, {ln}}}"] = val["attachmentsByRange"].pop(k)
            report.append(f"解析域名 → {UPSTREAM_PARSE_HOST} 改为 {worker}（保守模式，结构未动）")
        else:
            report.append("解析域名 → 未指定，沿用原地址")
    else:
        # 完整模式：把解析服务抽成第一个「文本」动作，用户可自行编辑
        default_text = worker
        text_act = {
            "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
            "WFWorkflowActionParameters": {
                "CustomOutputName": "ParseWorker",
                "UUID": UUID_PARSE_WORKER,
                "WFTextActionText": {
                    "Value": {"string": default_text, "attachmentsByRange": {}},
                    "WFSerializationType": "WFTextTokenString",
                },
            },
        }
        # 放在最前面一个注释之后，让用户在快捷指令编辑器里一眼看到、方便改
        actions.insert(1, text_act)
        tok, order = build_token(
            "{{ParseWorker}}/api/parse?format=json&u={{EncURL}}",
            {"ParseWorker": attachment_ref(UUID_PARSE_WORKER, "ParseWorker"),
             "EncURL": attachment_ref(enc_ref["OutputUUID"], "EncURL")},
        )
        parse_act["WFWorkflowActionParameters"]["WFURL"] = tok
        report.append(f"解析服务抽成独立文本动作 ParseWorker（可自行编辑）：{default_text}")
        report.append(f"解析 URL 改为 {{{{{order[0]}}}}}/api/parse?format=json&u={{{{{order[1]}}}}}")

    # ── ③ 写入结果自检 ──────────────────────────────────────────────────
    if not (a.safe or a.no_status):
        notif_idx = next(i for i, x in enumerate(actions)
                         if x.get("WFWorkflowActionIdentifier") == "is.workflow.actions.notification")
        status_act = {
            "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
            "WFWorkflowActionParameters": {
                "CustomOutputName": "GeoStatus",
                "WFURL": {"Value": {"string": "https://gs-loc.apple.com/geo-settings/status",
                                    "attachmentsByRange": {}},
                          "WFSerializationType": "WFTextTokenString"},
                "WFHTTPMethod": "GET",
            },
        }
        mode_act = {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getvalueforkey",
            "WFWorkflowActionParameters": {
                "WFInput": {"Value": attachment_ref(UUID_STATUS_FETCH, "GeoStatus"),
                            "WFSerializationType": "WFTextTokenAttachment"},
                "CustomOutputName": "GeoMode",
                "WFDictionaryKey": "mode",
            },
        }
        status_act["WFWorkflowActionParameters"]["WFUUID"] = UUID_STATUS_FETCH
        mode_act["WFWorkflowActionParameters"]["UUID"] = UUID_MODE_KEY
        actions.insert(notif_idx, status_act)
        actions.insert(notif_idx + 1, mode_act)

        notif = actions[notif_idx + 2]
        np = notif["WFWorkflowActionParameters"]
        tok, _ = build_token(
            "地点：{{PlaceName}}\n纬度：{{Latitude}}　经度：{{Longitude}}\n"
            "状态：{{GeoMode}}\n"
            "· passthrough 表示没写进去，检查插件是否启用、MITM 是否生效\n"
            "· 写完请重开目标 App，或去 设置→隐私→定位服务 把开关拨一下",
            {
                "PlaceName": attachment_ref(by_out["PlaceName"]["WFWorkflowActionParameters"]["UUID"], "PlaceName"),
                "Latitude": attachment_ref(by_out["Latitude"]["WFWorkflowActionParameters"]["UUID"], "Latitude"),
                "Longitude": attachment_ref(by_out["Longitude"]["WFWorkflowActionParameters"]["UUID"], "Longitude"),
                "GeoMode": attachment_ref(UUID_MODE_KEY, "GeoMode"),
            },
        )
        np["WFNotificationActionTitle"] = "GeoFix"
        np["WFNotificationActionBody"] = tok
        report.append("通知改为先取 status 再报，会显示 mode（active 才是真写进去了）")
        report.append("通知标题与文案去上游化")

    # ── ④ 文案去上游化（注释里也会出现） ───────────────────────────────
    for act in actions:
        for k, v in (act.get("WFWorkflowActionParameters") or {}).items():
            if isinstance(v, str) and "wloc" in v.lower():
                act["WFWorkflowActionParameters"][k] = re.sub(r"(?i)wloc", "GeoFix", v)
                report.append(f"文案改名 → {k}")

    write_out(doc, actions, report, a)
    dump = {
        "name": "GeoFix设置位置",
        "clientVersion": doc.get("WFWorkflowClientVersion"),
        "types": doc.get("WFWorkflowTypes"),
        "inputContentTypes": doc.get("WFWorkflowInputContentItemClasses"),
        "actions": [
            {"index": i, "id": act.get("WFWorkflowActionIdentifier"),
             "output": out_name_of(act),
             "params": {k: v for k, v in (act.get("WFWorkflowActionParameters") or {}).items()
                        if k not in ("UUID", "WFUUID")}}
            for i, act in enumerate(actions)
        ],
    }
    jp = HERE / "shortcut-source.json"
    jp.write_text(json.dumps(dump, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✔ 结构化拆解 {jp.name}")


if __name__ == "__main__":
    main()
