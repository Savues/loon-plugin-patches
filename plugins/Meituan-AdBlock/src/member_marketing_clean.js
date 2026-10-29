/*
 * member_marketing_clean.js —— 会员页营销清洗 + 会员等级自定义
 *
 * 功能一：营销内容清洗（2026-10-29 修复「活动太火爆」）
 *   dailyMagicalCoupon → data = {}
 *   featuredActivity   → data.marketingResourceList = []
 *
 * 功能二：会员等级自定义（v1.5.x）
 *   参数 memberLevel = 不修改 / 1~6
 *
 * 关键发现（2026-10-29 真机 HAR 实证）
 * ---------------------------------
 * 只改 data.memberLevel 等字段，前端 UI 不变！因为前端判断「当前等级」用的是
 * allLevelData[] 里的 realLevelCompare（0 = 当前，-1 = 未达到）。
 * 必须把目标等级的 realLevelCompare 改成 0，其余改成 -1，UI 才会跟着变。
 *
 * 同时「当前等级」还带一组状态字段（有效期、保级标记、成长值），
 * 这些只挂在真实当前等级上，需要迁移到目标等级，否则 UI 会缺信息。
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

// 递归改写「当前等级」字段；allLevelData 走专门的迁移逻辑
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
    const v = o[k];

    // allLevelData：等级定义表，需要迁移「当前等级」标记，而不是改定义
    if (k === 'allLevelData' && Array.isArray(v)) {
      if (patchAllLevelData(v, target)) changed = true;
      continue;
    }

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

// 迁移 allLevelData 的「当前等级」标记
// realLevelCompare: 0 = 当前等级, -1 = 未达到（前端据此判断，必须改）
// 同时把真实当前等级上的状态字段（有效期 / 保级 / 成长值）搬到目标等级
function patchAllLevelData(arr, target) {
  let changed = false;

  // 找到真实当前等级项（realLevelCompare === 0）
  let src = null;
  for (const it of arr) {
    if (it && typeof it === 'object' && it.realLevelCompare === 0) {
      src = it;
      break;
    }
  }

  // ⚠️ 先快照 src 的状态字段 —— 遍历时可能先清空 src，再迁移就会拿到 null
  const snap = src ? {
    levelStrategyTypeInfo: src.levelStrategyTypeInfo,
    levelStrategyType: src.levelStrategyType,
    retainLevelFlag: src.retainLevelFlag,
    growthValue: src.growthInfo ? src.growthInfo.growthValue : null,
    growthValueStart: src.growthInfo ? src.growthInfo.growthValueStart : null,
  } : null;

  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const lv = parseInt(it.memberLevel, 10);
    if (isNaN(lv)) continue;

    const shouldBeCurrent = lv === target;
    const wantCmp = shouldBeCurrent ? 0 : -1;
    if (it.realLevelCompare !== wantCmp) {
      it.realLevelCompare = wantCmp;
      changed = true;
    }

    if (shouldBeCurrent) {
      // 目标等级：补上「当前等级」才有的状态字段（用快照，避免 src 已被清空）
      if (snap && src !== it) {
        if (snap.levelStrategyTypeInfo && it.levelStrategyTypeInfo !== snap.levelStrategyTypeInfo) {
          it.levelStrategyTypeInfo = snap.levelStrategyTypeInfo;
          changed = true;
        }
        if (snap.levelStrategyType !== undefined && it.levelStrategyType !== snap.levelStrategyType) {
          it.levelStrategyType = snap.levelStrategyType;
          changed = true;
        }
        if (snap.retainLevelFlag !== undefined && it.retainLevelFlag !== snap.retainLevelFlag) {
          it.retainLevelFlag = snap.retainLevelFlag;
          changed = true;
        }
        // 成长值：目标等级原本 growthValue 为 null（未达到），补上真实成长值
        if (it.growthInfo && it.growthInfo.growthValue === null && snap.growthValue !== null && snap.growthValue !== undefined) {
          it.growthInfo.growthValue = snap.growthValue;
          it.growthInfo.growthValueStart = snap.growthValueStart;
          changed = true;
        }
      }
    } else if (src === it) {
      // 原当前等级：清掉「当前」标记
      if (it.levelStrategyTypeInfo !== null) {
        it.levelStrategyTypeInfo = null;
        changed = true;
      }
      if (it.retainLevelFlag !== null) {
        it.retainLevelFlag = null;
        changed = true;
      }
      if (it.growthInfo && it.growthInfo.growthValue !== null) {
        it.growthInfo.growthValue = null;
        it.growthInfo.growthValueStart = null;
        changed = true;
      }
    }
  }
  return changed;
}
