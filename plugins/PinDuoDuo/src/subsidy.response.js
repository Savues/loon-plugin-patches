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
