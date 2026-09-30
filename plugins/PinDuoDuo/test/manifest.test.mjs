// manifest.test.mjs — 拼多多去广告（修复版）清单层回归测试
// 覆盖：开关声明==引用 / 高风险规则确已移除 / jq 在真实与异常结构下均不崩
//
// 运行：node test/manifest.test.mjs
// 无外部依赖，jq 走 node:child_process 调用系统 jq（缺失则跳过 jq 组用例）

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { t, done } from './harness.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const lpx = readFileSync(join(HERE, '..', 'PinDuoDuo.lpx'), 'utf8')
const fixture = JSON.parse(readFileSync(join(HERE, 'har-fixture.json'), 'utf8'))

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

// README 头部写着「N 条生效规则」，这个数字容易被改动带偏（v1.72/v1.73 连续两次对不上），
// 改成从清单实时数出来对账。
const activeCount = ['RULE', 'REWRITE', 'SCRIPT']
  .reduce((n, s) => n + section(s).length, 0)
const rdCount = (readme.match(/\/\s*(\d+)\s*条生效规则/) || [])[1]
t('README 生效规则数与清单一致', rdCount && Number(rdCount) === activeCount,
  `README=${rdCount} 实际=${activeCount}（RULE ${section('RULE').length} + REWRITE ${section('REWRITE').length} + SCRIPT ${section('SCRIPT').length}）`)

// 原「版本号较上次 +0.01」守卫已删除（2026-09-29）。
// 它用 `git show HEAD~1:<lpx>` 取「上次版本」，而 HEAD~1 是「上一个碰本仓库的提交」，
// 不是本插件自己的历史。多会话并发提交时序列被打散，就会拿别的插件当参照物 → 步长 0 → 误报。
// 实际发生过两次：一次是别的插件插在中间，一次是三个提交都与本插件无关。
//
// 删它的代价很小：真改动几乎都会动到「README 生效规则数」或「开关默认值」，
// 那两条对账式守卫会先报红。此守卫额外覆盖的只有「纯文档改动也要升版本号」。
//
// 若日后要恢复这条约束，用对账式而非差分式：
//   顶层 README 表格里的版本号 == 本插件 #!name 的版本号
// 这类断言只依赖当前文件内容，不受提交顺序影响。

// ── 2. 开关声明 == 引用 ─────────────────────────────────────
console.log('\n【2】Argument 开关')
const declared = [...lpx.matchAll(/^([\w.]+)\s*=\s*switch/gm)].map(m => m[1])
const inputs = [...lpx.matchAll(/^([\w.]+)\s*=\s*input/gm)].map(m => m[1])
// 开关有两条通路：enable={} 挂规则，或 argument=[{}] 传给脚本
// ⚠️ enable= 必须只从「活规则行」收集 —— 已注释的规则里还留着 enable={telemetry_stub}
// 当反例说明，扫全文会把它当成一个真引用，制造一次假失败。
const liveLines = lpx.split('\n').filter(l => !l.trim().startsWith('#'))
const viaEnable = [...new Set(liveLines.flatMap(l => [...l.matchAll(/enable=\{(\w+)\}/g)].map(m => m[1])))]
// argument 可能出现在多条 [Script] 规则上（stub / homepage 各一条），要全部收集
const viaArg = [...lpx.matchAll(/argument=\[([^\]]+)\]/g)]
  .flatMap(mm => (mm[1].match(/\{(\w+)\}/g) || []).map(x => x.slice(1, -1)))
const referenced = [...new Set(viaEnable.concat(viaArg))]

t('声明 12 个开关 + 1 个输入', declared.length === 12 && inputs.length === 1,
  `开关 ${declared.length} 个: ${declared.join(',')} / 输入 ${inputs.join(',')}`)
t('每个声明项都被引用', declared.every(d => referenced.includes(d)),
  `未被引用: ${declared.filter(d => !referenced.includes(d)).join(',') || '无'}`)
t('输入项被引用', inputs.every(i => referenced.includes(i)),
  `未被引用: ${inputs.filter(i => !referenced.includes(i)).join(',') || '无'}`)
t('引用项都已声明', referenced.every(r => declared.includes(r) || inputs.includes(r)),
  `未声明: ${referenced.filter(r => !declared.includes(r) && !inputs.includes(r)).join(',') || '无'}`)
for (const s of ['api_stub', 'chat_stub', 'phantom_stub', 'order_stub', 'search_stub', 'bottom_custom']) {
  t(`${s} 存在`, declared.includes(s))
}
// v1.7 起，屏蔽聊天/phantom 两项改为默认关闭（埋点那项已于 v1.75 整段删除，见【3】）
const DEFAULT_ON = ['api_stub', 'order_stub', 'search_stub']
const DEFAULT_OFF = ['chat_stub', 'phantom_stub']
t('两项默认 false（v1.7 起）',
  DEFAULT_OFF.every(s => new RegExp(s + '\\s*=\\s*switch,\\s*false').test(lpx)),
  DEFAULT_OFF.filter(s => !new RegExp(s + '\\s*=\\s*switch,\\s*false').test(lpx)).join(',') || '无')
t('其余高危开关默认 true（保持原行为）',
  DEFAULT_ON.every(s => new RegExp(s + '\\s*=\\s*switch,\\s*true').test(lpx)),
  DEFAULT_ON.filter(s => !new RegExp(s + '\\s*=\\s*switch,\\s*true').test(lpx)).join(',') || '无')
t('Bot_custom 是 input 不是 switch', inputs.includes('Bot_custom'))
const rwSec = section('REWRITE')
t('不再有 [Rewrite] 上的 enable=',
  !/enable=\{/.test(rwSec.join('\n')), 'enable= 只能用于 [Script]')
// enable= 只在 Loon 手册的 script.md 里有记载，rule.md / rewrite.md / plugin.md / general.md
// 全文都没有这个参数。v1.75 真机实测：[Rule] 上挂 enable= 的 8 条埋点规则在开关关闭时
// 照样命中（用户参数页截图 + 同一时段的抓包）。这条断言把那条教训钉死。
t('不再有 [Rule] 上的 enable=',
  !section('RULE').some(l => /enable=\{/.test(l)),
  section('RULE').filter(l => /enable=\{/.test(l)).join(' | ') || 'ok')
// 允许它只作为「已移除」的说明出现在注释里 —— [Rule] 段那 8 行注释正是为了留证据。
// 要断言的是：既没有声明成开关，也没有任何一条活规则引用它。
const telLive = lpx.split('\n').filter(l => !l.trim().startsWith('#'))
t('telemetry_stub 不在任何活规则/声明里',
  !telLive.some(l => /telemetry_stub/.test(l)),
  telLive.filter(l => /telemetry_stub/.test(l)).join(' | ') || 'ok')
t('但注释里留了退场说明', /# \[已移除-死开关\].*telemetry_stub/.test(lpx))

// ── 3. 高风险 REJECT 确已移除 ───────────────────────────────
console.log('\n【3】高风险规则不得生效')
t('无 QUIC REJECT', !active.some(l => l.includes('QUIC')))
// 通用守卫：同一段里出现两条完全相同的活动规则就是脏数据。
// v1.1 首次收录时 DOMAIN, titan.pinduoduo.com 就写了两遍，潜伏到 v1.73 才被发现。
t('无重复的活动规则', (() => {
  for (const sec of ['RULE', 'REWRITE', 'SCRIPT']) {
    const seen = new Set()
    for (const l of section(sec)) {
      if (seen.has(l)) return false
      seen.add(l)
    }
  }
  return true
})(), ['RULE', 'REWRITE', 'SCRIPT'].flatMap((s) => {
  const c = section(s), seen = new Set()
  return c.filter((l) => (seen.has(l) ? true : (seen.add(l), false)))
}).join(' | ') || '有重复')
t('无裸 IP 明文 REJECT', !active.some(l => l.includes('com.xunmeng.pinduoduo')))
// v1.72：这两条从「注释掉」改为「连注释一起删除」。旧注释写着「如需恢复请去掉行首 #」，
// 照做会写出仍匹配不了的正则，因此连误导性引导一并禁止回流。
t('裸 IP 规则连注释也已删除',
  !lpx.split('\n').some(l => l.includes('com.xunmeng.pinduoduo')),
  lpx.split('\n').filter(l => l.includes('com.xunmeng.pinduoduo')).map(x => x.slice(0, 40)).join(' | '))
t('无「恢复请去掉行首 #」类误导性引导',
  !/如需恢复|恢复前请先看|去掉行首\s*#/.test(lpx),
  (lpx.match(/.*(?:如需恢复|恢复前请先看|去掉行首).*/) || [''])[0].slice(0, 50))
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
const telStubs = active.filter(l => /apm\.pinduoduo\.com|meta\.pinduoduo\.com/.test(l))
t('埋点/遥测域名不再被拦截', telStubs.length === 0, `仍有 ${telStubs.length} 条：${telStubs.join(' | ')}`)
// 这条是本次事故的正向断言：只要有人再把 enable= 挂回 [Rule]，[3] 会红，
// 而红的原因必须指向「它在开关关闭时照样命中」这个真机结论，而不是「看起来不优雅」。
t('telemetry_stub 不在任何 argument= 里',
  !/argument=\[[^\]]*telemetry_stub/.test(lpx))

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
done()

