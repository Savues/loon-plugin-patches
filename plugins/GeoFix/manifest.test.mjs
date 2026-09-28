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

const rules = [];
for (const line of lpx.split('\n')) {
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
t('规则条数 = 6', rules.length === 6, String(rules.length));

const hit = (u) => rules.filter((r) => r.re.test(u)).map((r) => r.tag);

const CASES = [
  ['https://map.com/', ['GeoFix UI root']],
  ['https://map.com/?u=abc', ['GeoFix UI root']],
  ['https://map.com/geo-ui/', ['GeoFix UI']],
  ['https://map.com/geo-ui/?u=abc', ['GeoFix UI']],
  ['https://map.com/geo-parse?u=abc', ['GeoFix Parse']],
  ['https://map.com/geo-settings/save?lat=1&lon=2', ['GeoFix Bridge']],
  ['https://map.com/geo-settings/status', ['GeoFix Bridge']],
  ['https://map.com/geo-route/save?payload=x', ['GeoFix Route']],
  ['https://gs-loc.apple.com/geo-ui/', ['GeoFix UI']],
  ['https://gs-loc.apple.com/geo-parse?u=abc', ['GeoFix Parse']],
  ['https://gs-loc.apple.com/geo-settings/clear', ['GeoFix Bridge']],
  ['https://gs-loc-cn.apple.com/geo-settings/status', ['GeoFix Bridge']],
  ['https://gs-loc.apple.com/clls/wloc', ['GeoFix Response']],
  ['https://map.com/foo', []],
  ['https://map.com/geo-ui/anything', []],
  ['https://map.com/geo-parse', []],
  ['https://gs-loc.apple.com/other/path', []],
  ['https://www.apple.com/', []],
  ['https://evil.example.com/geo-settings/save?lat=1', []],
  ['https://map.com.evil.com/geo-settings/save?lat=1', []],
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
  // 模式里主机是转义过的（map\.com），先把反斜杠去掉再比对
  const unescape = (s) => s.replace(/\\/g, '');
  const stray = rules.filter((r) => !/gs-loc|map\.com/.test(unescape(r.pattern)));
  t('没有规则脱离限定主机', stray.length === 0, stray.map((r) => r.pattern).join(' | '));
  t('相似恶意主机全部放行', CASES.filter(([u]) => /evil/.test(u)).every(([u]) => hit(u).length === 0));
  const resp = rules.find((r) => r.tag === 'GeoFix Response').pattern;
  t('clls/wloc 规则只认 gs-loc', /gs-loc/.test(resp) && !/map\.com/.test(resp), resp);
}

console.log('\n─── 清单结构 ───');
for (const k of ['#!name', '#!desc', '#!author', '#!homepage', '#!date']) t(`含 ${k}`, lpx.includes(k));
t('script-path 全部指向本仓库', lpx.includes('loon-plugin-patches/main/plugins/GeoFix/src/'));
t('MitM 含三个域名', /gs-loc\.apple\.com.*gs-loc-cn\.apple\.com.*map\.com/.test(lpx));
t('无独立 [Argument] 段', !/^\[Argument\]\s*$/m.test(lpx));

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
