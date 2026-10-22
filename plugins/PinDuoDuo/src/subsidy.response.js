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

const A = (typeof $argument === 'string' ? {} : $argument) || {};
const on = (v) => v === true || v === 1 || v === 'true' || v === '1' || v === 'on' || v === 'ON';

const AD_KEY = 'pddAdGoodsIds';
const AD_CAP = 200;
const AD_PREFIX = '广告·';
// 徽章托管：v1.85 起 jsdelivr CDN（国内可达）—— raw.githubusercontent.com
// 在部分线路上不可达，iPad 实测徽章图加载失败出现 WebKit 碎图占位符
// v1.88：徽章内联为 data URI（零网络依赖）——jsdelivr @main 有缓存延迟
// （曾把旧 530×150 缓存了一天），raw.githubusercontent 部分线路不可达，
// data URI 彻底消除 CDN/缓存/设备差异。资产源文件仍在 src/assets/ 备查。
const AD_BADGE_URL = 'data:image/png;base64,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';
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

  $done(body === $response.body ? {} : { body });
} catch (e) {
  // 兜底：出错一律放行，绝不因脚本问题让百亿补贴页打不开
  $done({});
}
