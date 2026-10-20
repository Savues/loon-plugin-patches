// IT之家去广告 · 增强版
// 修复：首页 feed（topmenu/gethomefeeds）未被处理导致轮播图/置顶/活动卡片（双11红包）漏拦截
// 2026-10-20

(() => {
    if (!$response?.body) return $done({});

    let body;
    try {
        body = JSON.parse($response.body);
    } catch (e) {
        console.log(`JSON解析失败: ${e.message}`);
        return $done({});
    }
    if (!body || typeof body !== 'object') return $done({});

    // ---------- 参数解析（兼容命名键 / 位置数组 / JSON 字符串） ----------
    let A = $argument;
    if (typeof A === 'string') {
        try { A = JSON.parse(A); } catch (e) { A = {}; }
    }
    if (!A || typeof A !== 'object') A = {};

    const pick = (key, idx, dft) => {
        let v = A[key];
        if (v === undefined && Array.isArray(A)) v = A[idx];
        if (v === undefined || v === null || v === '') return dft;
        if (typeof v === 'boolean') return v;
        return String(v).toLowerCase() === 'true' || String(v) === '1';
    };

    // 顺序与 .lpx 中 script() 的参数顺序一致
    const killCard     = pick('removeWebViewCards', 0, true);   // feedType 10004 活动 WebView 卡片（双11红包等）
    const killFeedAd   = pick('removeFeedAds',      1, true);   // 信息流广告
    const killBannerAd = pick('removeBannerAds',    2, true);   // 轮播图内的广告位
    const killBanner   = pick('removeAllBanners',   3, true);   // 整个轮播图（10002）
    const killPinned   = pick('removePinnedArticles', 4, true); // 置顶文章（10003）
    const killEc       = pick('removeEcommerceArticles', 5, true); // 电商带货文章
    const killEventCal = pick('removeEventCalendar', 6, true);      // 事件日历卡片（feedType 10029）

    // 电商带货文章特征（content HTML 内）。命中 ≥2 个不同特征即判定为带货文。
    // 实测：9 篇带货文命中 6-9 个，正常文章 0 个（2026-10-20 两份 feed 全量对照）。
    const EC_MARKERS = [
        'uland.taobao.com',               // 淘宝联盟 coupon
        'union_lens=lensId:TAPI@',         // 淘宝联盟 union_id（阿里妈妈推广专属）
        's.click.taobao.com',             // 淘宝点击跳转
        'u.jd.com',                       // 京东联盟短链
        '360buyimg.com',                  // 京东商品图 CDN
        'img.alicdn.com',                 // 阿里商品图
        'class="card main-site"',          // IT之家带货商品卡模板
        'mall-data',                      // 带货卡（商城标识）
        'card-btn-deep',                  // 带货卡按钮
        'pinduoduo.com', 'suning.com', 'kaola.com',
    ];
    const isEcommerceArticle = (fc) => {
        const c = typeof fc?.content === 'string' ? fc.content : '';
        if (!c) return false;
        let hits = 0;
        for (const m of EC_MARKERS) { if (c.includes(m)) { hits++; if (hits >= 2) return true; } }
        return false;
    };

    // 兜底：任何指向广告/活动域名的 WebView 卡片，无论 feedType
    const AD_URL = /(zuihuimai|ruanmei\.com|sclick|jd\.com|taobao\.com|tmall\.com)/i;

    let modified = false;

    // ---------- topmenu/getall：顶栏标签（关注/最新/热榜/事件/现场/发布会...） ----------
    if (data && Array.isArray(data.showTopMenus)) {
        const before = data.showTopMenus.length;
        data.showTopMenus = data.showTopMenus.filter(m => {
            const title = String(m?.title || '');
            return !['关注', '最新', '热榜', '事件', '现场', '发布会', 'IT号', '评测'].includes(title);
        });
        if (data.showTopMenus.length !== before) modified = true;
    }

    // ---------- api/appsplash/get：开屏广告 ----------
    if (data && data.list) {
        const before = data.list.length;
        data.list = data.list.filter(a => a?.type !== 'launch' && a?.type !== 'splash');
        if (data.list.length !== before) modified = true;
    }

    const list = data?.list;

    // ---------- 主列表 (feed) ----------
    if (list && Array.isArray(list)) {
        const before = data.list.length;
        data.list = data.list.filter(item => {
            const ft = item?.feedType;
            const fc = item?.feedContent || {};

            if (killBanner && ft === 10002) return false;   // 轮播图/横幅
            if (killPinned && ft === 10003) return false;   // 置顶文章
            if (killCard && ft === 10004) return false;     // 活动 WebView 卡片
            if (killEventCal && ft === 10029) return false;  // 事件日历卡片

            // 兜底：按 URL 识别活动/广告卡片
            if (killCard && typeof fc.url === 'string' && AD_URL.test(fc.url)) return false;

            // 电商带货文章（软广）
            if (killEc && isEcommerceArticle(fc)) return false;

            if (killFeedAd) {
                if (fc.flag === 2) return false;
                if (fc.isAd === true) return false;
                if (Array.isArray(fc.smallTags) &&
                    fc.smallTags.some(t => typeof t?.text === 'string' && t.text.trim() === '广告')) {
                    return false;
                }
            }
            return true;
        });
        if (data.list.length !== before) modified = true;
    }

    // ---------- 轮播图内的广告位 ----------
    const stripFocusAds = (arr) => {
        if (!Array.isArray(arr)) return arr;
        const n = arr.length;
        const out = arr.filter(ad => ad?.isAd !== true);
        if (out.length !== n) modified = true;
        return out;
    };

    if (killBannerAd) {
        if (data && Array.isArray(data.focusNewsData)) {
            data.focusNewsData = stripFocusAds(data.focusNewsData);
        }
        if (data && Array.isArray(data.list)) {
            data.list.forEach(item => {
                const fnd = item?.feedContent?.focusNewsData;
                if (Array.isArray(fnd)) item.feedContent.focusNewsData = stripFocusAds(fnd);
            });
        }
    }

    return $done(modified ? { body: JSON.stringify(body) } : {});
})();
