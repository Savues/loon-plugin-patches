// 外部资源审计：扫 5 个脚本，列出所有可能的对外请求面。
// 目的：让「可控」变成可复跑的检查，而不是一次性的结论。
// 用法：node test/external-audit.mjs <脚本目录>   目录里应放这 5 个 .js
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) { console.error('用法: node test/external-audit.mjs <脚本目录>'); process.exit(2) }

// 允许出现的第三方域名 —— 全部是「翻译服务商」，字幕原文会发给它们。
// 除此之外出现任何域名都应视为异常。
const ALLOWED = new Set([
  'translate.googleapis.com', 'translation.googleapis.com',
  'clients5.google.com', 'translate.google.com',
  'api.cognitive.microsofttranslator.com', 'api.cognitive.microsofttranslator.us',
  'api.translator.azure.cn',
  'api-free.deepl.com', 'api.deepl.com',
  'fanyi-api.baidu.com', 'openapi.youdao.com',
])
// 只在注释/报错串里出现，不产生请求
const HARMLESS = /^(www\.)?(w3\.org|github\.com|raw\.githubusercontent\.com|schemas\.xmlsoap\.org|xmlns|purl\.org|creativecommons\.org|ns\.adobe\.com)$/

const NET = [
  ['$httpClient', /\$httpClient\s*\[/],   // 只认 adapter 里的实际调用
  ['$task.fetch', /\$task\.fetch\s*\(/],
  ['fetch(', /\bfetch\s*\(/],
  ['WebSocket', /\bWebSocket\s*\(/],
  ['eval(', /\beval\s*\(/],
  ['new Function', /new\s+Function\s*\(/],
  ['import(', /\bimport\s*\(/],
  ['sendBeacon', /sendBeacon/],
  ['XMLHttpRequest', /new\s+XMLHttpRequest/],
]
const DOMAIN = /https?:\/\/([a-zA-Z0-9._-]+)/g

const files = readdirSync(dir).filter(f => f.endsWith('.js'))
let bad = 0

for (const f of files) {
  const s = readFileSync(join(dir, f), 'utf8')
  console.log(`\n### ${f}  ${s.length} B`)

  const prims = NET.filter(([, re]) => re.test(s)).map(([n]) => n)
  console.log('  网络/执行原语:', prims.length ? prims.join(', ') : '无')

  const doms = new Map()
  for (const m of s.matchAll(DOMAIN)) doms.set(m[1], (doms.get(m[1]) || 0) + 1)

  const real = [], benign = []
  for (const [d, c] of doms) {
    if (HARMLESS.test(d)) benign.push(`${d}(${c})`)
    else if (ALLOWED.has(d)) real.push(`${d}(${c})`)
    else { console.log(`  ❌ 未登记的域名: ${d} ×${c}`); bad++ }
  }
  console.log('  翻译服务商域名:', real.length ? real.join(' ') : '无')
  console.log('  仅注释/报错中出现:', benign.length ? benign.join(' ') : '无')
}

console.log(bad ? `\n❌ ${bad} 个未登记域名，需人工确认` : '\n✅ 未发现未登记的对外域名')
console.log('提示: 原语「无」不代表绝对安全 —— 本检查只覆盖明文 URL 与已知原语，')
console.log('      字符串拼接/编码后的地址扫不出来，需配合人工审计。')
process.exit(bad ? 1 : 0)
