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

// ── 职责 3（v2.10）：百补列表显示佣金率 ──────────────────────
// 前端价格组件（react_brand_activity_subsidy_*.js）逻辑：
//   k = data.activityPriceWording
//   P = (enableFour.type === 'half_price_discount_tag') ? activityPriceWord : k
//   <span class="activityPriceWording">{P}</span><span>¥</span><span>{activityPrice}</span>
// 实测 21 个商品的 enableFour.type 全是 night_pk_coupon_tag，所以渲染的是
// activityPriceWording，而该字段当前全为空 → 前端什么都不显示。
// 填上即渲染在 ¥ 之前：  佣金3.2% ¥19.26
// 不碰 activityPrice：纯数字，前端要 .replace('.','') 拆整数/小数。
const CPS_TOKEN = (typeof A.cps_token === 'string') ? A.cps_token.trim() : '';
const CPS_LB = on(A.cps_label);
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

// 百补商品列表：两个位置都要覆盖（不同版本的页面结构不同）
//   ① raw.store.plusSubsidyStore.goodsList        —— 旧版/部分场景
//   ② raw.store.tabStore.tabList[*].subTabGoodsLists[*].list
//      —— 当前版本的百补主列表（实测 32 个 tab，[0] 精选有 23 个商品）
function pickSubsidyLists(raw) {
  const out = [];
  const st = raw && raw.store;
  if (!st || typeof st !== 'object') return out;

  const ps = st.plusSubsidyStore;
  if (ps && Array.isArray(ps.goodsList) && ps.goodsList.length) out.push(ps.goodsList);

  const ts = st.tabStore;
  const tabs = ts && Array.isArray(ts.tabList) ? ts.tabList : null;
  if (tabs) {
    for (let i = 0; i < tabs.length; i++) {
      const subs = tabs[i] && tabs[i].subTabGoodsLists;
      if (!Array.isArray(subs)) continue;
      for (let k = 0; k < subs.length; k++) {
        const lst = subs[k] && subs[k].list;
        if (Array.isArray(lst) && lst.length) out.push(lst);
      }
    }
  }
  return out;
}

// 大淘客批量解析：cb(map{gid -> rate})
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
      const g = (list[i] || {}).goods || {};
      const rate = parseFloat(g.rate);
      if (!(rate > 0)) continue;
      const link = list[i].item_link;
      if (typeof link !== 'string') continue;
      const m = link.match(/[?&]goods_id=(\d+)/);
      if (m && !map[m[1]]) map[m[1]] = rate;
    }
    cb(map);
  });
}

// ── 静态 HTML 标签改写（v2.16）─────────────────────────────
// 百补页是服务端预渲染：首屏商品的「只剩2天」等标签直接写在 HTML 里，
// 位置在 window.rawData 之前，改 JSON 影响不到它们。实测 rawData 前有 5 处。
//
// HTML 结构：
//   <div class="B5kOahpK" style="color:#813700">
//     <img src=".../3fa6a2e2-...png"/>
//     <span class="Rk__HyCf W4mh7vzm"><span class="ymNbz_1h">只剩2天</span></span>
//   </div>
//   <span class="HTRC5u_U"></span>
//   <div style="color:#813700" class="ZMZVEtlL">
//     <span class="VdWvomgZ KpyzNzbg">¥</span><span ...>26</span><span ...>.</span><span ...>58</span>
//
// 匹配方式：用「标签块 + 紧随其后的价格整数部分」配对，再拿价格去 rawData 里
// 找对应商品（价格是唯一的），从而得到该商品的佣金率。
// 实测顺序与 rawData 完全一致（26↔26.58 / 268↔268 / 47↔47.8 / 39↔39.9），
// 但用价格做锚点比按顺序更稳。
function rewriteStaticTags(html, rateByPrice) {
  const RE = /(class=\\"B5kOahpK\\"[\s\S]{0,600}?\\u003E)([^\\]{1,20}?)(\\u003C[\s\S]{0,1200}?¥\\u003C\\u002Fspan\\u003E[\s\S]{0,400}?\\u003E(\d+)\\u003C)/g;
  let n = 0;
  const out = html.replace(RE, function (m, head, label, tail, intPart) {
    const rate = rateByPrice[intPart];
    if (!(rate > 0)) return m;
    if (label.indexOf('佣金') === 0) return m;
    n++;
    return head + ('佣金' + fmtRate(rate) + '%') + tail;
  });
  return { html: out, n: n };
}

// 从 rawData 的商品列表建「价格整数部分 -> 佣金率」映射
function buildPriceRateMap(lists, map) {
  const out = {};
  for (let a = 0; a < lists.length; a++) {
    const lst = lists[a];
    for (let k = 0; k < lst.length; k++) {
      const g = lst[k];
      if (!g || typeof g !== 'object') continue;
      const gid = g.goodsId != null ? String(g.goodsId) : '';
      const rate = gid ? map[gid] : 0;
      if (!(rate > 0)) continue;
      const ap = String(g.activityPrice || '');
      const ip = ap.split('.')[0];
      if (ip && !out[ip]) out[ip] = rate;
    }
  }
  return out;
}

// 从 rawData 里收集带 ad 字段的商品
// 已知三种形态（均为实测）：
//   raw.store.tabStore…                    brand_activity_subsidy.html 旧模板
//   raw.stores.store.tabStore…             tandy_vase.html 新模板（stores 是 dict）
//   raw.stores[i].store.tabStore…          数组形态（容错预留）
function collectAdGoods(raw) {
  const out = [];
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
        for (const g of list) {
          if (g && typeof g === 'object' && typeof g.ad === 'string' && g.goodsId !== undefined) {
            out.push(g);
          }
        }
      }
    }
  }
  return out;
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

  // ── 职责 3：百补列表佣金率（cps_label）────────────────────
  // 诊断：cps_probe 开时把实际收到的参数写进首个商品名，抓 HAR 搜 ARG= 即可见
  if (on(A.cps_probe)) {
    const p0 = parseRawData(body);
    if (p0) {
      const ls0 = pickSubsidyLists(p0.obj);
      if (ls0.length && ls0[0].length && ls0[0][0]) {
        const raw = typeof $argument === 'string' ? $argument : JSON.stringify($argument);
        ls0[0][0].goodsName = 'ARG=' + String(raw).slice(0, 100);
        body = body.slice(0, p0.start) + JSON.stringify(p0.obj) + body.slice(p0.end);
      }
    }
  }

  // 异步查询，查询完再统一 $done
  if (CPS_LB && CPS_TOKEN && typeof $httpClient !== 'undefined') {    const parsed = parseRawData(body);
    const lists = parsed ? pickSubsidyLists(parsed.obj) : [];
    if (lists.length) {
      // 收集所有列表里的 goodsId（顺序去重，截到批次上限）
      const order = [];
      const seen = {};
      for (let a = 0; a < lists.length; a++) {
        const lst = lists[a];
        for (let k = 0; k < lst.length; k++) {
          const g = lst[k];
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
        for (let k = 0; k < order.length; k++) {
          const gid = order[k];
          if (cacheFresh(cache[gid])) map[gid] = cache[gid].r;
          else need.push(gid);
        }
        const finish = (fetched) => {
          if (fetched) for (const k in fetched) map[k] = fetched[k];
          let n = 0;
          for (let a = 0; a < lists.length; a++) {
            const lst = lists[a];
            for (let k = 0; k < lst.length; k++) {
              const g = lst[k];
              if (!g || typeof g !== 'object') continue;
              const gid = g.goodsId != null ? String(g.goodsId) : '';
              const rate = gid ? map[gid] : 0;
              if (!(rate > 0)) continue;
              // v2.11：主列表读的是 activityPriceWord，不是 activityPriceWording。
              // 前端条件（三处组件一致）：
              //   f = activityPriceWord
              //   f && activityPrice.length <= 6 && <div class=activityPriceWord>{f}</div>
              //   <div class=unit>¥</div><div class=price>{activityPrice}</div>
              const text = '佣金' + fmtRate(rate) + '%';
              // v2.15：改 activityPriceWordBeforeTag.text，不是 activityPriceWord。
              // 前端 PriceWord 组件（react_brand_activity_subsidy @410862）：
              //   var x = e.activityPriceWordBeforeTag, ...
              //       F = M.text, W = F || n;      ← BeforeTag.text 优先于 priceWord
              // 实测每个商品都有 BeforeTag（「只剩2天」「仅一次」「只剩3小时」），
              // 所以只改 activityPriceWord 会被完全盖住。
              const bt = g.activityPriceWordBeforeTag;
              if (bt && typeof bt === 'object') {
                if (bt.text === text) continue;   // 幂等
                bt.text = text;
                n++;
              } else {
                if (g.activityPriceWord === text) continue;
                g.activityPriceWord = text;
                n++;
              }
            }
          }
          if (n) {
            const next = body.slice(0, parsed.start) + JSON.stringify(parsed.obj) + body.slice(parsed.end);
            if (next !== body) body = next;
          }
          // v2.16：同时改首屏静态 HTML 里的标签（rawData 之前那段）
          try {
            const prMap = buildPriceRateMap(lists, map);
            if (Object.keys(prMap).length) {
              const seg = body.slice(0, parsed.start);
              const r2 = rewriteStaticTags(seg, prMap);
              if (r2.n) body = r2.html + body.slice(parsed.start);
            }
          } catch (e) { /* 静态改写失败不影响主流程 */ }
          $done(body === $response.body ? {} : { body });
        };
        if (!need.length) { finish(null); return; }
        cpsFetch(need, function (fetched) {
          if (fetched) {
            const now = Math.floor(Date.now() / 1000);
            for (const gid in fetched) cache[gid] = { r: fetched[gid], t: now };
            cacheSave(cache);
          }
          finish(fetched);
        });
        return;
      }
    }
  }

  $done(body === $response.body ? {} : { body });
} catch (e) {
  // 兜底：出错一律放行，绝不因脚本问题让百亿补贴页打不开
  $done({});
}
