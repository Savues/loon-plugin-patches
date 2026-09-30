// iTunes-Spoof 壳层 · 把 Loon 的参数字符串转成上游脚本期待的对象
//
// 为什么需要这一层（上游 bug 的根因，详见 UPSTREAM.md）：
//   上游读的是   $argument.Enabled / $argument.Expires / $argument.Country  ← 驼峰对象
//   Loon 传的是 "Enabled值,Expires值,Country值"                            ← 逗号字符串
//   类型不匹配 → 属性读到 undefined → 三个参数全部落回默认值
//   → 用户在参数页把 Enabled 填 false，插件照样转发，开关是假的。
//
// 本文件不修改上游 loon-itunes.js 的任何一行，只在它运行前：
//   1. 把参数解析成上游期待的对象；
//   2. Enabled 非 true 时直接 $done({}) 放行，并且【不再执行上游】。

// ── 开关关掉时必须阻止上游继续执行 ─────────────────────────────
// 用抛异常跨出，而不是包一层 IIFE 然后 return：
// 那样只退出了壳层自己的函数，上游代码仍在同一作用域里继续跑（实测会照样转发）。
if (typeof $argument !== 'string') $argument = '';

var _itunesArgParts = $argument.split(',');

// 取第 i 个参数并 trim。缺失（下标越界）和空串**都算没填**。
// 不能写 `s || dflt`：空串会被 || 兜回默认值，
//   · Enabled 空 → 会变成「开」，而用户清空输入框的意图是不用这个插件
//   · Expires 空 → 会把 expires= 空值发给 Worker
function _itunesArg(i, dflt) {
  var raw = _itunesArgParts[i];
  if (raw === undefined) return dflt;
  var s = String(raw).trim();
  return s === '' ? dflt : s;
}

// ── Enabled 单独处理：它**不回落**默认 ─────────────────────────
// 用户清空参数页输入框时，Loon 传的是 ""；split(',') 得到 [""]，
// 长度是 1 而不是 0，所以不能靠 length===0 判断「没填」。
// 这里的规则很简单：只有**恰好等于 true** 才算开。
// 缺失（未填 Enabled）也按关处理 —— 宁可误关（用户会发现没生效），
// 不可误开（用户以为关了，其实还在把收据发给第三方）。
var _itunesEnabled = (_itunesArgParts[0] === undefined ? '' : String(_itunesArgParts[0]).trim());

// 只认小写 true（与上游 Worker 侧一致）。
// 其它任何值（含 TRUE / 1 / yes / 空）一律视为「关」——
// 宁可误关（用户会发现没生效），不可误开（用户以为关了其实还在把收据发给第三方）。
if (_itunesEnabled !== 'true') {
  $done({});
  throw new Error('iTunes-Spoof disabled by switch');
}

$argument = {
  Enabled: _itunesEnabled,
  Expires: _itunesArg(1, '2099-09-09'),
  Country: _itunesArg(2, 'HK')
};
