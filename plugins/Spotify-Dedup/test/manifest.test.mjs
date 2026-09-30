// manifest.test.mjs — Spotify-Dedup 清单层回归测试
//
// 守三件事：
//   1. 合并完整性 —— kelee 与 730 各自独有的那条规则都在
//   2. 没有死开关 —— 声明的开关必须真被引用（上一轮的教训）
//   3. 脚本托管完整性 —— v1.2 起脚本由 patch/merge-crack-dev.py 生成，
//      这里钉住 SHA 与并入的属性，防止「手改压缩过的 JS」这类不可追溯的改动
//
// 脚本层回归在同目录的 script.test.mjs（拿真机响应体回放）。
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

// 引用必须从「活规则行」里扫，不能扫全文 —— 本文件末尾的说明注释里
// 会引用 enable={blockQuic} 当反例，扫全文会把它当成真引用。
const liveLines = lpx.split('\n')
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('#'))
  .join('\n')
const argRefs = [...liveLines.matchAll(/argument=\[([^\]]*)\]/g)]
  .flatMap(m => [...m[1].matchAll(/\{(\w+)\}/g)].map(x => x[1]))
const enableRefs = [...liveLines.matchAll(/enable=\{(\w+)\}/g)].map(m => m[1])
const allRefs = [...new Set([...argRefs, ...enableRefs])]

for (const n of argNames) {
  t(`参数 ${n} 被引用`, allRefs.includes(n), '声明了却没人用 = 死开关')
}
for (const n of allRefs) {
  t(`引用 ${n} 已声明`, argNames.includes(n), '引用了未声明的参数')
}

t('3 条 Rewrite 均无条件（enable= 在 [Rewrite] 上无依据，不写假开关）',
  rw.every(r => !r.includes('enable={')),
  '官方手册未记载 Rewrite 支持 enable；上游 4362 条 Rewrite 里零使用')

// ── 2b. enable= 不能挂逻辑规则（v1.0 真机弹的窗） ───────────
console.log('\n【2b】enable= 不得挂在逻辑规则上（v1.0 缺陷回归）')

// 断言必须只看规则本身，不能扫注释 —— 说明文字里会引用 enable={blockQuic}
const ruleBody = rule.join('\n')

t('QUIC 规则无条件（enable= 已从逻辑规则上摘掉）',
  rule.filter(r => /^(AND|OR|NOT)\b/.test(r)).every(r => !r.includes('enable={')),
  'Loon 会把 "REJECT, enable={x}" 整段当策略名 → Can not find policy → 回落到第一个节点')

t('[Rule] 段内不含 enable={blockQuic}（该开关已删除）',
  !ruleBody.includes('blockQuic'),
  '声明了却删了引用 = 死开关；这里也顺带防「删了引用忘删声明」')

// 结构性防线：逻辑规则形如 AND,((...),(...)),POLICY。
// Loon 把最后那对 )) 之后的**全部**内容当成策略名，
// 所以策略名里只要再出现一个逗号，就会去找一个不存在的策略 → 回落到第一个节点。
const policyOf = r => {
  const i = r.indexOf('))')
  return i < 0 ? null : r.slice(i + 2).replace(/^,\s*/, '').trim()
}
const logicRules = rule.filter(r => /^(AND|OR|NOT)\b/.test(r))

t('没有逻辑规则的策略名里含逗号（即挂了尾部参数）',
  logicRules.every(r => !policyOf(r)?.includes(',')),
  '形如 AND,((...),(...)),REJECT,enable={x} 会被整体当成策略名')

t('QUIC 规则是本插件唯一一条逻辑规则，策略名为 REJECT',
  logicRules.length === 1 && policyOf(logicRules[0]) === 'REJECT')

t('脚本收到的参数个数与脚本行声明的一致',
  (() => {
    const m = script.find(s => s.includes('bootstrap'))
    if (!m) return false
    const n = (m.match(/argument=\[([^\]]*)\]/)?.[1] || '').split(',').length
    return n === 2
  })(), 'argument=[{tab},{useractivity}] 应为 2 个')

// ── 3. 脚本托管完整性 ───────────────────────────────────────
console.log('\n【3】脚本托管：v1.2 起属性表已并入 crack-dev，不再是逐字节副本')

// v1.1 及以前钉的是 kelee 线上版的逐字节副本。v1.2 起 patch/merge-crack-dev.py
// 把属性表从 10 项换成 38 项，SHA 随之改变 —— 这条断言的作用从「证明没被改过」
// 变成「改动必须是有意为之，且改完记得同步 UPSTREAM.md」。
const SHA_V12 = '270b1c76a4e93a8b7d22fa6988c29f3292a3661a5f39d584e554f4fb8882bb6a'
t('src/spotify.response.js 存在', existsSync(jsPath))
t(`SHA256 与 v1.2 记录一致（${js.length} B）`,
  createHash('sha256').update(js).digest('hex') === SHA_V12,
  '脚本被改动却没同步这里 —— 请同时更新 src/UPSTREAM.md 的 SHA 与说明')

t('script-path 指向本仓库 raw（不再是 kelee.one）',
  script.some(s => s.includes('raw.githubusercontent.com/Savues/loon-plugin-patches')) &&
  !script.some(s => s.includes('kelee.one')),
  '第三方站点消失会导致已导入的插件加载失败（kelee.one 现已 404）')

t('脚本真的读 $argument（这是选 kelee 版而非 730 版的唯一理由）',
  (js.toString().match(/\$argument/g) || []).length >= 4,
  '730 指向的重构版是 0 次，开关会形同虚设')

t('脚本含 Loon 状态守卫（非 200 直接透传）',
  js.toString().includes('200!==$response.status'))

// v1.2：属性表已并入。数量钉死，防止以后误删
const j = js.toString()
const attrCount = (j.slice(j.indexOf('function A(e,t)')).match(/(boolValue|stringValue|longValue):/g) || []).length
t('A() 属性表已并入 crack-dev（>= 38 项写入）', attrCount >= 38, `实际 ${attrCount}`)
t('含 crack-dev 独有的 catalogue=premium', j.includes('catalogue:{stringValue:"premium"}'))
t('含 crack-dev 独有的 subscription-enddate', j.includes('"subscription-enddate"'))
t('含 kelee 独有的 financial-product', j.includes('"financial-product"'))

// 补丁脚本必须在（脚本是生成的，不能手改）
t('patch/merge-crack-dev.py 存在（脚本是生成的）',
  existsSync(join(HERE, '..', 'patch', 'merge-crack-dev.py')))
t('patch/make-fixture.py 存在（fixture 可从 HAR 重新生成）',
  existsSync(join(HERE, '..', 'patch', 'make-fixture.py')))
t('fixture 已入库（真机响应体，脱敏后）',
  existsSync(join(HERE, 'fixtures', 'customize.bin.gz')) &&
  existsSync(join(HERE, 'fixtures', 'bootstrap.bin.gz')))
t('test/script.test.mjs 存在（脚本层回归）',
  existsSync(join(HERE, 'script.test.mjs')))

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
