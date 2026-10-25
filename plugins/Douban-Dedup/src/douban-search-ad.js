// 豆瓣搜索页广告词清洗 (原 Douban-SearchAd 稳定逻辑并入 v2.0.0)
// 依据: 2026-10-01 真机抓包 8 份 HAR + 2026-10-25 复核
//   /api/v2/search/found_words → { words:[...], top_word, cache_timeout }
//   /api/v2/search/hots        → { roofs:[...], ad_info:{...} }
// 广告条目: layout:"ad" / search_type:"ad_link" (words[1]/roofs[0] 实证)
// top_word: 协议层无法区分 (12样本零广告标记, 用户确认混投) → 整字段删
// ad_info: 穿山甲 SDK 配置 (ad_type:"fake" / unit_name:"dale_app_*") → 删
const AD_ITEM = (o) => !!o && typeof o === 'object' &&
  (o.layout === 'ad' || o.search_type === 'ad_link')
const PLACEHOLDER = { layout: 'default', search_type: 'all', title: '', uri: '' }

;(function () {
const pass = () => $done({})
const body = $response && $response.body
if (!body) return pass()

let data
try { data = JSON.parse(body) } catch (e) { return pass() }
if (!data || typeof data !== 'object' || Array.isArray(data)) return pass()

let dirty = false

for (const key of ['words', 'roofs']) {
  const list = data[key]
  if (!Array.isArray(list) || !list.some(AD_ITEM)) continue
  const kept = list.filter((x) => !AD_ITEM(x))
  data[key] = kept.length ? kept : [{ ...PLACEHOLDER }]
  dirty = true
}

if ('top_word' in data) { delete data.top_word; dirty = true }

if (data.ad_info && (data.ad_info.ad_type === 'fake' ||
    data.ad_info.advertisement_type === 43 ||
    String(data.ad_info.unit_name || '').startsWith('dale_app'))) {
  delete data.ad_info
  dirty = true
}

if (dirty) { $done({ body: JSON.stringify(data) }); return }
pass()
})()
