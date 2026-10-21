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
