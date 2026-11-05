/*
 * CtClient-AdBlock bundle.js — 中国电信 CtClient (13.5.0 / CTPocket)
 *
 * 取证来源：Live Container 沙盒 lcf-forensics（原始响应，插件前）+ CTPocket 二进制常量区
 *   B8A26766-E671-400C-A2B1-65B16D3CC33A / 1E35CB6D-F739-41E2-8108-1F3627355398
 *
 * 铁律（本文件的设计前提）：
 *  1. 功能主干容器只能清洗不能 reject —— 清空容器 = 白屏/功能消失
 *  2. adList 在 queryHomepageMarketingFloor 里是「常用功能九宫格」
 *     （查账单/办套餐/宽带到家/买手机/积分商城…20 项，全部带 linkType+sceneId）
 *     → 绝不清空，只清 hotSelection（纯营销位）
 *  3. compoundADSpace 实测全是功能入口（在线客服/数字人/扫一扫/付款码/关爱版/英文版
 *     /意见反馈/我要投诉/我的地址/特惠副卡/全屋光宽）→ 本插件不清洗它
 *  4. 三件套缺一即静默失效：① 本文件函数 ② main() 分发 ③ lpx [Script] 规则入口
 *  5. $done({}) 不动响应；只有真的改了字段才回写 body
 */

// ─────────────────────────── 工具 ───────────────────────────

function argObject() {
  var a = typeof $argument === 'undefined' ? null : $argument;
  if (Array.isArray(a)) a = a[0] || {};
  if (!a || typeof a !== 'object') return {};
  return a;
}

function on(key) {
  var v = argObject()[key];
  if (v === undefined || v === null || v === '') return true; // 缺省=开
  return v === true || v === 'true' || v === '1' || v === 1;
}

function parseBody() {
  try {
    return JSON.parse($response.body);
  } catch (e) {
    return null;
  }
}

// 兼容 data 直接挂在 responseData 下 or 顶层
function dataOf(obj) {
  if (obj && obj.responseData && obj.responseData.data != null) return obj.responseData.data;
  if (obj && obj.data != null) return obj.data;
  return null;
}

function clearArray(holder, key) {
  if (!holder || !Array.isArray(holder[key]) || holder[key].length === 0) return false;
  holder[key] = [];
  return true;
}

// ─────────────────── 各接口清洗函数（每个都必须被 main 调用） ───────────────────

// 首页营销楼层：只清纯营销位，保留 adList（功能九宫格）与 sortList
function cleanHomepageMarketingFloor(d, opts) {
  var changed = false;
  if (!d) return false;

  if (opts.hotSelection && d.hotSelection) {
    if (clearArray(d.hotSelection, 'advertisingListLeft')) changed = true;
    if (clearArray(d.hotSelection, 'advertisingListRight')) changed = true;
  }

  // 套餐/选号/宽带 tab 底部销售 banner（5G-A套餐/5G畅享云套餐/卫星功能卡/精选好号）
  if (opts.tariffBanner && d.packageAndNumberCard && Array.isArray(d.packageAndNumberCard.tabList)) {
    d.packageAndNumberCard.tabList.forEach(function (t) {
      if (t && clearArray(t, 'bottomBannerList')) changed = true;
    });
  }
  return changed;
}

// 信息流：只删卡片里的推荐广告三件套，feedList 本体与 topArea 保留
function cleanFeedList(d) {
  if (!d || !Array.isArray(d.feedList)) return false;
  var changed = false;
  d.feedList.forEach(function (f) {
    if (!f || !f.recommendAdBean) return;
    if (clearArray(f.recommendAdBean, 'recommendAdList')) changed = true;
  });
  return changed;
}

// 消息中心：营销消息流（闲置好物…）清空，服务消息/实时事件不动
function cleanMessageChannel(d) {
  if (!d) return false;
  var changed = false;
  if (clearArray(d, 'marketingMessageList')) changed = true;
  if (d.dynamicMessage && clearArray(d.dynamicMessage, 'marketingMessageList')) changed = true;
  return changed;
}

// 首页 AI 数字人卡片：digitalPersonCard.adList（充值100元/积分兑好礼…）
function cleanHomepageAICard(d) {
  if (!d || !d.digitalPersonCard) return false;
  return clearArray(d.digitalPersonCard, 'adList');
}

// 我的页顶部广告条
function cleanMyChannelTop(d) {
  if (!d) return false;
  return clearArray(d, 'topAdList');
}

// 云监控卡片（未开通态）
function cleanMyCloudMonitorCard(d) {
  if (!d || !d.noDeviceData) return false;
  return clearArray(d.noDeviceData, 'noDeviceAdList');
}

// 云盘卡片（未授权态）
function cleanMyStorageCard(d) {
  if (!d || !d.unauthorizedData) return false;
  return clearArray(d.unauthorizedData, 'adList');
}

// AI 铃音卡片
function cleanMyAiRingtoneCard(d) {
  if (!d || !d.myCreation) return false;
  return clearArray(d.myCreation, 'adList');
}

// 通信助理卡片（未开通态）
function cleanCommunicationAssistantCard(d) {
  if (!d || !d.notOpenData) return false;
  return clearArray(d.notOpenData, 'bottomAdList');
}

// 出行卡片：酒店位 topAdList
function cleanMyTravelCardNew(d) {
  if (!d || !Array.isArray(d.myTravelTabList)) return false;
  var changed = false;
  d.myTravelTabList.forEach(function (tab) {
    if (tab && tab.hotelBean && clearArray(tab.hotelBean, 'topAdList')) changed = true;
  });
  return changed;
}

// 铃音+生活卡片：adList（签到领流量/权益领取…）
function cleanRingtoneAndLifeCard(d) {
  if (!d) return false;
  return clearArray(d, 'adList');
}

// ─────────────────────────── 分发 ───────────────────────────

function main() {
  if (!$response || !$response.body) {
    $done({});
    return;
  }

  var url = ($request && $request.url) || '';
  var obj = parseBody();
  if (!obj) {
    $done({});
    return;
  }
  var d = dataOf(obj);
  if (!d || typeof d !== 'object') {
    $done({});
    return;
  }

  var changed = false;

  if (/\/query\/queryHomepageMarketingFloor/i.test(url)) {
    if (!on('homepageFloor')) { $done({}); return; }
    changed = cleanHomepageMarketingFloor(d, {
      hotSelection: on('homepageHotSelection'),
      tariffBanner: on('homepageTariffBanner')
    });
  } else if (/\/query\/getFeedList/i.test(url)) {
    if (!on('feedRecommendAd')) { $done({}); return; }
    changed = cleanFeedList(d);
  } else if (/\/query\/queryMessageChannel/i.test(url)) {
    if (!on('marketingMessage')) { $done({}); return; }
    changed = cleanMessageChannel(d);
  } else if (/\/query\/queryHomepageAICard/i.test(url)) {
    if (!on('aICardAd')) { $done({}); return; }
    changed = cleanHomepageAICard(d);
  } else if (/\/query\/queryMyChannelTop/i.test(url)) {
    if (!on('myChannelTopAd')) { $done({}); return; }
    changed = cleanMyChannelTop(d);
  } else if (/\/query\/queryMyCloudMonitorCard/i.test(url)) {
    if (!on('cardInnerAd')) { $done({}); return; }
    changed = cleanMyCloudMonitorCard(d);
  } else if (/\/query\/queryMyStorageCard/i.test(url)) {
    if (!on('cardInnerAd')) { $done({}); return; }
    changed = cleanMyStorageCard(d);
  } else if (/\/query\/queryMyAiRingtoneCard/i.test(url)) {
    if (!on('cardInnerAd')) { $done({}); return; }
    changed = cleanMyAiRingtoneCard(d);
  } else if (/\/query\/myCommunicationAssistantCard/i.test(url)) {
    if (!on('cardInnerAd')) { $done({}); return; }
    changed = cleanCommunicationAssistantCard(d);
  } else if (/\/query\/myTravelCardNew/i.test(url)) {
    if (!on('cardInnerAd')) { $done({}); return; }
    changed = cleanMyTravelCardNew(d);
  } else if (/\/query\/queryMyRingtoneAndLifeCard/i.test(url)) {
    if (!on('cardInnerAd')) { $done({}); return; }
    changed = cleanRingtoneAndLifeCard(d);
  } else {
    $done({});
    return;
  }

  if (changed) $done({ body: JSON.stringify(obj) });
  else $done({});
}

main();
