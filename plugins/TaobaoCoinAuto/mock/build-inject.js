/* 用仓库里真正的插件响应脚本处理模拟 p_index.js，产出注入版 bundle。
   用法: node build-inject.js
   产物: p_index.injected.js + index.html(原版) + index-injected.html(注入版) */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const PLUGIN = path.resolve(HERE, '..', 'src', 'town_inject.response.js');

const bundle = fs.readFileSync(path.join(HERE, 'p_index.js'), 'utf8');
const script = fs.readFileSync(PLUGIN, 'utf8');

let out = null;
const arg = { autoFeed: 'true', skipUpgradeAnim: 'true', liteAnim: 'false',
              drawEnergy: 'true', gapMs: '2500', idleMs: '8000', maxRounds: '30' };
new Function('$response', '$argument', '$done', script)({ body: bundle }, arg, (v) => { out = v; });

if (!out || !out.body) { console.error('❌ 响应脚本没有产出 body'); process.exit(1); }
fs.writeFileSync(path.join(HERE, 'p_index.injected.js'), out.body);

const crypto = require('crypto');
const tpl = fs.readFileSync(path.join(HERE, 'index.tpl.html'), 'utf8');
const stamp = (buf) => crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);
fs.writeFileSync(path.join(HERE, 'index.html'),
  tpl.replace('__BUNDLE__', 'p_index.js?v=' + stamp(bundle)));
fs.writeFileSync(path.join(HERE, 'index-injected.html'),
  tpl.replace('__BUNDLE__', 'p_index.injected.js?v=' + stamp(out.body)));

console.log('✅ 注入完成');
console.log('   原始 bundle :', bundle.length, 'B');
console.log('   注入后 bundle:', out.body.length, 'B (+' + (out.body.length - bundle.length) + 'B)');
console.log('   标记命中     :', out.body.includes('__TJB_AUTO__'));
