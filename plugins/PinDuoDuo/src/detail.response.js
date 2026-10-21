/*
 * detail.response.js —— 商品详情页广告打标（自研脚本）
 *
 * 端点：GET /api/oak/integration/render（详情页主响应，~100-180KB）
 *
 * 两个职责
 * --------
 * 1.【无条件】承接原 [Rewrite] 的三处 json-del：
 *      bottom_section_list / ui.bottom_section / ui.live_section.float_info
 *    为什么搬进来：Loon 同端点 [Rewrite] 与 [Script] 同命中时只跑 [Rewrite]
 *    （2026-10-20 Bilibili 实证），不搬进来打标脚本就永远没机会执行。
 *    这与 v1.5 把 reject-dict 迁进 stub.response.js 是同一个理由。
 *
 * 2.【命中广告名单才做】详情页广告打标（写法 1，2026-10-21 用户确认）：
 *    详情页响应里没有任何广告标记（bkfl/openinfo/ad_id 全部 0 次，实测），
 *    广告身份只存在于信息流响应里。feed.response.js 打标时会把广告
 *    goods_id 写进 $persistentStore（环形，最近 200 条），本脚本查名单。
 *
 *    详情页的销量文案「已拼1.3万+袋」有 5 个渲染副本（实测烤肠）：
 *      goods.side_sales_tip                    母字段（字符串）
 *      sku[*].side_car_labels[*].text          SKU 侧栏（红字）
 *      ui.new_price_section.desc_labels[]      价格区标签数组
 *      ui.new_price_section.desc_labels_rich  价格区富文本行
 *      ui.pull_down_title_section.second_line_rich_list  下拉吸顶标题
 *    每个商品动词/单位/量级都不同（已拼/已抢/已售/总售 × 袋/件/双/盒），
 *    所以按销量正则识别、统一加「广告·」前缀；两处 rich_list 插入
 *    独立红字元素。全部幂等。若商品压根没有销量文案，回落到标题前缀
 *    「【广告】」，保证不丢标。
 *
 * 开关：feed_ad（与信息流打标共用一个开关）。
 * 任何异常一律放行原响应。
 */

const A = (typeof $argument === 'string' ? {} : $argument) || {};
const on = (v) => v === true || v === 1 || v === 'true' || v === '1' || v === 'on' || v === 'ON';

const AD_PREFIX = '广告·';
const AD_TITLE = '【广告】';
const AD_COLOR = '#E02E24';
const AD_KEY = 'pddAdGoodsIds';
const AD_CAP = 200;
// 销量/紧迫感文案。v1.77 只认「已拼|已抢|已售|总售」，漏了「快要抢光」
// （面包诱惑实测：SKU 侧栏、底部按钮副标题、desc_labels 第二帧都是它）。
const SALES = /(已拼|已抢|已售|总售|抢光|仅剩)/;

// ── $persistentStore 名单读取（read(key)）────────────────────
function loadAdIds() {
  try {
    const raw = $persistentStore.read(AD_KEY);
    const arr = raw ? JSON.parse(String(raw)) : [];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch (e) { return []; }
}

function prefixOnce(s) {
  return (typeof s === 'string' && s && !s.startsWith(AD_PREFIX)) ? AD_PREFIX + s : s;
}

// 在富文本行头部插入独立红字元素（幂等）
function insertRich(list) {
  if (!Array.isArray(list)) return false;
  const first = list.find((x) => x && typeof x === 'object');
  if (!first || first.txt === AD_PREFIX) {
    if (first && first.txt === AD_PREFIX) return false;
  }
  if (list.some((x) => x && typeof x === 'object' && x.txt === AD_PREFIX)) return false;
  list.unshift({ txt: AD_PREFIX, type: 1, font: 13, color: AD_COLOR });
  return true;
}

try {
  const body = $response && $response.body;
  if (!body) { $done({}); return; }

  let j;
  try { j = JSON.parse(body); } catch (e) { $done({}); return; }
  if (!j || typeof j !== 'object') { $done({}); return; }

  let changed = false;

  // ── 1) 承接原 [Rewrite] 的三处删除（无条件，保持 v1.75 行为）──
  if (j.bottom_section_list !== undefined) { delete j.bottom_section_list; changed = true; }
  if (j.ui && j.ui.bottom_section !== undefined) { delete j.ui.bottom_section; changed = true; }
  if (j.ui && j.ui.live_section && j.ui.live_section.float_info !== undefined) {
    delete j.ui.live_section.float_info; changed = true;
  }

  // ── 2) 广告打标（feed_ad 开 && goods_id 在名单里）──────────
  if (on(A.feed_ad)) {
    const gid = j.goods && j.goods.goods_id !== undefined ? String(j.goods.goods_id) : '';
    if (gid && loadAdIds().indexOf(gid) !== -1) {
      let marked = false;   // 是否至少在销量文案上打到了标

      // goods.side_sales_tip（母字段）
      if (typeof j.goods.side_sales_tip === 'string' && SALES.test(j.goods.side_sales_tip)) {
        j.goods.side_sales_tip = prefixOnce(j.goods.side_sales_tip); marked = true;
      }

      // sku[*].side_car_labels[*].text
      if (Array.isArray(j.sku)) {
        for (const s of j.sku) {
          const labels = s && s.side_car_labels;
          if (!Array.isArray(labels)) continue;
          for (const lb of labels) {
            if (lb && typeof lb === 'object' && typeof lb.text === 'string' && SALES.test(lb.text)) {
              lb.text = prefixOnce(lb.text); marked = true;
            }
          }
        }
      }

      // ui.new_price_section.desc_labels[] —— v1.78 起全部条目都打标：
      // 实测（面包诱惑）这是滚动条的帧列表，每条是独立一帧，
      // 只标销量帧会漏「快要抢光」帧。此处全部加前缀。
      const np = j.ui && j.ui.new_price_section;
      if (np && Array.isArray(np.desc_labels)) {
        for (let i = 0; i < np.desc_labels.length; i++) {
          if (typeof np.desc_labels[i] === 'string' && np.desc_labels[i]) {
            np.desc_labels[i] = prefixOnce(np.desc_labels[i]); marked = true;
          }
        }
      }

      // ui.new_price_section.first_desc_label（首帧）
      if (np && typeof np.first_desc_label === 'string' && np.first_desc_label) {
        np.first_desc_label = prefixOnce(np.first_desc_label); marked = true;
      }

      // ui.new_price_section.desc_labels_for_carousel —— 滚动条的另一套数据源，
      // 每个元素是独立一帧（实测：「本店已拼4.8万件」只在它里面下发）。
      // 每帧自带颜色，逐元素加前缀而不是插头元素（头元素不会跟着轮播）。
      if (np && Array.isArray(np.desc_labels_for_carousel)) {
        for (const el of np.desc_labels_for_carousel) {
          if (el && typeof el === 'object' && typeof el.txt === 'string' && el.txt) {
            el.txt = prefixOnce(el.txt); marked = true;
          }
        }
      }

      // ui.new_price_section.desc_labels_rich（插入红字元素）
      if (np && Array.isArray(np.desc_labels_rich)) {
        for (const row of np.desc_labels_rich) {
          if (Array.isArray(row) && row.length && insertRich(row)) marked = true;
        }
      }

      // ui.pull_down_title_section.second_line_rich_list
      const pd = j.ui && j.ui.pull_down_title_section;
      if (pd && Array.isArray(pd.second_line_rich_list) && pd.second_line_rich_list.length) {
        if (insertRich(pd.second_line_rich_list)) marked = true;
      }

      // ui.sku_section 的两个 suffix 列表（SKU 行内滚动文案）
      const skuSec = j.ui && j.ui.sku_section;
      const markSuffix = (node) => {
        if (!node || !Array.isArray(node.show_content)) return;
        for (const sc of node.show_content) {
          if (sc && typeof sc === 'object' && typeof sc.text === 'string' && SALES.test(sc.text)) {
            sc.text = prefixOnce(sc.text); marked = true;
          }
        }
      };
      if (skuSec) {
        markSuffix(skuSec.sku_suffix_display);
        if (Array.isArray(skuSec.sku_suffix_display_list)) {
          for (const node of skuSec.sku_suffix_display_list) markSuffix(node);
        }
      }

      // ui.new_bottom_section.right_button.title（底部购买按钮副标题）
      const rb = j.ui && j.ui.new_bottom_section && j.ui.new_bottom_section.right_button;
      if (rb && Array.isArray(rb.title)) {
        for (const el of rb.title) {
          if (el && typeof el === 'object' && typeof el.txt === 'string' && SALES.test(el.txt)) {
            el.txt = prefixOnce(el.txt); marked = true;
          }
        }
      }

      // 兜底：整个详情页没有销量文案 → 标题前缀，保证不丢标
      if (!marked) {
        const g = j.goods;
        if (typeof g.goods_name === 'string' && !g.goods_name.startsWith(AD_TITLE)) {
          g.goods_name = AD_TITLE + g.goods_name; changed = true;
        }
        if (typeof g.short_name === 'string' && !g.short_name.startsWith(AD_TITLE)) {
          g.short_name = AD_TITLE + g.short_name;
        }
      } else {
        changed = true;   // 打标本身就是改动
      }
    }
  }

  if (!changed) { $done({}); return; }
  $done({ body: JSON.stringify(j) });
} catch (e) {
  $done({});
}
