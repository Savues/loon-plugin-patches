/*
 * subsidy.response.js —— 百亿补贴页搜索框去推广词（自研脚本）
 *
 * 页面 https://m.pinduoduo.net/brand_activity_subsidy.html 是服务端渲染的 HTML，
 * 搜索框轮播词不在任何 API 里，而是内联在 window.rawData 的 store.searchStore：
 *   "searchStore":{"enable":true,"style":1,"queryWords":["百事可乐","可口可乐",…]}
 * 实测 10 个词里 5 个是推广（百事可乐 ×3、可口可乐、特价饮料）。
 *
 * 复用 search_stub 开关，不新增 [Argument]：首页 search_bar_hot_query、
 * 轮询 /search_hotquery、百亿补贴 queryWords 是同一批推广词的三个来源，
 * 必须由同一个开关管，否则关掉别处这里会漏回来。
 *
 * 不 JSON.parse 整页（672KB）再序列化：只替换目标数组字面量，
 * 其余字节原样透传，零重排风险。
 */

const A = (typeof $argument === 'string' ? {} : $argument) || {};
const on = (v) => v === true || v === 1 || v === 'true' || v === '1' || v === 'on' || v === 'ON';

try {
  const body = $response.body;
  if (!body || !on(A.search_stub)) { $done({}); return; }

  const out = body
    // 轮播词数组：留空数组，搜索框其余部分（enable/style/rightText）不动
    .replace(/("queryWords"\s*:\s*)\[[^\]]*\]/, '$1[]')
    // 轮播占位词：实测下发为空串，但同属这一批推广词，一并清掉
    .replace(/("queryGuideWord"\s*:\s*)"[^"]*"/, '$1""');

  // 没匹配上就原样放行，别把 672KB 整页重新注入一遍
  $done(out === body ? {} : { body: out });
} catch (e) {
  // 兜底：出错一律放行，绝不因脚本问题让百亿补贴页打不开
  $done({});
}
