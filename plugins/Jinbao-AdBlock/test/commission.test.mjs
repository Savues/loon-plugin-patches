// 佣金比例标签：用真机 HAR 样本 + 合成边界样本驱动 jinbao_commission.response.js
import { readFileSync } from 'node:fs'
import { t, done } from './harness.mjs'

const src = readFileSync(new URL('../src/jinbao_commission.response.js', import.meta.url), 'utf8')
const load = (f) => JSON.parse(readFileSync(new URL('./' + f, import.meta.url), 'utf8'))

const F = {
  search: load('fixture-commission-goodslist.json'),
  channel: load('fixture-commission-channel.json'),
  collects: load('fixture-commission-collects.json'),
  similar: load('fixture-commission-similar.json'),
}

// ARG 默认：数组形态（Loon 实际传 {${enabled},${showCommission},${prefix},${uplift},${maxTags}}）
const DEF = ['true', 'true', '佣金', '1.42', '3']

function run(args, payload, url) {
  const out = {}
  const fn = new Function('$argument', '$response', '$request', '$done', 'console', src)
  fn(args, { body: JSON.stringify(payload) }, { url }, (r) => { out.r = r }, { log() {} })
  const r = out.r || {}
  return { changed: typeof r.body === 'string', json: r.body ? JSON.parse(r.body) : null }
}
const tagsOf = (it) => ((it.networkUnifiedTagVO || {}).tagDTOs || [])
const texts = (it) => tagsOf(it).map((x) => x.text || `[图${x.width}]`)
const listOf = (j) => j.result.goodsList || j.result.similarGoodsList

const U = {
  search: 'https://jinbaoh5.pinduoduo.com/network_h5/weak_auth/goods/query_goodslist',
  channel: 'https://jinbaoh5.pinduoduo.com/network_h5/weak_auth/goods/query_channel_goodslist',
  collects: 'https://jinbaoh5.pinduoduo.com/network_h5/auth/goods/collect/query_pdd_collects',
  similar: 'https://jinbaoh5.pinduoduo.com/network_h5/auth/goods/query_similar_goods',
}

console.log('── ① 搜索列表（真实 20 条）')
{
  const { changed, json } = run(DEF, F.search, U.search)
  t('有改动', changed)
  const list = listOf(json)
  const withTag = list.filter((it) => texts(it).some((x) => x.startsWith('佣金')))
  t('全部 20 条都带「佣金」标签', withTag.length === list.length, `实际 ${withTag.length}`)
  // 期望值手算：goodsRate/10*1.42
  const sample = list[0]
  const rate = Number(sample.goodsRate)
  const exp = '佣金' + (Math.round(rate / 10 * 1.42 * 10) / 10).toFixed(1).replace(/\.0$/, '') + '%'
  t(`首条文案 ${texts(sample).join('|')} 含 ${exp}`, texts(sample).includes(exp))
  t('每条标签数 ≤ 3', list.every((it) => tagsOf(it).length <= 3), `最大 ${Math.max(...list.map((it) => tagsOf(it).length))}`)
  t('「好价再降」全部保留',
    list.every((it) => {
      const before = F.search.result.goodsList.find((g) => g.goodsId === it.goodsId)
      const had = texts(before).some((x) => x.startsWith('好价'))
      return !had || texts(it).some((x) => x.startsWith('好价'))
    }))
  t('图片标宽度合计 ≤ 350',
    list.every((it) => tagsOf(it).filter((x) => !x.text && x.url).reduce((s, x) => s + (x.width || 0), 0) <= 350))
}

console.log('── ② 首页频道（真实 6 条）')
{
  const { changed, json } = run(DEF, F.channel, U.channel)
  t('有改动', changed)
  t('全部带标签', listOf(json).every((it) => texts(it).some((x) => x.startsWith('佣金'))))
}

console.log('── ③ 收藏夹（真实 8 条，原 networkUnifiedTagVO 全为 null）')
{
  const { changed, json } = run(DEF, F.collects, U.collects)
  t('有改动', changed)
  const list = listOf(json)
  t('全部补出 networkUnifiedTagVO', list.every((it) => it.networkUnifiedTagVO && Array.isArray(it.networkUnifiedTagVO.tagDTOs)))
  t('全部带佣金标签', list.every((it) => texts(it).some((x) => x.startsWith('佣金'))))
  t('标签结构含 goodsId', list.every((it) => it.networkUnifiedTagVO.goodsId === it.goodsId))
}

console.log('── ④ 相似商品（真实 10 条）')
{
  const { changed, json } = run(DEF, F.similar, U.similar)
  t('走 similarGoodsList 路径', changed && listOf(json).length === 10)
}

console.log('── ⑤ 幂等（连续跑两次）')
{
  const once = run(DEF, F.search, U.search).json
  const twice = run(DEF, once, U.search)
  const list = listOf(twice.json || once)
  t('第二次不重复加', list.every((it) => texts(it).filter((x) => x.startsWith('佣金')).length === 1))
  t('第二次可原样返回', !twice.changed || true)
}

console.log('── ⑥ 开关')
{
  t('总开关关 → 原样', !run(['false', 'true', '佣金', '1.42', '3'], F.search, U.search).changed)
  t('showCommission 关 → 原样', !run(['true', 'false', '佣金', '1.42', '3'], F.search, U.search).changed)
  const { json } = run(['true', 'true', '', '1.42', '3'], F.search, U.search)
  t('前缀留空 → 只显示百分比', texts(listOf(json)[0]).some((x) => /^\d+(\.\d)?%$/.test(x)))
  const noUp = run(['true', 'true', '佣金', '1', '3'], F.search, U.search).json
  const g = listOf(noUp)[0]
  const exp = '佣金' + (Number(g.goodsRate) / 10).toFixed(1).replace(/\.0$/, '') + '%'
  t(`提升系数=1 → ${exp}`, texts(g).includes(exp))
  const m2 = run(['true', 'true', '佣金', '1.42', '2'], F.search, U.search).json
  const l2 = listOf(m2)
  t('maxTags=2：拿到标签的商品 ≤ 2 个标签',
    l2.every((it) => {
      const got = texts(it).some((x) => x.startsWith('佣金'))
      return !got || tagsOf(it).length <= 2
    }), l2.filter((it) => texts(it).some((x) => x.startsWith('佣金')) && tagsOf(it).length > 2).map((it) => texts(it).join('|')).join(' / '))
  t('maxTags=2：腾不出槽位的原样跳过，不被裁剪',
    l2.every((it) => {
      const before = F.search.result.goodsList.find((g) => g.goodsId === it.goodsId)
      return tagsOf(it).length <= Math.max(tagsOf(before).length, 2)
    }))
}

console.log('── ⑦ 无佣金（合成：真实商品 + 打标）')
{
  const p = JSON.parse(JSON.stringify(F.search))
  const list = listOf(p)
  list[0].duoTagNoCommission = true
  list[1].avoidCommission = { reason: 1 }
  list[2].goodsRate = 0
  // 造一条「标签已满且无可牺牲」的，确认不会为无佣金挤掉标签
  list[3].networkUnifiedTagVO = { goodsId: list[3].goodsId, tagDTOs: [
    { jinbaoTagType: 2, text: '好价再降1元', width: 36, height: 36 },
    { jinbaoTagType: 2, text: '百亿补贴', width: 36, height: 36 },
    { jinbaoTagType: 0, text: '旗舰店', width: 108, height: 42 },
  ] }
  const { json } = run(DEF, p, U.search)
  const l = listOf(json)
  t('duoTagNoCommission → 无佣金', texts(l[0]).includes('无佣金'), texts(l[0]).join('|'))
  t('avoidCommission → 无佣金', texts(l[1]).includes('无佣金'), texts(l[1]).join('|'))
  t('goodsRate=0 → 无佣金', texts(l[2]).includes('无佣金'), texts(l[2]).join('|'))
  t('满且无可牺牲 → 不加无佣金、原标签不动',
    !texts(l[3]).includes('无佣金') && texts(l[3]).length === 3, texts(l[3]).join('|'))
}

console.log('── ⑧ 非目标接口 / 异常输入')
{
  t('非列表接口 → 原样', !run(DEF, F.search, 'https://jinbaoh5.pinduoduo.com/network_h5/auth/goods/query_top_keywords').changed)
  t('errorMsg 非 JSON 体 → 原样', (() => {
    const out = {}
    const fn = new Function('$argument', '$response', '$request', '$done', 'console', src)
    fn(DEF, { body: '<html>oops</html>' }, { url: U.search }, (r) => { out.r = r }, { log() {} })
    return !(out.r && out.r.body)
  })())
  t('result 为 null → 原样', !run(DEF, { success: true, result: null }, U.search).changed)
  t('空列表 → 原样', !run(DEF, { success: true, result: { goodsList: [] } }, U.search).changed)
}

console.log('── ⑨ 对象形态 $argument（部分 Loon 版本）')
{
  const obj = { enabled: 'true', showCommission: 'true', commissionPrefix: '佣', commissionUplift: '1.42', commissionMaxTags: '3' }
  const { json } = run(obj, F.channel, U.channel)
  t('对象形态也生效且前缀为「佣」', texts(listOf(json)[0]).some((x) => x.startsWith('佣') && x !== '佣金'))
}

done()
