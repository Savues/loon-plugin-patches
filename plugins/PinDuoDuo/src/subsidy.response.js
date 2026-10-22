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
