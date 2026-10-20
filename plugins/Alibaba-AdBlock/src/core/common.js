/*
 * Alibaba-AdBlock — 核心共享工具函数
 * 版本: 2.0.0
 */

// 统一的开关检查函数
function isEnabled(key) {
  const val = $argument[key];
  return val === true || val === "true" || val === "1";
}

// 安全解析 JSON
function safeParse(body) {
  try {
    return JSON.parse(body);
  } catch (e) {
    console.log("[Alibaba-AdBlock] JSON parse failed:", e);
    return null;
  }
}

// 通用日志前缀
const LOG_PREFIX = "[Alibaba-AdBlock]";

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

function logError(...args) {
  console.log(LOG_PREFIX, "ERROR:", ...args);
}

// 导出
if (typeof module !== 'undefined') {
  module.exports = { isEnabled, safeParse, log, logError, LOG_PREFIX };
}