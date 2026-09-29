// 校验整合版清单：①无 first-match 死规则 ②每条规则的域名都在 [MitM] 里
// ③参数接线完整 ④字幕规则与原版一致，且只丢掉真冲突的那 2 条
// 用法：node test/merge-verify.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const lab = readFileSync(join(here, '..', 'YouTube-Test.lpx'), 'utf8')
const sub = readFileSync('/tmp/subs.lpx', 'utf8')

let fail = 0
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) fail++ }
const unesc = s => s.replace(/\\/g, '')          // 清单里 URL 是转义的，比较前先还原
const head = l => l.split(' ').slice(0, 2).join(' ')
const isRule = l => /^http-(request|response)/.test(l)

const rules = lab.split('\n').filter(isRule)
const subRules = sub.split('\n').filter(isRule)
console.log(`整合版 ${rules.length} 条规则 / 原字幕插件 ${subRules.length} 条\n`)

// ① first-match-wins：同方向 + 同 URL 只能有一条
ok(new Set(rules.map(head)).size === rules.length, '无重复的「同方向+同 URL」规则')

// ② 每条规则的 host 必须在 [MitM] 里，否则规则永远不执行
const mitm = (lab.match(/^\[Mitm\]\nhostname = (.*)$/m)?.[1] || '').split(',').map(s => s.trim())
for (const l of rules) {
  const u = unesc(l.split(' ')[1])
  const m = u.match(/^https?:\/\/\(([^)]*)\)\./)
  if (!m) continue
  const miss = m[1].split('|').filter(a => !mitm.includes(a + '.youtube.com'))
  ok(miss.length === 0, `MitM 覆盖 ${m[1]}.youtube.com`)
}

// ③ argument= / enable= 引用的参数都必须在 [Argument] 声明
const declared = new Set([...lab.matchAll(/^(\w+)\s*=\s*(switch|select|input)/gm)].map(m => m[1]))
for (const l of rules) {
  for (const p of (l.match(/argument=\[([^\]]*)\]/) || [, ''])[1].matchAll(/\{(\w+)\}/g)) {
    ok(declared.has(p[1]), `argument 里的 {${p[1]}} 已声明`)
  }
}
const en = lab.match(/enable=\{(\w+)\}/)?.[1]
ok(!!en && declared.has(en), `enable={${en}} 已声明`)

// ④ 字幕规则与原版一致（只允许改 tag / argument 顺序）
const strip = s => s
  .replace(/, *tag=[^,]*/, '')
  .replace(/, *argument=\[[^\]]*\]/, '')
  .replace(/, *argument=(?!\[)/, '')
  .replace(/,+$/, '').trim()
const changed = rules.filter(l => {
  const orig = subRules.find(s => s.startsWith(head(l) + ' ') && s.includes(l.split(' ')[2]))
  return orig && strip(orig) !== strip(l)
})
ok(changed.length === 0, `保留的字幕规则与原版一致（仅改 tag）${changed.length ? ' → ' + changed.length + ' 条被改' : ''}`)

// ⑤ 丢弃的必须恰好是与去广告真撞的 2 条
const dropped = subRules.filter(s => !rules.some(l => head(l) === head(s)))
const adEps = unesc(rules[0].split(' ')[1]).match(/\(([^)]*)\)/)[1].split('|')
console.log('\n丢弃 ' + dropped.length + ' 条：')
for (const d of dropped) {
  const [kind, url] = d.split(' ').slice(0, 2)
  const ep = unesc(url).match(/v1\/([a-z_]+)/)?.[1]
  console.log('  - ' + kind + ' youtubei/' + ep)
  ok(kind === 'http-response' && unesc(url).includes('youtubei.googleapis.com') && adEps.includes(ep),
     `  丢弃的与去广告真撞: ${kind} youtubei/${ep}`)
}
ok(dropped.length === 2, '恰好丢弃 2 条')

// ⑥ Type 的默认值必须是 Translate —— 对照抓包证明 Official+AutoCC 走 tlang 会被判 429
const typeLine = lab.match(/^Type\s*=\s*select,\s*"([^"]+)"/m)
ok(typeLine?.[1] === 'Translate',
   `Type 默认值 = Translate（实测只有 subtype=Translate 才返回 200）实际: ${typeLine?.[1]}`)

console.log(fail ? `\n${fail} 例失败` : '\n全部通过')
process.exit(fail ? 1 : 0)
