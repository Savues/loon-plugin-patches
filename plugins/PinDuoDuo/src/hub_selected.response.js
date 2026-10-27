/*
 * hub_selected.response.js —— 省钱月卡「精选商品」列表显示佣金率（自研脚本）
 *
 * 端点：POST https://api.pinduoduo.com/api/wizard/naga/selected/goods
 *
 * 页面：省钱月卡首页（hub_monthly_card / hub_renew_manage 的 H5）
 *   实测该列表首个商品是「佳翼蜻蜓 PCIe4.0 转 NVMe M.2 硬盘转接卡」，
 *   第二个是「专业摄影便携液压云台三脚架」，与用户屏幕一致。
 *
 * 响应结构（注意：没有 result 包装，goods_list 在顶层）：
 *   { has_more, goods_list: [...], hit_new_style, server_time }
 *   字段与首页信息流 cells/hub/v3 的 item.data 完全同构：
 *     goods_id / sales_tip / link_url / tag_list / ad
 *
 * 显示位置：销量行（sales_tip），与首页一致
 *   "本店已拼13.1万+件"  →  "佣金3.2%·已拼13.1万+件"（放得下时）
 *                        →  "佣金3.2%"（超预算时）
 * 链接：link_url 改写为 CPS 领券页（cps_rewrite 控制）
 *
 * 开关：cps_label / cps_rewrite / cps_token / cps_ttl / cps_budget
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

// 链接改写：默认开启（与百补一致）
const CPS_RW = (function () {
  const v = A.cps_rewrite;
  if (v === undefined || v === null || v === '') return true;
  return v === true || v === 1 || v === 'true' || v === '1' || v === 'on' || v === 'ON';
})();

const CACHE_KEY = 'pddCpsCache';
const CACHE_CAP = 300;
const CACHE_TTL = (function () {
  const v = parseInt(A.cps_ttl, 10);
  return v > 0 ? v : 21600;
})();

// 销量行宽度预算（CJK/全角=2，ASCII=1）。月卡页与首页卡片宽度接近，沿用 14。
const BUDGET = (function () {
  const v = parseInt(A.cps_budget, 10);
  return v > 6 ? v : 14;
})();

function fmtRate(v) { return String(Math.round(v * 10) / 10); }

function width(s) {
  let w = 0;
  for (let i = 0; i < s.length; i++) w += s.charCodeAt(i) > 0x2e80 ? 2 : 1;
  return w;
}

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
        const rel = link.replace(/^https?:\/\/[^/]+\//, '');
        map[m[1]] = { rate: rate, link: rel.indexOf('duo_coupon_landing.html') === 0 ? rel : '' };
      }
    }
    cb(map);
  });
}

function rewriteLink(g, ent) {
  if (!CPS_RW || !ent || !ent.link) return false;
  const key = typeof g.link_url === 'string' ? 'link_url'
            : (typeof g.linkUrl === 'string' ? 'linkUrl' : null);
  if (!key) return false;
  if (g[key].indexOf('duo_coupon_landing.html') === 0) return false;   // 幂等
  g[key] = ent.link;
  return true;
}

// 销量行拼佣金：放得下就带原文，放不下只留佣金
function markSales(g, rate) {
  const text = '佣金' + fmtRate(rate) + '%';
  const cur = typeof g.sales_tip === 'string' ? g.sales_tip : '';
  if (cur.indexOf('佣金') === 0) return false;          // 幂等
  // 压缩常见前缀：本店已拼 → 已拼
  const sales = cur.replace(/^本店已拼/, '已拼').replace(/^全店总售/, '总售');
  let out = text;
  if (sales) {
    const full = text + '·' + sales;
    if (width(full) <= BUDGET) out = full;
  }
  if (g.sales_tip === out) return false;
  g.sales_tip = out;
  return true;
}

try {
  if (!CPS_LB || !CPS_TOKEN) { $done({}); return; }

  const body = $response && $response.body;
  if (!body) { $done({}); return; }

  let j;
  try { j = JSON.parse(body); } catch (e) { $done({}); return; }

  const gl = j && Array.isArray(j.goods_list) ? j.goods_list : null;
  if (!gl || !gl.length) { $done({}); return; }

  const order = [];
  const seen = {};
  for (const g of gl) {
    const gid = g && g.goods_id != null ? String(g.goods_id) : '';
    if (!gid || seen[gid]) continue;
    seen[gid] = 1;
    if (order.length < CPS_BATCH) order.push(gid);
  }
  if (!order.length) { $done({}); return; }

  const cache = cacheLoad();
  const map = {};
  const need = [];
  for (const gid of order) {
    const rec = cache[gid];
    // 旧缓存只有 r 没有 l：转链开启时视为未命中
    if (cacheFresh(rec) && (!CPS_RW || rec.l)) {
      map[gid] = { rate: rec.r, link: rec.l || '' };
    } else {
      need.push(gid);
    }
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
    for (const g of gl) {
      if (!g || typeof g !== 'object') continue;
      const gid = g.goods_id != null ? String(g.goods_id) : '';
      const ent = gid ? map[gid] : null;
      if (!ent || !(ent.rate > 0)) continue;
      if (rewriteLink(g, ent)) n++;
      if (markSales(g, ent.rate)) n++;
    }
    if (!n) { $done({}); return; }
    $done({ body: JSON.stringify(j) });
  };

  if (!need.length) { apply(null); return; }
  cpsFetch(need, apply);
} catch (e) {
  $done({});
}
