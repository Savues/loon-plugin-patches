// manifest.test.mjs —— Apple 证书吊销检查屏蔽（AntiRevoke）清单层回归测试
//
// 只测清单行为：段结构、域名集合、规则格式、分组归属、版本号。
// 不测 README 措辞 —— 测措辞只会让人误以为文档有测试背书。
//
// 运行：node test/manifest.test.mjs
// 无外部依赖。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIR = join(HERE, '..')
const lpx = readFileSync(join(DIR, 'AntiRevoke.lpx'), 'utf8')
const up = readFileSync(join(DIR, 'upstream-AntiRevoke.plugin'), 'utf8')
const readme = readFileSync(join(DIR, 'README.md'), 'utf8')

let pass = 0, fail = 0
const t = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name}${detail ? '\n       ' + detail : ''}`) }
}

// 取某个段里的生效行（去注释、去空行）
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

// ── 1. 清单结构 ─────────────────────────────────────────────
console.log('\n【1】清单结构')
const secs = [...lpx.matchAll(/^\[(\w+)\]/gm)].map(m => m[1].toUpperCase())
t('[Argument] 段存在', secs.includes('ARGUMENT'))
t('[Rule] 段存在', secs.includes('RULE'))
t('无 [Script] 段（本插件不含任何 JS）', !secs.includes('SCRIPT'))
t('无 [Rewrite] 段', !secs.includes('REWRITE'))

// ── 2. MITM 段必须不存在 ────────────────────────────────────
console.log('\n【2】MITM')
t('无 [MITM] 段', !secs.includes('MITM'),
  'REJECT 是路由层规则，不需要解密域名；上游的 [MITM] 是净开销')
t('不含 %APPEND%（Loon 合并语义，无需显式追加）', !lpx.includes('%APPEND%'))

// ── 3. 上游署名与许可 ────────────────────────────────────────
console.log('\n【3】署名与许可')
t('保留原作者 Salem', /#!author=.*Salem/.test(lpx))
t('标注上游仓库地址', /salem-2007\/apple-cert-block/.test(lpx))
t('标注 Apache-2.0', /Apache-2\.0/.test(lpx))
t('标注改造者 Savues', /#!author=.*Savues/.test(lpx))
t('homepage 指向本仓库', /#!homepage=https:\/\/github\.com\/Savues\/loon-plugin-patches/.test(lpx))
t('icon 指向本仓库', /#!icon=https:\/\/raw\.githubusercontent\.com\/Savues\/loon-plugin-patches\//.test(lpx))
t('README 记录许可', /Apache-2\.0/.test(readme))
t('README 致谢原作者', /Salem/.test(readme))

// ── 4. 开关声明 == 引用（双向） ──────────────────────────────
console.log('\n【4】Argument 开关')
const declared = [...lpx.matchAll(/^([\w.]+)\s*=\s*switch/gm)].map(m => m[1])
const viaEnable = [...new Set([...lpx.matchAll(/enable=\{(\w+)\}/g)].map(m => m[1]))]

t('声明 7 个开关', declared.length === 7, `实际 ${declared.length} 个: ${declared.join(', ')}`)

// 反向：每个声明的开关都要被引用（防死开关）
const unused = declared.filter(d => !viaEnable.includes(d))
t('无死开关（声明即被引用）', unused.length === 0, `未被引用: ${unused.join(', ')}`)

// 正向：每个引用的开关都要已声明
const undeclared = viaEnable.filter(v => !declared.includes(v))
t('无未声明引用', undeclared.length === 0, `引用了未声明的: ${undeclared.join(', ')}`)

// ── 5. switch 必须是两值写法 ────────────────────────────────
// 依据：真机实测 Loon 的三值 switch,true,false 与 switch,false,true 都解析成 true，
// 根本关不掉任何开关。本仓库统一用两值 switch,<默认值>。
// 注意：不能写成 /switch,([^,]+),([^,]+),/ —— desc= 里的逗号会误判成三值。
// 三值的真实形态是两个字面量开关值：switch,<bool>,<bool>,
console.log('\n【5】switch 写法')
const argLines = section('ARGUMENT')
const threeVal = [...lpx.matchAll(/^([\w.]+)\s*=\s*switch\s*,\s*(?:true|false)\s*,\s*(?:true|false)\s*,/gm)]
t('无三值 switch 写法', threeVal.length === 0,
  threeVal.map(m => m[1]).join(', '))
const badDefault = argLines.filter(l => {
  const m = l.match(/^[\w.]+\s*=\s*switch,([^,]+)\s*$/)
  return m && m[1].trim() !== 'true' && m[1].trim() !== 'false'
})
t('switch 默认值只取 true/false', badDefault.length === 0, badDefault.join(' | '))

// ── 6. 规则条目 ─────────────────────────────────────────────
console.log('\n【6】规则条目')
const rules = section('RULE')
t('规则全部是 DOMAIN + REJECT', rules.every(r => /^DOMAIN,\s*[\w.-]+,\s*REJECT\s*(,|$)/.test(r)),
  rules.filter(r => !/^DOMAIN,\s*[\w.-]+,\s*REJECT\s*(,|$)/.test(r)).join(' | '))
t('每条规则都带 enable={}', rules.every(r => /enable=\{\w+\}/.test(r)),
  rules.filter(r => !/enable=\{/.test(r)).join(' | '))

// 域名不得重复
const doms = rules.map(r => r.match(/^DOMAIN,\s*([\w.-]+)/)[1])
const dup = doms.filter((d, i) => doms.indexOf(d) !== i)
t('无重复域名', dup.length === 0, dup.join(', '))

// ── 7. 与上游域名集合逐条比对 ────────────────────────────────
// 保留的 15 条（理由见 README「相对上游的改动」）
// 上游全部 17 条域名，一条不少、一条不多。逐条理由见 README。
const upstreamDomains = [
  'ocsp.apple.com', 'ocsp2.apple.com',
  'valid.apple.com',
  'ppq.apple.com', 'ppq-ext.v.aaplimg.com',
  'crl.apple.com', 'certs.apple.com',
  'ocsp.digicert.com', 'ocsp.digicert.cn', 'crl3.digicert.com', 'crl4.digicert.com',
  'ocsp.entrust.net', 'crl.entrust.net',
  'ocsp.sectigo.com', 'crl.sectigo.com', 'ocsp.usertrust.com', 'crl.usertrust.com',
]

console.log('\n【7】与上游比对')
// 清单必须与上游原件的域名集合完全相同（双向，不经中间常量）
const upDoms = [...up.matchAll(/^DOMAIN,\s*([\w.-]+),\s*REJECT/gm)].map(m => m[1])
t('上游原件确有 17 条规则', upDoms.length === 17, `实际 ${upDoms.length} 条`)
t('上游原件域名集合与预期一致',
  JSON.stringify([...upDoms].sort()) === JSON.stringify([...upstreamDomains].sort()),
  `上游: ${upDoms.join(', ')}`)
t('本版 17 条域名与上游逐一相同，无删无增',
  JSON.stringify([...doms].sort()) === JSON.stringify([...upDoms].sort()),
  `本版: ${doms.join(', ')}`)

// 逐组核对：域名必须挂在正确的开关下（同时保证无一落入「无开关」的黑洞）
console.log('\n【8】分组归属')
const groupOf = (sw) => rules.filter(r => r.includes(`enable={${sw}}`))
  .map(r => r.match(/^DOMAIN,\s*([\w.-]+)/)[1])
const expect = {
  apple_ocsp: ['ocsp.apple.com', 'ocsp2.apple.com'],
  apple_valid: ['valid.apple.com'],
  apple_crl: ['crl.apple.com', 'certs.apple.com'],
  app_verify: ['ppq.apple.com', 'ppq-ext.v.aaplimg.com'],
  digicert: ['ocsp.digicert.com', 'ocsp.digicert.cn', 'crl3.digicert.com', 'crl4.digicert.com'],
  entrust: ['ocsp.entrust.net', 'crl.entrust.net'],
  sectigo: ['ocsp.sectigo.com', 'crl.sectigo.com', 'ocsp.usertrust.com', 'crl.usertrust.com'],
}
for (const [sw, list] of Object.entries(expect)) {
  const got = groupOf(sw).sort()
  t(`${sw} 归属正确（${list.length} 条）`,
    JSON.stringify(got) === JSON.stringify([...list].sort()),
    `期望 ${list.join(',')} / 实际 ${got.join(',')}`)
}

// 域名总数必须等于各组之和：多出来的就是没挂开关的「黑洞规则」
console.log('\n【9】无规则游离在开关之外')
const grouped = Object.values(expect).flat().length
t('每条域名都归入某个开关组', grouped === doms.length,
  `规则 ${doms.length} 条 / 分组覆盖 ${grouped} 条`)

// ── 10. 版本号一致性 ────────────────────────────────────────
console.log('\n【10】版本号')
const nameM = lpx.match(/^#!name=(.+)$/m)
t('#!name 带版本号', !!nameM && / v\d+\.\d+$/.test(nameM[1].trim()), nameM ? nameM[1] : '(无)')
const ver = (nameM && (nameM[1].match(/ (v\d+\.\d+)$/) || [])[1]) || null
const rdVer = (readme.match(/\*\*(v\d+\.\d+)\*\*/) || [])[1] || null
t('版本号与 README 一致', !!ver && ver === rdVer, `#!name=${ver} README=${rdVer}`)

// ── 汇总 ────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(52)}`)
console.log(`通过 ${pass} · 失败 ${fail}`)
process.exit(fail ? 1 : 0)
