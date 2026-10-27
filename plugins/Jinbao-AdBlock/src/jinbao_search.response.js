// 多多进宝 · 搜索框「热门搜索」屏蔽 · v0.2.0
//
// 数据源（2026-10-27 真机 HAR 实证，第 4 条请求）：
//   GET https://jinbaoh5.pinduoduo.com/network_h5/auth/goods/query_top_keywords
//   → {"success":true,"errorCode":1000000,"errorMsg":null,
//      "result":["裤子","飞天茅台","猫砂","富士xm5","华为mate80","蓝牙耳机","外套","一加ace6t","牛奶","卫生纸"]}
//
// 处理策略：result 置空数组。保留 success/errorCode 原值，
//   App 侧不会弹错误提示，搜索框只显示输入历史/不再渲染热门词块。
//
// 开关：hideHotSearch（默认开）—— 关掉后原样返回。

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
    if (!pick('hideHotSearch', 1, true)) return $done({});
    if (!$response || !$response.body) return $done({});

    let body;
    try {
        body = JSON.parse($response.body);
    } catch (e) {
        return $done({});
    }
    if (!body || typeof body !== 'object') return $done({});

    // 只处理「热词列表」语义：result 是字符串数组
    if (!Array.isArray(body.result)) return $done({});
    if (body.result.length === 0) return $done({});

    const n = body.result.length;
    body.result = [];
    console.log(`[jinbao] 热门搜索已清空（${n} 条）`);
    $done({ body: JSON.stringify(body) });
})();
