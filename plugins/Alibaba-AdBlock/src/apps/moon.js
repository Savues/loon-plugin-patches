/*
 * Alibaba-AdBlock — Moon App (阿里妈妈/淘宝联盟) 专属逻辑 (apps/moon.js)
 * Bundle ID: com.alimama.moon
 * 版本: 2.0.0
 * 基于 v9.17.0 逆向分析
 */

const { 
  filterBatchsite, DEFAULT_SITE_CODES 
} = require('../core/batch-ad-filter.js');
const { filterNoahQuery, DEFAULT_NOAH_CONFIG } = require('../core/noah-filter.js');
const { filterTAC } = require('../core/tac-filter.js');
const { filterMetaxHomepage, DEFAULT_METAX_CONFIG } = require('../core/metax-filter.js');
const { filterMarquee } = require('../core/marquee-filter.js');
const { filterPrivateDomain, getPrivateDomainConfig } = require('../core/private-domain.js');
const { isEnabled } = require('../core/common.js');

/**
 * Moon App 特有的 siteCode 配置 (继承默认，可扩展)
 */
const MOON_SITE_CODES = {
  ...DEFAULT_SITE_CODES,
  // Moon 特有的 siteCode 可在此添加
};

/**
 * Moon App 特有的 NOAH 配置
 */
const MOON_NOAH_CONFIG = {
  ...DEFAULT_NOAH_CONFIG,
  blockResKeys: [
    ...DEFAULT_NOAH_CONFIG.blockResKeys,
    // Moon 特有的可在此添加
  ],
  allowResKeys: [
    ...DEFAULT_NOAH_CONFIG.allowResKeys,
    // Moon 特有的可在此添加
  ]
};

/**
 * Moon App 特有的 MetaX 配置
 */
const MOON_METAX_CONFIG = {
  ...DEFAULT_METAX_CONFIG,
  hotwordsType: "42701_96", // moon_home_top_bar
  clearFeedTypes: ["58536_33"], // moon_home_scrolling_light_floor
};

/**
 * Moon App 私域动态配置
 */
const MOON_PRIVATE_CONFIG = {
  ...require('../core/private-domain.js').DEFAULT_PRIVATE_DOMAIN_CONFIG.moon,
  interface: "mtop.alimama.union.pub.entry",
  followMembersPath: "data.followMembers.resultList",
  recommendTabPath: "data.recommendTab.resultList",
  blockFollowMembers: true,
  blockRecommendTab: false
};

/**
 * Moon App 统一处理入口
 * @param {string} body - 响应体
 * @param {string} url - 请求 URL
 * @returns {string|null} - 处理后的响应体，null 表示无变化
 */
function handleMoonResponse(body, url) {
  // 1. 批量广告分发
  if (url.includes("mtop.alimama.union.skyleap.distribution.batchsite")) {
    return filterBatchsite(body, MOON_SITE_CODES);
  }

  // 2. NOAH 运营位
  if (url.includes("mtop.etao.noah.query")) {
    return filterNoahQuery(body, MOON_NOAH_CONFIG);
  }

  // 3. TAC 搜索推荐
  if (url.includes("mtop.alimama.moon.provider.tac.service")) {
    return filterTAC(body, url);
  }

  // 4. 跨马灯热词
  if (url.includes("mtop.taobao.union.marquee.query")) {
    return filterMarquee(body);
  }

  // 5. MetaX 首页/Feed
  if (url.includes("mtop.alimama.moon.provider.metax.homepage.query")) {
    let newBody = body;
    
    // 5a. 热词过滤 (removeSmallCards 控制)
    if (isEnabled("removeSmallCards")) {
      newBody = filterMetaxHomepage(newBody, MOON_METAX_CONFIG);
    }
    
    // 5b. Feed 清空 (removeFeedKeywords 控制)
    if (isEnabled("removeFeedKeywords")) {
      // 需要单独处理 Feed 部分，复用 filterMetaxFeed
      const { filterMetaxFeed, DEFAULT_METAX_CONFIG } = require('../core/metax-filter.js');
      newBody = newBody; // filterMetaxHomepage 已包含 Feed 处理
    }
    
    return newBody;
  }

  // 6. 私域动态 / 关注会员
  if (url.includes("mtop.alimama.union.pub.entry")) {
    return filterPrivateDomain(body, getPrivateDomainConfig("moon"));
  }

  return null; // 无匹配处理器
}

/**
 * Moon App 支持的接口列表 (用于生成 Script 规则)
 */
const MOON_INTERFACES = [
  {
    pattern: "mtop.alimama.union.skyleap.distribution.batchsite",
    args: ["removeSplashAd", "removePopWindow", "removeSmallCards"],
    tag: "阿里妈妈批量广告分发"
  },
  {
    pattern: "mtop.etao.noah.query",
    args: ["removeNoahOps"],
    tag: "NOAH运营位"
  },
  {
    pattern: "mtop.alimama.moon.provider.tac.service.call",
    args: ["removeTAC"],
    tag: "搜索框推荐词-TAC基础"
  },
  {
    pattern: "mtop.alimama.moon.provider.tac.service.smart.call",
    args: ["removeTAC"],
    tag: "搜索框推荐词-TAC智能"
  },
  {
    pattern: "mtop.taobao.union.marquee.query",
    args: ["removeSmallCards"],
    tag: "搜索框跑马灯热词"
  },
  {
    pattern: "mtop.alimama.moon.provider.metax.homepage.query",
    args: ["removeSmallCards", "removeFeedKeywords"],
    tag: "首页搜索栏热词+清空Feed"
  },
  {
    pattern: "mtop.alimama.union.pub.entry",
    args: ["removePrivateDomain"],
    tag: "私域动态/关注会员"
  }
];

/**
 * Moon App MITM 域名
 */
const MOON_MITM_DOMAINS = [
  "acs.m.taobao.com",
  "gm.mmstat.com",
  "log.mmstat.com",
  "px.effirst.com",
  "abtest.alibaba.com",
  "s-gm.mmstat.com"
];

if (typeof module !== 'undefined') {
  module.exports = { 
    handleMoonResponse, 
    MOON_INTERFACES, 
    MOON_MITM_DOMAINS,
    MOON_SITE_CODES,
    MOON_NOAH_CONFIG,
    MOON_METAX_CONFIG,
    MOON_PRIVATE_CONFIG
  };
}