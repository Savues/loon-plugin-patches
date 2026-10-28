// 用真实 HAR 摘取的详情页结构驱动 detail.response.js
import { readFileSync } from 'node:fs'
import { t, done } from './harness.mjs'

const src = readFileSync(new URL('../src/detail.response.js', import.meta.url), 'utf8')
const FIX = JSON.parse(readFileSync(new URL('./detail-fixture.json', import.meta.url), 'utf8'))
const GID = String(FIX.goods.goods_id)

// 模拟 Loon 运行时；$persistentStore 按官方签名 read(key)/write(value,key)
function makeStore(initial) {
  const kv = initial ? { pddAdGoodsIds: JSON.stringify(initial) } : {}
  return {
    read: (k) => (k in kv ? kv[k] : null),
    write: (v, k) => { kv[k] = String(v); return true },
    _kv: kv,
  }
}

function run(argObj, payload, store) {
  const out = {}
  const fn = new Function('$argument', '$response', '$done', '$persistentStore', 'console', src)
  fn(argObj, { body: JSON.stringify(payload) }, (r) => { out.result = r }, store, console)
  const r = out.result
  if (r && typeof r.body === 'string') {
    try { r.body = JSON.parse(r.body) } catch { /* 放行原样，断言会报 */ }
  }
  return r
}
const clone = (o) => JSON.parse(JSON.stringify(o))

console.log('\n【1】不在广告名单 —— 只做原 [Rewrite] 的三处删除，不打标')
let o = run({ feed_ad: true }, clone(FIX), makeStore(['999999']))
let g = (o.body || o)
t('bottom_section_list 已删', g.bottom_section_list === undefined)
t('ui.bottom_section 已删', g.ui.bottom_section === undefined)
t('ui.live_section.float_info 已删', g.ui.live_section.float_info === undefined)
t('ui.live_section 本体保留', g.ui.live_section !== undefined)
t('side_sales_tip 未打标', g.goods.side_sales_tip === '已拼1.3万+袋')
t('desc_labels 未打标', g.ui.new_price_section.desc_labels[0] === '已拼1.3万+袋')
t('标题未动', !g.goods.goods_name.startsWith('【广告】'))

console.log('\n【2】在名单里（写法 1：5 处销量文案全打标）')
o = run({ feed_ad: true }, clone(FIX), makeStore([GID]))
g = (o.body || o)
t('goods.side_sales_tip 带前缀', g.goods.side_sales_tip === '广告·已拼1.3万+袋')
t('desc_labels[0] 带前缀', g.ui.new_price_section.desc_labels[0] === '广告·已拼1.3万+袋')
const richRow = g.ui.new_price_section.desc_labels_rich[0]
t('desc_labels_rich 头部插入红字元素',
  richRow[0].txt === '广告·' && richRow[0].color === '#E02E24' && richRow[0].type === 1)
t('desc_labels_rich 原灰字保留', richRow[1].txt === '已拼1.3万+袋' && richRow[1].color === '#58595B')
const pdl = g.ui.pull_down_title_section.second_line_rich_list
t('下拉标题头部插入红字元素', pdl[0].txt === '广告·' && pdl[1].txt === '已拼1.3万+袋')
let skuHit = 0
for (const s of g.sku) for (const lb of (s.side_car_labels || []))
  if (lb.text === '广告·已拼1.3万+袋') skuHit++
t('5 个 SKU 侧栏全打标', skuHit === 5, `实际 ${skuHit}`)
t('三处删除仍然生效', g.bottom_section_list === undefined && g.ui.bottom_section === undefined)
t('标题未被兜底改动', !g.goods.goods_name.startsWith('【广告】'))

console.log('\n【3】幂等 —— 打过标的再跑一遍不叠加')
const store2 = makeStore([GID])
let o2 = run({ feed_ad: 'true' }, clone(FIX), store2)
o2 = run({ feed_ad: 'true' }, (o2.body || o2), store2)
g = (o2.body || o2)
t('前缀只有一个', g.goods.side_sales_tip === '广告·已拼1.3万+袋')
t('rich 元素只有一个广告·',
  g.ui.new_price_section.desc_labels_rich[0].filter(x => x.txt === '广告·').length === 1)

console.log('\n【4】兜底 —— 没有销量文案的商品回落到标题前缀')
const noSales = clone(FIX)
delete noSales.goods.side_sales_tip
noSales.sku = [{ id: 1 }]
noSales.ui.new_price_section.desc_labels = []
noSales.ui.new_price_section.desc_labels_rich = [[]]
delete noSales.ui.pull_down_title_section
o = run({ feed_ad: true }, noSales, makeStore([GID]))
g = (o.body || o)
t('goods_name 加【广告】', g.goods.goods_name.startsWith('【广告】'))
t('short_name 加【广告】', g.goods.short_name.startsWith('【广告】'))

console.log('\n【5】feed_ad 关 —— 名单命中也不打标，三处删除照做')
o = run({}, clone(FIX), makeStore([GID]))
g = (o.body || o)
t('side_sales_tip 原样', g.goods.side_sales_tip === '已拼1.3万+袋')
t('bottom_section_list 仍删', g.bottom_section_list === undefined)

console.log('\n【6】异常结构 —— 一律放行')
for (const [name, payload] of [['非 JSON', undefined], ['goods 缺失', { ui: {} }], ['空对象', {}]]) {
  const out = {}
  const fn = new Function('$argument', '$response', '$done', '$persistentStore', 'console', src)
  fn({ feed_ad: true }, { body: payload === undefined ? 'not json' : JSON.stringify(payload) },
     (r) => { out.r = r }, makeStore([GID]), console)
  t(`${name} → 放行`, Object.keys(out.r || {}).length === 0, JSON.stringify(out.r))
}

done()
