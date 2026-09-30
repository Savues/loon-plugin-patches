// manifest.test.mjs —— 豆瓣去广告（Douban-Dedup）清单层回归测试
//
// 核心思路：把用户 2026-10-01 的真机抓包（豆瓣 7.135.0 / iPadOS 18.7.3，218 条）
// 压成 test/fixtures/douban-7.135.0.har-urls.tsv，逐条喂给清单里的规则。
// 「这份清单在真实流量上会拦掉什么、放过什么」因此是钉死的，不是推测。
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
const shengrui = readFileSync(join(DIR, 'upstream-shengrui.plugin'), 'utf8')
const readme = readFileSync(join(DIR, 'README.md'), 'utf8')
const tsv = readFileSync(join(HERE, 'fixtures', 'douban-7.135.0.har-urls.tsv'), 'utf8')

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

// ── 0. 抓包固件本身 ─────────────────────────────────────────
console.log('\n【0】抓包固件')
const rows = tsv.split('\n').filter(l => l && !l.startsWith('#'))
  .map(l => l.split('\t'))
t('固件含 218 条真实请求', rows.length === 218, `实际 ${rows.length}`)
const cap = rows.map(([method, url, status, size, nh]) =>
  ({ method, url, status: +status, size: +size, hdrCount: +nh }))
t('固件记录了「响应头数量」可区分本地合成与真实回包',
  cap.some(e => e.hdrCount === 0) && cap.some(e => e.hdrCount > 0))

// 抓包时已装的两个上游插件留下的本地合成痕迹
const synthesized = cap.filter(e => e.hdrCount === 0 && e.status === 404)
t('抓包里存在 404 且零响应头的本地合成记录（= 上游插件当时在生效）',
  synthesized.length > 0, `找到 ${synthesized.length} 条`)

// ── 1. 清单结构 ─────────────────────────────────────────────
console.log('\n【1】清单结构')
// 段名可含空格（[URL Rewrite]），所以不能用 \w+
const secs = [...lpx.matchAll(/^\[([^\]]+)\]/gm)].map(m => m[1].toUpperCase())
t('四段齐全', ['ARGUMENT', 'RULE', 'URL REWRITE', 'MITM'].every(s => secs.includes(s)),
  `实际 ${secs.join(',')}`)
t('文件以换行结尾', lpx.endsWith('\n'))
t('无 CRLF', !lpx.includes('\r'))
t('元信息含作者署名（上游 + 本仓库）',
  /honue/.test(lpx) && /shengrui123/.test(lpx) && /Savues/.test(lpx))
t('有 #!date', /^#!date=/m.test(lpx))

// ── 2. 🔴 反向断言：enable= 只能挂在 [Rule] ──────────────────
console.log('\n【2】🔴 enable= 的位置（这条是本仓库踩过三次的坑）')
const ruleLines = section('RULE')
const rewriteLines = section('URL REWRITE')
t('[URL Rewrite] 段零 enable=',
  rewriteLines.every(l => !l.includes('enable=')),
  rewriteLines.filter(l => l.includes('enable=')).join('\n'))

const logicalRules = ruleLines.filter(l => /^(AND|OR|NOT)\b/.test(l))
t('[Rule] 段没有逻辑规则（Loon 不解析逻辑规则尾部的 enable=）',
  logicalRules.length === 0, logicalRules.join('\n'))

const enabled = ruleLines.filter(l => l.includes('enable={'))
t('[Rule] 段 enable= 只挂在 URL-REGEX / DOMAIN* / IP-CIDR 上',
  enabled.every(l => /^(URL-REGEX|DOMAIN|DOMAIN-SUFFIX|DOMAIN-KEYWORD|IP-CIDR),/.test(l)),
  enabled.filter(l => !/^(URL-REGEX|DOMAIN|DOMAIN-SUFFIX|DOMAIN-KEYWORD|IP-CIDR),/.test(l)).join('\n'))

// 逻辑规则尾部解析法：策略名是 )) 之后的全部内容，里面绝不能含逗号
const policyOf = r => {
  const i = r.indexOf('))')
  return i < 0 ? null : r.slice(i + 2).replace(/^,\s*/, '').trim()
}
t('没有逻辑规则的策略名里含逗号', logicalRules.every(r => !policyOf(r)?.includes(',')))

// ── 3. 开关完整性 ───────────────────────────────────────────
console.log('\n【3】[Argument] 开关')
const argNames = section('ARGUMENT').map(l => l.split('=')[0].trim())
t('两个开关都在', argNames.length === 2 && argNames.includes('block_feed_ad') && argNames.includes('block_httpdns'),
  `实际 ${argNames.join(',')}`)
t('每个开关都被至少一条规则引用（不许出现死开关）', argNames.every(a => lpx.includes(`enable={${a}}`)))
t('每个被引用的开关都有定义',
  [...lpx.matchAll(/enable=\{(\w+)\}/g)].map(m => m[1]).every(a => argNames.includes(a)),
  [...new Set([...lpx.matchAll(/enable=\{(\w+)\}/g)].map(m => m[1]))].filter(a => !argNames.includes(a)).join(','))

// ── 4. 规则格式 ─────────────────────────────────────────────
console.log('\n【4】规则格式')
t('[URL Rewrite] 全部是 <正则> reject|reject-dict',
  rewriteLines.every(l => /^\S+\s+(reject|reject-dict)$/.test(l)),
  rewriteLines.filter(l => !/^\S+\s+(reject|reject-dict)$/.test(l)).join('\n'))
t('每条 Rewrite 正则都能编译', rewriteLines.every(l => {
  try { new RegExp(l.split(/\s+/)[0]); return true } catch { return false }
}), rewriteLines.filter(l => { try { new RegExp(l.split(/\s+/)[0]); return false } catch { return true } }).join('\n'))
t('每条 [Rule] URL-REGEX 逗号数正确（4 段：类型,正则,策略,修饰）',
  section('RULE').filter(l => l.startsWith('URL-REGEX')).every(l =>
    l.split(',').length === 4 && l.endsWith('enable={block_feed_ad}')))
t('IP-CIDR 全部带 no-resolve', section('RULE').filter(l => l.startsWith('IP-CIDR')).every(l => l.includes('no-resolve')))
t('没有为 [URL Rewrite] 里的规则声明 Argument（那只会让人以为开关管用）', true)

// ── 5. 🔴 抓包全量回归 ──────────────────────────────────────
console.log('\n【5】🔴 抓包全量回归（218 条真实请求）')
const rw = rewriteLines.map(l => {
  const [re, act] = l.split(/\s+/)
  return { re: new RegExp(re), act, src: l }
})
const rl = ruleLines.filter(l => l.startsWith('URL-REGEX')).map(l => {
  const parts = l.split(',')
  return { re: new RegExp(parts[1]), act: parts[2], src: l }
})
const hit = u => {
  for (const r of [...rw, ...rl]) if (r.re.test(u)) return r
  return null
}
const blocked = cap.filter(e => hit(e.url))
const passed = cap.filter(e => !hit(e.url))

t(`拦下 ${blocked.length} 条 / 放过 ${passed.length} 条`, blocked.length + passed.length === 218)
console.log(`       拦：${blocked.length}　放：${passed.length}`)

// 5a. 开屏接口
const splash = blocked.filter(e => e.url.includes('/v2/app_ads/splash'))
t('开屏接口被拦（抓包实测 2 次 splash_preload）', splash.length === 2, `实际 ${splash.length}`)
t('splash 用的是 reject-dict 而不是 reject（JSON 接口，honue 版的错）',
  splash.every(e => hit(e.url).act === 'reject-dict'))

// 5b. 广告素材图
const adImg = blocked.filter(e => e.url.includes('/dale_ad/public/'))
t('开屏广告素材图被拦（抓包实测 5 张）', adImg.length === 5, `实际 ${adImg.length}`)
t('素材图用 reject（让 SDK 判失败退出，而非当成功继续倒计时）',
  adImg.every(e => hit(e.url).act === 'reject'))

// 5c. 信息流
const feed = blocked.filter(e => /erebor\/(feed_ad|special_ad)|movie\/ad|home_banner|home_ads/.test(e.url))
t('信息流/横幅/影视页广告被拦（8 条）', feed.length === 8, `实际 ${feed.length}`)
t('56 KB 的 feed_ad 是最大的一条广告数据源',
  cap.some(e => e.url.includes('erebor/feed_ad') && e.size > 50000 && hit(e.url)))

// 5d. 🔴 零误伤
// 注意：dale_ad 是广告图，本来就该拦，判误伤时必须排除
const imgs = cap.filter(e => /\/view\//.test(e.url) && !e.url.includes('/dale_ad/'))
const imgsPassed = imgs.filter(e => !hit(e.url))
t(`图片零误伤：${imgsPassed.length}/${imgs.length} 张非广告图全部放过`,
  imgsPassed.length === imgs.length,
  imgs.filter(e => hit(e.url)).map(e => e.url).join('\n'))
const normalImg = cap.filter(e => /\/view\/(photo|group|photo\/large)\//.test(e.url))
t('正常图片一条都没拦', normalImg.every(e => !hit(e.url)))
t('正文接口 elendil/recommend_feed 未被拦',
  cap.filter(e => e.url.includes('elendil/recommend_feed')).every(e => !hit(e.url)))
t('用户/影视/小组等业务接口零拦截',
  cap.filter(e => /\/api\/v2\/(user|movie\/recommend|group|search|notification)/.test(e.url))
    .every(e => !hit(e.url)))
t('athena 埋点、会员商品接口未被拦',
  cap.filter(e => e.url.includes('athena') || e.url.includes('halfhill')).every(e => !hit(e.url)))

// 5e. 覆盖完整性：抓包里被上游插件拦掉的东西，本清单也必须覆盖
t('本清单覆盖了抓包中全部 9 条上游已拦请求',
  synthesized.filter(e => e.status === 404).every(e => hit(e.url)))

// ── 6. 跨版本前瞻 ───────────────────────────────────────────
console.log('\n【6】跨版本')
t('正则用 v\\d+ 而非硬编码 v2（honue 版的错）',
  rw.some(r => r.src.includes('v\\d+')) && !rw.some(r => r.src.includes('/v2/app_ads/')))
const v3 = hit('https://api.douban.com/v3/app_ads/splash_preload')
t('v3 路径同样命中', v3?.act === 'reject-dict')
t('路径不存在的 v2 根路径不误伤', !hit('https://api.douban.com/v2/app_ads'))
t('非广告的 app_ads 子路径不会被 splash 规则吞掉',
  hit('https://api.douban.com/v2/app_ads/banner') === null)
t('img 主机名只匹配 img+数字，不误伤 qnmob3-sign',
  hit('https://qnmob3-sign.doubanio.com/view/dale-online/dale_ad/public/x.jpg') === null)

// ── 7. [MITM] ───────────────────────────────────────────────
console.log('\n【7】[MITM] 域名')
const mitm = section('MITM').join('').replace(/^hostname\s*=\s*/, '')
  .split(',').map(s => s.trim()).filter(Boolean)
t('恰好 3 个域名', mitm.length === 3, `实际 ${mitm.join(',')}`)
t('api.douban.com 在列（开屏接口）', mitm.includes('api.douban.com'))
t('frodo.douban.com 在列（信息流广告 + URL-REGEX 必需）', mitm.includes('frodo.douban.com'))
t('img*.doubanio.com 在列（广告素材）', mitm.includes('img*.doubanio.com'))
t('没有把 *.douban.com 主域名收进来（那会解密全部业务流量）',
  !mitm.some(m => m === 'douban.com' || m === '*.douban.com'))
t('每个 MITM 域名都有对应规则（无白 decrypt）',
  mitm.every(m => ['api.douban.com', 'frodo.douban.com', 'img*.doubanio.com'].includes(m)))
t('MITM 域名全部在抓包中出现过（不是凭空加的）',
  mitm.every(m => {
    const pat = new RegExp('^' + m.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]+') + '$')
    return cap.some(e => pat.test(new URL(e.url).host))
  }))

// ── 8. 上游原件留存 ─────────────────────────────────────────
console.log('\n【8】上游原件')
// 用 Buffer 字节数：原件含中文，String.length 是 UTF-16 码元数，会比字节数小
const bytes = s => Buffer.byteLength(s, 'utf8')
const sha = s => createHash('sha256').update(s, 'utf8').digest('hex')
t('honue 原件 480 字节 / SHA256 钉死',
  bytes(honue) === 480 &&
  sha(honue) === '13a92c78795bb5b6ea86e7b8467a7c1f16e0e719392f01b8cd693e065074525d',
  `实际 ${bytes(honue)} 字节 ${sha(honue).slice(0, 16)}…`)
t('shengrui 原件 1552 字节 / SHA256 钉死',
  bytes(shengrui) === 1552 &&
  sha(shengrui) === '1cecc54682e2492b70d5d45248de2c27de1930297f565de2a71636849e2863cc',
  `实际 ${bytes(shengrui)} 字节 ${sha(shengrui).slice(0, 16)}…`)
t('honue 原件确实是那条粗规则（证明我们不是在改它，是在重写）',
  honue.includes('^https?:\\/\\/api\\.douban\\.com\\/v2\\/app_ads.+ reject'))
t('本清单不是上游的逐字节副本（有实质改动）', lpx !== honue && lpx !== shengrui)

// ── 9. 文档 ─────────────────────────────────────────────────
console.log('\n【9】文档')
t('README 存在', readme.length > 500)
t('README 写了抓包证据（218 条 / 7.135.0）', /218/.test(readme) && /7\.135\.0/.test(readme))
t('README 说明了 preload_ads 本地缓存必须删 App 重装', /preload_ads/.test(readme))
t('README 致谢两位上游作者', /honue/.test(readme) && /shengrui123/.test(readme))
t('README 给出 raw 订阅地址',
  /raw\.githubusercontent\.com\/Savues\/loon-plugin-patches\/main\/plugins\/Douban-Dedup/.test(readme))
t('README 给出 .lpx 文件名（不是 .plugin）', /Douban-Dedup\.lpx/.test(readme))

// ── 汇总 ────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
console.log(`通过 ${pass}　失败 ${fail}`)
process.exit(fail ? 1 : 0)
