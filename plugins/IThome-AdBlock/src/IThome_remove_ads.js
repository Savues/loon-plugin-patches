// IT之家去广告 · 增强版 v1.3
// 修复：首页 feed（topmenu/gethomefeeds）未被处理导致轮播图/置顶/活动卡片（双11红包）漏拦截
// 新增：顶栏标签过滤(topmenu/getall)、开屏广告拦截(api/appsplash/get)、电商带货文过滤、事件日历卡片过滤
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

    const killCard     = pick('removeWebViewCards', 0, true);
    const killFeedAd   = pick('removeFeedAds',      1, true);
    const killBannerAd = pick('removeBannerAds',    2, true);
    const killBanner   = pick('removeAllBanners',   3, true);
    const killPinned   = pick('removePinnedArticles', 4, true);
    const killEc       = pick('removeEcommerceArticles', 5, true);
    const killEventCal = pick('removeEventCalendar', 6, true);
    const hideTopbar   = pick('hideTopbarCompletely', 7, false); // 完全隐藏顶栏

    // 电商带货文章特征（content HTML 内）。命中 ≥2 个不同特征即判定为带货文。
    const EC_MARKERS = [
        'uland.taobao.com', 'union_lens=lensId:TAPI@', 's.click.taobao.com', 'u.jd.com',
        '360buyimg.com', 'img.alicdn.com', 'class="card main-site"', 'mall-data', 'card-btn-deep',
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
    const data = body.data;

    // ---------- topmenu/getall：顶栏标签（关注/最新/热榜/事件/现场/发布会/IT号/评测/5G/鸿蒙/阳台/手机/数码家电/学院/VR/车/电脑/好物推荐/Win11...） ----------
    // 服务端把正常标签移到 hideTopMenus，showTopMenus 只剩促销项（11.11、自动识别本机/苹果等）。
    // 策略：仅当 hideTopMenus 里包含核心标签（最新/关注/热榜/事件）时才做合并恢复；
    //       否则保留服务端原响应，只过滤 showTopMenus 里的促销项，避免核心标签丢失。
    //       兜底：过滤后若少于 3 个标签，说明服务端没给核心标签，放弃修改，保留原响应。
    // 用户可选：完全隐藏顶栏但保留"最新"内容 —— 将 showTopMenus 置空，App 会回退加载 gethomefeeds（最新）作为默认内容。
    if (hideTopbar) {
        if (data && Array.isArray(data.showTopMenus)) {
            data.showTopMenus = [];
            modified = true;
        }
    } else {
        // 原有过滤逻辑
        if (data && Array.isArray(data.showTopMenus)) {
            const coreTitles = new Set(['最新', '关注', '热榜', '事件', '现场', '发布会', 'IT号', '评测']);
            const promoTitles = new Set(['11.11', '自动识别本机 (苹果)', '品牌', '热评']);

            const show = data.showTopMenus || [];
            const hide = data.hideTopMenus || [];

            // 检查 hideTopMenus 是否包含核心标签
            const hideHasCore = hide.some(m => coreTitles.has(String(m?.title || '')));

            let unique;
            if (hideHasCore) {
                // 情况 A：hideTopMenus 有核心标签 → 合并恢复
                const keepTitles = new Set([...coreTitles, '5G', '鸿蒙', '阳台', '手机', '数码家电', '学院', 'VR', '车', '电脑', '好物推荐', 'Win11',
                    'Windows', 'AI', '游戏电竞', '科普', '安卓', 'Linux', '行业前沿', '网络焦点', '投票', '专题']);
                const restored = hide.filter(m => keepTitles.has(String(m?.title || '')));
                const kept = show.filter(m => keepTitles.has(String(m?.title || '')));
                const merged = [...kept, ...restored];
                const seen = new Set();
                unique = merged.filter(m => { const id = m?.id; if (seen.has(id)) return false; seen.add(id); return true; });
            } else {
                // 情况 B：hideTopMenus 无核心标签 → 仅过滤 showTopMenus 里的促销项，保留其余
                unique = show.filter(m => !promoTitles.has(String(m?.title || '')));
            }

            // 兜底：过滤后若少于 3 个标签，说明服务端没给核心标签，放弃修改，保留原响应
            if (unique.length >= 3 && unique.length !== show.length) {
                data.showTopMenus = unique;
                modified = true;
            }
        }
    }  // end else (hideTopbar)

    // ---------- api/appsplash/get：开屏广告 ----------
    if (data && Array.isArray(data.list)) {
        const before = data.list.length;
        data.list = data.list.filter(a => a?.type !== 'launch' && a?.type !== 'splash');
        if (data.list.length !== before) modified = true;
    }

    // ---------- 主列表 (feed) ----------
    let list = data?.list;
    if (list && Array.isArray(list)) {
        const before = list.length;
        list = list.filter(item => {
            const ft = item?.feedType;
            const fc = item?.feedContent || {};

            if (killBanner && ft === 10002) return false;
            if (killPinned && ft === 10003) return false;
            if (killCard && ft === 10004) return false;
            if (killEventCal && ft === 10029) return false;

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
        if (list.length !== before) modified = true;
        data.list = list;
    }

    // ---------- 轮播图内的广告位 ----------
    if (killBannerAd) {
        if (data && Array.isArray(data.focusNewsData)) {
            const n = data.focusNewsData.length;
            data.focusNewsData = data.focusNewsData.filter(ad => ad?.isAd !== true);
            if (data.focusNewsData.length !== n) modified = true;
        }
        if (data && Array.isArray(data.list)) {
            data.list.forEach(item => {
                const fnd = item?.feedContent?.focusNewsData;
                if (Array.isArray(fnd)) {
                    const n = fnd.length;
                    item.feedContent.focusNewsData = fnd.filter(ad => ad?.isAd !== true);
                    if (item.feedContent.focusNewsData.length !== n) modified = true;
                }
            });
        }
    }

    return $done(modified ? { body: JSON.stringify(body) } : {});
})();