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
  // v5.7 起 blockGaming 只管游戏大本营，广告过滤由 blockAds 独立控制。
  // 关掉 blockGaming 时游戏模块必须留下，但广告照拦。
  const e2 = (n) => { const o = []; while (n > 127) { o.push((n & 127) | 128); n = n >> 7; } o.push(n); return Buffer.from(o); };
  const l2 = (no, p) => Buffer.concat([e2(no << 3 | 2), e2(p.length), p]);
  const t2 = (s) => l2(1, Buffer.from(s, 'utf8'));
  const adItem = l2(1, Buffer.concat([t2('/vi/adcreative123456'), t2('https://www.googleadservices.com/pagead/aclk?sa=L')]));
  const gameItem = l2(1, Buffer.concat([t2('/vi/normalvideoxyz1'), t2('mini_app_panel')]));
  const plainItem = l2(1, Buffer.concat([t2('/vi/normalvideoabc1'), t2('theme|a3941584')]));
  const feed2 = Buffer.concat([adItem, gameItem, plainItem]);

  const both = run(feed2, { blockGaming: true, blockAds: true });
  check('默认：广告与游戏模块都删掉',
    both.out !== null && count(both.out, '/vi/') === 1, both.out ? `剩 ${count(both.out, '/vi/')} 项` : '未改动');

  const noGame = run(feed2, { blockGaming: false, blockAds: true });
  check('blockGaming=false：游戏模块保留、广告照删',
    noGame.out !== null && count(noGame.out, 'mini_app_panel') === 1 && count(noGame.out, 'pagead') === 0,
    noGame.out ? `panel x${count(noGame.out, 'mini_app_panel')} pagead x${count(noGame.out, 'pagead')}` : '未改动');

  const noAd = run(feed2, { blockGaming: true, blockAds: false });
  check('blockAds=false：广告保留、游戏模块照删',
    noAd.out !== null && count(noAd.out, '/vi/adcreative123456') === 1 && count(noAd.out, 'mini_app_panel') === 0,
    noAd.out ? `ad x${count(noAd.out, '/vi/adcreative123456')} panel x${count(noAd.out, 'mini_app_panel')}` : '未改动');

  const off = run(FIXTURE, { blockGaming: false, blockAds: false });
  check('两个开关都关：完全不动响应体', off.out === null);
  const offStr = run(FIXTURE, { blockGaming: 'false', blockAds: 'false' });
  check('两个开关用字符串 "false"：同样不动', offStr.out === null);
  const on = run(FIXTURE, {});
  check('缺省参数：照常清除（默认都开）', !!on.out);
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
  // 全部元素都命中 → 整条列表被删空。
  // 但「整条响应都空了」是另一回事：那时必须原样放行，不能下发空 body（见后面那个用例）。
  const allBad = Buffer.concat([item('mini_app_panel'), item('FEmini_apps_saved')]);
  const { out: out2 } = run(allBad, {});
  check('合成结构：全部命中时不下发空 body', out2 === null || out2.length > 0,
    out2 ? `${allBad.length} -> ${out2.length}` : '已原样放行');
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

{
  // 2026-09-29 第三份抓包（HAR3 #42）暴露的新形态：
  // 面板容器本身是「单例」字段，里面套一个 12 项的重复列表，每一项各带一次 marker。
  // 正确行为是 12 项全删 → 容器空 → 容器也跟着删（收敛），而不是只删掉最外层那一项。
  const enc = (n) => { const o = []; while (n > 127) { o.push((n & 127) | 128); n = n >> 7; } o.push(n); return Buffer.from(o); };
  const ld = (no, payload) => Buffer.concat([enc(no << 3 | 2), enc(payload.length), payload]);
  const txt = (s) => ld(1, Buffer.from(s, 'utf8'));
  const leaf = (marker) => ld(1, Buffer.concat([txt('capabilities|3ce02e49007505cd'), txt(marker), txt('theme|a3941584009a2c54')]));
  const panel = ld(1, Buffer.concat([
    ld(2, Buffer.concat([txt('theme|a3941584009a2c54'), txt('mini_app_panel')])),
    ld(3, Buffer.concat(Array.from({ length: 12 }, () => leaf('mini_app_panel')))),
  ]));
  const feed = Buffer.concat([ld(1, txt('/vi/real-video-one')), panel, ld(1, txt('/vi/real-video-two'))]);
  const r = run(feed, {});
  check('嵌套形态：12 项全删后容器收敛', r.out !== null && count(r.out, 'mini_app_panel') === 0,
    r.out ? `panel x${count(r.out, 'mini_app_panel')}` : 'no output');
  check('嵌套形态：普通视频仍在', r.out && count(r.out, '/vi/') === 2, r.out ? String(count(r.out, '/vi/')) : '');
}

{
  // 2026-09-29 第三份抓包里，清除后**故意保留**的那一项：
  // 一个普通视频卡，模板清单里恰好列了 mini_game_card / mini_app_splash_screen /
  // more_drawer_button / channel_action_buttons_phone。
  // 它长得像游戏卡但绝不能删 —— 删了就是从首页拿掉一个正常视频。
  // 这是本脚本最关键的一条「不许误伤」回归。
  const enc = (n) => { const o = []; while (n > 127) { o.push((n & 127) | 128); n = n >> 7; } o.push(n); return Buffer.from(o); };
  const ld = (no, payload) => Buffer.concat([enc(no << 3 | 2), enc(payload.length), payload]);
  const txt = (s) => ld(1, Buffer.from(s, 'utf8'));
  const templates = [
    'chip_bar_collection_with_controller.eml-fe|175bb0ee37bf288c',
    'mini_app_game_info.eml-fe|3c4823c6c7def44f',
    'mini_app_splash_screen.eml-fe|bd126ea7076d092f',
    '%mini_game_card.eml-fe|998e208b2b3ddc1',
    '*more_drawer_button.eml-fe|f8bc3d9f67dab8ec',
    '7channel_action_buttons_phone.eml-js-fe|fd1b03038226fb81',
  ];
  const normalCard = ld(1, Buffer.concat([txt('/vi/abcdefghijklmn'), txt(templates.join(' '))]));
  const gamingCard = ld(1, Buffer.concat([txt('/vi/zzzzzzzzzzzzzz'), txt('mini_app_panel')]));
  const feed = Buffer.concat([normalCard, gamingCard, ld(1, txt('/vi/qqqqqqqqqqqqqqq'))]);
  const r = run(feed, {});
  check('误伤防护：只带游戏模板名的普通视频卡必须保留',
    r.out !== null && count(r.out, '/vi/abcdefghijklmn') === 1, r.out ? String(count(r.out, '/vi/abcdefghijklmn')) : 'no output');
  check('误伤防护：该卡里的 mini_game_card 字符串不能作为删除依据',
    r.out !== null && count(r.out, 'mini_game_card') === 1, r.out ? String(count(r.out, 'mini_game_card')) : '');
  check('误伤防护：订阅按钮 / 更多按钮没被连带删掉',
    r.out !== null && count(r.out, 'channel_action_buttons_phone') === 1 && count(r.out, 'more_drawer_button') === 1);
  check('误伤防护：真正的游戏卡还是被删了', r.out !== null && count(r.out, '/vi/') === 2,
    r.out ? String(count(r.out, '/vi/')) : '');
}

{
  // 整条响应都是游戏内容时，输出会变成 0 字节。
  // 绝不能把空 body 发给 App（会直接报错），必须放弃改写、原样放行。
  const enc = (n) => { const o = []; while (n > 127) { o.push((n & 127) | 128); n = n >> 7; } o.push(n); return Buffer.from(o); };
  const ld = (no, payload) => Buffer.concat([enc(no << 3 | 2), enc(payload.length), payload]);
  const txt = (s) => ld(1, Buffer.from(s, 'utf8'));
  const allGaming = Buffer.concat([
    ld(1, Buffer.concat([txt('theme|a3941584009a2c54'), txt('mini_app_panel')])),
    ld(1, Buffer.concat([txt('/vi/only-gaming-a'), txt('FEmini_apps_saved')])),
    ld(1, Buffer.concat([txt('/vi/only-gaming-b'), txt('mini_app_panel')])),
  ]);
  const r = run(allGaming, {});
  check('全游戏内容：不下发空 body，改为原样放行', r.out === null,
    r.out ? '下发了 ' + r.out.length + ' 字节' : '');
}

{
  // next（信息流续页）里的广告 pod 是**单例**顶层字段，不是重复列表项：
  // 顶层字段 15 含 pagead/aclk 但 /vi/ 为 0 → 删；
  // 顶层字段 14 也带 aclk，但有真实视频 ID → 必须留着。
  const e3 = (n) => { const o = []; while (n > 127) { o.push((n & 127) | 128); n = n >> 7; } o.push(n); return Buffer.from(o); };
  const l3 = (no, p) => Buffer.concat([e3(no << 3 | 2), e3(p.length), p]);
  const t3 = (s) => l3(1, Buffer.from(s, 'utf8'));
  const adPod = l3(15, Buffer.concat([t3('https://www.googleadservices.com/pagead/aclk?sa=L'), t3('theme|a3941584')]));
  const realRec = l3(14, Buffer.concat([t3('/vi/h-QZhYu3eBYabc'), t3('https://www.googleadservices.com/pagead/aclk?sa=L')]));
  const cont = l3(777, t3('continuation-token-here'));
  const feed3 = Buffer.concat([realRec, adPod, cont]);

  const r3 = run(feed3, { blockGaming: true, blockAds: true });
  check('单例广告 pod：有 pagead 且无视频 → 删', r3.out !== null && count(r3.out, 'pagead') === 1,
    r3.out ? `剩 pagead x${count(r3.out, 'pagead')}` : '未改动');
  check('单例广告 pod：带真实视频的那项必须留下',
    r3.out !== null && count(r3.out, '/vi/h-QZhYu3eBYabc') === 1, r3.out ? String(count(r3.out, '/vi/h-QZhYu3eBYabc')) : '');
  check('单例广告 pod：续页 token 不受影响',
    r3.out !== null && count(r3.out, 'continuation-token-here') === 1);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log('  ! ' + f); process.exit(1); }
