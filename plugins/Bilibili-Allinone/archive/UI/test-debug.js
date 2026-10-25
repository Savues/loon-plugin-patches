const vm = require('vm');
const fs = require('fs');
const path = require('path');
const scriptPath = path.join(__dirname, 'Enhanced-mine.response.js');
const scriptCode = fs.readFileSync(scriptPath, 'utf-8');

const env = {
  $argument: { MineEnable: false, LogLevel: 'OFF' },
  $request: { url: 'https://app.bilibili.com/x/v2/account/mine/ipad', headers: { 'User-Agent': 'bili-hd2/37100100' } },
  $response: { body: '{}' },
  $done: function(res) { console.log('$done called with:', JSON.stringify(res)); this.$doneResult = res; },
  $persistentStore: { read: () => null, write: () => true },
  $environment: {},
  process: { versions: { node: '22.0.0' } },
  console: { log: () => {}, warn: () => {}, error: () => {} }
};

console.log('Running script...');
const ctx = vm.createContext(env);
try {
  vm.runInContext(scriptCode, ctx);
  console.log('Script finished');
  console.log('$doneResult:', JSON.stringify(env.$doneResult));
} catch (e) {
  console.error('Error:', e.message);
  console.error(e.stack);
}
