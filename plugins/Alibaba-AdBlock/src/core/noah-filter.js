/*
 * Alibaba-AdBlock — NOAH 运营位过滤 (core/noah-filter.js)
 * 接口: mtop.etao.noah.query
 * 适用: 所有使用 NOAH 的阿里系 App
 * 版本: 2.0.0
 */

const { isEnabled, safeParse, log } = require('./common.js');

/**
 * 默认 NOAH resKey 配置
 * Moon App 特有，其他 App 需覆盖
 */
const DEFAULT_NOAH_CONFIG = {
  // 需要拦截的 resKey (黑名单模式)
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
  // 保留的 resKey (白名单模式，优先级更高)
  allowResKeys: [
    "moon_main_handle",
    "moon_share_handle",
    "moon_withdrawal_top_section",
    "moon_withdrawal_bottom_section",
    "moon_withdrawal_error_section"
  ]
};

/**
 * 过滤 NOAH 响应
 * @param {string} body - 响应体
 * @param {Object} config - 自定义配置 {blockResKeys, allowResKeys}
 * @returns {string} - 处理后的响应体
 */
function filterNoahQuery(body, config = DEFAULT_NOAH_CONFIG) {
  if (!isEnabled("removeNoahOps")) return body;

  const data = safeParse(body);
  if (!data || !data.data?.assetResult || !Array.isArray(data.data.assetResult)) {
    return body;
  }

  const { blockResKeys, allowResKeys } = config;
  const allowSet = new Set(allowResKeys);
  const blockSet = new Set(blockResKeys);

  const originalLen = data.data.assetResult.length;

  const filtered = data.data.assetResult.filter(item => {
    const resKey = item?.resKey;
    if (!resKey) return true;

    // 白名单优先：明确允许的直接保留
    if (allowSet.has(resKey)) return true;

    // 黑名单：需拦截的移除
    if (blockSet.has(resKey)) {
      log("Filtered NOAH resKey:", resKey);
      return false;
    }

    // 默认保留未知 resKey
    return true;
  });

  const removed = originalLen - filtered.length;
  if (removed > 0) {
    log(`Filtered NOAH: removed ${removed}/${originalLen} items`);
    data.data.assetResult = filtered;
    return JSON.stringify(data);
  }

  return body;
}

if (typeof module !== 'undefined') {
  module.exports = { filterNoahQuery, DEFAULT_NOAH_CONFIG };
}