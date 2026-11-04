// v2.70：百补搜索结果页（tandy_vase.html?refer_page_name=subsidy_search_result）
// 商品在 stores.store.buiSSRData.ssrListData.list，字段是 goodsID / linkURL / rawPrice /
// customData.price_prefix_info —— 与常规百补页（tabStore）完全不同。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(join(HERE, '../src/subsidy.response.js'), 'utf8')
const HTML = readFileSync(join(HERE, 'search-page-fixture.html'), 'utf8')

let pass = 0, fail = 0
function t(name, ok, extra) {
  if (ok) { pass++; console.log('  ✅ ' + name) }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')) }
}

// dtk 假响应：3 个 gid，全部转链成功且 rate>0
const DTK = JSON.stringify({ data: { pdd: { data: [
  { code: '1', goods: { rate: 3.2, goods_name: '劲仔小鱼A', min_group_price: 4.99, commission_amount: '0.16' },
    item_link: 'https://mobile.yangkeduo.com/duo_coupon_landing.html?goods_id=967168859879&pid=1&cpsSign=CC_a',
    match: 'goods.html?goods_id=967168859879' },
  { code: '1', goods: { rate: 1.5, goods_name: '劲仔小鱼B', min_group_price: 13.65, commission_amount: '0.2' },
    item_link: 'https://mobile.yangkeduo.com/duo_coupon_landing.html?goods_id=1018996360167&pid=1&cpsSign=CC_b',
    match: 'goods.html?goods_id=1018996360167' },
  { code: '1', goods: { rate: 2.0, goods_name: '劲仔小鱼C', min_group_price: 5.59, commission_amount: '0.11' },
    item_link: 'https://mobile.yangkeduo.com/duo_coupon_landing.html?goods_id=751682936889&pid=1&cpsSign=CC_c',
    match: 'goods.html?goods_id=751682936889' },
] } } })

function run(args, body) {
  const store = {}
  const ps = { read: (k) => (k in store ? store[k] : null), write: (v, k) => { store[k] = v } }
  let httpN = 0
  const http = { post: (o, cb) => { httpN++; cb(null, {}, DTK) } }
  let out
  new Function('$argument', '$response', '$done', 'console', '$persistentStore', '$httpClient', SRC)(
    args, { body }, (r) => { out = r }, { log() {} }, ps, http)
  return { body: out && out.body, httpN, store }
}

const ARG = {
  search_stub: 'false', cps_label: true, cps_rewrite: 'true', cps_token: 'tok_x',
  no_anim: 'false', lightup_auto: 'false', lightup_popup: 'false',
  lucky_close: 'false', hud: 'false',
}

console.log('\n【搜索页】v2.70 buiSSRData.ssrListData 覆盖')
const r1 = run(ARG, HTML)
t('dtk 被调用（说明遍历到了商品）', r1.httpN === 1, 'httpN=' + r1.httpN)
t('customData.price_prefix_info 改为佣金', /"price_prefix_info":"佣金3\.2%"/.test(r1.body || ''))
t('linkURL 改写为 duo_coupon_landing', (r1.body || '').includes('"linkURL":"duo_coupon_landing.html?goods_id=967168859879'))
t('第二个商品佣金1.5%', /"price_prefix_info":"佣金1\.5%"/.test(r1.body || ''))
t('第三个商品佣金2%', /"price_prefix_info":"佣金2%"/.test(r1.body || ''))

console.log('\n【幂等】再跑一次不重复改')
const r2 = run(ARG, r1.body)
// 幂等时脚本 $done({})（无 body），等价于未改动
const body2 = r2.body === undefined ? r1.body : r2.body
const cnt2 = (body2.match(/price_prefix_info":"佣金/g) || []).length
t('第二次无改动（$done({})）', r2.body === undefined, '返回了 body')
t('佣金前缀恰好 3 处（不叠加）', cnt2 === 3, '实际 ' + cnt2)

console.log('\n【开关】cps_label=false 时不打标')
const r3 = run({ ...ARG, cps_label: 'false' }, HTML)
// 无改动时脚本 $done({})（无 body）—— 等价于原样放行
t('cps_label=false → 未改动', r3.body === undefined && r3.httpN === 0, `body=${r3.body === undefined ? 'none' : 'has'} httpN=${r3.httpN}`)

console.log('\n【不影响常规页】tabStore 形态仍走老路')
const normalHtml = '<html><body><script>window.rawData=' + JSON.stringify({
  stores: { store: { tabStore: { tabList: [{ subTabGoodsLists: [{ list: [
    { goodsId: 967168859879, activityPrice: 499, activityPriceWord: '券后', link_url: 'goods.html?goods_id=967168859879' },
  ] }] }] } } },
}) + ';</script></body></html>'
const r4 = run(ARG, normalHtml)
t('常规 tabStore 商品被改写', r4.httpN === 1 && /"activityPriceWord":"佣金3\.2%"/.test(r4.body || ''),
  `httpN=${r4.httpN} body=${r4.body ? 'has' : 'none'}`)

console.log('\n' + '='.repeat(56))
console.log(`通过 ${pass} · 失败 ${fail}`)
process.exit(fail ? 1 : 0)
