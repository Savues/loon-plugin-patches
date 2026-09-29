// 校验整合版清单的三件事：①无 first-match 死规则 ②参数接线完整
// ③字幕规则的 script-path 全部指向本仓库托管的副本
// 用法：node test/merge-verify.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const lab = readFileSync(join(here, '..', 'YouTube-Test.lpx'), 'utf8')

let fail = 0
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) fail++ }

const rules = lab.split('\n').filter(l => /^http-(request|response)/.test(l))
console.log(`整合版 ${rules.length} 条规则\n`)

// ① Loon 的 [Script] 先匹配先执行：同方向 + 同 URL 只能有一条，否则后面那条永不执行
ok(new Set(rules.map(l => l.split(' ').slice(0, 2).join(' '))).size === rules.length,
   '无重复的「同方向+同 URL」规则')

// ② 参数接线：argument= 与 enable= 引用的参数都必须在 [Argument] 声明
const declared = new Set([...lab.matchAll(/^(\w+)\s*=\s*(switch|select|input)/gm)].map(m => m[1]))
for (const l of rules) {
  for (const p of (l.match(/argument=\[([^\]]*)\]/) || [, ''])[1].matchAll(/\{(\w+)\}/g)) {
    ok(declared.has(p[1]), `argument 里的 {${p[1]}} 已声明`)
  }
}
const en = lab.match(/enable=\{(\w+)\}/)?.[1]
ok(!!en && declared.has(en), `enable={${en}} 已声明`)

// ③ 每条字幕规则的脚本都指向本仓库托管的副本（上游 URL 只在 UPSTREAM.md 里作为出处记录）
const scripts = rules.map(l => (l.match(/script-path=([^,]+)/) || [, ''])[1])
const foreign = scripts.filter(u => u && !u.includes('Savues/loon-plugin-patches'))
ok(foreign.length === 0, `脚本全部由本仓库托管${foreign.length ? ' → 例外: ' + foreign.join(' ') : ''}`)

// 托管的脚本必须真实存在，否则 Loon 会加载失败
const root = join(here, '..', '..', '..')
for (const u of new Set(scripts.filter(Boolean))) {
  const rel = u.split('/main/')[1]
  if (!rel) continue
  const p = join(root, rel)
  let exists = true
  try { readFileSync(p) } catch { exists = false }
  ok(exists, `托管文件存在 plugins/${rel.replace('plugins/', '')}`)
}

console.log(fail ? `\n${fail} 例失败` : '\n全部通过')
process.exit(fail ? 1 : 0)
