const vm = require('vm');
const fs = require('fs');
const path = require('path');
const scriptPath = path.join(__dirname, 'Enhanced-mine.response.js');
const scriptCode = fs.readFileSync(scriptPath, 'utf-8');

let doneResult = null;
const env = {
  $argument: { MineEnable: true, MineHideIds: '751,755,763', LogLevel: 'OFF' },
  $request: { url: 'https://app.bilibili.com/x/v2/account/mine/ipad', headers: { 'User-Agent': 'bili-hd2/37100100' } },
  $response: { body: JSON.stringify({
    code: 0,
    data: {
      ipad_upper_sections: [{ id: 751 }, { id: 752 }, { id: 753 }, { id: 754 }],
      ipad_recommend_sections: [{ id: 755 }, { id: 756 }, { id: 757 }, { id: 758 }, { id: 759 }, { id: 2541 }, { id: 760 }],
      ipad_more_sections: [{ id: 965 }, { id: 763 }, { id: 764 }],
      ipad_sections: [{ id: 747 }, { id: 748 }, { id: 749 }, { id: 750 }],
      ipad_section_style: 0
    }
  })},
  $done: function(res) { doneResult = res; console.log('$done called with keys:', Object.keys(res)); },
  $persistentStore: { read: () => null, write: () => true },
  $environment: {},
  process: { versions: { node: '22.0.0' } },
  console: { log: (...args) => console.log('[SCRIPT LOG]', ...args), warn: (...args) => console.warn('[SCRIPT WARN]', ...args), error: (...args) => console.error('[SCRIPT ERR]', ...args) }
};

const ctx = vm.createContext(env);
vm.runInContext(scriptCode, ctx);
console.log('doneResult:', doneResult ? (doneResult.body ? 'has body' : 'no body') : 'undefined');
if (doneResult && doneResult.body) {
  const data = JSON.parse(doneResult.body).data;
  console.log('upper ids:', data.ipad_upper_sections.map(x => x.id));
  console.log('recommend ids:', data.ipad_recommend_sections.map(x => x.id));
  console.log('more ids:', data.ipad_more_sections.map(x => x.id));
}
