// v1.78：面包诱惑详情页 —— 滚动条多帧结构（desc_labels_for_carousel / 快要抢光 / SKU suffix）
import { readFileSync } from 'node:fs'
import { t, done } from './harness.mjs'

const src = readFileSync(new URL('../src/detail.response.js', import.meta.url), 'utf8')
const FIX = JSON.parse(readFileSync(new URL('./bread-fixture.json', import.meta.url), 'utf8'))
const GID = String(FIX.goods.goods_id)

const makeStore = (ids) => ({
  read: (k) => (k === 'pddAdGoodsIds' ? JSON.stringify(ids) : null),
  write: () => true,
})
function run(argObj, payload) {
  const out = {}
  const fn = new Function('$argument', '$response', '$done', '$persistentStore', 'console', src)
  fn(argObj, { body: JSON.stringify(payload) }, (r) => { out.result = r }, makeStore([GID]), console)
  const r = out.result
  if (r && typeof r.body === 'string') { try { r.body = JSON.parse(r.body) } catch {} }
  return r
}
const clone = (o) => JSON.parse(JSON.stringify(o))

console.log('\n【1】滚动条全部帧打标')
let o = run({ feed_ad: true }, clone(FIX))
let g = (o.body || o)
const np = g.ui.new_price_section
t('desc_labels[0] 已拼帧', np.desc_labels[0] === '广告·已拼1313个')
t('desc_labels[1] 快要抢光帧也打标（v1.77 漏网）', np.desc_labels[1] === '广告·快要抢光')
t('first_desc_label 打标', np.first_desc_label === '广告·已拼1313个')
t('desc_labels_for_carousel 本店已拼帧打标（用户报告的漏网）',
  np.desc_labels_for_carousel[0].txt === '广告·本店已拼4.8万件')
t('carousel 帧保留原颜色/字号',
  np.desc_labels_for_carousel[0].color === '#58595B' && np.desc_labels_for_carousel[0].font === 13)
t('desc_labels_rich 两行头部红字元素',
  np.desc_labels_rich[0][0].txt === '广告·' && np.desc_labels_rich[1][0].txt === '广告·')
t('goods.side_sales_tip', g.goods.side_sales_tip === '广告·已拼1313个')

console.log('\n【2】SKU 与购买按钮')
let n = 0
for (const s of g.sku) for (const lb of (s.side_car_labels || []))
  if (lb.text === '广告·快要抢光') n++
const withLabels = g.sku.filter(s => Array.isArray(s.side_car_labels) && s.side_car_labels.length).length
t('side_car_labels 快要抢光全打（有标签的 SKU）', n === withLabels, `实际 ${n}/${withLabels}`)
let suffixMarked = 0, zeroEv = 0
const walk = (node) => {
  if (!node || !Array.isArray(node.show_content)) return
  for (const sc of node.show_content) {
    if (sc.text === '零差评') zeroEv++
    if (sc.text && sc.text.startsWith('广告·')) suffixMarked++
  }
}
walk(g.ui.sku_section.sku_suffix_display)
for (const nd of g.ui.sku_section.sku_suffix_display_list || []) walk(nd)
t('sku_suffix 的 已抢678个/快要抢光 打标', suffixMarked >= 2, `实际 ${suffixMarked}`)
t('零差评 不误伤', zeroEv >= 1 && !JSON.stringify(g.ui.sku_section).includes('广告·零差评'))
const rb = g.ui.new_bottom_section.right_button.title
t('购买按钮 快要抢光 打标', rb.some(x => x.txt === '广告·快要抢光'))
t('购买按钮 限量价 不动', rb.some(x => x.txt === '限量价'))

console.log('\n【3】幂等')
o = run({ feed_ad: 'true' }, clone(FIX))
o = run({ feed_ad: 'true' }, (o.body || o))
g = (o.body || o)
t('滚动帧不叠加', g.ui.new_price_section.desc_labels[1] === '广告·快要抢光'
  && g.ui.new_price_section.desc_labels_for_carousel[0].txt === '广告·本店已拼4.8万件')
t('rich 不叠加', g.ui.new_price_section.desc_labels_rich[0].filter(x => x.txt === '广告·').length === 1)

console.log('\n【4】不在名单 → 一处都不动')
o = run({ feed_ad: true }, clone(FIX))
// 用错误名单重跑
const out2 = {}
const fn2 = new Function('$argument', '$response', '$done', '$persistentStore', 'console', src)
fn2({ feed_ad: true }, { body: JSON.stringify(clone(FIX)) }, (r) => { out2.r = r },
    makeStore(['999']), console)
g = (out2.r && out2.r.body) ? out2.r.body : null
t('未命中名单 → 无改动（$done({}) 放行，无 body 返回）',
  g === null || (g.goods && g.goods.side_sales_tip === '已拼1313个'),
  g ? JSON.stringify(g.goods && g.goods.side_sales_tip) : '(放行)')

done()
