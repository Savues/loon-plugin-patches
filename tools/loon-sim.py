#!/usr/bin/env python3
"""
Loon 插件模拟器 · loon-sim.py

用途：拿真实 HAR + 插件 .lpx，逐条回放，报告「每条请求会被哪条规则命中 / 输出什么」。
     无需在设备上更新插件即可验证规则与脚本逻辑。

用法：
    python3 loon-sim.py <plugin.lpx> <capture.har> [--bundle <bundle.js>] [--verbose]

原理：
  · 解析 lpx 的 [Rule] / [Script] / [Rewrite] / [Argument] 段
  · 对 HAR 里每条请求，按 Loon 语义判定：
      [Rule]    域名级匹配（DOMAIN / DOMAIN-SUFFIX / IP-CIDR）
      [Rewrite] request 阶段匹配（取第一条完整命中）
      [Script]  response 阶段匹配（取第一条命中；若同 URL 已有终止类 Rewrite → 不执行）
  · 命中 Script 时，用 Node 执行 bundle.js（mock $request/$response/$done/$argument）
    得到实际输出与体积，判断"是否真的改了"

限制（重要）：
  · 只模拟【规则匹配 + 脚本逻辑】。不模拟 Loon 的 TUN/MITM 引擎本身。
  · 无法验证：真实网络可达性、证书、App 端解析行为。
"""
import re, os, sys, json, subprocess, tempfile, argparse

# ---------- lpx 解析 ----------

def parse_lpx(path):
    txt = open(path, encoding='utf-8').read()
    out = {'header': {}, 'sections': {}, 'file': path}
    cur = None
    for line in txt.split('\n'):
        s = line.strip()
        if s.startswith('#!'):
            k, _, v = s[2:].partition('=')
            out['header'][k.strip()] = v.strip()
            continue
        if s.startswith('[') and s.endswith(']'):
            cur = s[1:-1].strip().lower()
            out['sections'].setdefault(cur, [])
            continue
        if cur is not None:
            out['sections'][cur].append(line)
    return out

def parse_args(lpx):
    """[Argument] → {name: default_value}（含类型）"""
    args = {}
    for line in lpx['sections'].get('argument', []):
        s = line.strip()
        if not s or s.startswith('#') or '=' not in s: continue
        k, _, v = s.partition('=')
        parts = [p.strip() for p in v.split(',')]
        if not parts: continue
        typ = parts[0]
        default = None
        if typ == 'switch':
            # switch,<default>[,<x>][,tag=][,desc=]
            default = (len(parts) > 1 and parts[1].lower() == 'true')
        elif typ in ('input', 'select'):
            default = parts[1].strip('"') if len(parts) > 1 else ''
            for p in parts:
                if p.startswith('type=') and p.split('=')[1].strip() == 'number':
                    try: default = float(default)
                    except: pass
        args[k.strip()] = {'type': typ, 'default': default}
    return args

# ---------- 规则解析 ----------

def to_re(pat):
    """把 Loon 正则字面量 /RE/i 编译"""
    p = pat.strip()
    flags = re.I
    if p.startswith('/'):
        # 找结尾的 /i
        m = re.match(r'^/(.*)/([a-z]*)$', p, re.S)
        if m:
            body, fl = m.group(1), m.group(2)
            if 'i' not in fl: flags = 0
            p = body
        else:
            p = p.strip('/')
    try:
        return re.compile(p, flags)
    except re.error:
        return None

NEW_SYNTAX = re.compile(r'^(request|response)\s+if\s+(.+?)\s+then\s+(.+)$', re.S | re.I)

def split_top(s, sep):
    """按顶层 sep（不在括号/引号内）切分"""
    out, depth, q, cur = [], 0, None, ''
    i = 0
    while i < len(s):
        c = s[i]
        if q:
            cur += c
            if c == q and s[i-1] != '\\': q = None
        elif c in '"\'':
            q = c; cur += c
        elif c in '([{': depth += 1; cur += c
        elif c in ')]}': depth -= 1; cur += c
        elif depth == 0 and s.startswith(sep, i):
            out.append(cur); cur = ''; i += len(sep); continue
        else:
            cur += c
        i += 1
    out.append(cur)
    return out

def get_url_regex(cond):
    m = re.search(r'\$\{url\}\s*~=\s*(/[^\s]*?/i)', cond)
    if m: return m.group(1)
    m = re.search(r'\$\{url\}\s*~=\s*(/[^\s]*?/)', cond)
    return m.group(1) if m else None

def parse_rules(lpx):
    rules = {'rule': [], 'rewrite': [], 'script': []}

    # [Rule]
    for line in lpx['sections'].get('rule', []):
        s = line.strip()
        if not s or s.startswith('#'): continue
        parts = [p.strip() for p in s.split(',')]
        if len(parts) < 3: continue
        rules['rule'].append({'type': parts[0], 'value': parts[1],
                              'policy': parts[2], 'raw': s})

    # [Rewrite]
    for line in lpx['sections'].get('rewrite', []):
        s = line.strip()
        if not s or s.startswith('#'): continue
        m = NEW_SYNTAX.match(s)
        if m and m.group(1).lower() == 'request':
            rules['rewrite'].append({'cond': m.group(2), 'action': m.group(3),
                                     'url_re': get_url_regex(m.group(2)), 'raw': s})
        elif 'reject' in s and not s.startswith('request'):
            # 旧语法: ^url reject-dict
            mm = re.match(r'^(\S+)\s+(\S+)', s)
            if mm: rules['rewrite'].append({'cond': '', 'action': mm.group(2),
                                            'url_re': mm.group(1), 'raw': s, 'legacy': True})

    # [Script]
    for line in lpx['sections'].get('script', []):
        s = line.strip()
        if not s or s.startswith('#'): continue
        m = NEW_SYNTAX.match(s)
        if not m or m.group(1).lower() != 'response': continue
        cond, action = m.group(2), m.group(3)
        sm = re.search(r'script\("([^"]+)"(?:\s*,\s*(\{[^}]*\}))?\)', action)
        enable = re.search(r'\benable=([^,\s]+)', action)
        requires_body = 'requires_body=true' in action.replace(' ', '')
        rules['script'].append({
            'cond': cond, 'action': action,
            'url_re': get_url_regex(cond),
            'script_path': sm.group(1) if sm else None,
            'arg_keys': re.findall(r'\$\{(\w+)\}', sm.group(2)) if (sm and sm.group(2)) else [],
            'enable_expr': enable.group(1) if enable else None,
            'requires_body': requires_body,
            'raw': s})
    return rules

# ---------- 匹配 ----------

def domain_match(rtype, value, host):
    rtype = rtype.upper()
    value = value.lower()
    host = host.lower()
    if rtype == 'DOMAIN': return host == value
    if rtype == 'DOMAIN-SUFFIX': return host == value or host.endswith('.' + value)
    if rtype == 'DOMAIN-KEYWORD': return value in host
    if rtype == 'DOMAIN-WILDCARD':
        rx = value.replace('.', r'\\.').replace('*', '.*').replace('?', '.')
        return re.fullmatch(rx, host) is not None
    return False

def eval_cond(cond, url, args, host, phase='request'):
    """求值 Rewrite/Script 的 if 条件（只支持本次用到的形式）"""
    if not cond: return True
    # ${url} ~= /RE/i
    for m in re.finditer(r'\$\{url\}\s*~=\s*(/[^\s]*?/i)', cond):
        rx = to_re(m.group(1))
        if not rx or not rx.search(url): return False
    # ${sw} == true / == "x"
    for m in re.finditer(r'\$\{(\w+)\}\s*==\s*(true|false|"[^"]*"|\d+)', cond):
        name, want = m.group(1), m.group(2)
        got = args.get(name, {}).get('default')
        if want == 'true':   ok = (got is True)
        elif want == 'false': ok = (got is False)
        elif want.startswith('"'): ok = (str(got) == want.strip('"'))
        else: ok = (got is not None and float(got) == float(want))
        if not ok: return False
    # ${request.method} == "X"
    for m in re.finditer(r'\$\{request\.method\}\s*==\s*"([^"]*)"', cond):
        if m.group(1).upper() != 'GET':  # HAR 未提供时按 GET 假设
            pass
    return True

# ---------- 脚本执行 ----------

NODE_HARNESS = r'''
const fs = require('fs');
const jsPath = process.argv[2];
const bodyPath = process.argv[3];
const url = process.argv[4];
const argJson = process.argv[5];
const method = process.argv[6] || 'GET';

let code = fs.readFileSync(jsPath, 'utf8');
let body = fs.readFileSync(bodyPath, 'utf8');

const $argument = JSON.parse(argJson);
const $request = { url: url, method: method, headers: {} };
const $response = { status: 200, headers: { 'Content-Type': 'application/json' }, body: body };
let DONE = null;
const $done = (o) => { DONE = (o === undefined) ? {} : o; };
const $notify = () => {};
const $httpClient = { get: () => {}, post: () => {}, put: () => {}, delete: () => {} };
const $persistentStore = { read: () => null, write: () => true };
const $prefs = $persistentStore;
const $task = { fetch: async () => ({}) };
const console = { log: (...a) => {} };

try {
  eval(code);
} catch (e) {
  process.stdout.write(JSON.stringify({ error: String(e) }));
  process.exit(0);
}

const outBody = (DONE && typeof DONE.body === 'string') ? DONE.body : null;
process.stdout.write(JSON.stringify({
  changed: !!outBody && outBody !== body,
  outSize: outBody ? outBody.length : 0,
  inSize: body.length,
  outBody: outBody ? outBody.slice(0, 200) : null
}));
'''

def run_script(js_path, body, url, args_obj, method='GET'):
    if not js_path or not os.path.exists(js_path):
        return {'error': 'script not found: %s' % js_path}
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f:
        f.write(NODE_HARNESS); harness = f.name
    with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, encoding='utf-8') as f:
        f.write(body or ''); bpath = f.name
    try:
        r = subprocess.run(['node', harness, js_path, bpath, url,
                            json.dumps(args_obj), method],
                           capture_output=True, text=True, timeout=30)
        if r.returncode != 0:
            return {'error': (r.stderr or '')[:300]}
        return json.loads(r.stdout or '{}')
    except Exception as e:
        return {'error': str(e)}
    finally:
        os.unlink(harness); os.unlink(bpath)

# ---------- 主流程 ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('lpx'); ap.add_argument('har')
    ap.add_argument('--bundle', default=None)
    ap.add_argument('--verbose', '-v', action='store_true')
    ap.add_argument('--only-hits', action='store_true')
    a = ap.parse_args()

    lpx = parse_lpx(a.lpx)
    args = parse_args(lpx)
    rules = parse_rules(lpx)

    print(f"插件: {lpx['header'].get('name','?')}")
    print(f"  段: " + " ".join(f"{k}={len(v)}行" for k,v in lpx['sections'].items()))
    print(f"  规则: [Rule] {len(rules['rule'])} · [Rewrite] {len(rules['rewrite'])} · [Script] {len(rules['script'])}")
    print(f"  开关: {len(args)} 个（脚本按默认值求值）")
    print()

    har = json.load(open(a.har))
    entries = har['log']['entries']
    print(f"HAR: {len(entries)} 条请求\n")

    from urllib.parse import urlparse
    hits = {'rule': [], 'rewrite': [], 'script': []}
    for e in entries:
        req = e['request']; res = e.get('response', {})
        url = req['url']; host = urlparse(url).netloc.split(':')[0]
        # [Rule]
        for r in rules['rule']:
            if domain_match(r['type'], r['value'], host):
                hits['rule'].append((url, r)); break
        # [Rewrite] 第一条命中
        for r in rules['rewrite']:
            rx = to_re(r['url_re']) if r['url_re'] else None
            if rx and rx.search(url):
                hits['rewrite'].append((url, r)); break
        # [Script] 第一条命中
        for r in rules['script']:
            rx = to_re(r['url_re']) if r['url_re'] else None
            if not rx or not rx.search(url): continue
            if not eval_cond(r['cond'], url, args, host): continue
            hits['script'].append((url, r, res)); break

    def show(title, lst, fmt):
        print(f"===== {title}: {len(lst)} =====")
        for item in lst:
            print("  " + fmt(item))
        print()

    show("[Rule] 命中（域名级 REJECT → 请求会被黑洞）", hits['rule'],
         lambda t: f"{t[1]['policy']:8s} {t[1]['type']},{t[1]['value']:32s} ← {t[0][:70]}")

    show("[Rewrite] 命中（请求阶段，第一条）", hits['rewrite'],
         lambda t: f"{t[1]['action'][:38]:38s} ← {t[0][:70]}")

    # 被 [Rewrite] 终止类动作抢占的 Script（官方: Request 阶段终止 → Script 不执行）
    term_actions = ('reject', 'reject_dict', 'reject_array', 'reject-', 'reject_')
    preempted_urls = set()
    for url, r in hits['rewrite']:
        if any(t in r['action'] for t in term_actions):
            preempted_urls.add(url)

    print(f"===== [Script] 命中（响应阶段）: {len(hits['script'])} =====")
    n_pre = sum(1 for u, r, res in hits['script'] if u in preempted_urls)
    if n_pre:
        print(f"  ⚠️ 其中 {n_pre} 条被同接口的 [Rewrite] 终止类动作抢占 → 实际不会执行（死代码）")
    if a.bundle:
        for url, r, res in hits['script']:
            content = res.get('content', {})
            b64 = content.get('text', '') if content.get('encoding') == 'base64' else ''
            import base64 as _b
            try: body = _b.b64decode(b64).decode('utf-8', 'ignore') if b64 else (content.get('text') or '')
            except: body = ''
            argobj = {k: args.get(k, {}).get('default') for k in r['arg_keys']}
            o = run_script(a.bundle, body, url, argobj, req_method(entries, url))
            pre = '🚫被Rewrite抢占 ' if url in preempted_urls else ''
            if 'error' in o:
                print(f"  ❌ {pre}{url[:66]}")
                print(f"     {o['error'][:150]}")
            else:
                mark = pre + ('✅已改' if o.get('changed') else '➖无改动')
                delta = f"{o.get('inSize')}→{o.get('outSize')}"
                print(f"  {mark} {delta:>14s}  {url[:62]}")
                if a.verbose and o.get('outBody'):
                    print(f"     out: {o['outBody'][:120]}")
    else:
        for url, r, res in hits['script']:
            print(f"  · {url[:70]}")
        print("\n  （加 --bundle <bundle.js> 可实际执行脚本，验证过滤逻辑）")
    print()

    print("===== [Script] 未命中（只列出被规则覆盖的 URL）=====")
    if a.verbose:
        for line in lpx['sections'].get('script', []):
            pass

def req_method(entries, url):
    for e in entries:
        if e['request']['url'] == url:
            return e['request'].get('method', 'GET')
    return 'GET'

if __name__ == '__main__':
    main()
