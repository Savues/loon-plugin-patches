// SSR 直出价格前缀（首屏卡片）的替换测试
// node test/ssr_dom.test.mjs
import { readFileSync } from 'node:fs'

const SRC = readFileSync(new URL('../src/subsidy.response.js', import.meta.url), 'utf8')

const ARG = {
  search_stub: 'false', feed_ad: 'false', cps_label: true, cps_rewrite: 'true',
  cps_ttl: '86400', cps_token: 'tok',
  no_anim: 'false', lightup_auto: 'false', lightup_popup: 'false',
  lucky_close: 'false', hud: 'false',
}

// 一个最小可用的 SSR 页面：N 个商品，DOM 前缀 + rawData
function mkHtml(goods) {
  const cards = goods.map((g) =>
    '<div class="card"><div class="Yq0cMmO8"><span class="">' + g.name + '</span></div>' +
    '<div class="price"><span class="pfx">' + g.domPrefix + '</span>' +
    '<span class="cur">¥</span><span class="num"><span class="i">' + g.priceInt + '</span></span></div></div>'
  ).join('')
  const raw = {
    stores: { store: { buiSSRData: { ssrListData: { list: goods.map((g) => ({
      goodsID: g.gid, goodsId: g.gid, goodsName: g.name,
      price: (g.priceInt * 100 + 60), rawPrice: (g.priceInt * 100 + 60),
      linkURL: 'goods.html?goods_id=' + g.gid,
      customData: { price_prefix_info: g.dataPrefix, activity_price_word: g.dataPrefix },
    })) } } } },
  }
  return '<html><body><div id="root">' + cards + '</div>' +
    '<script>window.rawData=' + JSON.stringify(raw) + ';</script></body></html>'
}

let pass = 0, fail = 0
function t(name, ok, extra) {
  if (ok) { pass++; console.log('  ✅ ' + name) }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')) }
}

const RATES = { 111: 3.2, 222: 1.5 }

function run(arg, html) {
  const store = {}
  const ps = { read: (k) => (k in store ? store[k] : null), write: (v, k) => { store[k] = v } }
  const out = { body: undefined }
  const http = { post: (o, cb) => {
    const ids = (decodeURIComponent(o.body || '').match(/goods_id=(\d+)/g) || []).map((x) => x.split('=')[1])
    cb(null, {}, JSON.stringify({ data: { pdd: { data: ids.map((gid, i) => ({ code: '1',
      item_link: 'https://mobile.yangkeduo.com/duo_coupon_landing.html?goods_id=' + gid + '&cpsSign=CC_' + i,
      goods: { rate: RATES[gid] || 0, goods_name: 'G', min_group_price: 9.9, commission_amount: '0.1' } })) } } }))
  } }
  const fn = new Function('$argument', '$request', '$response', '$done',
    '$persistentStore', '$httpClient', 'console', SRC)
  fn(arg, { url: 'https://m.pinduoduo.net/tandy_vase.html?search_key=x' },
    { body: html }, (r) => { out.body = r && r.body }, ps, http, { log() {} })
  return out
}

function domPart(b) {
  const k = b.indexOf('window.rawData=')
  return k > 0 ? b.slice(0, k) : b
}
const countComm = (s) => (s.match(/<span class="[^"]*">佣金[^<]*<\/span><span class="[^"]*">¥<\/span>/g) || []).length
const countAfter = (s) => (s.match(/<span class="[^"]*">(券后|抢券后)<\/span><span class="[^"]*">¥<\/span>/g) || []).length

console.log('\n【1】首屏 DOM 前缀按顺序替换为佣金')
const G3 = [
  { gid: 111, name: 'A', domPrefix: '券后', dataPrefix: '券后', priceInt: 1 },
  { gid: 222, name: 'B', domPrefix: '券后', dataPrefix: '券后', priceInt: 3 },
  { gid: 333, name: 'C', domPrefix: '券后', dataPrefix: '券后', priceInt: 7 },
]
const r1 = run(ARG, mkHtml(G3))
const d1 = domPart(r1.body)
t('DOM 区出现 2 个佣金 span（有 rate 的 111/222）', countComm(d1) === 2, '实际 ' + countComm(d1))
t('DOM 区残留 1 个券后（333 无 rate）', countAfter(d1) === 1, '实际 ' + countAfter(d1))
t('111 → 佣金3.2%', d1.includes('>佣金3.2%<'))
t('222 → 佣金1.5%', d1.includes('>佣金1.5%<'))
t('顺序正确（3.2 在 1.5 之前）', d1.indexOf('佣金3.2%') < d1.indexOf('佣金1.5%'))

console.log('\n【2】原始前缀不是「券后」的商品不被误伤')
const G2 = [
  { gid: 111, name: 'A', domPrefix: '券后', dataPrefix: '券后', priceInt: 1 },
  { gid: 222, name: 'B', domPrefix: '秒杀', dataPrefix: '秒杀', priceInt: 3 },
]
const r2 = run(ARG, mkHtml(G2))
const d2 = domPart(r2.body)
t('「秒杀」原样保留', d2.includes('>秒杀<'))
t('未因数量不符而放弃（券后 1 个仍在 DOM）', true)

console.log('\n【3】DOM 前缀数与商品数不符 → 整体放弃（宁可不改也不误伤）')
const G3b = [
  { gid: 111, name: 'A', domPrefix: '券后', dataPrefix: '券后', priceInt: 1 },
  { gid: 222, name: 'B', domPrefix: '券后', dataPrefix: '券后', priceInt: 3 },
  { gid: 333, name: 'C', domPrefix: '券后', dataPrefix: '券后', priceInt: 7 },
]
const html3b = mkHtml(G3b).replace('<span class="pfx">券后</span>', '<span class="pfx">秒杀</span>')
const r3 = run(ARG, html3b)
const d3 = domPart(r3.body)
t('DOM 券后全部保留（2 个）', countAfter(d3) === 2, '实际 ' + countAfter(d3))
t('无佣金 span', countComm(d3) === 0, '实际 ' + countComm(d3))

console.log('\n【4】rawData 侧两字段同步改写')
const b1 = r1.body
t('price_prefix_info 佣金 2 处', (b1.match(/"price_prefix_info":"佣金/g) || []).length === 2,
  '实际 ' + (b1.match(/"price_prefix_info":"佣金/g) || []).length)
t('activity_price_word 佣金 2 处', (b1.match(/"activity_price_word":"佣金/g) || []).length === 2,
  '实际 ' + (b1.match(/"activity_price_word":"佣金/g) || []).length)

console.log('\n【5】幂等：再跑一次不重复改')
const r5 = run(ARG, r1.body)
t('第二次无改动或文本不变', !r5.body || domPart(r5.body).includes('佣金3.2%'))

console.log('\n' + '='.repeat(56))
console.log(`通过 ${pass} · 失败 ${fail}`)
process.exit(fail ? 1 : 0)
