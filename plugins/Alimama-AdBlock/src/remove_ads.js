/*
 * Alimama-AdBlock — 阿里妈妈 Moon App 去广告核心脚本
 * 处理 mtop.alimama.union.skyleap.distribution.batchsite 响应
 * 按 siteCode 过滤：开屏、弹窗、小卡片、公告栏
 */

function isEnabled(key) {
  const val = $argument[key];
  return val === true || val === "true" || val === "1";
}

function filterBatchsite(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    console.log("[Alimama-AdBlock] JSON parse failed:", e);
    return body;
  }

  // 响应结构：{ api, data: { batchResult: [...] }, ret, v }
  // batchResult 每项含：siteCode, siteData, memberId, tkScm 等
  if (!data?.data?.batchResult || !Array.isArray(data.data.batchResult)) {
    return body;
  }

  const originalLen = data.data.batchResult.length;

  // 定义 siteCode 分类
  const SPLASH_CODES = new Set(["open_screen_site"]);
  const POPUP_CODES = new Set(["pop_window_site"]);
  const SMALL_CARD_CODES = new Set([
    "small_handler_home_site",
    "small_handler_share_site",
    "small_handler_h5_1_site",
    "small_handler_h5_2_site",
    "small_handler_h5_3_site",
    "bulletin_board_mid_site",
    "bulletin_board_report_site",
    "bulletin_board_mine_site",
    "searchDomeWord_site"
  ]);

  const filtered = data.data.batchResult.filter(item => {
    const code = item?.siteCode;
    if (!code) return true; // 无 siteCode 保留

    // 开屏广告
    if (SPLASH_CODES.has(code) && isEnabled("removeSplashAd")) {
      console.log("[Alimama-AdBlock] Filtered splash:", code);
      return false;
    }
    // 弹窗广告
    if (POPUP_CODES.has(code) && isEnabled("removePopWindow")) {
      console.log("[Alimama-AdBlock] Filtered popup:", code);
      return false;
    }
    // 小卡片/公告栏/搜索词推荐
    if (SMALL_CARD_CODES.has(code) && isEnabled("removeSmallCards")) {
      console.log("[Alimama-AdBlock] Filtered small card:", code);
      return false;
    }
    return true;
  });

  const removed = originalLen - filtered.length;
  if (removed > 0) {
    console.log(`[Alimama-AdBlock] Removed ${removed}/${originalLen} ad items`);
    data.data.batchResult = filtered;
    return JSON.stringify(data);
  }

  return body;
}

function filterMarquee(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    console.log("[Alimama-AdBlock] Marquee JSON parse failed:", e);
    return body;
  }

  // 响应结构：{ api, data: { result: [...] }, ret, v }
  if (!data?.data?.result || !Array.isArray(data.data.result)) {
    return body;
  }

  if (data.data.result.length > 0 && isEnabled("removeSmallCards")) {
    console.log(`[Alimama-AdBlock] Clearing marquee result (${data.data.result.length} items)`);
    data.data.result = [];
    return JSON.stringify(data);
  }

  return body;
}

function filterTACServiceCall(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    console.log("[Alimama-AdBlock] TAC service call JSON parse failed:", e);
    return body;
  }

  // Structure: { data: { "2019021101": { data: [{word: "..."}, ...] } } }
  if (!data?.data || !isEnabled("removeSmallCards")) {
    return body;
  }

  let modified = false;
  for (const key of Object.keys(data.data)) {
    const serviceData = data.data[key];
    if (serviceData?.data && Array.isArray(serviceData.data) && serviceData.data.length > 0) {
      console.log(`[Alimama-AdBlock] Clearing TAC service call ${key} (${serviceData.data.length} words)`);
      serviceData.data = [];
      modified = true;
    }
  }

  if (modified) {
    return JSON.stringify(data);
  }
  return body;
}

function filterTACServiceSmartCall(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    console.log("[Alimama-AdBlock] TAC service smart call JSON parse failed:", e);
    return body;
  }

  // Structure: { data: { wordList: [{word: "..."}, ...], template: {...} } }
  if (!data?.data?.wordList || !Array.isArray(data.data.wordList) || !isEnabled("removeSmallCards")) {
    return body;
  }

  if (data.data.wordList.length > 0) {
    console.log(`[Alimama-AdBlock] Clearing TAC smart call wordList (${data.data.wordList.length} words)`);
    data.data.wordList = [];
    return JSON.stringify(data);
  }

  return body;
}

function filterMetaxHomepage(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    console.log("[Alimama-AdBlock] Metax homepage JSON parse failed:", e);
    return body;
  }

  // Structure: { data: { container: {...}, data: { headerList: [...] } } }
  // hotwords 在 headerList 中 type 为 42701_96 (moon_home_top_bar) 的项里
  if (!data?.data?.data?.headerList || !Array.isArray(data.data.data.headerList) || !isEnabled("removeSmallCards")) {
    return body;
  }

  let modified = false;
  for (const item of data.data.data.headerList) {
    if (item?.fields?.hotwords && Array.isArray(item.fields.hotwords) && item.fields.hotwords.length > 0) {
      console.log(`[Alimama-AdBlock] Clearing metax homepage hotwords (${item.fields.hotwords.length} words)`);
      item.fields.hotwords = [];
      modified = true;
    }
  }

  if (modified) {
    return JSON.stringify(data);
  }
  return body;
}

function filterMetaxFeedKeywords(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    console.log("[Alimama-AdBlock] Metax feed keywords JSON parse failed:", e);
    return body;
  }

  // Structure: { data: { data: { bodyList: [...] } } }
  // 过滤 bodyList 中 fields.newsList.recommend.resultList 的商品
  if (!data?.data?.data?.bodyList || !Array.isArray(data.data.data.bodyList) || !isEnabled("removeFeedKeywords")) {
    return body;
  }

  // 需要屏蔽的关键词 (硬编码，用户可自行修改脚本)
  const BLOCKED_KEYWORDS = [
    "霸王何首乌",
    "霸王",
    "何首乌",
  ];

  let totalRemoved = 0;

  for (const bodyItem of data.data.data.bodyList) {
    // 处理 newsList.recommend.resultList 结构
    if (bodyItem?.fields?.newsList?.recommend?.resultList && Array.isArray(bodyItem.fields.newsList.recommend.resultList)) {
      const originalLen = bodyItem.fields.newsList.recommend.resultList.length;
      bodyItem.fields.newsList.recommend.resultList = bodyItem.fields.newsList.recommend.resultList.filter(item => {
        const name = item?.itemName || "";
        return !BLOCKED_KEYWORDS.some(kw => name.includes(kw));
      });
      totalRemoved += originalLen - bodyItem.fields.newsList.recommend.resultList.length;
    }

    // 也可能有其他推荐结构，如直接的 resultList
    if (bodyItem?.fields?.resultList && Array.isArray(bodyItem.fields.resultList)) {
      const originalLen = bodyItem.fields.resultList.length;
      bodyItem.fields.resultList = bodyItem.fields.resultList.filter(item => {
        const name = item?.itemName || item?.title || "";
        return !BLOCKED_KEYWORDS.some(kw => name.includes(kw));
      });
      totalRemoved += originalLen - bodyItem.fields.resultList.length;
    }
  }

  if (totalRemoved > 0) {
    console.log(`[Alimama-AdBlock] Filtered feed keywords: removed ${totalRemoved} items`);
    return JSON.stringify(data);
  }

  return body;
}

function filterUnionPubEntry(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    console.log("[Alimama-AdBlock] Union pub entry JSON parse failed:", e);
    return body;
  }

  // Structure: { data: { followMembers: { resultList: [...] }, recommendTab: { resultList: [...] } } }
  if (!data?.data || !isEnabled("removePrivateDomain")) {
    return body;
  }

  let modified = false;

  // 1. 私域动态 / 关注会员
  if (data.data.followMembers?.resultList && Array.isArray(data.data.followMembers.resultList) && data.data.followMembers.resultList.length > 0) {
    console.log(`[Alimama-AdBlock] Clearing private domain followMembers (${data.data.followMembers.resultList.length} items)`);
    data.data.followMembers.resultList = [];
    data.data.followMembers.totalCount = "0";
    modified = true;
  }

  // 2. 推荐Tab 达人推荐 (可选，按需开启)
  // 如果也要拦截推荐Tab，取消下面注释：
  /*
  if (data.data.recommendTab?.resultList && Array.isArray(data.data.recommendTab.resultList) && data.data.recommendTab.resultList.length > 0) {
    console.log(`[Alimama-AdBlock] Clearing recommendTab (${data.data.recommendTab.resultList.length} items)`);
    data.data.recommendTab.resultList = [];
    data.data.recommendTab.hasMore = "false";
    modified = true;
  }
  */

  if (modified) {
    return JSON.stringify(data);
  }
  return body;
}

function main() {
  if (!$response || !$response.body) {
    console.log("[Alimama-AdBlock] No response body");
    $done({});
    return;
  }

  const url = $request?.url || "";
  console.log("[Alimama-AdBlock] Script triggered for:", url);

  const body = typeof $response.body === "string" ? $response.body : $response.body.toString();

  // 1. 批量广告分发
  if (url.includes("mtop.alimama.union.skyleap.distribution.batchsite")) {
    console.log("[Alimama-AdBlock] Processing batchsite response, length:", body.length);
    const newBody = filterBatchsite(body);
    if (newBody !== body) {
      console.log("[Alimama-AdBlock] Batchsite response modified");
      $done({ body: newBody });
      return;
    }
  }

  // 2. 搜索框跑马灯热词
  if (url.includes("mtop.taobao.union.marquee.query")) {
    console.log("[Alimama-AdBlock] Processing marquee query response, length:", body.length);
    const newBody = filterMarquee(body);
    if (newBody !== body) {
      console.log("[Alimama-AdBlock] Marquee response modified");
      $done({ body: newBody });
      return;
    }
  }

  // 3. 搜索框推荐词 - TAC 基础服务
  if (url.includes("mtop.alimama.moon.provider.tac.service.call")) {
    console.log("[Alimama-AdBlock] Processing TAC service call response, length:", body.length);
    const newBody = filterTACServiceCall(body);
    if (newBody !== body) {
      console.log("[Alimama-AdBlock] TAC service call response modified");
      $done({ body: newBody });
      return;
    }
  }

  // 4. 搜索框推荐词 - TAC 智能服务
  if (url.includes("mtop.alimama.moon.provider.tac.service.smart.call")) {
    console.log("[Alimama-AdBlock] Processing TAC smart call response, length:", body.length);
    const newBody = filterTACServiceSmartCall(body);
    if (newBody !== body) {
      console.log("[Alimama-AdBlock] TAC smart call response modified");
      $done({ body: newBody });
      return;
    }
  }

  // 5. 首页搜索栏热词 - metax homepage
  if (url.includes("mtop.alimama.moon.provider.metax.homepage.query")) {
    console.log("[Alimama-AdBlock] Processing metax homepage query response, length:", body.length);
    
    // 5a. 热词过滤
    let newBody = filterMetaxHomepage(body);
    // 5b. Feed 关键词过滤
    newBody = filterMetaxFeedKeywords(newBody);
    
    if (newBody !== body) {
      console.log("[Alimama-AdBlock] Metax homepage response modified");
      $done({ body: newBody });
      return;
    }
  }

  // 6. 私域动态 / 关注会员 - union.pub.entry
  if (url.includes("mtop.alimama.union.pub.entry")) {
    console.log("[Alimama-AdBlock] Processing union pub entry response, length:", body.length);
    const newBody = filterUnionPubEntry(body);
    if (newBody !== body) {
      console.log("[Alimama-AdBlock] Union pub entry response modified");
      $done({ body: newBody });
      return;
    }
  }

  console.log("[Alimama-AdBlock] No matching handler or no changes");
  $done({});
}

main();