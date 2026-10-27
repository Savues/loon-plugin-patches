// 多多进宝 · 列表佣金比例标签 · v0.4.0
//
// ── 数据源实证（2026-10-27 三份真机 HAR，57 个去重商品）────────────────
// 全部商品列表接口都带 goodsRate（单位 0.1%）/ marketFee / marketFeeV2：
//   weak_auth/goods/query_goodslist          → result.goodsList
//   weak_auth|auth/goods/query_channel_goodslist → result.goodsList
//   auth/goods/collect/query_pdd_collects    → result.goodsList
//   auth/goods/query_similar_goods           → result.similarGoodsList
//
// ── 标签体系实证 ────────────────────────────────────────────────────
// networkUnifiedTagVO.tagDTOs[] 两种形态：
//   文本标 {jinbaoTagType:2, text:"好价再降1元", color:null, width:36, height:36}
//   图片标 {jinbaoTagType:0, text:null, url:"https://...png", width:194, height:42}
// ★ 文本标的 width:36 是服务端占位值，不参与布局（6 个汉字也是 36），
//   所以宽度预算只统计图片标。
// ★ 180 个样本里 color 全是 null（0/162 有值）→ 文本标由客户端按默认样式渲染。
//
// ── 「满」的定义（三条任一命中）────────────────────────────────────
//   ① 标签数 ≥ commissionMaxTags（实测上限 3，57 个商品无一超过）
//   ② 图片标宽度合计 ≥ 350（实测最大值 156+194=350 仍能正常显示）
//   ③ 无可牺牲标签 → 直接放弃（宁可不显示，不破坏原有利益标签）
//
// 不可牺牲：jinbaoTagType=2 的文字标（好价再降/立减）、text 非空的品牌标（旗舰店）
// 可牺牲  ：jinbaoTagType=0 且 text 为空且带 url 的纯图片标（优先牺牲最宽的）
//
// ── 无佣金判定 ──────────────────────────────────────────────────────
//   duoTagNoCommission === true / avoidCommission 非空 / goodsRate 缺失或 ≤0
//   → 显示「无佣金」；但**只在有空位时显示**，不会为此挤掉原标签。
//
// 开关：showCommission / commissionPrefix / commissionUplift / commissionMaxTags

(() => {
    const ARG = (() => {
        let a = $argument;
        if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { a = {}; } }
        if (Array.isArray(a) && a.length === 1 && a[0] && typeof a[0] === 'object') a = a[0];
        return (a && typeof a === 'object') ? a : {};
    })();
    const raw = (k, idx) => {
        let v = ARG[k];
        if (v === undefined && Array.isArray(ARG)) v = ARG[idx];
        return v;
    };
    const bool = (k, idx, dflt) => {
        const v = raw(k, idx);
        if (v === undefined || v === null || v === '') return dflt;
        if (typeof v === 'boolean') return v;
        return String(v).toLowerCase() === 'true' || String(v) === '1';
    };
    const num = (k, idx, dflt) => {
        const v = parseFloat(String(raw(k, idx)));
        return isFinite(v) && v > 0 ? v : dflt;
    };

    if (!bool('enabled', 0, true)) return $done({});            // 总开关
    if (!bool('showCommission', 1, true)) return $done({});     // 分开关
    if (!$response || !$response.body) return $done({});

    const PREFIX = (() => {
        const v = raw('commissionPrefix', 2);
        return (v === undefined || v === null) ? '佣金' : String(v);
    })();
    const UPLIFT = num('commissionUplift', 3, 1.42);            // V0 = +42%
    const MAX_TAGS = Math.round(num('commissionMaxTags', 4, 3));
    const IMG_BUDGET = 350;                                     // 实测上限
    const TAG_ID = 999900001;                                   // 幂等标记
    const NO_TEXT = '无佣金';

    // ── 接口 → 列表路径 ─────────────────────────────────────────
    const PATHS = [
        ['query_similar_goods', 'similarGoodsList'],
        ['query_channel_goodslist', 'goodsList'],
        ['query_goodslist', 'goodsList'],
        ['query_pdd_collects', 'goodsList'],
    ];
    const url = ($request && $request.url) || '';
    let listKey = null;
    for (const p of PATHS) {
        if (url.indexOf(p[0]) >= 0) { listKey = p[1]; break; }
    }
    if (!listKey) return $done({});

    let body;
    try { body = JSON.parse($response.body); } catch (e) { return $done({}); }
    const list = body && body.result && body.result[listKey];
    if (!Array.isArray(list) || list.length === 0) return $done({});

    const fmt = (p) => {
        let s = (Math.round(p * 10) / 10).toFixed(1);
        return s.replace(/\.0$/, '');
    };
    const labelOf = (it) => {
        const av = it.avoidCommission;
        const avoid = (av !== undefined && av !== null && av !== false && av !== 0);
        const noComm = it.duoTagNoCommission === true || avoid || !(Number(it.goodsRate) > 0);
        if (noComm) return NO_TEXT;
        return PREFIX + fmt(Number(it.goodsRate) / 10 * UPLIFT) + '%';
    };
    const mkTag = (text) => ({
        jinbaoTagType: 2, groupCode: null, tagSeries: 2, tagId: TAG_ID,
        text: text, color: null, url: null, width: 36, height: 36, tagJumpUrl: null,
    });

    let added = 0, swapped = 0, skipped = 0;

    for (const it of list) {
        if (!it || typeof it !== 'object') continue;
        const text = labelOf(it);

        // 容器兜底：收藏夹/相似商品的 networkUnifiedTagVO 是 null
        let vo = it.networkUnifiedTagVO;
        if (!vo || typeof vo !== 'object') {
            vo = { goodsId: it.goodsId, tagDTOs: [] };
            it.networkUnifiedTagVO = vo;
        }
        if (!Array.isArray(vo.tagDTOs)) vo.tagDTOs = [];
        const tags = vo.tagDTOs.filter((t) => t && typeof t === 'object');
        vo.tagDTOs = tags;

        // 幂等：同一商品重复请求（分页/刷新）不重复加
        if (tags.some((t) => t.tagId === TAG_ID || t.text === text)) continue;

        // ── 「满」的判定（三条命中任一即为满）：
        //   ① 标签数 ≥ MAX_TAGS
        //   ② 图片标宽度合计 ≥ IMG_BUDGET（350 = 实测能正常显示的图宽上限）
        //   ③ 追加后预计总宽 > 360（预算含余量，由 ② 覆盖）
        const imgW = (arr) => arr.reduce((s, t) => (!t.text && t.url ? s + (Number(t.width) || 0) : s), 0);
        const widestImg = (arr) => {
            let v = null;
            for (const t of arr) {
                if (t.jinbaoTagType === 0 && !t.text && t.url) {
                    if (!v || (Number(t.width) || 0) > (Number(v.width) || 0)) v = t;
                }
            }
            return v;
        };
        const isFull = (arr) => arr.length >= MAX_TAGS || imgW(arr) >= IMG_BUDGET;

        if (!isFull(tags)) {
            tags.push(mkTag(text));
            added++;
            continue;
        }

        // 满时「无佣金」不值得挤掉任何原有标签，直接放弃
        if (text === NO_TEXT) { skipped++; continue; }

        // 满：依次牺牲「纯图片标」（品牌/活动图，价值最低，最宽优先）
        // 直到标签数与图宽都腾出槽位；文字标（好价再降/旗舰店）一律不动
        let work = tags.slice();
        let removed = 0;
        while (isFull(work)) {
            const v = widestImg(work);
            if (!v) break;
            work = work.filter((t) => t !== v);
            removed++;
        }
        // 腾不出来（全是文字标）→ 放弃，宁可少显示也不挤掉用户利益
        if (isFull(work)) { skipped++; continue; }

        work.push(mkTag(text));
        vo.tagDTOs = work;
        if (removed) swapped++; else added++;
    }

    if (!added && !swapped) return $done({});
    console.log(`[jinbao] 佣金标签 追加${added} 替换${swapped} 放弃${skipped}`);
    $done({ body: JSON.stringify(body) });
})();
