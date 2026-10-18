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
function makeResp() {
  return JSON.stringify({
    code: 0,
    data: {
      list: IDS.map(id => ({
        id, thumb: 'orig_' + id, thumb_name: 'orig', thumb_hash: 'orig', mode: 'half', logo_hash: 'lh' + id
      })),
      show: []
    }
  });
}

const PHONE = 'https://app.bilibili.com/x/v2/splash/brand/list?appkey=1d8b6e7d45233436&device=phone';
const IPAD = 'https://app.bilibili.com/x/v2/splash/brand/list?appkey=5fd5a7d8bfd9b0e6&device=pad';

let failures = 0;

function run(label, argument, url, expect) {
  let done = null, error = null;
  const sandbox = {
    $argument: argument,
    $request: { url: url || PHONE },
    $response: { body: makeResp() },
    $done: (r) => { done = r; }
  };
  vm.createContext(sandbox);
  try {
    vm.runInContext(code, sandbox, { filename: 'splash-poc.js' });
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

const thumbOf = (j, id) => (j.data.list.find(x => x.id === id) || {}).thumb || '';
const endsWith = (s, suf) => s.endsWith(suf);
const showIds = (j) => (j.data.show || []).map(x => x.id).join(',');

// —— 中文标签（v31 的 [Argument] 值）——
run('中文标签 2026五一 → 历史皮肤 labor26', { festival: '2026五一' }, PHONE, (j) => {
  const t = thumbOf(j, 13);
  return [endsWith(t, 'labor26.webp') && showIds(j) === '13',
    `id13.thumb=${t.split('/').pop()} show=[${showIds(j)}]`];
});

run('中文标签 中秋节 → 官方 38（手机竖图）', { festival: '中秋节' }, PHONE, (j) => {
  const t = thumbOf(j, 38);
  return [endsWith(t, '38_phone.webp') && showIds(j) === '38',
    `id38.thumb=${t.split('/').pop()} show=[${showIds(j)}]`];
});

run('中文标签 中秋节 → 官方 38（iPad 横图）', { festival: '中秋节' }, IPAD, (j) => {
  const t = thumbOf(j, 38);
  return [endsWith(t, '38_pad.webp'), `id38.thumb=${t.split('/').pop()}`];
});

run('中文标签 重阳节 → 官方 145（手机竖图）', { festival: '重阳节' }, PHONE, (j) => {
  const t = thumbOf(j, 145);
  return [endsWith(t, '145_phone.webp') && showIds(j) === '145',
    `id145.thumb=${t.split('/').pop()} show=[${showIds(j)}]`];
});

run('中文标签 屏蔽开屏 → show 清空', { festival: '屏蔽开屏' }, PHONE, (j) => {
  return [(j.data.show || []).length === 0, `show=[${showIds(j)}]`];
});

run('中文标签 2026五一 + 屏蔽开屏 都是历史/block 分支互不串味', { festival: '2026端午节' }, PHONE, (j) => {
  const t = thumbOf(j, 13);
  return [endsWith(t, 'duanwu26.webp'), `id13.thumb=${t.split('/').pop()}`];
});

// —— 英文键（向后兼容：老配置里存的仍是英文键）——
run('英文键 gaokao24 → 历史皮肤', { festival: 'gaokao24' }, PHONE, (j) => {
  const t = thumbOf(j, 13);
  return [endsWith(t, 'gaokao24.webp'), `id13.thumb=${t.split('/').pop()}`];
});

run('英文键 midautumn → 官方 38', { festival: 'midautumn' }, PHONE, (j) => {
  return [endsWith(thumbOf(j, 38), '38_phone.webp'), `show=[${showIds(j)}]`];
});

// —— 历史配置格式兼容（v29/v30 残留值）——
run('v30 格式 "官方-中秋节=midautumn" → 38', { festival: '官方-中秋节=midautumn' }, PHONE, (j) => {
  return [showIds(j) === '38', `show=[${showIds(j)}]`];
});

run('v30 格式 "官方-2026五一=labor26" → 历史 labor26', { festival: '官方-2026五一=labor26' }, PHONE, (j) => {
  return [endsWith(thumbOf(j, 13), 'labor26.webp'), `id13.thumb=${thumbOf(j, 13).split('/').pop()}`];
});

run('v29 格式 "官方_midautumn" → 38', { festival: '官方_midautumn' }, PHONE, (j) => {
  return [showIds(j) === '38', `show=[${showIds(j)}]`];
});

// —— 新增 2023/2024 历史皮肤 ——
run('2023端午节', { festival: '2023端午节' }, PHONE, (j) => [endsWith(thumbOf(j, 13), 'duanwu23.webp'), `id13.thumb=${thumbOf(j,13).split("/").pop()}`]);
run('2023暑假过半', { festival: '2023暑假过半' }, PHONE, (j) => [endsWith(thumbOf(j, 13), 'summer23.webp'), `id13.thumb=${thumbOf(j,13).split("/").pop()}`]);
run('2023七夕节', { festival: '2023七夕节' }, PHONE, (j) => [endsWith(thumbOf(j, 13), 'qixi23a.webp'), `id13.thumb=${thumbOf(j,13).split("/").pop()}`]);
run('2023中秋节', { festival: '2023中秋节' }, PHONE, (j) => [endsWith(thumbOf(j, 13), 'midautumn23.webp'), `id13.thumb=${thumbOf(j,13).split("/").pop()}`]);
run('2023万圣节款式一', { festival: '2023万圣节款式一' }, PHONE, (j) => [endsWith(thumbOf(j, 13), 'halloween23a.webp'), `id13.thumb=${thumbOf(j,13).split("/").pop()}`]);
run('2023跨年', { festival: '2023跨年' }, PHONE, (j) => [endsWith(thumbOf(j, 13), 'yuandan23.webp'), `id13.thumb=${thumbOf(j,13).split("/").pop()}`]);
run('2024春节-款式一', { festival: '2024春节-款式一' }, PHONE, (j) => [endsWith(thumbOf(j, 13), 'cj24a.webp'), `id13.thumb=${thumbOf(j,13).split("/").pop()}`]);
run('2024元宵节', { festival: '2024元宵节' }, PHONE, (j) => [endsWith(thumbOf(j, 13), 'yx24.webp'), `id13.thumb=${thumbOf(j,13).split("/").pop()}`]);
run('2024妇女节', { festival: '2024妇女节' }, PHONE, (j) => [endsWith(thumbOf(j, 13), 'women24.webp'), `id13.thumb=${thumbOf(j,13).split("/").pop()}`]);
run('2024清明', { festival: '2024清明' }, PHONE, (j) => [endsWith(thumbOf(j, 13), 'qm24.webp'), `id13.thumb=${thumbOf(j,13).split("/").pop()}`]);
run('2024劳动节', { festival: '2024劳动节' }, PHONE, (j) => [endsWith(thumbOf(j, 13), 'labor24.webp'), `id13.thumb=${thumbOf(j,13).split("/").pop()}`]);

// —— 已移除选项的旧配置兼容 ——
run('旧配置 "2025国际劳动节"（已移除）仍显示劳动节图', { festival: '2025国际劳动节' }, PHONE, (j) => {
  return [endsWith(thumbOf(j, 13), 'labor25.webp'), `id13.thumb=${thumbOf(j, 13).split('/').pop()}`];
});

run('旧配置 "官方-2025国际劳动节=labor25b"（已移除）→ 劳动节图', { festival: '官方-2025国际劳动节=labor25b' }, PHONE, (j) => {
  return [endsWith(thumbOf(j, 13), 'labor25.webp'), `id13.thumb=${thumbOf(j, 13).split('/').pop()}`];
});

// —— 已移除选项不应再作为独立皮肤 ——
run('labor25b 不再是独立皮肤（显示与 labor25 同一文件）',
  { festival: 'labor25b' }, PHONE, (j) => {
    return [endsWith(thumbOf(j, 13), 'labor25.webp'), `id13.thumb=${thumbOf(j, 13).split('/').pop()}`];
});

// —— 显示模式开关 ——
run('splashMode=half 覆盖官方 mode', { festival: '中秋节', splashMode: 'half' }, PHONE, (j) => {
  const it = j.data.list.find(x => x.id === 38) || {};
  return [it.mode === 'half', `id38.mode=${it.mode}`];
});

run('imgMode=landscape 强制横图', { festival: '中秋节', imgMode: 'landscape' }, PHONE, (j) => {
  return [endsWith(thumbOf(j, 38), '38_pad.webp'), `id38.thumb=${thumbOf(j, 38).split('/').pop()}`];
});

// —— 未知值兜底 ——
run('未知 festival → 兜底 midautumn(38)', { festival: '不存在的皮肤' }, PHONE, (j) => {
  return [showIds(j) === '38', `show=[${showIds(j)}]`];
});

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
    try { vm.runInContext(code, sandbox, { filename: 'splash-poc.js' }); } catch (e) { error = e; }
    if (error) { failures++; console.log(`❌ HAR 回放: 脚本抛异常 -> ${error.message}`); }
    else if (!done || !done.body) { failures++; console.log('❌ HAR 回放: $done 未返回 body'); }
    else {
      const j = JSON.parse(done.body);
      console.log(`✅ HAR 回放: show=[${showIds(j)}] id13.thumb=${thumbOf(j, 13).split('/').pop()}`);
    }
  }
}

console.log();
if (failures) { console.log(`FAIL: ${failures} 项失败`); process.exit(1); }
console.log('PASS: 全部通过');
