/*
 * homepage.response.js —— 拼多多首页 hub 响应精简（自研脚本，非上游代码）
 *
 * 承担三件事，其中前两件替代上游写死的 jq：
 *   1. 删掉 icon_set / irregular_banner_dy（等价上游 json-del）
 *   2. 自定义底栏按钮  —— 上游写死只留 index / chat / personal 三项
 *   3. 清掉顶部候选 all_top_opts 的图字段（沿用上游 jq 行为）
 *
 * 开关全部由 [Argument] 经 argument=[{...}] 传入，只读插件参数页。
 * 任何异常都放行原响应，绝不因脚本出错让 App 拿不到首页配置。
 */

const A = (typeof $argument === 'string' ? {} : $argument) || {};

// Loon 的 switch 可能给 true / "true" / 1 / "on"
const on = (v) => v === true || v === 1 || v === 'true' || v === '1' || v === 'on' || v === 'ON';

// 底栏可选项：[开关名, 用于识别该 tab 的 link 特征]
// 特征用「包含匹配」而非全等 —— attendance.html 的 link 带 id 与推广参数，
// 每次下发都不同，写死全等会永远匹配不上。
const BOT = [
  ['Bot_index',  'index.html'],
  ['Bot_chat',   'chat_list.html'],
  ['Bot_personal', 'personal.html'],
  ['Bot_live',   'pdd_live_tab_list.html'],
  ['Bot_class',  'classification.html'],
  ['Bot_attendance', 'attendance.html'],
];

const DEFAULT_BOT = ['index.html', 'chat_list.html', 'personal.html']; // 上游写死的那三项

function pickBots() {
  const picked = BOT.filter(([k]) => on(A[k])).map(([, sig]) => sig);
  // 备用输入框：逗号分隔，同样按「包含」匹配
  const extra = String(A.Bot_custom || '').split(',').map((s) => s.trim()).filter(Boolean);
  const all = picked.concat(extra);
  return all.length ? all : DEFAULT_BOT;
}

function keepTabs(tabs, sigs) {
  if (!Array.isArray(tabs)) return tabs;
  return tabs.filter((t) => t && typeof t === 'object' && typeof t.link === 'string'
    && sigs.some((s) => t.link.includes(s)));
}

try {
  const body = $response.body;
  if (!body) { $done({}); return; }

  let j;
  try { j = JSON.parse(body); } catch (e) { $done({}); return; }

  const r = j && j.result;
  if (!r || typeof r !== 'object') { $done({ body: JSON.stringify(j) }); return; }

  // 1) 去广告字段（仅在总开关开着时才删）
  //    r 已在上方确认是非 null 对象，dy_module 是二级路径，需先确认它存在
  if (on(A.api_stub)) {
    delete r.icon_set;
    if (r.dy_module && typeof r.dy_module === 'object') delete r.dy_module.irregular_banner_dy;
  }

  // 1b) 搜索框轮播词：归 search_stub 管，不归 api_stub
  //     实测该字段是 dict，含 hotqs(20 条) 与 items(20 条)，
  //     与 /search_hotquery 是同一批词的两个来源（首页下发 + 轮询刷新），
  //     两者必须由同一个开关控制，否则关掉 api_stub 时词会从这里漏回来。
  if (on(A.search_stub)) {
    delete r.search_bar_hot_query;
  }

  // 2) 底栏自定义：开关关掉则两个字段都不碰，保持服务端下发
  if (on(A.bottom_custom)) {
    const sigs = pickBots();
    r.bottom_tabs = keepTabs(r.bottom_tabs, sigs);
    r.buffer_bottom_tabs = keepTabs(r.buffer_bottom_tabs, sigs);
  }

  // 3) 顶部候选图字段（沿用上游行为，字段缺失时原样跳过）
  if (on(A.api_stub) && Array.isArray(r.all_top_opts)) {
    r.all_top_opts = r.all_top_opts.map((o) => {
      if (!o || typeof o !== 'object') return o;
      const c = Object.assign({}, o);
      delete c.selected_image; delete c.image; delete c.height; delete c.width;
      return c;
    });
  }

  $done({ body: JSON.stringify(j) });
} catch (e) {
  // 兜底：脚本出错一律放行，绝不阻断首页
  $done({});
}
