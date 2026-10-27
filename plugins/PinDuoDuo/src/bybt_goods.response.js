/*
 * bybt_goods.response.js —— 百亿补贴「精选」列表显示佣金率（自研脚本）
 *
 * 端点：POST https://api.pinduoduo.com/api/hermes/goods_list
 *
 * 为什么是这里
 * ------------
 * 百补列表走过三个不同的数据源（都试过）：
 *   ① brand_activity_subsidy.html 的 window.rawData（camelCase）——首屏骨架，被接口覆盖
 *   ② brand-zara/bybt/goods_fresh（snake_case）—— 旧版接口，现已被 ③ 取代
 *   ③ hermes/goods_list（snake_case）—— **当前版本，真正渲染的数据源**
 *
 * ③ 里有两个 place_id：
 *   BYBT_MAIN            → 百补「精选」主列表（20 个，17 个带 before_tag）★ 本脚本处理
 *   BYBT_MAIN_LUXE_HUB   → 「奢品馆」tab（before_tag 全为 null）
 *
 * 改哪个字段
 * ----------
 * 价格前面那个「只剩2天 / 本周热卖 / 仅一次」来自：
 *   activity_price_word_before_tag = { type, text, tag_ext: { icon } }
 * 前端 PriceWord 组件（react_brand_activity_subsidy @410862）：
 *   var x = e.activityPriceWordBeforeTag, F = M.text, W = F || n;
 *   ← BeforeTag.text 优先于 priceWord
 * 所以必须改 before_tag.text，只改 activity_price_word 会被盖住。
 *
 * 开关：cps_label / cps_token / cps_ttl（与首页共用缓存）
 * 任何异常一律放行原响应。
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

const CPS_LB = on(A.cps_label);
const CPS_TOKEN = (typeof A.cps_token === 'string') ? A.cps_token.trim() : '';
const CPS_API = 'https://dtkapi.ffquan.cn/taobaoapi/parsing-content-three-in-one';
const CPS_BATCH = 20;

const CACHE_KEY = 'pddCpsCache';
const CACHE_CAP = 300;
const CACHE_TTL = (function () {
  const v = parseInt(A.cps_ttl, 10);
  return v > 0 ? v : 21600;
})();

// 只处理这个 place（百补精选主列表）；奢品馆 BYBT_MAIN_LUXE_HUB 的 before_tag 全空
const PLACE = 'BYBT_MAIN';

function fmtRate(v) { return String(Math.round(v * 10) / 10); }

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function cacheLoad() {
  try {
    if (typeof $persistentStore === 'undefined') return {};
    const raw = $persistentStore.read(CACHE_KEY);
    const o = raw ? JSON.parse(String(raw)) : {};
    return (o && typeof o === 'object') ? o : {};
  } catch (e) { return {}; }
}

function cacheSave(o) {
  try {
    if (typeof $persistentStore === 'undefined') return;
    const keys = Object.keys(o);
    if (keys.length > CACHE_CAP) {
      keys.sort((a, b) => (o[a].t || 0) - (o[b].t || 0));
      for (let i = 0; i < keys.length - CACHE_CAP; i++) delete o[keys[i]];
    }
    $persistentStore.write(JSON.stringify(o), CACHE_KEY);
  } catch (e) { /* 忽略 */ }
}

function cacheFresh(rec) {
  if (!rec || typeof rec !== 'object') return false;
  const t = rec.t || 0;
  const now = Math.floor(Date.now() / 1000);
  if (now - t > CACHE_TTL) return false;
  if (t < todayStart()) return false;
  return true;
}

// 大淘客批量解析：cb(map{gid -> rate})
// v2.27：CPS 链接改写（与 feed.response.js 同一套逻辑，默认开启）
// 拼多多自购比价规则要求第一次点击就落在 CPS 链路上，否则事后转链也不计佣金。
const CPS_RW = (function () {
  const v = A.cps_rewrite;
  if (v === undefined || v === null || v === '') return true;   // 默认开启
  return v === true || v === 1 || v === 'true' || v === '1' || v === 'on' || v === 'ON';
})();

function rewriteLink(g, ent) {
  if (!CPS_RW || !ent || !ent.link) return false;
  const cur = g.link_url;
  if (typeof cur !== 'string') return false;
  if (cur.indexOf('duo_coupon_landing.html') === 0) return false;   // 幂等
  g.link_url = ent.link;
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
    const map = {};
    for (let i = 0; i < list.length; i++) {
      const g = (list[i] || {}).goods || {};
      const rate = parseFloat(g.rate);
      if (!(rate > 0)) continue;
      const link = list[i].item_link;
      if (typeof link !== 'string') continue;
      const m = link.match(/[?&]goods_id=(\d+)/);
      if (m && !map[m[1]]) {
        // v2.27：同时返回 item_link（相对路径），供 link_url 改写用
        const rel = link.replace(/^https?:\/\/[^/]+\//, '');
        map[m[1]] = { rate: rate, link: rel.indexOf('duo_coupon_landing.html') === 0 ? rel : '' };
      }
    }
    cb(map);
  });
}

try {
  if (!CPS_LB || !CPS_TOKEN) { $done({}); return; }

  const body = $response && $response.body;
  if (!body) { $done({}); return; }

  let j;
  try { j = JSON.parse(body); } catch (e) { $done({}); return; }

  const gl = j && j.result && Array.isArray(j.result.goods_list_v2) ? j.result.goods_list_v2 : null;
  if (!gl || !gl.length) { $done({}); return; }

  // 只挑百补精选主列表的商品
  const targets = [];
  for (let i = 0; i < gl.length; i++) {
    const g = gl[i];
    if (!g || g.place_id !== PLACE) continue;
    const gid = g.goods_id != null ? String(g.goods_id) : '';
    if (gid) targets.push(g);
  }
  if (!targets.length) { $done({}); return; }

  const order = [];
  for (let i = 0; i < targets.length && order.length < CPS_BATCH; i++) {
    order.push(String(targets[i].goods_id));
  }

  const cache = cacheLoad();
  const map = {};
  const need = [];
  for (let i = 0; i < order.length; i++) {
    const gid = order[i];
    if (cacheFresh(cache[gid])) map[gid] = { rate: cache[gid].r, link: cache[gid].l || '' };
    else need.push(gid);
  }

  const apply = (fetched) => {
    if (fetched) for (const k in fetched) map[k] = fetched[k];
    let n = 0;
    for (let i = 0; i < targets.length; i++) {
      const g = targets[i];
      const gid = String(g.goods_id);
      const ent = map[gid];
      const rate = ent ? ent.rate : 0;
      if (!(rate > 0)) continue;
      if (rewriteLink(g, ent)) n++;              // v2.27 链接改写
      const text = '佣金' + fmtRate(rate) + '%';
      const bt = g.activity_price_word_before_tag;
      if (bt && typeof bt === 'object') {
        if (bt.text === text) continue;          // 幂等
        bt.text = text;                          // 保留 type / tag_ext（图标）
        n++;
      } else {
        if (g.activity_price_word === text) continue;
        g.activity_price_word = text;            // 无 before_tag 时回落
        n++;
      }
    }
    if (!n) { $done({}); return; }
    $done({ body: JSON.stringify(j) });
  };

  if (!need.length) { apply(null); return; }

  cpsFetch(need, function (fetched) {
    if (fetched) {
      const now = Math.floor(Date.now() / 1000);
      for (const gid in fetched) cache[gid] = { r: fetched[gid].rate, l: fetched[gid].link || '', t: now };
      cacheSave(cache);
    }
    apply(fetched);
  });
} catch (e) {
  $done({});
}
