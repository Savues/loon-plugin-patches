/*
 * CtClient-AdBlock bundle.js — 中国电信 CtClient (13.5.0 / CTPocket)
 *
 * v2.1.0 修正：把「字段名叫 adList 但内容是功能入口」的容器全部放回原位。
 * 实测这些字段装的是真功能，删了等于砍功能：
 *   queryMyChannelTop.topAdList          = 设置 / 签到 / 关爱
 *   queryHomepageAICard.digitalPersonCard.adList = 加装副卡 / 翼留言 / 开发票 / 买流量包
 *   queryMyRingtoneAndLifeCard.adList    = 签到领流量 / 权益领取 / 服务管家 / 积分兑换 / 家庭圈
 *   queryMyStorageCard.unauthorizedData.adList = 超大空间 / 安全保障 / 微信备份 / 云相册
 *   queryMyAiRingtoneCard.myCreation.adList    = AI特效 / AI视频 / AI音乐
 *   myCommunicationAssistantCard.notOpenData.bottomAdList = 号码识别 / 漏话提醒 / 语音助理…
 *   queryMyCloudMonitorCard.noDeviceAdList     = 看家护院 / 特惠单品 / 看店宝
 * 只有「纯营销位」才清洗，其余一律不动。
 *
 * 三件套：① 本文件函数 ② main() 分发 ③ lpx [Script] 规则入口
 */

function argObject() {
  var a = typeof $argument === 'undefined' ? null : $argument;
  if (Array.isArray(a)) a = a[0] || {};
  if (!a || typeof a !== 'object') return {};
  return a;
}

function on(key) {
  var v = argObject()[key];
  if (v === undefined || v === null || v === '') return true;
  return v === true || v === 'true' || v === '1' || v === 1;
}

function parseBody() {
  try {
    return JSON.parse($response.body);
  } catch (e) {
    return null;
  }
}

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

// ─── 清洗：只碰纯营销位 ───

// 首页营销楼层：hotSelection（11.11限定/低价订酒店/合约机…）+ 套餐销售 banner
// 注意：adList 是「常用功能九宫格」20 项，绝不动；sortList 不动
function cleanHomepageMarketingFloor(d, opts) {
  var changed = false;
  if (!d) return false;

  if (opts.hotSelection && d.hotSelection) {
    if (clearArray(d.hotSelection, 'advertisingListLeft')) changed = true;
    if (clearArray(d.hotSelection, 'advertisingListRight')) changed = true;
  }
  if (opts.tariffBanner && d.packageAndNumberCard && Array.isArray(d.packageAndNumberCard.tabList)) {
    d.packageAndNumberCard.tabList.forEach(function (t) {
      if (t && clearArray(t, 'bottomBannerList')) changed = true;
    });
  }
  return changed;
}

// 信息流：卡片内推荐广告（宽带新装/宽带专区/天翼出行），feedList 本体与 topArea 保留
function cleanFeedList(d) {
  if (!d || !Array.isArray(d.feedList)) return false;
  var changed = false;
  d.feedList.forEach(function (f) {
    if (f && f.recommendAdBean && clearArray(f.recommendAdBean, 'recommendAdList')) changed = true;
  });
  return changed;
}

// 消息中心：营销消息流（闲置好物…），服务消息与实时事件不动
function cleanMessageChannel(d) {
  if (!d) return false;
  var changed = false;
  if (clearArray(d, 'marketingMessageList')) changed = true;
  if (d.dynamicMessage && clearArray(d.dynamicMessage, 'marketingMessageList')) changed = true;
  return changed;
}

// 出行卡片：酒店位推广（低价订酒店）
function cleanTravelCard(d) {
  if (!d || !Array.isArray(d.myTravelTabList)) return false;
  var changed = false;
  d.myTravelTabList.forEach(function (tab) {
    if (tab && tab.hotelBean && clearArray(tab.hotelBean, 'topAdList')) changed = true;
  });
  return changed;
}

// ─── 无用功能整接口置空 ───

// 返回合法空信封（resultCode=1001/data:null），App 有现成容错，比 reject {} 安全
function stubBody() {
  return JSON.stringify({
    headerInfos: { code: '0000', reason: '操作成功' },
    responseData: { resultCode: '1001', resultDesc: '无数据', attach: '', data: null }
  });
}

// 弹窗类：可能含实名/欠费提醒，单独开关
var STUB_POPUP = /\/(?:query\/getPopUpWindows|query\/queryAdRotation)\b/i;

// 营销/装饰类：纯展示，无业务依赖
// 注意 queryHotNav / queryOffersAndBroadband 已移出 —— 有可能是「领流量」等入口所在行
var STUB_MARKETING = new RegExp([
  '\\/query\\/queryMyChannelAdvSpace',
  '\\/query\\/queryRechargeMarketing',
  '\\/query\\/queryRechargeTips',
  '\\/query\\/queryRechargeMsg',
  '\\/query\\/queryRechargerMsg',
  '\\/query\\/userActivity\\/queryActivityInfo',
  '\\/query\\/userActivity\\/queryRechagerMessage',
  '\\/query\\/getSolarTerms',
  '\\/query\\/queryBeautifulScr'
].join('|'), 'i');

function main() {
  var url = ($request && $request.url) || '';

  // ① 无用功能整接口置空（先于 body 解析）
  if (STUB_POPUP.test(url)) {
    if (on('stubPopups')) { $done({ body: stubBody() }); return; }
  } else if (STUB_MARKETING.test(url)) {
    if (on('stubMarketing')) { $done({ body: stubBody() }); return; }
  }

  if (!$response || !$response.body) { $done({}); return; }

  var obj = parseBody();
  if (!obj) { $done({}); return; }
  var d = dataOf(obj);
  if (!d || typeof d !== 'object') { $done({}); return; }

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
  } else if (/\/query\/myTravelCardNew/i.test(url)) {
    if (!on('travelHotelAd')) { $done({}); return; }
    changed = cleanTravelCard(d);
  } else {
    $done({});
    return;
  }

  if (changed) $done({ body: JSON.stringify(obj) });
  else $done({});
}

main();
