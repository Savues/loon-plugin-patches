// 多多进宝 · 首页营销位清理 · v0.3.0
//
// 数据源（2026-10-27 真机 HAR 实证）：
//   ① GET /network_h5/weak_auth/common/label_info
//      result.bannerList = [{title:"超级红包活动", imgUrl:"…", router:"…muti_coupon_rec.html…"}]
//      result.labelList  = [{title:"精选频道"},{title:"活动日历"}]   ← 功能入口，保留
//   ② GET /network_h5/auth/mission_system/card
//      result.missionCard = {missionClosed:true, …}                  ← 任务卡（营销位）
//
// 处理：
//   ① bannerList 置空（该位置实测只有营销 banner，labelList 不动）
//   ② missionClosed 强制 true（任务卡不弹；任务系统接口本身不动）
//
// 开关：hideBannerAds（默认开）/ closeMissionCard（默认关，任务系统是功能）

(() => {
    const ARG = (() => {
        let a = $argument;
        if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { a = {}; } }
        if (Array.isArray(a) && a.length === 1 && a[0] && typeof a[0] === 'object') a = a[0];
        return (a && typeof a === 'object') ? a : {};
    })();
    const pick = (k, idx, dflt) => {
        let v = ARG[k];
        if (v === undefined && Array.isArray(ARG)) v = ARG[idx];
        if (v === undefined || v === null || v === '') return dflt;
        if (typeof v === 'boolean') return v;
        return String(v).toLowerCase() === 'true' || String(v) === '1';
    };
    const hideBanner = pick('hideBannerAds', 0, true);
    const closeMission = pick('closeMissionCard', 1, false);
    if (!hideBanner && !closeMission) return $done({});
    if (!$response || !$response.body) return $done({});

    const url = ($request && $request.url) || '';
    let body;
    try { body = JSON.parse($response.body); } catch (e) { return $done({}); }
    if (!body || typeof body !== 'object') return $done({});

    const result = body.result;
    if (!result || typeof result !== 'object') return $done({});
    let changed = false;

    if (hideBanner && /label_info/i.test(url)) {
        if (Array.isArray(result.bannerList) && result.bannerList.length > 0) {
            result.bannerList = [];
            changed = true;
        }
    }

    if (closeMission && /mission_system\/card/i.test(url)) {
        const card = result.missionCard;
        if (card && typeof card === 'object' && card.missionClosed !== true) {
            card.missionClosed = true;
            changed = true;
        }
    }

    if (!changed) return $done({});
    console.log('[jinbao] 首页营销位已清理');
    $done({ body: JSON.stringify(body) });
})();
