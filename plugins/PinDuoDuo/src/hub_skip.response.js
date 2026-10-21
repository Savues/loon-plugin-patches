/*
 * hub_skip.response.js —— 省钱月卡 H5：自动点掉「跳过」按钮（自研脚本）
 *
 * 背景（2026-10-22 抓包 shared-33DB198B_474 定位）
 *   省钱月卡 / 续费管理这类 H5 页（m.pinduoduo.net/hub_monthly_card.html、
 *   hub_renew_manage.html）会弹全屏动效，右上角有一个「跳过」按钮。
 *
 *   动效本体：promotion-1.pddpic.com/promo/hub_monthly_card/20251205/172902/
 *   lottie/data.json（750×1624，92 帧），图层里直接烘焙了「跳过.png」图案；
 *   真正可点的按钮由模块 hub_popup_limit_expire 渲染，文案走 i18n key
 *   mobile-hub.csp.popup_skip（zh=跳过 / en=Skip），onClick 里做的是：
 *     清倒计时 -> dispatchEvent -> emphasizeLimitExpirePopupDone=true
 *                -> subsidyCountDownVisible=true
 *   即「点跳过 == 动效跑完」，所以替用户点掉不会丢任何东西。
 *
 *   另：签到领好礼（每日抽奖券）本身是 autoClaim=true（服务端自动发券，
 *   领取接口 /api/wizard/jaina/lottery/coupon/claim 只带 anti_content，无
 *   coupon_id），前端动效纯展示 —— 跳过它同样不影响发券。
 *   react_common 里还有一族通用跳过按钮（sc-zpklgs-*，::after 内容
 *   var(--skip-text,'跳过')），故一并兜住。
 *
 * 做法：往 HTML 响应体里注入一段自执行脚本，命中后模拟完整指针事件序列
 *   （pointerdown/mousedown/pointerup/mouseup/click）——H5 里不少按钮挂在
 *   touch/pointer 事件上，只调 element.click() 会哑火。
 *
 * 判断条件（宁可漏点，不可乱点）：
 *   1) 文本节点正好是「跳过」/「Skip」（找到后向上找不超过 2 层可点容器）
 *   2) 或元素 ::after 的 computed content 含「跳过」（sc-zpklgs 那一族）
 *   两者都要求元素可见且尺寸合理（2~260 × 2~140 px），最多点 4 次、
 *   最长扫描 120 秒，然后自动收工，不留常驻定时器。
 *
 * 开关：auto_skip（默认开）。
 */

const A = (typeof $argument === 'string' ? {} : $argument) || {};
const on = (v) => v === true || v === 1 || v === 'true' || v === '1' || v === 'on';

const MARK = 'data-pdd-autoskip';

// 注入的浏览器端脚本：单行紧凑写法，不依赖任何外部资源。
const INJECT = `<script>(${function () {
  var D = document, W = window, clicks = 0, start = Date.now();
  var MARKED = 'data-pdd-autoskip-marked';
  function box(e) {
    try { return e.getBoundingClientRect(); } catch (err) { return null; }
  }
  function visible(e) {
    var r = box(e);
    if (!r || r.width < 2 || r.height < 2) return false;
    if (r.width > 260 || r.height > 140) return false;
    try {
      var s = getComputedStyle(e);
      if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') return false;
      if (s.opacity === '0') return false;
    } catch (err) { /* 忽略 */ }
    return true;
  }
  function fire(e) {
    if (!e || e.getAttribute(MARKED)) return false;
    e.setAttribute(MARKED, '1');
    clicks++;
    try { D.documentElement.setAttribute('data-pdd-autoskip', 'hit:' + clicks); } catch (err) { /* 忽略 */ }
    var r = box(e) || { left: 0, top: 0, width: 0, height: 0 };
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    var names = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    for (var i = 0; i < names.length; i++) {
      var n = names[i], ev = null;
      try {
        if (n.indexOf('pointer') === 0 && typeof PointerEvent !== 'undefined') {
          ev = new PointerEvent(n, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'touch', isPrimary: true });
        } else {
          ev = new MouseEvent(n, { bubbles: true, cancelable: true, clientX: x, clientY: y });
        }
      } catch (err) { ev = null; }
      if (ev) { try { e.dispatchEvent(ev); } catch (err) { /* 忽略 */ } }
    }
    // 不再额外调 e.click()：上面 click 事件已派发，React 根监听会重复收到
    return true;
  }
  function byText() {
    var root = D.body || D.documentElement;
    if (!root) return false;
    var it = D.createTreeWalker(root, 4 /* SHOW_TEXT */, null), n;
    while ((n = it.nextNode())) {
      var v = (n.nodeValue || '').trim();
      if (v !== '跳过' && v !== 'Skip') continue;
      var t = n.parentElement;
      for (var up = 0; t && up < 2; up++) {
        var b = box(t);
        if (b && b.height >= 14 && b.width >= 24) break;
        t = t.parentElement;
      }
      if (t && visible(t) && fire(t)) return true;
    }
    return false;
  }
  function byPseudo() {
    var list = D.querySelectorAll('div[class*="sc-"],span[class*="sc-"],i[class*="sc-"]');
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.children.length) continue;
      var c = '';
      try { c = getComputedStyle(e, '::after').content || ''; } catch (err) { continue; }
      if (c.indexOf('跳过') === -1) continue;
      if (visible(e) && fire(e)) return true;
    }
    return false;
  }
  function stop() { clearInterval(iv); clearTimeout(to); }
  function scan() {
    if (clicks >= 4 || Date.now() - start > 120000) return stop();
    if (byText()) return;
    byPseudo();
  }
  var iv = setInterval(scan, 300), to = setTimeout(stop, 125000);
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', scan); else scan();
} .toString()})();</script>`;

try {
  if (!on(A.auto_skip)) { $done({}); } else {
    const orig = $response.body;
    if (typeof orig !== 'string' || !orig || orig.indexOf(MARK) !== -1) {
      $done({});
    } else {
      let body = orig.indexOf('</body>') !== -1
        ? orig.replace('</body>', INJECT + '</body>')
        : orig + INJECT;
      $done(body === orig ? {} : { body });
    }
  }
} catch (e) {
  // 兜底：出错一律放行，绝不因脚本问题让月卡页打不开
  $done({});
}
