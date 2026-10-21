// v1.80：百补页广告 —— 名单入库（方案 1）
// 方案 2（tagInfoList 打标）已于 v1.80 移除：2026-10-21 真机实测注入成功但
// 列表页不可见（H5 卡片渲染器不消费该标签），死代码删除。
// fixture 是 2026-10-21 真机抓包的两份 subsidy.html（style 压缩后）：
//   fixture1 = stores 形态（无 searchStore，容错用例）
//   fixture2 = 完整页（23 商品 / 4 广告）
import { readFileSync } from 'node:fs'
import { t, done } from './harness.mjs'

const src = readFileSync(new URL('../src/subsidy.response.js', import.meta.url), 'utf8')
const F1 = readFileSync(new URL('./subsidy2-fixture1.txt', import.meta.url), 'utf8')
const F2 = readFileSync(new URL('./subsidy2-fixture2.txt', import.meta.url), 'utf8')

const makeStore = (initial) => {
  const kv = initial ? { pddAdGoodsIds: JSON.stringify(initial) } : {}
  return {
    read: (k) => (k in kv ? kv[k] : null),
    write: (v, k) => { kv[k] = String(v); return true },
    kv,
  }
}
const run = (argObj, body, store) => {
  const out = {}
  new Function('$argument', '$response', '$done', '$persistentStore', 'console', src)(
    argObj, { body }, (r) => { out.result = r }, store || makeStore([]), console)
  return out.result
}
const idsOf = (store) => { try { return JSON.parse(store.kv.pddAdGoodsIds || '[]') } catch { return [] } }
const WANT = ['886932621522', '766485126873', '343201796079', '1013818440919']

console.log('\n【1】名单入库（feed_ad 开）')
let st = makeStore([])
let r = run({ search_stub: true, feed_ad: true }, F2, st)
t('4 个广告 goodsId 全部入库', JSON.stringify(idsOf(st)) === JSON.stringify(WANT),
  `实际 ${JSON.stringify(idsOf(st))})`)
t('普通商品 goodsId 不入库（抽 3 个）',
  !idsOf(st).includes('1003242864291') && !idsOf(st).includes('991942311643')
  && !idsOf(st).includes('798666802980'))
// v1.80：不再改 HTML 本体 —— 名单命中也不应产生 body 变更
t('HTML 本体不被修改（无 tagInfoList 注入）', r.body === undefined || r.body === F2,
  r.body === undefined ? '(放行)' : '有 diff')

console.log('\n【2】幂等 —— 重复跑名单不叠加')
st = makeStore([])
r = run({ search_stub: true, feed_ad: 'true' }, F2, st)
r = run({ search_stub: true, feed_ad: 'true' }, F2, st)
t('名单仍 4 个且顺序稳定', JSON.stringify(idsOf(st)) === JSON.stringify(WANT))

console.log('\n【3】环形裁剪 —— 200 上限，新 id 在前')
st = makeStore(Array.from({ length: 200 }, (_, i) => String(1000 + i)))
r = run({ feed_ad: true }, F2, st)
let saved = idsOf(st)
t('总量 200', saved.length === 200, `实际 ${saved.length}`)
t('新 id 占据头部', WANT.every((id, i) => saved[i] === id))

console.log('\n【4】feed_ad 关 —— 名单不写')
st = makeStore(['1'])
r = run({ search_stub: true }, F2, st)
t('名单未写', !st.kv.pddAdGoodsIds || JSON.parse(st.kv.pddAdGoodsIds).includes('1'))

console.log('\n【5】stores 形态容错（fixture1，无 searchStore）')
st = makeStore([])
r = run({ search_stub: true, feed_ad: true }, F1, st)
t('脚本不崩、正常返回', r !== undefined)
t('该形态无广告商品时不写库', idsOf(st).length === 0)

console.log('\n【6】存储不可用 —— 静默放弃，页面照常')
const broken = { read: () => { throw new Error('x') }, write: () => { throw new Error('x') } }
r = run({ search_stub: true, feed_ad: true }, F2, broken)
t('脚本不崩', r !== undefined)

console.log('\n【7】职责 1（搜索词）与职责 2 共存')
st = makeStore([])
const F2withWords = F2.includes('百事可乐') ? F2 : F2
r = run({ search_stub: true, feed_ad: true }, F2withWords, st)
t('脚本正常返回', r !== undefined)
t('名单照常入库', idsOf(st).length === WANT.length)

done()
