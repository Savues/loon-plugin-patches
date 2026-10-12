# check-airborne-lpx.py —— 校验清单结构、regex、参数名与脚本 key 是否一一对应
"""check-lpx.py —— 校验 Bilibili-Airborne.lpx 的清单结构、regex、参数映射
（这些正是 Loon 加载失败 / 参数静默不生效的高发点）"""
import re, pathlib, sys, json, subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
P = ROOT / 'plugins/Bilibili-Airborne/Bilibili-Airborne.lpx'
ART = ROOT / 'plugins/Bilibili-Airborne/bilibili.airborne.js'
s = P.read_text(encoding='utf-8')
fail = []
def ck(name, cond, extra=''):
    print(('✓ ' if cond else '✗ ') + name + ('' if cond else '  → ' + str(extra)))
    if not cond: fail.append(name)

for k in ['#!name', '#!desc', '#!author', '#!tag', '#!system', '#!loon_version', '#!homepage', '#!date']:
    ck(f'头部有 {k}', len(re.findall(rf'^{re.escape(k)}=', s, re.M)) == 1)

for sec in ['[Argument]', '[Script]', '[Mitm]']:
    ck(f'有 {sec} 段', s.count(sec) == 1)
ck('没有多余的段', len(re.findall(r'^\[[A-Za-z]+\]', s, re.M)) == 3)

decl = {m.group(1): m.group(2) for m in
        re.finditer(r'^([A-Za-z][A-Za-z0-9]*)\s*=\s*(switch|select|input)\s*,', s, re.M)}
argline = re.search(r'argument=\[([^\]]*)\]', s).group(1)
sent = re.findall(r'\{([A-Za-z][A-Za-z0-9]*)\}', argline)
enable = re.search(r'enable=\{([A-Za-z][A-Za-z0-9]*)\}', s)
print(f'\n声明 {len(decl)} 个: {sorted(decl)}\nargument 传 {len(sent)} 个: {sent}\n')
for n in sent:
    ck(f'argument 里的 {n} 有声明', n in decl)
for n in decl:
    ck(f'{n} 被用上', n in sent or (enable and n == enable.group(1)))

keys = set(re.findall(r'"(air[A-Z]\w*)"', ART.read_text(encoding='utf-8'))) | {'logLevel'}
for n in sent:
    ck(f'{n} 在脚本里确实被读取', n in keys, f'脚本只读 {sorted(keys)}')

for n, t in decl.items():
    m = re.search(rf'^{n}\s*=\s*{t}\s*,(.*)$', s, re.M)
    v = m.group(1).strip().split(',')[0].strip().strip('"')
    if t == 'select':
        opts = re.findall(r'"([^"]+)"', m.group(1))
        ck(f'{n}(select) 默认 {v} 在选项里', v in opts, f'选项={opts}')
    elif t == 'switch':
        ck(f'{n}(switch) 默认合法', v in ('true', 'false'), v)
    elif t == 'input':
        ck(f'{n}(input) 有默认值', v != '', v)

sp = re.search(r'script-path=(\S+?),', s).group(1)
ck('script-path 指向本仓库产物', sp.endswith('/plugins/Bilibili-Airborne/bilibili.airborne.js'), sp)
ck('script-path 在 main 分支', '/main/' in sp)

rx = re.search(r'http-request (\S+) script-path=', s).group(1)
ck('regex 头尾锚定', rx.startswith('^') and rx.endswith('$'))
src = 'const r = new RegExp(%s);\n' % json.dumps(rx.replace('\\/', '/')) + '''
const yes=["https://grpc.biliapi.net/bilibili.community.service.dm.v1.DM/DmSegMobile",
           "https://app.bilibili.com/bilibili.community.service.dm.v1.DM/DmSegMobile",
           "https://app.biliapi.net/bilibili.community.service.dm.v1.DM/DmSegMobile"];
const no =["https://grpc.biliapi.net/bilibili.community.service.dm.v1.DM/DmView",
           "https://api.bilibili.com/x/v2/feed/index",
           "https://app.bilibili.com/bilibili.app.viewunite.v1.View/View"];
let bad=[]; yes.forEach(u=>{if(!r.test(u))bad.push("no-match "+u)});
          no.forEach(u=>{if(r.test(u))bad.push("false-match "+u)});
console.log(bad.length?bad.join(" | "):"REGEX_OK");'''
out = subprocess.run(['node', '-e', src], capture_output=True, text=True)
ck('regex 编译通过且匹配正确', 'REGEX_OK' in out.stdout, (out.stdout + out.stderr)[:300])

def expand(rx):                       # 把 (a|b) 组展开，才能正确提取主机名
    prev = None
    while prev != rx:
        prev = rx
        rx = re.sub(r'([a-z0-9.\\]*)\(([^()]*)\)', lambda m: ' '.join(m.group(1)+o for o in m.group(2).split('|')), rx)
    return rx
hosts = set(re.findall(r'[a-z0-9]+\.(?:net|com)', expand(rx.replace('\\', ''))))
mitm = re.search(r'^\[Mitm\](.*?)(?=\n\[|\Z)', s, re.M | re.S).group(1)
mitm_hosts = {h.strip() for h in re.search(r'hostname\s*=\s*(.*)', mitm).group(1).split(',') if h.strip()}
print(f'\nregex 主机: {sorted(hosts)}\nMitm 声明: {sorted(mitm_hosts)}')
for h in hosts:
    ck(f'Mitm 覆盖 {h}', any(h == x or h.endswith('.' + x) or x.endswith('.' + h) for x in mitm_hosts))
ck('Mitm 开了 h2', 'h2 = true' in mitm)

rule = re.search(r'^http-request .*$', s, re.M).group(0)
ck('requires-body=true', 'requires-body=true' in rule)
ck('binary-body-mode=true', 'binary-body-mode=true' in rule)
ck('有 timeout', 'timeout=' in rule)

print('\n' + (f'{len(fail)} 项失败: {fail}' if fail else '清单结构全部通过'))
sys.exit(1 if fail else 0)