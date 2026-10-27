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
const A = (function (raw) {
  let v = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch (e) { v = {}; }
  }
  if (Array.isArray(v)) v = v[0] || {};
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
const CPS_ON = on(A.cps_rewrite);
const CPS_PROBE = on(A.cps_probe);
const CPS_PID = (typeof A.cps_pid === 'string' && A.cps_pid) ? A.cps_pid : '41096949_318859099';
const CPS_TOKEN = (typeof A.cps_token === 'string') ? A.cps_token.trim() : '';
const CPS_BATCH = 20;
const CPS_API = 'https://dtkapi.ffquan.cn/taobaoapi/parsing-content-three-in-one';
const CPS_GID_RE = /[?&]goods_id=(\d+)/;
const CPS_MAX_DEPTH = 10;

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

// 按 map{gid -> 相对路径+query} 替换 link_url，返回替换条数
function cpsApply(node, depth, map, st) {
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
      if (m && map[m[1]]) { node[keys[i]] = map[m[1]]; st.n++; }
    } else if (v && typeof v === 'object') {
      cpsApply(v, depth + 1, map, st);
    }
  }
}

// 探针：只把第一个 link_url 换成不存在的页型
function cpsProbeFirst(node, depth, st) {
  if (st.n || !node || typeof node !== 'object' || depth > CPS_MAX_DEPTH) return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) cpsProbeFirst(node[i], depth + 1, st);
    return;
  }
  const keys = Object.keys(node);
  for (let i = 0; i < keys.length; i++) {
    const v = node[keys[i]];
    if (keys[i] === 'link_url' && typeof v === 'string') {
      const m = v.match(CPS_GID_RE);
      if (m) { node[keys[i]] = 'zzz_probe_test.html?goods_id=' + m[1]; st.n = 1; return; }
    } else if (v && typeof v === 'object') {
      cpsProbeFirst(v, depth + 1, st);
    }
  }
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
      if (m && !map[m[1]]) map[m[1]] = rel;   // 原样保留 goods_sign / cpsSign / authDuoId
    }
    cb(map);
  });
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
      if (typeof d[key] === 'string' && d[key] && !d[key].startsWith(AD_TEXT + '·')) {
        d[key] = AD_TEXT + '·' + d[key];
      }
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

  const marked = on(A.feed_ad) ? markAds(j) : 0;

  if (!CPS_ON) { finish(j, marked, 0); return; }

  const order = [];
  try { cpsCollect(j, 0, order, {}); } catch (e) { /* 结构异常则不改写 */ }
  if (!order.length) { finish(j, marked, 0); return; }

  if (CPS_PROBE) {
    const st = { n: 0 };
    try { cpsProbeFirst(j, 0, st); } catch (e) { st.n = 0; }
    finish(j, marked, st.n);
    return;
  }

  cpsFetch(order, function (map) {
    let n = 0;
    if (map) {
      const st = { n: 0 };
      try { cpsApply(j, 0, map, st); n = st.n; } catch (e) { n = 0; }
    }
    finish(j, marked, n);
  });
} catch (e) {
  $done({});
}
