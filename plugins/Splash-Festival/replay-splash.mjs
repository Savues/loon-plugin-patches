/*
 * 回放验证器：用 HAR 真实 splash/brand/list 响应运行 splash-poc.js。
 * 验证 show 数组注入排期条目（begin_time/end_time 覆盖当前时间）。
 */
import { readFileSync } from 'fs';
import vm from 'vm';

const scriptPath = new URL('./splash-poc.js', import.meta.url).pathname;
const code = readFileSync(scriptPath, 'utf-8');

function run(label, respBody) {
  console.log('=== ' + label + ' ===');
  const sandbox = {
    $argument: { festival: 'midautumn' },
    $response: { body: respBody },
    $done: (result) => {
      if (result && result.body) {
        const j = JSON.parse(result.body);
        const show = j.data && j.data.show;
        if (Array.isArray(show) && show.length === 1) {
          const s = show[0];
          const now = Math.floor(Date.now() / 1000);
          const ok = s.id === 38 && s.source === 'brand' &&
            s.begin_time <= now && s.end_time >= now && s.probability === 1;
          console.log('输出 data.show:', JSON.stringify(show, null, 2));
          console.log(ok ? '✅ 注入成功（时间窗口覆盖当前）' : '❌ 注入失败');
        } else {
          console.log('❌ show 数组异常');
        }
      } else {
        console.log('❌ 脚本未返回 body');
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'splash-poc.js' });
  console.log();
}

// 场景 1：HAR 真实 brand/list 响应
const HAR = process.argv[2];
if (HAR) {
  const har = JSON.parse(readFileSync(HAR, 'utf-8'));
  const entry = har.log.entries.find(e => /\/x\/v2\/splash\/brand\/list/.test(e.request.url));
  if (entry) {
    const body = entry.response.content.text;
    const enc = entry.response.content.encoding;
    const respBody = enc === 'base64' ? Buffer.from(body, 'base64').toString('utf-8') : body;
    run('HAR brand/list', respBody);
  } else {
    console.log('未找到 brand/list 条目');
  }
}
