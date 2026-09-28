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

console.log('─── 短地址 savues.com ───');
for (const u of ['https://savues.com/', 'https://savues.com', 'https://savues.com/?x=1', 'https://savues.com/geo-ui/', 'https://savues.com/geo-ui']) {
  const r = serve(u);
  t(`返回控制页  ${u}`, r.status === 200 && r.headers['Content-Type'] === 'text/html; charset=utf-8', r.status + ' ' + r.headers['Content-Type']);
}

console.log('\n─── 完整地址 gs-loc.apple.com ───');
for (const u of ['https://gs-loc.apple.com/geo-ui/', 'https://gs-loc.apple.com/geo-ui', 'https://gs-loc-cn.apple.com/geo-ui/']) {
  const r = serve(u);
  t(`返回控制页  ${u}`, r.status === 200 && r.headers['Content-Type'] === 'text/html; charset=utf-8');
}

console.log('\n─── 非 UI 路径必须放行（不能误拦真实流量） ───');
for (const u of ['https://savues.com/foo', 'https://savues.com/foo/bar', 'https://gs-loc.apple.com/geo-ui/anything',
  'https://gs-loc.apple.com/clls/wloc', 'https://gs-loc.apple.com/geo-settings/save?lat=1&lon=2',
  'https://gs-loc.apple.com/geo-parse?u=1']) {
  const r = serve(u);
  t(`放行 404  ${u}`, r.status === 404, 'status=' + r.status);
}

console.log('\n─── 页面内容 ───');
{
  const b = serve('https://savues.com/').body;
  t('完整 HTML', b.startsWith('<!DOCTYPE html>') && b.trimEnd().endsWith('</html>'), b.slice(0, 40) + ' …');
  t('接口用绝对地址（否则从 savues.com 打开会打错主机）',
    b.includes('var HOST = "https://gs-loc.apple.com"') && b.includes('var BASE = HOST + "/geo-settings"')
    && b.includes('var PARSE = HOST + "/geo-parse"'));
  t('没有裸相对路径 fetch', !b.includes('fetch("/geo') && !b.includes('= "/geo-'));
  t('无任何外链资源', !/src="http|href="http|@import/.test(b));
  t('无 srcset / rel=preload', !/srcset=|rel="preload"/.test(b));
  t('关键功能齐全', ['geo-settings', 'geo-parse', '/clear', 'localStorage', 'padd', 'pdel', 'acc'].every((k) => b.includes(k)));
  t('页面不自我递归引用', !b.includes('/geo-ui/'));
  t('无 eval / new Function', !b.includes('eval(') && !b.includes('new Function'));
}

console.log('\n─── ?u= 入口：把页面脚本真跑一遍 ───');
{
  // 抽出页面里的 <script>，用最小 DOM 桩跑，验证收到 ?u= 会真的去解析并填表单
  const html = fs.readFileSync(path.join(SRC, 'ui.html'), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) { t('能抽出页面脚本', false); } else {
    t('能抽出页面脚本', true, m[1].length + ' chars');

    const runPage = (search, autoWrite, hrefOverride) => {
      const fields = {};
      const calls = [];
      const el = (id) => {
        if (!fields[id]) fields[id] = { value: '', textContent: '', innerHTML: '', hidden: false, className: '', onclick: null, onchange: null };
        return fields[id];
      };
      const fakeDoc = {
        getElementById: el,
        querySelectorAll: () => [],
        createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }),
      };
      const store = {};
      const sandbox = {
        document: fakeDoc,
        location: {
          host: 'savues.com', search, origin: 'https://savues.com',
          href: hrefOverride || ('https://savues.com' + search),
          pathname: (hrefOverride || ('https://savues.com' + search)).split('?')[0],
        },
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
        URLSearchParams: globalThis.URLSearchParams,
        URL: globalThis.URL,
        Promise, Math, JSON, Date, String, Number, isFinite, parseInt, parseFloat, confirm: () => true,
        setTimeout: (f) => { f(); return 0; },
        clearTimeout: () => {},
        fetch: (u) => {
          calls.push(u);
          if (String(u).includes('/geo-parse')) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ lat: 39.907829, lon: 116.391187, name: '天安门', originalSystem: 'GCJ-02', warnings: [] }) });
          }
          if (String(u).includes('/geo-settings/save')) {
            return Promise.resolve({ ok: true, text: () => Promise.resolve('{"ok":true,"mode":"active"}') });
          }
          return Promise.resolve({ ok: true, text: () => Promise.resolve('{"ok":true,"mode":"active","moduleVersion":"1.2.0","tool":"Loon","patchCount":3,"passthroughCount":7}') });
        },
      };
      sandbox.window = sandbox;
      sandbox.globalThis = sandbox;
      vm.createContext(sandbox);
      vm.runInContext(m[1], sandbox, { filename: 'ui.html<script>' });
      return new Promise((r) => setTimeout(() => r({ fields, calls }), 30));
    };

    // 无 ?u= 时不该有解析调用
    const plain = await runPage('', false);
    t('无 ?u= 时不触发解析', !plain.calls.some((c) => c.includes('/geo-parse')), plain.calls.join(' | '));

    // 带 ?u= → 自动解析并填表
    const link = 'https://uri.amap.com/marker?position=116.397428,39.90923&name=%E5%A4%A9%E5%AE%89%E9%97%A8';
    const withU = await runPage('?u=' + encodeURIComponent(link), false);
    const parsed = withU.calls.find((c) => c.includes('/geo-parse'));
    t('带 ?u= 会调 /geo-parse', !!parsed, parsed ? parsed.slice(0, 96) : '(无)');
    t('解析请求带 URL 编码的 u', !!parsed && parsed.includes('u=https%3A%2F%2Furi.amap.com'));
    t('自动把坐标填进表单', withU.fields.lat.value === 39.907829 && withU.fields.lon.value === 116.391187,
      `lat=${withU.fields.lat.value} lon=${withU.fields.lon.value}`);
    t('显示解析结果与原始坐标系', withU.fields.pwarn.textContent.includes('天安门') && withU.fields.pwarn.textContent.includes('GCJ-02'),
      withU.fields.pwarn.textContent);
    t('默认不自动写入（写入是敏感动作）', !withU.calls.some((c) => c.includes('/save')));
    t('会自动拉一次 status', withU.calls.some((c) => c.includes('/status')));

    // 形式 A：链接放在路径里 /g/<原始链接>，应当全自动
    const oneShot = await runPage('', false, 'https://savues.com/g/' + link);
    t('/g/ 入口：会调 /geo-parse', oneShot.calls.some((c) => c.includes('/geo-parse')));
    t('/g/ 入口：解析后直接写入', oneShot.calls.some((c) => c.includes('/save')),
      oneShot.calls.find((c) => c.includes('/save')) || '(无)');
    t('/g/ 入口：坐标正确', oneShot.fields.lat.value === 39.907829 && oneShot.fields.lon.value === 116.391187,
      `lat=${oneShot.fields.lat.value} lon=${oneShot.fields.lon.value}`);
    t('/g/ 入口：原样保留链接里的查询串',
      oneShot.calls.find((c) => c.includes('/geo-parse')).includes(encodeURIComponent(link).slice(0, 60)),
      oneShot.calls.find((c) => c.includes('/geo-parse')).slice(0, 120));

    // 编码形式兜底
    const enc = await runPage('', false, 'https://savues.com/g/' + encodeURIComponent(link));
    t('/g/ 入口：URL 编码形式也能解析', enc.calls.some((c) => c.includes('/save')),
      enc.fields.lat.value === 39.907829 ? '坐标正确' : `lat=${enc.fields.lat.value}`);

    // 根路径不该触发任何动作
    const root = await runPage('', false, 'https://savues.com/');
    t('根路径不自动解析也不自动写入', !root.calls.some((c) => c.includes('/geo-parse') || c.includes('/save')));

    // &auto=1 → 解析完直接写入
    const auto = await runPage('?u=' + encodeURIComponent(link) + '&auto=1', true);
    const saved = auto.calls.find((c) => c.includes('/save'));
    t('带 &auto=1 会直接写入', !!saved, saved ? saved.slice(0, 90) : '(无)');
    t('写入地址正确', !!saved && saved.includes('lat=39.907829') && saved.includes('lon=116.391187') && saved.includes('acc=25'));
  }
}

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
