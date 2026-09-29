// 用真实 HAR 响应驱动 homepage.response.js，验证各开关组合
import { readFileSync } from 'node:fs'

const SCRIPT = new URL('../src/homepage.response.js', import.meta.url)
const src = readFileSync(SCRIPT, 'utf8')
const real = JSON.parse(readFileSync(new URL('./har-fixture.json', import.meta.url), 'utf8'))

const DEFAULT = ['index.html', 'chat_list.html', 'personal.html']

// 在 node 里模拟 Loon 脚本运行时；$done({body}) 的 body 是字符串，需还原成对象
function run(argObj, payload) {
  const out = {}
  const fn = new Function('$argument', '$response', '$done', 'console', src)
  fn(argObj, { body: JSON.stringify(payload) }, (r) => { out.result = r }, console)
  const r = out.result
  if (r && typeof r.body === 'string') {
    try { r.body = JSON.parse(r.body) } catch { /* 放行原样，测试断言会报 */ }
  }
  return r
}

let pass = 0, fail = 0
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`) } }
const L = (o) => ((o.body || o).result.bottom_tabs || []).map(x => x.link)
const B = (o) => ((o.body || o).result.buffer_bottom_tabs || []).map(x => x.link)

console.log('\n【基线】bottom_tabs', (real.result.bottom_tabs || []).length, '项 / buffer',
  (real.result.buffer_bottom_tabs || []).length, '项')

console.log('\n【1】开关全关 —— 完全不改')
let o = run({}, real)
t('bottom_tabs 原样 5 项', L(o).length === 5, L(o).join(','))
t('buffer 原样 5 项', B(o).length === 5)
t('icon_set 保留', Array.isArray((o.body || o).result.icon_set))
t('search_bar_hot_query 保留', !!(o.body || o).result.search_bar_hot_query)
// 注：真实数据里 all_top_opts 24 项中只有 1 项带 image 键，
// 「原样」应断言数量与键集合不变，而不是每项都有 image。
const imgCount = (o) => (o.body || o).result.all_top_opts.filter(x => 'image' in x).length
t('all_top_opts 原样', imgCount(o) === imgCount({ body: real }) && (o.body || o).result.all_top_opts.length === real.result.all_top_opts.length)

console.log('\n【2】bottom_custom 开（默认三项）')
o = run({ bottom_custom: 'true' }, real)
t('bottom_tabs 裁到 3', L(o).length === 3, L(o).join(','))
t('保留 index/chat/personal', DEFAULT.every(l => L(o).includes(l)))
t('移除多多视频', !L(o).some(l => l.includes('pdd_live_tab_list')))
t('移除推广 tab', !L(o).some(l => l.includes('promotion_source_name')))
t('buffer 同步裁剪', B(o).length === 3, B(o).join(','))

console.log('\n【3】自定义四项')
o = run({ bottom_custom: 'true', Bot_index: 'true', Bot_chat: 'true', Bot_personal: 'true', Bot_live: 'true' }, real)
t('共 4 项', L(o).length === 4, L(o).join(','))
t('含多多视频', L(o).some(l => l.includes('pdd_live_tab_list')))

console.log('\n【4】顺序保持服务端原序')
const li = L(o).indexOf(L(o).find(l => l.includes('pdd_live_tab_list')))
const ci = L(o).indexOf(L(o).find(l => l.includes('chat_list.html')))
t('多多视频仍在 chat 之前', li < ci, `live@${li} chat@${ci}`)

console.log('\n【5】只开 bottom_custom 不选任何项 → 回落默认三项')
o = run({ bottom_custom: 'true' }, real)
t('为上游那三项', JSON.stringify([...L(o)].sort()) === JSON.stringify([...DEFAULT].sort()), L(o).join(','))

console.log('\n【6】Bot_custom 备用输入')
// classification.html 只出现在 buffer_bottom_tabs，attendance.html 只在 bottom_tabs
o = run({ bottom_custom: 'true', Bot_custom: 'attendance.html' }, real)
t('匹配 attendance（bottom_tabs 侧）', L(o).some(l => l.includes('attendance')), L(o).join(','))
t('共 1 项', L(o).length === 1, L(o).join(','))
o = run({ bottom_custom: 'true', Bot_custom: 'classification.html' }, real)
t('匹配 classification（buffer 侧）', B(o).some(l => l.includes('classification')), B(o).join(','))
t('buffer 共 1 项', B(o).length === 1, B(o).join(','))
o = run({ bottom_custom: 'true', Bot_custom: 'index.html, personal.html' }, real)
t('逗号分隔两项都生效', L(o).length === 2, L(o).join(','))
o = run({ bottom_custom: 'true', Bot_custom: '  index.html ,  ' }, real)
t('容忍空格与空段', L(o).length === 1 && L(o)[0] === 'index.html', L(o).join(','))

console.log('\n【7】api_stub 控制去广告字段')
o = run({ api_stub: 'true' }, real)
t('icon_set 已删', !('icon_set' in (o.body || o).result))
t('irregular_banner_dy 已删', !(r => { const d = r.dy_module; return d && 'irregular_banner_dy' in d })((o.body || o).result))
t('all_top_opts 图字段已清', (o.body || o).result.all_top_opts.every(x => !('image' in x)))
t('all_top_opts 数量不变', (o.body || o).result.all_top_opts.length === real.result.all_top_opts.length)
t('其他键未误删', 'bottom_tabs' in (o.body || o).result && 'module_order' in (o.body || o).result)

console.log('\n【7b】搜索词归 search_stub 管，与 api_stub 解耦')
// 场景：关掉 api_stub（放行会场接口），但保持搜索去广告
o = run({ api_stub: 'false', search_stub: 'true' }, real)
t('api_stub 关 + search_stub 开 → 搜索词已删',
  !('search_bar_hot_query' in (o.body || o).result))
t('api_stub 关 → icon_set 保留', 'icon_set' in (o.body || o).result)
t('api_stub 关 → all_top_opts 图字段保留',
  (o.body || o).result.all_top_opts.filter(x => 'image' in x).length === imgCount({ body: real }))

// 反向：只开 api_stub，搜索词应保留
o = run({ api_stub: 'true', search_stub: 'false' }, real)
t('api_stub 开 + search_stub 关 → 搜索词保留',
  'search_bar_hot_query' in (o.body || o).result)
t('api_stub 开 → icon_set 已删', !('icon_set' in (o.body || o).result))

// 只开 search_stub
o = run({ search_stub: 'true' }, real)
t('只开 search_stub → 搜索词已删', !('search_bar_hot_query' in (o.body || o).result))
t('只开 search_stub → icon_set 保留', 'icon_set' in (o.body || o).result)

console.log('\n【8】异常输入不崩')
const noRes = run({ api_stub: 'true' }, { foo: 1 })
t('无 result 原样返回', noRes.body.foo === 1)
const nullTabs = run({ bottom_custom: 'true' }, { result: { bottom_tabs: null, buffer_bottom_tabs: null } })
t('bottom_tabs 为 null 不崩', 'body' in nullTabs)
const noLink = run({ bottom_custom: 'true' }, { result: { bottom_tabs: [{ title: 'x' }, { link: 'index.html' }] } })
t('无 link 的项被安全剔除', noLink.body.result.bottom_tabs.length === 1)
const emptyRes = run({ api_stub: 'true', bottom_custom: 'true' }, { result: {} })
t('空 result 不崩', 'body' in emptyRes)
const botOff = run({ bottom_custom: 'false' }, real)
t('bottom_custom=false 时不动底栏', L(botOff).length === 5)

console.log('\n' + '='.repeat(56))
console.log(`通过 ${pass} · 失败 ${fail}`)
process.exit(fail ? 1 : 0)
