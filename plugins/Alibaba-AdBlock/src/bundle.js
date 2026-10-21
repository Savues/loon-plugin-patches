/*
 * Alibaba-AdBlock v2.3.0 - Bundled Script for Loon
 * 阿里系去广告 · 支持 Moon/淘宝/天猫/闲鱼/盒马/飞猪等
 * 单文件打包，无需 require() 支持
 * 更新: 2026-10-21
 * 新增: 淘宝/闲鱼开屏弹窗规则 (kelee.one 移植 + 反编译补充)
 * 修正: Loon Rewrite 语法 (Surge格式 -> Loon标准格式)
 * 修正: Rewrite 正则匹配 (去掉结尾 / 以匹配任意路径)
 * 修正: poplayer 匹配规则 (.*json -> .*)
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
// Taobao App 处理入口 (kelee.one 移植)
// ============================================
function handleTaobaoResponse(body, url) {
  // 开屏广告
  if (url.includes("guide-acs.m.taobao.com/gw/mtop.taobao.cloudvideo.video.query")) {
    return filterTaobaoSplashVideo(body);
  }
  if (url.includes("guide-acs.m.taobao.com/gw/mtop.taobao.wireless.home.splash.awesome.get")) {
    return filterTaobaoSplashImage(body);
  }
  if (url.includes("poplayer.template.alibaba.com/") && url.endsWith(".json")) {
    return filterTaobaoSplashActivity(body);
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
  if (url.includes("guide-acs.m.taobao.com/gw/mtop.taobao.wireless.home.newface.awesome.get")) {
    return isEnabled("removePopWindow") ? filterClearData(body) : body;
  }
  return null;
}

// ============================================
// Xianyu App 处理入口 (kelee.one 移植 + 反编译)
// ============================================
function handleXianyuResponse(body, url) {
  // 开屏广告
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idlecommerce.splash.ads")) {
    return filterXianyuSplashAds(body);
  }
  // 弹窗/推荐位 (清空 data)
  if (url.includes("acs.m.goofish.com/gw/mtop.taobao.idle.user.strategy.list")) {
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