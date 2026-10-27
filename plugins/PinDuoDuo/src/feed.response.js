/*
 * feed.response.js —— 给信息流里的广告商品打「广告」标（自研脚本）
 *
 * 端点：GET /api/alexa/cells/hub/v3（首页/搜索信息流，engine_version=3.0）
 *
 * 背景
 * ----
 * 拼多多在信息流里混竞价广告，但把客户端自带的广告角标压掉了：
 * 实测（2026-10-21 冷启动 HAR，10 条商品 5 条广告）广告项与非广告项的
 * `need_ad_logo` 一律是 false —— 客户端有这个原生机制，服务端故意不开。
 *
 * 服务端区分广告的唯一可靠标记是 `data.ad` 字段（正常推荐没有）：
 *   "ad": { "bkfl": 1, "mark": "...", "nbid": "...",
 *           "openinfo": { "ads_from": 0, "ad_id": 7123468285, "is_tr": 1 } }
 *
 * 本脚本不删任何商品，只做三重标记（哪个能渲染出来算哪个，真机验证后可收敛）：
 *   1. `need_ad_logo = true` —— 客户端原生的广告角标开关
 *   2. `data.tag_list` 头部插入红字「广告」—— 与真实下发的
 *      「立减5元」(#E02E24) / 「坏了包赔」(#25B513) 标签完全同构
 *   3. `sales_tip` 加「广告·」前缀 —— 灰字销量行，兜底可见
 *
 * 开关：feed_ad（挂 [Script] argument=[{feed_ad}]，Loon 的 enable= 只在
 * [Script] 上有效 —— [Rule]/[Rewrite] 上是死开关，v1.75 的教训）。
 * 任何异常一律放行原响应，绝不因脚本出错让信息流加载失败。
 */

// $argument 三种形态都要兼容：对象 / 数组 / JSON 字符串
// （仓库历史事故 v3.37.3：只处理对象形态，真机传数组时全部开关失效）
// $argument 三种形态都要兼容：对象 / 数组(每项是 {key:value}) / JSON 字符串
// ⚠️ 数组形态曾经只取 v[0] → 真机上 item 顺序不保证，导致部分开关读不到
//    （v2.02 事故：cps_rewrite 生效但 feed_ad 丢失，广告标全没了）
const A = (function (raw) {
  let v = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch (e) { v = {}; }
  }
  if (Array.isArray(v)) {
    const merged = {};
    for (let i = 0; i < v.length; i++) {
      const it = v[i];
      if (it && typeof it === 'object' && !Array.isArray(it)) {
        for (const k in it) merged[k] = it[k];
      }
    }
    v = merged;
  }
  return (v && typeof v === 'object') ? v : {};
})($argument);
const on = (v) => v === true || v === 1 || v === 'true' || v === '1' || v === 'on' || v === 'ON';

const AD_TEXT = '广告';
const AD_COLOR = '#E02E24';
const AD_KEY = 'pddAdGoodsIds';
const AD_CAP = 200;

// ── $persistentStore 名单写入（write(value, key)，值在前键在后！）────
// ⚠️ 这是仓库里踩过的坑（Splash-Festival v37）：write(key, value) 不报错
// 但等于把键名当值存，read 永远回 null。此处签名必须值在前。
function recordIds(ids) {
  try {
    $persistentStore.write(JSON.stringify(ids.slice(0, AD_CAP)), AD_KEY);
  } catch (e) { /* 存储不可用不阻断打标 */ }
}

// ── CPS 链接改写 ──────────────────────────────────────────────
// 拼多多自购比价规则：首次进入若是自然流量，之后转链再买也不计佣金。
// 所以必须在列表响应里就把 link_url 换成 CPS 链。
//
// 2026-10-27 真机实证（shared-339D936B_550，cps_rewrite 开启）：
//   客户端**确实读取 link_url**，真实发出：
//     https://m.pinduoduo.net/duo_coupon_landing.html?duoduo_type=2&pid=…
//       &campaign=ddjb&page_from=26&_pdd_fs=1&thumb_url=…&goods_id=946972224769
//   但只带 goods_id、缺 goods_sign → 领券页回落成「商品已售罄」。
//   故必须补 goods_sign；来源 = 大淘客解析接口（实测一次可批量 20 个，
//   10 个耗时 1.14s，返回全部带 goods_sign）。
//
// Loon 同 URL 只跑首个命中的 [Script]，故内联本文件而非另起规则。
const CPS_RW = on(A.cps_rewrite);
const CPS_LB = on(A.cps_label);
const CPS_ON = CPS_RW || CPS_LB;
const CPS_PROBE = on(A.cps_probe);
const CPS_PID = (typeof A.cps_pid === 'string' && A.cps_pid) ? A.cps_pid : '41096949_318859099';
const CPS_TOKEN = (typeof A.cps_token === 'string') ? A.cps_token.trim() : '';
const CPS_BATCH = 20;
const CPS_API = 'https://dtkapi.ffquan.cn/taobaoapi/parsing-content-three-in-one';
const CPS_GID_RE = /[?&]goods_id=(\d+)/;
const CPS_MAX_DEPTH = 10;
// 销量行显示宽度预算（CJK/全角=2，ASCII=1）。真机实测：
//   · 广告商品：「广告」徽标额外吃掉约 6 单位 → 直接只显示「广告·佣金x.x%」（13）
//   · 非广告商品：2026-10-27 实测「佣金3.5%·已拼8719件」（19）在部分卡片上整段不显示，
//     而同列表的「佣金0.1%」（8）正常 → 实际可用宽度约 10~14，取 14 保守值
const CPS_BUDGET = (function () {
  const v = parseInt(A.cps_budget, 10);
  return v > 6 ? v : 14;
})();

// 收集本屏 goods_id（顺序去重，截到 CPS_BATCH）
function cpsCollect(node, depth, order, seen) {
  if (!node || typeof node !== 'object' || depth > CPS_MAX_DEPTH) return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) cpsCollect(node[i], depth + 1, order, seen);
    return;
  }
  const keys = Object.keys(node);
  for (let i = 0; i < keys.length; i++) {
    const v = node[keys[i]];
    if (keys[i] === 'link_url' && typeof v === 'string') {
      const m = v.match(CPS_GID_RE);
      if (m && !seen[m[1]]) {
        seen[m[1]] = 1;
        if (order.length < CPS_BATCH) order.push(m[1]);
      }
    } else if (v && typeof v === 'object') {
      cpsCollect(v, depth + 1, order, seen);
    }
  }
}

// 按 map{gid -> {rel, rate}} 替换 link_url，返回替换条数
function cpsApply(node, depth, map, st) {
  if (!CPS_RW) return;
  if (!node || typeof node !== 'object' || depth > CPS_MAX_DEPTH) return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) cpsApply(node[i], depth + 1, map, st);
    return;
  }
  const keys = Object.keys(node);
  for (let i = 0; i < keys.length; i++) {
    const v = node[keys[i]];
    if (keys[i] === 'link_url' && typeof v === 'string') {
      const m = v.match(CPS_GID_RE);
      if (m && map[m[1]]) { node[keys[i]] = map[m[1]].rel; st.n++; }
    } else if (v && typeof v === 'object') {
      cpsApply(v, depth + 1, map, st);
    }
  }
}

// 探针已废弃（v2.03 起 link_url 改写由真机实证成立，不再需要篡改探测）

// ── 本地缓存（列表用；详情页强制绕过，见 detail.response.js）────────
// 缓存结构：{ "<goods_id>": { r: rate, l: item_link(相对路径), t: 写入时间(秒) } }
// 为什么可以缓存：goods_sign 对同一商品稳定（实测多次调用完全一致），
// 佣金率变化也慢（商家改佣金是低频操作）。cpsSign 内嵌当日日期，所以
// 过期时间取 min(cps_ttl, 跨天)，默认 6 小时且不跨自然日。
const CPS_CACHE_KEY = 'pddCpsCache';
const CPS_CACHE_TTL = (function () {
  const v = parseInt(A.cps_ttl, 10);
  return v > 0 ? v : 21600;          // 默认 6 小时
})();
const CPS_CACHE_CAP = 300;

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
    // 超量时按写入时间淘汰最旧的
    if (keys.length > CPS_CACHE_CAP) {
      keys.sort((a, b) => (o[a].t || 0) - (o[b].t || 0));
      for (let i = 0; i < keys.length - CPS_CACHE_CAP; i++) delete o[keys[i]];
    }
    $persistentStore.write(JSON.stringify(o), CPS_CACHE_KEY);
  } catch (e) { /* 存储不可用不影响主流程 */ }
}

// 当天 0 点的时间戳（秒），用于「不跨自然日」判断
function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function cacheFresh(rec) {
  if (!rec || typeof rec !== 'object') return false;
  const t = rec.t || 0;
  const now = Math.floor(Date.now() / 1000);
  if (now - t > CPS_CACHE_TTL) return false;
  if (t < todayStart()) return false;        // 跨天作废（cpsSign 含日期）
  return true;
}

// 大淘客批量解析：cb(map) 成功 / cb(null) 失败
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
    let j2;
    try { j2 = JSON.parse(data); } catch (e) { cb(null); return; }
    const list = j2 && j2.data && j2.data.pdd && j2.data.pdd.data;
    if (!Array.isArray(list)) { cb(null); return; }
    const map = {};
    for (let i = 0; i < list.length; i++) {
      const it = list[i] || {};
      const g = it.goods || {};
      // 只改写「确实在多多进宝里、有佣金」的商品。
      // 未进进宝的商品 rate=0：改写不产生任何佣金，只会多跳一次领券页
      // （反而更容易撞上「商品已售罄」），因此原样保留。
      const rate = parseFloat(g.rate);
      if (!(rate > 0)) continue;
      const link = it.item_link;
      if (typeof link !== 'string') continue;
      const rel = link.replace(/^https?:\/\/[^/]+\//, '');
      if (rel.indexOf('duo_coupon_landing.html') !== 0) continue;
      const m = rel.match(CPS_GID_RE);
      if (m && !map[m[1]]) map[m[1]] = { rel: rel, rate: rate };   // 原样保留 goods_sign / cpsSign / authDuoId
    }
    cb(map);
  });
}

// 佣金率标签：只给「确实有佣金」的商品加，插在「广告」标之后、其余标签之前
function cpsLabel(j, map) {
  const list = j && j.data && Array.isArray(j.data.goods_list) ? j.data.goods_list : null;
  if (!list) return 0;
  let n = 0;
  for (const cell of list) {
    const d = cell && typeof cell === 'object' ? cell.data : null;
    if (!d || typeof d !== 'object') continue;
    const gid = d.goods_id != null ? String(d.goods_id) : '';
    if (!gid || !map[gid]) continue;
    const rate = map[gid].rate;
    if (!(rate > 0)) continue;

    // v2.08 优先级（真机实测得出）：广告提示 > 佣金率 > 已拼/已售文案
    //   · 广告商品的「广告·」前缀会被客户端渲染成徽标并吃掉约 6 个宽度单位，
    //     留给后面文本的只剩约 16；我们上一版把前缀删了反而整段不渲染（w=19/20 全消失）。
    //   · 所以：广告商品保留前缀 + 佣金，直接放弃销量文案；非广告商品可带销量。
    const isAd = !!(d.ad || d.need_ad_logo);
    const seg = '佣金' + fmtRate(rate) + '%';
    let hit = 0;

    for (const key of ['sales_tip', 'fallback_sales_tip']) {
      const v = d[key];
      if (typeof v !== 'string' || !v) continue;
      // 幂等：已标过且没超预算才跳过；超预算的（旧版遗留）重新算一遍
      if (v.indexOf('佣金') >= 0 && width(v) <= CPS_BUDGET) { hit++; continue; }
      // 超预算的旧文本：先剥掉已有佣金段，再重新按预算拼
      let base = v.replace(/^广告·/, '').replace(/^佣金[0-9.]+%·?/, '');
      const sales = base.replace('本店已拼', '已拼').replace('全店总售', '总售').replace('热销', '已拼');

      let out;
      if (isAd) {
        // 广告：前缀 + 佣金（14 宽），销量文案一律舍弃
        out = '广告·' + seg;
      } else {
        // 非广告：优先带销量，放不下就只留佣金
        const full = seg + '·' + sales;
        const short = seg + '·' + sales.replace(/^(已拼|已抢|已抢购|总售|热销|疯抢|全店|本店)+/, '');
        if (width(full) <= CPS_BUDGET) out = full;
        else if (width(short) <= CPS_BUDGET) out = short;
        else out = seg;
      }
      d[key] = out;
      hit++;
    }
    if (hit) n++;
  }
  return n;
}

// 估算显示宽度：CJK/全角算 2，ASCII 算 1
function width(s) {
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    w += s.charCodeAt(i) > 0x2e80 ? 2 : 1;
  }
  return w;
}

// 9.6 -> "9.6" / 5 -> "5" / 12.50 -> "12.5"
function fmtRate(v) {
  const s = String(Math.round(v * 10) / 10);
  return s.indexOf('.') >= 0 ? s : s;
}

// 广告打标（原逻辑，抽成函数以便与异步 CPS 改写共存）
function markAds(j) {
  const list = j && j.data && Array.isArray(j.data.goods_list) ? j.data.goods_list : null;
  if (!list) return 0;

  let marked = 0;
  for (const cell of list) {
    const d = cell && typeof cell === 'object' ? cell.data : null;
    if (!d || typeof d !== 'object' || !d.ad) continue;   // 只有服务端打了广告标的才处理

    // 1) 原生广告角标
    d.need_ad_logo = true;

    // 2) 文字标签（与「立减5元」同构，插最前面）
    if (!Array.isArray(d.tag_list)) d.tag_list = [];
    if (!d.tag_list.some((x) => x && typeof x === 'object' && x.text === AD_TEXT)) {
      d.tag_list.unshift({ type: 1, text: AD_TEXT, text_color: AD_COLOR });
    }

    // 3) 卡片销量行（含备用文案 fallback_sales_tip：实测客户端在这类商品上
    //    渲染的是它而不是 sales_tip——2026-10-21 另一台设备首页抓包证实）
    for (const key of ['sales_tip', 'fallback_sales_tip']) {
      const v = d[key];
      if (typeof v !== 'string' || !v) continue;
      if (v.startsWith(AD_TEXT + '·')) continue;
      // 已被 cpsLabel 接管的文本（含佣金）不再加前缀：那会把它撑爆宽度预算
      if (v.indexOf('佣金') >= 0) continue;
      d[key] = AD_TEXT + '·' + v;
    }

    marked++;
  }

  // 把本屏广告 goods_id 记进名单（新在前，去重，环形裁到 AD_CAP）
  if (typeof $persistentStore !== 'undefined' && marked > 0) {
    let prev = [];
    try {
      const raw = $persistentStore.read(AD_KEY);
      const arr = raw ? JSON.parse(String(raw)) : [];
      if (Array.isArray(arr)) prev = arr.map(String);
    } catch (e) { prev = []; }
    const now = [];
    for (const cell of list) {
      const d2 = cell && cell.data;
      if (!d2 || !d2.ad || d2.goods_id === undefined) continue;
      const gid = String(d2.goods_id);
      if (now.indexOf(gid) === -1) now.push(gid);
    }
    for (const g of prev) if (now.indexOf(g) === -1 && now.length < AD_CAP) now.push(g);
    recordIds(now);
  }

  return marked;
}

function finish(j, marked, rewritten) {
  if (!marked && !rewritten) { $done({}); return; }   // 无改动则原样放行，省一次序列化
  $done({ body: JSON.stringify(j) });
}

try {
  if (!on(A.feed_ad) && !CPS_ON) { $done({}); return; }

  const body = $response && $response.body;
  if (!body) { $done({}); return; }

  let j;
  try { j = JSON.parse(body); } catch (e) { $done({}); return; }

  // 注意：广告打标会往 sales_tip 前加「广告·」，必须放在佣金处理之后，
  // 否则先加前缀会把原本能显示的短文本撑爆预算。
  let marked = 0;
  const applyAds = () => { if (on(A.feed_ad)) marked = markAds(j); };

  // 诊断：把实际收到的 $argument 形态写进首个商品的 sales_tip，随 HAR 一起回传
  let probed = 0;
  if (CPS_PROBE) {
    try {
      let first = null;
      (function find(n, d) {
        if (first || !n || typeof n !== 'object' || d > 6) return;
        if (Array.isArray(n)) { for (let i = 0; i < n.length && !first; i++) find(n[i], d + 1); return; }
        if (n.sales_tip || n.goods_id) { first = n; return; }
        for (const k in n) { find(n[k], d + 1); if (first) return; }
      })(j, 0);
      if (first) {
        const raw = typeof $argument === 'string' ? $argument : JSON.stringify($argument);
        first.sales_tip = 'ARG=' + String(raw).slice(0, 88);
        probed = 1;
      }
    } catch (e) { /* 诊断失败不影响主流程 */ }
  }

  if (!CPS_ON) { applyAds(); finish(j, marked + probed, 0); return; }

  const order = [];
  try { cpsCollect(j, 0, order, {}); } catch (e) { /* 结构异常则不改写 */ }
  if (!order.length) { applyAds(); finish(j, marked + probed, 0); return; }

  // 先查本地缓存：命中的直接进 map，只把未命中的拿去请求
  const cache = cacheLoad();
  const map = {};
  const need = [];
  for (let i = 0; i < order.length; i++) {
    const gid = order[i];
    const rec = cache[gid];
    if (cacheFresh(rec)) map[gid] = { rel: rec.l, rate: rec.r };
    else need.push(gid);
  }

  const applyAll = (fetched) => {
    let n = 0;
    if (fetched) for (const k in fetched) map[k] = fetched[k];
    if (Object.keys(map).length) {
      const st = { n: 0 };
      try { cpsApply(j, 0, map, st); n = st.n; } catch (e) { n = 0; }
      if (CPS_LB) {
        try { n += cpsLabel(j, map); } catch (e) { /* 标签失败不影响改写 */ }
      }
    }
    applyAds();                      // 广告打标放最后
    finish(j, marked + probed, n);
  };

  if (!need.length) { applyAll(null); return; }   // 全部命中缓存，零请求

  cpsFetch(need, function (fetched) {
    if (fetched) {
      const now = Math.floor(Date.now() / 1000);
      for (const gid in fetched) {
        cache[gid] = { r: fetched[gid].rate, l: fetched[gid].rel, t: now };
      }
      cacheSave(cache);
    }
    applyAll(fetched);
  });
} catch (e) {
  $done({});
}
