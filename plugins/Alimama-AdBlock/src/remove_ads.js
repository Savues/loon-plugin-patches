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

function main() {
  if (!$response || !$response.body) {
    console.log("[Alimama-AdBlock] No response body");
    $done({});
    return;
  }

  const url = $request?.url || "";
  console.log("[Alimama-AdBlock] Script triggered for:", url);
  
  if (!url.includes("mtop.alimama.union.skyleap.distribution.batchsite")) {
    console.log("[Alimama-AdBlock] URL not match, skip");
    $done({});
    return;
  }

  const body = typeof $response.body === "string" ? $response.body : $response.body.toString();
  console.log("[Alimama-AdBlock] Processing batchsite response, length:", body.length);
  const newBody = filterBatchsite(body);

  if (newBody !== body) {
    console.log("[Alimama-AdBlock] Response modified, items filtered");
    $done({ body: newBody });
  } else {
    console.log("[Alimama-AdBlock] No items filtered");
    $done({});
  }
}

main();