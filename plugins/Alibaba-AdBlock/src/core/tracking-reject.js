/*
 * Alibaba-AdBlock — 埋点/APM/实验分流拦截 (core/tracking-reject.js)
 * 这是用于生成 [Rewrite] 规则的配置，不是运行时脚本
 * 版本: 2.0.0
 */

/**
 * 埋点/APM/实验分流域名列表
 * 用于生成 [Rewrite] reject 规则
 * 全阿里系 App 通用
 */
const TRACKING_DOMAINS = [
  // 埋点/错误上报
  "gm.mmstat.com",
  "log.mmstat.com",
  "s-gm.mmstat.com",
  
  // APM/JS错误/性能监控
  "px.effirst.com",
  
  // 实验分流
  "abtest.alibaba.com",
  
  // 可选：阿里妈妈特定埋点
  // "afpapi.alimama.com",
  
  // 可选：其他阿里埋点 (需谨慎，可能影响正常功能)
  // "tlog.mmstat.com",
  // "ut.alimama.com"
];

/**
 * 生成 Loon [Rewrite] 规则
 * @param {string[]} domains - 域名列表
 * @param {string} enableSwitch - 开关名称
 * @returns {string[]} - Rewrite 规则数组
 */
function generateRewriteRules(domains = TRACKING_DOMAINS, enableSwitch = "blockTracking") {
  return domains.map(domain => 
    `^https?://${domain.replace(/\./g, '\\.')}/ reject, enable={${enableSwitch}}`
  );
}

/**
 * 生成完整的 [Rewrite] 段内容
 */
function generateRewriteSection(enableSwitch = "blockTracking") {
  const rules = generateRewriteRules(TRACKING_DOMAINS, enableSwitch);
  return [
    "# 埋点/错误上报/APM/实验分流 —— 直接 Reject",
    ...rules,
    "",
    "# 可选：保留阿里妈妈其他正常 API 不解密（如需可取消注释)",
    "# DOMAIN-SUFFIX, afpapi.alimama.com, REJECT"
  ].join("\n");
}

/**
 * 仅获取域名列表 (用于 MITM 配置)
 */
function getTrackingDomains() {
  return [...TRACKING_DOMAINS];
}

if (typeof module !== 'undefined') {
  module.exports = { 
    TRACKING_DOMAINS, 
    generateRewriteRules, 
    generateRewriteSection, 
    getTrackingDomains 
  };
}