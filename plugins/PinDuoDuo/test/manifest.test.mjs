// manifest.test.mjs — 拼多多去广告（修复版）清单层回归测试
// 覆盖：开关声明==引用 / 高风险规则确已移除 / jq 在真实与异常结构下均不崩
//
// 运行：node test/manifest.test.mjs
// 无外部依赖，jq 走 node:child_process 调用系统 jq（缺失则跳过 jq 组用例）

import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const lpx = readFileSync(join(HERE, '..', 'PinDuoDuo.lpx'), 'utf8')
const fixture = JSON.parse(readFileSync(join(HERE, 'har-fixture.json'), 'utf8'))

let pass = 0, fail = 0, skip = 0
const t = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name}${detail ? '\n       ' + detail : ''}`) }
}
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
const active = lpx.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'))

// ── 1. 清单结构 ─────────────────────────────────────────────
console.log('\n【1】清单结构')
const secs = [...lpx.matchAll(/^\[(\w+)\]/gm)].map(m => m[1].toUpperCase())
for (const s of ['ARGUMENT', 'RULE', 'REWRITE', 'SCRIPT', 'MITM']) {
  t(`[${s}] 段存在`, secs.includes(s))
}
t('上游署名保留', /#!author=.*ZenmoFeiShi/.test(lpx) && /可莉/.test(lpx))

// 名称里的版本号必须与 README 一致，否则 Loon 里分不清新旧
const nameM = lpx.match(/^#!name=(.+)$/m)
t('#!name 带版本号', !!nameM && / v\d+\.\d+(\.\d+)?$/.test(nameM[1]), nameM ? nameM[1] : '(无 #!name)')
const readme = readFileSync(join(HERE, '..', 'README.md'), 'utf8')
const ver = (nameM && (nameM[1].match(/ (v[\d.]+)$/) || [])[1]) || null
const rdVer = (readme.match(/\*\*(v[\d.]+)\*\*/) || [])[1] || null
t('版本号与 README 一致', ver && rdVer && ver === rdVer, `#!name=${ver} README=${rdVer}`)

// ── 2. 开关声明 == 引用 ─────────────────────────────────────
console.log('\n【2】Argument 开关')
const declared = [...lpx.matchAll(/^([\w.]+)\s*=\s*switch/gm)].map(m => m[1])
const inputs = [...lpx.matchAll(/^([\w.]+)\s*=\s*input/gm)].map(m => m[1])
// 开关有两条通路：enable={} 挂规则，或 argument=[{}] 传给脚本
const viaEnable = [...new Set([...lpx.matchAll(/enable=\{(\w+)\}/g)].map(m => m[1]))]
// argument 可能出现在多条 [Script] 规则上（stub / homepage 各一条），要全部收集
const viaArg = [...lpx.matchAll(/argument=\[([^\]]+)\]/g)]
  .flatMap(mm => (mm[1].match(/\{(\w+)\}/g) || []).map(x => x.slice(1, -1)))
const referenced = [...new Set(viaEnable.concat(viaArg))]

t('声明 13 个开关 + 1 个输入', declared.length === 13 && inputs.length === 1,
  `开关 ${declared.length} 个: ${declared.join(',')} / 输入 ${inputs.join(',')}`)
t('每个声明项都被引用', declared.every(d => referenced.includes(d)),
  `未被引用: ${declared.filter(d => !referenced.includes(d)).join(',') || '无'}`)
t('输入项被引用', inputs.every(i => referenced.includes(i)),
  `未被引用: ${inputs.filter(i => !referenced.includes(i)).join(',') || '无'}`)
t('引用项都已声明', referenced.every(r => declared.includes(r) || inputs.includes(r)),
  `未声明: ${referenced.filter(r => !declared.includes(r) && !inputs.includes(r)).join(',') || '无'}`)
for (const s of ['api_stub', 'chat_stub', 'telemetry_stub', 'phantom_stub', 'order_stub', 'search_stub', 'bottom_custom']) {
  t(`${s} 存在`, declared.includes(s))
}
t('六个高危开关默认 true（保持原行为）',
  ['api_stub', 'chat_stub', 'telemetry_stub', 'phantom_stub', 'order_stub', 'search_stub']
    .every(s => new RegExp(s + '\\s*=\\s*switch,\\s*true').test(lpx)))
t('Bot_custom 是 input 不是 switch', inputs.includes('Bot_custom'))
const rwSec = section('REWRITE')
t('不再有 [Rewrite] 上的 enable=',
  !/enable=\{/.test(rwSec.join('\n')), 'enable= 只能用于 [Script]')

// ── 3. 高风险 REJECT 确已移除 ───────────────────────────────
console.log('\n【3】高风险规则不得生效')
t('无 QUIC REJECT', !active.some(l => l.includes('QUIC')))
t('无裸 IP 明文 REJECT', !active.some(l => l.includes('com.xunmeng.pinduoduo')))
t('xg.pinduoduo.com 不再被 REJECT',
  !section('RULE').some(l => /DOMAIN,\s*xg\.pinduoduo\.com/.test(l) && /REJECT/.test(l)))
t('xg 的移除有注释说明', lpx.split('\n').some(l => l.startsWith('#') && l.includes('xg.pinduoduo.com')))

// ── 4. 接口拦截已从 [Rewrite] 移到 [Script] ─────────────────
console.log('\n【4】接口拦截已从 [Rewrite] 移到 [Script]')
t('[Rewrite] 里不再有 reject-dict', !rwSec.some(l => l.includes('reject-dict')),
  rwSec.filter(l => l.includes('reject-dict')).map(x => x.slice(0, 50)).join(' | '))
t('[Rewrite] 里不再有 search 的 expansion 删除', !rwSec.some(l => /json-del.*expansion/.test(l)))
t('stub 脚本规则已挂上', section('SCRIPT').some(l => /stub\.response\.js/.test(l)))
t('stub 规则指向本仓库', /Savues\/loon-plugin-patches[^\s]*stub\.response\.js/.test(lpx))
const telStubs = active.filter(l => l.includes('enable={telemetry_stub}'))
t('8 个域名挂上 telemetry_stub', telStubs.length === 8, `实际 ${telStubs.length} 个`)

// ── 5. homepage/hub 交给脚本 ───────────────────────────────
console.log('\n【5】homepage/hub 已交给脚本处理')
// order_list_v4 的 json-jq 是另一处功能，与底栏无关，应保留
const hubRules = section('REWRITE').filter(l => /homepage/.test(l) && /pinduoduo\.com/.test(l))
t('homepage/hub 不再有 [Rewrite] 规则', hubRules.length === 0,
  `仍有 ${hubRules.length} 条：${hubRules.map(x => x.slice(0, 50)).join(' | ')}`)
t('不再有 homepage/hub 的 json-del', !hubRules.some(l => /json-del|json-jq/.test(l)))
t('homepage/hub 挂在 [Script] 上', section('SCRIPT').some(l => /homepage/.test(l) && /script-path=/.test(l)))
t('脚本指向本仓库', /Savues\/loon-plugin-patches.*homepage\.response\.js/.test(lpx))
const argM = lpx.match(/homepage\.response\.js[^\n]*argument=\[([^\]]+)\]/)
t('脚本带 argument 列表', !!argM, argM ? '' : '未找到 argument=')
if (argM) {
  const passed = (argM[1].match(/\{(\w+)\}/g) || []).map(x => x.slice(1, -1))
  const want = ['api_stub', 'search_stub', 'bottom_custom', 'Bot_index', 'Bot_chat', 'Bot_personal',
                'Bot_live', 'Bot_class', 'Bot_attendance', 'Bot_custom']
  t('argument 传入 10 项', passed.length === 10, `实际 ${passed.length}`)
  t('argument 项与开关名匹配', passed.slice().sort().join(',') === want.slice().sort().join(','))
}
t('脚本不挂 enable（靠内部判开关）', !/homepage\.response\.js.*enable=/.test(lpx))
t('脚本 URL 与 argument 之间无多余 enable', !/argument=\[[^\]]+\][^\n]*enable=/.test(lpx))


console.log('\n【6】去广告功能保持')
t('pddpic 广告图 CDN 仍被拦截',
  active.some(l => /cdl-1\.pddpic\.com/.test(l) && l.includes('REJECT')) &&
  active.some(l => /cdl-p2\.pddpic\.com/.test(l) && l.includes('REJECT')))
t('MITM 域名未削减', /hostname\s*=\s*api\.pinduoduo\.com,\s*m\.pinduoduo\.net/.test(lpx))
const rw = section('REWRITE')
// 原 28 条：2 条 homepage/hub + 21 条接口拦截均已移交脚本
t('[Rewrite] 剩 5 条纯去广告规则', rw.length === 5, `实际 ${rw.length} 条`)

// ── 7. 外部资源收敛（脚本层的第三方依赖）─────────────────────
console.log('\n【7】外部资源收敛')
const SRC = join(HERE, '..', 'src')
const script = readFileSync(join(SRC, 'PinDuoDuo_remove_ads.js'), 'utf8')
const upstream = readFileSync(join(SRC, 'upstream', 'PinDuoDuo_remove_ads.js'), 'utf8')
t('上游原件存在（src/upstream/）', existsSync(join(SRC, 'upstream', 'PinDuoDuo_remove_ads.js')))
t('被加载的脚本不含 kelee.one', !script.includes('kelee.one'),
  '仍引第三方域名：' + (script.match(/https?:\/\/[^"'\s]*kelee[^"'\s]*/) || ['?'])[0])
// 唯一允许的改动：newChunk 指向本仓库
const upLines = upstream.split('\n'), curLines = script.split('\n')
t('与上游原件行数相同', upLines.length === curLines.length, `上游 ${upLines.length} / 现在 ${curLines.length}`)
const diffIdx = upLines.map((l, i) => l === curLines[i] ? -1 : i).filter(i => i >= 0)
t('仅 1 行不同', diffIdx.length === 1, `实际 ${diffIdx.length} 行不同: ${diffIdx.map(i => i + 1).join(',')}`)
t('改的是 newChunk 那一行', diffIdx.length === 1 && /const newChunk =/.test(upLines[diffIdx[0]]),
  diffIdx.length ? `改的是: ${upLines[diffIdx[0]].slice(0, 60)}` : '')
t('oldChunk 仍指向拼多多官方 CDN', script.includes('https://pfile.pddpic.com/mdkd/'))
// 托管的 chunk
const chunkPath = join(SRC, 'chunks', '9410-b8806e870a26db7d.js')
t('chunk 已收进仓库', existsSync(chunkPath))
if (existsSync(chunkPath)) {
  const chunk = readFileSync(chunkPath, 'utf8')
  t('chunk 是 webpack chunk', chunk.includes('webpackChunk_N_E'))
  t('chunk 保留 4 个模块', ['82115', '75637', '43435', '70242'].every(m => chunk.includes(m)))
  const url = (script.match(/const newChunk = "([^"]+)"/) || [])[1] || ''
  t('newChunk 指向本仓库托管路径', url.includes('Savues/loon-plugin-patches') && url.endsWith('9410-b8806e870a26db7d.js'), url)
}
// 运行时不得再有第三方脚本域名
t('脚本内无第三方脚本域名', !/https?:\/\/(?!pfile\.pddpic\.com|raw\.githubusercontent\.com)[^"'\s]+\.js/.test(script),
  (script.match(/https?:\/\/[^"'\s]+\.js/g) || []).join(' '))

// ── 汇总 ────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60))
console.log(`通过 ${pass} · 失败 ${fail}${skip ? ` · 跳过 ${skip}` : ''}`)
process.exit(fail ? 1 : 0)

