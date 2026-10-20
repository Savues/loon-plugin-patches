/*
 * Alibaba-AdBlock — MetaX 首页/Feed 过滤 (core/metax-filter.js)
 * 接口: mtop.alimama.moon.provider.metax.homepage.query / mtop.mtop.tbhome.query 等
 * 适用: Moon、淘宝首页、天猫首页等
 * 版本: 2.0.0
 */

const { isEnabled, safeParse, log } = require('./common.js');

/**
 * 默认 MetaX 字段路径配置
 * Moon App 使用，其他 App 需覆盖
 */
const DEFAULT_METAX_CONFIG = {
  // 热词字段路径
  hotwordsPath: "data.data.headerList",
  hotwordsType: "42701_96", // moon_home_top_bar
  // Feed 字段路径
  feedPath: "data.data.bodyList",
  // Feed 清空配置
  clearFeedTypes: ["58536_33"], // moon_home_scrolling_light_floor
  // Feed 内部字段
  feedFields: {
    newsList: "fields.newsList.recommend.resultList",
    resultList: "fields.resultList",
    floorMappingList: "fields.floorMappingList",
    homeSlotConverge: "fields.homeSlotConverge"
  }
};

/**
 * 清空首页搜索栏热词
 */
function filterMetaxHotwords(body, config = DEFAULT_METAX_CONFIG) {
  if (!isEnabled("removeSmallCards")) return body;

  const data = safeParse(body);
  if (!data?.data?.data?.headerList || !Array.isArray(data.data.data.headerList)) {
    return body;
  }

  let modified = false;
  const { hotwordsType } = config;

  for (const item of data.data.data.headerList) {
    if (item?.type === hotwordsType && item?.fields?.hotwords && Array.isArray(item.fields.hotwords) && item.fields.hotwords.length > 0) {
      log(`Clearing metax hotwords (${item.fields.hotwords.length} words)`);
      item.fields.hotwords = [];
      modified = true;
    }
  }

  if (modified) {
    return JSON.stringify(data);
  }
  return body;
}

/**
 * 清空首页 Feed 推荐流
 */
function filterMetaxFeed(body, config = DEFAULT_METAX_CONFIG) {
  if (!isEnabled("removeFeedKeywords")) return body;

  const data = safeParse(body);
  if (!data?.data?.data?.bodyList || !Array.isArray(data.data.data.bodyList)) {
    return body;
  }

  let totalCleared = 0;
  const { feedFields, clearFeedTypes } = config;

  for (const bodyItem of data.data.data.bodyList) {
    // 可选：按类型过滤
    if (clearFeedTypes.length > 0 && !clearFeedTypes.includes(bodyItem?.type)) {
      continue;
    }

    // 清空 newsList.recommend.resultList
    if (bodyItem?.fields?.newsList?.recommend?.resultList && Array.isArray(bodyItem.fields.newsList.recommend.resultList)) {
      const originalLen = bodyItem.fields.newsList.recommend.resultList.length;
      if (originalLen > 0) {
        log(`Clearing feed: bodyList type=${bodyItem.type}, removed ${originalLen} items`);
        bodyItem.fields.newsList.recommend.resultList = [];
        bodyItem.fields.newsList.recommend.hasMore = "false";
        bodyItem.fields.newsList.recommend.allCount = "0";
        totalCleared += originalLen;
      }
    }

    // 清空直接的 resultList
    if (bodyItem?.fields?.resultList && Array.isArray(bodyItem.fields.resultList)) {
      const originalLen = bodyItem.fields.resultList.length;
      if (originalLen > 0) {
        log(`Clearing feed: bodyList type=${bodyItem.type}, removed ${originalLen} items (resultList)`);
        bodyItem.fields.resultList = [];
        totalCleared += originalLen;
      }
    }

    // 清空 floorMappingList 中的商品
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

    // 清空 homeSlotConverge
    if (bodyItem?.fields?.homeSlotConverge) {
      bodyItem.fields.homeSlotConverge = {};
      totalCleared++;
    }
  }

  if (totalCleared > 0) {
    log(`Cleared entire metax feed: ${totalCleared} items/sections`);
    return JSON.stringify(data);
  }

  return body;
}

/**
 * 统一入口：同时处理热词和 Feed
 * @param {string} body - 响应体
 * @param {Object} config - 配置对象
 * @returns {string} - 处理后的响应体
 */
function filterMetaxHomepage(body, config = DEFAULT_METAX_CONFIG) {
  if (!isEnabled("removeSmallCards") && !isEnabled("removeFeedKeywords")) {
    return body;
  }

  let newBody = filterMetaxHotwords(body, config);
  newBody = filterMetaxFeed(newBody, config);

  return newBody;
}

if (typeof module !== 'undefined') {
  module.exports = { filterMetaxHotwords, filterMetaxFeed, filterMetaxHomepage, DEFAULT_METAX_CONFIG };
}