// test-airborne-fuzz.js —— 畸形/边界响应 × 参数组合，确认没有异常能逃出 handler
const fs = require('fs');
const ART = require('path').resolve(__dirname, '../plugins/Bilibili-Airborne/bilibili.airborne.js');
const src = fs.readFileSync(ART, 'utf8');
const a = src.indexOf('/* ==== Savues'), b = src.indexOf('var C=');
eval(src.slice(a, b));
eval(src.match(/function tn\(s,a\)\{[\s\S]*?\}\)\}/)[0]);
eval(src.match(/function nn\(s,a\)\{[\s\S]*?\}\)\}/)[0]);

const CASES = [
  ['空数组', '[]'],
  ['未知类别报错', '["Unknown category provided."]'],
  ['null', 'null'],
  ['数组含 null', '[null]'],
  ['缺 segment', '[{"actionType":"skip","category":"sponsor"}]'],
  ['segment 只有一个数', '[{"actionType":"skip","category":"sponsor","segment":[1]}]'],
  ['segment 是字符串', '[{"actionType":"skip","category":"sponsor","segment":"ab"}]'],
  ['segment 为 null', '[{"actionType":"skip","category":"sponsor","segment":null}]'],
  ['数组套数组', '[[1,2]]'],
  ['纯数字', '[1,2,3]'],
  ['坏 JSON', '{not json'],
  ['空串', ''],
  ['对象不是数组', '{"segment":[0,10]}'],
  ['超大数组', JSON.stringify(Array.from({length: 500}, (_, i) => ({ actionType: 'skip', category: 'sponsor', segment: [i, i + 20] })))],
  ['负数/倒序区间', '[{"actionType":"skip","category":"sponsor","segment":[50,10]}]'],
  ['NaN 边界', '[{"actionType":"skip","category":"sponsor","segment":[0,0]}]'],
  ['未知 category 值', '[{"actionType":"skip","category":"__none__","segment":[0,30]}]'],
  ['未知 actionType', '[{"actionType":"weird","category":"sponsor","segment":[0,30]}]'],
];

const ARGS = [
  {}, { airCategories: 'off' }, { airCategories: '' }, { airCategories: null },
  { airMinDuration: 'abc' }, { airMinDuration: -5 }, { airMinDuration: 1e9 },
  { airActions: '' }, { airActions: 'skip,full,poi,mute' },
  { airNotice: '' }, { airNotice: '{cat}{start}{end}{dur}' }, { airNotice: '😀{dur}' },
  { airMode: 'mark' }, { airMode: 'jump' }, { airMode: 'weird' },
  { AirCategories: 'intro' },          // 大小写容错
  { AIRMINIMUMDURATION: 3 },
];

// 忠实还原调用方的守卫：en() 里是 if(!i || i==="[]") return []，且整段包在 try/catch
function handler(body, arg) {
  if (body == null || body === "" || body === "[]") return [];
  try { return tn(body, arg); } catch (e) { return []; } // 上游 catch 分支：log + 返回 []
}

let fail = 0, ran = 0, caught = 0;
for (const [name, body] of CASES) {
  for (const arg of ARGS) {
    ran++;
    try {
      if (body && body[0] === '[' && body !== '[]' && body !== 'null') {
        try { JSON.parse(body).reduce(() => {}, null); } catch (e) { caught++; }
      }
      const segs = handler(body, arg);
      nn(segs, arg);
      const elems = [];
      __airInject(elems, segs, arg);
      __airInject(elems, segs, arg);   // 幂等：两次
      if (elems.length > segs.length && segs.length) { console.log(`✗ ${name} ${JSON.stringify(arg)} 注入数异常 ${elems.length}`); fail++; }
    } catch (e) {
      fail++;
      console.log(`✗ ${name} ${JSON.stringify(arg)} → ${e.constructor.name}: ${e.message}`);
    }
  }
}
// 枚举异常也扫一遍
for (const m of [1e308, 1e9, 2 ** 31, 0.1, -0.4]) {
  ran++;
  try { nn([[m, m + 1, 'sponsor']], { airNotice: '{start}→{end} 省{dur}s {cat}', airMode: 'jump' }); }
  catch (e) { fail++; console.log(`✗ __airFmt(${m}) → ${e.message}`); }
}
console.log(`畸形/边界用例: ${CASES.length} 种响应 × ${ARGS.length} 组参数 + 5 个数值边界 = ${ran} 次`);
console.log(`其中由上游 catch 兜住的: ${caught} 次`);
console.log(fail ? `${fail} 次逃出 handler` : '没有任何异常逃出 handler');
process.exit(fail ? 1 : 0);