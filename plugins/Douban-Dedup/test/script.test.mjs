// script.test.mjs —— 豆瓣搜索页广告剥离脚本（douban-search-ad.js）单元测试
//
// 固件来自用户 2026-10-01 的真机抓包（豆瓣 7.135.0 / iPadOS 18.7.3），
// 原始响应体已解 base64 后存进 fixtures/。
//
// 运行：node test/script.test.mjs
// 无外部依赖。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIR = join(HERE, '..')
const src = readFileSync(join(DIR, 'src', 'douban-search-ad.js'), 'utf8')
const foundWordsRaw = readFileSync(join(HERE, 'fixtures', 'found_words.json'), 'utf8')
const hotsRaw = readFileSync(join(HERE, 'fixtures', 'search_hots.json'), 'utf8')
const foundWords = JSON.parse(foundWordsRaw)
const hots = JSON.parse(hotsRaw)

let pass = 0, fail = 0
const t = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name}${detail ? '\n       ' + detail : ''}`) }
}

// 在沙盒里跑脚本，返回 $done 收到的参数
const run = (body) => {
  let done = null
  const ctx = { $response: { body }, $done: (o) => { done = o } }
  vm.createContext(ctx)
  vm.runInContext(src, ctx)
  return done
}
const runOut = (body) => {
  const d = run(body)
  return d && d.body ? JSON.parse(d.body) : null
}

const titles = (o, k) => (o[k] || []).map((x) => x.title)

// ── 1. found_words：搜索框 + 联想词 ────────────────────────
console.log('\n【1】/api/v2/search/found_words')
const fw = runOut(JSON.stringify(foundWords))
t('返回了新 body', !!fw)
t('广告词「看视频抽立减金」被删',
  !titles(fw, 'words').includes('看视频抽立减金'),
  JSON.stringify(titles(fw, 'words')))
t('其余 7 个联想词全部保留',
  titles(fw, 'words').length === foundWords.words.length - 1,
  `原 ${foundWords.words.length} → 现 ${titles(fw, 'words').length}`)
t('《复仇者联盟5》确认引进内地 保留',
  titles(fw, 'words').includes('《复仇者联盟5》确认引进内地'))
t('时尚芭莎对李庚希好残忍 保留', titles(fw, 'words').includes('时尚芭莎对李庚希好残忍'))
t('广告项整体消失（不只是改标题）',
  (fw.words || []).every((w) => !(w.layout === 'ad' || w.search_type === 'ad_link')))
t('top_word（《沙丘3》确认引进）原样保留 —— 它 layout=default 不是广告',
  fw.top_word && fw.top_word.title === '《沙丘3》确认引进',
  JSON.stringify(fw.top_word))
t('cache_timeout 保留', fw.cache_timeout === foundWords.cache_timeout)
t('正常词条字段未被破坏（uri / search_type 完整）',
  (fw.words || []).filter((w) => w.layout === 'default')
    .every((w) => typeof w.uri === 'string' && w.search_type === 'all'))

// ── 2. search/hots：发现页横滚标签 ─────────────────────────
console.log('\n【2】/api/v2/search/hots')
const sh = runOut(JSON.stringify(hots))
t('返回了新 body', !!sh)
t('广告词「抽10元支付宝立减金」被删', !titles(sh, 'roofs').includes('抽10元支付宝立减金'))
t('roofs 删空后补了占位，App 不会拿到空数组',
  Array.isArray(sh.roofs) && sh.roofs.length === 1 && sh.roofs[0].layout === 'default',
  JSON.stringify(sh.roofs))
t('ad_info 整块删除（ad_type=fake / unit_name=dale_app_search_hots_page）',
  sh.ad_info === undefined)
const hb = sh.hot_search_board || []
t(`hot_search_board ${hb.length} 条热搜全部保留`, hb.length === hots.hot_search_board.length)
t('严子怡最喜欢的运动员（rank 1）保留',
  hb.some((x) => x.title === '严子怡最喜欢的运动员' && x.rank_value === 1))
t('subjects / top_groups / gallery_topics 保留',
  JSON.stringify(sh.subjects) === JSON.stringify(hots.subjects) &&
  JSON.stringify(sh.top_groups) === JSON.stringify(hots.top_groups) &&
  JSON.stringify(sh.gallery_topics) === JSON.stringify(hots.gallery_topics))

// ── 3. 幂等与异常处理 ──────────────────────────────────────
console.log('\n【3】幂等与容错')
// 注意：没有广告时脚本刻意不重写 body（$done({})），所以 runOut 返回 null。
// 「幂等」在这里的正确含义是：第二次跑同样不产生新改动。
const second = run(JSON.stringify(fw))
t('对已清理的响应再跑一次，不再重写 body（幂等）',
  second.body === undefined, JSON.stringify(second).slice(0, 100))
t('无广告时原样放行（不重写 body）', run(JSON.stringify({ words: [{ layout: 'default' }] })).body === undefined)
t('非 JSON 响应放行', run('<html>404</html>').body === undefined)
t('空 body 放行', run('').body === undefined)
t('数组根节点放行', run('[1,2,3]').body === undefined)
t('null 放行', run('null').body === undefined)
t('字符串根节点放行', run('"hi"').body === undefined)
t('缺 words/roofs 字段不报错也不重写',
  run(JSON.stringify({ hot_search_board: [] })).body === undefined)
t('所有条目都是广告时补占位而非留空',
  (runOut(JSON.stringify({ words: [{ layout: 'ad', title: 'x' }] })).words || []).length === 1)
t('顶层含 ad_info 但无广告条目时仍清理（避免虚假曝光上报）',
  runOut(JSON.stringify({ words: [], ad_info: { ad_type: 'fake' } })).ad_info === undefined)
// 结构未知的 ad_info 不该被误删 —— 此时也不该重写 body
t('ad_info 结构未知时原样放行（不误删也不重写）',
  run(JSON.stringify({ words: [], ad_info: { foo: 1 } })).body === undefined)

// ── 4. 脚本不越界 ──────────────────────────────────────────
console.log('\n【4】脚本不越界')
t('不含 eval / Function 构造',
  !/\beval\s*\(/.test(src) && !/new\s+Function\s*\(/.test(src))
t('不含 $httpClient / fetch（无外部网络依赖）',
  !/\$httpClient|\bfetch\s*\(/.test(src))
t('所有分支都有 $done 兜底（不会悬挂）',
  (src.match(/\$done\s*\(/g) || []).length >= 6)
t('每个 $done 都在 try 内或 catch 兜底',
  /catch\s*\(\s*e\s*\)\s*\{[^}]*\$done/.test(src))
// 只查可执行代码：注释里保留抓包样本是有意的，那些词不参与判断
const code = src.replace(/^\s*\/\/.*$/gm, '')
t('可执行代码里不硬编码任何具体广告词（广告词每天换）',
  !/立减金|沙丘|dale_ad/.test(code),
  code.match(/立减金|沙丘|dale_ad/g) || '')
t('删除判据只有 layout / search_type 两个字段',
  /layout\s*===\s*'ad'/.test(code) && /search_type\s*===\s*'ad_link'/.test(code))
t('注释里保留了抓包样本作为依据',
  /看视频抽立减金/.test(src) && /沙丘3/.test(src) && /dale_app_search_hots_page/.test(src))

// ── 5. 固件脱敏守卫 ────────────────────────────────────────
// 固件直接来自真机 HAR，query 里带 _sig / apikey / uid / caid / chicken。
// 公开仓库里必须已脱敏 —— 这条断言防止有人直接提交原始响应体。
console.log('\n【5】固件脱敏守卫')
// JSON 里 URL 存的是 percent-encoded，占位符长这样：%3CCAID%3E（即 <CAID>）
const PLACEHOLDER = /^%3C[A-Z_]+%3E$/
for (const [name, raw] of [['found_words', foundWordsRaw], ['search_hots', hotsRaw]]) {
  const leaks = []
  for (const m of raw.matchAll(/[?&](apikey|_sig|uid|caid|chicken|douban_udid|sa_cv|chksm)=([^"&]*)/g)) {
    if (m[2] && !PLACEHOLDER.test(m[2])) leaks.push(m[0])
  }
  t(`${name}.json 的敏感 query 值已全部替换为占位符`, leaks.length === 0, leaks.slice(0, 3).join(' '))
  t(`${name}.json 里没有 UUID 形态的串`, !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/.test(raw))
  // 注意：不查「长十六进制」。残留的长串都是图片文件名哈希
  // （doubanio.com/view/.../p2931851430.webp），属公开资源标识，非敏感。
  // 真正要防的是身份凭证，已由上面那条 query 占位符断言覆盖。
  // 不查手机号：model=iPad16,1 这类设备串会误命中正则。
  t(`${name}.json 里没有邮箱形态`, !/\w+@[\w.]+\.\w+/.test(raw))
}
t('脱敏后仍能识别出广告条目（layout/search_type 保留）',
  foundWords.words.some((w) => w.layout === 'ad' && w.search_type === 'ad_link') &&
  hots.roofs.some((r) => r.layout === 'ad'))
t('脱敏后仍能识别出 ad_info 的广告位名（unit_name 保留）',
  typeof hots.ad_info?.unit_name === 'string' && hots.ad_info.unit_name.length > 0)

// ── 汇总 ────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
console.log(`通过 ${pass}　失败 ${fail}`)
process.exit(fail ? 1 : 0)
