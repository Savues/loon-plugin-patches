#!/usr/bin/env node
/*
 * YouTube-Dedup 回归测试
 *
 * 数据来源：2026-09-29 用户在 iPadOS 18.7.3 / YouTube 21.39.4 上用 Loon 抓的
 * 冷启动 HAR（64 条，02:45:52–02:45:58）。这里只留了两条**响应体**，
 * 且已确认不含任何令牌（无 ya29 / Bearer / oauth / AIza / visitor-id）：
 *   fixtures/config-response.bin     youtubei/v1/config    200  80364 B
 *   fixtures/log_event-response.bin  youtubei/v1/log_event 200     42 B (image/gif)
 *
 * 跑法：node test/config-onesie.test.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, '..', 'src', 'config-onesie.js'), 'utf8');
const CONFIG_BODY = readFileSync(join(here, 'fixtures', 'config-response.bin'));
const LOG_EVENT_BODY = readFileSync(join(here, 'fixtures', 'log_event-response.bin'));

// 由「打了 ColdConfigGroup 补丁的上游 youtube.response.js」在同一份 fixture 上跑出来的
// 真值，用来钉死本脚本的输出与上游行为一致。
const TRUTH = {
  youtube: {
    clientKey: 'z1ILCNJ2yPW3hvvCB27hxlP/QZCCgrLnxR+N9XsnaEc=',
    encryptKey: 'AKoCjmleuyGCejzv7UKBDR1mEyezd+6WtDrftOYwkd0WpZperxExfKhT2/GG54SxiliE06k=',
  },
};

let pass = 0;
const failures = [];

function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('  ok   ' + name);
  } else {
    failures.push(name + (extra ? ' — ' + extra : ''));
    console.log('  FAIL ' + name + (extra ? ' — ' + extra : ''));
  }
}

/** 在最小 Loon 运行时里跑一次脚本，返回 { store, done } */
function run({ body, url, headers, seed }) {
  const store = { ...(seed || {}) };
  let done = 'NOT-CALLED';
  const sandbox = {
    $request: { url: url || 'https://youtubei.googleapis.com/youtubei/v1/config', headers: headers || {} },
    $response: { status: 200, body },
    $persistentStore: {
      read: (k) => (k in store ? store[k] : null),
      write: (k, v) => { store[k] = v; return true; },
      remove: (k) => { delete store[k]; return true; },
    },
    $notification: { post() {} },
    $done: (v) => { done = v === undefined ? 'UNDEF' : (v && Object.keys(v).length ? v : 'EMPTY'); },
    console: { log() {}, error() {}, warn() {} },
    TextDecoder, TextEncoder, DataView, Uint8Array, ArrayBuffer, BigInt, Math, JSON, String, Object,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'config-onesie.js', timeout: 10000 });
  return { store, done };
}

const IOS_UA = 'com.google.ios.youtube/21.39.4 (iPad16,1; U; CPU iPadOS 18_7_3 like Mac OS X; zh-Hans_US)';
const MUSIC_UA = 'com.google.ios.youtubeMusic/7.24 (iPhone16,2; U; CPU iOS 18_7 like Mac OS X)';

console.log('config-onesie.js');

{
  const { store, done } = run({
    body: new Uint8Array(CONFIG_BODY),
    headers: { 'user-agent': IOS_UA },
  });
  const cfg = JSON.parse(store.YouTubeConfig || '{}');
  check('config 响应能采到 onesie clientKey', cfg.youtube?.clientKey === TRUTH.youtube.clientKey,
    'got ' + cfg.youtube?.clientKey);
  check('config 响应能采到 onesie encryptKey', cfg.youtube?.encryptKey === TRUTH.youtube.encryptKey,
    'got ' + cfg.youtube?.encryptKey);
  check('响应体不被改写（$done({})）', done === 'EMPTY', 'done=' + JSON.stringify(done));
  check('UA 不是 Music 时平台键为 youtube', !!cfg.youtube && cfg.youtubeMusic === undefined);
}

{
  const { store } = run({
    body: new Uint8Array(CONFIG_BODY),
    headers: { 'user-agent': MUSIC_UA },
  });
  const cfg = JSON.parse(store.YouTubeConfig || '{}');
  check('Music UA 时平台键为 youtubeMusic', cfg.youtubeMusic?.clientKey === TRUTH.youtube.clientKey);
  check('Music UA 不会误写 youtube 键', cfg.youtube === undefined);
}

{
  // 幂等：同样的密钥再跑一次不应重复写
  const seed = { YouTubeConfig: JSON.stringify(TRUTH) };
  let writes = 0;
  const sandboxStore = { ...seed };
  const s = {
    $request: { url: 'https://youtubei.googleapis.com/youtubei/v1/config', headers: { 'user-agent': IOS_UA } },
    $response: { status: 200, body: new Uint8Array(CONFIG_BODY) },
    $persistentStore: {
      read: (k) => (k in sandboxStore ? sandboxStore[k] : null),
      write: (k, v) => { writes++; sandboxStore[k] = v; return true; },
      remove: (k) => { delete sandboxStore[k]; return true; },
    },
    $notification: { post() {} },
    $done: () => {},
    console: { log() {}, error() {}, warn() {} },
    TextDecoder, TextEncoder, DataView, Uint8Array, ArrayBuffer, BigInt, Math, JSON, String, Object,
  };
  s.globalThis = s;
  vm.createContext(s);
  vm.runInContext(SRC, s, { timeout: 10000 });
  check('密钥未变化时不重写 persistentStore', writes === 0, 'writes=' + writes);
}

{
  // 不能覆盖掉别的平台已存的密钥
  const seed = { YouTubeConfig: JSON.stringify({ youtubeMusic: { clientKey: 'AAA', encryptKey: 'BBB' } }) };
  const { store } = run({ body: new Uint8Array(CONFIG_BODY), headers: { 'user-agent': IOS_UA }, seed });
  const cfg = JSON.parse(store.YouTubeConfig);
  check('保留其它平台已存的密钥', cfg.youtubeMusic?.clientKey === 'AAA' && cfg.youtube?.clientKey === TRUTH.youtube.clientKey);
}

{
  // log_event 的响应是 1x1 GIF，不是 protobuf —— 绝不能被当成 config 解析
  const { store, done } = run({ body: new Uint8Array(LOG_EVENT_BODY), headers: { 'user-agent': IOS_UA } });
  check('GIF 响应体不写任何缓存', store.YouTubeConfig === undefined, JSON.stringify(store));
  check('GIF 响应体仍然放行', done === 'EMPTY');
}

{
  const cases = [
    ['空响应体', new Uint8Array(0)],
    ['截断的 config（前 100 字节）', new Uint8Array(CONFIG_BODY.subarray(0, 100))],
    ['纯文本', new Uint8Array(Buffer.from('not a protobuf at all'))],
    ['ArrayBuffer 形态的 config', CONFIG_BODY.buffer.slice(CONFIG_BODY.byteOffset, CONFIG_BODY.byteOffset + CONFIG_BODY.byteLength)],
  ];
  for (const [label, body] of cases) {
    let threw = false;
    try {
      const { done } = run({ body, headers: { 'user-agent': IOS_UA } });
      check(`${label}：放行且不报错`, done === 'EMPTY');
    } catch (e) {
      threw = true;
      check(`${label}：放行且不报错`, false, String(e));
    }
    if (threw) continue;
  }
}

{
  // 缓存里是坏 JSON 时应覆盖而不是抛错
  const { store, done } = run({
    body: new Uint8Array(CONFIG_BODY),
    headers: { 'user-agent': IOS_UA },
    seed: { YouTubeConfig: '{not json' },
  });
  const cfg = JSON.parse(store.YouTubeConfig || '{}');
  check('缓存损坏时能重建', cfg.youtube?.clientKey === TRUTH.youtube.clientKey, store.YouTubeConfig);
  check('缓存损坏时仍放行', done === 'EMPTY');
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log('  ! ' + f);
  process.exit(1);
}
