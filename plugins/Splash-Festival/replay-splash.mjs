/*
 * 回放验证器：用 HAR 真实 splash/show 响应运行 splash-poc.js。
 * 同时模拟 200 空 show 与 -304 null data 两种输入。
 */
import { readFileSync } from 'fs';
import vm from 'vm';

const scriptPath = new URL('./splash-poc.js', import.meta.url).pathname;
const code = readFileSync(scriptPath, 'utf-8');

function run(label, respBody) {
  console.log('=== ' + label + ' ===');
  console.log('输入:', respBody.slice(0, 120));
  const sandbox = {
    $argument: { festival: 'midautumn' },
    $response: { body: respBody },
    $done: (result) => {
      if (result && result.body) {
        const j = JSON.parse(result.body);
        console.log('输出 data.show:', JSON.stringify(j.data.show, null, 2));
        const ok = Array.isArray(j.data.show) && j.data.show.length === 1 &&
          j.data.show[0].thumb_name === '中秋节' && j.data.show[0].is_ad === false;
        console.log(ok ? '✅ 注入成功' : '❌ 注入失败');
      } else {
        console.log('❌ 脚本未返回 body');
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'splash-poc.js' });
  console.log();
}

// 场景 1：200 + 空 show（客户端首次请求）
run('场景1: 200 空show', JSON.stringify({
  code: 0, message: "OK", ttl: 1,
  data: { show: [], splash_request_id: "test123" }
}));

// 场景 2：-304 + data=null（缓存命中）
run('场景2: -304 null', JSON.stringify({
  code: -304, message: "-304", ttl: 1, data: null
}));

// 场景 3：用 HAR 真实响应
const HAR = process.argv[2];
if (HAR) {
  const har = JSON.parse(readFileSync(HAR, 'utf-8'));
  const showEntry = har.log.entries.find(e => /\/x\/v2\/splash\/show/.test(e.request.url));
  if (showEntry) {
    const body = showEntry.response.content.text;
    const enc = showEntry.response.content.encoding;
    const respBody = enc === 'base64' ? Buffer.from(body, 'base64').toString('utf-8') : body;
    run('场景3: HAR真实响应', respBody);
  }
}
