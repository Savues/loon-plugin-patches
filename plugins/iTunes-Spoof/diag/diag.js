// 🔍 一次性诊断壳层 —— 只做一件事：把 Loon 实际传给脚本的 $argument 原样回显。
// 不含上游逻辑、不做任何转发。取证完成后此文件即删除。
var _dType = (typeof $argument);
var _dStr = '';
try { _dStr = ($argument === null || $argument === undefined) ? String($argument) : String($argument); }
catch (e) { _dStr = '<toString failed: ' + e.message + '>'; }

var _dLen = _dStr.length;
var _dCodes = '';
for (var _i = 0; _i < Math.min(_dLen, 60); _i++) _dCodes += _dStr.charCodeAt(_i) + ' ';

$done({
  response: {
    status: 599,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
    body: 'DIAG-START\n' +
          'TYPE=' + _dType + '\n' +
          'LEN=' + _dLen + '\n' +
          'RAW=' + _dStr + '\n' +
          'CODES=' + _dCodes + '\n' +
          'DIAG-END\n'
  }
});
throw new Error('DIAG-STOP');
