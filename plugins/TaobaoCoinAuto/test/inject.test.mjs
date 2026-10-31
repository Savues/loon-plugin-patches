/* TaobaoCoinAuto 注入链路单测
   覆盖：响应脚本追加注入 → 产物语法合法 → 注入代码在模拟 webpack 环境里
        拿到 require / 找到业务模块 / 按真实字段算出满格数并调用 feed */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'src', 'town_inject.response.js');
const scriptSrc = fs.readFileSync(SCRIPT, 'utf8');

/* ---------- 1. 响应脚本：追加注入 ---------- */
const bundle = '(self.webpackChunk_ali_pegasus_project_taocoin_home=self.webpackChunk_ali_pegasus_project_taocoin_home||[]).push([[1],{},function(){}]);';
let done = null;
new Function('$response', '$argument', '$done', scriptSrc)(
  { body: bundle },
  { autoFeed: 'true', skipUpgradeAnim: 'true', liteAnim: 'false', drawEnergy: 'true',
    gapMs: '2500', idleMs: '8000', maxRounds: '30' },
  (v) => { done = v; }
);
assert.ok(done && done.body, '响应脚本必须产出 body');
assert.ok(done.body.length > bundle.length, '必须追加内容');
assert.ok(done.body.includes('__TJB_AUTO__'), '必须带注入标记');
assert.doesNotThrow(() => new Function(done.body), '注入后 JS 必须语法合法');

/* 幂等：已注入过的 body 不再叠加 */
let done2 = null;
new Function('$response', '$argument', '$done', scriptSrc)({ body: done.body }, {}, (v) => { done2 = v; });
assert.ok(done2 && !done2.body, '已注入过的响应应原样放行（$done({})）');

/* 非目标 bundle 放行 */
let done3 = null;
new Function('$response', '$argument', '$done', scriptSrc)({ body: 'var a = 1;' }, {}, (v) => { done3 = v; });
assert.ok(done3 && !done3.body, '非游戏 bundle 必须放行');

/* ---------- 2. 注入代码逻辑：真实字段 → 满格喂养 ---------- */
const payload = done.body.slice(done.body.indexOf('/*__TJB_AUTO__*/'));
const feedCalls = [];
let yn = 0, upgrades = 0;
const ui = { toolAmount: 12000, singleEnergyCost: 100, maxWalkGrids: 50, level: 5,
             canBatchWalk: true, canUpgrade: false, levelFull: false };
const mx = {
  store: { get: (k) => (k === 'UserInfo' ? ui : null), update: (k, v) => { if (k === 'UserInfo') Object.assign(ui, v); } },
  event: { emit() {}, on() {} }
};
const req = function () {};
req.c = {
  1: { exports: { mx } },
  2: { exports: {
    lv: (p) => { feedCalls.push(p); ui.toolAmount -= p.walkGridNum * p.displayedSingleEnergyCost; return Promise.resolve({ userInfo: ui }); },
    YN: () => { yn++; return Promise.resolve({}); },
    a_: () => Promise.resolve({ userInfo: ui }),
    V7: () => Promise.resolve({}),
    x$: () => { upgrades++; return Promise.resolve({}); }
  } }
};

/* 在独立 vm 沙箱里跑注入代码：绝不动宿主的 setTimeout/fetch。
   （v0.1.2 加了 beacon 的 fetch 调用后，改宿主全局 setTimeout 会让 node20 内置
    undici 的 fastNowTimeout.refresh 拿到数字而崩溃 → CI 上必挂、node22 上侥幸不挂） */
const queue = [];
const sandbox = {
  console,
  setTimeout: (fn) => { queue.push(fn); return queue.length; },
  setInterval: () => 0,
  clearTimeout: () => {},
  clearInterval: () => {},
  fetch: () => Promise.resolve({ ok: true }),
  document: {
    createElement: () => ({ style: {}, appendChild() {}, parentNode: null }),
    body: { appendChild() {} },
    documentElement: { appendChild() {} },
    querySelectorAll: () => [],
    querySelector: () => null
  },
  getComputedStyle: () => ({ opacity: '1' }),
  location: { search: '?hd_from=20261111home' },
  webpackChunk_ali_pegasus_project_taocoin_home: { push: (c) => { if (c[2]) c[2](req); } }
};
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(payload, sandbox);
const flush = () => new Promise((r) => setImmediate(r));
for (let i = 0; i < 4; i++) {
  const fn = queue.shift();
  if (fn) fn();
  await flush(); await flush(); await flush();
}

assert.equal(feedCalls.length, 3, '能量 12000 / 单次 100 / 上限 50 → 应喂 3 轮');
assert.deepEqual(
  feedCalls.map((c) => c.walkGridNum), [50, 50, 20],
  '每轮格数应为 min(能量/消耗, 上限)'
);
assert.ok(feedCalls.every((c) => c.operationType === 'EXHAUST_ENERGY'), '满级解锁后应走 EXHAUST_ENERGY');
assert.equal(feedCalls[0].displayedSingleEnergyCost, 100, '单次消耗应透传');
assert.equal(feedCalls[0].hd_from, '20261111home', 'hd_from 应从 URL 取');
assert.equal(yn, 1, '能量不足时应尝试领能量');
assert.equal(upgrades, 0, '经验未满不应调升级');

console.log('✅ TaobaoCoinAuto inject: 3 轮喂养 50/50/20，参数与真实字段一致');
