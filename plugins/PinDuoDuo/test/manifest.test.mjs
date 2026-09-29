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
t('#!name 带版本号', !!nameM && / v\d+\.\d+/.test(nameM[1]), nameM ? nameM[1] : '(无 #!name)')
const readme = readFileSync(join(HERE, '..', 'README.md'), 'utf8')
const ver = (nameM && (nameM[1].match(/ (v\d+\.\d+)$/) || [])[1]) || null
const rdVer = (readme.match(/\*\*(v\d+\.\d+)\*\*/) || [])[1] || null
t('版本号与 README 一致', ver && rdVer && ver === rdVer, `#!name=${ver} README=${rdVer}`)

// ── 2. 开关声明 == 引用 ─────────────────────────────────────
console.log('\n【2】Argument 开关')
const declared = [...lpx.matchAll(/^(\w+)\s*=\s*switch/gm)].map(m => m[1])
const used = [...new Set([...lpx.matchAll(/enable=\{(\w+)\}/g)].map(m => m[1]))]
t(`声明 ${declared.length} 个开关`, declared.length === 2, `实际: ${declared}`)
t('声明与引用完全一致', declared.length === used.length && declared.every(d => used.includes(d)),
  `声明 ${declared} vs 引用 ${used}`)
t('chat_stub 存在', declared.includes('chat_stub'))
t('telemetry_stub 存在', declared.includes('telemetry_stub'))
t('默认值为 true（保持原行为）', /chat_stub\s*=\s*switch,\s*true/.test(lpx) && /telemetry_stub\s*=\s*switch,\s*true/.test(lpx))

// ── 3. 高风险 REJECT 确已移除 ───────────────────────────────
console.log('\n【3】高风险规则不得生效')
t('无 QUIC REJECT', !active.some(l => l.includes('QUIC')))
t('无裸 IP 明文 REJECT', !active.some(l => l.includes('com.xunmeng.pinduoduo')))
t('xg.pinduoduo.com 不再被 REJECT', !active.some(l => l.includes('xg.pinduoduo.com')))
t('xg 的移除有注释说明', lpx.split('\n').some(l => l.startsWith('#') && l.includes('xg.pinduoduo.com')))

// ── 4. 聊天端点仍挂开关 ─────────────────────────────────────
console.log('\n【4】聊天/推荐端点')
const chatStubs = active.filter(l => l.includes('enable={chat_stub}'))
t('4 条端点挂上 chat_stub', chatStubs.length === 4, `实际 ${chatStubs.length} 条`)
t('含 new_chat_group', chatStubs.some(l => l.includes('new_chat_group')))
t('含 zaire_biz/chat/resource', chatStubs.some(l => l.includes('zaire_biz')))
const telStubs = active.filter(l => l.includes('enable={telemetry_stub}'))
t('8 个域名挂上 telemetry_stub', telStubs.length === 8, `实际 ${telStubs.length} 个`)

// ── 5. jq 表达式健壮性 ──────────────────────────────────────
console.log('\n【5】homepage/hub 的 jq')
const jqM = lpx.match(/response-body-json-jq '([^']+)'/)
t('清单含 jq 规则', !!jqM)
if (jqM) {
  const jq = jqM[1]
  t('已改为先判 type 再 map', jq.includes('type=="array"'))
  t('不再是裸 ? |= map 写法', !/\? \|= map\(/.test(jq))

  let haveJq = true
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }) }
  catch { haveJq = false; skip++; console.log('  ⏭  系统无 jq，跳过执行用例') }

  if (haveJq) {
    const run = (src) => {
      try {
        const out = execFileSync('jq', ['-e', jq], { input: src, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
        return { ok: true, out: JSON.parse(out) }
      } catch (e) { return { ok: false, err: String(e.stderr || e.message).split('\n')[0] } }
    }

    // 5a. 真实抓包数据
    const real = run(JSON.stringify(fixture))
    t('真实 HAR 响应不报错', real.ok, real.err)
    if (real.ok) {
      const links = (real.out.result.bottom_tabs || []).map(x => x.link)
      t('bottom_tabs 裁到 3 项', links.length === 3, `实际 ${links.length} 项: ${JSON.stringify(links)}`)
      t('保留 index/chat_list/personal',
        ['index.html', 'chat_list.html', 'personal.html'].every(l => links.includes(l)), JSON.stringify(links))
      t('移除多多视频 tab', !links.some(l => l.includes('pdd_live_tab_list')))
      t('移除推广 tab', !links.some(l => l.includes('promotion_source_name')))
      t('all_top_opts 长度不变', (real.out.result.all_top_opts || []).length === fixture.result.all_top_opts.length)
    }

    // 5b. 异常结构：原始写法在这些场景下会崩
    const cases = [
      ['buffer_bottom_tabs 为 null', { result: { bottom_tabs: [], buffer_bottom_tabs: null, all_top_opts: [] } }],
      ['all_top_opts 缺失', { result: { bottom_tabs: [] } }],
      ['result 整体缺失', { x: 1 }],
      ['all_top_opts 为 null', { result: { all_top_opts: null } }]
    ]
    for (const [name, src] of cases) {
      const r = run(JSON.stringify(src))
      t(`不崩: ${name}`, r.ok, r.err)
    }
  }
}

// ── 6. 去广告功能未被误伤 ───────────────────────────────────
console.log('\n【6】去广告功能保持')
t('pddpic 广告图 CDN 仍被拦截',
  active.some(l => /cdl-1\.pddpic\.com/.test(l) && l.includes('REJECT')) &&
  active.some(l => /cdl-p2\.pddpic\.com/.test(l) && l.includes('REJECT')))
t('MITM 域名未削减', /hostname\s*=\s*api\.pinduoduo\.com,\s*m\.pinduoduo\.net/.test(lpx))
const rw = section('REWRITE')
t('28 条 [Rewrite] 保留', rw.length === 28, `实际 ${rw.length} 条`)

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

