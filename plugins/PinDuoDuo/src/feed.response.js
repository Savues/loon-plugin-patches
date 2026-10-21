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

const A = (typeof $argument === 'string' ? {} : $argument) || {};
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

try {
  if (!on(A.feed_ad)) { $done({}); return; }

  const body = $response && $response.body;
  if (!body) { $done({}); return; }

  let j;
  try { j = JSON.parse(body); } catch (e) { $done({}); return; }

  const list = j && j.data && Array.isArray(j.data.goods_list) ? j.data.goods_list : null;
  if (!list) { $done({}); return; }

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

    // 3) 销量灰字前缀（幂等：跑两遍不会叠两个「广告·」）
    if (typeof d.sales_tip === 'string' && d.sales_tip && !d.sales_tip.startsWith(AD_TEXT + '·')) {
      d.sales_tip = AD_TEXT + '·' + d.sales_tip;
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

  if (!marked) { $done({}); return; }   // 这一屏没有广告，原样放行，省一次序列化
  $done({ body: JSON.stringify(j) });
} catch (e) {
  $done({});
}
