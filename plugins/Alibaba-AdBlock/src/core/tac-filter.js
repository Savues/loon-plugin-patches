/*
 * Alibaba-AdBlock — TAC 搜索推荐过滤 (core/tac-filter.js)
 * 接口: mtop.alimama.moon.provider.tac.service.call / smart.call
 * 适用: 所有有搜索框推荐的阿里系 App
 * 版本: 2.0.0
 */

const { isEnabled, safeParse, log } = require('./common.js');

/**
 * 过滤 TAC 基础服务调用
 * 接口: mtop.alimama.moon.provider.tac.service.call
 * 响应结构: { data: { "2019021101": { data: [{word: "..."}, ...] } } }
 */
function filterTACServiceCall(body) {
  if (!isEnabled("removeTAC")) return body;

  const data = safeParse(body);
  if (!data || !data.data) return body;

  let modified = false;
  for (const key of Object.keys(data.data)) {
    const serviceData = data.data[key];
    if (serviceData?.data && Array.isArray(serviceData.data) && serviceData.data.length > 0) {
      log(`Clearing TAC service call ${key} (${serviceData.data.length} words)`);
      serviceData.data = [];
      modified = true;
    }
  }

  if (modified) {
    return JSON.stringify(data);
  }
  return body;
}

/**
 * 过滤 TAC 智能服务调用
 * 接口: mtop.alimama.moon.provider.tac.service.smart.call
 * 响应结构: { data: { wordList: [{word: "..."}, ...], template: {...} } }
 */
function filterTACServiceSmartCall(body) {
  if (!isEnabled("removeTAC")) return body;

  const data = safeParse(body);
  if (!data?.data?.wordList || !Array.isArray(data.data.wordList)) {
    return body;
  }

  if (data.data.wordList.length > 0) {
    log(`Clearing TAC smart call wordList (${data.data.wordList.length} words)`);
    data.data.wordList = [];
    return JSON.stringify(data);
  }

  return body;
}

/**
 * 统一入口：根据 URL 自动判断调用哪个过滤器
 * @param {string} body - 响应体
 * @param {string} url - 请求 URL
 * @returns {string} - 处理后的响应体
 */
function filterTAC(body, url) {
  if (url.includes("tac.service.call") && !url.includes("smart.call")) {
    return filterTACServiceCall(body);
  }
  if (url.includes("tac.service.smart.call")) {
    return filterTACServiceSmartCall(body);
  }
  return body;
}

if (typeof module !== 'undefined') {
  module.exports = { filterTACServiceCall, filterTACServiceSmartCall, filterTAC };
}