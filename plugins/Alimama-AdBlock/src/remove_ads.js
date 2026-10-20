/*
 * Alimama-AdBlock — 阿里妈妈 Moon App 去广告核心脚本
 * 处理 mtop.alimama.union.skyleap.distribution.batchsite 响应
 * 按 siteCode 过滤：开屏、弹窗、小卡片、公告栏
 */

function isEnabled(key) {
  const val = $argument[key];
  return val === true || val === "true" || val === "1";
}

function filterBatchsite(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    console.log("[Alimama-AdBlock] JSON parse failed:", e);
    return body;
  }

  // 响应结构：{ api, data: { batchResult: [...] }, ret, v }
  // batchResult 每项含：siteCode, siteData, memberId, tkScm 等
  if (!data?.data?.batchResult || !Array.isArray(data.data.batchResult)) {
    return body;
  }

  const originalLen = data.data.batchResult.length;

  // 定义 siteCode 分类
  const SPLASH_CODES = new Set(["open_screen_site"]);
  const POPUP_CODES = new Set(["pop_window_site"]);
  const SMALL_CARD_CODES = new Set([
    "small_handler_home_site",
    "small_handler_share_site",
    "small_handler_h5_1_site",
    "small_handler_h5_2_site",
    "small_handler_h5_3_site",
    "bulletin_board_mid_site",
    "bulletin_board_report_site",
    "bulletin_board_mine_site",
    "searchDomeWord_site"
  ]);

  const filtered = data.data.batchResult.filter(item => {
    const code = item?.siteCode;
    if (!code) return true; // 无 siteCode 保留

    // 开屏广告
    if (SPLASH_CODES.has(code) && isEnabled("removeSplashAd")) {
      console.log("[Alimama-AdBlock] Filtered splash:", code);
      return false;
    }
    // 弹窗广告
    if (POPUP_CODES.has(code) && isEnabled("removePopWindow")) {
      console.log("[Alimama-AdBlock] Filtered popup:", code);
      return false;
    }
    // 小卡片/公告栏/搜索词推荐
    if (SMALL_CARD_CODES.has(code) && isEnabled("removeSmallCards")) {
      console.log("[Alimama-AdBlock] Filtered small card:", code);
      return false;
    }
    return true;
  });

  const removed = originalLen - filtered.length;
  if (removed > 0) {
    console.log(`[Alimama-AdBlock] Removed ${removed}/${originalLen} ad items`);
    data.data.batchResult = filtered;
    return JSON.stringify(data);
  }

  return body;
}

function filterMarquee(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    console.log("[Alimama-AdBlock] Marquee JSON parse failed:", e);
    return body;
  }

  // 响应结构：{ api, data: { result: [...] }, ret, v }
  if (!data?.data?.result || !Array.isArray(data.data.result)) {
    return body;
  }

  if (data.data.result.length > 0 && isEnabled("removeSmallCards")) {
    console.log(`[Alimama-AdBlock] Clearing marquee result (${data.data.result.length} items)`);
    data.data.result = [];
    return JSON.stringify(data);
  }

  return body;
}

function filterTACServiceCall(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    console.log("[Alimama-AdBlock] TAC service call JSON parse failed:", e);
    return body;
  }

  // Structure: { data: { "2019021101": { data: [{word: "..."}, ...] } } }
  if (!data?.data || !isEnabled("removeSmallCards")) {
    return body;
  }

  let modified = false;
  for (const key of Object.keys(data.data)) {
    const serviceData = data.data[key];
    if (serviceData?.data && Array.isArray(serviceData.data) && serviceData.data.length > 0) {
      console.log(`[Alimama-AdBlock] Clearing TAC service call ${key} (${serviceData.data.length} words)`);
      serviceData.data = [];
      modified = true;
    }
  }

  if (modified) {
    return JSON.stringify(data);
  }
  return body;
}

function filterTACServiceSmartCall(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    console.log("[Alimama-AdBlock] TAC service smart call JSON parse failed:", e);
    return body;
  }

  // Structure: { data: { wordList: [{word: "..."}, ...], template: {...} } }
  if (!data?.data?.wordList || !Array.isArray(data.data.wordList) || !isEnabled("removeSmallCards")) {
    return body;
  }

  if (data.data.wordList.length > 0) {
    console.log(`[Alimama-AdBlock] Clearing TAC smart call wordList (${data.data.wordList.length} words)`);
    data.data.wordList = [];
    return JSON.stringify(data);
  }

  return body;
}

function main() {
  if (!$response || !$response.body) {
    console.log("[Alimama-AdBlock] No response body");
    $done({});
    return;
  }

  const url = $request?.url || "";
  console.log("[Alimama-AdBlock] Script triggered for:", url);

  const body = typeof $response.body === "string" ? $response.body : $response.body.toString();

  // 1. 批量广告分发
  if (url.includes("mtop.alimama.union.skyleap.distribution.batchsite")) {
    console.log("[Alimama-AdBlock] Processing batchsite response, length:", body.length);
    const newBody = filterBatchsite(body);
    if (newBody !== body) {
      console.log("[Alimama-AdBlock] Batchsite response modified");
      $done({ body: newBody });
      return;
    }
  }

  // 2. 搜索框跑马灯热词
  if (url.includes("mtop.taobao.union.marquee.query")) {
    console.log("[Alimama-AdBlock] Processing marquee query response, length:", body.length);
    const newBody = filterMarquee(body);
    if (newBody !== body) {
      console.log("[Alimama-AdBlock] Marquee response modified");
      $done({ body: newBody });
      return;
    }
  }

  // 3. 搜索框推荐词 - TAC 基础服务
  if (url.includes("mtop.alimama.moon.provider.tac.service.call")) {
    console.log("[Alimama-AdBlock] Processing TAC service call response, length:", body.length);
    const newBody = filterTACServiceCall(body);
    if (newBody !== body) {
      console.log("[Alimama-AdBlock] TAC service call response modified");
      $done({ body: newBody });
      return;
    }
  }

  // 4. 搜索框推荐词 - TAC 智能服务
  if (url.includes("mtop.alimama.moon.provider.tac.service.smart.call")) {
    console.log("[Alimama-AdBlock] Processing TAC smart call response, length:", body.length);
    const newBody = filterTACServiceSmartCall(body);
    if (newBody !== body) {
      console.log("[Alimama-AdBlock] TAC smart call response modified");
      $done({ body: newBody });
      return;
    }
  }

  console.log("[Alimama-AdBlock] No matching handler or no changes");
  $done({});
}

main();