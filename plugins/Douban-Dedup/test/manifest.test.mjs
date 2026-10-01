// manifest.test.mjs —— 豆瓣开屏广告屏蔽（Douban-Dedup v3.0）零差异校验
//
// v3.0 是**纯移植版**：只把 honue/rules 的 Douban.plugin 搬进本仓库，
// 唯一改动是 #!homepage 指向本仓库（规则内容零改动、不新增任何功能）。
//
// 这个测试的全部意义就是**证明「没有改动」** —— 不是测功能，
// 而是把「规则正文必须与上游逐字节相同」钉死。
//
// 运行：node test/manifest.test.mjs
// 无外部依赖。

import { readFileSync, existsSync } from 'node:fs'
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

// 剥离 #! 开头的元信息行 —— 这些是 Loon 展示用的，与规则行为无关。
// 剩下的才是「规则正文」，必须与上游逐字节相同。
const stripMeta = (txt) =>
  txt.split('\n').filter(l => !l.startsWith('#!')).join('\n')

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

// ── 1. 🔴 零差异：这一段是本测试的核心 ────────────────────────
console.log('\n【1】🔴 零差异（v3.0 是纯移植版）')
const upBody = stripMeta(honue)
const newBody = stripMeta(lpx)
t('🔴 规则正文与上游逐字节相同',
  upBody === newBody,
  `上游 ${upBody.length} 字节 / 本版 ${newBody.length} 字节`)
t('🔴 规则正文 SHA256 与上游一致',
  createHash('sha256').update(upBody, 'utf8').digest('hex') ===
  createHash('sha256').update(newBody, 'utf8').digest('hex'))

// 整文件只允许 homepage 一行不同
const metaDiff = (() => {
  const a = honue.split('\n').filter(l => l.startsWith('#!'))
  const b = lpx.split('\n').filter(l => l.startsWith('#!'))
  return { a, b }
})()
const changed = metaDiff.a.filter((ln, i) => metaDiff.b[i] !== ln)
t('🔴 元信息只改了 homepage 一行',
  changed.length === 1 && changed[0].startsWith('#!homepage='),
  changed.join('\n'))
t('homepage 指向本仓库',
  /^#!homepage=https:\/\/github\.com\/Savues\/loon-plugin-patches\/tree\/main\/plugins\/Douban-Dedup$/m.test(lpx))
t('name / desc / author / icon 与上游一致',
  ['#!name=', '#!desc=', '#!author=', '#!icon='].every(k => {
    const a = metaDiff.a.find(l => l.startsWith(k))
    const b = metaDiff.b.find(l => l.startsWith(k))
    return a === b
  }))
t('没有额外添加 #!version / #!date（保持原样，不引入非上游字段）',
  !/^#!version=/m.test(lpx) && !/^#!date=/m.test(lpx))

// ── 2. 上游原件留存 ─────────────────────────────────────────
console.log('\n【2】上游原件')
// 用 Buffer 字节数：原件含中文，String.length 是 UTF-16 码元数
const bytes = s => Buffer.byteLength(s, 'utf8')
const sha = s => createHash('sha256').update(s, 'utf8').digest('hex')
t('honue 原件 480 字节 / SHA256 钉死',
  bytes(honue) === 480 &&
  sha(honue) === '13a92c78795bb5b6ea86e7b8467a7c1f16e0e719392f01b8cd693e065074525d',
  `实际 ${bytes(honue)} 字节`)

// ── 3. 🔴 没有新增任何功能 ──────────────────────────────────
// 前几个版本（v1.0–v2.0）加了信息流拦截、腾讯 HTTPDNS、
// 搜索页广告剥离脚本，在真机上引入了「浏览几个主页后无法加载」。
console.log('\n【3】🔴 没有新增任何功能')
t('🔴 没有 [Script] 段', !/^\[Script\]/m.test(lpx))
t('🔴 没有 [Argument] 段', !/^\[Argument\]/m.test(lpx))
t('🔴 没有 [General] 段', !/^\[General\]/m.test(lpx))
t('🔴 [Rule] 段为空（上游也是空的）', section('RULE').length === 0, section('RULE').join('\n'))
t('🔴 [URL Rewrite] 只有上游那 1 条', section('URL REWRITE').length === 1,
  section('URL REWRITE').join('\n'))
t('🔴 MITM 只有 api.douban.com 一个域名',
  (() => {
    const m = section('MITM').join('').replace(/^hostname\s*=\s*/, '').split(',').map(s => s.trim())
    return m.length === 1 && m[0] === 'api.douban.com'
  })())
t('🔴 没有 enable= （无开关）', !lpx.includes('enable='))
t('🔴 没有 script-path / script-response-body', !/script-(path|response-body)/.test(lpx))
t('🔴 没有引入 IP-CIDR / DOMAIN 规则', !/^(IP-CIDR|DOMAIN)/m.test(lpx))
t('🔴 没有引入 erebor / movie / tv / group / home_ads 等端点',
  !/erebor|\/movie\/|\\\/tv\\\/|\\\/group\\\//.test(lpx))
t('🔴 没有 dale_ad 素材图规则', !lpx.includes('dale_ad'))
t('🔴 没有 frodo.douban.com（那会解密整个业务 API）',
  !lpx.includes('frodo'))
t('🔴 没有 doubanio.com（那会解密全部图片）', !lpx.includes('doubanio'))
t('🔴 没有 argument= 参数传递', !lpx.includes('argument='))

// 上游那两条被注释掉的规则原样留着 —— 不删不改
t('🔴 上游的两条注释规则原样保留',
  honue.split('\n').filter(l => l.trim().startsWith('# ^https')).length === 2 &&
  lpx.split('\n').filter(l => l.trim().startsWith('# ^https')).length === 2)

// ── 4. 规则能正常工作 ───────────────────────────────────────
console.log('\n【4】规则行为（继承上游，不是我改的）')
const rw = section('URL REWRITE')[0]
t('唯一那条规则能编译', (() => {
  try { new RegExp(rw.split(/\s+/)[0]); return true } catch { return false }
})())
const re = new RegExp(rw.split(/\s+/)[0])
t('命中 app_ads/splash_preload（抓包实测的端点）',
  re.test('https://api.douban.com/v2/app_ads/splash_preload'))
t('命中 app_ads/splash_show', re.test('https://api.douban.com/v2/app_ads/splash_show'))
t('不误伤非 app_ads 路径',
  !re.test('https://api.douban.com/v2/movie/1292052') &&
  !re.test('https://frodo.douban.com/api/v2/erebor/feed_ad'))

// ── 5. 文件卫生 ─────────────────────────────────────────────
console.log('\n【5】文件卫生')
t('与上游一样没有末尾换行（逐字节保持一致）',
  lpx.endsWith('\n') === honue.endsWith('\n'))
t('无 CRLF', !lpx.includes('\r'))
t('无 BOM', lpx.charCodeAt(0) !== 0xFEFF)
t('没有 U+FFFD（写入时的编码损坏）', !lpx.includes('�'))

// ── 6. 文档 ─────────────────────────────────────────────────
console.log('\n【6】文档')
t('README 存在', readme.length > 300)
// ponytail: 只测文件存在这类事实，不测 README 措辞 ——
// 改一次排版就假失败，而且文档不是行为。战史在仓库根 README。
t('README 存在', readme.length > 300)
t('README 指向 SearchAd 插件（两件套互相引用）',
  /Douban-SearchAd/.test(readme))
t('本目录没有 src/（镜像不带脚本）', !existsSync(join(DIR, 'src')))
t('本目录没有 test/fixtures/（镜像不需要抓包固件）',
  !existsSync(join(DIR, 'test', 'fixtures')))
t('README 给出 raw 订阅地址',
  /raw\.githubusercontent\.com\/Savues\/loon-plugin-patches\/main\/plugins\/Douban-Dedup/.test(readme))
t('README 致谢上游作者', /honue/.test(readme))

// ── 汇总 ────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
console.log(`通过 ${pass}　失败 ${fail}`)
process.exit(fail ? 1 : 0)
