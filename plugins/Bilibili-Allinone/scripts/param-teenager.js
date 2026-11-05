/**
 * param-teenager.js — 从 /x/v2/param 响应中【删除】teenagers_mode_show_dialog_interval
 *
 * 思路依据（2026-11-06）：
 *   国际版 3.20.1 的配置里根本没有这个键，而它不弹窗；
 *   iPad 3.71 的 param 里该键 = "1"，每天弹一次。
 *   反汇编: interval = getConfigByPath("teenagers_mode_show_dialog_interval")
 *           if (interval < 1) return false;   // 键缺失时很可能返回 nil → 视为 0
 *   → 之前改成 0 仍弹，说明「值为 0」和「键不存在」在 App 内部不等价。
 *     本脚本改为删除该键。
 *
 * 同时改写 ver，否则 App 认为配置无变化会跳过应用（v8.0.5 的教训）。
 * 304 / 非 JSON / data 非对象 → 原样放行。
 */
(function () {
  var obj;
  try {
    obj = JSON.parse($response.body);
  } catch (e) {
    $done({});
    return;
  }
  if (!obj || typeof obj.data !== 'object' || obj.data === null) {
    $done({});
    return;
  }
  delete obj.data.teenagers_mode_show_dialog_interval;
  obj.ver = String(Date.now());
  $done({ body: JSON.stringify(obj) });
})();
