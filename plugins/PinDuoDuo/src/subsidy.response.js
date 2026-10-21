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
