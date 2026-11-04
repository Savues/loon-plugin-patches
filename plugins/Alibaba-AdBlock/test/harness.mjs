// Alibaba-AdBlock 语义回归 —— 共享 harness
// 只依赖 loon-sim CLI（rules --json / run --out），不引第三方库。
// 可用 ALIBABA_LPX 指向临时副本（负向验证：把事故规则加回去，用例必须变红）。
import { spawnSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(HERE, '..', '..', '..')
const CLI = join(ROOT, 'tools', 'loon-sim', 'cli.js')
const LPX = process.env.ALIBABA_LPX || join(HERE, '..', 'Alibaba-AdBlock.lpx')

export const S = { pass: 0, fail: 0 }

export function t(name, cond, detail = '') {
  if (cond) { S.pass++; console.log(`  ✅ ${name}`) }
  else { S.fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`) }
}

export function done() {
  console.log('\n' + '='.repeat(56))
  console.log(`通过 ${S.pass} · 失败 ${S.fail}`)
  process.exit(S.fail ? 1 : 0)
}

// 规则匹配（机读）：返回 { rule, ruleBlocked, rewrite, rewriteBlocked, script, ... }
export function rules(url) {
  const r = spawnSync('node', [CLI, 'rules', LPX, '--url', url, '--json'], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`loon-sim rules 失败 status=${r.status}\n${(r.stderr || '').slice(-500)}`)
  return JSON.parse(r.stdout)
}

// 响应脚本：返回处理后 body。空文件 = 脚本未改动 → 回落原始 fixture。
// loon-sim 在「无 Script 规则生效」时退出码为 3（不是错误），需显式放行。
export function runScript(url, fixture, args = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'alibaba-semantic-'))
  const outFile = join(dir, 'out.json')
  const argv = [CLI, 'run', LPX, '--url', url, '--phase', 'response',
    '--response-file', fixture, '--out', outFile]
  for (const [k, v] of Object.entries(args)) argv.push('--arg', `${k}=${v}`)
  const r = spawnSync('node', argv, { encoding: 'utf8' })
  if (r.status !== 0 && r.status !== 3) {
    throw new Error(`loon-sim run 失败 status=${r.status}\n${(r.stderr || r.stdout || '').slice(-800)}`)
  }
  const out = existsSync(outFile) ? readFileSync(outFile, 'utf8') : ''
  rmSync(dir, { recursive: true, force: true })
  return out || readFileSync(fixture, 'utf8')
}
