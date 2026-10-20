/*
 * Pinduoduo-AdBlock v2.0.0 - Bundled Script for Loon
 * 拼多多去广告 · 安全模式优先 · 单文件打包
 * 更新: 2026-10-20
 * 
 * 核心原则：
 * 1. 字段级删除 > 整体 Stub (避免风控)
 * 2. 高危开关默认关 + 显性警告
 * 3. 一键「风控模式」关闭所有激进拦截
 * 4. 埋点拦截仅针对上报路径，配置下发路径放行
 * 5. 绝不拦截 WebSocket/登录/支付/下单链路
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
  473,  // 限时秒杀
  256,  // 9块9特卖
  472,  // 潮流好价
  525,  // 超级满减
  463,  // 现金大富翁
  489,  // 现金大转盘
  486,  // 免费领礼物
  464,  // 推金币
  471,  // 补贴多人团
  533,  // 超级晚8
  530,  // 资质规则
  267,  // 省钱月卡
  534,  // 奢品馆
]);

const DEFAULT_BOTTOM_TABS = new Set([
  "index.html",
  "chat_list.html",
  "personal.html"
]);

const PROMO_TAB_KEYWORDS = [
  "attendance.html",
  "promotion",
  "promo",
  "coupon",
  "discount",
  "subsidy"
];

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
  
  // 1.2 清空搜索热词 (键名统一为 removeSearchPromos)
  if (isEnabled("removeSearchPromos") && r.search_bar_hot_query) {
    if (r.search_bar_hot_query.hotqs) r.search_bar_hot_query.hotqs = [];
    if (r.search_bar_hot_query.items) r.search_bar_hot_query.items = [];
    log("Cleared search_bar_hot_query");
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
    
    // 用户勾选的标准底栏项
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
    
    // 自定义输入项 (逗号分隔，包含匹配)
    const extra = String($argument.Bot_custom || "").split(",").map(s => s.trim()).filter(Boolean);
    for (const sig of extra) keepTabs.add(sig);
    
    const filterTabs = (tabs) => {
      if (!Array.isArray(tabs)) return tabs;
      return tabs.filter(t => t && typeof t === "object" && typeof t.link === "string" &&
        Array.from(keepTabs).some(sig => t.link.includes(sig)));
    };
    
    if (r.bottom_tabs) {
      r.bottom_tabs = filterTabs(r.bottom_tabs);
      modified = true;
    }
    if (r.buffer_bottom_tabs) {
      r.buffer_bottom_tabs = filterTabs(r.buffer_bottom_tabs);
      modified = true;
    }
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
    // 核心特征：data.ad 存在且 bkfl=1 或 openinfo.ads_from=0
    const d = item?.data;
    if (!d) return true;
    
    // 检查 ad 字段
    if (d.ad) {
      const ad = d.ad;
      if (ad.bkfl === 1 || 
          (ad.openinfo && ad.openinfo.ads_from === 0) ||
          ad.ad_id) {
        log(`Filtered feed ad: goods_id=${d.goods_id}, ad_id=${ad.ad_id || ad.openinfo?.ad_id}`);
        return false;
      }
    }
    
    // 检查 tag_list 中的广告标签
    if (Array.isArray(d.tag_list)) {
      for (const tag of d.tag_list) {
        if (tag && typeof tag === "object") {
          const text = tag.text || "";
          if (text.includes("补贴") || text.includes("畅销榜") || text.includes("好店")) {
            // 仅作辅助判断，不单独过滤
          }
        }
      }
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
// 3. 搜索热词/推荐词/搜索页过滤
// ============================================
function filterSearchHotQuery(body, url) {
  if (isDisabled("removeSearchPromos")) return body;
  
  const data = safeParse(body);
  if (!data) return body;
  
  let modified = false;
  
  // /api/polemon/gbdbpdc - 搜索框推荐词 (点击搜索框下拉)
  if (data.access_array) { data.access_array = []; modified = true; }
  if (data.history) { data.history = []; modified = true; }
  if (data.float_bar_array) { data.float_bar_array = []; modified = true; }
  if (data.more_options) { data.more_options = []; modified = true; }
  if (data.extra_array) { data.extra_array = []; modified = true; }
  if (data.tip1) { data.tip1 = ""; modified = true; }
  if (data.tip2) { data.tip2 = ""; modified = true; }
  if (data.text) { data.text = ""; modified = true; }
  if (data.degrade) { data.degrade = []; modified = true; }
  if (data.extra_array_style) { data.extra_array_style = []; modified = true; }
  
  // /search_hotquery - 热词轮询 (对齐 v1.75: stub 整响应可选)
  if (url.includes("/search_hotquery")) {
    if (data.hotqs) { data.hotqs = []; modified = true; }
    if (data.items) { data.items = []; modified = true; }
    // 可选: 完全 stub 模式 (更彻底，对齐 v1.75)
    if (isEnabled("searchStubMode")) {
      log("Stub /search_hotquery (v1.75 mode)");
      return '{"success":true,"code":0,"hotqs":[],"items":[]}';
    }
  }
  
  // /search - 搜索结果页 (扩展 v1.75 仅删 expansion)
  if (url.includes("/search") && !url.includes("/search_hotquery") && !url.includes("/search_lego")) {
    const searchFieldsToDelete = [
      'expansion',           // v1.75 原有
      'banner',              // 顶部横幅广告
      'ad_slots',            // 广告位
      'search_discovery',    // 搜索发现栏目
      'discovery',           // 发现栏目
      'recommend_banner',    // 推荐横幅
      'promotion_banner',    // 促销横幅
      'hot_query',           // 热搜词
      'related_search',      // 相关搜索
      'guess_you_like',      // 猜你喜欢
      'algo_data',           // 算法数据
      'ext',                 // 扩展字段
      'rec_data',            // 推荐数据
      'search_guide',        // 搜索引导
      'search_entrance',     // 搜索入口
    ];
    for (const field of searchFieldsToDelete) {
      if (field in data) { delete data[field]; modified = true; }
    }
    // 也要检查 data.data
    if (data.data && typeof data.data === 'object') {
      for (const field of searchFieldsToDelete) {
        if (field in data.data) { delete data.data[field]; modified = true; }
      }
      // goods_list 广告项过滤 (同信息流 data.ad 识别)
      if (Array.isArray(data.data.goods_list)) {
        const originalLen = data.data.goods_list.length;
        data.data.goods_list = data.data.goods_list.filter(item => {
          const d = item?.data;
          if (!d) return true;
          if (d.ad && (d.ad.bkfl === 1 || (d.ad.openinfo && d.ad.openinfo.ads_from === 0) || d.ad.ad_id)) {
            log(`Filtered search result ad: goods_id=${d.goods_id}, ad_id=${d.ad.ad_id || d.ad.openinfo?.ad_id}`);
            return false;
          }
          return true;
        });
        if (data.data.goods_list.length !== originalLen) {
          modified = true;
        }
      }
    }
  }
  
  // /api/search_lego_m1_cards/lego_view - 搜索语音面板
  if (data.result && Array.isArray(data.result)) {
    data.result = [];
    modified = true;
  }
  
  if (modified) {
    log("Cleared search hot query data");
    return JSON.stringify(data);
  }
  return body;
}

// ============================================
// 4. 埋点/遥测拦截 (Script 方案，替代失效的 Rule enable=)
// ============================================
function filterTracking(body, url) {
  if (isDisabled("blockTracking")) return body;
  
  // 仅拦截上报类路径，放行配置下发
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
    return body; // 放行配置下发
  }
  
  if (isReportPath) {
    log("Blocked tracking report:", url);
    return '{"success":true,"code":0}'; // 返回最小成功响应
  }
  
  return body;
}

// ============================================
// 5. 百亿补贴页搜索词 (HTML 页面)
// ============================================
function filterSubsidyPage(body) {
  if (isDisabled("removeSearchPromos")) return body;
  
  // 仅替换 queryWords 数组字面量，不解析整页 HTML
  const out = body
    .replace(/("queryWords"\s*:\s*)\[[^\]]*\]/, '$1[]')
    .replace(/("queryGuideWord"\s*:\s*)"[^"]*"/, '$1""');
  
  if (out !== body) {
    log("Cleared subsidy page queryWords");
    return out;
  }
  return body;
}

// ============================================
// 6. 扫码取件页 (HTML 页面 chunk 替换)
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
// 7. 个人中心页清理 (/api/philo/personal/hub)
// ============================================
function filterPersonalHub(body) {
  if (isDisabled("removePersonalAds")) return body;
  
  const data = safeParse(body);
  if (!data?.result) return body;
  
  let modified = false;
  const r = data.result;
  
  // 删除月卡入口等推广
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
// 8. 订单页清理 (仅删推广字段，不 stub 整响应)
// ============================================
function filterOrderPages(body, url) {
  if (isDisabled("removeOrderPromos")) return body;
  
  const data = safeParse(body);
  if (!data) return body;
  
  let modified = false;
  
  // /api/caterham/v3/query/order_detail_group - 删除 goods_list 推广
  if (url.includes("/api/caterham/v3/query/order_detail_group") && data.data?.goods_list) {
    delete data.data.goods_list;
    modified = true;
  }
  
  // /api/aristotle/order_list_v4 - 删除 order_growth_tip
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
  
  // /order/ - 删除 marketing_banner_vo, shipping.banner_above_recommend
  if (url.includes("/order/")) {
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
// 9. 统一路由入口
// ============================================
function getUrlPath(url) {
  try {
    const m = String(url).match(/^[a-z]+:\/\/[^/]+(\/[^?#]*)/i);
    return m ? m[1] : "";
  } catch (e) {
    return "";
  }
}

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
  const path = getUrlPath(url);
  const isHtml = isHtmlResponse($response.headers);
  let body = typeof $response.body === "string" ? $response.body : $response.body.toString();
  let newBody = body;
  
  // 全局风控模式：一键关闭所有激进拦截
  const riskMode = isEnabled("riskControlMode");
  if (riskMode) {
    log("Risk control mode ON - passing through all responses");
    $done({});
    return;
  }
  
  log("Processing:", path);
  
  try {
    // --- JSON API 路由 ---
    if (!isHtml) {
      // 首页 Hub
      if (path === "/api/alexa/homepage/hub") {
        newBody = filterHomepageHub(body);
      }
      // 信息流
      else if (path.startsWith("/api/alexa/cells/hub")) {
        newBody = filterFeedAds(body);
      }
      // 搜索热词/推荐
      else if (path === "/api/polemon/gbdbpdc" || 
               path === "/search_hotquery" || 
               path === "/search" ||
               path.startsWith("/api/search_lego")) {
        newBody = filterSearchHotQuery(body, url);
      }
      // 个人中心
      else if (path === "/api/philo/personal/hub") {
        newBody = filterPersonalHub(body);
      }
      // 订单相关
      else if (path.includes("/api/caterham/v3/query/order_detail_group") ||
               path.includes("/api/aristotle/order_list_v4") ||
               path.startsWith("/order/")) {
        newBody = filterOrderPages(body, url);
      }
      // 埋点上报拦截
      else if (url.includes("th-a.pinduoduo.com") ||
               url.includes("apm.pinduoduo.com") ||
               url.includes("apm-a.pinduoduo.com") ||
               url.includes("ta-a.pinduoduo.com") ||
               url.includes("abtk.pinduoduo.com") ||
               url.includes("meta.pinduoduo.com")) {
        newBody = filterTracking(body, url);
      }
    }
    // --- HTML 页面路由 ---
    else {
      // 百亿补贴页
      if (url.includes("brand_activity_subsidy.html")) {
        newBody = filterSubsidyPage(body);
      }
      // 扫码取件页
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
    log("Response modified for:", path);
    $done({ body: newBody });
  } else {
    $done({});
  }
}

main();