/*
 * member_marketing_clean.js —— 会员页营销数据清洗（响应侧，保留结构）
 *
 * 背景（2026-10-29 HAR 实证）
 * -------------------------
 * 原 v0.1.0 用 reject_dict(200) 把这三个接口拦成 {}：
 *   /member/homepage/dailyMagicalCoupon/query          每日领券
 *   /member/homepage/marketing/featuredActivity/query  精选活动
 *   /member/homepage/marketing/SLevelBanner/query      S级横幅
 *   /member/activity/api/expose                        活动曝光
 *
 * 结果：会员页提示「活动太火爆，请稍后重试喔～」。
 * 原因：这些接口正常返回 {"code":0,"message":"成功","data":{...}}，
 *       返回 {} 后前端取不到 code，判定为服务端故障 → 弹通用错误。
 *
 * 更关键的是响应内容并非纯营销：
 *   expose        → userMemberLevel（会员等级）+ userSurpriseScoreInfo（惊喜值）
 *                   + productList（惊喜多选一奖品）+ consumptionPlanProductList
 *   SLevelBanner  → ifMember / memberLevel / memberLevelName（会员身份）
 * 拦掉它们 = 会员页拿不到会员状态。
 *
 * 本脚本策略
 * ---------
 * 只处理两个「纯营销」接口，响应侧清空内容、保留 code/message 结构：
 *   dailyMagicalCoupon → data = {}（无券可领）
 *   featuredActivity   → data.marketingResourceList = []（无活动）
 * expose 与 SLevelBanner 直接放行（承载会员等级/惊喜值，不能动）。
 *
 * 注意：每个 $done 后必须 return —— 否则后续 $done({}) 会覆盖前一次结果。
 */
(function () {
  const url = $request.url;
  const body = $response && $response.body;
  if (!body) return $done({});

  let obj;
  try {
    obj = JSON.parse(body);
  } catch (e) {
    return $done({});
  }
  if (!obj || typeof obj !== 'object') return $done({});

  let dirty = false;

  if (/dailyMagicalCoupon/i.test(url)) {
    // 每日领券：清空 data，保留 {"code":0,"message":"成功","data":{}}
    if (obj.data !== undefined) {
      obj.data = {};
      dirty = true;
    }
  } else if (/featuredActivity/i.test(url)) {
    // 精选活动：清空活动列表，保留其它字段（marketingQueryLevel 等）
    if (obj.data && typeof obj.data === 'object' && Array.isArray(obj.data.marketingResourceList)) {
      if (obj.data.marketingResourceList.length) {
        obj.data.marketingResourceList = [];
        dirty = true;
      }
    }
  }

  if (dirty) return $done({ body: JSON.stringify(obj) });
  return $done({});
})();
