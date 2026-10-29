/*
 * member_marketing_clean.js —— 会员页营销清洗 + 会员等级自定义
 *
 * 功能一：营销内容清洗（2026-10-29 修复「活动太火爆」）
 * ---------------------------------------------------
 * 只处理两个纯营销接口，响应侧清空内容、保留 code/message 结构：
 *   dailyMagicalCoupon → data = {}
 *   featuredActivity   → data.marketingResourceList = []
 * expose 与 SLevelBanner 直接放行（承载会员等级/惊喜值/惊喜多选一，不能动）。
 *
 * 功能二：会员等级自定义（v1.5.0 新增）
 * ---------------------------------
 * 参数 memberLevel = 不修改 / 1 / 2 / 3 / 4 / 5 / 6
 * 命中 5 个下发会员等级的接口，把「当前等级」字段改成目标值：
 *   member/homepage/query                  → data.{memberLevel, memberActualLevel,
 *                                             memberLevelShow, memberLevelName, ifMember, memberSubLevel}
 *   member/activity/api/expose             → data.userMemberLevel.{memberLevel, memberSubLevel, ifMemberShip}
 *   member/homepage/products/recommend/v3  → data.{memberLevel, ifMember, memberSubLevel}
 *   marketing/featuredActivity             → data.{ifMember, memberLevel, memberSubLevel, memberLevelName}
 *   marketing/SLevelBanner                 → 同上
 *
 * ⚠️ 仅改客户端显示：服务端仍是真实等级。
 *    领券 / 权益 / 下单等校验以服务端为准，可能出现「等级不足」或降级提示。
 *    allLevelData（6 级定义表）不改，避免破坏升级进度展示。
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

  // ---------- ① 营销内容清洗 ----------
  if (/dailyMagicalCoupon/i.test(url)) {
    if (obj.data !== undefined) {
      obj.data = {};
      dirty = true;
    }
  } else if (/featuredActivity/i.test(url)) {
    if (obj.data && typeof obj.data === 'object' && Array.isArray(obj.data.marketingResourceList)) {
      if (obj.data.marketingResourceList.length) {
        obj.data.marketingResourceList = [];
        dirty = true;
      }
    }
  }

  // ---------- ② 会员等级自定义 ----------
  const A = (typeof $argument === 'string' ? {} : $argument) || {};
  const raw = String(A.memberLevel === undefined || A.memberLevel === null ? '' : A.memberLevel);
  if (raw && raw !== '不修改' && raw !== '0') {
    const target = parseInt(raw, 10);
    if (target >= 1 && target <= 6) {
      const NAMES = ['', '普通会员', '白银会员', '黄金会员', '白金会员', '黑金会员', '黑钻会员'];
      if (patchLevel(obj, target, NAMES)) dirty = true;
    }
  }

  if (dirty) return $done({ body: JSON.stringify(obj) });
  return $done({});
})();

// 递归替换「当前等级」字段；跳过 allLevelData（等级定义表）
function patchLevel(o, target, NAMES) {
  let changed = false;
  if (!o || typeof o !== 'object') return false;

  if (Array.isArray(o)) {
    for (const x of o) {
      if (patchLevel(x, target, NAMES)) changed = true;
    }
    return changed;
  }

  for (const k of Object.keys(o)) {
    if (k === 'allLevelData') continue; // 等级定义表，不动
    const v = o[k];

    if (k === 'memberLevel' || k === 'memberActualLevel' || k === 'memberSubLevel' || k === 'memberActualSubLevel') {
      const n = parseInt(v, 10);
      if (!isNaN(n) && n !== target) {
        o[k] = target;
        changed = true;
      }
    } else if (k === 'memberLevelShow') {
      const nv = 'V' + target;
      if (v !== nv) {
        o[k] = nv;
        changed = true;
      }
    } else if (k === 'memberLevelName') {
      const nv = NAMES[target];
      if (v !== nv) {
        o[k] = nv;
        changed = true;
      }
    } else if (k === 'ifMember' || k === 'ifMemberShip') {
      if (v !== true) {
        o[k] = true;
        changed = true;
      }
    } else if (v && typeof v === 'object') {
      if (patchLevel(v, target, NAMES)) changed = true;
    }
  }
  return changed;
}
