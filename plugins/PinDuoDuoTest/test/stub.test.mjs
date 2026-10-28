// stub.response.js 的回归测试：验证各开关组合下的拦截/放行行为
import { readFileSync } from 'node:fs'
import { t, done } from './harness.mjs'

const src = readFileSync(new URL('../src/stub.response.js', import.meta.url), 'utf8')

// 模拟 Loon 运行时
function run(argObj, url, body) {
  const out = {}
  const fn = new Function('$argument', '$request', '$response', '$done', 'console', src)
  fn(argObj, { url }, { body }, (r) => { out.result = r }, console)
  return out.result
}

const H = 'https://api.pinduoduo.com'
const STUB = (p) => H + p + '?pdduid=1'
const EMPTY = (r) => r && r.body === '{}'
const PASS = (r) => r && Object.keys(r).length === 0

console.log('\n【1】api_stub 开：13 条会场端点应被拦成 {}')
for (const p of [
  '/api/aristotle/unrated_order_for_unreceived_tab', '/api/aristotle/query_order_list_tabs_element',
  '/api/aquarius/hungary/global/homepage', '/api/caterham/v3/query/order_express_group',
  '/api/alexa/goods/back_up', '/api/brand-olay/goods_detail/bybt_guide',
  '/api/engels/reviews/require/append', '/api/caterham/v3/query/likes',
  '/api/manufacturer/cross/shortcut/list', '/api/dunkirk/liveactivity/push/create/url/report',
  '/api/growth/nagato/app/index/gather', '/api/engels/wait/receive/review',
  '/api/caterham/v2/query/goods_detail_with_tags',
]) {
  t(p.slice(0, 48), EMPTY(run({ api_stub: 'true' }, STUB(p), 'REAL')))
}

console.log('\n【2】api_stub 关：全部放行')
for (const p of ['/api/aquarius/hungary/global/homepage', '/api/caterham/v3/query/likes', '/search_hotquery']) {
  t(p.slice(0, 48), PASS(run({ api_stub: 'false' }, STUB(p), 'REAL')))
}

console.log('\n【3】四组开关互不影响')
const cases = [
  ['search_stub', '/search_hotquery'],
  ['phantom_stub', '/api/phantom/gbdbpdv/extra'],
  ['order_stub', '/api/caterham/v3/query/my_order_group'],
  ['chat_stub', '/api/caterham/v3/query/new_chat_group'],
  ['chat_stub', '/api/zaire_biz/chat/resource/get_list_data'],
  ['chat_stub', '/api/caterham/v3/query/personal'],
  ['chat_stub', '/api/buffon/nasus/recommend'],
]
for (const [sw, p] of cases) {
  t(`${sw} 开 → ${p.slice(0, 40)}`, EMPTY(run({ [sw]: 'true' }, STUB(p), 'REAL')))
  t(`${sw} 关 → 放行`, PASS(run({ [sw]: 'false' }, STUB(p), 'REAL')))
}

console.log('\n【4】交叉验证：关掉 search 不影响 phantom')
t('search 关 + phantom 开 → phantom 仍被拦',
  EMPTY(run({ search_stub: 'false', phantom_stub: 'true' }, STUB('/api/phantom/gbdbpdv/extra'), 'REAL')))
t('search 开 + phantom 关 → phantom 放行',
  PASS(run({ search_stub: 'true', phantom_stub: 'false' }, STUB('/api/phantom/gbdbpdv/extra'), 'REAL')))
t('只开 search → 订单放行',
  PASS(run({ search_stub: 'true' }, STUB('/api/caterham/v3/query/my_order_group'), 'REAL')))
t('只开 order → 搜索放行',
  PASS(run({ order_stub: 'true' }, STUB('/search_hotquery'), 'REAL')))

console.log('\n【5】/search 的 expansion 字段删除')
const sbody = JSON.stringify({ expansion: { a: 1 }, goods: [1, 2] })
let r = run({ search_stub: 'true' }, STUB('/search'), sbody)
t('expansion 已删', r && r.body && !('expansion' in JSON.parse(r.body)))
t('其他字段保留', r && r.body && 'goods' in JSON.parse(r.body))
r = run({ search_stub: 'false' }, STUB('/search'), sbody)
t('开关关 → 原样放行', PASS(r))
r = run({ search_stub: 'true' }, STUB('/search'), 'NOT_JSON')
t('非 JSON 不崩', PASS(r))
r = run({ search_stub: 'true' }, STUB('/search'), '')
t('空 body 不崩', PASS(r))

console.log('\n【6】未匹配的 URL 一律放行')
for (const p of ['/api/alexa/homepage/hub', '/api/caterham/v3/query/my_order', '/search_hot', '/foo']) {
  t(p.slice(0, 44), PASS(run({ api_stub: 'true', search_stub: 'true', chat_stub: 'true' }, STUB(p), 'REAL')))
}
t('query 带参数仍能匹配', EMPTY(run({ search_stub: 'true' }, H + '/search_hotquery?a=1&b=2', 'REAL')))
t('query 带参数不影响精确匹配',
  PASS(run({ order_stub: 'true' }, H + '/search_hotquery?a=1', 'REAL')))

console.log('\n【7】开关值的多种形态')
for (const v of [true, 1, 'true', '1', 'on', 'ON']) {
  t(`真值 ${JSON.stringify(v)} 被识别`, EMPTY(run({ search_stub: v }, STUB('/search_hotquery'), 'R')))
}
for (const v of [false, 0, 'false', 'off', '', undefined, null]) {
  t(`假值 ${JSON.stringify(v)} 被识别`, PASS(run({ search_stub: v }, STUB('/search_hotquery'), 'R')))
}

console.log('\n【8】stub 返回 200 + {}')
r = run({ api_stub: 'true' }, STUB('/api/caterham/v3/query/likes'), 'REAL')
t('status = 200', r && r.status === 200, JSON.stringify(r))
t('body = {}', r && r.body === '{}')

done()
