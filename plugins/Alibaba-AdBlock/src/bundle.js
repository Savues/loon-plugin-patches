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
function isEnabled(key) {
  const val = $argument[key];
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
  if (!data?.data?.data?.headerList || !Array.isArray(data.data.data.headerList)) return body;
  let modified = false;
  const { hotwordsType } = config;
  for (const item of data.data.data.headerList) {
    if (item?.type === hotwordsType && item?.fields?.hotwords && Array.isArray(item.fields.hotwords) && item.fields.hotwords.length > 0) {
      console.log("[Alibaba-AdBlock] Clearing metax hotwords (" + item.fields.hotwords.length + " words)");
      item.fields.hotwords = [];
      modified = true;
    }
  }
  if (modified) return JSON.stringify(data);
  return body;
}

function filterMetaxFeed(body, config) {
  if (!isEnabled("removeFeedKeywords")) return body;
  const data = safeParse(body);
  if (!data?.data?.data?.bodyList || !Array.isArray(data.data.data.bodyList)) return body;
  let totalCleared = 0;
  const { clearFeedTypes } = config;
  for (const bodyItem of data.data.data.bodyList) {
    if (clearFeedTypes.length > 0 && !clearFeedTypes.includes(bodyItem?.type)) continue;
    if (bodyItem?.fields?.newsList?.recommend?.resultList && Array.isArray(bodyItem.fields.newsList.recommend.resultList)) {
      const originalLen = bodyItem.fields.newsList.recommend.resultList.length;
      if (originalLen > 0) {
        console.log("[Alibaba-AdBlock] Clearing feed: bodyList type=" + bodyItem.type + ", removed " + originalLen + " items");
        bodyItem.fields.newsList.recommend.resultList = [];
        bodyItem.fields.newsList.recommend.hasMore = "false";
        bodyItem.fields.newsList.recommend.allCount = "0";
        totalCleared += originalLen;
      }
    }
    if (bodyItem?.fields?.resultList && Array.isArray(bodyItem.fields.resultList)) {
      const originalLen = bodyItem.fields.resultList.length;
      if (originalLen > 0) {
        console.log("[Alibaba-AdBlock] Clearing feed: bodyList type=" + bodyItem.type + ", removed " + originalLen + " items (resultList)");
        bodyItem.fields.resultList = [];
        totalCleared += originalLen;
      }
    }
    if (bodyItem?.fields?.floorMappingList && Array.isArray(bodyItem.fields.floorMappingList)) {
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
    if (bodyItem?.fields?.homeSlotConverge) {
      bodyItem.fields.homeSlotConverge = {};
      totalCleared++;
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
function filterClearData(body) {
  const data = safeParse(body);
  if (!data) return body;
  if (data.data && (Array.isArray(data.data) || typeof data.data === "object")) {
    data.data = {};
    console.log("[Alibaba-AdBlock] Cleared ad response data");
    return JSON.stringify(data);
  }
  return body;
}

// ============================================
// === 新增：闲鱼开屏/弹窗处理 (kelee.one FleaMarket_remove_ads.lpx 移植) ===
// ============================================

// 闲鱼-开屏广告: acs.m.goofish.com/gw/mtop.taobao.idlecommerce.splash.ads
function filterXianyuSplashAds(body) {
  if (!isEnabled("removeSplashAd")) return body;
  const data = safeParse(body);
  if (!data) return body;
  // 清空广告数据
  if (data.data) {
    data.data = {};
    console.log("[Alibaba-AdBlock] Cleared Xianyu splash ads");
    return JSON.stringify(data);
  }
  return body;
}

// 闲鱼-首页刷新: idlehome.home.nextfresh - 保留 kingkongDo，去除 homeMultiBanner/mamaAD
function filterXianyuHomeNextFresh(body) {
  if (!isEnabled("removeSmallCards")) return body;
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
  if (!isEnabled("removeSmallCards")) return body;
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
  if (!isEnabled("removeSmallCards")) return body;
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
  if (!isEnabled("removeSmallCards")) return body;
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
  if (!isEnabled("removeSmallCards")) return body;
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
  if (!isEnabled("removeSmallCards")) return body;
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
  if (!isEnabled("removeSmallCards")) return body;
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
  if (!isEnabled("removeSmallCards")) return body;
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
  if (!isEnabled("removeSmallCards")) return body;
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
  if (!isEnabled("removeSmallCards")) return body;
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
  if (!isEnabled("removeSmallCards")) return body;
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
  if (!isEnabled("removeSmallCards")) return body;
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
  if (!isEnabled("removeSmallCards")) return body;
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
  if (!isEnabled("removeSmallCards")) return body;
  const data = safeParse(body);
  if (!data) return body;
  if (data.data?.cardList && Array.isArray(data.data.cardList)) {
    let modified = false;
    for (const card of data.data.cardList) {
      if (card?.cardData?.hotwords) {
        delete card.cardData.hotwords;
        modified = true;
      }
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
  if (!isEnabled("removeSmallCards")) return body;
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
      blockResKeys: ["moon_search_activation_dx_banner","moon_share_dx_market_material","moon_dx_bulletin_board_discovery","moon_dx_bulletin_board_report","moon_dx_bulletin_board_mine","moon_dx_bulletin_board_goods","moon_h5_handle_one","moon_h5_handle_two","moon_h5_handle_three","newcomer_walfare_popup","high_level_taoke_timer_notice"],
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
// 补丁内容: content.searchText / searchBox.loopInterval / homepage_searchTextContent
//           三处绑定失效 -> 轮播词无法渲染, 本地缓存无法读写, 搜索栏 UI 其他部分完好
// 失败模式安全: 若二进制替换不被 Loon 支持, 脚本异常 -> 原始响应照常通过 (轮播词恢复但不破坏搜索栏)
// ============================================
const SEARCHBAR_PATCHED_ZIP_B64 = "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";

function replaceSearchbarTemplate() {
  try {
    // base64 -> Uint8Array (Loon 二进制约定)
    const b64s = SEARCHBAR_PATCHED_ZIP_B64;
    const bin = new Uint8Array(atob(b64s).length);
    const raw = atob(b64s);
    for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
    console.log("[Alibaba-AdBlock] Replaced searchbar container template (no scroll words), " + bin.length + " bytes");
    $done({ body: bin });
  } catch (e) {
    console.log("[Alibaba-AdBlock] Binary template replace failed, passing through: " + e);
    $done({});
  }
}

// ============================================
// Taobao App 处理入口 (kelee.one 移植 + 反编译)
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
function handleXianyuResponse(body, url) {
  // 开屏广告 (含异步开屏/开屏配置/ADX竞价/游戏IAA)
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlecommerce.splash")) {
    return filterXianyuSplashAds(body);
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlecommerce.adx.bid")) {
    return isEnabled("removePopWindow") ? filterXianyuClearData(body) : body;
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlecommerce.game.iaa")) {
    return isEnabled("removePopWindow") ? filterXianyuClearData(body) : body;
  }
  // 弹窗/推荐位 (清空 data)
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idle.user.strategy")) {
    return isEnabled("removePopWindow") ? filterXianyuClearData(body) : body;
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idle.item.recommend.list")) {
    return isEnabled("removePopWindow") ? filterXianyuClearData(body) : body;
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idle.local.near.by.corner.info")) {
    return isEnabled("removePopWindow") ? filterXianyuClearData(body) : body;
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idle.item.buy.feeds")) {
    return isEnabled("removePopWindow") ? filterXianyuClearData(body) : body;
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlemtopsearch.search.shade")) {
    return isEnabled("removePopWindow") ? filterXianyuClearData(body) : body;
  }
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idle.playboy.recommend")) {
    return isEnabled("removePopWindow") ? filterXianyuClearData(body) : body;
  }
  // 内容过滤 (jq 规则移植)
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
function main() {
  if (!$response || !$response.body) {
    console.log("[Alibaba-AdBlock] No response body");
    $done({});
    return;
  }
  const url = $request?.url || "";
  console.log("[Alibaba-AdBlock] Script triggered for:", url);
  const body = typeof $response.body === "string" ? $response.body : $response.body.toString();
  
  // 搜索栏容器模板: 整体替换为补丁版 (二进制, 需在 parse 之前处理)
  if (url.includes("m_h_v7_uone_second_pit_searchbar_slim_protocol_version") && url.endsWith(".zip")) {
    if (isEnabled("removeSearchWords")) {
      replaceSearchbarTemplate();
      return;
    }
  }
  
  // 按域名/路径分发
  let newBody = null;
  if (url.includes("acs.m.taobao.com") || url.includes("guide-acs.m.taobao.com") || url.includes("poplayer.template.alibaba.com")) {
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