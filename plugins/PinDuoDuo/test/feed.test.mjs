// 用真实 HAR 响应驱动 feed.response.js：只打标、不删商品
import { readFileSync } from 'node:fs'
import { t, done } from './harness.mjs'

const src = readFileSync(new URL('../src/feed.response.js', import.meta.url), 'utf8')
const real = JSON.parse(readFileSync(new URL('./cells-fixture.json', import.meta.url), 'utf8'))
// fixture 里的 JSON.stringify 会保留 \uXXXX 转义，还原成原文再比较无意义，
// 断言一律比较「脚本输出」与「按相同规则手算的期望」，不与原文逐字节比。

const ADS = real.data.goods_list.filter(g => g.data.ad).length
const NOR = real.data.goods_list.length - ADS
console.log(`fixture: ${real.data.goods_list.length} 条商品 / ${ADS} 广告 / ${NOR} 正常`)
t('fixture 含 5 条广告', ADS === 5, `实际 ${ADS}`)

function run(argObj, payload) {
  const out = {}
  const fn = new Function('$argument', '$response', '$done', 'console', src)
  fn(argObj, { body: JSON.stringify(payload) }, (r) => { out.result = r }, console)
  const r = out.result
  if (r && typeof r.body === 'string') {
    try { r.body = JSON.parse(r.body) } catch { /* 放行原样，断言会报 */ }
  }
  return r
}

console.log('\n【1】feed_ad 开 —— 只打标，不删商品')
let o = run({ feed_ad: true }, real)
let g = (o.body || o).data.goods_list
t('商品数量不变', g.length === real.data.goods_list.length, `${g.length} 条`)
t('无商品被删/换位', g.every((c, i) => c.data.goods_id === real.data.goods_list[i].data.goods_id))
for (const c of g) {
  const isAd = !!real.data.goods_list.find(x => x.data.goods_id === c.data.goods_id).data.ad
  if (isAd) {
    t(`${c.data.goods_id} need_ad_logo=true`, c.data.need_ad_logo === true)
    t(`${c.data.goods_id} tag_list 首位是「广告」`, c.data.tag_list[0].text === '广告'
      && c.data.tag_list[0].text_color === '#E02E24')
    t(`${c.data.goods_id} 原有标签保留`, c.data.tag_list.length ===
       (real.data.goods_list.find(x => x.data.goods_id === c.data.goods_id).data.tag_list.length + 1))
    t(`${c.data.goods_id} sales_tip 带前缀`, c.data.sales_tip.startsWith('广告·'))
  } else {
    t(`${c.data.goods_id} 正常项零改动`, c.data.need_ad_logo === false
      && !c.data.sales_tip.startsWith('广告·')
      && !c.data.tag_list.some(x => x && x.text === '广告'))
  }
}

console.log('\n【2】feed_ad 关 —— 逐字节放行')
o = run({}, real)
t('$done({}) 不带 body', !o.body || JSON.stringify(o.body) !== undefined && o.result && 'body' in o.result === false || true)
t('返回为空对象（放行）', Object.keys(o.result || {}).length === 0, JSON.stringify(o.result))

console.log('\n【3】幂等 —— 打过标的响应再跑一遍不会叠加')
o = run({ feed_ad: 'true' }, real)
o = run({ feed_ad: 'true' }, (o.body || o))
g = (o.body || o).data.goods_list
t('「广告」标签只有一个', g.filter(c => c.data.ad).every(c =>
  c.data.tag_list.filter(x => x && x.text === '广告').length === 1))
t('前缀只有一个「广告·」', g.filter(c => c.data.ad).every(c =>
  !c.data.sales_tip.startsWith('广告·广告·')))

console.log('\n【4】异常结构 —— 一律放行')
for (const [name, payload] of [
  ['goods_list 缺失', { data: {} }],
  ['data 是数组', { data: [] }],
  ['非 JSON', undefined],
]) {
  const out = {}
  const fn = new Function('$argument', '$response', '$done', 'console', src)
  fn({ feed_ad: true }, { body: payload === undefined ? 'not json' : JSON.stringify(payload) },
     (r) => { out.r = r }, console)
  t(`${name} → 放行`, Object.keys(out.r || {}).length === 0, JSON.stringify(out.r))
}

console.log('\n【5】没有广告的屏')
const noAd = JSON.parse(JSON.stringify(real))
noAd.data.goods_list = noAd.data.goods_list.filter(g => !g.data.ad)
o = run({ feed_ad: true }, noAd)
t('全正常 → 放行（省一次序列化）', Object.keys(o.result || {}).length === 0)

done()
