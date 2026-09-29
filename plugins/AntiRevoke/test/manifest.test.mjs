// manifest.test.mjs —— Apple 证书吊销检查屏蔽（AntiRevoke）清单层回归测试
//
// 覆盖：开关声明==引用（双向） / 域名集合与上游逐条比对 / enable 覆盖 /
//       switch 两值写法（Loon 三值写法实测关不掉）/ 上游署名与许可 / 无 MITM
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
t('清单中不含任何 hostname 声明', !/^\s*hostname\s*=/im.test(lpx))
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

t('声明 6 个开关', declared.length === 6, `实际 ${declared.length} 个: ${declared.join(', ')}`)

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
// upstreamDomains: 相对上游有意【移除】的域名（附理由，见 README「相对上游的改动」）
// upstreamRemoved: 相对上游有意【新增】的域名
const upstreamDomains = [
  'ocsp.apple.com', 'ocsp2.apple.com',
  'valid.apple.com',
  'crl.apple.com', 'certs.apple.com',
  'ocsp.digicert.com', 'ocsp.digicert.cn', 'crl3.digicert.com', 'crl4.digicert.com',
  'ocsp.entrust.net', 'crl.entrust.net',
  'ocsp.sectigo.com', 'crl.sectigo.com', 'ocsp.usertrust.com', 'crl.usertrust.com',
]
// 有意移除：非证书吊销检查端点（Apple 商店收据/内购校验），屏蔽它与本插件目的无关
const upstreamRemoved = ['ppq.apple.com', 'ppq-ext.v.aaplimg.com']
const upstreamAdded = []

console.log('\n【7】与上游比对')
// 先确认上游文件里确实是这 17 条，别让常量悄悄漂移
const upDoms = [...up.matchAll(/^DOMAIN,\s*([\w.-]+),\s*REJECT/gm)].map(m => m[1])
t('上游原件确有 17 条规则', upDoms.length === 17, `实际 ${upDoms.length} 条`)
t('上游原件域名集合与预期一致',
  JSON.stringify([...upDoms].sort()) === JSON.stringify([...upstreamDomains, ...upstreamRemoved].sort()),
  `上游: ${upDoms.join(', ')}`)

t('未擅自增删域名',
  JSON.stringify([...doms].sort()) === JSON.stringify([...upstreamDomains, ...upstreamAdded].sort()),
  `本版: ${doms.join(', ')}`)
t(`有意移除 ${upstreamRemoved.length} 个非吊销端点`,
  upstreamRemoved.every(d => !doms.includes(d)), upstreamRemoved.join(', '))
t('上游有的域名一个没少', upstreamDomains.every(d => doms.includes(d)),
  upstreamDomains.filter(d => !doms.includes(d)).join(', '))

// 逐组核对：域名必须挂在正确的开关下
console.log('\n【8】分组归属')
const groupOf = (sw) => rules.filter(r => r.includes(`enable={${sw}}`))
  .map(r => r.match(/^DOMAIN,\s*([\w.-]+)/)[1])
const expect = {
  apple_ocsp: ['ocsp.apple.com', 'ocsp2.apple.com'],
  apple_valid: ['valid.apple.com'],
  apple_crl: ['crl.apple.com', 'certs.apple.com'],
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

// 关掉任一开关后，仍生效的域名数应正好少掉该组
console.log('\n【9】开关可关性')
for (const [sw, list] of Object.entries(expect)) {
  const remaining = doms.length - groupOf(sw).length
  t(`关闭 ${sw} 后生效域名数 = ${remaining}`,
    remaining === doms.length - list.length && remaining > 0,
    `全开 ${doms.length} / 该组 ${groupOf(sw).length} 条`)
}

// ── 9b. 开关有效性必须被如实标注 ────────────────────────────
// 背景：官方文档只在 [Script] 段记载 enable=；[Rewrite] 段给的是 ${参数名}；
// [Rule] 段完全未提及参数机制。而本仓库 PinDuoDuo v1.3~v1.4 已实测证明
// [Rewrite] 上的 enable= 会「静默失效」（开关关不掉、规则照常拦截），
// v1.5 已改用 [Script] + argument= 绕开。
// [Rule] 属于同类未验证用法。本插件无脚本，没有 [Script] 那条已验证的退路，
// 因此必须确保 README 与 #!desc 都如实声明「未验证」，不得让读者误以为已生效。
console.log('\n【9b】开关有效性如实标注')
t('README 设有「开关是否真的生效」专节', /Does `enable=` actually work/.test(readme))
t('README 列出 [Script]/[Rewrite]/[Rule] 三段的支持差异',
  /\[Script\]/.test(readme) && /\[Rewrite\]/.test(readme) && /\[Rule\]/.test(readme))
t('README 点明 [Rewrite] 上 enable= 已实测失效', /实测失效|静默失效/.test(readme))
t('README 点明 [Rule] 未经验证', /未经验证|未在真机验证/.test(readme))
t('README 引用 PinDuoDuo 的先例', /PinDuoDuo/.test(readme))
t('README 给出真机验证步骤', /真机|日志/.test(readme))
t('README 给出开关失效时的退路', /退路/.test(readme))
t('#!desc 不再宣称开关必然可用', /未经真机验证|未验证/.test(
  (lpx.match(/^#!desc=(.+)$/m) || [])[1] || ''))

// ── 10. 版本号一致性 ────────────────────────────────────────
console.log('\n【10】版本号')
const nameM = lpx.match(/^#!name=(.+)$/m)
t('#!name 带版本号', !!nameM && / v\d+\.\d+$/.test(nameM[1].trim()), nameM ? nameM[1] : '(无)')
const ver = (nameM && (nameM[1].match(/ (v\d+\.\d+)$/) || [])[1]) || null
const rdVer = (readme.match(/\*\*(v\d+\.\d+)\*\*/) || [])[1] || null
t('版本号与 README 一致', !!ver && ver === rdVer, `#!name=${ver} README=${rdVer}`)

// ── 11. README 必须写清风险与改动 ──────────────────────────
console.log('\n【11】README 完整性')
t('README 声明非加密/非证书链验证', /不影响|不绕过/.test(readme))
// ppq 的真实身份是「企业/侧载 App 验证服务」，不是收据验证，也不是证书吊销端点。
// 断言按实际结论写：必须点明它是 App 验证、且屏蔽会导致 App 装不上/启动失败。
t('README 记录移除 ppq 的理由（App 验证服务）',
  /ppq/.test(readme) && /验证服务|App 验证|验证此?App|Unable to Verify/i.test(readme))
t('README 写明屏蔽 ppq 的后果', /装不上|启动失败|无法验证|Unable to Verify/i.test(readme))
t('README 给出 ppq 依据来源', /developer\.apple\.com|support\.apple\.com|idevicecentral/i.test(readme))
t('README 记录移除 MITM 的理由', /MITM/.test(readme) && /不需要解密|净开销|无必要/.test(readme))
t('README 给出订阅地址', /raw\.githubusercontent\.com\/Savues\/loon-plugin-patches/.test(readme))
t('README 含 CDN 缓存提示', /cb=2/.test(readme))

// ── 11b. 域名核实证据不得丢失 ──────────────────────────────
// 移植不能只照搬上游清单。15 条保留域名必须有据可查，
// 否则「删 ppq」这种判断就成了凭空主张。
console.log('\n【11b】域名核实证据')
t('README 设有域名逐条核实一节', /保留的 15 条域名逐条核实/.test(readme))
t('README 引用 Apple 官方网络要求文档',
  /support\.apple\.com\/en-us\/101555/.test(readme))
t('README 引用 DigiCert 官方 KB（ocsp.digicert.cn 本地化 OCSP）',
  /knowledge\.digicert\.com|Certificate Status IP Addresses/.test(readme))
t('README 说明 ocsp.digicert.cn 是中国区本地化 OCSP',
  /digicert\.cn/.test(readme) && /本地化/.test(readme))
t('README 记录 DigiCert CRL/OCSP 域名有厂商公告佐证', /Cisco/i.test(readme))
t('README 为 Sectigo 吊销端点给出厂商佐证',
  /sectigo/i.test(readme) && /Trellix|吊销端点|revocation/i.test(readme))
t('README 声明保留域名无一是照搬未核实', /没有一条是照搬上游未经核实/.test(readme))

// ── 汇总 ────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(52)}`)
console.log(`通过 ${pass} · 失败 ${fail}`)
process.exit(fail ? 1 : 0)
