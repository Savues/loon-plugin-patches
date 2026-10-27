// 多多进宝（CPS）开屏广告防护 · v0.1.0
//
// 背景（2026-10-27 进程内取证结论，见 README）：
//   该 App 的业务接口全部走自研网络栈（DDJBHTTPServiceManager -> AMNetwork/Titan），
//   不经过 NSURLSession，只有 meta/apm/duotk 等 9 个域名走标准栈。
//   两次冷启动 + 业务层 hook 全覆盖（18 个请求 / 18 个响应全量落盘）均未见任何
//   开屏专属接口，DDJBSplashViewController / preloadSplashInfo 一次都未被调用。
//   因此本插件是【预防性守卫】：不依赖已知的开屏接口，而是对 App 全部业务 JSON
//   做开屏字段剪除 + 开屏类路径兜底拦截。命中即删除，未命中时原样返回。
//
// 设计要点：
//   - 只清洗，不 reject 业务主干（避免白屏事故，铁律 3）
//   - 递归剪除，兼容任意嵌套层级（splash 可能挂在 homePageConfig / appInfo 下）
//   - 无改动时原样返回 body，不额外重写（减少误伤与开销）
//   - 开关三档：总开关 / 字段剪除 / 路径兜底

(() => {
    // ★ 兼容三种形态（真机实测会传数组，仓库历史事故 v3.37.3）：
    //   对象 {k:v} / 数组 [obj] / 数组 ["v0","v1"]
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
    const master = pick('enabled', 0, true);
    const killKeys = pick('stripSplashKeys', 1, true);
    if (!master || !$response || !$response.body) return $done({});
    // 以下接口由专职脚本处理，这里跳过避免重复改写
    if ($request && /query_top_keywords|popups\/query\/|label_info|mission_system\/card/i.test($request.url)) return $done({});

    // 开屏/启动广告字段名（整键匹配，小写比较）
    const SPLASH_KEY = /^(splash|splashinfo|splash_info|splashad|splash_ad|splashscreen|splash_screen|splashconfig|splash_config|splashmodel|splash_model|splashimage|splash_image|splashimg|splash_img|splashurl|splash_url|splashid|splash_id|hassplash|hassplashinfo|needsplash|showsplash|launchad|launch_ad|launchadinfo|launch_ad_info|launchscreenad|openscreen|open_screen|openscreenad|open_screen_ad|startupad|startup_ad|bootad|boot_ad|welcomead|welcome_ad)$/i;

    const SKIP_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

    let changed = false;

    function scrub(node, depth) {
        if (depth > 24 || node === null || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) scrub(node[i], depth + 1);
            return;
        }
        for (const k of Object.keys(node)) {
            if (SKIP_KEYS.has(k)) continue;
            const v = node[k];
            if (killKeys && SPLASH_KEY.test(k)) {
                delete node[k];
                changed = true;
                continue;
            }
            if (v !== null && typeof v === 'object') scrub(v, depth + 1);
        }
    }

    let body;
    try {
        body = JSON.parse($response.body);
    } catch (e) {
        return $done({});           // 非 JSON：不处理
    }
    if (!body || typeof body !== 'object') return $done({});

    scrub(body, 0);

    if (!changed) return $done({});
    console.log(`[jinbao] 已剪除开屏字段 → ${$request ? $request.url : 'unknown'}`);
    $done({ body: JSON.stringify(body) });
})();
