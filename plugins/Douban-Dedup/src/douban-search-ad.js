// douban-search-ad.js —— 剥离豆瓣搜索页的预制广告词
//
// 背景：2026-10-01 真机抓包（豆瓣 7.135.0 / iPadOS 18.7.3）里，
// 搜索框滚动广告与「发现」横滚标签广告都来自这两个端点：
//
//   /api/v2/search/found_words → { words: [...], top_word, cache_timeout }
//   /api/v2/search/hots        → { roofs: [...], ..., ad_info: {...} }
//
// 广告条目和真实热搜混在同一个数组里，靠 layout 标记区分。抓包实测样本：
//
//   words[1] { layout:"ad", search_type:"ad_link",
//               title:"看视频抽立减金",
//               uri:"https://m.douban.com/cps-spu-page/3/daily-incentive-lottery?source=ad" }
//   roofs[0] { layout:"ad", search_type:"", title:"抽10元支付宝立减金" }
//   ad_info  { ad_type:"fake", advertisement_type:43,
//               unit_name:"dale_app_search_hots_page",
//               sdk_list:[{ sdk_type:"pangolinSDK", show_cta:true, ... }] }
//
// 同一响应里的正常条目（不能删）：
//   words[0] { layout:"default", search_type:"all", title:"《复仇者联盟5》确认引进内地" }
//   top_word { layout:"default", search_type:"all", title:"《沙丘3》确认引进" }
//
// 为什么不能直接 reject 整个端点：真实热搜和广告在同一个数组里，
// 拦掉等于搜索联想功能报废。所以这里只删广告条目，其余原样返回。
//
// 三条保守原则：
//   1. 只按 layout / search_type 删，不按标题关键词删（广告词每天换）
//   2. 任何解析异常一律放行原响应
//   3. 删空数组时补一个占位，避免 App 拿到空列表渲染异常

const isAdItem = (o) =>
  !!o && typeof o === 'object' &&
  (o.layout === 'ad' || o.search_type === 'ad_link')

// words / roofs 删空时补一个中性占位，字段结构对齐抓包样本
const placeholder = { layout: 'default', search_type: 'all', title: '', uri: '' }

try {
  const body = $response && $response.body
  if (!body) {
    $done({})
  } else {
    let data
    try {
      data = JSON.parse(body)
    } catch (e) {
      // 不是 JSON（可能是错误页）—— 原样放行
      $done({})
    }

    if (data && typeof data === 'object') {
      let removed = 0

      for (const key of ['words', 'roofs']) {
        const list = data[key]
        if (!Array.isArray(list)) continue
        const kept = list.filter((x) => !isAdItem(x))
        removed += list.length - kept.length
        if (removed > 0 && kept.length === 0) kept.push({ ...placeholder })
        data[key] = kept
      }

      // ad_info 是这次搜索广告的投放配置（穿山甲 SDK 列表 + 曝光上报地址）。
      // 广告条目已删，留着它只会让 App 继续上报虚假曝光。
      const info = data.ad_info
      if (info && typeof info === 'object' &&
          (info.ad_type === 'fake' || info.advertisement_type === 43 ||
           String(info.unit_name || '').indexOf('dale_app') === 0)) {
        delete data.ad_info
        removed++
      }

      // top_word 是搜索框里滚动的那个词。抓包样本是 layout:"default"（正常词），
      // 所以正常不动；只有它自己被标成广告时才删。
      if (data.top_word && isAdItem(data.top_word)) {
        delete data.top_word
        removed++
      }

      if (removed > 0) {
        $done({ body: JSON.stringify(data) })
      } else {
        $done({})
      }
    } else {
      $done({})
    }
  }
} catch (e) {
  // 任何意外都放行 —— 搜索功能比去广告重要
  $done({})
}
