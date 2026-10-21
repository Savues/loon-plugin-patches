// v1.81：百补页广告 —— 名单入库（方案 1）+ 三通道可见打标（真机消融实验）
// fixture 是 2026-10-21 真机抓包的两份 subsidy.html（style 压缩后）：
//   fixture1 = stores 形态（无 searchStore，容错用例）
//   fixture2 = 完整页（23 商品 / 4 广告）
// 历史教训：v1.79 的 tagInfoList 注入数据层成功但真机不可见（已证伪）——
// 本文件只断言数据层；「哪个通道真正渲染」必须真机消融。
import { readFileSync } from 'node:fs'
import { t, done } from './harness.mjs'

const src = readFileSync(new URL('../src/subsidy.response.js', import.meta.url), 'utf8')
const F1 = readFileSync(new URL('./subsidy2-fixture1.txt', import.meta.url), 'utf8')
const F2 = readFileSync(new URL('./subsidy2-fixture2.txt', import.meta.url), 'utf8')
const BADGE = readFileSync(new URL('../src/assets/ad-badge.png', import.meta.url))
// PNG 魔数 + 尺寸（IHDR），防止资产被意外替换成非图片
t('徽章资产是合法 PNG', BADGE[0] === 0x89 && BADGE[1] === 0x50 && BADGE[2] === 0x4E && BADGE[3] === 0x47)
t('徽章资产尺寸 530×150（与官方百补徽章同比例）',
  BADGE.readUInt32BE(16) === 530 && BADGE.readUInt32BE(20) === 150)

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
const idsOf = (store) => { try { return JSON.parse(store.kv.pddAdGoodsIds || '[]') } catch { return [] } }
const WANT = ['886932621522', '766485126873', '343201796079', '1013818440919']

console.log('\n【1】方案 1：名单入库')
let st = makeStore([])
let r = run({ search_stub: true, feed_ad: true }, F2, st)
t('4 个广告 goodsId 全部入库', JSON.stringify(idsOf(st)) === JSON.stringify(WANT),
  `实际 ${JSON.stringify(idsOf(st))})`)
t('普通商品 goodsId 不入库（抽 3 个）',
  !idsOf(st).includes('1003242864291') && !idsOf(st).includes('991942311643')
  && !idsOf(st).includes('798666802980'))

console.log('\n【2】四通道打标（v1.82：+goodsFlagIcon/ltIcon 主瀑布流槽位）')
let b = r.body
t('HTML 本体被修改（打标需要回写）', typeof b === 'string' && b !== F2)
const rawOut = parseRaw(b)
const adGoods = []
let norGoods = []
for (const t2 of rawOut.store.tabStore.tabList)
  for (const s of (t2.subTabGoodsLists || []))
    for (const g of (s.list || []))
      (typeof g.ad === 'string' ? adGoods : norGoods).push(g)
t('返回体里 ad 商品 4 个', adGoods.length === 4, `实际 ${adGoods.length}`)
for (const g of adGoods) {
  t(`${g.goodsId} ① 价格词前缀`, (g.activityPriceWord || '').startsWith('广告·'),
    `实际 ${g.activityPriceWord}`)
  t(`${g.goodsId} ② 销量行前缀`, (g.salesTip || '').startsWith('广告·'), `实际 ${g.salesTip}`)
  t(`${g.goodsId} ③ 徽章头部`, g.titleTop[0] && g.titleTop[0].text === '广告'
    && g.titleTop[0].url === 'https://cdn.jsdelivr.net/gh/Savues/loon-plugin-patches@main/plugins/PinDuoDuo/src/assets/ad-badge.png')
  t(`${g.goodsId} ④ goodsFlagIcon 头部`, String(g.goodsFlagIcon[0]).includes('ad-badge.png'))
  t(`${g.goodsId} ④ ltIcon 头部（原 URL 保留在数组里）`,
  Array.isArray(g.ltIcon) && String(g.ltIcon[0]).includes('ad-badge.png')
    && g.ltIcon.length >= 2)
}
t('官方百补徽章仍在（不误伤）',
  adGoods.every(g => g.titleTop.some(x => x.type === 'area221_bybt')
    && g.goodsFlagIcon.some(u => String(u).includes('baiyi'))))
t('普通商品四通道零改动',
  norGoods.every(g => !(g.activityPriceWord || '').startsWith('广告·')
    && !(g.salesTip || '').startsWith('广告·')
    && !(g.titleTop || []).some(x => x.text === '广告')
    && !String(g.ltIcon || '').includes('ad-badge')
    && !(g.goodsFlagIcon || []).some(u => String(u).includes('ad-badge'))))
t('职责 1 照常：queryWords 已清空',
  JSON.stringify(rawOut.store.searchStore.queryWords) === '[]')
t('rawData 之外的字节未动（只回写 rawData 区间）', (() => {
  const cut = (s) => {
    const i = s.indexOf('window.rawData'); const j = s.indexOf('{', i)
    let d = 0, ins = false, esc = false, end = -1
    for (let k = j; k < s.length; k++) {
      const ch = s[k]
      if (esc) { esc = false; continue }
      if (ch === '\\') { esc = true; continue }
      if (ins) { if (ch === '"') ins = false; continue }
      if (ch === '"') ins = true
      else if (ch === '{') d++
      else if (ch === '}') { d--; if (d === 0) { end = k + 1; break } }
    }
    return s.slice(0, j) + s.slice(end)
  }
  return cut(F2) === cut(b)
})())

console.log('\n【3】幂等 —— 第二遍无变化时原样放行')
st = makeStore([])
r = run({ search_stub: true, feed_ad: 'true' }, F2, st)
b = r.body
r = run({ search_stub: true, feed_ad: 'true' }, b, st)
t('第二遍返回空对象（无变化 → 放行）', r && Object.keys(r).length === 0, JSON.stringify(r))
t('第一遍的产物仍正确：名单 4 个', idsOf(st).length === 4)

console.log('\n【4】feed_ad 关 —— 名单不写、HTML 不动')
st = makeStore(['1'])
r = run({ search_stub: true }, F2, st)
t('名单未写', !st.kv.pddAdGoodsIds || JSON.parse(st.kv.pddAdGoodsIds).includes('1'))
t('无改动时放行（$done({})）', r && Object.keys(r).length === 0, JSON.stringify(r))

console.log('\n【5】tandy_vase.html 新模板（v1.82：URL + stores-dict 形态双修复）')
const FT = readFileSync(new URL('./tandy-fixture.txt', import.meta.url), 'utf8')
st = makeStore([])
r = run({ search_stub: true, feed_ad: true }, FT, st)
t('脚本正常返回且 HTML 被修改', !!r.body && r.body !== FT)
t('8 个广告 goodsId 入库', JSON.stringify(idsOf(st)) === JSON.stringify([
  '925737619964', '986125503923', '992912541277', '961719294261',
  '962936956396', '734362509181', '740335689339', '627272059171']),
  `实际 ${JSON.stringify(idsOf(st))})`)
const rawT = parseRaw(r.body)
t('四通道全部写入（价格词×16 / 徽章：titleTop8+flagIcon8+ltIcon8=24）',
  (r.body.match(/广告·/g) || []).length >= 16
  && (r.body.match(/ad-badge\.png/g) || []).length === 24,
  `广告· ${(r.body.match(/广告·/g) || []).length} 处 / 徽章 ${(r.body.match(/ad-badge\.png/g) || []).length} 处`)
t('旧模板（brand_activity_subsidy）仍正常', (() => {
  const s2 = makeStore([])
  const r2 = run({ search_stub: true, feed_ad: true }, F2, s2)
  return idsOf(s2).length === WANT.length && !!r2.body
})())

console.log('\n【7】stores 形态（fixture1，v1.79 时代误判「无广告」，实为收集器 bug）')
st = makeStore([])
r = run({ search_stub: true, feed_ad: true }, F1, st)
t('脚本不崩、正常返回', r !== undefined)
t('现在能收集到 2 个广告 goodsId（含 Tafe 766485126873）',
  JSON.stringify(idsOf(st)) === JSON.stringify(['1003242864291', '766485126873']),
  `实际 ${JSON.stringify(idsOf(st))})`)
t('HTML 四通道写入（2 广告 × 3 处徽章位）',
  !!r.body && (r.body.match(/ad-badge\.png/g) || []).length === 6)

console.log('\n【6】存储不可用 —— 方案 1 静默放弃，三通道照常')
const broken = { read: () => { throw new Error('x') }, write: () => { throw new Error('x') } }
r = run({ search_stub: true, feed_ad: true }, F2, broken)
b = r.body
t('脚本不崩、body 正常返回', !!b)
t('四通道照常注入', (b.match(/广告·/g) || []).length >= 8
  && (b.match(/ad-badge\.png/g) || []).length === 12)

done()
