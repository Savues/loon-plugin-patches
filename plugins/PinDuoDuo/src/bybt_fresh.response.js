/*
 * bybt_fresh.response.js —— 百补 goods_fresh 接口显示佣金率（自研脚本）
 *
 * 端点：POST https://api.pinduoduo.com/api/brand-zara/bybt/goods_fresh
 *
 * 为什么需要它
 * ------------
 * 这个接口在多个场景被调用，每次都返回「券后」并覆盖页面：
 *   BYBT_MAIN                 → 百补「精选」（before_tag 有值，改 before_tag）
 *   BYBT_FOLLOW_BUY_GOODS     → 常买清单
 *   SPECIAL_SALE_PAGE_GOODS   → 消费券专区（从商品详情页返回时重刷，
 *                               会把 subsidy_api.response.js 改好的覆盖回「券后」）
 *
 * 响应结构（map，不是数组）：
 *   result.bgp_fresh_goods_info_map[place_id][goods_id] = { activity_price_word, ... }
 *
 * 改哪个字段
 * ----------
 *   - 有 activity_price_word_before_tag 时改它的 .text（前端 W = BeforeTag.text || priceWord）
 *   - 否则改 activity_price_word
 *
 * 开关：cps_label / cps_token / cps_ttl（共用 pddCpsCache）
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

  const mapObj = j && j.result && j.result.bgp_fresh_goods_info_map;
  if (!mapObj || typeof mapObj !== 'object') { $done({}); return; }

  // 收集所有 place 下的商品对象
  const targets = [];
  for (const place in mapObj) {
    const goods = mapObj[place];
    if (!goods || typeof goods !== 'object') continue;
    for (const gid in goods) {
      const g = goods[gid];
      if (g && typeof g === 'object') targets.push({ gid: String(gid), g: g });
    }
  }
  if (!targets.length) { $done({}); return; }

  const order = [];
  const seen = {};
  for (const t of targets) {
    if (seen[t.gid]) continue;
    seen[t.gid] = 1;
    if (order.length < CPS_BATCH) order.push(t.gid);
  }

  const cache = cacheLoad();
  const map = {};
  const need = [];
  for (const gid of order) {
    if (cacheFresh(cache[gid])) map[gid] = { rate: cache[gid].r, link: cache[gid].l || '' };
    else need.push(gid);
  }

  const apply = (fetched) => {
    if (fetched) {
      const now = Math.floor(Date.now() / 1000);
      for (const gid in fetched) {
        map[gid] = fetched[gid];
        cache[gid] = { r: fetched[gid].rate, l: fetched[gid].link || '', t: now };
      }
      cacheSave(cache);
    }
    let n = 0;
    for (const t of targets) {
      const ent = map[t.gid];
      const rate = ent ? ent.rate : 0;
      if (!(rate > 0)) continue;
      if (rewriteLink(t.g, ent)) n++;            // v2.27 链接改写
      const text = '佣金' + fmtRate(rate) + '%';
      const g = t.g;
      const bt = g.activity_price_word_before_tag;
      if (bt && typeof bt === 'object') {
        if (bt.text === text) continue;          // 幂等
        bt.text = text;                          // 保留 type / tag_ext（图标）
        n++;
      } else {
        if (g.activity_price_word === text) continue;
        g.activity_price_word = text;
        n++;
      }
    }
    if (!n) { $done({}); return; }
    $done({ body: JSON.stringify(j) });
  };

  if (!need.length) { apply(null); return; }
  cpsFetch(need, apply);
} catch (e) {
  $done({});
}
