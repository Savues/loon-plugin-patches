// manifest.test.mjs —— 豆瓣搜索页广告词屏蔽（Douban-SearchAd）清单层测试
//
// 本插件的功能全部在 src/douban-search-ad.js 里，清单只负责把它挂上去。
// 所以测试分两块：清单的接线是否正确，以及那个「开关不是绝对」的说明
// 是否仍然成立（Loon 的 [MITM] 段没有参数化机制）。
//
// 运行：node test/manifest.test.mjs
// 无外部依赖。

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIR = join(HERE, '..')
const lpx = readFileSync(join(DIR, 'Douban-SearchAd.lpx'), 'utf8')
const script = readFileSync(join(DIR, 'src', 'douban-search-ad.js'), 'utf8')
const readme = readFileSync(join(DIR, 'README.md'), 'utf8')
// 上游原件只有一份，在 Douban-Dedup/（两个插件引用同一条规则）
const honue = readFileSync(join(DIR, '..', 'Douban-Dedup', 'upstream-honue.plugin'), 'utf8')

let pass = 0, fail = 0
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

// ── 1. 清单结构 ─────────────────────────────────────────────
console.log('\n【1】清单结构')
const secs = [...lpx.matchAll(/^\[([^\]]+)\]/gm)].map(m => m[1].toUpperCase())
t('四段齐全', ['ARGUMENT', 'RULE', 'URL REWRITE', 'SCRIPT', 'MITM']
  .every(s => secs.includes(s)), `实际 ${secs.join(',')}`)
t('文件以换行结尾', lpx.endsWith('\n'))
t('无 CRLF', !lpx.includes('\r'))
t('无 U+FFFD（编码损坏）', !lpx.includes('�'))
t('版本号 1.0', /^#!version=1\.0$/m.test(lpx))
t('desc 明确提示风险与替代方案', /Douban-Dedup/.test(lpx) && /加载失败/.test(lpx))

// ── 2. 开屏规则：逐字来自 honue 原版 ────────────────────────
console.log('\n【2】开屏规则（honue 原版）')
const upRewrite = (() => {
  const out = []
  let cur = null
  for (const line of honue.split('\n')) {
    const s = line.trim()
    if (s.startsWith('[')) { cur = s.slice(1, -1).toUpperCase(); continue }
    if (cur === 'URL REWRITE' && s && !s.startsWith('#')) out.push(s)
  }
  return out
})()
t('上游那条规则逐字保留（未做任何"修正"）',
  section('URL REWRITE').length === 1 && section('URL REWRITE')[0] === upRewrite[0],
  `上游: ${upRewrite[0]}\n本版: ${section('URL REWRITE')[0]}`)
t('没有把上游的 reject 改成 reject-dict（那会偏离原版基线）',
  section('URL REWRITE')[0].endsWith(' reject'))
t('规则能编译', (() => {
  try { new RegExp(section('URL REWRITE')[0].split(/\s+/)[0]); return true } catch { return false }
})())
const rwRe = new RegExp(section('URL REWRITE')[0].split(/\s+/)[0])
t('命中 app_ads/splash_preload（抓包实测端点）',
  rwRe.test('https://api.douban.com/v2/app_ads/splash_preload'))
t('不误伤非 app_ads 路径', !rwRe.test('https://api.douban.com/v2/movie/1292052'))

// ── 3. 开关 ─────────────────────────────────────────────────
console.log('\n【3】开关')
const argNames = section('ARGUMENT').map(l => l.split('=')[0].trim())
t('只声明 block_search_ad 一个开关', argNames.length === 1 && argNames[0] === 'block_search_ad',
  `实际 ${argNames.join(',')}`)
const scriptRules = section('SCRIPT')
t('开关被 [Script] 规则引用（该段挂 enable= 本仓库有真机先例：Bilibili-Dedup 6 条）',
  scriptRules.some(l => l.includes('enable={block_search_ad}')))
t('没有未被引用的死开关',
  [...new Set([...lpx.matchAll(/enable=\{(\w+)\}/g)].map(m => m[1]))]
    .every(a => argNames.includes(a)))

// 🔴 v1.x 的教训：写一个不生效的 enable= 比不写更糟 —— 用户会以为开关管用。
t('🔴 [URL Rewrite] 段零 enable=（该段挂 enable= 已实测静默失效）',
  section('URL REWRITE').every(l => !l.includes('enable=')),
  section('URL REWRITE').filter(l => l.includes('enable=')).join('\n'))
t('🔴 没有为开屏规则声明 Argument（挂不上就干脆不给开关）',
  !argNames.includes('block_splash'))

// ── 4. 🔴 脚本接线 ──────────────────────────────────────────
console.log('\n【4】🔴 脚本接线')
t('恰好 1 条 [Script] 规则', scriptRules.length === 1, scriptRules.join('\n'))
t('类型是 http-response（响应体改写只能走 [Script]）',
  scriptRules.length === 1 && scriptRules[0].startsWith('http-response '))
// 这两条是官方手册 docs/cn/script.md 的硬性要求，漏掉任一条脚本都不会生效
t('🔴 requires-body=true（否则 $response.body 恒为 undefined）',
  scriptRules.length === 1 && scriptRules[0].includes('requires-body=true'))
t('有 timeout（避免慢请求拖住连接）',
  scriptRules.length === 1 && /timeout=\d+/.test(scriptRules[0]))
t('匹配 search/found_words 与 search/hots',
  scriptRules.length === 1 && /found_words\|hots/.test(scriptRules[0]))
t('脚本指向本插件自己的托管路径（不是 Douban-Dedup）',
  scriptRules.length === 1 &&
  scriptRules[0].includes('plugins/Douban-SearchAd/src/douban-search-ad.js') &&
  !scriptRules[0].includes('plugins/Douban-Dedup/'))
t('🔴 [URL Rewrite] 段没有 script-response-body（[Rewrite] 无此语法）',
  !section('URL REWRITE').some(l => /script-response-body/.test(l)))
t('🔴 [Script] 段也没有 script-response-body',
  !scriptRules.some(l => /script-response-body/.test(l)))
t('脚本文件确实存在且非空', script.length > 1000, `${script.length} 字节`)

// ── 5. 🔴 MITM：开关做不到「绝对」这件事要说清楚 ─────────────
console.log('\n【5】🔴 [MITM] 域名')
const mitm = section('MITM').join('').replace(/^hostname\s*=\s*/, '')
  .split(',').map(s => s.trim()).filter(Boolean)
t('恰好 2 个域名', mitm.length === 2, `实际 ${mitm.join(',')}`)
t('api.douban.com 在列（开屏规则需要，来自原版）', mitm.includes('api.douban.com'))
t('frodo.douban.com 在列（脚本生效的前提）', mitm.includes('frodo.douban.com'))
t('没有 img*.doubanio.com（图片解密与本功能无关）',
  !mitm.some(m => m.includes('doubanio')))
t('没有把 *.douban.com 主域名收进来（那会解密全部业务流量）',
  !mitm.some(m => m === 'douban.com' || m === '*.douban.com'))
// 不变量：每个 MITM 域名都要有规则作用于它，否则等于白解密一份 TLS
t('每个 MITM 域名都有对应规则（无白 decrypt）',
  mitm.every(m => rwRe.test(`https://${m}/v2/app_ads/splash_preload`) ||
                   scriptRules.some(l => l.includes(m.replace(/\./g, '\\.')))))
// 这一条是本插件最需要说清楚的事：开关关掉后 MITM 依然生效
t('🔴 清单里已注明「开关关不掉 MITM」（Loon 限制）',
  /挂不到\s*\[MITM\]|没有参数化机制/.test(lpx))
t('🔴 参数的 desc 里也提示了这一点',
  /仍会被解密/.test(section('ARGUMENT')[0]))
// 「开关非绝对」这个产品事实已在【5】用清单正文断言钉住（挂不到 [MITM]），
// 不再重复测 README 措辞 —— 改一次排版就假失败。
t('README 存在', readme.length > 300)
t('README 指向 Douban-Dedup（两件套互相引用）', /Douban-Dedup/.test(readme))

// ── 6. 脚本内容的关键行为 ───────────────────────────────────
console.log('\n【6】脚本关键行为')
const code = script.replace(/^\s*\/\/.*$/gm, '')
t('按 layout:"ad" 删广告条目',
  /layout\s*===\s*'ad'/.test(code))
t('按 search_type:"ad_link" 删广告条目',
  /search_type\s*===\s*'ad_link'/.test(code))
t('整字段删除 top_word（协议层无法与热搜区分）',
  /delete\s+data\.top_word/.test(code))
t('删除 ad_info（广告投放配置）', /delete\s+data\.ad_info/.test(code))
t('任何解析异常一律放行（搜索功能优先）',
  /try\s*\{[\s\S]{0,80}catch[\s\S]{0,40}return\s+pass\(\)/.test(code))
t('不含 eval / Function 构造',
  !/\beval\s*\(|new\s+Function\s*\(/.test(code))
t('不含 $httpClient / fetch（无外部网络依赖）',
  !/\$httpClient|\bfetch\s*\(/.test(code))
t('可执行代码里不硬编码任何具体广告词',
  !/立减金|沙丘|肯尼亚/.test(code))

// ── 7. 上游原件留存 ─────────────────────────────────────────
console.log('\n【7】上游原件')
const bytes = s => Buffer.byteLength(s, 'utf8')
const sha = s => createHash('sha256').update(s, 'utf8').digest('hex')
t('honue 原件 480 字节 / SHA256 钉死',
  bytes(honue) === 480 &&
  sha(honue) === '13a92c78795bb5b6ea86e7b8467a7c1f16e0e719392f01b8cd693e065074525d',
  `实际 ${bytes(honue)} 字节`)
// v1.4 真机验证过的行为版是 d30e4bc6…；2026-10-01 精简后为 b011aee8…
// 两者真机行为一致，差异只在注释与写法。钉当前值即可，改脚本必改这里。
t('脚本 SHA256 钉死（改脚本必须同步改这里）',
  sha(script) === 'b011aee8acece66c9d82b0cf2e5c00057c5550d8719faedb523877411d7d1068',
  sha(script))

// ── 8. 文档 ─────────────────────────────────────────────────
console.log('\n【8】文档')
t('README 存在', readme.length > 500)
t('README 给出 raw 订阅地址',
  /raw\.githubusercontent\.com\/Savues\/loon-plugin-patches\/main\/plugins\/Douban-SearchAd/.test(readme))
t('README 致谢上游作者', /honue/.test(readme))

// ── 汇总 ────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
console.log(`通过 ${pass}　失败 ${fail}`)
process.exit(fail ? 1 : 0)
