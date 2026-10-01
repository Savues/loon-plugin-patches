// 剥离豆瓣搜索页预制广告词。依据见 README「它做什么」。
// 判据只有 layout/search_type 两个字段 —— 协议层无法与真实热搜区分。
// 背景：2026-10-01 真机抓包（豆瓣 7.135.0，8 份 HAR），
// 广告混在 words[]/roofs[] 里标 layout:"ad"，top_word 与正常热搜完全同形。
const AD_ITEM = (o) => !!o && typeof o === 'object' &&
  (o.layout === 'ad' || o.search_type === 'ad_link')
const PLACEHOLDER = { layout: 'default', search_type: 'all', title: '', uri: '' }

// IIFE 而非顶层 return：Loon 会把脚本包进函数，但本地测试沙箱不一定。
// ponytail: 这个歧义 v1.x 栽过一次（顶层 return 被当成语法错误）。
;(function () {
const pass = () => $done({})
const body = $response && $response.body
if (!body) return pass()

let data
try { data = JSON.parse(body) } catch (e) { return pass() }
if (!data || typeof data !== 'object' || Array.isArray(data)) return pass()

// dirty 只做一件事：没删任何东西就不重写 body（省掉一次 JSON 往返与
// content-encoding 重算）。ponytail: 砍掉这个判断会被测试立刻抓到。
let dirty = false

// 删广告条目；整条数组删空时补占位，避免 App 拿到空列表渲染异常。
for (const key of ['words', 'roofs']) {
  const list = data[key]
  if (!Array.isArray(list) || !list.some(AD_ITEM)) continue
  const kept = list.filter((x) => !AD_ITEM(x))
  data[key] = kept.length ? kept : [{ ...PLACEHOLDER }]
  dirty = true
}

// ponytail: top_word（搜索框滚动词）与真实热搜同形，12 个样本无一可区分，
// 只能整字段删。关掉搜索框滚动词，搜索功能不受影响。
if ('top_word' in data) { delete data.top_word; dirty = true }

// 广告投放配置（穿山甲 SDK + 曝光上报）。条目已删，留着只让 App 继续上报虚假曝光。
if (data.ad_info && (data.ad_info.ad_type === 'fake' ||
    data.ad_info.advertisement_type === 43 ||
    String(data.ad_info.unit_name || '').startsWith('dale_app'))) {
  delete data.ad_info
  dirty = true
}

$done(dirty ? { body: JSON.stringify(data) } : {})
})()
