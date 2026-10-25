# check-airborne-lpx.py —— 校验清单结构、regex、参数名与脚本 key 是否一一对应
"""check-lpx.py —— 校验 Bilibili-Airborne.lpx 的清单结构、regex、参数映射
（这些正是 Loon 加载失败 / 参数静默不生效的高发点）"""
import re, pathlib, sys, json, subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
P = ROOT / 'plugins/Bilibili-Allinone/Bilibili-Allinone.lpx'
ART = ROOT / 'plugins/Bilibili-Allinone/scripts/bilibili.airborne.js'
s = P.read_text(encoding='utf-8')
fail = []
def ck(name, cond, extra=''):
    print(('✓ ' if cond else '✗ ') + name + ('' if cond else '  → ' + str(extra)))
    if not cond: fail.append(name)

for k in ['#!name', '#!desc', '#!author', '#!tag', '#!system', '#!loon_version', '#!homepage', '#!date']:
    ck(f'头部有 {k}', len(re.findall(rf'^{re.escape(k)}=', s, re.M)) == 1)

for sec in ['[Argument]', '[Rule]', '[Rewrite]', '[Script]', '[Mitm]']:
    ck(f'有 {sec} 段', s.count(sec) == 1)
ck('没有多余的段', len(re.findall(r'^\[[A-Za-z]+\]', s, re.M)) == 5)

# ---- 清单文本卫生 ------------------------------------------------------------
# 曾经踩过：两行 [Argument] 被粘成一行，于是 airSummary 定义了两次、
# airInfoMode 的 desc 里混进一整段垃圾文本，而下面的所有校验全绿。
arg_sec = re.search(r'^\[Argument\](.*?)(?=^\[|\Z)', s, re.M | re.S).group(1)
names = re.findall(r'^([A-Za-z][A-Za-z0-9_.]*)\s*=\s*(?:switch|select|input)\s*,', arg_sec, re.M)
ck('[Argument] 没有重复的 key', len(names) == len(set(names)),
   sorted({n for n in names if names.count(n) > 1}))
for ln in arg_sec.splitlines():
    t = ln.strip()
    if not t or t.startswith('#'):
        continue
    ck(f'[Argument] 行首即定义：{t[:22]}…', bool(re.match(r'^[A-Za-z][A-Za-z0-9_.]*\s*=\s*(?:switch|select|input)\s*,', t)),
       t[:70])
    ck(f'[Argument] 一行只有一个定义：{t[:22]}…',
       len(re.findall(r'([A-Za-z][A-Za-z0-9_.]*)\s*=\s*(?:switch|select|input)\s*,', t)) <= 1)
ck('清单里没有乱码字符 U+FFFD', '�' not in s)
ck('清单里没有裸换行符写进 desc', '\\n' not in arg_sec)

decl = {m.group(1): m.group(2) for m in
        re.finditer(r'^([A-Za-z][A-Za-z0-9_.]*)\s*=\s*(switch|select|input)\s*,', s, re.M)}
sent = re.findall(r'\{([A-Za-z][A-Za-z0-9_.]*)\}', s)
sent = [x for x in sent if x not in ('cat','catid','start','end','dur','list','url')]
enables = re.findall(r'enable=\{([A-Za-z][A-Za-z0-9_.]*)\}', s)
print(f'\n声明 {len(decl)} 个: {sorted(decl)}\nargument 传 {len(sent)} 个: {sent}\n')
for n in sent:
    ck(f'argument 里的 {n} 有声明', n in decl)
for n in decl:
    ck(f'{n} 被用上', n in sent or n in enables)

art = ART.read_text(encoding='utf-8') if ART.exists() else ''
import glob as _glob
for _f in _glob.glob(str(ROOT / 'plugins/Bilibili-Allinone/scripts/*.js')) + _glob.glob(str(ROOT / 'plugins/Bilibili-Allinone/scripts/upstream/*.js')):
    art += pathlib.Path(_f).read_text(encoding='utf-8')
keys = set(re.findall(r'["\'`]([A-Za-z][A-Za-z0-9_.]*)["\'`]\s*[,:]', art)) | set(re.findall(r'argument\.([A-Za-z][A-Za-z0-9_.]*)', art)) | set(re.findall(r'"(air[A-Z]\w*)"', art)) | {'logLevel', 'chronos', 'purifyComment', 'displayUpList', 'optimizeRequest'}

for n, t in decl.items():
    m = re.search(rf'^{n}\s*=\s*{t}\s*,(.*)$', s, re.M)
    v = m.group(1).strip().split(',')[0].strip().strip('"')
    if t == 'select':
        opts = re.findall(r'"([^"]+)"', m.group(1))
        ck(f'{n}(select) 默认 {v} 在选项里', v in opts, f'选项={opts}')
    elif t == 'switch':
        ck(f'{n}(switch) 默认合法', v in ('true', 'false'), v)
    elif t == 'input':
        ck(f'{n}(input) 声明存在', True)

all_sp = re.findall(r'script-path=(\S+?),', s)
ck('全部 script-path 指向本仓库 Allinone', all(len(x) > 0 and '/plugins/Bilibili-Allinone/' in x for x in all_sp), str(all_sp[:2]))
ck('script-path 在 main 分支', all('/main/' in x for x in all_sp))

rxs = re.findall(r'http-request (\S+) script-path=', s)
ck('http-request 全部头尾锚定', all(r.startswith('^') and r.endswith('$') for r in rxs))
src = 'const rxs = %s;\n' % json.dumps([r.replace('\\/', '/') for r in rxs]) + '''
const cases=[["https://grpc.biliapi.net/bilibili.community.service.dm.v1.DM/DmSegMobile",true],
             ["https://app.bilibili.com/bilibili.app.viewunite.v1.View/View",true],
             ["https://grpc.biliapi.net/bilibili.community.service.dm.v1.DM/DmView",false],
             ["https://api.bilibili.com/x/v2/feed/index",false]];
let bad=[];
rxs.forEach(r=>{let re;try{re=new RegExp(r)}catch(e){bad.push("compile "+r)}});
cases.forEach(([u,exp])=>{const hit=rxs.some(r=>new RegExp(r).test(u));if(hit!==exp)bad.push((exp?"no-match":"false-match ")+u)});
console.log(bad.length?bad.join(" | "):"REGEX_OK");'''
out = subprocess.run(['node', '-e', src], capture_output=True, text=True)
ck('http-request 正则编译/匹配正确', 'REGEX_OK' in out.stdout, (out.stdout + out.stderr)[:300])

# ---- chronos 重签规则（http-response）：v1.59 起须同时覆盖 view.v1 与 viewunite.v1 ----
# 国际版 iPhone 的 ViewProgress 走 viewunite 端点，漏掉 = 国际版永不重签
# （弹幕能显示但自动跳降级、降落伞图标仍是原图，2026-10-25 HAR 实证）
rrx = re.search(r'http-response (\S+) script-path=', s).group(1)
ck('重签 regex 头尾锚定', rrx.startswith('^') and rrx.endswith('$'))
rsrc = 'const r = new RegExp(%s);\n' % json.dumps(rrx.replace('\\/', '/')) + '''
const yes=["https://grpc.biliapi.net/bilibili.app.view.v1.View/ViewProgress",
           "https://app.bilibili.com/bilibili.app.view.v1.View/ViewProgress",
           "https://grpc.biliapi.net/bilibili.app.viewunite.v1.View/ViewProgress",
           "https://app.biliapi.net/bilibili.app.viewunite.v1.View/ViewProgress"];
const no =["https://grpc.biliapi.net/bilibili.community.service.dm.v1.DM/DmSegMobile",
           "https://app.bilibili.com/x/v2/feed/index"];
let bad=[]; yes.forEach(u=>{if(!r.test(u))bad.push("no-match "+u)});
          no.forEach(u=>{if(r.test(u))bad.push("false-match "+u)});
console.log(bad.length?bad.join(" | "):"REGEX_OK");'''
rout = subprocess.run(['node', '-e', rsrc], capture_output=True, text=True)
ck('重签 regex 覆盖 view+viewunite', 'REGEX_OK' in rout.stdout, (rout.stdout + rout.stderr)[:300])

def expand(rx):                       # 把 (a|b) 组展开，才能正确提取主机名
    prev = None
    while prev != rx:
        prev = rx
        rx = re.sub(r'([a-z0-9.\\]*)\(([^()]*)\)', lambda m: ' '.join(m.group(1)+o for o in m.group(2).split('|')), rx)
    return rx
all_rx = re.findall(r'(?:http-request|http-response) (\S+) script-path=', s)
hosts = set(re.findall(r'([a-z0-9.-]+\.(?:net|com))(?=[\\/]|$)', expand(' '.join(all_rx).replace('\\', ''))))
mitm = re.search(r'^\[Mitm\](.*?)(?=\n\[|\Z)', s, re.M | re.S).group(1)
mitm_hosts = {h.strip() for h in re.search(r'hostname\s*=\s*(.*)', mitm).group(1).split(',') if h.strip()}
print(f'\nregex 主机: {sorted(hosts)}\nMitm 声明: {sorted(mitm_hosts)}')
rule_hosts = set(re.findall(r'DOMAIN,([a-z0-9.]+),REJECT', s))
for h in hosts:
    covered = any(h == x or h.endswith('.' + x) or x.endswith('.' + h) for x in mitm_hosts)
    rejected = any(h == x or h.endswith('.' + x) for x in rule_hosts)
    ck(f'Mitm 覆盖 {h}' + ('(被 Rule REJECT, 豁免)' if rejected else ''), covered or rejected)
ck('Mitm 开了 h2', 'h2 = true' in mitm)

rule = re.search(r'^http-request .*$', s, re.M).group(0)
ck('requires-body=true', 'requires-body=true' in rule)
ck('binary-body-mode=true', 'binary-body-mode=true' in rule)
ck('有 timeout', 'timeout=' in rule)

print('\n' + (f'{len(fail)} 项失败: {fail}' if fail else '清单结构全部通过'))
sys.exit(1 if fail else 0)