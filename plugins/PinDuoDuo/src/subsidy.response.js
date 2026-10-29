/*
 * subsidy.response.js —— 百亿补贴页处理（自研脚本）
 *
 * 页面 https://m.pinduoduo.net/brand_activity_subsidy.html 是服务端渲染的 HTML。
 *
 * 职责 1（v1.6 起）：搜索框去推广词
 *   轮播词不在任何 API 里，而是内联在 window.rawData 的 store.searchStore：
 *   "searchStore":{"enable":true,"style":1,"queryWords":["百事可乐","可口可乐",…]}
 *   实测 10 个词里 5 个是推广。字符串级替换，不重排整页。
 *
 * 职责 2（v1.79 起，方案 1+2，用户确认一起做）：百补列表页广告打标
 *   2026-10-21 两份快照实测：rawData.store.tabStore.tabList[*].subTabGoodsLists
 *   [*].list[*] 里 23 个商品有 4 个带 `ad` 字段（转义 JSON 字符串，
 *   bkfl=1 + openinfo.ad_id，与信息流 data.ad 完全同构）——百补列表里混着
 *   竞价广告，且此前无任何标识。
 *
 *   方案 1（确定收益）：把广告商品的 goodsId 并进 $persistentStore 的
 *   pddAdGoodsIds 名单（环形 200，write(value,key) 值在前——仓库踩过的坑），
 *   详情页 detail.response.js 查名单自动打标（复用 v1.77 链路）。
 *
 *   方案 2（tagInfoList 打标）已于 v1.80 移除：2026-10-21 真机实测注入成功
 *   （响应数据层 4 个标签全在）但列表页不可见 —— H5 卡片渲染器不消费
 *   我们注入的该标签，属死代码。
 *
 *   v1.81~v1.93 三通道打标，真机消融后只剩「图片角标」一条。
 *   v1.94（2026-10-22 手机版复现「百补列表看不到广告角标」）——通道重定位：
 *     角标只写 ltIcon（商品图左上角官方角标槽）：
 *       · 手机版列表页 tandy_vase.html 的商品原本**没有 ltIcon 字段**，
 *         旧逻辑只替换已有字符串 → 手机上无处可写；
 *       · goodsFlagIcon 是标题旗标槽，CSS height:.15rem ≈15px，
 *         横幅「广告」在手机上被压到 ~10px 高 → 看不见（iPad 看得见）；
 *       · ltIcon 槽位 CSS .ilx1YR3r{height:.52rem;width:.46rem} ≈46×52px，
 *         官方角标位，配竖版资产 184×208（比例 0.885 = 0.46/0.52）刚好不畸变。
 *     资产：src/assets/ad-badge.png（半透明黑底 + 浅灰白字「广告」竖排），
 *     生成脚本 tools/make-badge.py（corner/wide 两种版式）。
 *
 *   解析失败（如另一页面形态 stores、骨架屏）→ 职责 2 整体跳过，职责 1 照常。
 *
 * 开关：search_stub 管职责 1；feed_ad 管职责 2（与信息流/详情页打标同开关）。
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

const AD_KEY = 'pddAdGoodsIds';
const AD_CAP = 200;
const AD_PREFIX = '广告·';
// 徽章托管：v1.85 起 jsdelivr CDN（国内可达）—— raw.githubusercontent.com
// 在部分线路上不可达，iPad 实测徽章图加载失败出现 WebKit 碎图占位符
// v1.88：徽章内联为 data URI（零网络依赖）——jsdelivr @main 有缓存延迟
// （曾把旧 530×150 缓存了一天），raw.githubusercontent 部分线路不可达，
// data URI 彻底消除 CDN/缓存/设备差异。资产源文件仍在 src/assets/ 备查。
const AD_BADGE_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALgAAADQCAYAAAC0lKvwAAAACXBIWXMAAAsTAAALEwEAmpwYAAAFMUlEQVR4nO3dT2hV2QEH4FMSeGh4CdqQRp9VUmoqTiGZkSA4WLSCIgoBhYBQEeIsdJMs3ChCtiqCCxdZ6KbSjUSySGxWyabNn2KmWi0pdsiA1UkmeRgzkzyiZvBBF53Im0xsZuJ79yV3vg+yOPeee85Z/Ljce865LyEAAAAAAAAAAAAAAAAAQF78LM/tfRJCKM9zm2vd3779owhKiz0AKCQBJ9YEnFgTcGJNwIm1VR3w+vr65L59+34xPDz8Ymho6KtC99Xc3LxjoZzJZOYvXrz4z0L2SeGtuoBv3759/bVr1363bdu26rKysvUhhDA0NDQyNDT01/dt+8GDB39Ip9Nfj4yMfNnf3z/e3d2dXjhXW1tbfuTIkYaF8szMzKyAr32rLuCjo6MvU6lU5UK4Qwhh165d25PJ5GAmk8mutN0zZ87UVFRUlFdUVJTX1tZuPXTo0Mvu7u4/5mXQrFqrLuAhhHDv3r3PDx48+NFCOZFIJI4dO5a6devWs5W22djY+EFueXBw8N/vM0bWhkhXMm/fvv37hoaGHe86nw/Hjx//08OHDzO5x+rr65OdnZ0nc49NTk5OvXr1an6hvG7dukR1dXXlQjmbzb559uxZOizj6dOnU6dPnx78P1WsZBbRqryD59u5c+c+XHwsN8xLKSkpKa2pqUkVblREIfYBb2pqSu3Zs+e3xR4HxVHUgL948eKr2dnZl/lsc25u7u2LaDKZLDl//vz+3PNjY2OTjx49+mLxdVVVVcncx6f5+fn5vr6+ZWdRxsfHM8vVoXiKGvDOzs5/XLlypWAve+3t7R9XVFS8fSfIZrNvWltbexc/o4fwvzt9bsBfv34939LS8mmhxkY0Yv2IMjg4+EVdXd2vFqYcu7q6/r5UuImv2Aa8vr4+OT09/U17e/tfTpw48eGGDRvKR0ZGppqampZ8cayrq/t5brm0tLT0XXWX0t/fPzUxMTG/fE2iFNuANzc378hdmQwhhLa2tqM/9PqysrL1ly5davyh9S9cuNDV0dEx/mPGSOHFNuAQgoATc7ENeEtLy6dmQYhtwCGEIgf8yZMnkUzZnTp1auvJkye/t1z/vs6ePds7Ojqa14Uq8ivSgFdWViaj7G9BdXX1+kLsKykrKyvJd5vkV6QBr6qq2pBbHhsbc/ejoCIL+KZNmxK5HzFks9k3hf4M7V1mZmZmp6enf/Tj0ebNmysTiUSiEGOiMCIL+N69e7+zPfX58+dfR9X3YgMDA5+tZIalr6+v0RbatSWygO/fv/+XueV0Ol2Uuzc/LZEFfPfu3b/OLT9+/HjZr2XgfUUS8KamplTuttUQQrhz586TKPpeys6dOzdfv369Yfma37Vx48aizAKxcpEEvLW19ePc8tjY2GQxt63W1NSkPEv/NBQ84G1tbR8s/v5xeHj4P4XuF0KIIOA3b978/MCBA7/ZsmVLdQghzM3Nvbxx44afbCASBQ/4xMTE/NGjR7s6OjoO19bWbr179+6DYi9v9/T0rGgjlmnCtSeSZ/BMJpM9fPjwn69evfrR5cuX/xVFn7nu378/1dPT8zbQAwMDX66knd7e3s9SqdTba9Pp9Df5GB+F41+YFJ4f/iki22WJNQEn1gScWBNwYk3AiTUBBwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIC7+C6+eaEibysy2AAAAAElFTkSuQmCC';
const AD_BADGE = { text: '广告', type: 'area_ad_mark_selfhost', url: AD_BADGE_URL };

// ── $persistentStore 名单合并（write(value, key)，值在前——仓库踩过的坑）──
function mergeIds(newIds) {
  try {
    let prev = [];
    try {
      const raw = $persistentStore.read(AD_KEY);
      const arr = raw ? JSON.parse(String(raw)) : [];
      if (Array.isArray(arr)) prev = arr.map(String);
    } catch (e) { prev = []; }
    const now = [];
    for (const id of newIds) if (now.indexOf(id) === -1) now.push(id);
    for (const id of prev) if (now.indexOf(id) === -1 && now.length < AD_CAP) now.push(id);
    $persistentStore.write(JSON.stringify(now), AD_KEY);
  } catch (e) { /* 存储不可用不阻断 */ }
}

// 定位 window.rawData 的对象边界并解析（括号配对，处理字符串内转义）
function parseRawData(body) {
  const i = body.indexOf('window.rawData');
  if (i === -1) return null;
  const j = body.indexOf('{', i);
  if (j === -1) return null;
  let depth = 0, instr = false, esc = false;
  for (let k = j; k < body.length; k++) {
    const ch = body[k];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (instr) { if (ch === '"') instr = false; continue; }
    if (ch === '"') instr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { try { return { obj: JSON.parse(body.slice(j, k + 1)), start: j, end: k + 1 }; } catch (e) { return null; } } }
  }
  return null;
}

// 从 rawData 里收集带 ad 字段的商品
// 已知三种形态（均为实测）：
//   raw.store.tabStore…                    brand_activity_subsidy.html 旧模板
//   raw.stores.store.tabStore…             tandy_vase.html 新模板（stores 是 dict）
//   raw.stores[i].store.tabStore…          数组形态（容错预留）
// ── 佣金查询（消费券栏目用，与首页/百补共用 pddCpsCache）────────
const CPS_LB = on(A.cps_label);
const CPS_TOKEN = (typeof A.cps_token === 'string') ? A.cps_token.trim() : '';
const CPS_API = 'https://dtkapi.ffquan.cn/taobaoapi/parsing-content-three-in-one';
const CPS_BATCH = 20;
const CPS_CACHE_KEY = 'pddCpsCache';
const CPS_CACHE_CAP = 300;
const CPS_CACHE_TTL = (function () {
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
    const raw = $persistentStore.read(CPS_CACHE_KEY);
    const o = raw ? JSON.parse(String(raw)) : {};
    return (o && typeof o === 'object') ? o : {};
  } catch (e) { return {}; }
}

function cacheSave(o) {
  try {
    if (typeof $persistentStore === 'undefined') return;
    const keys = Object.keys(o);
    if (keys.length > CPS_CACHE_CAP) {
      keys.sort((a, b) => (o[a].t || 0) - (o[b].t || 0));
      for (let i = 0; i < keys.length - CPS_CACHE_CAP; i++) delete o[keys[i]];
    }
    $persistentStore.write(JSON.stringify(o), CPS_CACHE_KEY);
  } catch (e) { /* 忽略 */ }
}

function cacheFresh(rec) {
  if (!rec || typeof rec !== 'object') return false;
  const t = rec.t || 0;
  const now = Math.floor(Date.now() / 1000);
  if (now - t > CPS_CACHE_TTL) return false;
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
  // 两种命名都要支持：snake_case（接口）与 camelCase（HTML rawData）
  const key = typeof g.link_url === 'string' ? 'link_url'
            : (typeof g.linkUrl === 'string' ? 'linkUrl' : null);
  if (!key) return false;
  const cur = g[key];
  if (cur.indexOf('duo_coupon_landing.html') === 0) return false;   // 幂等
  g[key] = ent.link;
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

// 消费券栏目（tandy_vase.html）：价格前的「券后」是服务端预渲染在 HTML 里的
// 静态文本，不是 JSON 字段：
//   <span class="zlvRmSss">券后</span><span class="mgeHsFie">¥</span>
//   <span class="xZzDH4Sk"><span class="_2TFw6wKu">26</span>...
// 实测只预渲染前 5 个商品，价格整数与 JSON activityPrice 完全同序。
// 用「价格整数」做锚点替换，比按顺序稳。
function rewriteCouponTags(html, rateByPrice) {
  const RE = /(<span class="zlvRmSss">)券后(<\/span><span class="mgeHsFie">¥<\/span><span class="xZzDH4Sk"><span class="_2TFw6wKu">(\d+)<)/g;
  let n = 0;
  const out = html.replace(RE, function (m, head, tail, intPart) {
    const rate = rateByPrice[intPart];
    if (!(rate > 0)) return m;
    n++;
    return head + ('佣金' + fmtRate(rate) + '%') + tail;
  });
  return { html: out, n: n };
}

// 从商品列表建「价格整数 -> 佣金率」映射
function buildPriceRateMap(lists, map) {
  const out = {};
  for (const lst of lists) {
    for (const g of lst) {
      if (!g || typeof g !== 'object') continue;
      const gid = g.goodsId != null ? String(g.goodsId) : '';
      const ent = gid ? map[gid] : null;
        const rate = ent ? ent.rate : 0;
      if (!(rate > 0)) continue;
      const ip = String(g.activityPrice || '').split('.')[0];
      if (ip && !out[ip]) out[ip] = rate;
    }
  }
  return out;
}

// 遍历所有 tab 的商品列表（兼容 store / stores / stores.store 三种形态）
// v2.29：同时收集 tabStore.*GoodsInfoStore.goodsInfoMap（百补首页真正的渲染数据）
//   key 形如 "BYBT_MAIN_693607160697"（前缀 + goodsId），值是商品对象
function eachGoodsList(raw, fn) {
  const stores = [];
  const pushStore = (st) => { if (st && typeof st === 'object' && st.tabStore) stores.push(st); };
  if (raw && raw.store) pushStore(raw.store);
  if (raw && raw.stores) {
    if (Array.isArray(raw.stores)) {
      for (const s of raw.stores) pushStore(s);
    } else if (typeof raw.stores === 'object') {
      pushStore(raw.stores);
      pushStore(raw.stores.store);   // tandy_vase 实测：{ store: {…} }
    }
  }
  for (const st of stores) {
    const tl = st.tabStore && Array.isArray(st.tabStore.tabList) ? st.tabStore.tabList : [];
    for (const t of tl) {
      const sls = t && Array.isArray(t.subTabGoodsLists) ? t.subTabGoodsLists : [];
      for (const s of sls) {
        const list = s && Array.isArray(s.list) ? s.list : [];
        if (list.length) fn(list);
      }
    }
    // goodsInfoMap：值对象里没有 goodsId 字段，用 key 后缀反推
    for (const sk in st.tabStore) {
      const node = st.tabStore[sk];
      const gm = node && node.goodsInfoMap;
      if (!gm || typeof gm !== 'object') continue;
      const arr = [];
      for (const key in gm) {
        const g = gm[key];
        if (!g || typeof g !== 'object') continue;
        if (g.goodsId == null) {
          const m = String(key).match(/_(\d+)$/);
          if (m) g.goodsId = m[1];
        }
        if (g.goodsId != null) arr.push(g);
      }
      if (arr.length) fn(arr);
    }
  }
}

// 收集带 ad 字段的商品（职责 2 用）
function collectAdGoods(raw) {
  const out = [];
  eachGoodsList(raw, (list) => {
    for (const g of list) {
      if (g && typeof g === 'object' && typeof g.ad === 'string' && g.goodsId !== undefined) {
        out.push(g);
      }
    }
  });
  return out;
}

// v2.36：动画压制 CSS（消费券页的福袋/抽奖弹窗有 153 个 @keyframes、730 处 animation，
// 服务端无开关可关，只能从渲染层压时长）。见 hub_skip.response.js 同一段说明。
// v2.39：这里【只压 delay，不压 duration】。
// tandy_vase.html 有 10 处 animation-iteration-count:infinite（实测
// animation:_2VSYZIBr .9s linear infinite / _1zqXp5Ij 2.5s infinite forwards …）。
// 一旦把 duration 压到 .01s，这些无限循环会变成 100Hz 高速闪烁，
// 元素一直在动 → 点不中，表现为「要反复点才能进商品」。
// 压 delay 只去掉等待（.44s 这类），保留动画节奏，无副作用。
const NOANIM_CSS = '<style id="pdd-no-anim">*,*::before,*::after{animation-delay:0s !important;transition-delay:0s !important}</style>';
const NO_ANIM = (A.no_anim === undefined || A.no_anim === null || A.no_anim === '')
  ? true : on(A.no_anim);

// v2.44：点亮任务自动倒计时（无需滑动）—— 修正版
// ---------------------------------------------------------------------------
// v2.43 只给 scrollTop 打了「读取扰动」补丁，但没触发 scroll 事件，
// 页面的 debounce 监听不执行 → m.current 永远是初始的 true → 倒计时不走。
//
// 页面真实逻辑（xbrand_special_sale_*.js）：
//   const t = debounce(() => {
//     m.current = false;                       // 只有这里才会变 false
//     const a = scrollTop();
//     setTimeout(() => { if (a === scrollTop()) m.current = true }, 500);
//   }, 1000);
//   document.addEventListener('touchstart', () => {
//     document.addEventListener('scroll', t);  // 首次触摸才挂监听
//   });
//   setInterval(() => { if (!m.current) d(e => e - 1) }, 1000);
//
// 所以必须同时满足：
//   ① 触发 touchstart  → 挂上 scroll 监听
//   ② 触发 scroll      → debounce 1 秒后执行，m.current 变 false
//   ③ 500ms 内 scrollTop 真的变化 → m.current 保持 false
//
// 做法：每 300ms 真实抖动 1px + 派发 touchstart/scroll 事件。
//   抖动幅度 1px，用户基本察觉不到；页面其他依赖滚动位置的逻辑
//   （吸顶/懒加载）判定阈值通常远大于 1px。
const LIGHTUP_JS = `<script id="pdd-lightup-auto">(function(){
  if (window.__pddLightupAuto) return;
  window.__pddLightupAuto = 1;
  var up = true;
  setInterval(function () {
    try {
      // ① 触发 touchstart：页面首次收到才会挂 scroll 监听（内部有 f.current 去重）
      document.dispatchEvent(new Event('touchstart', { bubbles: true }));
      // ② 真实抖动 1px：让 debounce 里的「位置是否变化」判断失败
      var el = document.scrollingElement || document.documentElement;
      var cur = el.scrollTop;
      el.scrollTop = up ? cur + 1 : Math.max(0, cur - 1);
      up = !up;
      // ③ 派发 scroll：驱动页面的 debounce
      document.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('scroll'));
    } catch (e) {}
  }, 300);
})();</script>`;
const LIGHTUP_AUTO = (A.lightup_auto === undefined || A.lightup_auto === null || A.lightup_auto === '')
  ? true : on(A.lightup_auto);

function injectLightupAuto(body) {
  if (!LIGHTUP_AUTO) return body;
  if (body.indexOf('id="pdd-lightup-auto"') !== -1) return body;   // 幂等
  const i = body.indexOf('</body>');
  if (i < 0) return body;
  return body.slice(0, i) + LIGHTUP_JS + body.slice(i);
}

// v2.47：福袋自动关闭 —— 覆盖两个弹窗变体
// ---------------------------------------------------------------------------
// 之前几版为什么失败：PDD 有两个不同的福袋弹窗组件，我只覆盖了其中一个。
//
//   ① LuckyBagTakeCouPopNewTwo（无 popup_goods）
//      关闭按钮 class: _1-lALGJL / _1CIjIqvj
//      图片: f57ce24c-be68-49a3-ab54-dd45824a4a1d
//
//   ② LBTakeCouponPopWithGoods（有 popup_goods）← 用户这次遇到的就是这个
//      关闭按钮 class: _1YyPm9Uh / eOdKZIH1（BX_Class8 / BX_Ani8）
//      图片: bf929de2-1240-4a44-9627-ec36a2e9276e
//      另有 closeIcon: _3T2QZOWa
//
// 两个组件的 class 在各自 bundle 版本内固定（bundle 名带 hash）。
//
// 防误伤：宽高 > 8px、在视口内、每元素只点一次、只点元素本身。
const LUCKY_CLOSE_JS = `<script id="pdd-lucky-close">(function(){
  if (window.__pddLuckyClose) return;
  window.__pddLuckyClose = 1;

  // 两个弹窗变体的关闭按钮特征
  var CLASSES = [
    '_1-lALGJL', '_1CIjIqvj',      // ① 普通领券弹窗
    '_1YyPm9Uh', 'eOdKZIH1',       // ② 带商品弹窗
    '_3T2QZOWa'                    // ② closeIcon
  ];
  var KEYS = [
    'f57ce24c-be68-49a3-ab54-dd45824a4a1d',   // ①
    'bf929de2-1240-4a44-9627-ec36a2e9276e'    // ②
  ];

  var sel = CLASSES.map(function (c) { return '.' + c; });
  for (var i = 0; i < KEYS.length; i++) {
    sel.push('[src*="' + KEYS[i] + '"]');
    sel.push('[style*="' + KEYS[i] + '"]');
  }
  var SEL = sel.join(',');

  setInterval(function () {
    try {
      var els = document.querySelectorAll(SEL);
      for (var j = 0; j < els.length; j++) {
        var el = els[j];
        if (el.__pddLbClicked) continue;
        var r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        if (r.bottom < 0 || r.top > (window.innerHeight || 9999)) continue;
        el.__pddLbClicked = 1;
        try { el.click(); } catch (e) {}
      }
    } catch (e) {}
  }, 500);
})();</script>`;
const LUCKY_CLOSE = (A.lucky_close === undefined || A.lucky_close === null || A.lucky_close === '')
  ? true : on(A.lucky_close);

function injectLuckyClose(body) {
  if (!LUCKY_CLOSE) return body;
  if (body.indexOf('id="pdd-lucky-close"') !== -1) return body;   // 幂等
  const i = body.indexOf('</body>');
  if (i < 0) return body;
  return body.slice(0, i) + LUCKY_CLOSE_JS + body.slice(i);
}

// v2.53：三选一福袋自动选中间（精确定位 itemWrapper）
// ---------------------------------------------------------------------------
// 定位依据（xbrand_special_sale.js 反查）：
//   Wr 组件渲染福袋列表：
//     <div className={Fr().itemWrapper}>      // _3-xTPO9u
//       <io data={bagItem} index={idx} />
//     </div>
//   Fr = n(7591) 的 CSS Modules：
//     luckyBagListWrapper: "_1oeojQOY"   // 列表容器
//     itemWrapper:         "_3-xTPO9u"   // 每个福袋
//
// 之前 v2.48~v2.52 全部失败的根因：一直盯着 LuckyBagTakeCouPopNewTwo 的
// 3D 旋转布局（_1OzN-NpJ 等），而实际渲染的是这个平铺列表。
//
// 防误伤（用户强调过）：
//   ① 必须恰好 3 个 itemWrapper
//   ② 三个必须在同一个 luckyBagListWrapper 内
//   ③ 按 x 排序取中间
//   ④ 只点一次，列表消失后重置
//   ⑤ 尺寸 > 30px
const LUCKY_3OF1_JS = `<script id="pdd-lucky-3of1">(function(){
  if (window.__pddLucky3of1) return;
  window.__pddLucky3of1 = 1;

  var ITEM = '_3-xTPO9u';        // itemWrapper
  var LIST = '_1oeojQOY';        // luckyBagListWrapper
  var done = false, dbg = null;

  function show(txt) {
    try {
      if (!dbg) {
        dbg = document.createElement('div');
        dbg.style.cssText = 'position:fixed;left:4px;bottom:110px;z-index:2147483647;' +
          'background:rgba(0,0,0,.9);color:#0f0;font:10px/1.3 monospace;' +
          'padding:4px 6px;border-radius:4px;pointer-events:none;white-space:pre';
        (document.body || document.documentElement).appendChild(dbg);
      }
      dbg.textContent = txt;
    } catch (e) {}
  }

  setInterval(function () {
    try {
      var items = document.querySelectorAll('.' + ITEM);
      if (items.length === 0) { done = false; show('3of1 items=0'); return; }
      show('3of1 items=' + items.length + ' click=' + (done ? 'Y' : 'N'));
      if (done) return;
      if (items.length !== 3) return;

      var arr = Array.prototype.slice.call(items);
      // 校验：三个都在同一个 luckyBagListWrapper 内
      var lists = document.querySelectorAll('.' + LIST);
      var sameList = false;
      for (var i = 0; i < lists.length; i++) {
        var inThis = arr.filter(function (el) { return lists[i].contains(el); });
        if (inThis.length === 3) { sameList = true; break; }
      }
      if (!sameList) return;

      // 尺寸校验
      var ok = arr.every(function (el) {
        var r = el.getBoundingClientRect();
        return r.width > 30 && r.height > 30;
      });
      if (!ok) return;

      arr.sort(function (a, b) { return a.getBoundingClientRect().left - b.getBoundingClientRect().left; });
      var mid = arr[1];
      done = true;

      var r = mid.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;

      // ① 直接 click
      try { mid.click(); } catch (e) {}
      // ② 按坐标派发（React 合成事件需要 clientX/Y）
      try {
        var t = document.elementFromPoint(cx, cy) || mid;
        ['mousedown', 'mouseup', 'click'].forEach(function (type) {
          t.dispatchEvent(new MouseEvent(type, {
            bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0
          }));
        });
      } catch (e) {}
    } catch (e) {}
  }, 700);
})();</script>`;
const LUCKY_3OF1 = (A.lucky_3of1 === undefined || A.lucky_3of1 === null || A.lucky_3of1 === '')
  ? true : on(A.lucky_3of1);

function injectLucky3of1(body) {
  if (!LUCKY_3OF1) return body;
  if (body.indexOf('id="pdd-lucky-3of1"') !== -1) return body;   // 幂等
  const i = body.indexOf('</body>');
  if (i < 0) return body;
  return body.slice(0, i) + LUCKY_3OF1_JS + body.slice(i);
}

function injectNoAnim(body) {
  if (!NO_ANIM) return body;
  if (body.indexOf('id="pdd-no-anim"') !== -1) return body;   // 幂等
  const i = body.indexOf('</head>');
  if (i < 0) return body;
  return body.slice(0, i) + NOANIM_CSS + body.slice(i);
}

try {
  let body = $response.body;
  if (!body) { $done({}); return; }

  // ── 职责 1：搜索框去推广词（search_stub）──────────────────
  if (on(A.search_stub)) {
    const out = body
      .replace(/("queryWords"\s*:\s*)\[[^\]]*\]/, '$1[]')
      .replace(/("queryGuideWord"\s*:\s*)"[^"]*"/, '$1""');
    if (out !== body) body = out;
  }


  // ── 职责 2：百补列表页广告（feed_ad）────────────────────
  if (on(A.feed_ad) && typeof $persistentStore !== 'undefined') {
    const parsed = parseRawData(body);
    if (parsed) {
      try {
        const goods = collectAdGoods(parsed.obj);
        if (goods.length) {
          // 方案 1：名单入库（详情页打标依赖它）
          const ids = goods.map((g) => String(g.goodsId)).filter((x) => x && x !== 'undefined');
          if (ids.length) mergeIds(ids);

          // v1.87（用户确认）：只保留图片角标（商品图左上角）——
          // ① 价格词/② 销量行/③ titleTop 三通道真机证伪（列表不可见/冗余），
          // 全部移除；goodsFlagIcon/ltIcon 真机验证可见（手机+平板）。
          let touched = 0;
          for (const g of goods) {
            // v1.94：角标只走 ltIcon（商品图左上角官方角标槽），不再写 goodsFlagIcon。
            //   ① 手机版列表页（tandy_vase.html）的商品**根本没有 ltIcon 字段**，
            //      v1.87~v1.93 只做「替换已有字符串」→ 手机上压根没地方写；
            //   ② goodsFlagIcon 是标题旗标槽，CSS `.aFOWVd6O{height:.15rem}`
            //      ≈15px 高（375pt 手机）→ 横幅「广告」被压到 ~10px，等于看不见；
            //      iPad 上 rem 更大所以看得见 —— 这正是「手机看不到/iPad 能看到」的成因；
            //   ③ ltIcon 槽位 CSS `.ilx1YR3r{height:.52rem;width:.46rem}` ≈46×52px，
            //      官方角标位，竖版资产（184×208，比例 0.885 = 0.46/0.52）填进去清晰可读。
            //   ltIcon 是【单个 URL 字符串】：v1.83 曾转成数组，H5 组件 join(',')
            //   拼出 `badge.png,原URL` → 404 碎图（iPad 实测），v1.86 已改回字符串。
            if (g.ltIcon !== AD_BADGE_URL) { g.ltIcon = AD_BADGE_URL; touched++; }
          }

          if (touched) {
            const next = body.slice(0, parsed.start) + JSON.stringify(parsed.obj) + body.slice(parsed.end);
            if (next !== body) body = next;
          }
        }
      } catch (e) { /* 职责 2 失败不影响职责 1 */ }
    }
  }


  // ── 职责 3：消费券栏目显示佣金率（cps_label）────────────────
  // 页面 tandy_vase.html（百补「消费券」栏目），双列布局，数据结构是
  // rawData.stores.store（不是 store）。
  // 该页面【没有 activityPriceWordBeforeTag】，所以 activityPriceWord 是
  // 真正渲染的那个词（实测 20/20 都是「券后」），不会被覆盖。
  if (CPS_LB && CPS_TOKEN && typeof $httpClient !== 'undefined') {
    const p3 = parseRawData(body);
    if (p3) {
      const lists = [];
      eachGoodsList(p3.obj, (l) => { lists.push(l); });
      if (lists.length) {
        const order = [];
        const seen = {};
        for (const lst of lists) {
          for (const g of lst) {
            const gid = g && g.goodsId != null ? String(g.goodsId) : '';
            if (!gid || seen[gid]) continue;
            seen[gid] = 1;
            if (order.length < CPS_BATCH) order.push(gid);
          }
        }
        if (order.length) {
          const cache = cacheLoad();
          const map = {};
          const need = [];
          for (const gid of order) {
            // 旧缓存只有 r 没有 l：转链开启时视为未命中，重新请求拿 item_link
            const cRec = cache[gid];
            if (cacheFresh(cRec) && (!CPS_RW || cRec.l)) {
              map[gid] = { rate: cRec.r, link: cRec.l || '' };
            } else {
              need.push(gid);
            }
          }
          const done = (fetched) => {
            if (fetched) for (const k in fetched) map[k] = fetched[k];
            let n = 0;
            for (const lst of lists) {
              for (const g of lst) {
                if (!g || typeof g !== 'object') continue;
                const gid = g.goodsId != null ? String(g.goodsId) : '';
                const ent = gid ? map[gid] : null;
                const rate = ent ? ent.rate : 0;
                if (!(rate > 0)) continue;
                if (rewriteLink(g, ent)) n++;                 // v2.27 链接改写
                const text = '佣金' + fmtRate(rate) + '%';
                // v2.29：优先改 activityPriceWordBeforeTag.text —— 百补首页与
                // 精选页的前端都是 `W = BeforeTag.text || priceWord`，只改
                // activityPriceWord 会被「只剩2天」这类标签完全盖住。
                const bt = g.activityPriceWordBeforeTag;
                if (bt && typeof bt === 'object') {
                  if (bt.text === text) continue;             // 幂等
                  bt.text = text;                             // 保留 type / tagExt
                  n++;
                } else {
                  if (g.activityPriceWord === text) continue;
                  g.activityPriceWord = text;
                  n++;
                }
              }
            }
            // 先改服务端预渲染的静态「券后」（前 5 个商品在 HTML 里，位于 rawData 之前）
            // ⚠️ 必须在 JSON 改写之前做：JSON 改写会改变 body 长度，p3.start 就失效了
            try {
              const prMap = buildPriceRateMap(lists, map);
              if (Object.keys(prMap).length) {
                const seg = body.slice(0, p3.start);
                const r2 = rewriteCouponTags(seg, prMap);
                if (r2.n) body = r2.html + body.slice(p3.start);
              }
            } catch (e) { /* 静态改写失败不影响主流程 */ }

            if (n) {
              const next = body.slice(0, p3.start) + JSON.stringify(p3.obj) + body.slice(p3.end);
              if (next !== body) body = next;
            }
            body = injectNoAnim(body);
  body = injectLightupAuto(body);
  body = injectLuckyClose(body);
  body = injectLucky3of1(body);
  $done(body === $response.body ? {} : { body });
          };
          if (!need.length) { done(null); return; }
          cpsFetch(need, function (fetched) {
            if (fetched) {
              const now = Math.floor(Date.now() / 1000);
              for (const gid in fetched) cache[gid] = { r: fetched[gid].rate, l: fetched[gid].link || '', t: now };
              cacheSave(cache);
            }
            done(fetched);
          });
          return;
        }
      }
    }
  }

  body = injectNoAnim(body);
  body = injectLightupAuto(body);
  body = injectLuckyClose(body);
  body = injectLucky3of1(body);
  $done(body === $response.body ? {} : { body });
} catch (e) {
  // 兜底：出错一律放行，绝不因脚本问题让百亿补贴页打不开
  $done({});
}
