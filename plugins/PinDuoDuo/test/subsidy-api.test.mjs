// subsidy_api.response.js 的回归测试：百补列表「上拉加载」分页接口的广告角标
// fixture 来自 2026-10-22 真机抓包 383_1792646492521：
//   POST /api/brand-sega/special-sale-coupon/goods_list → { result: { goods_list: [...] } }
//   实测该接口一次 20 条，10 条带 ad（bkfl=1 + join_id + pkinfo）——与信息流判据同构。
// 关键背景（v1.94 的根因）：
//   首屏商品在 tandy_vase.html 的 rawData 里（HTML 通道，subsidy.response.js 负责）；
//   上拉加载的后续商品走这个 JSON 接口 —— 旧版本只改 HTML，
//   所以手机上往下翻的广告商品一条角标都没有。
import { readFileSync } from 'node:fs'
import { t, done } from './harness.mjs'

const src = readFileSync(new URL('../src/subsidy_api.response.js', import.meta.url), 'utf8')
const FIX = readFileSync(new URL('./subsidy-api-fixture.json', import.meta.url), 'utf8')
const BADGE = readFileSync(new URL('../src/assets/ad-badge.png', import.meta.url))

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
const isAd = (it) => !!it.ad && Object.keys(it.ad).length > 0

console.log('\n【1】开关语义')
t('feed_ad 关 → 完全放行', (() => { const r = run({ feed_ad: 'false' }, FIX); return r && Object.keys(r).length === 0 })())
t('开关缺失 → 完全放行', (() => { const r = run({}, FIX); return r && Object.keys(r).length === 0 })())
t('开关开 → 有改动', (() => { const r = run({ feed_ad: 'true' }, FIX); return !!(r && r.body) })())
t('非 JSON body → 放行', (() => { const r = run({ feed_ad: 'true' }, '<html>not json</html>'); return r && Object.keys(r).length === 0 })())
t('空 body → 放行', (() => { const r = run({ feed_ad: 'true' }, ''); return r && Object.keys(r).length === 0 })())

console.log('\n【2】广告条目打角标')
const st = makeStore([])
const r = run({ feed_ad: 'true' }, FIX, st)
t('响应体被改写', typeof r.body === 'string' && r.body !== FIX)
const j = JSON.parse(r.body)
const list = j.result.goods_list
const ads = list.filter(isAd)
const nors = list.filter((x) => !isAd(x))
t('fixture 里广告 5 条 / 非广告 5 条', ads.length === 5 && nors.length === 5, `${ads.length}/${nors.length}`)
for (const it of ads) {
  t(`${it.goods_id} lt_icon 写入 data URI`, String(it.lt_icon || '').startsWith('data:image/png;base64,'))
}
t('非广告条目零改动（不写 lt_icon）', nors.every((x) => x.lt_icon === undefined))
t('官方旗标 goods_flag_icon 未被动', ads.every((x) => (x.goods_flag_icon || []).every((u) => !String(u).startsWith('data:'))))
t('广告 goods_id 全部入名单', idsOf(st).length === ads.length, `名单 ${JSON.stringify(idsOf(st))}`)
t('名单里都是广告商品的 id', ads.every((x) => idsOf(st).includes(String(x.goods_id))))

console.log('\n【3】data URI 与资产逐字节一致')
const uri = src.match(/AD_BADGE_URL = 'data:image\/png;base64,([^']+)'/)
t('脚本内联了 data URI', !!uri)
t('data URI == src/assets/ad-badge.png', !!uri && Buffer.from(uri[1], 'base64').equals(BADGE))
t('资产是合法 PNG', BADGE[0] === 0x89 && BADGE[1] === 0x50 && BADGE[2] === 0x4E && BADGE[3] === 0x47)
t('资产尺寸 184×208（角标槽 0.46rem×0.52rem 的比例 0.885）',
  BADGE.readUInt32BE(16) === 184 && BADGE.readUInt32BE(20) === 208)

console.log('\n【4】幂等')
const st2 = makeStore([])
const r1 = run({ feed_ad: 'true' }, FIX, st2)
const r2 = run({ feed_ad: 'true' }, r1.body, st2)
t('第二遍无变化 → 放行', r2 && Object.keys(r2).length === 0, JSON.stringify(r2))

console.log('\n【5】名单容量与去重')
const st3 = makeStore(Array.from({ length: 199 }, (_, i) => String(900000 + i)))
const r3 = run({ feed_ad: 'true' }, FIX, st3)
t('名单不超上限 200', idsOf(st3).length <= 200, `实际 ${idsOf(st3).length}`)
t('新广告 id 排在前面', idsOf(st3)[0] === String(ads[0].goods_id))

done()
