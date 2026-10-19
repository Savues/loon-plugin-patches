/*
 * 回放验证器：运行 splash-poc.js。
 *
 * 无参数：跑内置用例（默认，CI 用）——覆盖中文标签 / 英文键 / block / 双端选图。
 * 传 HAR 路径：额外用 HAR 里的真实 brand/list 响应跑一遍。
 *
 * 重要：脚本抛异常（如 TDZ ReferenceError）时必须报 FAIL——
 * 生产环境里脚本崩溃 = Loon 放行原响应 = 插件静默失效。
 */
import { readFileSync } from 'fs';
import vm from 'vm';

const scriptPath = new URL('./splash-poc.js', import.meta.url).pathname;
const code = readFileSync(scriptPath, 'utf-8');

// 最小 brand/list 响应：list 覆盖所有会用到的 id
const IDS = [10, 12, 13, 14, 15, 17, 31, 32, 33, 34, 35, 36, 37, 38, 41, 43, 44, 45, 46, 47, 67, 145];
// 模拟服务端真实响应。非节日是 {forcibly:false, rule:"", preload:[], force_show_times:0}；
// 节日当天会变成 {forcibly:true, rule:"order", preload:[{...}], force_show_times:3}。
// 默认带上 preload / force_show_times，用来守住 v36 修的两个坑。
function makeResp(over = {}) {
  return JSON.stringify({
    code: 0,
    data: Object.assign({
      list: IDS.map(id => ({
        id, thumb: 'orig_' + id, thumb_name: 'orig', thumb_hash: 'orig', mode: 'half',
        logo_hash: 'lh' + id, show_logo: true
      })),
      show: [],
      preload: [{ forcibly: true, rule: 'order',
                  show: [{ id: 145, begin_time: 1, end_time: 9999999999 }], list: [] }],
      force_show_times: 3,
      rule: ''
    }, over)
  });
}

const PHONE = 'https://app.bilibili.com/x/v2/splash/brand/list?appkey=1d8b6e7d45233436&device=phone';
const IPAD = 'https://app.bilibili.com/x/v2/splash/brand/list?appkey=5fd5a7d8bfd9b0e6&device=pad';

let failures = 0;

function run(label, argument, url, expect, respBody, extra) {
  let done = null, error = null;
  const sandbox = {
    $argument: argument,
    $request: { url: url || PHONE },
    $response: { body: respBody || makeResp() },
    $done: (r) => { done = r; },
    ...(extra || {})
  };
  vm.createContext(sandbox);
  try {
    vm.runInContext(`(function(){
${code}
})();`, sandbox, { filename: 'splash-poc.js' });
  } catch (e) { error = e; }

  if (error) {
    failures++;
    console.log(`❌ ${label}: 脚本抛异常 -> ${error.message}`);
    return;
  }
  if (!done || !done.body) {
    failures++;
    console.log(`❌ ${label}: $done 未被调用或未返回 body（插件会静默失效）`);
    return;
  }
  let j;
  try { j = JSON.parse(done.body); } catch (e) {
    failures++;
    console.log(`❌ ${label}: 返回的 body 不是合法 JSON`);
    return;
  }
  const [ok, msg] = expect(j);
  if (ok) console.log(`✅ ${label}: ${msg}`);
  else { failures++; console.log(`❌ ${label}: ${msg}`); }
}

// 脚本里 vendored 的所有素材文件名 —— 用来断言「随机/轮换」的池子没跑出界
const SCRIPT_FILES = [...code.matchAll(/file:\s*"([^"]+)"/g)].map(m => m[1]);

const thumbOf = (j, id) => (j.data.list.find(x => x.id === id) || {}).thumb || '';
const endsWith = (s, suf) => s.endsWith(suf);
const showIds = (j) => (j.data.show || []).map(x => x.id).join(',');

// —— 中文标签（v31 的 [Argument] 值）——
run('中文标签 2026五一 → 历史皮肤 labor26', { festival: '2026五一' }, PHONE, (j) => {
  const t = thumbOf(j, 14);
  return [endsWith(t, 'labor26.webp') && showIds(j) === '14',
    `id14.thumb=${t.split('/').pop()} show=[${showIds(j)}]`];
});

run('中文标签 中秋节 → 官方 38（手机竖图）', { festival: '中秋节' }, PHONE, (j) => {
  const t = thumbOf(j, 14);
  return [endsWith(t, '38_phone.webp') && showIds(j) === '14',
    `id38.thumb=${t.split('/').pop()} show=[${showIds(j)}]`];
});

run('中文标签 中秋节 → 官方 38（iPad 横图）', { festival: '中秋节' }, IPAD, (j) => {
  const t = thumbOf(j, 14);
  return [endsWith(t, '38_pad.webp'), `id38.thumb=${t.split('/').pop()}`];
});

run('中文标签 重阳节 → 官方 145（手机竖图）', { festival: '重阳节' }, PHONE, (j) => {
  const t = thumbOf(j, 14);
  return [endsWith(t, '145_phone.webp') && showIds(j) === '14',
    `id145.thumb=${t.split('/').pop()} show=[${showIds(j)}]`];
});

run('中文标签 屏蔽开屏 → show 清空', { festival: '屏蔽开屏' }, PHONE, (j) => {
  return [(j.data.show || []).length === 0, `show=[${showIds(j)}]`];
});

run('中文标签 2026五一 + 屏蔽开屏 都是历史/block 分支互不串味', { festival: '2026端午节' }, PHONE, (j) => {
  const t = thumbOf(j, 14);
  return [endsWith(t, 'duanwu26.webp'), `id14.thumb=${t.split('/').pop()}`];
});

// —— 英文键（向后兼容：老配置里存的仍是英文键）——
run('英文键 gaokao24 → 历史皮肤', { festival: 'gaokao24' }, PHONE, (j) => {
  const t = thumbOf(j, 14);
  return [endsWith(t, 'gaokao24.webp'), `id14.thumb=${t.split('/').pop()}`];
});

run('英文键 midautumn → 官方 38', { festival: 'midautumn' }, PHONE, (j) => {
  return [endsWith(thumbOf(j, 14), '38_phone.webp'), `show=[${showIds(j)}]`];
});

// —— 历史配置格式兼容（v29/v30 残留值）——
run('v30 格式 "官方-中秋节=midautumn" → 38', { festival: '官方-中秋节=midautumn' }, PHONE, (j) => {
  return [showIds(j) === '14', `show=[${showIds(j)}]`];
});

run('v30 格式 "官方-2026五一=labor26" → 历史 labor26', { festival: '官方-2026五一=labor26' }, PHONE, (j) => {
  return [endsWith(thumbOf(j, 14), 'labor26.webp'), `id14.thumb=${thumbOf(j, 14).split('/').pop()}`];
});

run('v29 格式 "官方_midautumn" → 38', { festival: '官方_midautumn' }, PHONE, (j) => {
  return [showIds(j) === '14', `show=[${showIds(j)}]`];
});

// —— 新增 2023/2024 历史皮肤 ——
run('2023端午节', { festival: '2023端午节' }, PHONE, (j) => [endsWith(thumbOf(j, 14), 'duanwu23.webp'), `id14.thumb=${thumbOf(j,14).split("/").pop()}`]);
run('2023暑假过半', { festival: '2023暑假过半' }, PHONE, (j) => [endsWith(thumbOf(j, 14), 'summer23.webp'), `id14.thumb=${thumbOf(j,14).split("/").pop()}`]);
run('2023七夕节', { festival: '2023七夕节' }, PHONE, (j) => [endsWith(thumbOf(j, 14), 'qixi23a.webp'), `id14.thumb=${thumbOf(j,14).split("/").pop()}`]);
run('2023中秋节', { festival: '2023中秋节' }, PHONE, (j) => [endsWith(thumbOf(j, 14), 'midautumn23.webp'), `id14.thumb=${thumbOf(j,14).split("/").pop()}`]);
run('2023万圣节款式一', { festival: '2023万圣节款式一' }, PHONE, (j) => [endsWith(thumbOf(j, 14), 'halloween23a.webp'), `id14.thumb=${thumbOf(j,14).split("/").pop()}`]);
run('2023跨年', { festival: '2023跨年' }, PHONE, (j) => [endsWith(thumbOf(j, 14), 'yuandan23.webp'), `id14.thumb=${thumbOf(j,14).split("/").pop()}`]);
run('2024春节-款式一', { festival: '2024春节-款式一' }, PHONE, (j) => [endsWith(thumbOf(j, 14), 'cj24a.webp'), `id14.thumb=${thumbOf(j,14).split("/").pop()}`]);
run('2024元宵节', { festival: '2024元宵节' }, PHONE, (j) => [endsWith(thumbOf(j, 14), 'yx24.webp'), `id14.thumb=${thumbOf(j,14).split("/").pop()}`]);
run('2024妇女节', { festival: '2024妇女节' }, PHONE, (j) => [endsWith(thumbOf(j, 14), 'women24.webp'), `id14.thumb=${thumbOf(j,14).split("/").pop()}`]);
run('2024清明', { festival: '2024清明' }, PHONE, (j) => [endsWith(thumbOf(j, 14), 'qm24.webp'), `id14.thumb=${thumbOf(j,14).split("/").pop()}`]);
run('2024劳动节', { festival: '2024劳动节' }, PHONE, (j) => [endsWith(thumbOf(j, 14), 'labor24.webp'), `id14.thumb=${thumbOf(j,14).split("/").pop()}`]);

// —— 已移除选项的旧配置兼容 ——
run('旧配置 "2025国际劳动节"（已移除）仍显示劳动节图', { festival: '2025国际劳动节' }, PHONE, (j) => {
  return [endsWith(thumbOf(j, 14), 'labor25.webp'), `id14.thumb=${thumbOf(j, 14).split('/').pop()}`];
});

run('旧配置 "官方-2025国际劳动节=labor25b"（已移除）→ 劳动节图', { festival: '官方-2025国际劳动节=labor25b' }, PHONE, (j) => {
  return [endsWith(thumbOf(j, 14), 'labor25.webp'), `id14.thumb=${thumbOf(j, 14).split('/').pop()}`];
});

// —— 已移除选项不应再作为独立皮肤 ——
run('labor25b 不再是独立皮肤（显示与 labor25 同一文件）',
  { festival: 'labor25b' }, PHONE, (j) => {
    return [endsWith(thumbOf(j, 14), 'labor25.webp'), `id14.thumb=${thumbOf(j, 14).split('/').pop()}`];
});

// —— 显示模式开关 ——
run('splashMode=half 覆盖官方 mode', { festival: '中秋节', splashMode: 'half' }, PHONE, (j) => {
  const it = j.data.list.find(x => x.id === 14) || {};
  return [it.mode === 'half', `id38.mode=${it.mode}`];
});

run('imgMode=landscape 强制横图', { festival: '中秋节', imgMode: 'landscape' }, PHONE, (j) => {
  return [endsWith(thumbOf(j, 14), '38_pad.webp'), `id38.thumb=${thumbOf(j, 14).split('/').pop()}`];
});

// —— 未知值兜底 ——
run('未知 festival → 兜底 midautumn(38)', { festival: '不存在的皮肤' }, PHONE, (j) => {
  return [showIds(j) === '14', `show=[${showIds(j)}]`];
});

// —— v35.3 门控字段（反汇编 BFCBrandSplashDispatcher 得出）——
// 客户端要求 [list forcibly] 为真 且 selectList 非空，否则完全忽略 show。
run('forcibly 被置为 true', { festival: '中秋节' }, PHONE, (j) => {
  return [j.data.forcibly === true, `forcibly=${j.data.forcibly}`];
});

run('select_show_list 非空且指向载体 id=14', { festival: '中秋节' }, PHONE, (j) => {
  const s = j.data.select_show_list;
  const ok = Array.isArray(s) && s.length > 0 && String(s[0].id) === '14';
  return [ok, `select_show_list=${JSON.stringify(s)}`];
});

run('selectList 非空（type-2 分支兜底）', { festival: '中秋节' }, PHONE, (j) => {
  const s = j.data.selectList;
  return [Array.isArray(s) && s.length > 0 && s[0].thumb_hash, `selectList.length=${(s || []).length}`];
});

run('show 条目带 splash_id（模型字段名）', { festival: '中秋节' }, PHONE, (j) => {
  const s = (j.data.show || [])[0] || {};
  return [s.splash_id === '14' && s.id === 14, `id=${s.id} splash_id=${s.splash_id}`];
});

run('show 时间窗覆盖当前时间 ±7 天', { festival: '中秋节' }, PHONE, (j) => {
  const s = (j.data.show || [])[0] || {};
  const now = Math.floor(Date.now() / 1000);
  const ok = s.begin_time <= now && now <= s.end_time && (s.end_time - s.begin_time) === 14 * 86400;
  return [ok, `begin=${s.begin_time} end=${s.end_time}`];
});

run('载体条目补上 splash_id', { festival: '中秋节' }, PHONE, (j) => {
  const it = j.data.list.find(x => x.id === 14) || {};
  return [it.splash_id === '14', `splash_id=${it.splash_id}`];
});

run('block 模式只清 show，不残留旧皮肤', { festival: '屏蔽开屏' }, PHONE, (j) => {
  const t = thumbOf(j, 14);
  return [(j.data.show || []).length === 0 && t === 'orig_14', `show=[] thumb=${t}`];
});

// —— v36：preload / force_show_times（反汇编 + HAR 实证的两个坑）——
run('preload 被清空（否则客户端改用 preload 条目，注入被官方节日皮肤顶掉）',
  { festival: '中秋节' }, PHONE, (j) => {
    return [(j.data.preload || []).length === 0, `preload.length=${(j.data.preload || []).length}`];
  });

run('force_show_times 被置 0（否则注入条目只能展示 3 次）',
  { festival: '中秋节' }, PHONE, (j) => {
    return [j.data.force_show_times === 0, `force_show_times=${j.data.force_show_times}`];
  });

// —— v36：载体三级兜底 ——
run('载体 id=14 缺失 → 回退到第一条 half 条目',
  { festival: '中秋节' }, PHONE, (j) => {
    const it = j.data.list.find(x => (x.thumb || '').endsWith('38_phone.webp'));
    return [!!it && it.id === 10, `回退到 id=${it && it.id}`];
  }, makeResp({ list: [10, 17, 34].map(id => ({
      id, thumb: 'orig_' + id, thumb_name: 'orig', thumb_hash: 'orig', mode: 'half', logo_hash: 'lh' + id
    })) }));

run('list 里没有 half 条目 → 回退到第一条',
  { festival: '中秋节' }, PHONE, (j) => {
    const it = j.data.list.find(x => (x.thumb || '').endsWith('38_phone.webp'));
    return [!!it && it.id === 17, `回退到 id=${it && it.id}`];
  }, makeResp({ list: [
      { id: 17, thumb: 'orig_17', thumb_name: 'orig', thumb_hash: 'orig', mode: 'full' },
      { id: 34, thumb: 'orig_34', thumb_name: 'orig', thumb_hash: 'orig', mode: 'full' }
    ] }));

run('list 为空 → 追加合成载体条目',
  { festival: '中秋节' }, PHONE, (j) => {
    const it = j.data.list.find(x => x.id === 14);
    return [!!it && /38_phone\.webp$/.test(it.thumb || ''), `list.length=${j.data.list.length}`];
  }, makeResp({ list: [] }));

// —— v37：自动节日 / 轮换 / 随机 ——
// 固定「现在」：无参的 new Date() / Date.now() 返回 fixed，带参的 new Date(y,m,d) 仍是真实日期
// （脚本里 __lLunar2solar 要 new Date(1900,0,31) / new Date(y,m-1,d)，不能一起被冻住）
function mkNow(y, mo, d) {
  const fixed = new Date(y, mo, d).getTime();
  const F = function () {
    const a = arguments;
    if (a.length === 0) return new Date(fixed);
    switch (a.length) {
      case 1: return new Date(a[0]);
      case 3: return new Date(a[0], a[1], a[2]);
      case 7: return new Date(a[0], a[1], a[2], a[3], a[4], a[5], a[6]);
      default: return new Date(a[0], a[1]);
    }
  };
  F.now = () => fixed; F.parse = Date.parse; F.UTC = Date.UTC;
  F.prototype = Date.prototype;
  return F;
}
const ROTATE_MEM = {};
// ⚠️ Loon / Surge 的 $persistentStore 是 read(key) / write(value, key) —— 值在前、键在后。
// 这个顺序写反过一次（v37 首版），导致 read 永远 null、轮换卡在池子第一个。
const mockStore = () => ({
  read: (k) => (k in ROTATE_MEM ? ROTATE_MEM[k] : null),
  write: (v, k) => { ROTATE_MEM[k] = v; }
});
// 模拟「$persistentStore 不可用」：写进去读不回来
const brokenStore = () => ({ read: () => null, write: () => {} });

// 官方池（ROTATE_OFFICIAL = Object.keys(FESTIVALS)）在手机端的 22 个文件名
// 半透明池的 8 张图（实测像素 70–82% 透明，服务端 mode 全是 half）
const TRANSPARENT_FILES = ['10.png','12.png','13.png','14.png','15.png','17.png','36.webp','37.webp'];

const OFFICIAL_PHONE = ['31_phone.jpg','32_phone.jpg','33_phone.jpg','34_phone.webp','35_phone.jpg',
  '38_phone.webp','41_phone.webp','43_phone.webp','44_phone.webp','45_phone.jpg','46_phone.webp',
  '47_phone.webp','67_phone.webp','145_phone.webp','10.png','12.png','13.png','14.png','15.png',
  '17.png','36.webp','37.webp'];

run('自动节日 · 重阳节当天(2026-10-18) → 官方 chongyang(145)',
  { festival: '自动节日' }, PHONE, (j) => {
    const t = thumbOf(j, 14);
    return [endsWith(t, '145_phone.webp'), `id14.thumb=${t.split('/').pop()}`];
  }, null, { Date: mkNow(2026, 9, 18) });

run('自动节日 · 中秋节(2026-09-25) → 历史 midautumn26',
  { festival: '自动节日' }, PHONE, (j) => {
    const t = thumbOf(j, 14);
    return [endsWith(t, 'midautumn26.webp'), `id14.thumb=${t.split('/').pop()}`];
  }, null, { Date: mkNow(2026, 8, 25) });

run('自动节日 · 劳动节(2026-05-01) → 历史 labor26',
  { festival: '自动节日' }, PHONE, (j) => {
    const t = thumbOf(j, 14);
    return [endsWith(t, 'labor26.webp'), `id14.thumb=${t.split('/').pop()}`];
  }, null, { Date: mkNow(2026, 4, 1) });

run('自动节日 · 元宵节(2024-02-24) → 历史 yx24',
  { festival: '自动节日' }, PHONE, (j) => {
    const t = thumbOf(j, 14);
    return [endsWith(t, 'yx24.webp'), `id14.thumb=${t.split('/').pop()}`];
  }, null, { Date: mkNow(2024, 1, 24) });

run('自动节日 · 清明节(2025-04-04) → 历史 qm25',
  { festival: '自动节日' }, PHONE, (j) => {
    const t = thumbOf(j, 14);
    return [endsWith(t, 'qm25.webp'), `id14.thumb=${t.split('/').pop()}`];
  }, null, { Date: mkNow(2025, 3, 4) });

run('自动节日 · 非节日日(2026-03-15) → 不干预，原样放行',
  { festival: '自动节日' }, PHONE, (j) => {
    return [(j.data.show || []).length === 0 && j.data.forcibly !== true && thumbOf(j, 14) === 'orig_14',
      `show=[${showIds(j)}] forcibly=${j.data.forcibly} thumb=${thumbOf(j, 14)}`];
  }, null, { Date: mkNow(2026, 2, 15) });

run('轮换 · 首次取官方池第一个(midautumn)',
  { festival: '轮换' }, PHONE, (j) => {
    const t = thumbOf(j, 14);
    return [endsWith(t, '38_phone.webp'), `id14.thumb=${t.split('/').pop()}`];
  }, null, { Date: mkNow(2026, 9, 18), $persistentStore: mockStore() });

run('轮换 · 第二次取第二个(chongyang)，计数器生效',
  { festival: '轮换' }, PHONE, (j) => {
    const t = thumbOf(j, 14);
    return [endsWith(t, '145_phone.webp'), `id14.thumb=${t.split('/').pop()}`];
  }, null, { Date: mkNow(2026, 9, 18), $persistentStore: mockStore() });

run('轮换 · 第三次取第三个(yuandan)',
  { festival: '轮换' }, PHONE, (j) => {
    const t = thumbOf(j, 14);
    return [endsWith(t, '34_phone.webp'), `id14.thumb=${t.split('/').pop()}`];
  }, null, { Date: mkNow(2026, 9, 18), $persistentStore: mockStore() });

// 先探一次：拿到兜底（按天）在第 1 天的结果，供「隔天会换」用例比较
let DAY1_THUMB = '';
{
  let d = null;
  const sb = { $argument: { festival: '轮换' }, $request: { url: PHONE }, $response: { body: makeResp() },
               $done: (r) => { d = r; }, Date: mkNow(2026, 9, 18), $persistentStore: brokenStore() };
  vm.createContext(sb);
  vm.runInContext(`(function(){\n${code}\n})();`, sb, { filename: 'splash-poc.js' });
  DAY1_THUMB = JSON.parse(d.body).data.list.find(x => x.id === 14).thumb.split('/').pop();
}

run('轮换 · $persistentStore 不可用 → 兜底按天轮换，仍落在官方池内',
  { festival: '轮换' }, PHONE, (j) => {
    const t = thumbOf(j, 14).split('/').pop();
    return [OFFICIAL_PHONE.includes(t), `id14.thumb=${t}`];
  }, null, { Date: mkNow(2026, 9, 18), $persistentStore: brokenStore() });

run('轮换 · $persistentStore 不可用时，隔天会换一张（不会永远卡同一张）',
  { festival: '轮换' }, PHONE, (j) => {
    const t = thumbOf(j, 14).split('/').pop();
    return [OFFICIAL_PHONE.includes(t) && t !== DAY1_THUMB, `第2天=${t} 第1天=${DAY1_THUMB}`];
  }, null, { Date: mkNow(2026, 9, 19), $persistentStore: brokenStore() });

run('随机 · 结果必落在官方池 22 个之内',
  { festival: '随机' }, PHONE, (j) => {
    const t = thumbOf(j, 14).split('/').pop();
    return [OFFICIAL_PHONE.includes(t), `id14.thumb=${t}`];
  }, null, { Date: mkNow(2026, 9, 18), $persistentStore: mockStore() });

run('随机·全部 · 结果必落在 75 个皮肤素材之内',
  { festival: '随机·全部' }, PHONE, (j) => {
    const t = thumbOf(j, 14).split('/').pop();
    return [SCRIPT_FILES.includes(t), `id14.thumb=${t}`];
  }, null, { Date: mkNow(2026, 9, 18), $persistentStore: mockStore() });

// 前面的轮换用例已经把共享计数器推进过，这里重置后再断言顺序
const freshStore = () => { for (const k of Object.keys(ROTATE_MEM)) delete ROTATE_MEM[k]; return mockStore(); };

run('轮换·半透明 · 首次取半透明池第一个(2233a)',
  { festival: '轮换·半透明' }, PHONE, (j) => {
    const t = thumbOf(j, 14).split('/').pop();
    return [t === '14.png', `id14.thumb=${t}`];
  }, null, { Date: mkNow(2026, 9, 18), $persistentStore: freshStore() });

run('轮换·半透明 · 第二次取第二个(2233b)，计数器接着走',
  { festival: '轮换·半透明' }, PHONE, (j) => {
    const t = thumbOf(j, 14).split('/').pop();
    return [t === '15.png', `id14.thumb=${t}`];
  }, null, { Date: mkNow(2026, 9, 18), $persistentStore: mockStore() });

// —— v39：logo 开关 / 显示时长 ——
run('logo=隐藏 → list 条目与 show 条目的 show_logo 都为 false',
  { festival: '中秋节', logo: '隐藏' }, PHONE, (j) => {
    const it = j.data.list.find(x => x.id === 14) || {};
    const sh = (j.data.show || [])[0] || {};
    return [it.show_logo === false && sh.show_logo === false,
      `list=${it.show_logo} show=${sh.show_logo}`];
  });

run('logo=官方（默认）→ 不动 show_logo',
  { festival: '中秋节' }, PHONE, (j) => {
    const it = j.data.list.find(x => x.id === 14) || {};
    const sh = (j.data.show || [])[0] || {};
    return [it.show_logo === true && sh.show_logo === true,
      `list=${it.show_logo} show=${sh.show_logo}`];
  });

run('duration=3秒 → list 与 show 都是 3000',
  { festival: '中秋节', duration: '3秒' }, PHONE, (j) => {
    const it = j.data.list.find(x => x.id === 14) || {};
    const sh = (j.data.show || [])[0] || {};
    return [it.duration === 3000 && sh.duration === 3000,
      `list=${it.duration} show=${sh.duration}`];
  });

run('duration=官方（默认）→ list 不带 duration、show 保持 1000',
  { festival: '中秋节' }, PHONE, (j) => {
    const it = j.data.list.find(x => x.id === 14) || {};
    const sh = (j.data.show || [])[0] || {};
    return [it.duration === undefined && sh.duration === 1000,
      `list=${it.duration} show=${sh.duration}`];
  });

run('duration=5秒 → list 与 show 都是 5000',
  { festival: '中秋节', duration: '5秒' }, PHONE, (j) => {
    const it = j.data.list.find(x => x.id === 14) || {};
    const sh = (j.data.show || [])[0] || {};
    return [it.duration === 5000 && sh.duration === 5000,
      `list=${it.duration} show=${sh.duration}`];
  });

run('随机·半透明 · 结果必落在 8 张透明图之内',
  { festival: '随机·半透明' }, PHONE, (j) => {
    const t = thumbOf(j, 14).split('/').pop();
    return [TRANSPARENT_FILES.includes(t), `id14.thumb=${t}`];
  }, null, { Date: mkNow(2026, 9, 18), $persistentStore: mockStore() });

run('轮换·全部 · 结果必落在 75 个皮肤素材之内',
  { festival: '轮换·全部' }, PHONE, (j) => {
    const t = thumbOf(j, 14).split('/').pop();
    return [SCRIPT_FILES.includes(t), `id14.thumb=${t}`];
  }, null, { Date: mkNow(2026, 9, 18), $persistentStore: mockStore() });

// —— 可选：真实 HAR ——
const HAR = process.argv[2];
if (HAR) {
  const har = JSON.parse(readFileSync(HAR, 'utf-8'));
  const entry = har.log.entries.find(e => /\/x\/v2\/splash\/brand\/list/.test(e.request.url));
  if (!entry) {
    console.log('⚠️  HAR 里没有 brand/list 请求，跳过');
  } else {
    const c = entry.response.content;
    const body = c.encoding === 'base64' ? Buffer.from(c.text, 'base64').toString('utf-8') : c.text;
    let done = null, error = null;
    const sandbox = {
      $argument: { festival: '2026五一' },
      $request: { url: entry.request.url },
      $response: { body },
      $done: (r) => { done = r; }
    };
    vm.createContext(sandbox);
    try { vm.runInContext(`(function(){
${code}
})();`, sandbox, { filename: 'splash-poc.js' }); } catch (e) { error = e; }
    if (error) { failures++; console.log(`❌ HAR 回放: 脚本抛异常 -> ${error.message}`); }
    else if (!done || !done.body) { failures++; console.log('❌ HAR 回放: $done 未返回 body'); }
    else {
      const j = JSON.parse(done.body);
      console.log(`✅ HAR 回放: show=[${showIds(j)}] id14.thumb=${thumbOf(j, 14).split('/').pop()}`);
    }
  }
}

console.log();
if (failures) { console.log(`FAIL: ${failures} 项失败`); process.exit(1); }
console.log('PASS: 全部通过');
