// manifest.test.mjs — Spotify-Dedup 清单层回归测试
//
// 守三件事：
//   1. 合并完整性 —— kelee 与 730 各自独有的那条规则都在
//   2. 没有死开关 —— 声明的开关必须真被引用（上一轮的教训）
//   3. 托管脚本是 kelee 线上版的逐字节副本
//
// 运行：node test/manifest.test.mjs

import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { t, done } from './harness.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const lpx = readFileSync(join(HERE, '..', 'Spotify-Dedup.lpx'), 'utf8')
const jsPath = join(HERE, '..', 'src', 'spotify.response.js')
const js = existsSync(jsPath) ? readFileSync(jsPath) : Buffer.alloc(0)

const section = (name) => {
  const out = []
  let cur = null
  for (const line of lpx.split('\n')) {
    const s = line.trim()
    if (s.startsWith('[')) { cur = s.slice(1, -1).toUpperCase(); continue }
    if (cur === name && s && !s.startsWith('#')) out.push(s)
  }
  return out
}

const argNames = section('ARGUMENT').map(l => l.split(/[=,\s]/)[0].trim())

// ── 1. 合并完整性 ───────────────────────────────────────────
console.log('\n【1】合并完整性：三个来源的规则一条不缺')

const rw = section('REWRITE')
const rule = section('RULE')
const script = section('SCRIPT')

t('pendragon 广告配置拦截（kelee 与 730 共有）',
  rw.some(r => r.includes('/pendragon\\/') && r.includes('reject-dict')))
t('artistview iphone→ipad 改写（kelee 与 730 共有）',
  rw.some(r => r.includes('artistview') && r.includes('platform=iphone') && r.includes('platform=ipad')))
t('gae2 老版广告端点拦截（仅 730 有）',
  rw.some(r => r.includes('gae2-spclient') && r.includes('/ad')))
t('QUIC 封锁（仅 kelee 有）',
  rule.some(r => r.includes('PROTOCOL, QUIC') && r.includes('spotify.com')))
t('bootstrap 响应脚本（kelee 与 730 共有）',
  script.some(s => s.includes('bootstrap') && s.includes('user-customization-service')))

t('MITM 域名与两个来源一致',
  section('MITM').join(' ').includes('*-spclient.spotify.com') &&
  section('MITM').join(' ').includes('spclient.wg.spotify.com'))

// ── 2. 没有死开关 ───────────────────────────────────────────
console.log('\n【2】开关接线：声明的必须被引用，引用的必须已声明')

const argRefs = [...lpx.matchAll(/argument=\[([^\]]*)\]/g)]
  .flatMap(m => [...m[1].matchAll(/\{(\w+)\}/g)].map(x => x[1]))
const enableRefs = [...lpx.matchAll(/enable=\{(\w+)\}/g)].map(m => m[1])
const allRefs = [...new Set([...argRefs, ...enableRefs])]

for (const n of argNames) {
  t(`参数 ${n} 被引用`, allRefs.includes(n), '声明了却没人用 = 死开关')
}
for (const n of allRefs) {
  t(`引用 ${n} 已声明`, argNames.includes(n), '引用了未声明的参数')
}

t('blockQuic 挂在 [Rule] 上（真机验过的用法）',
  rule.some(r => r.includes('enable={blockQuic}')))
t('3 条 Rewrite 均无条件（enable= 在 [Rewrite] 上无依据，不写假开关）',
  rw.every(r => !r.includes('enable={')),
  '官方手册未记载 Rewrite 支持 enable；上游 4362 条 Rewrite 里零使用')

t('脚本收到的参数个数与脚本行声明的一致',
  (() => {
    const m = script.find(s => s.includes('bootstrap'))
    if (!m) return false
    const n = (m.match(/argument=\[([^\]]*)\]/)?.[1] || '').split(',').length
    return n === 2
  })(), 'argument=[{tab},{useractivity}] 应为 2 个')

// ── 3. 脚本托管完整性 ───────────────────────────────────────
console.log('\n【3】脚本托管：kelee 线上版逐字节副本')

const SHA = '198cb5869d9710c56ed1945156c8f6227fdf9d19da38ee1c8870f4d72f26c6c8'
t('src/spotify.response.js 存在', existsSync(jsPath))
t(`SHA256 与采集时一致（${js.length} B）`,
  createHash('sha256').update(js).digest('hex') === SHA)

t('script-path 指向本仓库 raw（不再是 kelee.one）',
  script.some(s => s.includes('raw.githubusercontent.com/Savues/loon-plugin-patches')) &&
  !script.some(s => s.includes('kelee.one')),
  '第三方站点消失会导致已导入的插件加载失败')

t('脚本真的读 $argument（这是选 kelee 版而非 730 版的唯一理由）',
  (js.toString().match(/\$argument/g) || []).length >= 4,
  '730 指向的重构版是 0 次，开关会形同虚设')

t('脚本含 Loon 状态守卫（非 200 直接透传）',
  js.toString().includes('200!==$response.status'))

// ── 4. 头部字段 ─────────────────────────────────────────────
console.log('\n【4】头部字段')

t('#!system 补全为 iOS, iPadOS, macOS（上游是空值）',
  /^#!system\s*=\s*iOS,\s*iPadOS,\s*macOS\s*$/m.test(lpx))
t('#!system 不是空值（空值是否等于全平台兼容无据可依）',
  !/^#!system\s*=\s*$/m.test(lpx))
t('声明了 #!loon_version', /^#!loon_version\s*=\s*\S/m.test(lpx))
t('声明了 #!date', /^#!date\s*=\s*\S/m.test(lpx))
t('头部指明本仓库地址', /^#!homepage\s*=\s*https:\/\/github\.com\/Savues/m.test(lpx))

done()
