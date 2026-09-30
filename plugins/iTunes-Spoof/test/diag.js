// 🔍 诊断版壳层 —— 只为一次真机取证，不做任何转发。
// 把实际收到的 $argument 原样回显，Loon 会把它显示在抓包的响应体里。
var _diagType = (typeof $argument);
var _diagVal;
try { _diagVal = JSON.stringify($argument); } catch (e) { _diagVal = '<unstringifiable: ' + e.message + '>'; }
var _diagKeys = '';
try { _diagVal2 = (typeof $argument === 'object' && $argument !== null) ? JSON.stringify(Object.keys($argument)) : 'n/a'; }
catch (e) { _diagVal2 = 'ERR'; }

$done({
  response: {
    status: 599,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
    body: 'DIAG\n'
        + 'TYPE=' + _diagType + '\n'
        + 'KEYS=' + _diagVal2 + '\n'
        + 'JSON=' + _diagVal + '\n'
        + 'LEN=' + (String($argument === undefined ? '' : $argument).length) + '\n'
        + 'CODEPOINT0=' + (String($argument||'').charCodeAt(0)) + '\n'
  }
});
throw new Error('DIAG-STOP');
