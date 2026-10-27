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

// ── CPS 链接改写（见 src/cps_link.response.js 的设计说明）────────────
// 拼多多自购比价规则要求**第一次点击**就落在 CPS 链接上，所以必须在列表
// 响应里就把 link_url 换掉。因为 Loon 同 URL 只跑首个命中的 [Script]，
// 这段必须内联在本文件，不能另起一条规则。
const CPS_PID = (typeof A.cps_pid === 'string' && A.cps_pid) ? A.cps_pid : '41096949_318859099';
const CPS_ON = on(A.cps_rewrite);
const CPS_PROBE = on(A.cps_probe);
const CPS_PROBE_PATH = 'zzz_probe_test.html';
const RE_GID = /[?&]goods_id=(\d+)/;
const CPS_MAX_DEPTH = 9;

function cpsLink(gid) {
  return 'duo_coupon_landing.html?goods_id=' + gid +
    '&pid=' + encodeURIComponent(CPS_PID) +
    '&campaign=ddjb&duoduo_type=2';
}

function cpsWalk(node, depth, st) {
  if (!node || typeof node !== 'object' || depth > CPS_MAX_DEPTH) return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) cpsWalk(node[i], depth + 1, st);
    return;
  }
  const keys = Object.keys(node);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = node[k];
    if (k === 'link_url' && typeof v === 'string') {
      const m = v.match(RE_GID);
      if (!m) continue;
      if (CPS_PROBE) {
        if (!st.hit) { node[k] = CPS_PROBE_PATH + '?goods_id=' + m[1]; st.hit = 1; st.n++; }
        continue;                       // 探针模式只动第一个，其余原样
      }
      node[k] = cpsLink(m[1]);
      st.n++;
    } else if (v && typeof v === 'object') {
      cpsWalk(v, depth + 1, st);
    }
  }
}

try {
  if (!on(A.feed_ad) && !CPS_ON) { $done({}); return; }

  const body = $response && $response.body;
  if (!body) { $done({}); return; }

  let j;
  try { j = JSON.parse(body); } catch (e) { $done({}); return; }

  // ① 先做链接改写（与 ad 打标互不影响）
  let rewritten = 0;
  if (CPS_ON) {
    const st = { n: 0, hit: 0 };
    try { cpsWalk(j, 0, st); rewritten = st.n; } catch (e) { rewritten = 0; }
  }

  const list = j && j.data && Array.isArray(j.data.goods_list) ? j.data.goods_list : null;

  let marked = 0;
  if (!on(A.feed_ad) || !list) {
    if (!rewritten) { $done({}); return; }
    $done({ body: JSON.stringify(j) });
    return;
  }
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

    // ② 卡片销量行（含备用文案 fallback_sales_tip：实测客户端在这类商品上
    //    渲染的是它而不是 sales_tip——2026-10-21 另一台设备首页抓包证实，
    //    「黄金厚切炸猪排」卡片显示的「已抢170件」就是它）
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

  if (!marked && !rewritten) { $done({}); return; }   // 这一屏无改动，原样放行，省一次序列化
  $done({ body: JSON.stringify(j) });
} catch (e) {
  $done({});
}
