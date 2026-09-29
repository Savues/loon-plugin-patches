// 校验 YouTube-Test.lpx 的 argument= 接线能让上游脚本真的删掉 Shorts 按钮。
// 断言链：清单里声明了 blockShorts → 规则把它传进 $argument → 上游 $i() 会删 FEshorts。
// 用法：node test/shorts-arg.test.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const lpx = readFileSync(join(here, '..', 'YouTube-Test.lpx'), 'utf8')
const js = readFileSync(process.argv[2] || '/tmp/youtube.response.js', 'utf8')

let fail = 0
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + msg); if (!cond) fail++ }

// 1. 上游默认值：blockShorts 是 false —— 这是 bug 的根
const defaults = js.match(/function ai\(\)\{return F\.decodeParams\(\{([^}]*)\}\)/)
ok(!!defaults, '能定位上游默认参数 ai()')
ok(/blockShorts:!1/.test(defaults?.[1] || ''), '上游默认 blockShorts=!1（false）→ 不删 Shorts')

// 2. guide 的处理器确实是 $i，且它靠 e.blockShorts 决定删不删 FEshorts
ok(/path:"guide",msgType:\w+,handler:\$i/.test(js), 'guide 端点 → handler $i')
ok(/\$i\(l,\{params:e\}\)\{[^}]*e\.blockShorts&&t\.push\("FEshorts"\)/.test(js),
   '$i() 里 blockShorts 为真才 push("FEshorts")')

// 3. 清单侧：4 个 switch 都声明了，且都在 argument= 里
for (const p of ['blockUpload', 'blockShorts', 'blockImmersive', 'debug']) {
  ok(new RegExp('^' + p + '\\s*=\\s*switch', 'm').test(lpx), `[Argument] 声明了 ${p}`)
}
const arg = lpx.match(/argument=\[([^\]]*)\]/)
ok(!!arg, '[Script] 带 argument=')
for (const p of ['blockUpload', 'blockShorts', 'blockImmersive', 'debug']) {
  ok(new RegExp('\\{' + p + '\\}').test(arg?.[1] || ''), `argument= 传入 \${${p}}`)
}

// 4. 反向：enable= 仍指向已声明的参数（Loon 引用未声明参数会让规则失效）
const enable = lpx.match(/enable=\{(\w+)\}/)
ok(!!enable && new RegExp('^' + enable[1] + '\\s*=\\s*switch', 'm').test(lpx),
   `enable={${enable?.[1]}} 指向已声明的 switch`)

console.log(fail ? `\n${fail} 例失败` : '\n全部通过')
process.exit(fail ? 1 : 0)
