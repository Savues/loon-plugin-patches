// v1.79：百补页广告 —— 方案 1（名单入库）+ 方案 2（tagInfoList 打标）
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
const parseBody = (r) => (r && typeof r.body === 'string' ? r.body : null)

const idsOf = (store) => { try { return JSON.parse(store.kv.pddAdGoodsIds || '[]') } catch { return [] } }
const WANT = ['886932621522', '766485126873', '343201796079', '1013818440919']

console.log('\n【1】方案 1：名单入库（feed_ad 开）')
let st = makeStore([])
let r = run({ search_stub: true, feed_ad: true }, F2, st)
t('4 个广告 goodsId 全部入库', JSON.stringify(idsOf(st)) === JSON.stringify(WANT),
  `实际 ${JSON.stringify(idsOf(st))})`)
t('普通商品 goodsId 不入库（抽 3 个）',
  !idsOf(st).includes('1003242864291') && !idsOf(st).includes('991942311643')
  && !idsOf(st).includes('798666802980'))

console.log('\n【2】方案 2：tagInfoList 头部插「广告」')
let b = parseBody(r)
const parseRaw = (bb) => {
  const i = bb.indexOf('window.rawData'); const j = bb.indexOf('{', i)
  let d = 0, ins = false, esc = false
  for (let k = j; k < bb.length; k++) {
    const ch = bb[k]
    if (esc) { esc = false; continue }
    if (ch === '\\') { esc = true; continue }
    if (ins) { if (ch === '"') ins = false; continue }
    if (ch === '"') ins = true
    else if (ch === '{') d++
    else if (ch === '}') { d--; if (d === 0) return JSON.parse(bb.slice(j, k + 1)) }
  }
}
const rawOut = parseRaw(b)
const adGoods = []
for (const t2 of rawOut.store.tabStore.tabList)
  for (const s of (t2.subTabGoodsLists || []))
    for (const g of (s.list || []))
      if (typeof g.ad === 'string') adGoods.push(g)
t('返回体里 ad 商品 4 个', adGoods.length === 4, `实际 ${adGoods.length}`)
for (const g of adGoods) {
  t(`${g.goodsId} tagInfoList 头部是「广告」`,
    g.tagInfoList[0] && g.tagInfoList[0].text === '广告' && g.tagInfoList[0].tag_id === 0)
}
t('原标签保留（旺旺：退货包运费/假一赔十/发货前可快速退款）',
  ['退货包运费', '假一赔十', '发货前可快速退款'].every(x =>
    adGoods.find(g => String(g.goodsId) === WANT[0]).tagInfoList.some(y => y.text === x)))
t('rawData 仍可整体解析', !!rawOut)
t('职责 1 照常：queryWords 已清空',
  JSON.stringify(rawOut.store.searchStore.queryWords) === '[]')

console.log('\n【3】幂等 —— 第二遍无变化时原样放行（$done({})）')
st = makeStore([])
r = run({ search_stub: true, feed_ad: 'true' }, F2, st)
b = parseBody(r)
r = run({ search_stub: true, feed_ad: 'true' }, b, st)
t('第二遍返回空对象（无变化 → 放行）', r && Object.keys(r).length === 0, JSON.stringify(r))
t('第一遍的产物仍正确：4 个标签',
  (b.match(/"text":"广告","type":0/g) || []).length === WANT.length,
  `实际 ${(b.match(/"text":"广告","type":0/g) || []).length}`)
t('名单仍 4 个', idsOf(st).length === 4)

console.log('\n【4】feed_ad 关 —— 名单不写、tagInfoList 不动，search_stub 照常')
st = makeStore(['1'])
r = run({ search_stub: true }, F2, st)
b = parseBody(r)
t('名单未写', !st.kv.pddAdGoodsIds || JSON.parse(st.kv.pddAdGoodsIds).includes('1'))
// F2 抓包时插件已把 queryWords 清成 []，职责 1 无可改 → 整体无变化 → 放行
t('无改动时放行（$done({})）', r && Object.keys(r).length === 0, JSON.stringify(r))
t('原文 tagInfoList 本就无「广告」标签', !(F2.match(/"text":"广告","type":0/g) || []).length)
t('原文 queryWords 已是空数组（抓包时插件在跑）',
  JSON.stringify(parseRaw(F2).store.searchStore.queryWords) === '[]')

console.log('\n【5】stores 形态容错（fixture1，无 searchStore）')
st = makeStore([])
r = run({ search_stub: true, feed_ad: true }, F1, st)
t('脚本不崩、正常返回', r !== undefined)
t('该形态无广告商品时不写库', idsOf(st).length === 0)

console.log('\n【6】存储不可用 —— 方案 1 静默放弃，方案 2 照常（页面打标不依赖存储）')
const broken = { read: () => { throw new Error('x') }, write: () => { throw new Error('x') } }
r = run({ search_stub: true, feed_ad: true }, F2, broken)
b = parseBody(r)
t('脚本不崩、body 正常返回', !!b)
t('tagInfoList 照常注入', (b.match(/"text":"广告","type":0/g) || []).length === WANT.length,
  `实际 ${(b.match(/"text":"广告","type":0/g) || []).length}`)

done()
