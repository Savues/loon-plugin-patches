// 百补搜索结果 API（/search?biz_id=brand_special_sale）的佣金改写测试
// node test/search_api.test.mjs
import { readFileSync } from 'node:fs'

const SRC = readFileSync(new URL('../src/subsidy.response.js', import.meta.url), 'utf8')

const API_URL = 'https://api.pinduoduo.com/search?scene_id=343836&q=%E8%96%AF%E7%89%87&biz_id=brand_special_sale&size=50'
const PLAIN_URL = 'https://api.pinduoduo.com/search?scene_id=1&q=abc'

const ARG = {
  search_stub: true, feed_ad: 'false', cps_label: true, cps_rewrite: 'true',
  cps_ttl: '86400', cps_token: 'tok',
  no_anim: 'false', lightup_auto: 'false', lightup_popup: 'false',
  lucky_close: 'false', hud: 'false',
}

function mkBody() {
  return JSON.stringify({
    expansion: { foo: 1 },
    total: 300,
    items: [
      { goods_id: 111, goods_name: 'A', price: 461, link_url: 'goods.html?goods_id=111',
        price_prefix_info: '券后', activity_price_word: '券后',
        price_prefix_content: { short_price_prefix: { content: '券后' } } },
      { goods_id: 222, goods_name: 'B', price: 2640, link_url: 'goods.html?goods_id=222',
        price_prefix_info: '券后', activity_price_word: '券后' },
      { goods_id: 333, goods_name: 'C', price: 560, link_url: 'goods.html?goods_id=333',
        price_prefix_info: '券后', activity_price_word: '券后' },
    ],
  })
}

let pass = 0, fail = 0
function t(name, ok, extra) {
  if (ok) { pass++; console.log('  ✅ ' + name) }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')) }
}

function run(arg, url, body, rates) {
  const store = {}
  const ps = { read: (k) => (k in store ? store[k] : null), write: (v, k) => { store[k] = v } }
  const out = { body: undefined, httpN: 0 }
  const http = {
    post(o, cb) {
      out.httpN++
      const data = Object.keys(rates).map((gid) => ({
        code: '1',
        item_link: 'https://mobile.yangkeduo.com/duo_coupon_landing.html?goods_id=' + gid + '&cpsSign=CC_x',
        goods: { rate: rates[gid], goods_name: 'g' + gid, min_group_price: 9.9, commission_amount: '0.1' },
      }))
      cb(null, {}, JSON.stringify({ data: { pdd: { data } } }))
    },
  }
  const fn = new Function('$argument', '$request', '$response', '$done',
    '$persistentStore', '$httpClient', 'console', SRC)
  fn(arg, { url }, { body }, (r) => { out.body = r && r.body }, ps, http, { log() {} })
  return out
}

const RATES = { 111: 3.2, 222: 0.1 }

console.log('\n【1】百补搜索 API：佣金写进 price_prefix_info + activity_price_word')
const r1 = run(ARG, API_URL, mkBody(), RATES)
const j1 = JSON.parse(r1.body)
t('HTTP 调用 1 次', r1.httpN === 1, 'httpN=' + r1.httpN)
t('price_prefix_info 改为 佣金3.2%', j1.items[0].price_prefix_info === '佣金3.2%', j1.items[0].price_prefix_info)
t('activity_price_word 同步改为 佣金3.2%', j1.items[0].activity_price_word === '佣金3.2%', j1.items[0].activity_price_word)
t('第二个商品 佣金0.1%', j1.items[1].activity_price_word === '佣金0.1%', j1.items[1].activity_price_word)
t('无 rate 的商品保持券后', j1.items[2].activity_price_word === '券后', j1.items[2].activity_price_word)
t('link_url 已转链', j1.items[0].link_url.startsWith('duo_coupon_landing.html'), j1.items[0].link_url)
t('search_stub 删掉 expansion', !('expansion' in j1))

console.log('\n【2】search_stub 关闭 → expansion 保留')
const r2 = run({ ...ARG, search_stub: false }, API_URL, mkBody(), RATES)
const j2 = JSON.parse(r2.body)
t('expansion 仍在', 'expansion' in j2)
t('佣金仍改写', j2.items[0].activity_price_word === '佣金3.2%')

console.log('\n【3】无可识别商品的搜索 → 原样放行')
// v2.74：入口不再按 biz_id 判断（主搜索 source=index 也走这里），
// 改成按 items 里有没有可识别的商品结构判断
const plainBody = JSON.stringify({ items: [{ foo: 'bar' }, { item_data: { other: 1 } }] })
const r3 = run(ARG, PLAIN_URL, plainBody, RATES)
t('未改动（$done({})）', r3.body === undefined, r3.body === undefined ? '' : '返回了 body')
t('未请求大淘客', r3.httpN === 0, 'httpN=' + r3.httpN)

console.log('\n【3b】主搜索 source=index（items[].item_data.goods_model）')
const hubBody = JSON.stringify({ items: [
  { item_type: 0, item_data: { goods_model: { goods_id: 111,
      link_url: 'goods.html?goods_id=111', price_prefix_info: '限1件',
      price_prefix_content: { short_price_prefix: { content: '券后' }, long_price_prefix: { content: '限1件' } } } } },
  { item_type: 1, item_data: { goods_model: { goods_id: 222,
      link_url: 'goods.html?goods_id=222', price_prefix_info: '秒杀价',
      price_prefix_content: { short_price_prefix: { content: '秒杀' }, long_price_prefix: { content: '秒杀价' } } } } },
] })
const r3b = run(ARG, 'https://api.pinduoduo.com/search?source=index&pdduid=x', hubBody, RATES)
const j3b = r3b.body ? JSON.parse(r3b.body) : null
const g3b = j3b ? j3b.items.map((x) => x.item_data.goods_model) : []
t('dtk 调用 1 次', r3b.httpN === 1, 'httpN=' + r3b.httpN)
t('price_prefix_info 改 佣金3.2%', g3b[0] && g3b[0].price_prefix_info === '佣金3.2%', g3b[0] && g3b[0].price_prefix_info)
t('short_price_prefix 也改（不跳过任何字段）', g3b[0] && g3b[0].price_prefix_content.short_price_prefix.content === '佣金3.2%')
t('long_price_prefix 也改', g3b[0] && g3b[0].price_prefix_content.long_price_prefix.content === '佣金3.2%')
t('第二个商品同样改写（rate 0.1 → 佣金0.1%）', g3b[1] && g3b[1].price_prefix_info === '佣金0.1%', g3b[1] && g3b[1].price_prefix_info)
t('link_url 转链', !!(g3b[0] && g3b[0].link_url.indexOf('duo_coupon_landing') === 0))

console.log('\n【4】HTML 页不受影响（无 rawData 时原样放行）')
const r4 = run(ARG, 'https://m.pinduoduo.net/tandy_vase.html?x=1', '<html><body>hi</body></html>', RATES)
t('未改动', r4.body === undefined)

console.log('\n【5】异常输入不崩')
t('空 body', run(ARG, API_URL, '', RATES).body === undefined)
t('非 JSON', run(ARG, API_URL, 'not json', RATES).body === undefined)
t('无 items', run(ARG, API_URL, '{"total":1}', RATES).body === undefined ||
  JSON.parse(run(ARG, API_URL, '{"total":1}', RATES).body).total === 1)

console.log('\n【6】缓存命中不重复请求')
// 只用有 rate 的商品（333 无 rate 不缓存，下次必须重查 —— 这是预期行为）
const mkBodyOne = () => JSON.stringify({
  items: [{ goods_id: 111, link_url: 'goods.html?goods_id=111',
            price_prefix_info: '券后', activity_price_word: '券后' }],
})
const store = {}
const ps = { read: (k) => (k in store ? store[k] : null), write: (v, k) => { store[k] = v } }
let httpN = 0
const http = { post: (o, cb) => { httpN++; cb(null, {}, JSON.stringify({ data: { pdd: { data: Object.keys(RATES).map((g) => ({ code: '1', item_link: 'https://mobile.yangkeduo.com/duo_coupon_landing.html?goods_id=' + g + '&cpsSign=CC_x', goods: { rate: RATES[g] } })) } } })) } }
const fn = new Function('$argument', '$request', '$response', '$done', '$persistentStore', '$httpClient', 'console', SRC)
fn(ARG, { url: API_URL }, { body: mkBodyOne() }, () => {}, ps, http, { log() {} })
httpN = 0
let out2
fn(ARG, { url: API_URL }, { body: mkBodyOne() }, (r) => { out2 = r }, ps, http, { log() {} })
t('第二次命中缓存不请求', httpN === 0, 'httpN=' + httpN)
t('第二次仍改写佣金', out2 && out2.body && JSON.parse(out2.body).items[0].activity_price_word === '佣金3.2%')

console.log('\n' + '='.repeat(56))
console.log(`通过 ${pass} · 失败 ${fail}`)
process.exit(fail ? 1 : 0)
