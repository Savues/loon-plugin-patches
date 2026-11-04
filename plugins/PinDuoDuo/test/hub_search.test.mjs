// v2.73：百补首页搜索框进来的搜索页（brand_activity_search_result.html）
// 商品在 store.commonGoodsInfoStoreUnderlineV3.goodsInfoMap
//   key = "BYBT_SEARCH@<sn>"，靠 goodsIdUnionIdMap 反查 goodsId
// 前缀有 5 种：今日疯抢 / 本周热卖 / 仅一次 / 只剩2天 / 券后，每个商品只显示一种
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(join(HERE, '../src/subsidy.response.js'), 'utf8')

let pass = 0, fail = 0
function t(name, ok, extra) {
  if (ok) { pass++; console.log('  ✅ ' + name) }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')) }
}

const DTK = JSON.stringify({ data: { pdd: { data: [
  { code: '1', goods: { rate: 3.2, goods_name: 'A', min_group_price: 3.5, commission_amount: '0.11' },
    item_link: 'https://mobile.yangkeduo.com/duo_coupon_landing.html?goods_id=111&pid=1&cpsSign=CC_a' },
  { code: '1', goods: { rate: 1.5, goods_name: 'B', min_group_price: 1.6, commission_amount: '0.02' },
    item_link: 'https://mobile.yangkeduo.com/duo_coupon_landing.html?goods_id=222&pid=1&cpsSign=CC_b' },
  { code: '1', goods: { rate: 2.0, goods_name: 'C', min_group_price: 5.4, commission_amount: '0.1' },
    item_link: 'https://mobile.yangkeduo.com/duo_coupon_landing.html?goods_id=333&pid=1&cpsSign=CC_c' },
] } } })

function mkHtml() {
  const gim = {
    'BYBT_SEARCH@snA': { activity_price_word_before_tag: { text: '今日疯抢', type: 'crazy_today_tag' }, activity_price_word: '券后', activity_price: 350 },
    'BYBT_SEARCH@snB': { activity_price_word_before_tag: { text: '只剩2天', type: 'countdown_tag' }, activity_price_word: '券后', activity_price: 160 },
    'BYBT_SEARCH@snC': { activity_price_word: '券后', activity_price: 540 },
  }
  const list = [
    { goodsID: 111, linkURL: 'goods.html?goods_id=111', rawPrice: 350, customData: { refresh_goods_sn: 'snA', activity_price_word: '券后', activity_price_word_before_tag: { text: '今日疯抢', type: 'crazy_today_tag' } } },
    { goodsID: 222, linkURL: 'goods.html?goods_id=222', rawPrice: 160, customData: { refresh_goods_sn: 'snB', activity_price_word: '券后', activity_price_word_before_tag: { text: '只剩2天', type: 'countdown_tag' } } },
    { goodsID: 333, linkURL: 'goods.html?goods_id=333', rawPrice: 540, customData: { refresh_goods_sn: 'snC', activity_price_word: '券后' } },
  ]
  const raw = { store: {
    commonGoodsInfoStoreUnderlineV3: {
      goodsIdUnionIdMap: { 111: 'BYBT_SEARCH@snA', 222: 'BYBT_SEARCH@snB', 333: 'BYBT_SEARCH@snC' },
      goodsInfoMap: gim,
    },
    buiSSRData: { ssrListData: { list } },
  } }
  return '<html><body><script>window.rawData=' + JSON.stringify(raw) + '</script></body></html>'
}

function run(args) {
  const store = {}
  const ps = { read: (k) => (k in store ? store[k] : null), write: (v, k) => { store[k] = v } }
  let httpN = 0
  const http = { post: (o, cb) => { httpN++; cb(null, {}, DTK) } }
  let out
  new Function('$argument', '$response', '$done', 'console', '$persistentStore', '$httpClient', SRC)(
    args, { body: mkHtml() }, (r) => { out = r }, { log() {} }, ps, http)
  return { body: out && out.body, httpN }
}

const ARG = {
  search_stub: 'false', cps_label: true, cps_rewrite: 'true', cps_token: 'tok_x',
  no_anim: 'false', lightup_auto: 'false', lightup_popup: 'false',
  lucky_close: 'false', hud: 'false',
}

console.log('【1】goodsInfoMap + customData 两侧全部改写')
const r1 = run(ARG); const b1 = r1.body || ''
const j1 = JSON.parse(b1.slice(b1.indexOf('window.rawData=') + 'window.rawData='.length, b1.lastIndexOf('</script>')))
const st1 = j1.store
const gim1 = st1.commonGoodsInfoStoreUnderlineV3.goodsInfoMap
const lst1 = st1.buiSSRData.ssrListData.list
t('dtk 调用 1 次', r1.httpN === 1, 'httpN=' + r1.httpN)
t('goodsInfoMap[A] 佣金3.2%', gim1['BYBT_SEARCH@snA'].activity_price_word === '佣金3.2%')
t('goodsInfoMap[A] before_tag 今日疯抢→佣金', gim1['BYBT_SEARCH@snA'].activity_price_word_before_tag.text === '佣金3.2%')
t('goodsInfoMap[A] type 保留', gim1['BYBT_SEARCH@snA'].activity_price_word_before_tag.type === 'crazy_today_tag')
t('goodsInfoMap[B] 只剩2天→佣金1.5%', gim1['BYBT_SEARCH@snB'].activity_price_word_before_tag.text === '佣金1.5%')
t('goodsInfoMap[C] 无 before_tag 只改 word', gim1['BYBT_SEARCH@snC'].activity_price_word === '佣金2%')
t('customData[A] 佣金3.2%', lst1[0].customData.activity_price_word === '佣金3.2%')
t('customData[A] before_tag 改', lst1[0].customData.activity_price_word_before_tag.text === '佣金3.2%')
t('customData[C] 佣金2%', lst1[2].customData.activity_price_word === '佣金2%')
t('linkURL 转链 3 个', (b1.match(/"linkURL":"duo_coupon_landing/g) || []).length === 3, String((b1.match(/"linkURL":"duo_coupon_landing/g) || []).length))

console.log('\n【2】幂等：把第一次输出再跑一次')
const store2 = {}
function runBody(store, args, body) {
  const ps = { read: (k) => (k in store ? store[k] : null), write: (v, k) => { store[k] = v } }
  let out
  const http = { post: (o, cb) => { cb(null, {}, DTK) } }
  new Function('$argument', '$response', '$done', 'console', '$persistentStore', '$httpClient', SRC)(
    args, { body }, (r) => { out = r }, { log() {} }, ps, http)
  return out && out.body
}
const b2a = runBody(store2, ARG, mkHtml())
const b2b = runBody(store2, ARG, b2a)
t('第二次无改动（$done({})）', !b2b, b2b ? '有 body' : '')

console.log('\n【3】cps_label=false 不打标')
const r3 = run({ ...ARG, cps_label: 'false' })
t('无改动', !r3.body, r3.body ? '有 body' : '')
t('未调 dtk', r3.httpN === 0, 'httpN=' + r3.httpN)

console.log('\n【4】普通百补页不受影响（tabStore goodsInfoMap）')
const tabHtml = '<html><body><script>window.rawData={"store":{"tabStore":{"tab1":{"goodsInfoMap":{"BYBT_MAIN_999":{"activity_price_word":"券后","activity_price":100}}}}}}</script></body></html>'
const store4 = {}
const ps4 = { read: (k) => (k in store4 ? store4[k] : null), write: (v, k) => { store4[k] = v } }
let out4
const http4 = { post: (o, cb) => { cb(null, {}, JSON.stringify({ data: { pdd: { data: [{ code: '1', goods: { rate: 4.0 }, item_link: 'https://mobile.yangkeduo.com/duo_coupon_landing.html?goods_id=999&cpsSign=CC_z' }] } } })) } }
new Function('$argument', '$response', '$done', 'console', '$persistentStore', '$httpClient', SRC)(
  ARG, { body: tabHtml }, (r) => { out4 = r }, { log() {} }, ps4, http4)
const b4 = out4 && out4.body
t('老结构仍被改写', !!(b4 && b4.indexOf('佣金4%') > 0), b4 ? '未命中' : '无改动')

console.log('\n' + '='.repeat(56))
console.log(`通过 ${pass} · 失败 ${fail}`)
process.exit(fail ? 1 : 0)
