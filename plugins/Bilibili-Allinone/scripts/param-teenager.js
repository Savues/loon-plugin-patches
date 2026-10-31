/**
 * param-teenager.js — 改写 /x/v2/param 里的青少年弹窗间隔
 *
 * 背景（2026-11-01 逆向实证）:
 *   /x/v2/param 的 teenagers_mode_show_dialog_interval 决定"青少年模式引导弹窗"频率,
 *   App 缓存到 BFCTeenagersModePreferences 的 alertTnterval。服务端下发 "1"。
 *   App 重写配置时会丢掉 alertTnterval → 归 0 → 每次启动都弹。
 *
 * 本脚本只改这一个键, 其余 314 项原样透传。
 * 304 响应(data:null) 原样放行, 绝不构造假 data。
 */
(function () {
  var A = (typeof $argument === 'object' && $argument) ? $argument : {};
  var DAYS = String(A.teenagerDialogInterval || '864000');
  var obj;
  try {
    obj = JSON.parse($response.body);
  } catch (e) {
    $done({});
    return;
  }
  // 304 / 无 data / data 非对象 → 原样放行（关键：不能把 null 改成对象）
  if (!obj || typeof obj.data !== 'object' || obj.data === null) {
    $done({});
    return;
  }
  obj.data.teenagers_mode_show_dialog_interval = DAYS;
  $done({ body: JSON.stringify(obj) });
})();
