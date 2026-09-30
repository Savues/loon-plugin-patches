import os
import pathlib
import re
import subprocess
import sys
import tempfile

# 造一个最小假上游，覆盖 MITM 多行结构、含逗号空洞、参数引用等真实形态
MITM = "hostname = aaa.com, rr*.googlevideo.com, bbb.com, youtubei.googleapis.com, ccc.com\nhostname = manga.bilibili.com, ddd.com, ee*.hdslb.com, *-spclient.spotify.com, api.pinduoduo.com\nhostname = video-dsp.pddpic.com, t-dsp.pinduoduo.com, mobile.yangkeduo.com, fff.com\n"
FAKE = f"""#!name=测试合集
#!desc=用于测试补丁器的小样本
#!date=2026-09-29 00:00:00

[Argument]
keep_enable = switch,true,false,tag=保留
youtube_enable = switch,true,false,tag=YouTube-脚本开关
bilimanhua_enable = switch,true,false,tag=B站漫画
sponsorBlock = switch,true,false,tag=空降助手
logLevel = select,a,b,tag=日志等级
flightradar24_enable = switch,true,false,tag=上游未引用
tab = switch, true, tag=Spotify-移除底栏创建按钮
useractivity = switch, true, tag=Spotify-启用Apple设备接力

[Rule]
DOMAIN, keep.example.com, REJECT
DOMAIN, ads.youtube.com, REJECT
DOMAIN-SUFFIX, api.bilibili.com, REJECT
DOMAIN-SUFFIX, api.pinduoduo.com, REJECT

[Rewrite]
^https?://keep\\.example\\.com/ad reject
^https:\\/\\/rr[\\w-]+\\.googlevideo\\.com\\/initplayback\\? reject-dict
^https?://api\\.bilibili\\.com/x reject
^https?://i\\d\\.hdslb\\.com\\/fawkes reject-dict
^https:\\/\\/(?:\\w+-spclient|spclient\\.wg)\\.spotify\\.com(?::443)?\\/pendragon\\/ reject-dict
^https:\\/\\/gae2-spclient\\.spotify\\.com:443\\/ad reject
^https?:\\/\\/api\\.(pinduoduo|yangkeduo)\\.com\\/api\\/cappuccino\\/splash reject
^https:\\/\\/api\\.pinduoduo\\.com\\/api\\/aquarius\\/hungary\\/global\\/homepage\\? reject-dict
^https:\\/\\/video-dsp\\.pddpic\\.com\\/market-dsp-video\\/ reject

[Script]
http-response ^https://keep\\.example\\.com\\/v1\\/api script-path=https://x/keep.js, requires-body=true, enable={{keep_enable}}
http-response ^https:\\/\\/youtubei\\.googleapis\\.com\\/youtubei\\/v1\\/player script-path=https://x/yt.js, requires-body=true, enable={{youtube_enable}}
http-response ^https:\\/\\/api\\.bilibili\\.com\\/x\\/msg script-path=https://x/bili.js, requires-body=true, enable={{bilimanhua_enable}}
http-response ^https:\\/\\/(?:\\w+-spclient|spclient\\.wg)\\.spotify\\.com(?::443)?\\/(?:bootstrap|user-customization-service) script-path=https://x/sp.js, requires-body=true, argument=[{{tab}},{{useractivity}}]

[MITM]
{MITM}"""

ok = True
n = 0
def check(cond, msg):
    global ok, n
    n += 1
    print(('  ✓ ' if cond else '  ✗ ') + msg)
    if not cond: ok = False

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
patcher = os.path.join(root, 'patches', 'patch-blockads.py')
verifier = os.path.join(root, 'patches', 'verify-artifact.py')
tmp = tempfile.mkdtemp(prefix='patchtest-')
src, out = os.path.join(tmp, 'fixture.plugin'), os.path.join(tmp, 'out.plugin')
pathlib.Path(src).write_text(FAKE, encoding='utf-8')

r = subprocess.run([sys.executable, patcher, src, '-o', out], capture_output=True, text=True)
check(r.returncode == 0, '补丁器退出码 0')
if r.returncode != 0:
    print(r.stdout, r.stderr); sys.exit(1)
s = pathlib.Path(out).read_text(encoding='utf-8')

print('B 站 / YouTube / Spotify / 拼多多 规则都被注释')
check('# [bilibili-removed] DOMAIN-SUFFIX, api.bilibili.com, REJECT' in s, 'B 站 [Rule] 已注释')
check('# [bilibili-removed] http-response ^https:\\/\\/api\\.bilibili\\.com' in s, 'B 站 [Script] 已注释')
check('# [bilibili-removed] ^https?://i\\d\\.hdslb\\.com' in s, 'B 站漫画（只有 hdslb，无 bilibili）已注释')
check('# [youtube-removed] DOMAIN, ads.youtube.com, REJECT' in s, 'YouTube [Rule] 已注释')
check('# [youtube-removed] ^https:\\/\\/rr[\\w-]+\\.googlevideo' in s, 'YouTube [Rewrite] 已注释')
check('# [youtube-removed] http-response ^https:\\/\\/youtubei\\.googleapis' in s, 'YouTube [Script] 已注释')
check('# [spotify-removed] ^https:\\/\\/(?:\\w+-spclient|spclient\\.wg)\\.spotify\\.com(?::443)?\\/pendragon\\/' in s,
      'Spotify [Rewrite] pendragon 已注释')
check('# [spotify-removed] ^https:\\/\\/gae2-spclient\\.spotify\\.com:443\\/ad' in s,
      'Spotify [Rewrite] gae2 老端点已注释')
check('# [spotify-removed] http-response ^https:\\/\\/(?:\\w+-spclient|spclient\\.wg)' in s,
      'Spotify [Script] bootstrap 已注释')

# 拼多多：合集那两条是「抢在用户插件之前、无法用开关关掉」的无条件 [Rewrite]，
# 退场它们是本次改动的全部意义所在，所以单列一组断言。
check('# [pinduoduo-removed] DOMAIN-SUFFIX, api.pinduoduo.com, REJECT' in s, '拼多多 [Rule] 已注释')
check('# [pinduoduo-removed] ^https?:\\/\\/api\\.(pinduoduo|yangkeduo)\\.com\\/api\\/cappuccino\\/splash' in s,
      '拼多多 [Rewrite] 开屏 splash 已注释（这条让 PinDuoDuo 的 stub 脚本没机会跑）')
check('# [pinduoduo-removed] ^https:\\/\\/api\\.pinduoduo\\.com\\/api\\/aquarius\\/hungary\\/global\\/homepage\\?' in s,
      '拼多多 [Rewrite] 会场首页 reject-dict 已注释（同样架空 api_stub 开关）')
check('# [pinduoduo-removed] ^https:\\/\\/video-dsp\\.pddpic\\.com' in s,
      '拼多多 [Rewrite] pddpic CDN 已注释（只有拼多多用这个 CDN）')
# 反向断言：不能只盯着主域名。t-dsp / images.pinduoduo 里没有 "api."，
# yangkeduo（多多严选）在 api.pinduoduo 那条正则里也根本不出现 ——
# 三者任一漏网，MITM 域名就会留在解密列表里白付 TLS 握手成本。
_live_sec, _live = None, []
for _ln in s.splitlines():
    _t = _ln.strip()
    _m = re.match(r'^\[([A-Za-z ]+)\]', _t)
    if _m:
        _live_sec = _m.group(1).upper()
    if _live_sec in ('REWRITE', 'SCRIPT', 'RULE') and _t and not _t.startswith('#'):
        _live.append(_t.replace('\\/', '/').replace('\\.', '.'))
check(not [l for l in _live if re.search(r'pinduoduo|yangkeduo|pddpic', l)],
      'Rewrite/Script/Rule 三段里没有任何存活的拼多多规则')

print('不相关的规则逐字节不动')
for keep in ('DOMAIN, keep.example.com, REJECT',
             '^https?://keep\\.example\\.com/ad reject',
             'http-response ^https://keep\\.example\\.com\\/v1\\/api'):
    check(keep in s and '# [bilibili-removed] ' + keep not in s and '# [youtube-removed] ' + keep not in s,
          f'保留: {keep[:52]}')

print('MITM 段')
check('\n[MITM]\n' in s, '[MITM] 段标题独占一行（未被粘到 hostname 上）')
mitm = s.split('\n[MITM]\n', 1)[1]
for gone in ('rr*.googlevideo.com', 'youtubei.googleapis.com', 'manga.bilibili.com',
             'ee*.hdslb.com', '*-spclient.spotify.com',
             'api.pinduoduo.com', 'video-dsp.pddpic.com', 't-dsp.pinduoduo.com',
             'mobile.yangkeduo.com'):
    check(gone not in mitm, f'{gone} 已移除')
for kept in ('aaa.com', 'bbb.com', 'ccc.com', 'ddd.com', 'fff.com'):
    check(kept in mitm, f'{kept} 保留')
check(', ,' not in mitm and ',,' not in mitm, '没有留下 ", ," 空洞')
check(mitm.count('\n') >= 2, 'MITM 的多行结构没被并成一行')

print('死参数')
arg = s.split('[Argument]', 1)[1].split('\n[', 1)[0]
for dead in ('youtube_enable', 'bilimanhua_enable', 'sponsorBlock', 'logLevel',
             'flightradar24_enable', 'tab', 'useractivity'):
    check(dead not in arg, f'{dead} 已删除')
check('keep_enable' in arg, 'keep_enable 保留')

print('校验器')
r = subprocess.run([sys.executable, verifier, '--min-lines=10', out],
                   capture_output=True, text=True)
check(r.returncode == 0, 'verify-artifact.py 通过（放宽行数下限以适配小样本）')
if r.returncode != 0:
    print(r.stdout)

print('校验器能拦住未退场的产物')
r = subprocess.run([sys.executable, verifier, src], capture_output=True, text=True)
check(r.returncode == 1, '未打补丁的样本被拒')
check('残留' in r.stdout, '报出的是「残留」而不是别的错')
# 这一条才是「上游拉取时拼多多规则不会再回来」的守卫：CI 每 6 小时重施补丁，
# 只要 verify-artifact.py 认得拼多多，漏一条就会红着推不出去。
check('拼多多' in r.stdout, '校验器认得拼多多（会红着挡住漏网的规则）')
check('pinduoduo.com' in r.stdout, '报出的残留里含具体域名')

print('校验器能拦住错误页')
errpage = os.path.join(tmp, 'error.html')
pathlib.Path(errpage).write_text('<!DOCTYPE html>\n<html><body>' + 'Not Found. ' * 200 + '</body></html>')
r = subprocess.run([sys.executable, verifier, errpage], capture_output=True, text=True)
check(r.returncode == 1, '404 HTML 错误页被拒')
check('#!name=' in r.stdout, '报出「首行不是 #!name=」')

print('幂等')
for i in range(2):
    r = subprocess.run([sys.executable, patcher, out, '-o', out + '.replay'],
                       capture_output=True, text=True)
    if r.returncode != 0:
        check(False, '重放失败'); break
    same = pathlib.Path(out).read_bytes() == pathlib.Path(out + '.replay').read_bytes()
    check(same, f'第 {i + 1} 次重放逐字节一致')
    if not same: break

print()
print(f'{"通过" if ok else "失败"} {n} 条断言')
sys.exit(0 if ok else 1)
