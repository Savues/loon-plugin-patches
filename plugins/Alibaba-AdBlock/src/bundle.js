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
// v3.9.9: 恢复 v2 补丁 (test-v392-393 对照实验验证可用; v3.9.4/5 的点击失效真凶是 search_door 泛化规则误伤 searchBoxUrl)
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
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlemtopsearch.search.shade")
      || url.includes("acs.m.goofish.com/gw/mtop.taobao.idlemtopsearch.search.suggest")
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
  if (url.includes("idlemtopsearch.item.search.activate")) {
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
    return isEnabled("removePopWindow") ? filterXianyuClearData(body) : body;
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