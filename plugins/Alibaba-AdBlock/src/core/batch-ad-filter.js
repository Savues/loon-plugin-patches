/*
 * Alibaba-AdBlock — 批量广告分发过滤 (core/batch-ad-filter.js)
 * 接口: mtop.alimama.union.skyleap.distribution.batchsite
 * 适用: Moon、淘宝、天猫、闲鱼等阿里系 App
 * 版本: 2.0.0
 */

const { isEnabled, safeParse, log, logError } = require('./common.js');

/**
 * 批量广告分发 siteCode 分类配置
 * 各 App 可通过配置覆盖或扩展
 */
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

/**
 * 过滤批量广告分发响应
 * @param {string} body - 响应体
 * @param {Object} siteCodes - 可选，自定义 siteCode 分类
 * @returns {string} - 处理后的响应体
 */
function filterBatchsite(body, siteCodes = DEFAULT_SITE_CODES) {
  const data = safeParse(body);
  if (!data || !data.data?.batchResult || !Array.isArray(data.data.batchResult)) {
    return body;
  }

  const originalLen = data.data.batchResult.length;

  const filtered = data.data.batchResult.filter(item => {
    const code = item?.siteCode;
    if (!code) return true;

    // 开屏广告
    if (siteCodes.splash.has(code) && isEnabled("removeSplashAd")) {
      log("Filtered splash:", code);
      return false;
    }
    // 弹窗广告
    if (siteCodes.popup.has(code) && isEnabled("removePopWindow")) {
      log("Filtered popup:", code);
      return false;
    }
    // 小卡片/公告栏/搜索词推荐
    if (siteCodes.smallCards.has(code) && isEnabled("removeSmallCards")) {
      log("Filtered small card:", code);
      return false;
    }
    return true;
  });

  const removed = originalLen - filtered.length;
  if (removed > 0) {
    log(`Removed ${removed}/${originalLen} batchsite ad items`);
    data.data.batchResult = filtered;
    return JSON.stringify(data);
  }

  return body;
}

if (typeof module !== 'undefined') {
  module.exports = { filterBatchsite, DEFAULT_SITE_CODES };
}