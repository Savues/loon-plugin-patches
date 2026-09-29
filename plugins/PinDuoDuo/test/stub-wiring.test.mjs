// 校验 [Script] 里的 URL 正则能覆盖 stub.response.js 里 RULES 的每一条路径
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const lpx = readFileSync(join(HERE, '..', 'PinDuoDuo.lpx'), 'utf8')
const stub = readFileSync(join(HERE, '..', 'src', 'stub.response.js'), 'utf8')

let pass = 0, fail = 0
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`) } }

// 从清单里取 stub 规则的 URL 正则
const m = lpx.match(/http-response (\S+) script-path=\S*stub\.response\.js/)
t('清单含 stub 规则', !!m)
if (!m) process.exit(1)
const re = new RegExp(m[1])

// 从脚本里取路径
const paths = [...stub.matchAll(/\[\s*'\w+_stub'\s*,\s*'(?:stub|del)'\s*,\s*'(\/[^']+)'/g)].map(x => x[1])
t(`脚本里共 ${paths.length} 条路径`, paths.length === 21, `实际 ${paths.length}`)

console.log('\n【1】清单正则覆盖脚本的每一条路径')
for (const p of paths) {
  const url = 'https://api.pinduoduo.com' + p + '?pdduid=1'
  t(p.slice(0, 46), re.test(url), `不匹配: ${url}`)
}

console.log('\n【2】不应误伤的路径')
for (const p of ['/api/alexa/homepage/hub', '/api/alexa/cells/hub/v3', '/api/cappuccino/splash',
                 '/api/rainbow/message/sync', '/api/caterham/v3/query/personal_extra']) {
  t('不匹配 ' + p.slice(0, 40), !re.test('https://api.pinduoduo.com' + p + '?x=1'))
}

console.log('\n【3】每一组开关的端点都在覆盖范围内')
const groups = {
  chat_stub: ['/api/zaire_biz/chat/resource/get_list_data', '/api/caterham/v3/query/new_chat_group',
              '/api/caterham/v3/query/personal', '/api/buffon/nasus/recommend'],
  phantom_stub: ['/api/phantom/gbdbpdv/extra'],
  order_stub: ['/api/caterham/v3/query/my_order_group'],
  search_stub: ['/search_hotquery', '/search'],
}
for (const [g, ps] of Object.entries(groups)) {
  for (const p of ps) {
    t(`${g} → ${p.slice(0, 38)}`, re.test('https://api.pinduoduo.com' + p + '?a=1'))
  }
}

console.log('\n【4】argument 传参完整')
const am = lpx.match(/stub\.response\.js[^\n]*argument=\[([^\]]+)\]/)
t('含 argument', !!am)
if (am) {
  const got = (am[1].match(/\{(\w+)\}/g) || []).map(x => x.slice(1, -1))
  const want = ['api_stub', 'chat_stub', 'search_stub', 'phantom_stub', 'order_stub']
  t('传入 5 个开关', got.length === 5, `实际 ${got.length}: ${got}`)
  t('与脚本读取的键一致', got.slice().sort().join(',') === want.slice().sort().join(','))
}
t('stub 规则不挂 enable', !/stub\.response\.js.*enable=/.test(lpx))

console.log('\n' + '='.repeat(56))
console.log(`通过 ${pass} · 失败 ${fail}`)
process.exit(fail ? 1 : 0)
