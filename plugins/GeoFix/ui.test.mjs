// GeoFix 本地控制页测试：验证 geo-ui.js 在哪些地址上返回 HTML、哪些返回 404
//   node ui.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'src');

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? '✔' : '✘'} ${name}${extra ? '\n      ' + extra : ''}`);
};

function serve(url) {
  let out = null;
  const sandbox = {
    $loon: {},
    $request: { url },
    $done: (v) => { out = v.response; },
    URL: globalThis.URL,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(SRC, 'geo-ui.js'), 'utf8'), sandbox, { filename: 'geo-ui.js' });
  if (!out) throw new Error('没有调用 $done');
  return out;
}

console.log('─── 短地址 map.com ───');
for (const u of ['https://map.com/', 'https://map.com', 'https://map.com/?x=1', 'https://map.com/geo-ui/', 'https://map.com/geo-ui']) {
  const r = serve(u);
  t(`返回控制页  ${u}`, r.status === 200 && r.headers['Content-Type'] === 'text/html; charset=utf-8', r.status + ' ' + r.headers['Content-Type']);
}

console.log('\n─── 完整地址 gs-loc.apple.com ───');
for (const u of ['https://gs-loc.apple.com/geo-ui/', 'https://gs-loc.apple.com/geo-ui', 'https://gs-loc-cn.apple.com/geo-ui/']) {
  const r = serve(u);
  t(`返回控制页  ${u}`, r.status === 200 && r.headers['Content-Type'] === 'text/html; charset=utf-8');
}

console.log('\n─── 非 UI 路径必须放行（不能误拦真实流量） ───');
for (const u of ['https://map.com/foo', 'https://map.com/foo/bar', 'https://gs-loc.apple.com/geo-ui/anything',
  'https://gs-loc.apple.com/clls/wloc', 'https://gs-loc.apple.com/geo-settings/save?lat=1&lon=2',
  'https://gs-loc.apple.com/geo-parse?u=1']) {
  const r = serve(u);
  t(`放行 404  ${u}`, r.status === 404, 'status=' + r.status);
}

console.log('\n─── 页面内容 ───');
{
  const b = serve('https://map.com/').body;
  t('完整 HTML', b.startsWith('<!DOCTYPE html>') && b.trimEnd().endsWith('</html>'), b.slice(0, 40) + ' …');
  t('接口用绝对地址（否则从 map.com 打开会打错主机）',
    b.includes('var HOST = "https://gs-loc.apple.com"') && b.includes('var BASE = HOST + "/geo-settings"')
    && b.includes('var PARSE = HOST + "/geo-parse"'));
  t('没有裸相对路径 fetch', !b.includes('fetch("/geo') && !b.includes('= "/geo-'));
  t('无任何外链资源', !/src="http|href="http|@import/.test(b));
  t('无 srcset / rel=preload', !/srcset=|rel="preload"/.test(b));
  t('关键功能齐全', ['geo-settings', 'geo-parse', '/clear', 'localStorage', 'padd', 'pdel', 'acc'].every((k) => b.includes(k)));
  t('页面不自我递归引用', !b.includes('/geo-ui/'));
  t('无 eval / new Function', !b.includes('eval(') && !b.includes('new Function'));
}

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
