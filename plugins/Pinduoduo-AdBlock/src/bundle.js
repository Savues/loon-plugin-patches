/*
 * Pinduoduo-AdBlock v2.0.3 - Bundled Script for Loon
 * 拼多多去广告 · 完全复刻 v1.75 搜索拦截架构 · 单文件打包
 * 更新: 2026-10-20
 * 
 * 核心原则：
 * 1. 单条正则路由所有搜索端点 → 脚本内部 pathOf() 分发 (复刻 v1.75)
 * 2. 统一 search_stub 开关控制三源 (首页下发 + 轮询 + 结果页)
 * 3. /search_hotquery 返回 { status: 200, body: '{}' } (v1.75 行为)
 * 4. 字段级删除 > 整体 Stub，高危开关默认关，一键风控模式
 */

// ============================================
// 核心工具函数
// ============================================
function isEnabled(key) {
  const val = $argument[key];
  return val === true || val === "true" || val === "1" || val === "on" || val === "ON";
}

function isDisabled(key) {
  return !isEnabled(key);
}

function safeParse(body) {
  try {
    return JSON.parse(body);
  } catch (e) {
    return null;
  }
}

function log(...args) {
  console.log("[Pinduoduo-AdBlock]", ...args);
}

// ============================================
// 配置常量
// ============================================
const AD_ICON_IDS = new Set([
  473, 256, 472, 525, 463, 489, 486, 464, 471, 533, 530, 267, 534
]);

const DEFAULT_BOTTOM_TABS = new Set([
  "index.html", "chat_list.html", "personal.html"
]);

const PROMO_TAB_KEYWORDS = [
  "attendance.html", "promotion", "promo", "coupon", "discount", "subsidy"
];

// ============================================
// 路径提取 (复刻 v1.75 stub.response.js)
// ============================================
function pathOf(url) {
  try {
    const m = String(url).match(/^[a-z]+:\/\/[^/]+(\/[^?#]*)/i);
    return m ? m[1] : '';
  } catch (e) { return ''; }
}

// ============================================
// 搜索拦截核心逻辑 (完全复刻 v1.75 stub.response.js + 补全缺失端点)
// ============================================
// RULES: [开关, 动作, 路径, 动作参数]
const SEARCH_RULES = [
  ['search_stub', 'stub', '/search_hotquery'],
  ['search_stub', 'stub', '/search_suggest'],
  ['search_stub', 'del', '/search', ['expansion']],
];

function handleSearchResponse(body, url) {
  if (isDisabled("search_stub")) return body;
  
  const p = pathOf(url);
  const rule = SEARCH_RULES.find(([, , path]) => path === p);
  if (!rule) return body; // 不是搜索拦截管辖的路径
  
  const [sw, action, , arg] = rule;
  if (!isEnabled(sw)) return body;
  
  if (action === 'stub') {
    // v1.75 行为：返回 200 + 空对象
    log("Stub /search_hotquery (v1.75 mode)");
    $done({ status: 200, body: '{}' });
    return null; // 标记已处理
  }
  
  if (action === 'del') {
    const data = safeParse(body);
    if (!data) return body;
    for (const k of arg) delete data[k];
    log("Deleted /search expansion (v1.75 mode)");
    return JSON.stringify(data);
  }
  
  return body;
}

// ============================================
// 1. 首页 Hub 处理 (/api/alexa/homepage/hub)
// ============================================
function filterHomepageHub(body) {
  if (isDisabled("removeHomepageAds")) return body;
  
  const data = safeParse(body);
  if (!data?.result) return body;
  
  const r = data.result;
  let modified = false;
  
  // 1.1 删除营销活动图标 (icon_set)
  if (isEnabled("removeIconSet") && Array.isArray(r.icon_set)) {
    const originalLen = r.icon_set.length;
    r.icon_set = r.icon_set.filter(item => !AD_ICON_IDS.has(item?.id));
    if (r.icon_set.length !== originalLen) {
      log(`Removed ${originalLen - r.icon_set.length} marketing icons from icon_set`);
      modified = true;
    }
  }
  
  // 1.2 删除搜索热词整个对象 (归 search_stub 管，对齐 v1.75)
  if (isEnabled("search_stub") && r.search_bar_hot_query) {
    delete r.search_bar_hot_query;
    log("Deleted search_bar_hot_query (v1.75 mode, search_stub)");
    modified = true;
  }
  
  // 1.3 删除顶部标签图字段 (all_top_opts)
  if (isEnabled("removeTopOptsImages") && Array.isArray(r.all_top_opts)) {
    r.all_top_opts = r.all_top_opts.map(item => {
      if (!item || typeof item !== "object") return item;
      const c = { ...item };
      delete c.image;
      delete c.selected_image;
      delete c.height;
      delete c.width;
      return c;
    });
    log("Stripped images from all_top_opts");
    modified = true;
  }
  
  // 1.4 底栏自定义
  if (isEnabled("bottomCustom")) {
    const keepTabs = new Set(DEFAULT_BOTTOM_TABS);
    
    const BOT_MAP = {
      Bot_index: "index.html",
      Bot_chat: "chat_list.html",
      Bot_personal: "personal.html",
      Bot_live: "pdd_live_tab_list.html",
      Bot_class: "classification.html",
      Bot_attendance: "attendance.html"
    };
    
    for (const [key, sig] of Object.entries(BOT_MAP)) {
      if (isEnabled(key)) keepTabs.add(sig);
    }
    
    const extra = String($argument.Bot_custom || "").split(",").map(s => s.trim()).filter(Boolean);
    for (const sig of extra) keepTabs.add(sig);
    
    const filterTabs = (tabs) => {
      if (!Array.isArray(tabs)) return tabs;
      return tabs.filter(t => t && typeof t === "object" && typeof t.link === "string" &&
        Array.from(keepTabs).some(sig => t.link.includes(sig)));
    };
    
    if (r.bottom_tabs) { r.bottom_tabs = filterTabs(r.bottom_tabs); modified = true; }
    if (r.buffer_bottom_tabs) { r.buffer_bottom_tabs = filterTabs(r.buffer_bottom_tabs); modified = true; }
    log("Customized bottom tabs:", Array.from(keepTabs));
  }
  
  // 1.5 删除 dy_module.irregular_banner_dy
  if (isEnabled("removeIconSet") && r.dy_module?.irregular_banner_dy) {
    delete r.dy_module.irregular_banner_dy;
    log("Removed dy_module.irregular_banner_dy");
    modified = true;
  }
  
  return modified ? JSON.stringify(data) : body;
}

// ============================================
// 2. 信息流广告过滤 (/api/alexa/cells/hub/v3)
// ============================================
function filterFeedAds(body) {
  if (isDisabled("removeFeedAds")) return body;
  
  const data = safeParse(body);
  if (!data?.data?.goods_list || !Array.isArray(data.data.goods_list)) return body;
  
  const originalLen = data.data.goods_list.length;
  const filtered = data.data.goods_list.filter(item => {
    const d = item?.data;
    if (!d) return true;
    if (d.ad && (d.ad.bkfl === 1 || (d.ad.openinfo && d.ad.openinfo.ads_from === 0) || d.ad.ad_id)) {
      log(`Filtered feed ad: goods_id=${d.goods_id}, ad_id=${d.ad.ad_id || d.ad.openinfo?.ad_id}`);
      return false;
    }
    return true;
  });
  
  const removed = originalLen - filtered.length;
  if (removed > 0) {
    log(`Filtered ${removed}/${originalLen} feed ads`);
    data.data.goods_list = filtered;
    return JSON.stringify(data);
  }
  return body;
}

// ============================================
// 3. 搜索框推荐词 (/api/polemon/gbdbpdc, /api/search_lego...)
// ============================================
function filterSearchPromos(body) {
  if (isDisabled("removeSearchPromos")) return body;
  
  const data = safeParse(body);
  if (!data) return body;
  
  let modified = false;
  const fields = ['access_array', 'history', 'float_bar_array', 'more_options', 
                  'extra_array', 'tip1', 'tip2', 'text', 'degrade', 'extra_array_style'];
  
  for (const f of fields) {
    if (f in data) { data[f] = []; modified = true; }
  }
  
  if (modified) {
    log("Cleared search promo data (/api/polemon/gbdbpdc)");
    return JSON.stringify(data);
  }
  return body;
}

// ============================================
// 4. 百亿补贴页搜索词 (HTML)
// ============================================
function filterSubsidyPage(body) {
  if (isDisabled("search_stub")) return body; // 归 search_stub 管，对齐 v1.75
  
  const out = body
    .replace(/("queryWords"\s*:\s*)\[[^\]]*\]/, '$1[]')
    .replace(/("queryGuideWord"\s*:\s*)"[^"]*"/, '$1""');
  
  if (out !== body) {
    log("Cleared subsidy page queryWords (search_stub)");
    return out;
  }
  return body;
}

// ============================================
// 5. 扫码取件页
// ============================================
function filterScanPage(body) {
  if (isDisabled("removeScanPageAds")) return body;
  
  const oldChunk = "https://pfile.pddpic.com/mdkd/mdkd/_next/static/chunks/9410-b8806e870a26db7d.js";
  const newChunk = "https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Pinduoduo-AdBlock/src/chunks/9410-b8806e870a26db7d.js";
  
  if (body.includes(oldChunk)) {
    log("Replaced scan page chunk");
    return body.replaceAll(oldChunk, newChunk);
  }
  return body;
}

// ============================================
// 6. 个人中心页
// ============================================
function filterPersonalHub(body) {
  if (isDisabled("removePersonalAds")) return body;
  
  const data = safeParse(body);
  if (!data?.result) return body;
  
  let modified = false;
  const r = data.result;
  
  const fieldsToDelete = [
    "monthly_card_entrance",
    "personal_center_style_v2_vo",
    "icon_set.icons",
    "icon_set.top_personal_icons",
    "personal_banner"
  ];
  
  for (const field of fieldsToDelete) {
    const parts = field.split(".");
    let obj = r;
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj?.[parts[i]];
      if (!obj) break;
    }
    if (obj && parts[parts.length - 1] in obj) {
      delete obj[parts[parts.length - 1]];
      modified = true;
    }
  }
  
  if (modified) {
    log("Cleaned personal hub");
    return JSON.stringify(data);
  }
  return body;
}

// ============================================
// 7. 订单页清理 (仅删推广字段)
// ============================================
function filterOrderPages(body, url) {
  if (isDisabled("removeOrderPromos")) return body;
  
  const data = safeParse(body);
  if (!data) return body;
  
  let modified = false;
  
  if (url.includes("/api/caterham/v3/query/order_detail_group") && data.data?.goods_list) {
    delete data.data.goods_list;
    modified = true;
  }
  
  if (url.includes("/api/aristotle/order_list_v4") && data.orders) {
    data.orders = data.orders.map(order => {
      if (order.order_buttons) {
        order.order_buttons = order.order_buttons.map(btn => {
          const c = { ...btn };
          delete c.order_growth_tip;
          return c;
        });
      }
      return order;
    });
    modified = true;
  }
  
  if (url.startsWith("/order/")) {
    if (data.marketing_banner_vo) { delete data.marketing_banner_vo; modified = true; }
    if (data.shipping?.banner_above_recommend) { delete data.shipping.banner_above_recommend; modified = true; }
  }
  
  if (modified) {
    log("Cleaned order page promos");
    return JSON.stringify(data);
  }
  return body;
}

// ============================================
// 8. 埋点/遥测拦截 (Script 方案)
// ============================================
function filterTracking(body, url) {
  if (isDisabled("blockTracking")) return body;
  
  const isReportPath = 
    url.includes("/t.gif") ||
    url.includes("/api/pmm/defined") ||
    url.includes("/api/pmm/front_err") ||
    url.includes("/api/pmm/report") ||
    url.includes("/api/pmm/upload") ||
    url.includes("/api/pmm/log");
  
  const isConfigPath = 
    url.includes("/api/one-gateway-client/zone/v1/component/fetch") ||
    url.includes("/api/app/v2/experiment") ||
    url.includes("/api/one-gateway-client/");
  
  if (isConfigPath) {
    log("Allow tracking config path:", url);
    return body;
  }
  
  if (isReportPath) {
    log("Blocked tracking report:", url);
    return '{"success":true,"code":0}';
  }
  
  return body;
}

// ============================================
// 9. 统一路由入口
// ============================================
function isHtmlResponse(headers) {
  const ct = headers?.["content-type"] || headers?.["Content-Type"] || "";
  return ct.includes("text/html");
}

function main() {
  if (!$response || !$response.body) {
    $done({});
    return;
  }
  
  const url = $request?.url || "";
  const isHtml = isHtmlResponse($response.headers);
  let body = typeof $response.body === "string" ? $response.body : $response.body.toString();
  let newBody = body;
  
  // 全局风控模式
  if (isEnabled("riskControlMode")) {
    log("Risk control mode ON - passing through all responses");
    $done({});
    return;
  }
  
  log("Processing:", url);
  
  try {
    if (!isHtml) {
      // === 核心：搜索端点统一路由 (复刻 v1.75 单条正则架构) ===
      // v1.75 正则: ^https:\/\/api\.pinduoduo\.com\/(search_hotquery|search|api\/aristotle\/...|api\/aquarius\/hungary\/global\/homepage|...)
      // 我们在 bundle.js 内部用 pathOf() 分发
      
      const path = (() => {
        try {
          const m = String(url).match(/^[a-z]+:\/\/[^/]+(\/[^?#]*)/i);
          return m ? m[1] : "";
        } catch (e) { return ""; }
      })();
      
      // 1. 搜索端点统一处理 (search_hotquery, search)
      if (path === "/search_hotquery" || path === "/search") {
        const handled = handleSearchResponse(body, url);
        if (handled === null) return; // stub 已 $done
        if (handled !== body) { newBody = handled; }
      }
      // 2. 首页 Hub
      else if (path === "/api/alexa/homepage/hub") {
        newBody = filterHomepageHub(body);
      }
      // 3. 信息流
      else if (path.startsWith("/api/alexa/cells/hub")) {
        newBody = filterFeedAds(body);
      }
      // 4. 搜索框推荐词
      else if (path === "/api/polemon/gbdbpdc" || path.startsWith("/api/search_lego")) {
        newBody = filterSearchPromos(body);
      }
      // 5. 个人中心
      else if (path === "/api/philo/personal/hub") {
        newBody = filterPersonalHub(body);
      }
      // 6. 订单页
      else if (path.includes("/api/caterham/v3/query/order_detail_group") ||
               path.includes("/api/aristotle/order_list_v4") ||
               path.startsWith("/order/")) {
        newBody = filterOrderPages(body, url);
      }
      // 7. 埋点拦截
      else if (url.includes("th-a.pinduoduo.com") ||
               url.includes("apm.pinduoduo.com") ||
               url.includes("apm-a.pinduoduo.com") ||
               url.includes("ta-a.pinduoduo.com") ||
               url.includes("abtk.pinduoduo.com") ||
               url.includes("meta.pinduoduo.com")) {
        newBody = filterTracking(body, url);
      }
    }
    else {
      // HTML 页面
      if (url.includes("brand_activity_subsidy.html")) {
        newBody = filterSubsidyPage(body);
      }
      else if (url.includes("/mdkd/package")) {
        newBody = filterScanPage(body);
      }
    }
  } catch (e) {
    log("Error:", e);
    $done({});
    return;
  }
  
  if (newBody !== body) {
    log("Response modified for:", url);
    $done({ body: newBody });
  } else {
    $done({});
  }
}

main();