/*
 * subsidy.response.js —— 百亿补贴页处理（自研脚本）
 *
 * 页面 https://m.pinduoduo.net/brand_activity_subsidy.html 是服务端渲染的 HTML。
 *
 * 职责 1（v1.6 起）：搜索框去推广词
 *   轮播词不在任何 API 里，而是内联在 window.rawData 的 store.searchStore：
 *   "searchStore":{"enable":true,"style":1,"queryWords":["百事可乐","可口可乐",…]}
 *   实测 10 个词里 5 个是推广。字符串级替换，不重排整页。
 *
 * 职责 2（v1.79 起，方案 1+2，用户确认一起做）：百补列表页广告打标
 *   2026-10-21 两份快照实测：rawData.store.tabStore.tabList[*].subTabGoodsLists
 *   [*].list[*] 里 23 个商品有 4 个带 `ad` 字段（转义 JSON 字符串，
 *   bkfl=1 + openinfo.ad_id，与信息流 data.ad 完全同构）——百补列表里混着
 *   竞价广告，且此前无任何标识。
 *
 *   方案 1（确定收益）：把广告商品的 goodsId 并进 $persistentStore 的
 *   pddAdGoodsIds 名单（环形 200，write(value,key) 值在前——仓库踩过的坑），
 *   详情页 detail.response.js 查名单自动打标（复用 v1.77 链路）。
 *
 *   方案 2（tagInfoList 打标）已于 v1.80 移除：2026-10-21 真机实测注入成功
 *   （响应数据层 4 个标签全在）但列表页不可见 —— H5 卡片渲染器不消费
 *   我们注入的该标签，属死代码。
 *
 *   v1.81 三通道打标（用户确认全上，真机消融后收敛）——改广告商品：
 *     ① activityPriceWord  价格正前方「券后」→「广告·券后」（用户点名的位置）
 *     ② salesTip           卡片销量行「已抢3680件」→「广告·已抢3680件」
 *     ③ titleTop 头部插红底白字「广告」PNG（托管本仓库 assets/ad-badge.png，
 *       与官方百亿补贴徽章同槽位 530×150）——需要真机验证 H5 是否加载
 *       非拼多多域名的图片；不渲染也无副作用。
 *
 *   解析失败（如另一页面形态 stores、骨架屏）→ 职责 2 整体跳过，职责 1 照常。
 *
 * 开关：search_stub 管职责 1；feed_ad 管职责 2（与信息流/详情页打标同开关）。
 */

const A = (typeof $argument === 'string' ? {} : $argument) || {};
const on = (v) => v === true || v === 1 || v === 'true' || v === '1' || v === 'on' || v === 'ON';

const AD_KEY = 'pddAdGoodsIds';
const AD_CAP = 200;
const AD_PREFIX = '广告·';
// 徽章托管：v1.85 起 jsdelivr CDN（国内可达）—— raw.githubusercontent.com
// 在部分线路上不可达，iPad 实测徽章图加载失败出现 WebKit 碎图占位符
// v1.88：徽章内联为 data URI（零网络依赖）——jsdelivr @main 有缓存延迟
// （曾把旧 530×150 缓存了一天），raw.githubusercontent 部分线路不可达，
// data URI 彻底消除 CDN/缓存/设备差异。资产源文件仍在 src/assets/ 备查。
const AD_BADGE_URL = 'data:image/png;base64,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';
const AD_BADGE = { text: '广告', type: 'area_ad_mark_selfhost', url: AD_BADGE_URL };

// ── $persistentStore 名单合并（write(value, key)，值在前——仓库踩过的坑）──
function mergeIds(newIds) {
  try {
    let prev = [];
    try {
      const raw = $persistentStore.read(AD_KEY);
      const arr = raw ? JSON.parse(String(raw)) : [];
      if (Array.isArray(arr)) prev = arr.map(String);
    } catch (e) { prev = []; }
    const now = [];
    for (const id of newIds) if (now.indexOf(id) === -1) now.push(id);
    for (const id of prev) if (now.indexOf(id) === -1 && now.length < AD_CAP) now.push(id);
    $persistentStore.write(JSON.stringify(now), AD_KEY);
  } catch (e) { /* 存储不可用不阻断 */ }
}

// 定位 window.rawData 的对象边界并解析（括号配对，处理字符串内转义）
function parseRawData(body) {
  const i = body.indexOf('window.rawData');
  if (i === -1) return null;
  const j = body.indexOf('{', i);
  if (j === -1) return null;
  let depth = 0, instr = false, esc = false;
  for (let k = j; k < body.length; k++) {
    const ch = body[k];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (instr) { if (ch === '"') instr = false; continue; }
    if (ch === '"') instr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { try { return { obj: JSON.parse(body.slice(j, k + 1)), start: j, end: k + 1 }; } catch (e) { return null; } } }
  }
  return null;
}

// 从 rawData 里收集带 ad 字段的商品
// 已知三种形态（均为实测）：
//   raw.store.tabStore…                    brand_activity_subsidy.html 旧模板
//   raw.stores.store.tabStore…             tandy_vase.html 新模板（stores 是 dict）
//   raw.stores[i].store.tabStore…          数组形态（容错预留）
function collectAdGoods(raw) {
  const out = [];
  const stores = [];
  const pushStore = (st) => { if (st && typeof st === 'object' && st.tabStore) stores.push(st); };
  if (raw && raw.store) pushStore(raw.store);
  if (raw && raw.stores) {
    if (Array.isArray(raw.stores)) {
      for (const s of raw.stores) pushStore(s);
    } else if (typeof raw.stores === 'object') {
      pushStore(raw.stores);
      pushStore(raw.stores.store);   // tandy_vase 实测：{ store: {…} }
    }
  }
  for (const st of stores) {
    const tl = st.tabStore && Array.isArray(st.tabStore.tabList) ? st.tabStore.tabList : [];
    for (const t of tl) {
      const sls = t && Array.isArray(t.subTabGoodsLists) ? t.subTabGoodsLists : [];
      for (const s of sls) {
        const list = s && Array.isArray(s.list) ? s.list : [];
        for (const g of list) {
          if (g && typeof g === 'object' && typeof g.ad === 'string' && g.goodsId !== undefined) {
            out.push(g);
          }
        }
      }
    }
  }
  return out;
}

try {
  let body = $response.body;
  if (!body) { $done({}); return; }

  // ── 职责 1：搜索框去推广词（search_stub）──────────────────
  if (on(A.search_stub)) {
    const out = body
      .replace(/("queryWords"\s*:\s*)\[[^\]]*\]/, '$1[]')
      .replace(/("queryGuideWord"\s*:\s*)"[^"]*"/, '$1""');
    if (out !== body) body = out;
  }

  // ── 职责 2：百补列表页广告（feed_ad）────────────────────
  if (on(A.feed_ad) && typeof $persistentStore !== 'undefined') {
    const parsed = parseRawData(body);
    if (parsed) {
      try {
        const goods = collectAdGoods(parsed.obj);
        if (goods.length) {
          // 方案 1：名单入库（详情页打标依赖它）
          const ids = goods.map((g) => String(g.goodsId)).filter((x) => x && x !== 'undefined');
          if (ids.length) mergeIds(ids);

          // v1.87（用户确认）：只保留图片角标（商品图左上角）——
          // ① 价格词/② 销量行/③ titleTop 三通道真机证伪（列表不可见/冗余），
          // 全部移除；goodsFlagIcon/ltIcon 真机验证可见（手机+平板）。
          let touched = 0;
          for (const g of goods) {
            // 通道④：goodsFlagIcon（原生徽章数组，头部插入，组件按行渲染）
            // 通道⑤：ltIcon 是【单个 URL 字符串】，组件会 join(',') 拼数组——
            //   v1.83 曾把它转成数组导致拼出 `badge.png,原URL` 的 404 碎图
            //   （iPad 实测）。改为直接替换成徽章 URL：左上角的促销图标
            //   原本就占着这个位置，换成「广告」徽章意图更明确。
            if (!Array.isArray(g.goodsFlagIcon)) g.goodsFlagIcon = [];
            if (g.goodsFlagIcon.indexOf(AD_BADGE_URL) === -1) {
              g.goodsFlagIcon.unshift(AD_BADGE_URL); touched++;
            }
            if (typeof g.ltIcon === 'string') {
              if (g.ltIcon !== AD_BADGE_URL) { g.ltIcon = AD_BADGE_URL; touched++; }
            } else if (Array.isArray(g.ltIcon)) {
              // 容错：若上游某天改成数组，替换首元素而不是 join 炸弹
              if (g.ltIcon[0] !== AD_BADGE_URL) { g.ltIcon[0] = AD_BADGE_URL; touched++; }
            }
          }

          if (touched) {
            const next = body.slice(0, parsed.start) + JSON.stringify(parsed.obj) + body.slice(parsed.end);
            if (next !== body) body = next;
          }
        }
      } catch (e) { /* 职责 2 失败不影响职责 1 */ }
    }
  }

  $done(body === $response.body ? {} : { body });
} catch (e) {
  // 兜底：出错一律放行，绝不因脚本问题让百亿补贴页打不开
  $done({});
}
