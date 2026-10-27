// 多多进宝 · 弹窗屏蔽 · v0.3.0
//
// 数据源（2026-10-27 真机 HAR 实证）：
//   ① GET /network_h5/auth/popups/query/pop_window_info
//      → {"success":true,"errorCode":1000000,"result":{"popupWindow":false,
//         "popupsContentVOList":[],"type":null,"popupsGoods":null}}
//   ② GET /network_h5/auth/popups/query/exclusive_info   （同结构）
//   ③ GET /network_h5/auth/popups/query/mutuality_exclusive_type
//      → {"result":{"type":[1,11,9,7]}}   ← 允许弹出的互斥弹窗类型表
//
// 处理：
//   ①② 强制 popupWindow=false / 列表清空 / 商品置空
//   ③  type 置空数组 → 互斥弹窗全部失去「允许弹出」资格
//   保留 success/errorCode 原值，App 不会弹错误提示。
//
// 开关：killPopups（默认开）

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
    if (!pick('enabled', 0, true)) return $done({});          // 总开关
    if (!pick('killPopups', 1, true)) return $done({});
    if (!$response || !$response.body) return $done({});

    const url = ($request && $request.url) || '';
    let body;
    try { body = JSON.parse($response.body); } catch (e) { return $done({}); }
    if (!body || typeof body !== 'object') return $done({});

    const result = body.result;
    if (!result || typeof result !== 'object') return $done({});
    let changed = false;

    if (/mutuality_exclusive_type/i.test(url)) {
        // 互斥类型表：置空 = 不允许任何互斥弹窗
        if (Array.isArray(result.type) && result.type.length > 0) {
            result.type = [];
            changed = true;
        }
    } else if (/pop_window_info|exclusive_info/i.test(url)) {
        // ① 已知字段显式处理
        if (result.popupWindow !== false) { result.popupWindow = false; changed = true; }
        if (Array.isArray(result.popupsContentVOList) && result.popupsContentVOList.length > 0) {
            result.popupsContentVOList = [];
            changed = true;
        }
        if (result.popupsGoods) { result.popupsGoods = null; changed = true; }

        // ② 兜底：服务端改字段名时也能清干净
        //    该接口 result 的唯一用途就是「弹窗载荷」，所以除开关类白名单外，
        //    任何非空数组 / 非空对象 / 图片链接字符串一律清空。
        //    开关类字段一律压成「无弹窗」语义（布尔→false，类型→null）。
        const BOOL_KEYS = ['popupWindow', 'hasPopup', 'showPopup', 'needPopup'];
        const TYPE_KEYS = ['type', 'popupType', 'dialogType'];
        for (const k of BOOL_KEYS) {
            if (result[k] !== undefined && result[k] !== false) { result[k] = false; changed = true; }
        }
        for (const k of TYPE_KEYS) {
            if (result[k] !== undefined && result[k] !== null) { result[k] = null; changed = true; }
        }
        const KEEP = {};
        for (const k of BOOL_KEYS.concat(TYPE_KEYS)) KEEP[k] = 1;
        for (const k of Object.keys(result)) {
            if (KEEP[k]) continue;
            const v = result[k];
            if (Array.isArray(v) && v.length > 0) { result[k] = []; changed = true; }
            else if (v && typeof v === 'object' && Object.keys(v).length > 0) { result[k] = null; changed = true; }
            else if (typeof v === 'string' && /^https?:\/\//i.test(v)) { result[k] = ''; changed = true; }
        }
    }

    if (!changed) return $done({});
    console.log('[jinbao] 弹窗已屏蔽');
    $done({ body: JSON.stringify(body) });
})();
