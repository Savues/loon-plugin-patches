/*
 * Alibaba-AdBlock — 私域动态/关注会员过滤 (core/private-domain.js)
 * 接口: mtop.alimama.union.pub.entry / mtop.taobao.follow.query 等
 * 适用: 有"关注/动态"Tab的阿里系 App
 * 版本: 2.0.0
 */

const { isEnabled, safeParse, log } = require('./common.js');

/**
 * 默认私域动态接口配置
 */
const DEFAULT_PRIVATE_DOMAIN_CONFIG = {
  // Moon App 使用
  moon: {
    interface: "mtop.alimama.union.pub.entry",
    followMembersPath: "data.followMembers.resultList",
    recommendTabPath: "data.recommendTab.resultList",
    blockFollowMembers: true,
    blockRecommendTab: false
  },
  // 淘宝/天猫使用 (示例)
  taobao: {
    interface: "mtop.taobao.follow.query",
    followMembersPath: "data.followList",
    recommendTabPath: "data.recommendList",
    blockFollowMembers: true,
    blockRecommendTab: false
  }
};

/**
 * 过滤私域动态/关注会员
 * @param {string} body - 响应体
 * @param {Object} config - App 特定配置
 * @returns {string} - 处理后的响应体
 */
function filterPrivateDomain(body, config = DEFAULT_PRIVATE_DOMAIN_CONFIG.moon) {
  if (!isEnabled("removePrivateDomain")) return body;

  const data = safeParse(body);
  if (!data?.data) return body;

  let modified = false;

  // 1. 私域动态 / 关注会员
  if (config.blockFollowMembers && data.followMembers?.resultList && Array.isArray(data.followMembers.resultList) && data.followMembers.resultList.length > 0) {
    log(`Clearing private domain followMembers (${data.followMembers.resultList.length} items)`);
    data.followMembers.resultList = [];
    data.followMembers.totalCount = "0";
    modified = true;
  }

  // 2. 推荐Tab 达人推荐 (可选)
  if (config.blockRecommendTab && data.recommendTab?.resultList && Array.isArray(data.recommendTab.resultList) && data.recommendTab.resultList.length > 0) {
    log(`Clearing recommendTab (${data.recommendTab.resultList.length} items)`);
    data.recommendTab.resultList = [];
    data.recommendTab.hasMore = "false";
    modified = true;
  }

  if (modified) {
    return JSON.stringify(data);
  }
  return body;
}

/**
 * 根据 App 名称获取配置
 */
function getPrivateDomainConfig(appName) {
  const configs = {
    moon: DEFAULT_PRIVATE_DOMAIN_CONFIG.moon,
    taobao: DEFAULT_PRIVATE_DOMAIN_CONFIG.taobao,
    tmall: DEFAULT_PRIVATE_DOMAIN_CONFIG.taobao, // 天猫暂用淘宝配置
  };
  return configs[appName] || DEFAULT_PRIVATE_DOMAIN_CONFIG.moon;
}

if (typeof module !== 'undefined') {
  module.exports = { filterPrivateDomain, getPrivateDomainConfig, DEFAULT_PRIVATE_DOMAIN_CONFIG };
}