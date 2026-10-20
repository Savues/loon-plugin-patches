/*
 * Alibaba-AdBlock — 搜索框跑马灯/热词过滤 (core/marquee-filter.js)
 * 接口: mtop.taobao.union.marquee.query
 * 适用: 有搜索框跑马灯的阿里系 App
 * 版本: 2.0.0
 */

const { isEnabled, safeParse, log } = require('./common.js');

/**
 * 过滤跑马灯热词
 * 接口: mtop.taobao.union.marquee.query
 * 响应结构: { data: { result: [...] } }
 */
function filterMarquee(body) {
  if (!isEnabled("removeSmallCards")) return body;

  const data = safeParse(body);
  if (!data?.data?.result || !Array.isArray(data.data.result)) {
    return body;
  }

  if (data.data.result.length > 0) {
    log(`Clearing marquee result (${data.data.result.length} items)`);
    data.data.result = [];
    return JSON.stringify(data);
  }

  return body;
}

if (typeof module !== 'undefined') {
  module.exports = { filterMarquee };
}