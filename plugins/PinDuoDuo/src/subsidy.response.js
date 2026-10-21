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
