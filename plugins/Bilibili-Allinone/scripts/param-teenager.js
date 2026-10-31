/**
 * param-teenager.js — 改写 /x/v2/param 里的青少年引导弹窗间隔
 *
 * 逆向依据（2026-11-01, LC 3.71.0 反汇编 0x10cf977e8 起）:
 *   interval = config[teenagers_mode_show_dialog_interval]
 *   if (interval < 1) return false;                 // 小于 1 不弹
 *   lastShow = defaults[BFCTeenagersModeAlertShowDate]
 *   if (!lastShow) return true;                     // 无记录 → 弹
 *   days = abs(NSCalendarUnitDay 差值)              // 单位=天, 取绝对值
 *   return days >= interval;
 *
 * 关键: 配置带 ver 版本号。若 ver 不变, App 会跳过应用 data（即使内容改了）。
 *       → 本脚本同时改写 ver, 强制 App 采用新配置。
 */
(function () {
  var A = (typeof $argument === 'object' && $argument) ? $argument : {};
  var DAYS = String(A.teenagerDialogInterval || '365');
  var obj;
  try {
    obj = JSON.parse($response.body);
  } catch (e) {
    $done({});
    return;
  }
  // 304 / 无 data / data 非对象 → 原样放行（不能把 null 改成对象）
  if (!obj || typeof obj.data !== 'object' || obj.data === null) {
    $done({});
    return;
  }
  obj.data.teenagers_mode_show_dialog_interval = DAYS;
  // 强制版本号变化, 否则 App 认为配置未更新而跳过应用
  obj.ver = String(Date.now());
  $done({ body: JSON.stringify(obj) });
})();
