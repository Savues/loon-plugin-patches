// GeoFix 清单规则测试：每条规则该匹配什么、不该匹配什么
//   node manifest.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const lpx = fs.readFileSync(path.join(HERE, 'GeoFix.lpx'), 'utf8');

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? '✔' : '✘'} ${name}${extra ? '\n      ' + extra : ''}`);
};

// v1.5 事故：段头 [Script] 被冲掉，规则成了漂在文件里的裸行，Loon 全不认，
// 而当时的测试只数「以 http- 开头的行」，照样全绿 —— 盲区正好是 bug 本身。
// 所以这里按段解析：只收 [Script] 段里的规则，段头缺失会直接 0 条。
const sections = {};
let cur = null;
for (const raw of lpx.split('\n')) {
  const line = raw.trim();
  const m = line.match(/^\[([A-Za-z]+)\]$/);
  if (m) { cur = m[1]; sections[cur] = []; continue; }
  if (cur && line && !line.startsWith('#')) sections[cur].push(line);
}
const rules = [];
for (const line of sections.Script || []) {
  if (!line.startsWith('http-')) continue;
  const pattern = line.slice(line.indexOf(' ') + 1, line.indexOf(' script-path='));
  rules.push({
    kind: line.slice(0, line.indexOf(' ')),
    re: new RegExp(pattern),
    pattern,
    script: line.match(/script-path=([^,]+)/)[1].split('/').pop(),
    tag: (line.match(/tag=(.+)$/) || [, ''])[1],
  });
}
t('[Script] 段存在且有 6 条规则', rules.length === 6, String(rules.length));
t('[MitM] 段存在', Array.isArray(sections.MitM) && sections.MitM.some((l) => l.startsWith('hostname=')));
{
  // 段外的 http- 行 = 漂着的死规则，Loon 不认
  const inScript = new Set(sections.Script || []);
  const stray = lpx.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('http-') && !inScript.has(l));
  t('没有漂在 [Script] 段外的规则', stray.length === 0, stray.length + ' 条');
}

const hit = (u) => rules.filter((r) => r.re.test(u)).map((r) => r.tag);

const CASES = [
  ['https://savues.com/', ['GeoFix UI root']],
  ['https://savues.com/?u=abc', ['GeoFix UI root']],
  ['https://savues.com/geo-ui/', ['GeoFix UI']],
  ['https://savues.com/geo-ui/?u=abc', ['GeoFix UI']],
  ['https://savues.com/geo-parse?u=abc', ['GeoFix Parse']],
  ['https://savues.com/geo-settings/save?lat=1&lon=2', ['GeoFix Bridge']],
  ['https://savues.com/geo-settings/status', ['GeoFix Bridge']],
  ['https://savues.com/geo-route/save?payload=x', ['GeoFix Route']],
  ['https://gs-loc.apple.com/geo-ui/', ['GeoFix UI']],
  ['https://gs-loc.apple.com/geo-parse?u=abc', ['GeoFix Parse']],
  ['https://gs-loc.apple.com/geo-settings/clear', ['GeoFix Bridge']],
  ['https://gs-loc-cn.apple.com/geo-settings/status', ['GeoFix Bridge']],
  ['https://gs-loc.apple.com/clls/wloc', ['GeoFix Response']],
  ['https://savues.com/foo', []],
  ['https://savues.com/geo-ui/anything', []],
  ['https://savues.com/geo-parse', []],
  ['https://gs-loc.apple.com/other/path', []],
  ['https://www.apple.com/', []],
  ['https://evil.example.com/geo-settings/save?lat=1', []],
  ['https://savues.com.evil.com/geo-settings/save?lat=1', []],
];

console.log('\n─── 路由 ───');
for (const [u, want] of CASES) {
  const got = hit(u);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? '✔' : '✘'} ${u}\n     期望 ${JSON.stringify(want)}　实际 ${JSON.stringify(got)}`);
}

console.log('\n─── 安全性 ───');
{
  // 模式里主机是转义过的（savues\.com），先把反斜杠去掉再比对
  const unescape = (s) => s.replace(/\\/g, '');
  const stray = rules.filter((r) => !/gs-loc|savues\.com/.test(unescape(r.pattern)));
  t('没有规则脱离限定主机', stray.length === 0, stray.map((r) => r.pattern).join(' | '));
  t('相似恶意主机全部放行', CASES.filter(([u]) => /evil/.test(u)).every(([u]) => hit(u).length === 0));
  const resp = rules.find((r) => r.tag === 'GeoFix Response').pattern;
  t('clls/wloc 规则只认 gs-loc', /gs-loc/.test(resp) && !/savues\.com/.test(resp), resp);
}

console.log('\n─── 清单结构 ───');
for (const k of ['#!name', '#!desc', '#!author', '#!homepage', '#!date']) t(`含 ${k}`, lpx.includes(k));
t('script-path 全部指向本仓库', lpx.includes('loon-plugin-patches/main/plugins/GeoFix/src/'));
t('MitM 含三个域名', /gs-loc\.apple\.com.*gs-loc-cn\.apple\.com.*savues\.com/.test(lpx));
t('无独立 [Argument] 段', !sections.Argument, Object.keys(sections).join(','));

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
