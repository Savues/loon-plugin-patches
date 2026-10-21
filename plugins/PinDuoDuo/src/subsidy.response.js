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
 *   v1.81 三通道打标（用户确认全上，真机消融后收敛）——改广告商品：
 *     ① activityPriceWord  价格正前方「券后」→「广告·券后」（用户点名的位置）
 *     ② salesTip           卡片销量行「已抢3680件」→「广告·已抢3680件」
 *     ③ titleTop 头部插红底白字「广告」PNG（托管本仓库 assets/ad-badge.png，
 *       与官方百亿补贴徽章同槽位 530×150）——需要真机验证 H5 是否加载
 *       非拼多多域名的图片；不渲染也无副作用。
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
const AD_BADGE_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAhIAAACWCAYAAACLg2FYAAASe0lEQVR4nO3deZRedX3H8c+991lnyWSZSUISIWAUpByqJriAUkTABYsHC5aDHJe2tNKDoRYjghQooigYRIkii6BGQTbraVGEUg4eLCguSFAaBU1Ass1MZp955tnu7R+ThEkymfndeeZ37zPPfb/OmZPJ5HvP8wmZ5cPvdxdHIWw+ekUQZh4AAMw+yzc875jOTjlIeQAAILmmKhXuZH9IiQAAINmm6gITtgwKBAAA2NdEqxP7rUhQIgAAwEQm6gjuVANAQ/O8uBMAwKyyb1eY9BwJoJFljjhSS+77kXJvPDbuKAAwa+3Z62A1AknSevYHNe/jF8nJZFTt3KGtZ5wqv78/7lioN46j/PFvk9/XK7+vT0FxVEG5rKBakZNKy0ln5LS0yGubK78wotLvnok7MRCZ3edLOBIlAsnhzp2r9iu/oPxfnbjXx0ceflBdF54fUyrUs0Oe+r3kTr14O/SD+7Tz8k9FkAioH8s3PO+wtYHEyK16g5bcc/9+JUKSmk56h1pOPzOGVKh3QblkNjdasJwEqE8UCTQ+19Pc81Zr0S3r5S1cdMCx+Rf9m1IHHxJhMMwGQbFoNlegSCCZXLY10Mi8RYu1+BvfUdtHPzbl8rSTz6v96usklys58LKgZLYi4RdGLCcB6s/mo1cErEigYaUOWqol99yv7OtXGR+TPepozfnQ31lMhdnGeEVidNRyEqA+peIOANhS2bZFo7/6uZpOPCXUcXPPu0CFRx5W+YVNlpJhMtnXr1LHNV9W6bnfq/zH51TZskXV7VtV7eqUPzgof3BAQbksSQpKReMf9NNlvrXBigSSiSKBhrbzikuUPeovJz03Yl9ONqsFV16t7R85W/J9i+kwkcxhK+R1LFS+Y6Hyx7510tnetZ/XwLe/YTVPUDIrEj7nSCCh2NpAQ/P7+9X96TWhC0H2tSvVetY5llJhMulXvsp4trJ9m8UkY8y3NigSSCaKBBre6JNPaOCbt4Y+bt7qTyi1dJmFRJhM+tBXGs9Wt2+1mGSM8eWfrEggoSgSSIS+r12v8h+fC3WMk89r/qVXWkqEA0kfZl4kWJEA4keRQCIE5bK6L/2kVK2GOi5/7FvV9PZwJ2ti+tzmZnmLFpsNV6uqdnfbDSQZb4sFlXCfW0CjoEggMUrP/lb937gp9HHz1nxaTi5vIRH2FWZbo7J1i+RH8MPbtHxWK3ZzAHWKIoFE6b/pBpX+sDHUMamDlqjt3PMsJcJ46Vcdbjwb9t9xugLDshJwhQ8SiiKBRAkqFfVceWnoqzjmfOgflDp4uZ1Q2CPMzcNKG39nMck4vuHNfyusSCCZKBJInOIzT2vw7jtCHeOk05p/8WWWEmG33Mo3GM+WNv6fxSTjsCIBTIoigUTq+8paVbs6Qx2TP/atyh//NkuJ4C1cFOpy29LGZy2meZlxQeAcCSQURQKJ5A8Pqefqfw993LyPf5KHelmSW2W+GlHt2alq5w6Laca/mGmRYEUCyUSRQGKN/M9DKjzx01DHpA9boZbTz7CUKNmyIbY1Rp98wmKSfZhubbAigYSiSCDReq+5KvS9Jeb+8wVy8lwOOtNyrz/GeHb0Z49bTLK3wPRkS1YkkFAUCSRa+U9/1MCd60Md47V3aM4H/95SomTy2juUPvQw4/nRn/2vxTT7MD7ZkhtSIZl4+ieSyXH2/Np/8zo1n3qavHnzjQ9v+/C5Gvr+3ar27LQU0JzjOJLnSa4rx/Veft/zxv6enicnnZaTzcnJ5eRksnJyWTnZnNxsbuz9TFYjP3kkuvMO9tF08jtf/jeZQvmFTapss/+MDQBmKBKoWdOJp7x8aaTj7P0DYdwP7N3vO44jafzHtf+x42acvT6u/f583+OcvWYnmJkBTlOTlj0c4f8VR6C44akYi8S7jGdHn2is/+7AbEeRQM2cfE7ewkVxx0CNqj09sbyu196h3OtWGs+PPPygxTQAwuIcCQCSJH9oMJbXbTr5nZJr9q2o2tWp0V89aTkRgDAoEqhdYHhWO+pbuRzLy4bZ1hj+8Q9D394cgF0UCQCSxp5DErWw2xrDD9xvMQ2A6eAcCdSOFYnG4HrRPJZ7nJb3nWm+rdHdJX+wX6mDD7Gcam9uc4vRXGrJMjnZrOU0E3McV/JcyUvJcd2xK3W8sSt4nFRKTi4/dsVOvkluLjf2+3xeqlTUf9tNsWRG46BIAJAkOZmMgtFCdK+XSqn1b88xnvfaO7T0vx62mKg2i795Z9wRQqu8uJkigZqxtYHasSDRENzm5khfr+md75HX3hHpa2Jv/shI3BHQACgSqB1bGw3Bnb8g0tebc86HI3097C+gSGAGsLWBSG09/V0KKvFcHdCo9uyPu97Y/vjuPfJdv47d5TI1tkeeze56G/d+Jisnl1MwMhxZ5tzKY5R5zV9E9nqYmF+gSKB2FAnULAixIlHZ8mcFxaLFNJgNWlmNqAtOJhN3BDQAtjYQsZm7TTVmp8wRR6rphJPijgFJblNT3BHQACgSmAGcIwFz89ZcYnzJJ+xymswubQUmw9YGojWDD87C7NN04snKrXqj8Xzv9dfIj/kJq83vPUO5lcdMOdf7xc/JH+iPINEEdj311fG8sXNldt1TQp675z4S7q57R+y+p4Sbb5If4XkxaFwUCdQuzFUb9IjEclIpzfv4J43nCz95RAO332IxkZns61ZJBkVi+KEHVN2xPYJEQH1hfRFAJFrPOkepg5ebDftV9V5/rdU8AGYGRQK1C7UiwZJEEnnz5qvtH883nh/6/j0q/+l5i4kAzBSKBGoXokg4FIlEWnDF5+S2tRnN+n196r1hreVEAGYKRQKAVa1nnKX8CW83nu/98rXy+/rsBQIwoygSqF2oqz9ZkUiS9PJDxy73NFR8+ikN/cc9FhMBmGkUCUSLrY3EcFIptV99nZxc3mg+KBa187KLeHYLMMtQJDAD+MaP/c09/1+VOfIo4/m+dV9SefMmi4kA2ECRQLRYkUiEltPepzkfOdd4vvjULzXwndstJgJgC0UCtePyT4yTe/Nxmn/5Z43n/YF+dV98oeT7FlMBsIUigZqFefonGlvm8CPUsXadnJT5TXN3Xn6xKtu2WkwFwCaKBKLFgkTDSi0+SAvX3Sq32fxBUIN3fFsjj/y3xVQAbKNIoHZsbSSe196hhTfeJm/hIuNjRn/1C/WuvdpiKgBRoEgAqEnqFQdr8bfuUvqwFcbHVLZtVfeF5yuoVCwmAxAFigRqF+ocCVYkGknm8CO0+JvfU2rZK4yPCQoFdf3Lear29lhMBiAqFAlEimdtNI7cymO06LY75LV3mB/kV9W1ZrVKG5+1FwxApCgSqB1XbSSO17FQ7WvXyW1pDXXczqsuV+GxR61kAhAPigSixYpEQ6h2dWrre05S7/XXyB8cMDqm78avaOi+uywnAxA1igSiRZFoGP7QoAZuv0VbT3/XlKsMA9+6Vf1fvyGSXACiRZFA7djaSLRqV6c6zz9X/bfeOOGfD959h3qv+0LEqQBEhSKBaLEi0bD6brhOfV/90l4fG7znTvV87op4AgGIBEUCtWNFArv03/w1jTz0gCRpYP3t6rnqMj4/gAZnfkN8ADCw84pLVNzwlAbW8zRPIAlYkUDtuEU2xvGHhygRQIKwIgHASPqwVyq1ZJmC0YL8wqiCwoiC0YKC0VH5owUFxeLYo8DZypj9HEeO58nJ5uTk82NvubzcXE5Obuz3xQ2/kd/XG3dS1AGKBGrHikQi5N9yguZd+KmpB31fge9L1YpU9RX4ValStR/QEqepyWhuyb33S/4sK1GOI3muHC8lue7Y499d1+jrdNuZf60SRQKiSGAGBKJIJEG1u9Ns0HXluK6UGvv2kpR/cXdOW9wRIlXtMvx8QMPjHAkARvzh4bgjoI74I3w+YAxFArULsbXBQ7tmr6BUjDsC6khQKsUdAXWCIoFoUSRmLcdjJxTjOPz4wBg+E1C7WXZ+GabHyWTjjoA64uT4fMAYigQixorEbOXOmxd3BNQRby6fDxjDWiVqF+ryT3sxYJeTyaj8wiapVFJQKiko7/q1WFRQLkmVythln34g+dX930fdcRxn1+WerhzP3fO+PFeO40rptJxMZuwtnZGTze55353TJm3dEvdfAXWAIgHAyOCd6zV45/q4YwCoM2xtoHbckAoAEosigdpRJAAgsSgSAABg2igSmAGsSABAUlEkEC2KBAA0FIoEasdjowEgsSgSiBgrEgDQSCgSqFnAQ7sAILEoEqgdOxsAkFjc2RLRYkECB5A58iilli6LO0ZDCYaGVHjip3HHQIOjSKB23JAKM6D1/Wer5fQz447RUMqbN6nw3lPijoEGx9YGAACYNooEZgArEgCQVBQJRIwiAQCNhCKB2nFDKgBILIoEasfJlgCQWBQJ1C5MOQh8ezkAAJHj8k9Eq0qRQG2Kv/6lgnIp7hixy752pZxsNu4YAEUC0QqqlbgjYJbrWrNa1e6uuGPEbumPH1XqoKVxxwDY2sAMCLO1Ua3aywEAiBxFAjVzsjnjWb9QsJgEABA1igRq5uTzxrPByLDFJACAqFEkUDM3Z1YkgnJZQYmT5ACgkVAkUDO3tdVoLhgespwEABA1igRq5i5oN5qr9uy0nAQAEDWKBGrmzV9gNMclewDQeCgSqJnX3mE0V+3utpwEABA1igRqllr2CqO56o7tlpMAAKJGkUDNUkuXGc2VX3rRchIAQNQoEqiJO3ee3BazqzYqFAkAaDgUCdQk8+ojjGcrL75gMQkAIA4UCdQkc/hrjOb84WFVtm21nAYAEDWKBGqSec2RRnPl534vBYHlNACAqFEkUJPs61YZzZX+sNFyEgBAHCgSmDZv0WKlliw1mi399mnLaQAAcaBIYNpyq95oPDv61K8tJgEAxIUigWlrOuFEo7lqb48qL262GwYAEAuKBKbFSaWUO+54o9niL5+0nAYAEBeKBKYl96bj5Da3GM0WfvoTy2kAAHGhSGBaWt77PuPZwuOPWUwCAIgTRQKhuXPalD/hJKPZ0sZnVe3cYTkRACAuFAmE1nL6mXIyGaPZkQd/ZDkNACBOFAmE4qRSmvOBDxnPDz9EkQCARkaRQCjN7z5N3qLFRrPFDb9R5aU/W04EAIgTRQLGnHRabeetNp4fuvdOi2kAAPWAIgFjrWedY3xLbH9wQMMPPmA5EQAgbhQJGPE6Fqrtox8znh/6wX0KRgsWE6HhOHw7AmajVNwBMDvMv+RyuS2tRrNBpaLB79xuOREajeOZFYnW958tf3jYcpr6Z3pDOMA2igSm1HzqaWo68RTj+eEf/qcq27dZTISG5JoVibZ/Ot9yEABhsJaISaUPOVQLLv2M+QHVqvpvvdFeIDQutjaAWYmvXByQ29yijuvWyWlqMj5m8L67eNInpsdwawNAfeErFxNyUil1rF2n9IpXGx8TjIyo/6Z1FlOhkTmsSACzEl+52J/racFnr1XuzceFOqzv6zeo2t1lKRQanufFnQDANHCyJfbmeer4/HVqOuXdoQ4r/WGjBrhSA7VwnLgTAJgGigT2cJtb1H7tl5U/7vhwB/pV9Vx5qVSt2gmGRHBYkQBmJYoEJEmppcu08Cs3hTonYrf+W25U8ZmnLaRCohhe/ll47FG20CQ1v+PUUCdCA7ZQJKDmd5yq+Zd9xviGU+MVn3lafZxgiZlgWCQG1t+u0Z8/bjlM/cu96VilKBKoA5xsmXBOU5NShyxXefMmKQhCHev39ap7zWq2NDAjnEzGbC6btZwEQBgUiYQLRkbUf/NXtf0Df6OXTn6LBr/7LQXF4tQH+lV1fWK1Ktu22g+JRHDShkUil7OcBEAYFAnsUe3qVM81V2nLe96ukYd+NOlsz+c/o9Ff/CyiZEgC05UGJ0uRAOoJRQL7qXbuUNeaC9T7xasn3Lbov/lrGrzruzEkQyMz3dpw2doA6gpFAgc0sP42dV7w0b3KxOC931PfV78UYyo0KrY2gNnJXb7hee4CgwMqPPaodl55qSRp8O471HPVZfEGQsNiawOYfZZveN7h8k9MaegH96rauUOFxx+LOwoamelVG6xIAHWFrQ0YoUTANuPLPykSQF1xpbGlibiDAEg243Mk2NoA6sLu7pAa/4HNR68Id0ciAJghTjqtoFKR39eroFhUUC5L1YqcdFpKZ+Q2N8ttnUOR2KW8eZOCkZFJZyov/TmiNEia8QsQe61EUCQAxMVtbpE/PDTFkCcnm1FQKEQTCsCEDlgkJMoEAAA4sH1Ph9jvZEvOlwAAABOZqCNMWhpYnQAAAJMtMkx6+SerEwAAJNtUXSBUUWCFAgCAxhdmIeH/Acim55M+/nE9AAAAAElFTkSuQmCC';
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
            // 通道④：goodsFlagIcon（原生徽章数组，头部插入，组件按行渲染）
            // 通道⑤：ltIcon 是【单个 URL 字符串】，组件会 join(',') 拼数组——
            //   v1.83 曾把它转成数组导致拼出 `badge.png,原URL` 的 404 碎图
            //   （iPad 实测）。改为直接替换成徽章 URL：左上角的促销图标
            //   原本就占着这个位置，换成「广告」徽章意图更明确。
            if (!Array.isArray(g.goodsFlagIcon)) g.goodsFlagIcon = [];
            if (g.goodsFlagIcon.indexOf(AD_BADGE_URL) === -1) {
              g.goodsFlagIcon.unshift(AD_BADGE_URL); touched++;
            }
            if (typeof g.ltIcon === 'string') {
              if (g.ltIcon !== AD_BADGE_URL) { g.ltIcon = AD_BADGE_URL; touched++; }
            } else if (Array.isArray(g.ltIcon)) {
              // 容错：若上游某天改成数组，替换首元素而不是 join 炸弹
              if (g.ltIcon[0] !== AD_BADGE_URL) { g.ltIcon[0] = AD_BADGE_URL; touched++; }
            }
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
