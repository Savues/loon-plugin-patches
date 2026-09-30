// 🔍 一次性诊断壳层 —— 只做一件事：把 Loon 实际传给脚本的 $argument 原样回显。
// 不含上游逻辑、不做任何转发。取证完成后此文件即删除。
var _dType = (typeof $argument);
var _dStr = '';
try { _dStr = ($argument === null || $argument === undefined) ? String($argument) : String($argument); }
catch (e) { _dStr = '<toString failed: ' + e.message + '>'; }

var _dLen = _dStr.length;
var _dCodes = '';
for (var _i = 0; _i < Math.min(_dLen, 60); _i++) _dCodes += _dStr.charCodeAt(_i) + ' ';

// ── 对象形状专用输出（真机证实 TYPE=object，见 UPSTREAM.md）────────
var _dDump = '';
if (_dType === 'object' && $argument !== null) {
  var _ks = Object.keys($argument);
  _dDump += 'KEYS=' + JSON.stringify(_ks) + '\n';
  for (var _j = 0; _j < _ks.length; _j++) {
    var _v = $argument[_ks[_j]];
    _dDump += 'K=' + _ks[_j] + ' TYPE=' + (typeof _v) + ' VAL=' + JSON.stringify(_v) + '\n';
  }
} else if (_dType === 'function') {
  _dDump += 'IS_FUNCTION\n';
  _dDump += 'FN_STR=' + String($argument).slice(0, 200) + '\n';
}

$done({
  response: {
    status: 599,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
    body: 'DIAG-START\n' +
          'TYPE=' + _dType + '\n' +
          'LEN=' + _dLen + '\n' +
          'RAW=' + _dStr + '\n' +
          'CODES=' + _dCodes + '\n' + _dDump +
          'DIAG-END\n'
  }
});
throw new Error('DIAG-STOP');
