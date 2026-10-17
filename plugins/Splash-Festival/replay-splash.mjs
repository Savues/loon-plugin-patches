/*
 * 回放验证器：用 HAR 真实响应运行 splash-poc.js。
 * 模拟 brand/list 和 splash/show 两种端点。
 */
import { readFileSync } from 'fs';
import vm from 'vm';

const scriptPath = new URL('./splash-poc.js', import.meta.url).pathname;
const code = readFileSync(scriptPath, 'utf-8');

function run(label, respBody, reqUrl) {
  console.log('=== ' + label + ' ===');
  const sandbox = {
    $argument: { festival: 'gaokao24' },
    $request: { url: reqUrl },
    $response: { body: respBody },
    $done: (result) => {
      if (result && result.body) {
        const j = JSON.parse(result.body);
        const show = j.data && j.data.show;
        const list = j.data && j.data.list;
        if (Array.isArray(show)) {
          console.log('show count:', show.length);
          if (show.length > 0) {
            console.log('show[0] id:', show[0].id);
            console.log('show[0] keys:', Object.keys(show[0]).join(', '));
          }
        }
        if (Array.isArray(list)) {
          console.log('list count:', list.length);
          const hist = list.find(x => x.id === 113);
          if (hist) console.log('list has id=113:', hist.thumb_name);
        }
        console.log('✅ 注入成功');
      } else {
        console.log('❌ 脚本未返回 body');
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'splash-poc.js' });
  console.log();
}

// 场景 1：brand/list
const HAR = process.argv[2];
if (HAR) {
  const har = JSON.parse(readFileSync(HAR, 'utf-8'));
  const brandEntry = har.log.entries.find(e => /\/x\/v2\/splash\/brand\/list/.test(e.request.url));
  if (brandEntry) {
    const body = brandEntry.response.content.text;
    const enc = brandEntry.response.content.encoding;
    const respBody = enc === 'base64' ? Buffer.from(body, 'base64').toString('utf-8') : body;
    run('brand/list (gaokao24)', respBody, brandEntry.request.url);
  }
  const showEntry = har.log.entries.find(e => /\/x\/v2\/splash\/show/.test(e.request.url));
  if (showEntry) {
    const body = showEntry.response.content.text;
    const enc = showEntry.response.content.encoding;
    const respBody = enc === 'base64' ? Buffer.from(body, 'base64').toString('utf-8') : body;
    run('splash/show (gaokao24)', respBody, showEntry.request.url);
  }
}
