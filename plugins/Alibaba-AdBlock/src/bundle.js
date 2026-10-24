/*
 * Alibaba-AdBlock v3.0.0 - Bundled Script for Loon
 * 阿里系去广告 · 支持 Moon/淘宝/天猫/闲鱼/盒马/飞猪等
 * 单文件打包，无需 require() 支持
 * 更新: 2026-10-21
 * v3.0.0: 新增 filterTaobaoAtmosphere (双11氛围皮肤禁用)
 * v2.9.0: 反编译新增接口处理 (newface.newget / aihome.tac / tmall.tac.gateway / idlecommerce.splash.async+config / adx.bid / game.iaa / user.strategy.get)
 */

// ============================================
// 核心工具函数
// ============================================
// 闲鱼"猜你可能在找"板块占位词 (清空广告后填入无害文案, 保持 App 联想初始化所需的内容结构)
const FISH_GUESS_PLACEHOLDER = "我是学生，可以送我吗？";

function isEnabled(key) {
  // ★ Loon 传入的 $argument 可能是数组形态 [ {...} ] (插件 [Argument] 参数),
  //   也可能是对象形态 { ... }; 数组形态下直接 $argument[key] 恒为 undefined
  //   → 所有开关判定为 false → Script 规则全部失效 (v3.37.3 事故)
  let arg = $argument;
  if (Array.isArray(arg)) {
    arg = arg.length > 0 ? arg[0] : {};
  }
  if (!arg || typeof arg !== "object") return false;
  const val = arg[key];
  if (val === undefined || val === null) return false;
  return val === true || val === "true" || val === "1";
}

function safeParse(body) {
  try {
    return JSON.parse(body);
  } catch (e) {
    console.log("[Alibaba-AdBlock] JSON parse failed:", e);
    return null;
  }
}

function log(...args) {
  console.log("[Alibaba-AdBlock]", ...args);
}

// ============================================
// 批量广告分发过滤 (Moon/通用)
// ============================================
const DEFAULT_SITE_CODES = {
  splash: new Set(["open_screen_site"]),
  popup: new Set(["pop_window_site"]),
  smallCards: new Set([
    "small_handler_home_site",
    "small_handler_share_site",
    "small_handler_h5_1_site",
    "small_handler_h5_2_site",
    "small_handler_h5_3_site",
    "bulletin_board_mid_site",
    "bulletin_board_report_site",
    "bulletin_board_mine_site",
    "searchDomeWord_site"
  ])
};

function filterBatchsite(body, siteCodes) {
  const data = safeParse(body);
  if (!data || !data.data?.batchResult || !Array.isArray(data.data.batchResult)) {
    return body;
  }
  const originalLen = data.data.batchResult.length;
  const filtered = data.data.batchResult.filter(item => {
    const code = item?.siteCode;
    if (!code) return true;
    if (siteCodes.splash.has(code) && isEnabled("removeSplashAd")) { console.log("[Alibaba-AdBlock] Filtered splash:", code); return false; }
    if (siteCodes.popup.has(code) && isEnabled("removePopWindow")) { console.log("[Alibaba-AdBlock] Filtered popup:", code); return false; }
    if (siteCodes.smallCards.has(code) && isEnabled("removeSmallCards")) { console.log("[Alibaba-AdBlock] Filtered small card:", code); return false; }
    return true;
  });
  const removed = originalLen - filtered.length;
  if (removed > 0) {
    console.log("[Alibaba-AdBlock] Removed " + removed + "/" + originalLen + " batchsite ad items");
    data.data.batchResult = filtered;
    return JSON.stringify(data);
  }
  return body;
}

// ============================================
// NOAH 运营位过滤 (Moon/通用)
// ============================================
const DEFAULT_NOAH_CONFIG = {
  blockResKeys: [
    // 一淘首页悬浮任务窗 (膨胀红包"点击3个商品")
    "etao_home_task_freemove",
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
  allowResKeys: [
    "moon_main_handle",
    "moon_share_handle",
    "moon_withdrawal_top_section",
    "moon_withdrawal_bottom_section",
    "moon_withdrawal_error_section"
  ]
};

function filterNoahQuery(body, config) {
  if (!isEnabled("removeNoahOps")) return body;
  const data = safeParse(body);
  if (!data || !data.data?.assetResult || !Array.isArray(data.data.assetResult)) return body;
  const { blockResKeys, allowResKeys } = config;
  const allowSet = new Set(allowResKeys);
  const blockSet = new Set(blockResKeys);
  const originalLen = data.data.assetResult.length;
  const filtered = data.data.assetResult.filter(item => {
    const resKey = item?.resKey;
    if (!resKey) return true;
    if (allowSet.has(resKey)) return true;
    if (blockSet.has(resKey)) { console.log("[Alibaba-AdBlock] Filtered NOAH resKey:", resKey); return false; }
    // 前缀族匹配 (etao_home_task* 等运营位命名族)
    for (const b of blockSet) { if (resKey.startsWith(b)) { console.log("[Alibaba-AdBlock] Filtered NOAH resKey (prefix):", resKey); return false; } }
    return true;
  });
  const removed = originalLen - filtered.length;
  if (removed > 0) {
    console.log("[Alibaba-AdBlock] Filtered NOAH: removed " + removed + "/" + originalLen + " items");
    data.data.assetResult = filtered;
    return JSON.stringify(data);
  }
  return body;
}

// ============================================
// TAC 搜索推荐过滤 (Moon/通用)
// ============================================
function filterTACServiceCall(body) {
  const data = safeParse(body);
  if (!data || !data.data) return body;
  let modified = false;
  for (const key of Object.keys(data.data)) {
    const serviceData = data.data[key];
    if (serviceData?.data && Array.isArray(serviceData.data) && serviceData.data.length > 0) {
      console.log("[Alibaba-AdBlock] Clearing TAC service call " + key + " (" + serviceData.data.length + " words)");
      serviceData.data = [];
      modified = true;
    }
  }
  if (modified) return JSON.stringify(data);
  return body;
}

function filterTACServiceSmartCall(body) {
  const data = safeParse(body);
  if (!data?.data?.wordList || !Array.isArray(data.data.wordList)) return body;
  if (data.data.wordList.length > 0) {
    console.log("[Alibaba-AdBlock] Clearing TAC smart call wordList (" + data.data.wordList.length + " words)");
    data.data.wordList = [];
    return JSON.stringify(data);
  }
  return body;
}

function filterTAC(body, url) {
  if (!isEnabled("removeTAC")) return body;
  if (url.includes("tac.service.call") && !url.includes("smart.call")) {
    return filterTACServiceCall(body);
  }
  if (url.includes("tac.service.smart.call")) {
    return filterTACServiceSmartCall(body);
  }
  return body;
}

// ============================================
// MetaX 首页/Feed 过滤 (Moon)
// ============================================
const DEFAULT_METAX_CONFIG = {
  hotwordsType: "42701_96",
  clearFeedTypes: ["58536_33"]
};

function filterMetaxHotwords(body, config) {
  if (!isEnabled("removeSmallCards")) return body;
  const data = safeParse(body);
  if (!data || typeof data !== "object") return body;
  let modified = false;
  const hotwordsType = (config && config.hotwordsType) || "42701_96";
  // 真实数据: 含 hotwords 的 section 可能在 headerList / sections / 任意数组 (type 58536_33 / 42561_202 / sectionKey moon_home_search_bar_section)
  // → 全树递归, 只要遇到 hotwords 数组就清空
  const walk = (node, depth) => {
    if (depth > 8 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const it of node) walk(it, depth + 1);
      return;
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (k === "hotwords" && Array.isArray(v) && v.length) {
        console.log("[Alibaba-AdBlock] Clearing metax hotwords (" + v.length + " words)");
        node[k] = [];
        modified = true;
      } else if (v && typeof v === "object") {
        walk(v, depth + 1);
      }
    }
  };
  walk(data, 0);
  if (modified) return JSON.stringify(data);
  return body;
}

// ★ 私域动态横幅: siteData.bannerList (pic + jumpUrl -> mo.m.taobao.com/union2/*)
//   真实路径: bodyList[i].tabList[j].dataList[k].fields.floorMappingList[m].siteMappingList[n].siteData.bannerList
//   实测 23 项 (私域动态/营销入口横幅)
function clearMetaxBannerList(node, stats) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const it of node) clearMetaxBannerList(it, stats);
    return;
  }
  if (Array.isArray(node.bannerList) && node.bannerList.length) {
    stats.cleared += node.bannerList.length;
    node.bannerList = [];
  }
  for (const k of Object.keys(node)) {
    if (k === "bannerList") continue;
    clearMetaxBannerList(node[k], stats);
  }
}

function filterMetaxFeed(body, config) {
  // 注: removeFeedKeywords 默认关 (会清空整个首页推荐流), 但 bannerList(私域动态横幅)
  //     属于 removePrivateDomain 范畴 → 单独判断, 不受 feed 开关影响
  const wantBannerClear = isEnabled("removePrivateDomain");
  if (!isEnabled("removeFeedKeywords") && !wantBannerClear) return body;
  const data = safeParse(body);
  if (!data?.data?.data?.bodyList || !Array.isArray(data.data.data.bodyList)) return body;
  let totalCleared = 0;
  const { clearFeedTypes } = config;
  for (const bodyItem of data.data.data.bodyList) {
    if (clearFeedTypes.length > 0 && !clearFeedTypes.includes(bodyItem?.type)) {
      // feed 关闭时仍需处理 bannerList (私域动态) → 不 continue, 交给下面的分支
      if (!wantBannerClear) continue;
    }
    if (isEnabled("removeFeedKeywords") && bodyItem?.fields?.newsList?.recommend?.resultList && Array.isArray(bodyItem.fields.newsList.recommend.resultList)) {
      const originalLen = bodyItem.fields.newsList.recommend.resultList.length;
      if (originalLen > 0) {
        console.log("[Alibaba-AdBlock] Clearing feed: bodyList type=" + bodyItem.type + ", removed " + originalLen + " items");
        bodyItem.fields.newsList.recommend.resultList = [];
        bodyItem.fields.newsList.recommend.hasMore = "false";
        bodyItem.fields.newsList.recommend.allCount = "0";
        totalCleared += originalLen;
      }
    }
    if (isEnabled("removeFeedKeywords") && bodyItem?.fields?.resultList && Array.isArray(bodyItem.fields.resultList)) {
      const originalLen = bodyItem.fields.resultList.length;
      if (originalLen > 0) {
        console.log("[Alibaba-AdBlock] Clearing feed: bodyList type=" + bodyItem.type + ", removed " + originalLen + " items (resultList)");
        bodyItem.fields.resultList = [];
        totalCleared += originalLen;
      }
    }
    if (isEnabled("removeFeedKeywords") && bodyItem?.fields?.floorMappingList && Array.isArray(bodyItem.fields.floorMappingList)) {
      for (const floor of bodyItem.fields.floorMappingList) {
        if (floor?.siteMappingList && Array.isArray(floor.siteMappingList)) {
          for (const site of floor.siteMappingList) {
            if (site?.siteData?.pointList && Array.isArray(site.siteData.pointList)) {
              const originalLen = site.siteData.pointList.length;
              if (originalLen > 0) {
                site.siteData.pointList = [];
                totalCleared += originalLen;
              }
            }

          }
        }
      }
    }
    if (isEnabled("removeFeedKeywords") && bodyItem?.fields?.homeSlotConverge) {
      bodyItem.fields.homeSlotConverge = {};
      totalCleared++;
    }
  }
  // 私域动态横幅 (独立于 feed 开关)
  if (wantBannerClear) {
    const stats = { cleared: 0 };
    clearMetaxBannerList(data, stats);
    if (stats.cleared > 0) {
      console.log("[Alibaba-AdBlock] Cleared metax bannerList (私域动态横幅): " + stats.cleared + " items");
      totalCleared += stats.cleared;
    }
  }
  if (totalCleared > 0) {
    console.log("[Alibaba-AdBlock] Cleared entire metax feed: " + totalCleared + " items/sections");
    return JSON.stringify(data);
  }
  return body;
}

function filterMetaxHomepage(body, config) {
  if (!isEnabled("removeSmallCards") && !isEnabled("removeFeedKeywords")) return body;
  let newBody = filterMetaxHotwords(body, config);
  newBody = filterMetaxFeed(newBody, config);
  return newBody;
}

// ============================================
// 私域动态/关注会员过滤 (Moon)
// ============================================
function filterPrivateDomain(body, config) {
  if (!isEnabled("removePrivateDomain")) return body;
  const data = safeParse(body);
  if (!data?.data) return body;
  let modified = false;
  if (data.followMembers?.resultList && Array.isArray(data.followMembers.resultList) && data.followMembers.resultList.length > 0) {
    console.log("[Alibaba-AdBlock] Clearing private domain followMembers (" + data.followMembers.resultList.length + " items)");
    data.followMembers.resultList = [];
    data.followMembers.totalCount = "0";
    modified = true;
  }
  if (modified) return JSON.stringify(data);
  return body;
}

// ============================================
// 跨马灯过滤 (Moon)
// ============================================
function filterMarquee(body) {
  if (!isEnabled("removeSmallCards")) return body;
  const data = safeParse(body);
  if (!data?.data?.result || !Array.isArray(data.data.result)) return body;
  if (data.data.result.length > 0) {
    console.log("[Alibaba-AdBlock] Clearing marquee result (" + data.data.result.length + " items)");
    data.data.result = [];
    return JSON.stringify(data);
  }
  return body;
}

// ============================================
// === 新增：淘宝开屏广告处理 (kelee.one Taobao_remove_ads.js 移植) ===
// ============================================

// 淘宝-开屏视频广告: guide-acs.m.taobao.com/gw/mtop.taobao.cloudvideo.video.query
function filterTaobaoSplashVideo(body) {
  if (!isEnabled("removeSplashAd")) return body;
  const data = safeParse(body);
  if (!data) return body;
  let modified = false;
  if (data.data?.duration) {
    data.data.duration = "0";
    modified = true;
  }
  if (data.data?.resources && Array.isArray(data.data.resources) && data.data.resources.length > 0) {
    data.data.resources = [];
    modified = true;
  }
  if (data.data?.caches && Array.isArray(data.data.caches) && data.data.caches.length > 0) {
    data.data.caches = [];
    modified = true;
  }
  if (data.data?.respTimeInMs) {
    data.data.respTimeInMs = "3818332800000";
    modified = true;
  }
  if (modified) {
    console.log("[Alibaba-AdBlock] Filtered Taobao splash video");
    return JSON.stringify(data);
  }
  return body;
}

// 淘宝-开屏图片广告: guide-acs.m.taobao.com/gw/mtop.taobao.wireless.home.splash.awesome.get
function filterTaobaoSplashImage(body) {
  if (!isEnabled("removeSplashAd")) return body;
  const data = safeParse(body);
  if (!data) return body;
  let modified = false;
  if (data.data?.containers?.splash_home_base) {
    const splash = data.data.containers.splash_home_base;
    if (splash?.base?.sections && Array.isArray(splash.base.sections)) {
      for (const items of splash.base.sections) {
        if (items?.bizData?.["taobao-splash"]?.data && Array.isArray(items.bizData["taobao-splash"].data)) {
          for (const item of items.bizData["taobao-splash"].data) {
            item.waitTime = "0";
            item.times = "0";
            item.hotStart = "false";
            item.haveVoice = "false";
            item.hideTBLogo = "false";
            item.enable4G = "false";
            item.coldStart = "false";
            item.startTime = "3818332800000";
            item.endTime = "3818419199000";
            item.gmtStart = "2090-12-31 00:00:00";
            item.gmtEnd = "2090-12-31 23:59:59";
            item.gmtStartMs = "3818332800000";
            item.gmtEndMs = "3818419199000";
            if (item.imgUrl) item.imgUrl = "";
            if (item.videoUrl) item.videoUrl = "";
            modified = true;
          }
        }
      }
    }
  }
  if (modified) {
    console.log("[Alibaba-AdBlock] Filtered Taobao splash image");
    return JSON.stringify(data);
  }
  return body;
}

// 淘宝-开屏活动: poplayer.template.alibaba.com/*.json
function filterTaobaoSplashActivity(body) {
  if (!isEnabled("removeSplashAd")) return body;
  const data = safeParse(body);
  if (!data) return body;
  let modified = false;
  if (data.res?.images && Array.isArray(data.res.images) && data.res.images.length > 0) {
    data.res.images = [];
    modified = true;
  }
  if (data.res?.videos && Array.isArray(data.res.videos) && data.res.videos.length > 0) {
    data.res.videos = [];
    modified = true;
  }
  if (data.enable) {
    data.enable = false;
    modified = true;
  }
  if (data.mainRes?.images && Array.isArray(data.mainRes.images) && data.mainRes.images.length > 0) {
    data.mainRes.images = [];
    modified = true;
  }
  if (modified) {
    console.log("[Alibaba-AdBlock] Filtered Taobao splash activity");
    return JSON.stringify(data);
  }
  return body;
}

// 淘宝-双11氛围皮肤: acs.m.taobao.com/gw/mtop.wireless.skin.atmosphere.info
// enable=true 时下发促销主题皮肤 (tabbar背景/我的页皮肤/首页背景/开屏氛围)
function filterTaobaoAtmosphere(body) {
  if (!isEnabled("removePopWindow")) return body;
  const data = safeParse(body);
  if (!data) return body;
  let modified = false;
  if (data.data) {
    if (data.data.enable) {
      data.data.enable = false;
      modified = true;
    }
    if (data.data.content) {
      delete data.data.content;
      modified = true;
    }
    if (data.data.version) {
      data.data.version = "0";
      modified = true;
    }
  }
  if (modified) {
    console.log("[Alibaba-AdBlock] Disabled Taobao atmosphere skin (双11氛围)");
    return JSON.stringify(data);
  }
  return body;
}

// ============================================
// === 新增：淘宝弹窗/运营位处理 (kelee.one Reject 列表 -> Body Rewrite 兜底) ===
// ============================================

// 通用：清空 data 字段 (用于广告获取类接口)
// 与 kelee 的 reject_dict(200) 语义完全等价: 整个响应替换为 {}
// (注意: 不是把 data 置空 —— mtop 响应里 data={} 与 整体 {} 对 App 解析路径不同)
function filterClearData(body) {
  const data = safeParse(body);
  if (!data) return body;
  if (data.data && (Array.isArray(data.data) || typeof data.data === "object")) {
    console.log("[Alibaba-AdBlock] Cleared ad response (whole body -> {})");
    return "{}";
  }
  return body;
}

// ============================================
// === 新增：闲鱼开屏/弹窗处理 (kelee.one FleaMarket_remove_ads.lpx 移植) ===
// ============================================

// 闲鱼-开屏广告: acs.m.goofish.com/gw/mtop.taobao.idlecommerce.splash.ads
function filterXianyuSplashAds(body) {
  if (!isEnabled("fishRemoveSplash")) return body;
  const data = safeParse(body);
  if (!data) return body;
  // 与 kelee reject_dict(200) 语义一致: 整个响应替换为 {}
  if (data.data) {
    console.log("[Alibaba-AdBlock] Cleared Xianyu splash ads (-> {})");
    return "{}";
  }
  return body;
}

// 闲鱼-首页刷新: idlehome.home.nextfresh - 保留 kingkongDo，去除 homeMultiBanner/mamaAD
function filterXianyuHomeNextFresh(body) {
  if (!isEnabled("fishRemoveHomeAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  let modified = false;
  if (data.data?.homeTopList && Array.isArray(data.data.homeTopList)) {
    const filtered = data.data.homeTopList.filter(item => item?.sectionType === "kingkongDo");
    if (filtered.length !== data.data.homeTopList.length) {
      data.data.homeTopList = filtered;
      modified = true;
    }
  }
  if (data.data?.sections && Array.isArray(data.data.sections)) {
    const filtered = data.data.sections.filter(item => {
      const ct = item?.data?.clickParam?.args?.cardType;
      return ct !== "homeMultiBanner" && ct !== "mamaAD";
    });
    if (filtered.length !== data.data.sections.length) {
      data.data.sections = filtered;
      modified = true;
    }
    // 保留特定 template.name
    const filtered2 = data.data.sections.filter(item => {
      const tn = item?.template?.name;
      return tn === "idlefish_home_new_commodity_card" || (typeof tn === "string" && tn.includes("fish_home_tags_item_card"));
    });
    if (filtered2.length !== data.data.sections.length) {
      data.data.sections = filtered2;
      modified = true;
    }
  }
  if (modified) {
    console.log("[Alibaba-AdBlock] Filtered Xianyu home nextfresh");
    return JSON.stringify(data);
  }
  return body;
}

// 闲鱼-Widget刷新: idlehome.widget.refresh.get - 保留 kingkongDo
function filterXianyuWidgetRefresh(body) {
  if (!isEnabled("fishRemoveHomeAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  if (data.data?.homeTopList && Array.isArray(data.data.homeTopList)) {
    const filtered = data.data.homeTopList.filter(item => item?.sectionType === "kingkongDo");
    if (filtered.length !== data.data.homeTopList.length) {
      data.data.homeTopList = filtered;
      console.log("[Alibaba-AdBlock] Filtered Xianyu widget refresh");
      return JSON.stringify(data);
    }
  }
  return body;
}

// 闲鱼-鲸鱼模块: idle.home.whale.modulet - 保留 fish_home_miniapp
function filterXianyuWhaleModulet(body) {
  if (!isEnabled("fishRemoveHomeAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  if (data.data?.container?.sections && Array.isArray(data.data.container.sections)) {
    const filtered = data.data.container.sections.filter(item => item?.template?.name === "fish_home_miniapp");
    if (filtered.length !== data.data.container.sections.length) {
      data.data.container.sections = filtered;
      console.log("[Alibaba-AdBlock] Filtered Xianyu whale modulet");
      return JSON.stringify(data);
    }
  }
  return body;
}

// 闲鱼-社区: idlehome.home.community - 保留特定 template
function filterXianyuCommunity(body) {
  if (!isEnabled("fishRemoveHomeAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  if (data.data?.feedsList && Array.isArray(data.data.feedsList)) {
    const filtered = data.data.feedsList.filter(item => {
      const tn = item?.template?.name;
      return tn === "idlefish_home_new_commodity_card" || tn === "idlefish_home_new_content_card";
    });
    if (filtered.length !== data.data.feedsList.length) {
      data.data.feedsList = filtered;
      console.log("[Alibaba-AdBlock] Filtered Xianyu community");
      return JSON.stringify(data);
    }
  }
  return body;
}

// 闲鱼-新商品页: idlehome.home.newitem.page - 去除 banner/mamaAD
function filterXianyuNewItemPage(body) {
  if (!isEnabled("fishRemoveHomeAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  if (data.data?.sections && Array.isArray(data.data.sections)) {
    const filtered = data.data.sections.filter(item => {
      const ct = item?.data?.clickParam?.args?.cardType;
      return ct !== "banner" && ct !== "mamaAD";
    });
    if (filtered.length !== data.data.sections.length) {
      data.data.sections = filtered;
      console.log("[Alibaba-AdBlock] Filtered Xianyu new item page");
      return JSON.stringify(data);
    }
  }
  return body;
}

// 闲鱼-本地流量平台: idle.local.flow.plat.section - 保留 fish_city_kingkong
function filterXianyuLocalFlow(body) {
  if (!isEnabled("fishRemoveHomeAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  if (data.data?.data?.components && Array.isArray(data.data.data.components)) {
    const filtered = data.data.data.components.filter(item => {
      const tmpl = item?.data?.template;
      return tmpl && typeof tmpl === "object" && tmpl.name && typeof tmpl.name === "string" && tmpl.name.includes("fish_city_kingkong");
    });
    if (filtered.length !== data.data.data.components.length) {
      data.data.data.components = filtered;
      console.log("[Alibaba-AdBlock] Filtered Xianyu local flow");
      return JSON.stringify(data);
    }
  }
  return body;
}

// 闲鱼-本地首页顶部: idle.local.home.top - 保留 fish_home_second_stage_top_cardV3
function filterXianyuLocalHomeTop(body) {
  if (!isEnabled("fishRemoveHomeAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  if (data.data?.data?.components && Array.isArray(data.data.data.components)) {
    const filtered = data.data.data.components.filter(item => item?.key === "fish_home_second_stage_top_cardV3");
    if (filtered.length !== data.data.data.components.length) {
      data.data.data.components = filtered;
      console.log("[Alibaba-AdBlock] Filtered Xianyu local home top");
      return JSON.stringify(data);
    }
  }
  return body;
}

// 闲鱼-本地首页: idle.local.home - 去除 ads，保留 common
function filterXianyuLocalHome(body) {
  if (!isEnabled("fishRemoveHomeAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  if (data.data?.sections && Array.isArray(data.data.sections)) {
    const filtered = data.data.sections.filter(item => {
      const cardEnum = item?.template?.cardEnum || "";
      const cardType = item?.cardType;
      return cardEnum !== "ads" && cardType === "common";
    });
    if (filtered.length !== data.data.sections.length) {
      data.data.sections = filtered;
      console.log("[Alibaba-AdBlock] Filtered Xianyu local home");
      return JSON.stringify(data);
    }
  }
  return body;
}

// 闲鱼-我的页面: idle.user.page.my.adapter - 复杂过滤
function filterXianyuMyPage(body) {
  if (!isEnabled("fishRemoveMyPage")) return body;
  const data = safeParse(body);
  if (!data) return body;
  let modified = false;
  if (data.data?.container?.sections && Array.isArray(data.data.container.sections)) {
    // 保留 my_fy*_header/user_info/trade/appraise/tools
    let sections = data.data.container.sections.filter(item => {
      const tn = item?.template?.name || "";
      return /^my_fy\d+_(header|user_info|trade|appraise|tools)$/.test(tn);
    });
    // 移除 level.exContent.tips
    for (const s of sections) {
      if (s?.item?.level?.exContent?.tips) {
        delete s.item.level;
        modified = true;
      }
    }
    // entry2025 特殊处理
    for (const s of sections) {
      if (s?.sectionBizCode === "entry2025" && s?.item?.tool?.exContent?.tools) {
        const order = [5,39,6,30,29,2,32,3,1];
        const tools = s.item.tool.exContent.tools;
        // 复杂排序逻辑简化：保留指定 id
        const filteredTools = [];
        for (const group of tools) {
          for (const tool of group) {
            if (tool?.exContent?.id && order.includes(tool.exContent.id)) {
              filteredTools.push(tool);
            }
          }
        }
        if (filteredTools.length > 0) {
          s.item.tool.exContent.tools = [filteredTools];
          modified = true;
        }
      }
    }
    if (sections.length !== data.data.container.sections.length) {
      data.data.container.sections = sections;
      modified = true;
    }
  }
  if (data.data?.ability) {
    delete data.data.ability;
    modified = true;
  }
  if (modified) {
    console.log("[Alibaba-AdBlock] Filtered Xianyu my page");
    return JSON.stringify(data);
  }
  return body;
}

// 闲鱼-圈子列表: idlehome.home.circle.list
function filterXianyuCircleList(body) {
  if (!isEnabled("fishRemoveHomeAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  let modified = false;
  if (data.data?.circleList && Array.isArray(data.data.circleList)) {
    for (const c of data.data.circleList) {
      if (c?.showInfo) {
        delete c.showInfo.titleImage;
        delete c.showInfo.atmosphereImageUrl;
        modified = true;
      }
    }
  }
  if (data.data?.next?.headList && Array.isArray(data.data.next.headList)) {
    const filtered = data.data.next.headList.filter(item => 
      item?.bizCode === "main" || item?.bizCode === "market" || item?.bizCode === "IDLE_CIRCLE"
    );
    if (filtered.length !== data.data.next.headList.length) {
      data.data.next.headList = filtered;
      modified = true;
    }
    for (const h of data.data.next.headList) {
      if (h?.showInfo?.rightTagImage) {
        delete h.showInfo.rightTagImage;
        modified = true;
      }
    }
  }
  if (modified) {
    console.log("[Alibaba-AdBlock] Filtered Xianyu circle list");
    return JSON.stringify(data);
  }
  return body;
}

// 闲鱼-魔法首页: idlehome.magic.home.page.list - 删除 topList
function filterXianyuMagicHome(body) {
  if (!isEnabled("fishRemoveHomeAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  if (data.data?.topList) {
    delete data.data.topList;
    console.log("[Alibaba-AdBlock] Filtered Xianyu magic home");
    return JSON.stringify(data);
  }
  return body;
}

// 闲鱼-搜索去广告 (g-acs): idlemtopsearch.search - 删除广告 resultList
function filterXianyuSearchAds(body) {
  if (!isEnabled("fishRemoveSearchAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  let modified = false;
  if (data.data?.resultList && Array.isArray(data.data.resultList)) {
    const filtered = data.data.resultList.filter(item => {
      const bt = item?.data?.item?.main?.exContent?.dislikeFeedback?.clickParam?.args?.bizType;
      return bt !== "ad";
    });
    if (filtered.length !== data.data.resultList.length) {
      data.data.resultList = filtered;
      modified = true;
    }
  }
  if (data.data?.resultPrefixBar) {
    delete data.data.resultPrefixBar;
    modified = true;
  }
  if (modified) {
    console.log("[Alibaba-AdBlock] Filtered Xianyu search ads");
    return JSON.stringify(data);
  }
  return body;
}

// 闲鱼-搜索发现: idlemtopsearch.search.discover - 去除 MarketHotSpot
function filterXianyuSearchDiscover(body) {
  if (!isEnabled("fishRemoveSearchAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  if (data.data?.resultList && Array.isArray(data.data.resultList)) {
    const filtered = data.data.resultList.filter(item => item?.type !== "MarketHotSpot");
    if (filtered.length !== data.data.resultList.length) {
      data.data.resultList = filtered;
      console.log("[Alibaba-AdBlock] Filtered Xianyu search discover");
      return JSON.stringify(data);
    }
  }
  return body;
}

// 闲鱼-搜索激活: idlemtopsearch.item.search.activate - 删除 hotwords
function filterXianyuSearchActivate(body) {
  if (!isEnabled("fishRemoveSearchAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  if (data.data?.cardList && Array.isArray(data.data.cardList)) {
    let modified = false;
    for (const card of data.data.cardList) {
      // hotwords = 热搜词 (直接清空, 已验证不影响联想)
      if (Array.isArray(card?.cardData?.hotwords) && card.cardData.hotwords.length) {
        card.cardData.hotwords = []; modified = true;
      }
      // ★ keywords = "猜你可能在找"板块词表
      //   不能清空数组! 实测 keywords=[] 会让 App 判定"激活页无内容" ->
      //   不再发起联想请求 (search.suggest) -> 搜索联想功能失效
      //   解法: 保持数组长度 (App 认为有内容 → 正常初始化), 仅置空每项 text (不显示)
      const kws = card?.cardData?.keywords;
      if (Array.isArray(kws) && kws.length) {
        let changed = false;
        for (const it of kws) {
          if (!it || typeof it !== "object") continue;
          if (it.text) { it.text = ""; changed = true; }
          // ★ 不能清 link: 实测 v3.23.0 清空 link 导致搜索联想失效 (App 初始化依赖跳转目标)
        }
        // ★ 不能清空数组: App 用 activate 是否有内容来判定"是否发起联想请求"
        //   (searchReqFromActivatePagePart) → keywords=[] 时联想请求不发出
        //   折中: 只保留 1 项 (占位最小) 且文本为空 → 联想正常 + 板块近乎不可见
        if (kws.length > 1) {
          card.cardData.keywords = [kws[0]];
          changed = true;
        }
        // 填入无害占位词 (清空广告后不留空位)
        for (const it of card.cardData.keywords) {
          if (it && typeof it === "object" && it.text !== FISH_GUESS_PLACEHOLDER) {
            it.text = FISH_GUESS_PLACEHOLDER;
            changed = true;
          }
        }
        if (changed) modified = true;
      }
      // 清板块标题 ("大家都在搜")
      if (card?.cardData?.title) { card.cardData.title = ""; modified = true; }
    }
    if (modified) {
      console.log("[Alibaba-AdBlock] Filtered Xianyu search activate hotwords");
      return JSON.stringify(data);
    }
  }
  return body;
}

// 闲鱼-交易详情: idle.trade.full.info - 保留核心 render 类型
function filterXianyuTradeInfo(body) {
  if (!isEnabled("fishRemoveMyPage")) return body;
  const data = safeParse(body);
  if (!data) return body;
  if (data.data?.components && Array.isArray(data.data.components)) {
    const filtered = data.data.components.filter(item => 
      item?.render === "orderStatusVO" || item?.render === "addressInfoVO" || item?.render === "orderInfoVO"
    );
    if (filtered.length !== data.data.components.length) {
      data.data.components = filtered;
      console.log("[Alibaba-AdBlock] Filtered Xianyu trade info");
      return JSON.stringify(data);
    }
  }
  return body;
}

// 闲鱼-用户策略列表/商品推荐/附近角落/购买Feed/搜索遮罩/玩家推荐 - 通用清空 data
function filterXianyuClearData(body) {
  return filterClearData(body);
}

// ============================================
// Moon App 配置
// ============================================
const MOON_SITE_CODES = {
  splash: new Set(["open_screen_site"]),
  popup: new Set(["pop_window_site"]),
  smallCards: new Set([
    "small_handler_home_site",
    "small_handler_share_site",
    "small_handler_h5_1_site",
    "small_handler_h5_2_site",
    "small_handler_h5_3_site",
    "bulletin_board_mid_site",
    "bulletin_board_report_site",
    "bulletin_board_mine_site",
    "searchDomeWord_site"
  ])
};

const MOON_NOAH_CONFIG = {
  blockResKeys: [
    // 一淘首页悬浮任务窗 (膨胀红包"点击3个商品")
    "etao_home_task_freemove",
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
  allowResKeys: [
    "moon_main_handle",
    "moon_share_handle",
    "moon_withdrawal_top_section",
    "moon_withdrawal_bottom_section",
    "moon_withdrawal_error_section"
  ]
};

const MOON_METAX_CONFIG = {
  hotwordsType: "42701_96",
  clearFeedTypes: ["58536_33"]
};

// ============================================
// Moon App 处理入口
// ============================================
function handleMoonResponse(body, url) {
  if (url.includes("mtop.alimama.union.skyleap.distribution.batchsite")) {
    return filterBatchsite(body, { splash: new Set(["open_screen_site"]), popup: new Set(["pop_window_site"]), smallCards: new Set(["small_handler_home_site","small_handler_share_site","small_handler_h5_1_site","small_handler_h5_2_site","small_handler_h5_3_site","bulletin_board_mid_site","bulletin_board_report_site","bulletin_board_mine_site","searchDomeWord_site"]) });
  }
  if (url.includes("mtop.etao.noah.query")) {
    return filterNoahQuery(body, {
      blockResKeys: ["etao_home_task_freemove","moon_search_activation_dx_banner","moon_share_dx_market_material","moon_dx_bulletin_board_discovery","moon_dx_bulletin_board_report","moon_dx_bulletin_board_mine","moon_dx_bulletin_board_goods","moon_h5_handle_one","moon_h5_handle_two","moon_h5_handle_three","newcomer_walfare_popup","high_level_taoke_timer_notice"],
      allowResKeys: ["moon_main_handle","moon_share_handle","moon_withdrawal_top_section","moon_withdrawal_bottom_section","moon_withdrawal_error_section"]
    });
  }
  if (url.includes("mtop.alimama.moon.provider.tac.service")) {
    if (!isEnabled("removeTAC")) return body;
    if (url.includes("tac.service.call") && !url.includes("smart.call")) {
      return filterTACServiceCall(body);
    }
    if (url.includes("tac.service.smart.call")) {
      return filterTACServiceSmartCall(body);
    }
    return body;
  }
  if (url.includes("mtop.taobao.union.marquee.query")) {
    if (!isEnabled("removeSmallCards")) return body;
    const data = safeParse(body);
    if (!data?.data?.result || !Array.isArray(data.data.result)) return body;
    if (data.data.result.length > 0) {
      console.log("[Alibaba-AdBlock] Clearing marquee result (" + data.data.result.length + " items)");
      data.data.result = [];
      return JSON.stringify(data);
    }
    return body;
  }
  if (url.includes("mtop.alimama.moon.provider.metax.homepage.query")) {
    let newBody = body;
    newBody = filterMetaxHotwords(newBody, { hotwordsType: "42701_96", clearFeedTypes: ["58536_33"] });
    newBody = filterMetaxFeed(newBody, { clearFeedTypes: ["58536_33"] });
    return newBody;
  }
  if (url.includes("mtop.alimama.union.pub.entry")) {
    if (!isEnabled("removePrivateDomain")) return body;
    const data = safeParse(body);
    if (!data?.data) return body;
    let modified = false;
    if (data.followMembers?.resultList && Array.isArray(data.followMembers.resultList) && data.followMembers.resultList.length > 0) {
      console.log("[Alibaba-AdBlock] Clearing private domain followMembers (" + data.followMembers.resultList.length + " items)");
      data.followMembers.resultList = [];
      data.followMembers.totalCount = "0";
      modified = true;
    }
    if (modified) return JSON.stringify(data);
    return body;
  }
  return null;
}


// ============================================
// 搜索框轮播词拦截: 替换搜索栏容器模板为补丁版 (v3.9.0)
// v3.9.9: 恢复 v2 补丁 (test-v392-393 对照实验验证可用; v3.9.4/5 的点击失效真凶是 search_door 泛化规则误伤 searchBoxUrl)
// 失败模式安全: 若二进制替换不被 Loon 支持, 脚本异常 -> 原始响应照常通过 (轮播词恢复但不破坏搜索栏)
// ============================================

function handleTaobaoResponse(body, url) {
  // 开屏广告
  if (url.includes("guide-acs.m.taobao.com/gw/mtop.taobao.cloudvideo.video.query")) {
    return filterTaobaoSplashVideo(body);
  }
  if (url.includes("guide-acs.m.taobao.com/gw/mtop.taobao.wireless.home.splash.awesome.get")) {
    return filterTaobaoSplashImage(body);
  }
  if (url.includes("poplayer.template.alibaba.com/")) {
    return filterTaobaoSplashActivity(body);
  }
  // 新面孔开屏 (含 newget)
  if (url.includes("guide-acs.m.taobao.com/gw/mtop.taobao.wireless.home.newface.awesome")) {
    return isEnabled("removePopWindow") ? filterClearData(body) : body;
  }
  // 双11氛围皮肤 (开屏氛围/tabbar皮肤/我的页皮肤)
  if (url.includes("mtop.wireless.skin.atmosphere.info")) {
    return filterTaobaoAtmosphere(body);
  }
  // TAC 搜索 (反编译发现)
  if (url.includes("mtop.taobao.aihome.tac.execute") || url.includes("mtop.tmall.tac.gateway.execute")) {
    if (!isEnabled("removeTAC")) return body;
    return filterTACServiceCall(body);
  }
  // 弹窗/运营位 (清空 data 兜底)
  if (url.includes("mtop.alibaba.advertisementservice.getadv")) {
    return isEnabled("removePopWindow") ? filterClearData(body) : body;
  }
  if (url.includes("mtop.alimama.etao.config.query")) {
    return isEnabled("removePopWindow") ? filterClearData(body) : body;
  }
  if (url.includes("mtop.alimusic.common.mobileservice.startinit")) {
    return isEnabled("removePopWindow") ? filterClearData(body) : body;
  }
  if (url.includes("mtop.etao.noah.query")) {
    // NOAH 开屏运营位，复用 NOAH 过滤 + 额外清空
    const r1 = filterNoahQuery(body, {
      blockResKeys: ["moon_search_activation_dx_banner","moon_share_dx_market_material","moon_dx_bulletin_board_discovery","moon_dx_bulletin_board_report","moon_dx_bulletin_board_mine","moon_dx_bulletin_board_goods","moon_h5_handle_one","moon_h5_handle_two","moon_h5_handle_three","newcomer_walfare_popup","high_level_taoke_timer_notice"],
      allowResKeys: ["moon_main_handle","moon_share_handle","moon_withdrawal_top_section","moon_withdrawal_bottom_section","moon_withdrawal_error_section"]
    });
    if (r1 !== body) return r1;
    return isEnabled("removePopWindow") ? filterClearData(body) : body;
  }
  if (url.includes("mtop.film.mtopadvertiseapi.queryadvertise")) {
    return isEnabled("removePopWindow") ? filterClearData(body) : body;
  }
  if (url.includes("mtop.o2o.ad.gateway.get")) {
    return isEnabled("removePopWindow") ? filterClearData(body) : body;
  }
  if (url.includes("mtop.taobao.idle.home.welcome")) {
    return isEnabled("removePopWindow") ? filterClearData(body) : body;
  }
  if (url.includes("mtop.trip.activity.querytmsresources")) {
    return isEnabled("removePopWindow") ? filterClearData(body) : body;
  }
  if (url.includes("guide-acs.m.taobao.com/gw/mtop.taobao.volvo.secondfloor.getconfig")) {
    return isEnabled("removePopWindow") ? filterClearData(body) : body;
  }
  return null;
}

// ============================================
// Xianyu App 处理入口 (kelee.one 移植 + 反编译)
// ============================================
// 闲鱼-关注 Feed 流: 只保留 cardType==2001 (kelee 原规则)
function filterXianyuFollowFeed(body) {
  if (!isEnabled("fishRemoveHomeAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  if (data.data?.sections && Array.isArray(data.data.sections)) {
    const filtered = data.data.sections.filter(item => item?.cardType === 2001);
    if (filtered.length !== data.data.sections.length) {
      data.data.sections = filtered;
      console.log("[Alibaba-AdBlock] Filtered Xianyu follow feed");
      return JSON.stringify(data);
    }
  }
  return body;
}


// 闲鱼搜索框滚动词/热搜/猜你可能在找 — 精准清除词条, 保留搜索框其余配置
// 实测 search.shade 结构: data.singleShadeWords[{showText,trackParams}] / multiWordsForMarquee / multiWordsExpectedCount / bucketId / trackParams
function filterXianyuSearchWords(body) {
  if (!isEnabled("fishRemoveSearchAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  const d = data.data;
  if (!d || typeof d !== "object") return body;
  let modified = false;
  // ★ 只清【广告/投放】类词表; 不含 suggestList/searchSuggest/suggestWords (搜索联想是功能)
  const WORDS_KEYS = ["singleShadeWords", "multiWords", "multiWordsList", "hotRankList", "hotList",
    "guessWords", "guessList", "hotWords", "mayInterestWords", "relatedWords",
    "recommendWords", "wordList", "shadeWords", "searchWords"];
  for (const k of WORDS_KEYS) {
    if (Array.isArray(d[k]) && d[k].length) { d[k] = []; modified = true; }
  }
  if (d.multiWordsForMarquee) { d.multiWordsForMarquee = false; modified = true; }
  if (d.multiWordsExpectedCount) { d.multiWordsExpectedCount = 0; modified = true; }
  if (d.bucketId) { d.bucketId = ""; modified = true; }
  if (d.trackParams) { d.trackParams = {}; modified = true; }
  // 双层: data.result 里的词表
  if (d.result && typeof d.result === "object") {
    for (const k of WORDS_KEYS) {
      if (Array.isArray(d.result[k]) && d.result[k].length) { d.result[k] = []; modified = true; }
    }
  }
  // 递归清理任意深度的嵌套词表
  // 实测: item.search.activate -> data.cardList[].cardData.hotwords[] (闲鱼热搜词, 嵌套两层)
  const deepClear = (node, depth) => {
    if (depth > 6 || !node || typeof node !== "object") return false;
    let hit = false;
    if (Array.isArray(node)) {
      for (const it of node) { if (deepClear(it, depth + 1)) hit = true; }
      return hit;
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      const kl = k.toLowerCase();
      // ★ 不清 suggestword/searchsuggest/suggestlist/keywords (打字联想是功能, 必须保留)
      if (Array.isArray(v) && v.length && (kl.includes("hotword") || kl.includes("shadeword")
          || kl.includes("guessword") || kl.includes("marquee")
          || kl.includes("searchword") || kl.includes("wordlist"))) {
        node[k] = []; hit = true;
      } else if (deepClear(v, depth + 1)) { hit = true; }
    }
    return hit;
  };
  if (deepClear(d, 0)) modified = true;
  if (modified) {
    console.log("[Alibaba-AdBlock] Cleared Xianyu search words/hot list");
    return JSON.stringify(data);
  }
  return body;
}


// 闲鱼搜索域精细处理 (按接口分派)
// 实测结构:
//  search.suggest (可能在找): data.picTextEntryInfoVOList[{label,redirect,preTitleIcon}] = 图文广告位
//                            data.dynamicList[{data:{suggest,trackParams:{tpp_bucket_id}}}] = 动态投放
//                            data.items[{suggest,rn}] = 搜索联想 (功能, 保留)
//  search.activate.tablist (热搜榜顶栏): data.tabList[{apiName, rankStyleType:HOT_RANK}]
//  search.activate.industrylist (行业词): data.resultList / data.list
//  search.shade (搜索框展示): data.singleShadeWords + multiWordsForMarquee
//  search.discover / item.search.activate: 已由通用词清理处理
function filterXianyuSearchDomain(body, url) {
  if (!isEnabled("fishRemoveSearchAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  const d = data.data;
  if (!d || typeof d !== "object") return body;
  let modified = false;

  if (url.includes("search.suggest")) {
    // 可能在找: 图文广告位 (picTextEntryInfoVOList) + dynamicList 中的非 item 型投放项
    // ★ dynamicList 里的 type='item' 是【搜索联想词】(功能) 必须保留!
    //   实测: 21 项 = 20×item(联想词) + 1×picText(广告图文位)
    if (Array.isArray(d.picTextEntryInfoVOList) && d.picTextEntryInfoVOList.length) {
      d.picTextEntryInfoVOList = []; modified = true;
    }
    if (Array.isArray(d.dynamicList) && d.dynamicList.length) {
      // ★ type='item' 是搜索联想词(功能) 必须保留; 只删广告型 (picText/user/aiSeek)
      const keep = d.dynamicList.filter(it => it && it.type === "item");
      if (keep.length !== d.dynamicList.length) {
        d.dynamicList = keep; modified = true;
      }
    }
    if (Array.isArray(d.users) && d.users.length) { d.users = []; modified = true; }
    if (d.bucketId) { d.bucketId = ""; modified = true; }
    if (d.trackParams) { d.trackParams = {}; modified = true; }
  }
  if (url.includes("search.activate.tablist")) {
    // 热搜榜顶栏 Tab
    if (Array.isArray(d.tabList) && d.tabList.length) { d.tabList = []; modified = true; }
  }
  if (url.includes("search.activate.industrylist")) {
    // 行业词/分类词位
    for (const k of ["resultList", "list", "industryList", "items"]) {
      if (Array.isArray(d[k]) && d[k].length) { d[k] = []; modified = true; }
    }
  }
  if (url.includes("search.shade")) {
    if (Array.isArray(d.singleShadeWords) && d.singleShadeWords.length) { d.singleShadeWords = []; modified = true; }
    if (d.multiWordsForMarquee) { d.multiWordsForMarquee = false; modified = true; }
    if (d.multiWordsExpectedCount) { d.multiWordsExpectedCount = 0; modified = true; }
    if (d.bucketId) { d.bucketId = ""; modified = true; }
    if (d.trackParams) { d.trackParams = {}; modified = true; }
  }
  if (modified) {
    console.log("[Alibaba-AdBlock] Cleared Xianyu search domain: " + (url.split("/gw/")[1] || "").split("/")[0]);
    return JSON.stringify(data);
  }
  return body;
}

// 直播首页视频流广告: livexshow.homepage.{videolist,tabmenu}
//   广告项特征: dataList[N].data.data.liveList[0].ad (含 adType/pCode/TANX 投放标记, 最深层嵌套)
//   正常项 isAd="0" 且无 ad 对象
function filterLiveHomeFeed(body) {
  if (!isEnabled("liveRemoveAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  let removed = 0;
  const isAdItem = (it) => {
    if (!it || typeof it !== "object") return false;
    // 形态A (homepage videolist/tabmenu): dataList[N].data.data.liveList[0].ad
    const ll = it.data && it.data.data && it.data.data.liveList;
    if (Array.isArray(ll) && ll.some(x => x && typeof x === "object" && x.ad)) return true;
    if (String(it.data && it.data.data && it.data.data.isAd) === "1") return true;
    // 形态B (recommend slide): model[N].ad
    if (it.ad && typeof it.ad === "object") return true;
    return false;
  };
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== "object") return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if ((k === "dataList" || k === "model") && Array.isArray(v)) {
        const keep = v.filter(x => !isAdItem(x));
        if (keep.length !== v.length) {
          removed += v.length - keep.length;
          o[k] = keep;
        }
        keep.forEach(walk);
        continue;
      }
      // 直播权益广告 (对象非数组): videoListDatas.liveBenefitAdInfo.pushData.ad
      if (k === "liveBenefitAdInfo" && v && typeof v === "object") {
        if (v.pushData && v.pushData.ad) { o[k] = {}; removed++; continue; }
      }
      walk(v);
    }
  };
  walk(data);
  if (removed > 0) {
    console.log("[Alibaba-AdBlock] Removed live home feed ads: " + removed);
    return JSON.stringify(data);
  }
  return body;
}

// 直播信息流广告过滤: feeds.market.query 的 dataList 中 doudiType=AdFeed / type=DOUDI_RECOMMEND 的项
function filterLiveMarketFeed(body) {
  if (!isEnabled("liveRemoveAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  const d = data.data;
  if (!d || !Array.isArray(d.dataList)) return body;
  let modified = false;
  const keep = d.dataList.filter(it => {
    const s = JSON.stringify(it);
    const isAd = s.indexOf('"doudiType":"AdFeed"') >= 0 || s.indexOf('"type":"DOUDI_RECOMMEND"') >= 0;
    if (isAd) modified = true;
    return !isAd;
  });
  if (modified) {
    d.dataList = keep;
    console.log("[Alibaba-AdBlock] Filtered live market feed ads: " + keep.length + " left");
    return JSON.stringify(data);
  }
  return body;
}

// 淘宝直播搜索域: 搜索发现 / 直播热卖榜 / 搜索框遮罩词
// (保留 autocompletion = 打字联想功能)
function filterLiveSearchDomain(body, url) {
  if (!isEnabled("liveRemoveAds")) return body;
  const data = safeParse(body);
  if (!data) return body;
  const d = data.data;
  if (!d || typeof d !== "object") return body;
  let modified = false;

  if (url.indexOf("search.shadingwords") >= 0) {
    // 搜索框遮罩词 (实测 word="足迹补贴")
    if (d.hotWords) { d.hotWords = {}; modified = true; }
    if (d.extras) { d.extras = {}; modified = true; }
  }
  if (url.indexOf("search.discover") >= 0) {
    // 搜索发现板块 (6 个预置词 + 图标 + 活动跳转)
    if (Array.isArray(d.result) && d.result.length) { d.result = []; modified = true; }
  }
  if (url.indexOf("search.guidehotlist") >= 0) {
    // 直播热卖榜 (tabs -> taobaolive_duke_search_hot_list 模板)
    // ★ 实际结构是三层 data: data.data.data.{selectedPos, tabs, userFootPrint}
    //   tabs          = 直播热卖榜
    //   userFootPrint = 足迹补贴板块 (与 tabs 同级, 不是 tabs 的子项!)
    if (d.data && Array.isArray(d.data.tabs) && d.data.tabs.length) { d.data.tabs = []; modified = true; }
    if (Array.isArray(d.tabs) && d.tabs.length) { d.tabs = []; modified = true; }
    // userFootPrint 与 tabs 同级 (都在 d.data 下), 双路径兼容不同版本
    if (d.data && d.data.userFootPrint) { d.data.userFootPrint = {}; modified = true; }
    const inner = d.data && d.data.data;
    if (inner && typeof inner === "object") {
      if (inner.userFootPrint) { inner.userFootPrint = {}; modified = true; }
      if (Array.isArray(inner.tabs) && inner.tabs.length) { inner.tabs = []; modified = true; }
    }
    if (d.userFootPrint) { d.userFootPrint = {}; modified = true; }
  }

  if (modified) {
    console.log("[Alibaba-AdBlock] Cleared live search domain: " + (url.split("/gw/")[1] || "").split("/")[0]);
    return JSON.stringify(data);
  }
  return body;
}

function handleXianyuResponse(body, url) {
  // 开屏广告 (含异步开屏/开屏配置/ADX竞价/游戏IAA)
  // Oliver 投放平台批量下发 (阿里投放系统, 反编译确认存在)
  if (url.includes("mtop.taobao.idle.oliver.") || url.includes("mtop.taobao.idle.oliver")) {
    return isEnabled("removePopWindow") ? filterClearData(body) : body;
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlecommerce.splash")) {
    return filterXianyuSplashAds(body);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlecommerce.adx.bid")) {
    return isEnabled("fishRemoveSplash") ? filterXianyuClearData(body) : body;
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlecommerce.game.iaa")) {
    return isEnabled("fishRemoveSplash") ? filterXianyuClearData(body) : body;
  }
  // 弹窗/推荐位 (清空 data)
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idle.user.strategy")) {
    return isEnabled("fishRemovePopup") ? filterXianyuClearData(body) : body;
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idle.item.recommend.list")) {
    return isEnabled("fishRemovePopup") ? filterXianyuClearData(body) : body;
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idle.local.near.by.corner.info")) {
    return isEnabled("fishRemovePopup") ? filterXianyuClearData(body) : body;
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idle.item.buy.feeds")) {
    return isEnabled("fishRemovePopup") ? filterXianyuClearData(body) : body;
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlemtopsearch.search.shade")
      || url.includes("acs.m.goofish.com/gw/mtop.taobao.idlemtopsearch.search.suggest")
      || url.includes("mtop.taobao.idle.trend.search.shade")
      || url.includes("mtop.taobao.idle.trend.search.suggest")
      || url.includes("acs.m.goofish.com/gw/mtop.taobao.idlemtopsearch.search.activate.tablist")
      || url.includes("acs.m.goofish.com/gw/mtop.taobao.idlemtopsearch.search.activate.industrylist")) {
    return filterXianyuSearchDomain(body, url);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlemtopsearch.search.shade")) {
    return filterXianyuSearchWords(body);
  }
  // 闲鱼自有搜索接口族 (hotRankList / 搜索建议 / 猜你可能在找)
  // ★ item.search.activate 必须在此之前处理 (它含 idlemtopsearch.item.search. 前缀,
  //   会被下面的 filterXianyuSearchWords 抢先匹配 → filterXianyuSearchActivate 成死代码)
  if (url.includes("idlemtopsearch.item.search.activate")
      || url.includes("mtop.taobao.idle.trend.search.activate")) {
    return filterXianyuSearchActivate(body);
  }
  if (url.includes("mtop.taobao.idle.search.") || url.includes("mtop.taobao.idleitem.tbsearch")
      || url.includes("mtop.taobao.idlemtopsearch.idleitem.tbsearch")
      || url.includes("mtop.taobao.idlemtopsearch.item.search.")
      || url.includes("mtop.taobao.idlemtopsearch.main.")
      || url.includes("mtop.taobao.idlemtopsearch.fishpool.")
      || url.includes("mtop.taobao.idlemtopsearch.detailpage.search.shade")
      || url.includes("mtop.taobao.idlemtopsearch.market.tab.list")
      || url.includes("mtop.taobao.idle.fishpool.")) {
    return filterXianyuSearchWords(body);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idle.playboy.recommend")) {
    return isEnabled("fishRemovePopup") ? filterXianyuClearData(body) : body;
  }
  // 内容过滤 (jq 规则移植)
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idle.fun.follow.feed.list")) {
    return filterXianyuFollowFeed(body);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlehome.home.nextfresh")) {
    return filterXianyuHomeNextFresh(body);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlehome.widget.refresh.get")) {
    return filterXianyuWidgetRefresh(body);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idle.home.whale.modulet")) {
    return filterXianyuWhaleModulet(body);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlehome.home.community")) {
    return filterXianyuCommunity(body);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlehome.home.newitem.page")) {
    return filterXianyuNewItemPage(body);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idle.local.flow.plat.section")) {
    return filterXianyuLocalFlow(body);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idle.local.home.top")) {
    return filterXianyuLocalHomeTop(body);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idle.local.home")) {
    return filterXianyuLocalHome(body);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.idle.user.page.my.adapter")) {
    return filterXianyuMyPage(body);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlehome.home.circle.list")) {
    return filterXianyuCircleList(body);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlehome.magic.home.page.list")) {
    return filterXianyuMagicHome(body);
  }
  if (url.includes("g-acs.m.goofish.com/gw/mtop.taobao.idlemtopsearch.search") && !url.includes("discover") && !url.includes("activate")) {
    return filterXianyuSearchAds(body);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlemtopsearch.search.discover")) {
    return filterXianyuSearchDiscover(body);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlemtopsearch.item.search.activate")) {
    return filterXianyuSearchActivate(body);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idle.trade.full.info")) {
    return filterXianyuTradeInfo(body);
  }
  return null;
}

// ============================================
// 统一入口
// ============================================

// ============================================
// 橙色配置 (orange.tbcdn.cn) 营销内容清洗 (v3.9.14)
// orange 响应是 protobuf, 内含 JSON 字符串 (字节级处理, 长度严格不变)
// 目标: 清空搜索门营销词 / 节日氛围背景图 / 营销跳转
// ============================================
function bytesToLatin1(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return s;
}
function latin1ToBytes(s) {
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i) & 0xFF;
  return u8;
}
function blankJsonValue(s, key, mode) {
  // 兼容两种形态: 普通 JSON "key":"value" 与嵌套字符串内的转义形式 \"key\":\"value\"
  // 使用搜索偏移, 避免替换后重复命中同一处 (否则只处理第一个出现位置)
  const plain = '"' + key + '":"';
  const escMarker = '\\"' + key + '\\":\\"';
  let changed = false;
  let from = 0;
  for (let guard = 0; guard < 40; guard++) {
    let idx = s.indexOf(plain, from);
    let esc = false;
    if (idx < 0) {
      idx = s.indexOf(escMarker, from);
      esc = true;
      if (idx < 0) break;
    }
    const marker = esc ? escMarker : plain;
    const vStart = idx + marker.length;
    let end = vStart;
    while (end < s.length) {
      const c = s[end];
      if (!esc && c === "\\") { end += 2; continue; }
      if (c === '"') break;
      end++;
    }
    if (end >= s.length) break;
    // 转义形式下结束引号前的反斜杠必须保留 (否则嵌套 JSON 失效)
    let valEnd = end;
    if (esc && end > vStart && s[end - 1] === "\\") valEnd = end - 1;
    const val = s.slice(vStart, valEnd);
    if (!val.length) { from = vStart + 1; continue; }
    let rep;
    if (mode === "url" && val.indexOf("http") === 0) {
      const p = val.indexOf("//") + 2;
      rep = val.slice(0, p) + new Array(val.length - p + 1).join("x");
    } else {
      rep = new Array(val.length + 1).join(" ");
    }
    s = s.slice(0, vStart) + rep + s.slice(valEnd);
    from = vStart + rep.length;
    changed = true;
  }
  return s;
}

// 布尔开关长度中立设置 (orange 线上格式为字符串值):
//   字符串形式 "key":"false"(7) <-> "key":"true "(7)  /  "key":"true"(6) <-> "key":"fals "(6)
//   布尔形式   "key":false(5)   -> "key":true  + 尾随空格(5)   (JSON 空白合法)
//               "key":true(4)    -> "key":null(4)               (null 为假值, 长度不变)
function setJsonBool(s, key, wantTrue) {
  const q = '"';
  const forms = wantTrue
    ? [
        // 字符串形式: "false"(7) -> "true "(7); boolValue 按首字符判定为 YES
        { m: q + key + q + ':"false"', r: q + key + q + ':"true "' },
        // 布尔形式: false(5) -> true + 尾随空格(5), JSON 空白合法
        { m: q + key + q + '":false', r: q + key + q + '":true ' },
        { m: '\\"' + key + '\\":\\"false\\"', r: '\\"' + key + '\\":\\"true \\"' }
      ]
    : [
        // 字符串形式: "true"(6) -> "fals"(6) 等长; boolValue 与 isEqualToString:@"true" 均为假
        { m: q + key + q + ':"true"', r: q + key + q + ':"fals"' },
        // 转义形式同样等长
        { m: '\\"' + key + '\\":\\"true\\"', r: '\\"' + key + '\\":\\"fals\\"' }
        // 注意: 布尔形式 true->null 省略, NSNull 响应 boolValue 会崩溃
      ];
  for (const f of forms) {
    const idx = s.indexOf(f.m);
    if (idx < 0) continue;
    if (f.r.length !== f.m.length) {
      console.log("[Alibaba-AdBlock] bool set length mismatch, skip:", key);
      continue;
    }
    console.log("[Alibaba-AdBlock] orange bool set:", key, "->", wantTrue ? "true" : "false");
    return s.slice(0, idx) + f.r + s.slice(idx + f.m.length);
  }
  return s;
}

const ORANGE_SCRUB_TARGETS = [
  ["searchDoorVoiceHint", "text"],
  ["searchCoudanRedirectUrl", "url"],
  ["immersedBackgroundImgUrl", "url"],
  ["banner_url", "url"],
  ["backgroundImage", "url"],
  ["backgroundImageWithTab", "url"],
  // 搜索域开关: 关闭热词更新/其他tab提示/实时联想/激活数据 (置 true)
  ["closeHotwordsUpdate", "true"],
  ["closeOtherTabSearchHint", "true"],
  ["closeSuggestRealTime", "true"],
  ["closeSuggestRealTime2016", "true"],
  ["closeSuggestRealTime2017", "true"],
  ["closeSuggestRealTime2018", "true"],
  ["closeSuggestRealTime2019", "true"],
  ["closeActivateData", "true"],
  ["closeActivateData2016", "true"],
  ["closeActivateData2017", "true"],
  ["closeActivateData2018", "true"],
  ["closeActivateData2019", "true"],
  // 搜索缓存/轮播总开关: 置 false (关闭搜索词缓存与搜索门缓存)
  ["enableSearchTextCache", "false"],
  ["enableSearchDoorCache", "false"],
  ["enableSearchbarLoopControl", "false"],
  ["enableSearchBarAnimation", "false"]
];
// ============================================
// 弹窗调度器清洗 (poplayer.template.alibaba.com/popcdn/*/config.json)
// 结构: {sc: 场景->弹窗ID (118), ac: 弹窗ID->配置 (785), version}
// 策略: sc 清空 (0 场景可触发) + cdnId 全改 0 (模板失效) + url 破坏 host
//       ac 保持条数 (>0, 避免 App 判定 "content count == 0" 为错误配置)
// ============================================
function scrubPopcdnSchedule(body) {
  if (!body) return null;
  console.log("[Alibaba-AdBlock] popcdn scrub enter, len:", body.length);
  if (typeof body !== "string") {
    try { body = bytesToLatin1(body); } catch (e) { body = ""; }
  }
  let s = body;
  let cdnChanged = 0;
  s = s.replace(/"cdnId":"[0-9a-fA-F]{32}"/g, function () {
    cdnChanged++;
    return '"cdnId":"00000000000000000000000000000000"';
  });
  let urlChanged = 0;
  s = s.replace(/"(url|weexUrl)":"(https?:\/\/)([^"\/]{3})/g, function (m, k, p, host) {
    urlChanged++;
    return '"' + k + '":"' + p + 'xxx' + host.slice(3);
  });
  const ki = s.indexOf('"sc"');
  let scCleared = false;
  if (ki >= 0) {
    const colon = s.indexOf(":", ki);
    const objStart = s.indexOf("{", colon);
    if (objStart >= 0) {
      let depth = 0, objEnd = -1;
      for (let p = objStart; p < s.length; p++) {
        if (s[p] === "{") depth++;
        else if (s[p] === "}") { depth--; if (depth === 0) { objEnd = p + 1; break; } }
      }
      if (objEnd > 0) { s = s.slice(0, objStart) + "{}" + s.slice(objEnd); scCleared = true; }
    }
  }
  console.log("[Alibaba-AdBlock] popcdn scrub: cdnId=" + cdnChanged + " url=" + urlChanged + " scCleared=" + scCleared);
  if (!cdnChanged && !urlChanged && !scCleared) return null;
  const check = safeParse(s);
  if (!check) {
    console.log("[Alibaba-AdBlock] popcdn scrub invalid JSON, fallback minimal");
    return '{"sc":{},"ac":{},"version":"0"}';
  }
  console.log("[Alibaba-AdBlock] poplayer schedule sanitized: sc=" + Object.keys(check.sc || {}).length + " ac=" + Object.keys(check.ac || {}).length);
  return s;
}

function scrubOrangeConfig(bodyBytes) {
  try {
    const s0 = bytesToLatin1(bodyBytes);
    const edits = [];
    for (const t of ORANGE_SCRUB_TARGETS) {
      const key = t[0];
      const mode = t[1];
      // 找出 "key" 后面的值起始位置 (兼容普通与转义引号形式)
      const forms = [
        { pre: '"' + key + '":', esc: false },
        { pre: '"' + key + '": ', esc: false },
        { pre: '\\"' + key + '\\":\\"', esc: true }
      ];
      for (const f of forms) {
        const idx = s0.indexOf(f.pre);
        if (idx < 0) continue;
        const vStart = idx + f.pre.length;
        const q = f.esc ? '\\"' : '"';
        // 值以引号包裹 (字符串) 或为裸 true/false/null (布尔)
        if (s0[vStart] === '"' || (f.esc && s0[vStart] === "\\")) {
          const qStart = vStart;
          let vEnd = vStart + 1;
          while (vEnd < s0.length) {
            if (s0[vEnd] === "\\") { vEnd += 2; continue; }
            if (s0[vEnd] === '"') break;
            vEnd++;
          }
          if (vEnd >= s0.length) continue;
          const inner = s0.slice(vStart + 1, vEnd);
          let newInner = null;
          if (mode === "text") {
            newInner = new Array(inner.length + 1).join(" ");
          } else if (mode === "url") {
            if (inner.indexOf("http") === 0) {
              const p = inner.indexOf("//") + 2;
              newInner = inner.slice(0, p) + new Array(inner.length - p + 1).join("x");
            }
          } else {
            const wantTrue = mode === "true";
            if (wantTrue && inner === "false") newInner = "true ";
            else if (!wantTrue && inner === "true") newInner = "fals";
          }
          if (newInner !== null) {
            const oldPart = s0.slice(vStart, vEnd + 1);
            const newPart = s0[vStart] + newInner + s0[vEnd];
            if (newPart.length === oldPart.length) {
              edits.push({ idx: vStart, len: oldPart.length, txt: newPart, key: key });
            } else {
              console.log("[Alibaba-AdBlock] orange edit length mismatch, skip:", key);
            }
          }
          break;
        } else {
          // 裸布尔值
          const bare = s0.slice(vStart, vStart + 6);
          const isTrue = bare.indexOf("true") === 0;
          const isFalse = bare.indexOf("false") === 0;
          if ((mode === "true" && isFalse) || (mode === "false" && isTrue)) {
            const wantTrue = mode === "true";
            // false(5) -> true +空格(5) 等长; true(4) -> 需等长假值, 但 null 有 NSNull 崩溃风险, 故跳过
            if (wantTrue) {
              edits.push({ idx: vStart, len: 5, txt: "true ", key: key });
            } else {
              console.log("[Alibaba-AdBlock] orange bool false-form skipped (NSNull risk):", key);
            }
          }
          break;
        }
      }
    }
    if (edits.length === 0) {
      console.log("[Alibaba-AdBlock] Orange config: no marketing fields matched");
      return null;
    }
    // 从后往前应用, 保证索引有效
    edits.sort(function (a, b) { return b.idx - a.idx; });
    let s = s0;
    for (const e of edits) {
      s = s.slice(0, e.idx) + e.txt + s.slice(e.idx + e.len);
      console.log("[Alibaba-AdBlock] orange field sanitized:", e.key);
    }
    console.log("[Alibaba-AdBlock] Orange config scrubbed, fields:", edits.length);
    return latin1ToBytes(s);
  } catch (e) {
    console.log("[Alibaba-AdBlock] Orange scrub failed, pass through:", e);
    return null;
  }
}


// ★ 天猫首页容器 (infinity.gateway.execute): 清洗 tabHeader.search 预置广告词
// 结构: data.attachment.tabHeader.fields.search.query = 滚动词 (placeholder 接口的第二通道)
// 策略: query 置空 + accessibilityText 同步 + refresh=false — 结构完整保留 (防搜索框点击失效)
function filterTmallInfinity(body) {
  try {
    const obj = JSON.parse(body);
    const att = obj?.data?.attachment || {};   // 我猫页 execute 无 attachment, 不能提前退出
    let changed = false;
    const th = att.tabHeader?.fields;
    if (th && th.search && typeof th.search === 'object' && th.search.query) {
      th.search.query = "";
      th.search.accessibilityText = "";
      th.search.isBold = "false";
      th.search.refresh = "false";
      changed = true;
    }
    // fullSearchContainer 同源兜底
    const fsc = att.fullSearchContainer;
    if (fsc && typeof fsc === 'object' && fsc.query) {
      fsc.query = ""; fsc.refresh = "false"; changed = true;
    }
    // 我猫/首页促销券条 (两类容器: tm_my_promotion_* / tmall_home_landscape_promotion_* — 苹果惊喜券等领取卡)
    const dd = obj?.data?.data;
    if (dd && typeof dd === 'object') {
      for (const k of Object.keys(dd)) {
        const c = dd[k];
        const t = c && typeof c === 'object' && typeof c.type === 'string' ? c.type
          : (typeof k === 'string' && k.indexOf('tmall_home_landscape_promotion') === 0 ? 'tmall_home_landscape_promotion' : null);
        if (t && (t.indexOf('tm_my_promotion') === 0 || t.indexOf('tmall_home_landscape_promotion') === 0)) {
          delete dd[k]; changed = true;
        }
      }
    }
    return changed ? JSON.stringify(obj) : null;
  } catch (e) { return null; }
}


// ★ 直播频道入口: limitRightList 权益提示条清空 (蜜蜂惊喜社等蜂群营销)
function filterLiveColumnEntry(body) {
  try {
    const obj = JSON.parse(body);
    const d = obj?.data?.data;
    if (!d) return null;
    let changed = false;
    if (d.limitRightTips && d.limitRightTips.limitRightList && d.limitRightTips.limitRightList.length) {
      d.limitRightTips.limitRightList = [];
      changed = true;
    }
    return changed ? JSON.stringify(obj) : null;
  } catch (e) { return null; }
}

// ★ 直播视频流: bottomCardList 带货卡清空 (马上抢按钮卡, dataList[].data.customizedInfo)
function filterLiveVideoBottomCards(body) {
  try {
    const obj = JSON.parse(body);
    let changed = false;
    const walk = (o) => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (o && typeof o === 'object') {
        const ci = o.customizedInfo;
        if (ci && Array.isArray(ci.bottomCardList) && ci.bottomCardList.length) {
          ci.bottomCardList = []; changed = true;
        }
        for (const k of Object.keys(o)) walk(o[k]);
      }
    };
    walk(obj);
    return changed ? JSON.stringify(obj) : null;
  } catch (e) { return null; }
}


// ★ 一淘: 首页搜索框滚词典 + 搜索中间页(搜索发现) 清洗
// home.metax.query → headerList[].fields.data.searchDefaultText (滚词典, searchText 是点击载体须保结构)
// search.middle.query → search_discovery_sec 的 termList (搜索发现词表; 保留 history_sec)
function filterEtaoSearch(body, url) {
  try {
    const obj = JSON.parse(body);
    let changed = false;
    const dd = obj?.data?.data;
    if (!dd) return null;
    if (url.indexOf("home.metax.query") >= 0) {
      // 首页搜索框滚词典
      const hl = dd.headerList;
      if (Array.isArray(hl)) {
        for (const h of hl) {
          const sd = h?.fields?.data?.searchDefaultText;
          if (Array.isArray(sd) && sd.length) {
            for (const item of sd) {
              if (item.searchText) { item.searchText = ""; changed = true; }
              // URL 参数里的词也清 (hint/query 回显)
              if (item.middlePageUrl) { item.middlePageUrl = item.middlePageUrl.replace(/([?&]hint=)[^&]*/, '$1'); changed = true; }
              if (item.resultPageUrl) { item.resultPageUrl = item.resultPageUrl.replace(/([?&]query=)[^&]*/, '$1'); changed = true; }
            }
          }
        }
      }
    }
    if (url.indexOf("search.middle.query") >= 0) {
      // 搜索发现容器空壳化 (v3.47.3: 整删会让中间页组件弹加载失败toast — 改留极简空壳, id+type 保留)
      const discKey = "search_discovery_sec_etao_search";
      if (dd[discKey] && dd[discKey].fields) {
        dd[discKey] = { id: discKey, type: dd[discKey].type || "200477", unwEvents: {}, unwExtend: {} };
        // hierarchy 引用移除 (空壳无需渲染, 但容器存在=加载成功不弹toast)
        const st = obj?.data?.hierarchy?.structure;
        if (st) {
          for (const k of Object.keys(st)) {
            if (Array.isArray(st[k])) st[k] = st[k].filter(x => x !== discKey);
          }
        }
        changed = true;
      }
    }
    return changed ? JSON.stringify(obj) : null;
  } catch (e) { return null; }
}

function main() {
  if (!$response || !$response.body) {
    console.log("[Alibaba-AdBlock] No response body");
    $done({});
    return;
  }
  const url = $request?.url || "";
  console.log("[Alibaba-AdBlock] Script triggered for:", url);
  const body = typeof $response.body === "string" ? $response.body : $response.body.toString();

  // 淘宝直播: 搜索域 (搜索发现/热卖榜/遮罩词)
  if (url.indexOf("mtop.taobao.livex.vcore.search.") >= 0
      && url.indexOf("autocompletion") < 0) {
    const liveSearch = filterLiveSearchDomain(body, url);
    if (liveSearch !== null && liveSearch !== body) {
      $done({ body: liveSearch });
      return;
    }
  }

  // 一淘: 首页滚词典 + 搜索发现
  if (url.indexOf("mtop.etao.home.metax.query") >= 0 || url.indexOf("mtop.etao.search.middle.query") >= 0) {
    if (isEnabled("removeSearchWords") || isEnabled("removeSmallCards")) {
      const es = filterEtaoSearch(body, url);
      if (es !== null) { $done({ body: es }); return; }
    }
  }

  // 淘宝直播: 频道入口权益条 (蜜蜂惊喜社等)
  if (url.indexOf("livex.vcore.live.column.entry") >= 0) {
    const lc = filterLiveColumnEntry(body);
    if (lc !== null) { $done({ body: lc }); return; }
  }
  // 淘宝直播: 视频流带货卡 (bottomCardList 马上抢)
  if (url.indexOf("vcore.detail.video") >= 0 || url.indexOf("recommend.video.explore") >= 0 || url.indexOf("vcore.series.videos") >= 0) {
    const vb = filterLiveVideoBottomCards(body);
    if (vb !== null) { $done({ body: vb }); return; }
  }
  // 淘宝直播: 首页视频流广告 (livexshow.homepage.*)
  if (url.indexOf("livexshow.homepage.") >= 0) {
    const lf = filterLiveHomeFeed(body);
    if (lf !== null && lf !== body) { $done({ body: lf }); return; }
  }
  // 淘宝直播: 信息流广告过滤 (vcore.feeds.market.query)  // 淘宝直播: 信息流广告过滤 (vcore.feeds.market.query)
  if (url.indexOf("vcore.feeds.market.query") >= 0) {
    const liveFiltered = filterLiveMarketFeed(body);
    if (liveFiltered !== null && liveFiltered !== body) {
      $done({ body: liveFiltered });
      return;
    }
  }
  
  
  // 橙色配置 (orange.tbcdn.cn): 清洗营销内容 (protobuf 字节级, 长度不变)
  if (url.indexOf("orange.tbcdn.cn/") >= 0 || url.indexOf("dorangesource.alicdn.com/") >= 0) {
    if (isEnabled("removeSplashAd")) {
      const raw = ($response.bodyBytes || ($response.body instanceof Uint8Array ? $response.body : null));
      if (raw) {
        const scrubbed = scrubOrangeConfig(raw);
        if (scrubbed) {
          $done({ body: scrubbed });
          return;
        }
      }
    }
  }

  // 天猫首页容器: tabHeader.search 预置词清空 (placeholder 接口外的第二通道)
  if (url.indexOf("mtop.tmall.infinity.gateway.execute") >= 0) {
    if (isEnabled("removeSearchWords") || isEnabled("removeSmallCards")) {
      const tmClean = filterTmallInfinity(body);
      if (tmClean !== null) { $done({ body: tmClean }); return; }
    }
  }

  // 弹窗调度器: 清空 sc 场景映射 + 改坏模板/落地页 (sc=0 弹窗永不触发)
  if (url.indexOf("poplayer.template.alibaba.com/popcdn/") >= 0) {
    if (isEnabled("removePopWindow")) {
      const cleaned = scrubPopcdnSchedule(body);
      if (cleaned !== null) {
        $done({ body: cleaned });
        return;
      }
    }
  }

  // 按域名/路径分发
  let newBody = null;
  // ★ Moon/阿里妈妈系接口 (alimama/etao/moon/alimusic/taobao.union/tmall.tac) 必须走 handleMoonResponse
  //   联盟 App 走 guide-acs.m.taobao.com, 若先进 handleTaobaoResponse 则 metax/batchsite/noah 等无处理
  const isMoonFamily = url.includes("mtop.alimama.") || url.includes("mtop.etao.")
    || url.includes("mtop.alimusic.") || url.includes("mtop.taobao.union.")
    || url.includes("mtop.tmall.tac.") || url.includes("mtop.tmall.jiuxi.");
  if (isMoonFamily) {
    newBody = handleMoonResponse(body, url);
  } else if (url.includes("acs.m.taobao.com") || url.includes("guide-acs.m.taobao.com") || url.includes("poplayer.template.alibaba.com")) {
    newBody = handleTaobaoResponse(body, url);
  } else if (url.includes("acs.m.goofish.com") || url.includes("g-acs.m.goofish.com")) {
    newBody = handleXianyuResponse(body, url);
  } else {
    newBody = handleMoonResponse(body, url);
  }
  
  if (newBody !== null && newBody !== body) {
    console.log("[Alibaba-AdBlock] Response modified");
    $done({ body: newBody });
    return;
  }
  console.log("[Alibaba-AdBlock] No matching handler or no changes");
  $done({});
}

main();