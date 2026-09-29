/*
 * stub.response.js —— 按开关把指定接口的响应替换为 {}（或删字段）
 *
 * 为什么用脚本而不是 [Rewrite] reject-dict
 * ----------------------------------------
 * Loon 官方手册的 rewrite.md **没有 enable= 这个参数**（script.md 才有）。
 * v1.3~v1.4 把 enable={api_stub} 挂在 16 条 [Rewrite] 上，真机实测
 * 全部失效：/search_hotquery 等端点从「拦截」变成「放行」，
 * 而同一时刻脚本里读到的开关却是开的。
 *
 * 于是改用 [Script] + argument=[{...}]，与 homepage.response.js 同一套机制，
 * 已验证可用。
 *
 * 两种动作：
 *   stub  —— 返回 200 + {}（等价原 reject-dict）
 *   del   —— 删掉响应体里的指定字段（用于 /search 的 expansion）
 */

const A = (typeof $argument === 'string' ? {} : $argument) || {};
const on = (v) => v === true || v === 1 || v === 'true' || v === '1' || v === 'on' || v === 'ON';

// [开关, 动作, 路径, 动作参数]
const RULES = [
  ['chat_stub', 'stub', '/api/zaire_biz/chat/resource/get_list_data'],
  ['chat_stub', 'stub', '/api/caterham/v3/query/new_chat_group'],
  ['chat_stub', 'stub', '/api/caterham/v3/query/personal'],
  ['chat_stub', 'stub', '/api/buffon/nasus/recommend'],

  ['phantom_stub', 'stub', '/api/phantom/gbdbpdv/extra'],
  ['order_stub', 'stub', '/api/caterham/v3/query/my_order_group'],

  ['search_stub', 'stub', '/search_hotquery'],
  ['search_stub', 'del', '/search', ['expansion']],

  ['api_stub', 'stub', '/api/aristotle/unrated_order_for_unreceived_tab'],
  ['api_stub', 'stub', '/api/aristotle/query_order_list_tabs_element'],
  ['api_stub', 'stub', '/api/aquarius/hungary/global/homepage'],
  ['api_stub', 'stub', '/api/caterham/v3/query/order_express_group'],
  ['api_stub', 'stub', '/api/alexa/goods/back_up'],
  ['api_stub', 'stub', '/api/brand-olay/goods_detail/bybt_guide'],
  ['api_stub', 'stub', '/api/engels/reviews/require/append'],
  ['api_stub', 'stub', '/api/caterham/v3/query/likes'],
  ['api_stub', 'stub', '/api/manufacturer/cross/shortcut/list'],
  ['api_stub', 'stub', '/api/dunkirk/liveactivity/push/create/url/report'],
  ['api_stub', 'stub', '/api/growth/nagato/app/index/gather'],
  ['api_stub', 'stub', '/api/engels/wait/receive/review'],
  ['api_stub', 'stub', '/api/caterham/v2/query/goods_detail_with_tags'],
];

function pathOf(url) {
  try {
    const m = String(url).match(/^[a-z]+:\/\/[^/]+(\/[^?#]*)/i);
    return m ? m[1] : '';
  } catch (e) { return ''; }
}

try {
  const p = pathOf($request && $request.url);
  const rule = RULES.find(([, , path]) => path === p);
  // 没命中任何规则 → 原样放行
  if (!rule) { $done({}); return; }

  const [sw, action, , arg] = rule;
  // 开关关着 → 原样放行
  if (!on(A[sw])) { $done({}); return; }

  if (action === 'stub') {
    // 等价 Loon 的 reject-dict：200 + 空 JSON 对象
    $done({ status: 200, body: '{}' });
    return;
  }

  // del：删字段
  const body = $response && $response.body;
  if (!body) { $done({}); return; }
  let j;
  try { j = JSON.parse(body); } catch (e) { $done({}); return; }
  for (const k of (arg || [])) {
    if (Object.prototype.hasOwnProperty.call(j, k)) delete j[k];
  }
  $done({ body: JSON.stringify(j) });
} catch (e) {
  // 兜底：任何异常都放行，绝不因脚本出错阻断请求
  $done({});
}
