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
 *   v1.81~v1.93 三通道打标，真机消融后只剩「图片角标」一条。
 *   v1.94（2026-10-22 手机版复现「百补列表看不到广告角标」）——通道重定位：
 *     角标只写 ltIcon（商品图左上角官方角标槽）：
 *       · 手机版列表页 tandy_vase.html 的商品原本**没有 ltIcon 字段**，
 *         旧逻辑只替换已有字符串 → 手机上无处可写；
 *       · goodsFlagIcon 是标题旗标槽，CSS height:.15rem ≈15px，
 *         横幅「广告」在手机上被压到 ~10px 高 → 看不见（iPad 看得见）；
 *       · ltIcon 槽位 CSS .ilx1YR3r{height:.52rem;width:.46rem} ≈46×52px，
 *         官方角标位，配竖版资产 184×208（比例 0.885 = 0.46/0.52）刚好不畸变。
 *     资产：src/assets/ad-badge.png（半透明黑底 + 浅灰白字「广告」竖排），
 *     生成脚本 tools/make-badge.py（corner/wide 两种版式）。
 *
 *   解析失败（如另一页面形态 stores、骨架屏）→ 职责 2 整体跳过，职责 1 照常。
 *
 * 开关：search_stub 管职责 1；feed_ad 管职责 2（与信息流/详情页打标同开关）。
 */

const A = (function (raw) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = {}; } }
  if (Array.isArray(v)) {
    const merged = {};
    for (let i = 0; i < v.length; i++) {
      const it = v[i];
      if (it && typeof it === 'object' && !Array.isArray(it)) for (const k in it) merged[k] = it[k];
    }
    v = merged;
  }
  return (v && typeof v === 'object') ? v : {};
})($argument);
const on = (v) => v === true || v === 1 || v === 'true' || v === '1' || v === 'on' || v === 'ON';

const AD_KEY = 'pddAdGoodsIds';
const AD_CAP = 200;
const AD_PREFIX = '广告·';
// 徽章托管：v1.85 起 jsdelivr CDN（国内可达）—— raw.githubusercontent.com
// 在部分线路上不可达，iPad 实测徽章图加载失败出现 WebKit 碎图占位符
// v1.88：徽章内联为 data URI（零网络依赖）——jsdelivr @main 有缓存延迟
// （曾把旧 530×150 缓存了一天），raw.githubusercontent 部分线路不可达，
// data URI 彻底消除 CDN/缓存/设备差异。资产源文件仍在 src/assets/ 备查。
const AD_BADGE_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALgAAADQCAYAAAC0lKvwAAAACXBIWXMAAAsTAAALEwEAmpwYAAAFMUlEQVR4nO3dT2hV2QEH4FMSeGh4CdqQRp9VUmoqTiGZkSA4WLSCIgoBhYBQEeIsdJMs3ChCtiqCCxdZ6KbSjUSySGxWyabNn2KmWi0pdsiA1UkmeRgzkzyiZvBBF53Im0xsZuJ79yV3vg+yOPeee85Z/Ljce865LyEAAAAAAAAAAAAAAAAAQF78LM/tfRJCKM9zm2vd3779owhKiz0AKCQBJ9YEnFgTcGJNwIm1VR3w+vr65L59+34xPDz8Ymho6KtC99Xc3LxjoZzJZOYvXrz4z0L2SeGtuoBv3759/bVr1363bdu26rKysvUhhDA0NDQyNDT01/dt+8GDB39Ip9Nfj4yMfNnf3z/e3d2dXjhXW1tbfuTIkYaF8szMzKyAr32rLuCjo6MvU6lU5UK4Qwhh165d25PJ5GAmk8mutN0zZ87UVFRUlFdUVJTX1tZuPXTo0Mvu7u4/5mXQrFqrLuAhhHDv3r3PDx48+NFCOZFIJI4dO5a6devWs5W22djY+EFueXBw8N/vM0bWhkhXMm/fvv37hoaGHe86nw/Hjx//08OHDzO5x+rr65OdnZ0nc49NTk5OvXr1an6hvG7dukR1dXXlQjmbzb559uxZOizj6dOnU6dPnx78P1WsZBbRqryD59u5c+c+XHwsN8xLKSkpKa2pqUkVblREIfYBb2pqSu3Zs+e3xR4HxVHUgL948eKr2dnZl/lsc25u7u2LaDKZLDl//vz+3PNjY2OTjx49+mLxdVVVVcncx6f5+fn5vr6+ZWdRxsfHM8vVoXiKGvDOzs5/XLlypWAve+3t7R9XVFS8fSfIZrNvWltbexc/o4fwvzt9bsBfv34939LS8mmhxkY0Yv2IMjg4+EVdXd2vFqYcu7q6/r5UuImv2Aa8vr4+OT09/U17e/tfTpw48eGGDRvKR0ZGppqampZ8cayrq/t5brm0tLT0XXWX0t/fPzUxMTG/fE2iFNuANzc378hdmQwhhLa2tqM/9PqysrL1ly5davyh9S9cuNDV0dEx/mPGSOHFNuAQgoATc7ENeEtLy6dmQYhtwCGEIgf8yZMnkUzZnTp1auvJkye/t1z/vs6ePds7Ojqa14Uq8ivSgFdWViaj7G9BdXX1+kLsKykrKyvJd5vkV6QBr6qq2pBbHhsbc/ejoCIL+KZNmxK5HzFks9k3hf4M7V1mZmZmp6enf/Tj0ebNmysTiUSiEGOiMCIL+N69e7+zPfX58+dfR9X3YgMDA5+tZIalr6+v0RbatSWygO/fv/+XueV0Ol2Uuzc/LZEFfPfu3b/OLT9+/HjZr2XgfUUS8KamplTuttUQQrhz586TKPpeys6dOzdfv369Yfma37Vx48aizAKxcpEEvLW19ePc8tjY2GQxt63W1NSkPEv/NBQ84G1tbR8s/v5xeHj4P4XuF0KIIOA3b978/MCBA7/ZsmVLdQghzM3Nvbxx44afbCASBQ/4xMTE/NGjR7s6OjoO19bWbr179+6DYi9v9/T0rGgjlmnCtSeSZ/BMJpM9fPjwn69evfrR5cuX/xVFn7nu378/1dPT8zbQAwMDX66knd7e3s9SqdTba9Pp9Df5GB+F41+YFJ4f/iki22WJNQEn1gScWBNwYk3AiTUBBwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIC7+C6+eaEibysy2AAAAAElFTkSuQmCC';
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
// ── 佣金查询（消费券栏目用，与首页/百补共用 pddCpsCache）────────
const CPS_LB = on(A.cps_label);
const CPS_TOKEN = (typeof A.cps_token === 'string') ? A.cps_token.trim() : '';
const CPS_API = 'https://dtkapi.ffquan.cn/taobaoapi/parsing-content-three-in-one';
const CPS_BATCH = 20;
const CPS_CACHE_KEY = 'pddCpsCache';
const CPS_CACHE_CAP = 300;
// v2.66：HUD 佣金账本（真佣金明细 + 转链统计）
// 真相源只有大淘客：dtk 返回 rate>0 的商品才算「真佣金」，记 name/price/amount
// 进 pddHudLedger；每次调用的计数进 pddHudStats。HTML 注入时快照进页面。
const HUD_STATS_KEY = 'pddHudStats';
const HUD_LEDGER_KEY = 'pddHudLedger';
const HUD_LEDGER_CAP = 60;

function hudStatsLoad() {
  try {
    if (typeof $persistentStore === 'undefined') return null;
    const raw = $persistentStore.read(HUD_STATS_KEY);
    const o = raw ? JSON.parse(String(raw)) : null;
    return (o && typeof o === 'object') ? o : null;
  } catch (e) { return null; }
}

function hudStatsSave(s) {
  try {
    if (typeof $persistentStore === 'undefined') return;
    $persistentStore.write(JSON.stringify(s), HUD_STATS_KEY);
  } catch (e) { /* ignore */ }
}

// 转链统计：tr=总请求条数 tats=不支持的（code=0）ok=成功条数（code=1）pos=真佣金（rate>0）
// 另：ch/ca = 消费券删零缓存 hit/all（cps_label 分支）
function hudStatsBump(delta) {
  const d = delta || {};
  const s = hudStatsLoad() || { c: 0, tr: 0, tok: 0, tpos: 0, tf: 0, ch: 0, ca: 0 };
  for (const k of Object.keys(d)) {
    const v = parseInt(d[k], 10);
    if (v) s[k] = (s[k] || 0) + v;
  }
  hudStatsSave(s);
  return s;
}

function hudLedgerLoad() {
  try {
    if (typeof $persistentStore === 'undefined') return null;
    const raw = $persistentStore.read(HUD_LEDGER_KEY);
    const o = raw ? JSON.parse(String(raw)) : null;
    return (o && typeof o === 'object') && !Array.isArray(o) ? o : null;
  } catch (e) { return null; }
}

function hudLedgerSave(o) {
  try {
    if (typeof $persistentStore === 'undefined') return;
    const keys = Object.keys(o);
    if (keys.length > HUD_LEDGER_CAP) {
      keys.sort((a, b) => (o[a].t || 0) - (o[b].t || 0));
      for (let i = 0; i < keys.length - HUD_LEDGER_CAP; i++) delete o[keys[i]];
    }
    $persistentStore.write(JSON.stringify(o), HUD_LEDGER_KEY);
  } catch (e) { /* ignore */ }
}
const CPS_CACHE_TTL = (function () {
  const v = parseInt(A.cps_ttl, 10);
  return v > 0 ? v : 21600;
})();

function fmtRate(v) { return String(Math.round(v * 10) / 10); }

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function cacheLoad() {
  try {
    if (typeof $persistentStore === 'undefined') return {};
    const raw = $persistentStore.read(CPS_CACHE_KEY);
    const o = raw ? JSON.parse(String(raw)) : {};
    return (o && typeof o === 'object') ? o : {};
  } catch (e) { return {}; }
}

function cacheSave(o) {
  try {
    if (typeof $persistentStore === 'undefined') return;
    const keys = Object.keys(o);
    if (keys.length > CPS_CACHE_CAP) {
      keys.sort((a, b) => (o[a].t || 0) - (o[b].t || 0));
      for (let i = 0; i < keys.length - CPS_CACHE_CAP; i++) delete o[keys[i]];
    }
    $persistentStore.write(JSON.stringify(o), CPS_CACHE_KEY);
  } catch (e) { /* 忽略 */ }
}

function cacheFresh(rec) {
  if (!rec || typeof rec !== 'object') return false;
  const t = rec.t || 0;
  const now = Math.floor(Date.now() / 1000);
  if (now - t > CPS_CACHE_TTL) return false;
  if (t < todayStart()) return false;
  return true;
}

// v2.27：CPS 链接改写（与 feed.response.js 同一套逻辑，默认开启）
// 拼多多自购比价规则要求第一次点击就落在 CPS 链路上，否则事后转链也不计佣金。
const CPS_RW = (function () {
  const v = A.cps_rewrite;
  if (v === undefined || v === null || v === '') return true;   // 默认开启
  return v === true || v === 1 || v === 'true' || v === '1' || v === 'on' || v === 'ON';
})();

// v2.71：把「券后」这类价格前缀换成佣金文案
// SSR 的 customData 与 API 的 item 都有 price_prefix_info + activity_price_word，
// 实测同值；只改前者不足以让界面变化（前端读 activity_price_word）。
function applyPrefix(o, text) {
  let n = 0;
  if (typeof o.price_prefix_info === 'string' && o.price_prefix_info !== text) {
    o.price_prefix_info = text; n++;
  }
  if (typeof o.activity_price_word === 'string' && o.activity_price_word !== text) {
    o.activity_price_word = text; n++;
  }
  // v2.73：百补首页式前缀的优先级是 `before_tag.text || price_word`。
  // 实测 20 个商品里：今日疯抢 7 / 本周热卖 7 / 仅一次 2 / 只剩2天 1 / 无标签 3。
  // 有 before_tag 时前端只显示它，必须一起改，否则「券后」那 3 个能看到佣金、
  // 其余 17 个仍无佣金。
  const bt = o.activity_price_word_before_tag;
  if (bt && typeof bt === 'object' && typeof bt.text === 'string' && bt.text !== text) {
    bt.text = text; n++;
  }
  return n;
}

// v2.74：主搜索列表（goods_model）的前缀字段更杂，不做取舍 —— 全部改。
// 截图只能证明「限1件/秒杀价」这两个值在 price_prefix_info 上，
// 不能证明 price_prefix_content.* 不是渲染源（不同商品/版本可能读不同字段）。
// 遍历 price_prefix_content 的所有子键，凡是有 content 字符串的一律替换。
function applyModelPrefix(g, text) {
  let n = applyPrefix(g, text);
  const pc = g.price_prefix_content;
  if (pc && typeof pc === 'object') {
    for (const k in pc) {
      const node = pc[k];
      if (node && typeof node === 'object' && typeof node.content === 'string'
          && node.content !== text) {
        node.content = text; n++;
      }
    }
  }
  return n;
}

// 百补搜索结果 API：{ items: [ {goods_id, link_url, price_prefix_info, ...} ] }
// 与 HTML 分支共用 cpsCache / dtk，只是入口与字段名不同
function handleSearchApi(body) {
  let j;
  try { j = JSON.parse(body); } catch (e) { $done({}); return; }
  if (!j || typeof j !== 'object') { $done({}); return; }

  // ① search_stub：删 expansion（原 stub.response.js 的 /search 职责，
  //    Loon 同一 URL 只跑首个命中的 Script，故合并到这里）
  let stubTouched = false;
  if (on(A.search_stub) && Object.prototype.hasOwnProperty.call(j, 'expansion')) {
    delete j.expansion; stubTouched = true;
  }

  if (!CPS_LB || !CPS_TOKEN || typeof $httpClient === 'undefined') {
    $done(stubTouched ? { body: JSON.stringify(j) } : {}); return;
  }
  const items = Array.isArray(j.items) ? j.items : null;
  if (!items || !items.length) {
    $done(stubTouched ? { body: JSON.stringify(j) } : {}); return;
  }

  // v2.74：/search 有两种 items 形态（同一 URL 规则，靠结构区分）
  //   A) 平铺 —— 百补搜索（biz_id=brand_special_sale）：items[i].goods_id
  //   B) 嵌套 —— 主搜索框（source=index）：items[i].item_data.goods_model.goods_id
  // 界面实测显示的是 goods_model.price_prefix_info（"限1件"/"秒杀价"），
  // price_prefix_content.short_price_prefix 不是渲染源，故不改它。
  const goods = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    if (it.goods_id != null) { goods.push(it); continue; }
    const gm = it.item_data && it.item_data.goods_model;
    if (gm && typeof gm === 'object' && gm.goods_id != null) goods.push(gm);
  }
  if (!goods.length) {
    $done(stubTouched ? { body: JSON.stringify(j) } : {}); return;
  }

  const order = [], seen = {};
  for (const g of goods) {
    const gid = g.goods_id != null ? String(g.goods_id) : '';
    if (!gid || seen[gid]) continue;
    seen[gid] = 1;
    if (order.length < CPS_BATCH) order.push(gid);
  }
  if (!order.length) {
    $done(stubTouched ? { body: JSON.stringify(j) } : {}); return;
  }

  const cache = cacheLoad();
  const map = {};
  const need = [];
  for (const gid of order) {
    const cRec = cache[gid];
    if (cacheFresh(cRec) && (!CPS_RW || cRec.l)) map[gid] = { rate: cRec.r, link: cRec.l || '' };
    else need.push(gid);
  }
  hudStatsBump({ ca: order.length, ch: order.length - need.length });

  const apply = (src) => {
    let n = 0;
    for (const g of goods) {
      const gid = g.goods_id != null ? String(g.goods_id) : '';
      const ent = gid ? (src || {})[gid] : null;
      if (!ent) continue;
      const rate = ent.r != null ? ent.r : parseFloat(ent.rate);
      if (!(rate > 0)) continue;
      n += applyModelPrefix(g, '佣金' + fmtRate(rate) + '%');
      if (CPS_RW && ent.link && typeof g.link_url === 'string'
          && g.link_url.indexOf('duo_coupon_landing.html') !== 0) {
        g.link_url = ent.link; n++;
      }
    }
    return n;
  };

  const finish = (n) => {
    $done((n || stubTouched) ? { body: JSON.stringify(j) } : {});
  };

  if (!need.length) { finish(apply(map)); return; }

  cpsFetch(need, function (fetched) {
    if (fetched) {
      const now = Math.floor(Date.now() / 1000);
      const ent = {};
      for (const gid in fetched) {
        cache[gid] = { r: fetched[gid].rate, l: fetched[gid].link || '', t: now };
        if (fetched[gid].rate > 0) {
          ent[gid] = { n: fetched[gid].name || '', p: fetched[gid].price || 0,
                       r: fetched[gid].rate, a: fetched[gid].amt || 0, t: now };
        }
        map[gid] = { rate: fetched[gid].rate, link: fetched[gid].link || '' };
      }
      cacheSave(cache);
      if (Object.keys(ent).length) {
        const led = hudLedgerLoad() || {};
        for (const gid in ent) led[gid] = ent[gid];
        hudLedgerSave(led);
      }
    }
    finish(apply(map));
  });
}

function rewriteLink(g, ent) {
  if (!CPS_RW || !ent || !ent.link) return false;
  // 三种命名都要支持：snake_case（接口）/ camelCase（HTML rawData）/ 搜索页大写 URL
  const key = typeof g.link_url === 'string' ? 'link_url'
            : (typeof g.linkUrl === 'string' ? 'linkUrl'
            : (typeof g.linkURL === 'string' ? 'linkURL' : null));
  if (!key) return false;
  const cur = g[key];
  if (cur.indexOf('duo_coupon_landing.html') === 0) return false;   // 幂等
  g[key] = ent.link;
  return true;
}

function cpsFetch(ids, cb) {
  if (!CPS_TOKEN || typeof $httpClient === 'undefined') { cb(null); return; }
  let content = '';
  for (let i = 0; i < ids.length; i++) {
    if (i) content += '\n';
    content += 'https://mobile.yangkeduo.com/goods.html?goods_id=' + ids[i];
  }
  const tok = encodeURIComponent(CPS_TOKEN);
  $httpClient.post({
    url: CPS_API + '?jaw_uid=' + tok,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'content=' + encodeURIComponent(content) + '&is_app=1&supered=2&jaw_uid=' + tok
  }, function (err, resp, data) {
    if (err || !data) { cb(null); return; }
    let j;
    try { j = JSON.parse(data); } catch (e) { cb(null); return; }
    const list = j && j.data && j.data.pdd && j.data.pdd.data;
    if (!Array.isArray(list)) { cb(null); return; }
    // v2.66：转链统计（大淘客分数层就是全部真相）：
    //   tr=总条数 ok=code=1（转链成功条数）pos=rate>0（真佣金）tf=code=0（不支持转链）
    let _tr = 0, _ok = 0, _pos = 0, _tf = 0;
    const map = {};
    for (let i = 0; i < list.length; i++) {
      const x = list[i] || {};
      const g = (x || {}).goods || {};
      const rate = parseFloat(g.rate);
      _tr++;
      if (x.code === '1' || x.code === 1) _ok++;
      else if (x.code === '0' || x.code === 0) _tf++;
      if (!(rate > 0)) continue;
      _pos++;
      const link = x.item_link;
      if (typeof link !== 'string') continue;
      const m = link.match(/[?&]goods_id=(\d+)/);
      if (m && !map[m[1]]) {
        // v2.27：同时返回 item_link（相对路径），供 link_url 改写用
        // v2.66：name/price/amt 供 HUD 账本展示（price 单位元，amt 佣金金额元）
        const rel = link.replace(/^https?:\/\/[^/]+\//, '');
        map[m[1]] = {
          rate: rate,
          link: rel.indexOf('duo_coupon_landing.html') === 0 ? rel : '',
          name: String(g.goods_name || '').slice(0, 24),
          price: parseFloat(g.min_group_price) || 0,
          amt: parseFloat(g.commission_amount) || 0
        };
      }
    }
    hudStatsBump({ tr: _tr, tok: _ok, tpos: _pos, tf: _tf, c: 1 });
    cb(map);
  });
}

// 消费券栏目（tandy_vase.html）：价格前的「券后」是服务端预渲染在 HTML 里的
// 静态文本，不是 JSON 字段：
//   <span class="zlvRmSss">券后</span><span class="mgeHsFie">¥</span>
//   <span class="xZzDH4Sk"><span class="_2TFw6wKu">26</span>...
// v2.72：SSR 直出的价格前缀必须在 HTML 里替换 —— 改 rawData 不会重绘首屏
// （下滑加载的新卡片由 JS 用 API 数据渲染，那条链路 v2.71 已通）。
//
// 旧实现（v2.30~v2.71）用「价格整数」做锚点，但 activityPrice 单位是【分】、
// DOM 里是【元】，160 vs 1 永远对不上 → 首屏 20 个商品一个都没改过。
//
// 新实现：按 DOM 顺序 ↔ 商品列表顺序一一对应。实测搜索页 20 个前缀 span
// 与 ssrListData.list 20 项逐字匹配（标题 4/4 全等），数量不等时整体放弃（宁可不改也不误伤）。
function rewriteCouponTags(html, prefixList) {
  if (!prefixList || !prefixList.length) return { html: html, n: 0 };
  const RE = /<span class="([^"]*)">(券后|抢券后)<\/span>(<span class="[^"]*">¥<\/span>)/g;
  const hits = [];
  let m;
  while ((m = RE.exec(html)) !== null) {
    hits.push({ i: m.index, len: m[0].length, cls: m[1], text: m[2], rest: m[3] });
  }
  if (!hits.length || hits.length !== prefixList.length) return { html: html, n: 0 };
  let out = '', last = 0, n = 0;
  for (let k = 0; k < hits.length; k++) {
    const h = hits[k];
    const want = prefixList[k];
    out += html.slice(last, h.i);
    if (want && want.indexOf('佣金') === 0 && want !== h.text) {
      out += '<span class="' + h.cls + '">' + want + '</span>' + h.rest;
      n++;
    } else {
      out += html.slice(h.i, h.i + h.len);
    }
    last = h.i + h.len;
  }
  out += html.slice(last);
  return { html: out, n: n };
}

// 按商品列表顺序生成 DOM 前缀的目标文本（有佣金 → 佣金x.x%，否则保留原值）
function buildSsrPrefixList(lists, map) {
  const arr = [];
  for (const lst of lists) {
    for (const g of lst) {
      const gid = g && g.goodsId != null ? String(g.goodsId) : '';
      const ent = gid ? map[gid] : null;
      const rate = ent ? ent.rate : 0;
      if (rate > 0) { arr.push('佣金' + fmtRate(rate) + '%'); continue; }
      const cd = g && g.customData;
      const p = cd && typeof cd.price_prefix_info === 'string' ? cd.price_prefix_info : '';
      arr.push(p.indexOf('佣金') === 0 ? p : '');
    }
  }
  return arr;
}

// 遍历所有 tab 的商品列表（兼容 store / stores / stores.store 三种形态）
// v2.29：同时收集 tabStore.*GoodsInfoStore.goodsInfoMap（百补首页真正的渲染数据）
//   key 形如 "BYBT_MAIN_693607160697"（前缀 + goodsId），值是商品对象
// v2.70：新增百补搜索结果页 —— stores.store.buiSSRData.ssrListData.list
//   字段全是 camelCase 变体：goodsID / linkURL / rawPrice（分）/ customData.price_prefix_info
//   归一化到标准名供后续逻辑复用，原字段保留（改写必须写回原字段才生效）
function normSsrGoods(g) {
  if (!g || typeof g !== 'object') return false;
  if (g.goodsId == null && g.goodsID != null) g.goodsId = g.goodsID;
  if (g.activityPrice == null && g.rawPrice != null) g.activityPrice = g.rawPrice;
  return g.goodsId != null;
}

function eachGoodsList(raw, fn) {
  const stores = [];
  const pushStore = (st) => { if (st && typeof st === 'object') stores.push(st); };
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
        if (list.length) fn(list);
      }
    }
    // goodsInfoMap：值对象里没有 goodsId 字段，用 key 后缀反推
    for (const sk in (st.tabStore || {})) {
      const node = st.tabStore[sk];
      const gm = node && node.goodsInfoMap;
      if (!gm || typeof gm !== 'object') continue;
      const arr = [];
      for (const key in gm) {
        const g = gm[key];
        if (!g || typeof g !== 'object') continue;
        if (g.goodsId == null) {
          const m = String(key).match(/_(\d+)$/);
          if (m) g.goodsId = m[1];
        }
        if (g.goodsId != null) arr.push(g);
      }
      if (arr.length) fn(arr);
    }
    // v2.70：百补搜索结果页的 SSR 商品列表
    const sd = st.buiSSRData && st.buiSSRData.ssrListData;
    const sl = sd && Array.isArray(sd.list) ? sd.list : null;
    if (sl && sl.length) {
      const arr = [];
      for (const g of sl) if (normSsrGoods(g)) arr.push(g);
      if (arr.length) fn(arr);
    }
    // v2.73：brand_activity_search_result.html（百补首页搜索框进来的搜索页）
    //   store.commonGoodsInfoStoreUnderlineV3.goodsInfoMap
    //   key 形如 "BYBT_SEARCH@<base64 refresh_sn>"，不能用 _(\d+)$ 反推；
    //   同级的 goodsIdUnionIdMap 是 { goodsId: <同一个 key> }，建反查表即可。
    const cgu = st.commonGoodsInfoStoreUnderlineV3;
    if (cgu && typeof cgu === 'object' && cgu.goodsInfoMap && typeof cgu.goodsInfoMap === 'object') {
      const gm = cgu.goodsInfoMap;
      const rev = {};
      const idm = cgu.goodsIdUnionIdMap;
      if (idm && typeof idm === 'object') {
        for (const gid in idm) rev[String(idm[gid])] = gid;
      }
      const arr = [];
      for (const key in gm) {
        const g = gm[key];
        if (!g || typeof g !== 'object') continue;
        if (g.goodsId == null) {
          if (rev[key]) g.goodsId = rev[key];
          else {
            const m = String(key).match(/_(\d+)$/);
            if (m) g.goodsId = m[1];
          }
        }
        if (g.goodsId != null) arr.push(g);
      }
      if (arr.length) fn(arr);
    }
  }
}

// 收集带 ad 字段的商品（职责 2 用）
function collectAdGoods(raw) {
  const out = [];
  eachGoodsList(raw, (list) => {
    for (const g of list) {
      if (g && typeof g === 'object' && typeof g.ad === 'string' && g.goodsId !== undefined) {
        out.push(g);
      }
    }
  });
  return out;
}

// v2.36：动画压制 CSS（消费券页的福袋/抽奖弹窗有 153 个 @keyframes、730 处 animation，
// 服务端无开关可关，只能从渲染层压时长）。见 hub_skip.response.js 同一段说明。
// v2.39：这里【只压 delay，不压 duration】。
// tandy_vase.html 有 10 处 animation-iteration-count:infinite（实测
// animation:_2VSYZIBr .9s linear infinite / _1zqXp5Ij 2.5s infinite forwards …）。
// 一旦把 duration 压到 .01s，这些无限循环会变成 100Hz 高速闪烁，
// 元素一直在动 → 点不中，表现为「要反复点才能进商品」。
// 压 delay 只去掉等待（.44s 这类），保留动画节奏，无副作用。
const NOANIM_CSS = '<style id="pdd-no-anim">*,*::before,*::after{animation-delay:0s !important;transition-delay:0s !important}</style>';
const NO_ANIM = (A.no_anim === undefined || A.no_anim === null || A.no_anim === '')
  ? true : on(A.no_anim);

// v2.61：点亮自动倒计时 —— 改用文案检测（API 拦截失败）
// ---------------------------------------------------------------------------
// v2.60 诊断：cap=0 → start_task 拦截失败（页面可能走了别的通道）。
//
// 但截图显示任务进行中时，页面顶部有横幅：
//   「滑动浏览当前页面10秒即可点亮 | 10秒」
//
// 改用【文案检测】判定任务是否进行中，不依赖 API 通道：
//   · 页面 innerText 含「滑动浏览当前页面」→ 开始抖
//   · 文案消失 → 停止
//   · 兜底：最长 90 秒
//
// 保留 API 拦截作为辅助（能捕获就更快触发）。
const LIGHTUP_JS = `<script id="pdd-lightup-auto">(function(){
  if (window.__pddLightupAuto) return;
  window.__pddLightupAuto = 1;

  var KEY = '滑动浏览当前页面';   // 只有 lightForceSwipe=true 时才有「滑动」二字
  var shaking = false, timer = null, deadline = 0, up = true;
  var hooked = 0, cap = 0, txt = 0, shakeN = 0;

  function shake() {
    try {
      window.__pddLightup = { txt: txt, shake: shakeN, run: true };
      document.dispatchEvent(new Event('touchstart', { bubbles: true }));
      document.dispatchEvent(new Event('touchmove', { bubbles: true }));
      var el = document.scrollingElement || document.documentElement || document.body;
      var cur = (el && el.scrollTop) || window.pageYOffset || 0;
      var next = up ? cur + 3 : Math.max(0, cur - 3);
      if (el) el.scrollTop = next;
      try { window.scrollTo(0, next); } catch (e) {}
      up = !up;
      document.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('scroll'));
      shakeN++;
    } catch (e) {}

  }

  function startShake(secs) {
    var dur = (typeof secs === 'number' && secs > 0) ? secs : 10;
    deadline = Date.now() + (dur + 20) * 1000;
    if (shaking) return;
    shaking = true;
    timer = setInterval(function () {
      if (Date.now() > deadline) { stopShake(); return; }
      // 每次抖之前再确认一次文案（任务可能提前结束）
      if (!hasTaskText()) { stopShake(); return; }
      shake();
    }, 300);
    shake();
  }

  function stopShake() {
    try { window.__pddLightup = { txt: txt, shake: shakeN, run: false }; } catch (e) {}
    shaking = false;
    if (timer) { clearInterval(timer); timer = null; }

  }

  function hasTaskText() {
    try {
      var b = document.body;
      if (!b) return false;
      var s = b.innerText || '';
      // 只有「滑动浏览当前页面」才需要抖；
      // 若是不需要滑动的「浏览当前页面」，页面自己会倒计时，不用干预
      return s.indexOf(KEY) >= 0;
    } catch (e) { return false; }
  }

  // ---- 主循环：每秒检查文案 ----
  setInterval(function () {
    try {
      txt = hasTaskText() ? 1 : 0;
      if (txt && !shaking) startShake(10);
      else if (!txt && shaking) stopShake();

    } catch (e) {}
  }, 800);

  // ---- API 拦截（辅助，能捕获就更早触发）----
  try {
    var XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__pddU = u; return XO.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      var self = this;
      try {
        var u = String(self.__pddU || '');
        if (u.indexOf('light-up/start_task') >= 0) {
          self.addEventListener('load', function () {
            try {
              var j = JSON.parse(self.responseText);
              if (j && j.success && j.result && j.result.code === 0) {
                cap = 1;
                startShake(Number((j.result.data || {}).task_duration) || 10);
              }
            } catch (e) {}

          });
        }
      } catch (e) {}
      return XS.apply(this, arguments);
    };
    hooked |= 1;
  } catch (e) {}

  try {
    if (window.fetch) {
      var OF = window.fetch;
      window.fetch = function (input, init) {
        var url = (typeof input === 'string') ? input : ((input && input.url) || '');
        var p = OF.apply(this, arguments);
        try {
          if (String(url).indexOf('light-up/start_task') >= 0) {
            p.then(function (resp) {
              resp.clone().text().then(function (t) {
                try {
                  var j = JSON.parse(t);
                  if (j && j.success && j.result && j.result.code === 0) {
                    cap = 1;
                    startShake(Number((j.result.data || {}).task_duration) || 10);
                  }
                } catch (e) {}

              }).catch(function () {});
            }).catch(function () {});
          }
        } catch (e) {}
        return p;
      };
      hooked |= 2;
    }
  } catch (e) {}

  setInterval(show, 2000);

})();</script>`;
const LIGHTUP_AUTO = (A.lightup_auto === undefined || A.lightup_auto === null || A.lightup_auto === '')
  ? true : on(A.lightup_auto);

function injectLightupAuto(body) {
  if (!LIGHTUP_AUTO) return body;
  if (body.indexOf('id="pdd-lightup-auto"') !== -1) return body;   // 幂等
  const i = body.indexOf('</body>');
  if (i < 0) return body;
  return body.slice(0, i) + LIGHTUP_JS + body.slice(i);
}

// v2.63：点亮任务 3 秒提示弹窗自动关闭
// ---------------------------------------------------------------------------
// 流程（用户描述 + 截图实证）：
//   点「立即点亮」→ 弹窗「浏览商品10秒，即可点亮1次」
//     + 按钮「去看看（3S）」倒计时 3 秒
//   3 秒后弹窗自动关闭（也可以点「去看看」立即关闭）
//   → 之后才开始 10 秒滑动倒计时
//
// 本脚本自动点「去看看（3S）」按钮，跳过 3 秒等待。
//
// 定位：chunk 5235（模块 48030）渲染，抓包里没加载到（缓存），
// 所以不依赖 class，改用【文本精确匹配】：
//   · 弹窗按钮：textContent 以「去看看（」或「去看看(」开头（带倒计时括号）
//   · 页面 banner 的「去看看」不带括号 → 不会误点
const LIGHTUP_POPUP_JS = `<script id="pdd-lightup-popup">(function(){
  if (window.__pddLightupPopup) return;
  window.__pddLightupPopup = 1;

  // 匹配「去看看（3S）」「去看看(3s)」这类带倒计时的按钮
  var RE = /^去看看\\s*[（(]/;

  setInterval(function () {
    try {
      var els = document.querySelectorAll('div,span,a,button,p');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.children && el.children.length > 0) continue;   // 只要叶子节点
        var t = (el.textContent || '').trim();
        if (!t || t.length > 14) continue;
        if (!RE.test(t)) continue;
        var r = el.getBoundingClientRect();
        if (r.width < 20 || r.height < 10) continue;
        try { el.click(); } catch (e) {}
        try { if (el.parentElement) el.parentElement.click(); } catch (e) {}
        return;
      }
    } catch (e) {}
  }, 250);
})();</script>`;
const LIGHTUP_POPUP = (A.lightup_popup === undefined || A.lightup_popup === null || A.lightup_popup === '')
  ? true : on(A.lightup_popup);

function injectLightupPopup(body) {
  if (!LIGHTUP_POPUP) return body;
  if (body.indexOf('id="pdd-lightup-popup"') !== -1) return body;   // 幂等
  const i = body.indexOf('</body>');
  if (i < 0) return body;
  return body.slice(0, i) + LIGHTUP_POPUP_JS + body.slice(i);
}

// v2.64：HUD 数据面板（修正版）
// ---------------------------------------------------------------------------
// v2.63 的问题：
//   ① 覆盖率虚高（360%）—— 分母用 /券后\s*¥/ 只匹配到 1/3 的商品
//      拼多多价格显示有多种格式（券后 ¥168 / ¥168 / 券后价 ¥168），匹配不全
//   ② 注入脚本数不准（显示 6，实际 5）—— [id^="pdd-"] 会命中 PDD 自己的元素
//   ③ 边角被屏幕边缘挡住 —— 没考虑 iPhone 底部安全区（Home Indicator）
//
// 本版：
//   ① 去掉「佣金/商品」和「覆盖率」，只保留绝对数（永远准确）
//   ② 注入数改成精确检查 5 个固定 ID
//   ③ 位置用 env(safe-area-inset-*) 避开刘海/指示条
// v2.68：距底部偏移可调（hud_bottom，默认 0 = 安全区最底；负数更贴底）
const HUD_BOTTOM = (function () {
  const v = parseInt(A.hud_bottom, 10);
  return isNaN(v) ? 0 : v;
})();
const HUD_JS = `<script id="pdd-hud">(function(){
  if (window.__pddHud) return;
  window.__pddHud = 1;

  var IDS = ['pdd-no-anim','pdd-lightup-auto','pdd-lightup-popup',
             'pdd-lucky-close','pdd-hud'];
  var open = false, box = null, listOpen = false;
  var fps = 0, frames = 0, lastT = 0;

  function fmtB(b) {
    if (!(b > 0)) return '—';
    if (b < 1024) return b + 'B';
    if (b < 1048576) return (Math.round(b / 102.4) / 10) + 'K';
    return (Math.round(b / 104857.6) / 10) + 'M';
  }
  function fmtLoad(ms) {
    if (!(ms > 0)) return '—';
    return ms < 1000 ? ms + 'ms' : (Math.round(ms / 100) / 10) + 's';
  }
  function fmtP(v) {
    v = +v; if (!(v > 0)) return '—';
    return '¥' + (Math.round(v * 100) / 100);
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function tick(now) {
    frames++;
    if (!lastT) lastT = now;
    if (now - lastT >= 1000) { fps = frames; frames = 0; lastT = now; }
    requestAnimationFrame(tick);
  }
  try { requestAnimationFrame(tick); } catch (e) {}

  function collect() {
    var d = { cps:0, ad:0, maxRate:0, subsidy:0, discount:0,
              inject:0, anim:-1, page:'', scroll:0, nodes:0,
              imgs:0, load:0, light:-1, shake:null, popup:0,
              bytes:-1, stats:null, ledger:null };
    try {
      var t = (document.body && document.body.textContent) || '';

      var m = t.match(/佣金[\\d.]+%/g);
      d.cps = m ? m.length : 0;

      var a = t.match(/广告·/g);
      d.ad = a ? a.length : 0;

      var mx = 0, mr = t.match(/佣金([\\d.]+)%/g) || [];
      for (var j = 0; j < mr.length; j++) {
        var r = parseFloat(mr[j].replace(/[^\\d.]/g, ''));
        if (!isNaN(r) && r > mx) mx = r;
      }
      d.maxRate = mx;

      var s = 0, ms = t.match(/已补([\\d.]+)元/g) || [];
      for (var i = 0; i < ms.length; i++) {
        var v = parseFloat(ms[i].replace(/[^\\d.]/g, ''));
        if (!isNaN(v)) s += v;
      }
      d.subsidy = Math.round(s);

      var ds = 0, md = t.match(/店铺优惠(\\d+)元/g) || [];
      for (var k = 0; k < md.length; k++) {
        var dv = parseFloat(md[k].replace(/[^\\d.]/g, ''));
        if (!isNaN(dv)) ds += dv;
      }
      d.discount = ds;

      // 精确统计注入数（只认我们自己的 5 个 ID）
      var n = 0;
      for (var q = 0; q < IDS.length; q++) {
        if (document.getElementById(IDS[q])) n++;
      }
      d.inject = n;

      try { d.anim = document.getAnimations ? document.getAnimations().length : -1; } catch (e) {}

      d.page = (location.pathname.split('/').pop() || '').replace('.html', '') || 'index';

      var el = document.scrollingElement || document.documentElement;
      d.scroll = (el && el.scrollHeight > 0) ? Math.round(el.scrollTop / el.scrollHeight * 100) : 0;

      d.nodes = document.getElementsByTagName('*').length;
      d.imgs = document.images.length;

      try {
        var nav = performance.timing;
        if (nav && nav.loadEventEnd > 0 && nav.navigationStart > 0) {
          d.load = Math.round(nav.loadEventEnd - nav.navigationStart);
        }
      } catch (e) {}

      var lm = t.match(/滑动浏览当前页面(\\d+)秒/);
      d.light = lm ? parseInt(lm[1], 10) : -1;

      d.shake = window.__pddLightup || null;

      d.popup = document.querySelectorAll('[class*="popup"],[class*="Popup"]').length;

      // v2.66：资源解码字节累计（拿不到就退化为图片数）
      try {
        var res = performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
        var sum = 0, have = 0;
        for (var r2 = 0; r2 < res.length; r2++) {
          var db = res[r2].decodedBodySize || 0;
          if (db > 0) { sum += db; have = 1; }
        }
        d.bytes = have ? sum : -1;
      } catch (e) {}

      // v2.66：Loon 侧注入的账本快照（转链统计 + 真佣金明细）
      try {
        var hd = window.__pddHudData;
        if (hd && typeof hd === 'object') { d.stats = hd.s || null; d.ledger = hd.l || null; }
      } catch (e) {}
    } catch (e) {}
    return d;
  }

  function build() {
    box = document.createElement('div');
    box.id = 'pdd-hud-box';
    // 关键：避开 iPhone 安全区（底部 Home Indicator / 左侧圆角）
    box.style.cssText =
      'position:fixed;' +
      'left:calc(14px + env(safe-area-inset-left, 0px));' +
      'bottom:calc(${HUD_BOTTOM}px + env(safe-area-inset-bottom, 0px));' +
      'z-index:2147483647;' +
      'font:11px/1.5 -apple-system,"SF Pro Text","PingFang SC",system-ui,sans-serif;' +
      '-webkit-font-smoothing:antialiased;' +
      'background:rgba(28,28,30,.50);color:#fff;border-radius:14px;' +
      'border:.5px solid rgba(255,255,255,.35);' +
      'box-shadow:0 6px 26px rgba(0,0,0,.24);' +
      'overflow:hidden;text-shadow:0 1px 3px rgba(0,0,0,.4);' +
      '-webkit-backdrop-filter:blur(8px) saturate(200%) brightness(1.15);backdrop-filter:blur(8px) saturate(200%) brightness(1.15);' +
      'max-width:calc(100vw - 28px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));';
    box.addEventListener('click', function (ev) {
      var tg = ev.target;
      var act = (tg && tg.getAttribute) ? tg.getAttribute('data-act') : null;
      if (act === 'ledger') { listOpen = !listOpen; render(); return; }
      open = !open;
      if (!open) listOpen = false;
      render();
    });
    // v2.68：挂到 <html> 直属 —— body 上若有 transform，position:fixed 会失效
    document.documentElement.appendChild(box);
  }

  function row(k, v, color, act) {
    return '<div' + (act ? ' data-act="' + act + '"' : '') +
           ' style="display:flex;justify-content:space-between;gap:14px;padding:1.5px 0' +
           (act ? ';cursor:pointer' : '') + '">' +
           '<span style="color:rgba(255,255,255,.75)">' + k + '</span>' +
           '<span style="font-weight:600;font-variant-numeric:tabular-nums;' +
           (color ? 'color:' + color : '') + '">' + v + '</span></div>';
  }
  function divider() {
    return '<div style="height:.5px;background:rgba(255,255,255,.2);margin:6px 0"></div>';
  }

  function ledgerList(led) {
    if (!led) return '';
    var arr = [];
    for (var k in led) {
      var it = led[k] || {};
      if ((+it.r || 0) > 0) arr.push(it);
    }
    arr.sort(function (x, y) { return (+y.r || 0) - (+x.r || 0); });
    if (!arr.length) {
      return '<div style="padding:4px 0 6px;font-size:10px;color:rgba(255,255,255,.4)">暂无真佣金商品</div>';
    }
    var s = '';
    for (var i = 0; i < arr.length && i < 30; i++) {
      var it2 = arr[i];
      s += '<div style="display:flex;justify-content:space-between;gap:10px;padding:2px 0;font-size:10.5px">' +
        '<span style="color:#32d74b;font-weight:600;flex:0 0 auto;width:36px">' + (+it2.r) + '%</span>' +
        '<span style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;opacity:.9">' +
          esc((it2.n || '商品').slice(0, 16)) + '</span>' +
        '<span style="flex:0 0 auto;font-variant-numeric:tabular-nums;opacity:.7">' + fmtP(it2.p) + '</span></div>';
    }
    return s;
  }

  function render() {
    var d = collect();
    var st = d.stats || {};
    var led = d.ledger || {};
    var nReal = 0, sumAmt = 0;
    for (var lk in led) {
      var li = led[lk] || {};
      if ((+li.r || 0) > 0) { nReal++; sumAmt += (+li.a || 0); }
    }

    if (!open) {
      // v2.66：收起态 = 性能一行（FPS / 首屏 / 资源字节），圆点=注入完整性
      var dot = d.inject === IDS.length ? '#32d74b' : '#ffd60a';
      var fcol = '#fff';
      if (fps <= 15) fcol = '#ff6961'; else if (fps <= 30) fcol = '#ffd60a';
      if (d.load > 3000 && fcol === '#fff') fcol = '#ffd60a';
      var bytesTxt = d.bytes >= 0 ? fmtB(d.bytes) : (d.imgs > 0 ? d.imgs + ' 图' : '—');
      box.innerHTML =
        '<div style="display:flex;align-items:center;gap:7px;padding:7px 12px 7px 10px">' +
          '<span style="width:6px;height:6px;border-radius:50%;background:' + dot + ';flex:0 0 auto"></span>' +
          '<b style="color:' + fcol + ';font-variant-numeric:tabular-nums">' + fps + 'fps</b>' +
          '<span style="color:rgba(255,255,255,.3)">·</span>' +
          '<span style="font-variant-numeric:tabular-nums">' + fmtLoad(d.load) + '</span>' +
          '<span style="color:rgba(255,255,255,.3)">·</span>' +
          '<span style="font-variant-numeric:tabular-nums">' + bytesTxt + '</span>' +
          '<span style="color:rgba(255,255,255,.35);font-size:9px">▴</span>' +
        '</div>';
      return;
    }

    var cpsColor = d.cps > 0 ? '#32d74b' : 'rgba(255,255,255,.45)';
    var zero = Math.max(0, (st.tok || 0) - (st.tpos || 0));

    box.innerHTML =
      '<div style="padding:10px 13px 11px;min-width:186px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;' +
             'padding-bottom:7px;margin-bottom:6px;border-bottom:.5px solid rgba(255,255,255,.2)">' +
          '<span style="font-size:11px;font-weight:600">HUD · ' + d.page + '</span>' +
          '<span style="font-size:9px;color:rgba(255,255,255,.35)">▾</span>' +
        '</div>' +

        row('展示佣金', d.cps, cpsColor) +
        row('真佣金', nReal, nReal ? '#32d74b' : 'rgba(255,255,255,.4)', 'ledger') +
        row('转链成功率', st.tr ? (st.tok || 0) + '/' + st.tr : '—') +
        row('大淘客调用', st.c || 0) +
        row('缓存命中', st.ca ? (st.ch + '/' + st.ca) : '—') +
        divider() +
        row('最高佣金', d.maxRate ? d.maxRate + '%' : '—') +
        row('佣金合计', sumAmt > 0 ? '¥' + (Math.round(sumAmt * 100) / 100).toFixed(2) : '—') +
        divider() +
        row('FPS', fps, fps <= 15 ? '#ff6961' : (fps <= 30 ? '#ffd60a' : '')) +
        row('首屏', fmtLoad(d.load)) +
        row('资源', d.bytes >= 0 ? fmtB(d.bytes) : (d.imgs > 0 ? d.imgs + ' 图' : '—')) +
        row('滚动', d.scroll + '%') +
        divider() +
        row('注入', d.inject + '/' + IDS.length, d.inject === IDS.length ? '#32d74b' : '#ffd60a') +
        row('动画', d.anim < 0 ? '—' : d.anim) +
        (listOpen
          ? divider() + ledgerList(led) +
            '<div style="font-size:9px;color:rgba(255,255,255,.45);padding-top:2px">rate=0 已转 ' + zero +
            ' · 不支持 ' + (st.tf || 0) + '</div>'
          : '') +
      '</div>';
  }

  function start() {
    build();
    render();
    setInterval(render, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();</script>`;
const HUD = (A.hud === undefined || A.hud === null || A.hud === '')
  ? true : on(A.hud);

// v2.66：把 Loon 侧统计/账本快照进页面（HUD 展示用）
// 保护：< 字符全部替成 \u003c，避免 goods_name 里的 < 意外关闭 script 标签
function hudPageData() {
  const s = hudStatsLoad();
  const l = hudLedgerLoad();
  const d = {};
  if (s) d.s = s;
  if (l) d.l = l;
  if (!d.s && !d.l) return null;
  try { return JSON.stringify(d).replace(/</g, '\\u003c'); } catch (e) { return null; }
}

function injectHud(body) {
  if (!HUD) return body;
  if (body.indexOf('id="pdd-hud"') !== -1) return body;   // 幂等
  const i = body.indexOf('</body>');
  if (i < 0) return body;
  const snap = hudPageData();
  const snapJS = snap
    ? '<script id="pdd-hud-data">window.__pddHudData=' + snap + ';</script>'
    : '';
  return body.slice(0, i) + snapJS + HUD_JS + body.slice(i);
}

// v2.47：福袋自动关闭 —— 覆盖两个弹窗变体
// ---------------------------------------------------------------------------
// 之前几版为什么失败：PDD 有两个不同的福袋弹窗组件，我只覆盖了其中一个。
//
//   ① LuckyBagTakeCouPopNewTwo（无 popup_goods）
//      关闭按钮 class: _1-lALGJL / _1CIjIqvj
//      图片: f57ce24c-be68-49a3-ab54-dd45824a4a1d
//
//   ② LBTakeCouponPopWithGoods（有 popup_goods）← 用户这次遇到的就是这个
//      关闭按钮 class: _1YyPm9Uh / eOdKZIH1（BX_Class8 / BX_Ani8）
//      图片: bf929de2-1240-4a44-9627-ec36a2e9276e
//      另有 closeIcon: _3T2QZOWa
//
// 两个组件的 class 在各自 bundle 版本内固定（bundle 名带 hash）。
//
// 防误伤：宽高 > 8px、在视口内、每元素只点一次、只点元素本身。
const LUCKY_CLOSE_JS = `<script id="pdd-lucky-close">(function(){
  if (window.__pddLuckyClose) return;
  window.__pddLuckyClose = 1;

  // 两个弹窗变体的关闭按钮特征
  var CLASSES = [
    '_1-lALGJL', '_1CIjIqvj',      // ① 普通领券弹窗
    '_1YyPm9Uh', 'eOdKZIH1',       // ② 带商品弹窗
    '_3T2QZOWa'                    // ② closeIcon
  ];
  var KEYS = [
    'f57ce24c-be68-49a3-ab54-dd45824a4a1d',   // ①
    'bf929de2-1240-4a44-9627-ec36a2e9276e'    // ②
  ];

  var sel = CLASSES.map(function (c) { return '.' + c; });
  for (var i = 0; i < KEYS.length; i++) {
    sel.push('[src*="' + KEYS[i] + '"]');
    sel.push('[style*="' + KEYS[i] + '"]');
  }
  var SEL = sel.join(',');

  setInterval(function () {
    try {
      var els = document.querySelectorAll(SEL);
      for (var j = 0; j < els.length; j++) {
        var el = els[j];
        if (el.__pddLbClicked) continue;
        var r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        if (r.bottom < 0 || r.top > (window.innerHeight || 9999)) continue;
        el.__pddLbClicked = 1;
        try { el.click(); } catch (e) {}
      }
    } catch (e) {}
  }, 500);
})();</script>`;
const LUCKY_CLOSE = (A.lucky_close === undefined || A.lucky_close === null || A.lucky_close === '')
  ? true : on(A.lucky_close);

function injectLuckyClose(body) {
  if (!LUCKY_CLOSE) return body;
  if (body.indexOf('id="pdd-lucky-close"') !== -1) return body;   // 幂等
  const i = body.indexOf('</body>');
  if (i < 0) return body;
  return body.slice(0, i) + LUCKY_CLOSE_JS + body.slice(i);
}

function injectNoAnim(body) {
  if (!NO_ANIM) return body;
  if (body.indexOf('id="pdd-no-anim"') !== -1) return body;   // 幂等
  const i = body.indexOf('</head>');
  if (i < 0) return body;
  return body.slice(0, i) + NOANIM_CSS + body.slice(i);
}

try {
  let body = $response.body;
  if (!body) { $done({}); return; }

  // ── 职责 4（v2.71）：百补搜索结果 API ──────────────────────
  // 页面 tandy_vase.html 的 SSR 数据会被首屏/翻页的 /search API 覆盖，
  // 只改 SSR 时界面仍是「券后」（2026-11-05 真机实证）。
  // API items[] 是平铺结构：goods_id / link_url / price_prefix_info /
  // activity_price_word（后两者实测 20/20 同值「券后」）。
  {
    const U = (typeof $request !== 'undefined' && $request && $request.url) ? String($request.url) : '';
    if (U.indexOf('api.pinduoduo.com/search?') !== -1) {
      // v2.74：不再只认 biz_id=brand_special_sale —— 主搜索框（source=index）
      // 的响应结构完全不同（items[].item_data.goods_model），由 handleSearchApi
      // 内部判断；不认识的形态原样放行。
      handleSearchApi(body);
      return;
    }
  }

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
            // v1.94：角标只走 ltIcon（商品图左上角官方角标槽），不再写 goodsFlagIcon。
            //   ① 手机版列表页（tandy_vase.html）的商品**根本没有 ltIcon 字段**，
            //      v1.87~v1.93 只做「替换已有字符串」→ 手机上压根没地方写；
            //   ② goodsFlagIcon 是标题旗标槽，CSS `.aFOWVd6O{height:.15rem}`
            //      ≈15px 高（375pt 手机）→ 横幅「广告」被压到 ~10px，等于看不见；
            //      iPad 上 rem 更大所以看得见 —— 这正是「手机看不到/iPad 能看到」的成因；
            //   ③ ltIcon 槽位 CSS `.ilx1YR3r{height:.52rem;width:.46rem}` ≈46×52px，
            //      官方角标位，竖版资产（184×208，比例 0.885 = 0.46/0.52）填进去清晰可读。
            //   ltIcon 是【单个 URL 字符串】：v1.83 曾转成数组，H5 组件 join(',')
            //   拼出 `badge.png,原URL` → 404 碎图（iPad 实测），v1.86 已改回字符串。
            if (g.ltIcon !== AD_BADGE_URL) { g.ltIcon = AD_BADGE_URL; touched++; }
          }

          if (touched) {
            const next = body.slice(0, parsed.start) + JSON.stringify(parsed.obj) + body.slice(parsed.end);
            if (next !== body) body = next;
          }
        }
      } catch (e) { /* 职责 2 失败不影响职责 1 */ }
    }
  }


  // ── 职责 3：消费券栏目显示佣金率（cps_label）────────────────
  // 页面 tandy_vase.html（百补「消费券」栏目），双列布局，数据结构是
  // rawData.stores.store（不是 store）。
  // 该页面【没有 activityPriceWordBeforeTag】，所以 activityPriceWord 是
  // 真正渲染的那个词（实测 20/20 都是「券后」），不会被覆盖。
  if (CPS_LB && CPS_TOKEN && typeof $httpClient !== 'undefined') {
    const p3 = parseRawData(body);
    if (p3) {
      const lists = [];
      eachGoodsList(p3.obj, (l) => { lists.push(l); });
      if (lists.length) {
        const order = [];
        const seen = {};
        for (const lst of lists) {
          for (const g of lst) {
            const gid = g && g.goodsId != null ? String(g.goodsId) : '';
            if (!gid || seen[gid]) continue;
            seen[gid] = 1;
            if (order.length < CPS_BATCH) order.push(gid);
          }
        }
        if (order.length) {
          const cache = cacheLoad();
          const map = {};
          const need = [];
          for (const gid of order) {
            // 旧缓存只有 r 没有 l：转链开启时视为未命中，重新请求拿 item_link
            const cRec = cache[gid];
            if (cacheFresh(cRec) && (!CPS_RW || cRec.l)) {
              map[gid] = { rate: cRec.r, link: cRec.l || '' };
            } else {
              need.push(gid);
            }
          }
          // v2.66：缓存命中率（口径=本页商品全量，累计）
          hudStatsBump({ ca: order.length, ch: order.length - need.length });
          const done = (fetched) => {
            if (fetched) for (const k in fetched) map[k] = fetched[k];
            let n = 0;
            for (const lst of lists) {
              for (const g of lst) {
                if (!g || typeof g !== 'object') continue;
                const gid = g.goodsId != null ? String(g.goodsId) : '';
                const ent = gid ? map[gid] : null;
                const rate = ent ? ent.rate : 0;
                if (!(rate > 0)) continue;
                if (rewriteLink(g, ent)) n++;                 // v2.27 链接改写
                const text = '佣金' + fmtRate(rate) + '%';
                // v2.29：优先改 activityPriceWordBeforeTag.text —— 百补首页与
                // 精选页的前端都是 `W = BeforeTag.text || priceWord`，只改
                // activityPriceWord 会被「只剩2天」这类标签完全盖住。
                // v2.70：搜索页的前缀在 customData.price_prefix_info（"券后"）
                // v2.71：customData.activity_price_word 与 price_prefix_info 实测同值，
                //        前端读的是前者 → 两个都改（API item 同理，见 applyPrefix）
                // v2.73：一个商品可能有 5 种前缀（今日疯抢/本周热卖/仅一次/只剩2天/券后），
                //        只显示其中一种 → 所有可能的字段一次全改，避免漏
                let hit = 0;
                if (g.customData && typeof g.customData === 'object') {
                  hit += applyPrefix(g.customData, text);        // 嵌套形态
                }
                hit += applyPrefix(g, text);                     // flat snake_case（goodsInfoMap）
                const bt = g.activityPriceWordBeforeTag;         // camelCase 老结构
                if (bt && typeof bt === 'object' && typeof bt.text === 'string'
                    && bt.text !== text) { bt.text = text; hit++; }
                if (typeof g.activityPriceWord === 'string' && g.activityPriceWord !== text) {
                  g.activityPriceWord = text; hit++;
                }
                if (!hit) continue;
                n += hit;
              }
            }
            // 先改服务端预渲染的静态「券后」（首屏卡片是 SSR 死文本，改 rawData 不会重绘）
            // ⚠️ 必须在 JSON 改写之前做：JSON 改写会改变 body 长度，p3.start 就失效了
            try {
              const prList = buildSsrPrefixList(lists, map);
              if (prList.length) {
                const seg = body.slice(0, p3.start);
                const r2 = rewriteCouponTags(seg, prList);
                if (r2.n) body = r2.html + body.slice(p3.start);
              }
            } catch (e) { /* 静态改写失败不影响主流程 */ }

            if (n) {
              const next = body.slice(0, p3.start) + JSON.stringify(p3.obj) + body.slice(p3.end);
              if (next !== body) body = next;
            }
            body = injectNoAnim(body);
  body = injectLightupAuto(body);
  body = injectLightupPopup(body);
  body = injectHud(body);
  body = injectLuckyClose(body);
  $done(body === $response.body ? {} : { body });
          };
          if (!need.length) { done(null); return; }
          cpsFetch(need, function (fetched) {
            if (fetched) {
              const now = Math.floor(Date.now() / 1000);
              const ent = {};
              for (const gid in fetched) {
                cache[gid] = { r: fetched[gid].rate, l: fetched[gid].link || '', t: now };
                // v2.66：真佣金账本（rate>0，name/price/amt 由 dtk 给出）
                if (fetched[gid].rate > 0) {
                  ent[gid] = {
                    n: fetched[gid].name || '',
                    p: fetched[gid].price || 0,
                    r: fetched[gid].rate,
                    a: fetched[gid].amt || 0,
                    t: now
                  };
                }
              }
              cacheSave(cache);
              if (Object.keys(ent).length) {
                const led = hudLedgerLoad() || {};
                for (const gid in ent) led[gid] = ent[gid];   // 同 goods_id 覆盖更新
                hudLedgerSave(led);
              }
            }
            done(fetched);
          });
          return;
        }
      }
    }
  }

  body = injectNoAnim(body);
  body = injectLightupAuto(body);
  body = injectLightupPopup(body);
  body = injectHud(body);
  body = injectLuckyClose(body);
  $done(body === $response.body ? {} : { body });
} catch (e) {
  // 兜底：出错一律放行，绝不因脚本问题让百亿补贴页打不开
  $done({});
}
