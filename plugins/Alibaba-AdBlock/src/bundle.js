/*
 * Alibaba-AdBlock v2.0.0 - Bundled Script for Loon
 * 阿里系去广告 · 支持 Moon/淘宝/天猫/闲鱼/盒马/飞猪等
 * 单文件打包，无需 require() 支持
 * 更新: 2026-10-20
 */

// ============================================
// 核心工具函数
// ============================================
function isEnabled(key) {
  const val = $argument[key];
  return val === true || val === "true" || val === "1";
}

function safeParse(body) {
  try {
    return JSON.parse(body);
  } catch (e) {
    console.log("[Alibaba-AdBlock] JSON parse failed:", e);
    return null;
  }
}

function log(...args) {
  console.log("[Alibaba-AdBlock]", ...args);
}

// ============================================
// 批量广告分发过滤
// ============================================
const DEFAULT_SITE_CODES = {
  splash: new Set(["open_screen_site"]),
  popup: new Set(["pop_window_site"]),
  smallCards: new Set([
    "small_handler_home_site",
    "small_handler_share_site",
    "small_handler_h5_1_site",
    "small_handler_h5_2_site",
    "small_handler_h5_3_site",
    "bulletin_board_mid_site",
    "bulletin_board_report_site",
    "bulletin_board_mine_site",
    "searchDomeWord_site"
  ])
};

function filterBatchsite(body, siteCodes) {
  const data = safeParse(body);
  if (!data || !data.data?.batchResult || !Array.isArray(data.data.batchResult)) {
    return body;
  }
  const originalLen = data.data.batchResult.length;
  const filtered = data.data.batchResult.filter(item => {
    const code = item?.siteCode;
    if (!code) return true;
    if (siteCodes.splash.has(code) && isEnabled("removeSplashAd")) { console.log("[Alibaba-AdBlock] Filtered splash:", code); return false; }
    if (siteCodes.popup.has(code) && isEnabled("removePopWindow")) { console.log("[Alibaba-AdBlock] Filtered popup:", code); return false; }
    if (siteCodes.smallCards.has(code) && isEnabled("removeSmallCards")) { console.log("[Alibaba-AdBlock] Filtered small card:", code); return false; }
    return true;
  });
  const removed = originalLen - filtered.length;
  if (removed > 0) {
    console.log("[Alibaba-AdBlock] Removed " + removed + "/" + originalLen + " batchsite ad items");
    data.data.batchResult = filtered;
    return JSON.stringify(data);
  }
  return body;
}

// ============================================
// NOAH 运营位过滤
// ============================================
const DEFAULT_NOAH_CONFIG = {
  blockResKeys: [
    "moon_search_activation_dx_banner",
    "moon_share_dx_market_material",
    "moon_dx_bulletin_board_discovery",
    "moon_dx_bulletin_board_report",
    "moon_dx_bulletin_board_mine",
    "moon_dx_bulletin_board_goods",
    "moon_h5_handle_one",
    "moon_h5_handle_two",
    "moon_h5_handle_three",
    "newcomer_walfare_popup",
    "high_level_taoke_timer_notice"
  ],
  allowResKeys: [
    "moon_main_handle",
    "moon_share_handle",
    "moon_withdrawal_top_section",
    "moon_withdrawal_bottom_section",
    "moon_withdrawal_error_section"
  ]
};

function filterNoahQuery(body, config) {
  if (!isEnabled("removeNoahOps")) return body;
  const data = safeParse(body);
  if (!data || !data.data?.assetResult || !Array.isArray(data.data.assetResult)) return body;
  const { blockResKeys, allowResKeys } = config;
  const allowSet = new Set(allowResKeys);
  const blockSet = new Set(blockResKeys);
  const originalLen = data.data.assetResult.length;
  const filtered = data.data.assetResult.filter(item => {
    const resKey = item?.resKey;
    if (!resKey) return true;
    if (allowSet.has(resKey)) return true;
    if (blockSet.has(resKey)) { console.log("[Alibaba-AdBlock] Filtered NOAH resKey:", resKey); return false; }
    return true;
  });
  const removed = originalLen - filtered.length;
  if (removed > 0) {
    console.log("[Alibaba-AdBlock] Filtered NOAH: removed " + removed + "/" + originalLen + " items");
    data.data.assetResult = filtered;
    return JSON.stringify(data);
  }
  return body;
}

// ============================================
// TAC 搜索推荐过滤
// ============================================
function filterTACServiceCall(body) {
  const data = safeParse(body);
  if (!data || !data.data) return body;
  let modified = false;
  for (const key of Object.keys(data.data)) {
    const serviceData = data.data[key];
    if (serviceData?.data && Array.isArray(serviceData.data) && serviceData.data.length > 0) {
      console.log("[Alibaba-AdBlock] Clearing TAC service call " + key + " (" + serviceData.data.length + " words)");
      serviceData.data = [];
      modified = true;
    }
  }
  if (modified) return JSON.stringify(data);
  return body;
}

function filterTACServiceSmartCall(body) {
  const data = safeParse(body);
  if (!data?.data?.wordList || !Array.isArray(data.data.wordList)) return body;
  if (data.data.wordList.length > 0) {
    console.log("[Alibaba-AdBlock] Clearing TAC smart call wordList (" + data.data.wordList.length + " words)");
    data.data.wordList = [];
    return JSON.stringify(data);
  }
  return body;
}

function filterTAC(body, url) {
  if (!isEnabled("removeTAC")) return body;
  if (url.includes("tac.service.call") && !url.includes("smart.call")) {
    return filterTACServiceCall(body);
  }
  if (url.includes("tac.service.smart.call")) {
    return filterTACServiceSmartCall(body);
  }
  return body;
}

// ============================================
// MetaX 首页/Feed 过滤
// ============================================
const DEFAULT_METAX_CONFIG = {
  hotwordsType: "42701_96",
  clearFeedTypes: ["58536_33"]
};

function filterMetaxHotwords(body, config) {
  if (!isEnabled("removeSmallCards")) return body;
  const data = safeParse(body);
  if (!data?.data?.data?.headerList || !Array.isArray(data.data.data.headerList)) return body;
  let modified = false;
  const { hotwordsType } = config;
  for (const item of data.data.data.headerList) {
    if (item?.type === hotwordsType && item?.fields?.hotwords && Array.isArray(item.fields.hotwords) && item.fields.hotwords.length > 0) {
      console.log("[Alibaba-AdBlock] Clearing metax hotwords (" + item.fields.hotwords.length + " words)");
      item.fields.hotwords = [];
      modified = true;
    }
  }
  if (modified) return JSON.stringify(data);
  return body;
}

function filterMetaxFeed(body, config) {
  if (!isEnabled("removeFeedKeywords")) return body;
  const data = safeParse(body);
  if (!data?.data?.data?.bodyList || !Array.isArray(data.data.data.bodyList)) return body;
  let totalCleared = 0;
  const { clearFeedTypes } = config;
  for (const bodyItem of data.data.data.bodyList) {
    if (clearFeedTypes.length > 0 && !clearFeedTypes.includes(bodyItem?.type)) continue;
    if (bodyItem?.fields?.newsList?.recommend?.resultList && Array.isArray(bodyItem.fields.newsList.recommend.resultList)) {
      const originalLen = bodyItem.fields.newsList.recommend.resultList.length;
      if (originalLen > 0) {
        console.log("[Alibaba-AdBlock] Clearing feed: bodyList type=" + bodyItem.type + ", removed " + originalLen + " items");
        bodyItem.fields.newsList.recommend.resultList = [];
        bodyItem.fields.newsList.recommend.hasMore = "false";
        bodyItem.fields.newsList.recommend.allCount = "0";
        totalCleared += originalLen;
      }
    }
    if (bodyItem?.fields?.resultList && Array.isArray(bodyItem.fields.resultList)) {
      const originalLen = bodyItem.fields.resultList.length;
      if (originalLen > 0) {
        console.log("[Alibaba-AdBlock] Clearing feed: bodyList type=" + bodyItem.type + ", removed " + originalLen + " items (resultList)");
        bodyItem.fields.resultList = [];
        totalCleared += originalLen;
      }
    }
    if (bodyItem?.fields?.floorMappingList && Array.isArray(bodyItem.fields.floorMappingList)) {
      for (const floor of bodyItem.fields.floorMappingList) {
        if (floor?.siteMappingList && Array.isArray(floor.siteMappingList)) {
          for (const site of floor.siteMappingList) {
            if (site?.siteData?.pointList && Array.isArray(site.siteData.pointList)) {
              const originalLen = site.siteData.pointList.length;
              if (originalLen > 0) {
                site.siteData.pointList = [];
                totalCleared += originalLen;
              }
            }
          }
        }
      }
    }
    if (bodyItem?.fields?.homeSlotConverge) {
      bodyItem.fields.homeSlotConverge = {};
      totalCleared++;
    }
  }
  if (totalCleared > 0) {
    console.log("[Alibaba-AdBlock] Cleared entire metax feed: " + totalCleared + " items/sections");
    return JSON.stringify(data);
  }
  return body;
}

function filterMetaxHomepage(body, config) {
  if (!isEnabled("removeSmallCards") && !isEnabled("removeFeedKeywords")) return body;
  let newBody = filterMetaxHotwords(body, config);
  newBody = filterMetaxFeed(newBody, config);
  return newBody;
}

// ============================================
// 私域动态/关注会员过滤
// ============================================
function filterPrivateDomain(body, config) {
  if (!isEnabled("removePrivateDomain")) return body;
  const data = safeParse(body);
  if (!data?.data) return body;
  let modified = false;
  if (data.followMembers?.resultList && Array.isArray(data.followMembers.resultList) && data.followMembers.resultList.length > 0) {
    console.log("[Alibaba-AdBlock] Clearing private domain followMembers (" + data.followMembers.resultList.length + " items)");
    data.followMembers.resultList = [];
    data.followMembers.totalCount = "0";
    modified = true;
  }
  if (modified) return JSON.stringify(data);
  return body;
}

// ============================================
// 跨马灯过滤
// ============================================
function filterMarquee(body) {
  if (!isEnabled("removeSmallCards")) return body;
  const data = safeParse(body);
  if (!data?.data?.result || !Array.isArray(data.data.result)) return body;
  if (data.data.result.length > 0) {
    console.log("[Alibaba-AdBlock] Clearing marquee result (" + data.data.result.length + " items)");
    data.data.result = [];
    return JSON.stringify(data);
  }
  return body;
}

// ============================================
// Moon App 配置
// ============================================
const MOON_SITE_CODES = {
  splash: new Set(["open_screen_site"]),
  popup: new Set(["pop_window_site"]),
  smallCards: new Set([
    "small_handler_home_site",
    "small_handler_share_site",
    "small_handler_h5_1_site",
    "small_handler_h5_2_site",
    "small_handler_h5_3_site",
    "bulletin_board_mid_site",
    "bulletin_board_report_site",
    "bulletin_board_mine_site",
    "searchDomeWord_site"
  ])
};

const MOON_NOAH_CONFIG = {
  blockResKeys: [
    "moon_search_activation_dx_banner",
    "moon_share_dx_market_material",
    "moon_dx_bulletin_board_discovery",
    "moon_dx_bulletin_board_report",
    "moon_dx_bulletin_board_mine",
    "moon_dx_bulletin_board_goods",
    "moon_h5_handle_one",
    "moon_h5_handle_two",
    "moon_h5_handle_three",
    "newcomer_walfare_popup",
    "high_level_taoke_timer_notice"
  ],
  allowResKeys: [
    "moon_main_handle",
    "moon_share_handle",
    "moon_withdrawal_top_section",
    "moon_withdrawal_bottom_section",
    "moon_withdrawal_error_section"
  ]
};

const MOON_METAX_CONFIG = {
  hotwordsType: "42701_96",
  clearFeedTypes: ["58536_33"]
};

// ============================================
// Moon App 处理入口
// ============================================
function handleMoonResponse(body, url) {
  if (url.includes("mtop.alimama.union.skyleap.distribution.batchsite")) {
    return filterBatchsite(body, { splash: new Set(["open_screen_site"]), popup: new Set(["pop_window_site"]), smallCards: new Set(["small_handler_home_site","small_handler_share_site","small_handler_h5_1_site","small_handler_h5_2_site","small_handler_h5_3_site","bulletin_board_mid_site","bulletin_board_report_site","bulletin_board_mine_site","searchDomeWord_site"]) });
  }
  if (url.includes("mtop.etao.noah.query")) {
    return filterNoahQuery(body, {
      blockResKeys: ["moon_search_activation_dx_banner","moon_share_dx_market_material","moon_dx_bulletin_board_discovery","moon_dx_bulletin_board_report","moon_dx_bulletin_board_mine","moon_dx_bulletin_board_goods","moon_h5_handle_one","moon_h5_handle_two","moon_h5_handle_three","newcomer_walfare_popup","high_level_taoke_timer_notice"],
      allowResKeys: ["moon_main_handle","moon_share_handle","moon_withdrawal_top_section","moon_withdrawal_bottom_section","moon_withdrawal_error_section"]
    });
  }
  if (url.includes("mtop.alimama.moon.provider.tac.service")) {
    if (!isEnabled("removeTAC")) return body;
    if (url.includes("tac.service.call") && !url.includes("smart.call")) {
      return filterTACServiceCall(body);
    }
    if (url.includes("tac.service.smart.call")) {
      return filterTACServiceSmartCall(body);
    }
    return body;
  }
  if (url.includes("mtop.taobao.union.marquee.query")) {
    if (!isEnabled("removeSmallCards")) return body;
    const data = safeParse(body);
    if (!data?.data?.result || !Array.isArray(data.data.result)) return body;
    if (data.data.result.length > 0) {
      console.log("[Alibaba-AdBlock] Clearing marquee result (" + data.data.result.length + " items)");
      data.data.result = [];
      return JSON.stringify(data);
    }
    return body;
  }
  if (url.includes("mtop.alimama.moon.provider.metax.homepage.query")) {
    let newBody = body;
    newBody = filterMetaxHotwords(newBody, { hotwordsType: "42701_96", clearFeedTypes: ["58536_33"] });
    newBody = filterMetaxFeed(newBody, { clearFeedTypes: ["58536_33"] });
    return newBody;
  }
  if (url.includes("mtop.alimama.union.pub.entry")) {
    if (!isEnabled("removePrivateDomain")) return body;
    const data = safeParse(body);
    if (!data?.data) return body;
    let modified = false;
    if (data.followMembers?.resultList && Array.isArray(data.followMembers.resultList) && data.followMembers.resultList.length > 0) {
      console.log("[Alibaba-AdBlock] Clearing private domain followMembers (" + data.followMembers.resultList.length + " items)");
      data.followMembers.resultList = [];
      data.followMembers.totalCount = "0";
      modified = true;
    }
    if (modified) return JSON.stringify(data);
    return body;
  }
  return null;
}

// ============================================
// 统一入口
// ============================================
function main() {
  if (!$response || !$response.body) {
    console.log("[Alibaba-AdBlock] No response body");
    $done({});
    return;
  }
  const url = $request?.url || "";
  console.log("[Alibaba-AdBlock] Script triggered for:", url);
  const body = typeof $response.body === "string" ? $response.body : $response.body.toString();
  const newBody = handleMoonResponse(body, url);
  if (newBody !== null && newBody !== body) {
    console.log("[Alibaba-AdBlock] Response modified");
    $done({ body: newBody });
    return;
  }
  console.log("[Alibaba-AdBlock] No matching handler or no changes");
  $done({});
}

main();