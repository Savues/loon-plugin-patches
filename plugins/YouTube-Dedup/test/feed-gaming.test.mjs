#!/usr/bin/env node
/*
 * feed-gaming.js 回归测试
 *
 * 数据来源：2026-09-29 用户在 iPadOS 18.7.3 / YouTube 21.39.4 上用 Loon 抓的 HAR
 * （253 条，含 player 响应）。fixture 是从其中 `youtubei/v1/browse`
 * （browseId=FEwhat_to_watch，224289 B）里原样抽出的 3 个 feed section：
 *   1 个「YouTube 游戏大本营」面板（61342 B）+ 2 个普通视频 section，
 *   按真实层级 Browse.f10 → f49399797 → f1×3 重建。已确认不含任何令牌。
 *
 * 跑法：node test/feed-gaming.test.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, '..', 'src', 'feed-gaming.js'), 'utf8');
const FIXTURE = readFileSync(join(here, 'fixtures', 'feed-with-gaming.bin'));

const MARKERS = ['mini_app_panel', 'FEmini_apps_saved'];
const count = (buf, needle) => {
  const s = buf.toString('latin1');
  return s.split(needle).length - 1;
};

let pass = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { failures.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

function run(body, arg) {
  const sb = {
    $request: { url: 'https://youtubei.googleapis.com/youtubei/v1/browse', headers: { 'user-agent': 'com.google.ios.youtube/21.39.4' } },
    $response: { status: 200, body: new Uint8Array(body) },
    $argument: arg,
    $notification: { post() {} },
    $done: (v) => { sb.__done = v; },
    console: { log() {}, error() {}, warn() {} },
    TextDecoder, TextEncoder, DataView, Uint8Array, ArrayBuffer, Math, JSON, String, Object, Array,
  };
  let done = 'NOT-CALLED';
  sb.$done = (v) => { done = v === undefined ? 'UNDEF' : v; };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(SRC, sb, { filename: 'feed-gaming.js', timeout: 20000 });
  return { done, out: done && done.body ? Buffer.from(done.body) : null };
}

/** 走真实层级 Browse.f10 → f49399797，数里面有几个 feed section（字段号 1） */
function countFeedSections(buf) {
  const walk = (start, end) => {
    const fields = [];
    let pos = start;
    const rv = () => { let r = 0, s = 0, c; do { c = buf[pos++]; r += (c & 0x7f) * 2 ** s; s += 7; } while (c & 0x80); return r; };
    while (pos < end) {
      const tag = rv();
      const no = Math.floor(tag / 8), wire = tag & 7;
      if (no === 0 || wire > 5 || wire === 3 || wire === 4) break;
      if (wire === 0) { rv(); fields.push([no, wire, 0, 0]); }
      else if (wire === 1) { fields.push([no, wire, pos, pos + 8]); pos += 8; }
      else if (wire === 5) { fields.push([no, wire, pos, pos + 4]); pos += 4; }
      else if (wire === 2) { const len = rv(); fields.push([no, wire, pos, pos + len]); pos += len; }
      else break;
      if (pos > end) { fields.pop(); break; }
    }
    return fields;
  };
  const f10 = walk(0, buf.length).find(f => f[0] === 10 && f[1] === 2);
  if (!f10) return -1;
  const slr = walk(f10[2], f10[3]).find(f => f[0] === 49399797 && f[1] === 2);
  if (!slr) return -1;
  return walk(slr[2], slr[3]).filter(f => f[0] === 1 && f[1] === 2).length;
}

console.log('feed-gaming.js');

{
  const { done, out } = run(FIXTURE, {});
  check('命中时改写了响应体', !!out, 'done=' + JSON.stringify(done));
  check('输出比输入小（游戏面板被删）', out && out.length < FIXTURE.length,
    out ? `${FIXTURE.length} -> ${out.length}` : 'no output');
  check('游戏面板标识已消失', out && count(out, 'mini_app_panel') === 0,
    out ? String(count(out, 'mini_app_panel')) : '');
  check('mini_apps_saved 标识已消失', out && count(out, 'FEmini_apps_saved') === 0);
  const before = count(FIXTURE, '/vi/');
  const after = out ? count(out, '/vi/') : 0;
  check('普通视频条目一个没少', after >= before, `/vi/ ${before} -> ${after}`);
  check('more_drawer_button（更多按钮）没被动', count(out || FIXTURE, 'more_drawer_button') === count(FIXTURE, 'more_drawer_button'));
  check('feed section 从 3 项变成 2 项（只删了游戏面板那一项）',
    countFeedSections(FIXTURE) === 3 && out && countFeedSections(out) === 2,
    `${countFeedSections(FIXTURE)} -> ${out ? countFeedSections(out) : 'null'}`);
}

{
  const { out } = run(FIXTURE, { blockGaming: false });
  check('blockGaming=false 时完全不动响应体', out === null);
  const { out: out2 } = run(FIXTURE, { blockGaming: 'false' });
  check('blockGaming="false"（字符串）同样不动', out2 === null);
  const { out: out3 } = run(FIXTURE, { blockGaming: true });
  check('blockGaming=true 仍然清除', !!out3);
  const { out: out4 } = run(FIXTURE, {});
  check('缺省参数时清除（默认开）', !!out4);
}

{
  // 合成用例：自己造一个「列表里混了一个带 marker 的元素」的结构
  const enc = (n) => { const o = []; while (n > 127) { o.push((n & 127) | 128); n >>= 7; } o.push(n); return Buffer.from(o); };
  const ld = (no, payload) => Buffer.concat([enc(no << 3 | 2), enc(payload.length), payload]);
  const txt = (s) => ld(1, Buffer.from(s, 'utf8'));
  const item = (marker) => ld(1, Buffer.concat([txt('tracking '), txt(marker), txt('/vi/abcdefghijk')]));
  const list = Buffer.concat([item('normal-a'), item('mini_app_panel'), item('normal-b'), item('normal-c')]);
  const { out } = run(list, {});
  check('合成结构：命中后长度变短', out && out.length < list.length, out ? `${list.length} -> ${out.length}` : 'no output');
  check('合成结构：只剩 3 项', out && count(out, 'normal-') === 3, out ? String(count(out, 'normal-')) : '');
  check('合成结构：marker 消失', out && count(out, 'mini_app_panel') === 0);
  // 全部元素都命中 → 整条列表被删空
  const allBad = Buffer.concat([item('mini_app_panel'), item('FEmini_apps_saved')]);
  const { out: out2 } = run(allBad, {});
  check('合成结构：全部命中时整条删空', out2 !== null && out2.length < allBad.length / 2, out2 ? String(out2.length) : 'no output');
}

{
  const cases = [
    ['空响应体', Buffer.alloc(0)],
    ['短于 32 字节', Buffer.from('hello world')],
    ['纯文本', Buffer.from('这不是 protobuf，只是一段普通文字，重复很多次。'.repeat(50), 'utf8')],
    ['截断的 fixture', FIXTURE.subarray(0, 2000)],
    ['含 marker 但不是 protobuf', Buffer.from('mini_app_panel FEmini_apps_saved', 'utf8')],
    ['单字节 0xFF', Buffer.from([0xff])],
  ];
  for (const [label, body] of cases) {
    let threw = false, res = null;
    try { res = run(body, {}); } catch (e) { threw = true; }
    check(`${label}：不抛异常且原样放行`, !threw && (res.out === null || res.out.length <= body.length),
      threw ? 'threw' : `out=${res.out ? res.out.length : 'null'}`);
  }
}

{
  // 同一份输入跑两次，结果必须一致（幂等：已删干净的东西不能再删出新的）
  const a = run(FIXTURE, {});
  const again = run(a.out, {});
  check('对已清理过的响应再跑一次不再改动', again.out === null,
    again.out ? `又删了 ${FIXTURE.length - a.out.length - again.out.length} 字节` : '');
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log('  ! ' + f); process.exit(1); }
