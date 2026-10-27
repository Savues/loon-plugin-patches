/*
 * cps_link.response.js —— 把信息流商品链接改写成多多进宝领券页（自研脚本）
 *
 * 端点：/api/alexa/cells/hub/v3、/api/alexa/homepage/hub/refresh 等含 goods_list 的接口
 *
 * 背景
 * ----
 * 拼多多「自购比价规则」：如果第一次进入商品是不带任何推广者标记的自然流量，
 * 之后再转链回去购买也不计佣金。所以必须在**第一次点击**时就落在一个 CPS 链接上。
 *
 * 服务端下发的每个商品都带一个跳转地址：
 *   "link_url": "goods.html?goods_id=1011377117024&_oak_rcto=...&_oak_gallery_token=..."
 *   "link_url": "search_bbk.html?source=10434&goods_id=1010550526772&scene=img&..."
 * 两种页型都有，所以脚本按 goods_id 重新拼地址，不依赖原页型。
 *
 * 改写目标（实测：H5 领券页不校验 goods_sign / cpsSign，只凭 goods_id + pid 即可打开）：
 *   duo_coupon_landing.html?goods_id=<id>&pid=<pid>&campaign=ddjb&duoduo_type=2
 *
 * 参数
 * ----
 * cps_rewrite : 总开关，默认关（改动商品跳转属于高危操作，默认不启用）
 * cps_pid     : 推广位 ID，默认 41096949_318859099
 * cps_probe   : 探针模式，只把**第一个**命中的商品改成一个必然不存在的页型
 *               (zzz_probe_test.html)，用来验证客户端到底读不读 link_url：
 *                 点商品报错/白屏 → link_url 被使用，方案成立
 *                 正常打开商品     → link_url 被忽略，本方案作废
 *
 * 安全
 * ----
 * 任何异常一律放行原响应；不改 goods_id，失败时商品仍可正常点击。
 */

const A = (typeof $argument === 'string' ? {} : $argument) || {};
const on = (v) => v === true || v === 1 || v === 'true' || v === '1' || v === 'on' || v === 'ON';
const str = (v) => (typeof v === 'string' ? v : '');

const PID = str(A.cps_pid) || '41096949_318859099';
const PROBE = on(A.cps_probe);
const PROBE_PATH = 'zzz_probe_test.html';

const RE_GID = /[?&]goods_id=(\d+)/;
const MAX_DEPTH = 9;

function buildLink(gid) {
  return 'duo_coupon_landing.html?goods_id=' + gid +
    '&pid=' + encodeURIComponent(PID) +
    '&campaign=ddjb&duoduo_type=2';
}

try {
  if (!on(A.cps_rewrite)) { $done({}); return; }

  const body = $response && $response.body;
  if (!body) { $done({}); return; }

  let j;
  try { j = JSON.parse(body); } catch (e) { $done({}); return; }

  let rewritten = 0;

  // 深度优先遍历，改写任何带 goods_id 的 link_url
  function walk(node, depth) {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) walk(node[i], depth + 1);
      return;
    }
    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = node[k];
      if (k === 'link_url' && typeof v === 'string') {
        const m = v.match(RE_GID);
        if (!m) continue;
        const gid = m[1];
        if (PROBE) {
          if (rewritten === 0) { node[k] = PROBE_PATH + '?goods_id=' + gid; rewritten++; }
          continue;                       // 探针模式只动第一个，其余原样
        }
        node[k] = buildLink(gid);
        rewritten++;
      } else if (v && typeof v === 'object') {
        walk(v, depth + 1);
      }
    }
  }

  walk(j, 0);

  if (!rewritten) { $done({}); return; }   // 没命中，原样放行，省一次序列化
  $done({ body: JSON.stringify(j) });
} catch (e) {
  $done({});
}
