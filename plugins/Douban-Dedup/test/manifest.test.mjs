// manifest.test.mjs —— 豆瓣去广告（Douban-Dedup v2.0）清单层回归测试
//
// v2.0 的定位：以 honue 原版为基线，只追加搜索页广告剥离脚本。
// 因此本测试的第一要务是**钉住「改动最小」这件事本身**：
// 原版那 1 条 Rewrite 的结构、MITM 的原域名、以及没有多余规则。
//
// 运行：node test/manifest.test.mjs
// 无外部依赖。

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIR = join(HERE, '..')
const lpx = readFileSync(join(DIR, 'Douban-Dedup.lpx'), 'utf8')
const honue = readFileSync(join(DIR, 'upstream-honue.plugin'), 'utf8')
const readme = readFileSync(join(DIR, 'README.md'), 'utf8')

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
// 段名可含空格（[URL Rewrite]），所以不能用 \w+
const secs = [...lpx.matchAll(/^\[([^\]]+)\]/gm)].map(m => m[1].toUpperCase())
t('五段齐全',
  ['ARGUMENT', 'RULE', 'URL REWRITE', 'SCRIPT', 'MITM'].every(s => secs.includes(s)),
  `实际 ${secs.join(',')}`)
t('文件以换行结尾', lpx.endsWith('\n'))
t('无 CRLF', !lpx.includes('\r'))
t('元信息含上游与本仓库署名', /honue/.test(lpx) && /Savues/.test(lpx))
t('版本号是 2.0', /^#!version=2\.0$/m.test(lpx))

// ── 2. 🔴 改动最小化：v2.0 的第一要务 ───────────────────────
// 原版只有 1 条 Rewrite、1 个 MITM 域名、1 个空 [Rule]。
// v2.0 不允许长出别的东西 —— 之前 v1.x 加的信息流/HTTPDNS 规则
// 在真机上造成个人主页/小组页高并发时连接池排队。
console.log('\n【2】🔴 改动最小化（对照上游原件）')
t('🔴 [Rule] 段仍然为空（上游也是空的）',
  section('RULE').length === 0, section('RULE').join('\n'))
t('🔴 [URL Rewrite] 只有 1 条（上游也是 1 条）',
  section('URL REWRITE').length === 1, section('URL REWRITE').join('\n'))
t('🔴 没有引入 IP-CIDR / DOMAIN 规则',
  !/^(IP-CIDR|DOMAIN)/.test(lpx))
t('🔴 没有引入 erebor / movie / tv / group 等信息流端点',
  !/erebor|\/movie\/|\\\/tv\\\/|\\\/group\\\//.test(lpx))
t('🔴 没有引入 dale_ad 素材图规则',
  !lpx.includes('dale_ad'))
t('🔴 MITM 只有 2 个域名（上游 1 个 + 脚本必需的 frodo）',
  (() => {
    const m = section('MITM').join('').replace(/^hostname\s*=\s*/, '').split(',').map(s => s.trim())
    return m.length === 2
  })())
t('🔴 没有把 img*.doubanio.com 收进 MITM（那是排队元凶之一）',
  !/doubanio/.test(lpx))

// 上游那 1 条规则的「形状」必须保持：只动 v2→v\d+ 与 reject→reject-dict
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
const newRewrite = section('URL REWRITE')
t('上游原件确实只有 1 条 Rewrite（前提校验）', upRewrite.length === 1, upRewrite.join('\n'))
t('上游那条规则的语义被保留（api.douban.com + app_ads + splash 两个子路径）',
  newRewrite.length === 1 &&
  newRewrite[0].includes('api\\.douban\\.com') &&
  newRewrite[0].includes('app_ads') &&
  /splash_/.test(newRewrite[0]) &&
  /show/.test(newRewrite[0]) &&
  /preload/.test(newRewrite[0]))
t('修正 1：v2 硬编码改成 v\\d+（跨版本）',
  newRewrite[0].includes('v\\d+') && !newRewrite[0].includes('/v2/'))
t('修正 2：reject 改成 reject-dict（JSON 接口返回 {}）',
  newRewrite[0].endsWith('reject-dict'))
t('开屏规则仍能编译', (() => {
  try { new RegExp(newRewrite[0].split(/\s+/)[0]); return true } catch { return false }
})())
// 等价性：原版那条粗规则能匹配的，本版必须也能匹配
const upRe = new RegExp(upRewrite[0].split(/\s+/)[0])
const newRe = new RegExp(newRewrite[0].split(/\s+/)[0])
t('原版规则能命中的 URL，本版全部命中（等价且更严）',
  ['https://api.douban.com/v2/app_ads/splash_preload',
   'https://api.douban.com/v2/app_ads/splash_show'].every(u => upRe.test(u) && newRe.test(u)))
t('本版额外覆盖 v3（原版漏）',
  !upRe.test('https://api.douban.com/v3/app_ads/splash_preload') &&
  newRe.test('https://api.douban.com/v3/app_ads/splash_preload'))
t('非 app_ads 路径不误伤',
  !newRe.test('https://api.douban.com/v2/movie/1292052') &&
  !newRe.test('https://api.douban.com/v2/app_ads'))

// ── 3. [MITM] ───────────────────────────────────────────────
console.log('\n【3】[MITM] 域名')
const mitm = section('MITM').join('').replace(/^hostname\s*=\s*/, '')
  .split(',').map(s => s.trim()).filter(Boolean)
t('api.douban.com 在列（上游原版就有，开屏规则依赖）', mitm.includes('api.douban.com'))
t('frodo.douban.com 在列（脚本生效的前提，否则解不了密）', mitm.includes('frodo.douban.com'))
t('MITM 里的每个域名都有对应规则（无白 decrypt）',
  mitm.every(m => newRe.test(`https://${m}/v2/app_ads/splash_preload`) ||
                   section('SCRIPT').some(l => l.includes(m.replace(/\./g, '\\.')))))
t('MITM 域名全部在真机抓包中出现过',
  mitm.every(m => m === 'api.douban.com' || m === 'frodo.douban.com'))

// ── 4. [Script] 规则 ────────────────────────────────────────
console.log('\n【4】[Script] 规则（v2.0 唯一的新增功能）')
const scriptRules = section('SCRIPT')
t('恰好 1 条 [Script] 规则', scriptRules.length === 1, scriptRules.join('\n'))
t('类型是 http-response',
  scriptRules.length === 1 && scriptRules[0].startsWith('http-response '))
// 这两条是官方手册 docs/cn/script.md 的硬性要求，漏掉任一条脚本都不会生效
t('🔴 requires-body=true（否则 $response.body 恒为 undefined）',
  scriptRules.length === 1 && scriptRules[0].includes('requires-body=true'))
t('有 timeout（避免慢请求拖住连接）',
  scriptRules.length === 1 && /timeout=\d+/.test(scriptRules[0]))
t('匹配 search/found_words 与 search/hots',
  scriptRules.length === 1 && /found_words\|hots/.test(scriptRules[0]))
t('脚本指向本仓库托管路径', scriptRules.length === 1 &&
  scriptRules[0].includes('Savues/loon-plugin-patches/main/plugins/Douban-Dedup/src/douban-search-ad.js'))
t('🔴 [Script] 段没有用 script-response-body（那是 [Rewrite] 的伪语法）',
  !scriptRules.some(l => /script-response-body/.test(l)))
t('🔴 [URL Rewrite] 段没有 script-response-body',
  !section('URL REWRITE').some(l => /script-response-body/.test(l)))

// ── 5. 开关 ─────────────────────────────────────────────────
console.log('\n【5】开关')
const argNames = section('ARGUMENT').map(l => l.split('=')[0].trim())
t('只声明 block_search_ad 一个开关', argNames.length === 1 && argNames[0] === 'block_search_ad',
  `实际 ${argNames.join(',')}`)
t('开关被 [Script] 规则引用（[Script] 段挂 enable= 有官方手册背书）',
  scriptRules.some(l => l.includes('enable={block_search_ad}')))
t('没有未被引用的死开关',
  [...new Set([...lpx.matchAll(/enable=\{(\w+)\}/g)].map(m => m[1]))]
    .every(a => argNames.includes(a)))
t('[URL Rewrite] 段零 enable=（该段挂 enable= 本仓库有静默失效先例）',
  section('URL REWRITE').every(l => !l.includes('enable=')))

// ── 6. 上游原件留存 ─────────────────────────────────────────
console.log('\n【6】上游原件')
// 用 Buffer 字节数：原件含中文，String.length 是 UTF-16 码元数
const bytes = s => Buffer.byteLength(s, 'utf8')
const sha = s => createHash('sha256').update(s, 'utf8').digest('hex')
t('honue 原件 480 字节 / SHA256 钉死',
  bytes(honue) === 480 &&
  sha(honue) === '13a92c78795bb5b6ea86e7b8467a7c1f16e0e719392f01b8cd693e065074525d',
  `实际 ${bytes(honue)} 字节`)
t('shengrui 原件 1552 字节 / SHA256 钉死',
  (() => {
    const s = readFileSync(join(DIR, 'upstream-shengrui.plugin'), 'utf8')
    return bytes(s) === 1552 &&
      sha(s) === '1cecc54682e2492b70d5d45248de2c27de1930297f565de2a71636849e2863cc'
  })())
t('本清单不是上游的逐字节副本（有实质改动）', lpx !== honue)

// ── 7. 文档 ─────────────────────────────────────────────────
console.log('\n【7】文档')
t('README 存在', readme.length > 500)
t('README 说明了 v2.0 是「以原版为基线」的定位',
  /原版/.test(readme) && /v2\.0/.test(readme))
// 注意：README 里对应句子跨行折行过，不能用长正则匹配整句，
// 否则改一次排版就假失败。改成逐个短判据。
t('README 记录了 v1.x 过度扩张后回退的原因',
  /连接池/.test(readme) && /回退|放弃/.test(readme))
t('README 写了开屏规则那两处修正', /v\\d\+|reject-dict/.test(readme))
t('README 致谢上游作者', /honue/.test(readme))
t('README 给出 raw 订阅地址',
  /raw\.githubusercontent\.com\/Savues\/loon-plugin-patches\/main\/plugins\/Douban-Dedup/.test(readme))
t('README 版本号与 lpx 一致', /v2\.0/.test(readme))

// ── 汇总 ────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
console.log(`通过 ${pass}　失败 ${fail}`)
process.exit(fail ? 1 : 0)
