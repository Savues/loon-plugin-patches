// manifest.test.mjs —— 豆瓣去广告（Douban-Dedup）清单层回归测试
//
// 核心思路：把用户的两份真机抓包（豆瓣 7.135.0 / iPadOS 18.7.3）压成
// test/fixtures/*.tsv，逐条喂给清单里的规则。判「本地合成 vs 真实回包」
// 靠响应头数量：0 = reject，1 = reject-dict，>=2 = 真回包。
//
// 铁证就是固件 B：v1.0 装上后开屏拦住了（hdr=0/1），
// 信息流却一条没拦住（feed_ad 60908 B / hdr=10）——
// 因为那 4 条规则被放在 [Rule] 的 URL-REGEX 上，而它不参与 HTTPS 路径改写。
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
const tsvA = readFileSync(join(HERE, 'fixtures', 'douban-7.135.0.har-urls.tsv'), 'utf8')
const tsvB = readFileSync(join(HERE, 'fixtures', 'douban-7.135.0-v10.har-urls.tsv'), 'utf8')

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

const parseTsv = (txt) => txt.split('\n').filter(l => l && !l.startsWith('#'))
  .map(l => { const [method, url, status, size, nh] = l.split('\t')
    return { method, url, status: +status, size: +size, hdrCount: +nh } })

// ── 0. 抓包固件 ─────────────────────────────────────────────
console.log('\n【0】抓包固件')
const capA = parseTsv(tsvA)
const capB = parseTsv(tsvB)
const cap = [...capA, ...capB]
t('固件 A 含 218 条真实请求（装上游插件时）', capA.length === 218, `实际 ${capA.length}`)
t('固件 B 含 249 条真实请求（装本仓库 v1.0 时）', capB.length === 249, `实际 ${capB.length}`)
t('两份固件都记录了响应头数量（判本地合成的依据）',
  capA.some(e => e.hdrCount === 0) && capB.some(e => e.hdrCount >= 2))

// 固件 B 的核心证据：v1.0 装上后，信息流是真实回包
const bAds = capB.filter(e => /erebor\/feed_ad|movie\/ad|home_ads/.test(e.url))
t('🔴 固件 B 记录了 v1.0 的失败：信息流带真响应头（= 放行）',
  bAds.length > 0 && bAds.every(e => e.hdrCount >= 2),
  `响应头 ${bAds.map(e => e.hdrCount).join(',')}`)
// 而开屏确实被拦住了
const bSplash = capB.filter(e => e.url.includes('app_ads'))
t('固件 B 同时记录了 v1.0 的成功：开屏是本地合成（hdr<=1）',
  bSplash.length > 0 && bSplash.every(e => e.hdrCount <= 1),
  `响应头 ${bSplash.map(e => e.hdrCount).join(',')}`)

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
t('有 #!date 与 #!version', /^#!date=/m.test(lpx) && /^#!version=/m.test(lpx))
t('版本号是 1.3（移除 img*.doubanio.com，脚本改挂 [Script]）', /^#!version=1\.3$/m.test(lpx))

// ── 2. 🔴 反向断言：规则类型与位置 ──────────────────────────
console.log('\n【2】🔴 规则类型与段位（v1.0 踩过的坑）')
const ruleLines = section('RULE')
const rewriteLines = section('URL REWRITE')

// 🔴 v1.0 的真正死因：把 4 条信息流规则放进 [Rule] 的 URL-REGEX，真机全部不生效。
// 同段 IP-CIDR 生效、URL-REGEX 失效 —— 说明是该规则类型的问题，不是整段失效。
t('[Rule] 段没有 URL-REGEX（真机证实其不参与 HTTPS 路径改写）',
  !ruleLines.some(l => l.startsWith('URL-REGEX')),
  ruleLines.filter(l => l.startsWith('URL-REGEX')).join('\n'))
t('[Rule] 段只含 IP-CIDR 与 DOMAIN*（这两类真机确认生效）',
  ruleLines.every(l => /^(IP-CIDR|DOMAIN|DOMAIN-SUFFIX),/.test(l)))
t('信息流广告规则都在 [URL Rewrite] 段',
  rewriteLines.some(l => l.includes('erebor')) && rewriteLines.some(l => l.includes('movie')))

t('[URL Rewrite] 段零 enable=',
  rewriteLines.every(l => !l.includes('enable=')),
  rewriteLines.filter(l => l.includes('enable=')).join('\n'))
const logicalRules = ruleLines.filter(l => /^(AND|OR|NOT)\b/.test(l))
t('[Rule] 段没有逻辑规则（Loon 不解析逻辑规则尾部的 enable=）',
  logicalRules.length === 0, logicalRules.join('\n'))
const enabled = ruleLines.filter(l => l.includes('enable={'))
t('[Rule] 段 enable= 只挂在 IP-CIDR / DOMAIN* 上',
  enabled.every(l => /^(IP-CIDR|DOMAIN|DOMAIN-SUFFIX|DOMAIN-KEYWORD),/.test(l)))
const policyOf = r => {
  const i = r.indexOf('))')
  return i < 0 ? null : r.slice(i + 2).replace(/^,\s*/, '').trim()
}
t('没有逻辑规则的策略名里含逗号', logicalRules.every(r => !policyOf(r)?.includes(',')))

// ── 3. 开关完整性 ───────────────────────────────────────────
console.log('\n【3】[Argument] 开关')
const argNames = section('ARGUMENT').map(l => l.split('=')[0].trim())
t('两个开关：block_httpdns 与 block_search_ad',
  argNames.length === 2 && argNames.includes('block_httpdns') && argNames.includes('block_search_ad'),
  `实际 ${argNames.join(',')}`)
t('不声明 block_feed_ad（v1.0 的死开关）', !argNames.includes('block_feed_ad'))
t('block_search_ad 挂在 [Script] 上（[Script] 段的 enable= 有官方文档背书）',
  section('SCRIPT').some(l => l.includes('enable={block_search_ad}')) &&
  !section('URL REWRITE').some(l => l.includes('block_search_ad')))
t('每个开关都被至少一条规则引用', argNames.every(a => lpx.includes(`enable={${a}}`)))
t('每个被引用的开关都有定义',
  [...new Set([...lpx.matchAll(/enable=\{(\w+)\}/g)].map(m => m[1]))].every(a => argNames.includes(a)))

// ── 3b. 脚本规则 ────────────────────────────────────────────
console.log('\n【3b】脚本规则（搜索页广告）')
// 🔴 v1.2 教训：响应体改写写在 [URL Rewrite] 的 script-response-body= 上，
//    真机实测一次都没执行。官方文档 docs/cn/rewrite.md 只列了
//    URL/Header 改写、302/307、5 种 reject —— 没有响应体改写。
//    正解是 [Script] 段的 http-response + requires-body=true。
const scriptRules = section('SCRIPT')
t('恰好 1 条 [Script] 规则', scriptRules.length === 1, scriptRules.join('\n'))
t('类型是 http-response（响应体改写只能走 [Script]，见 docs/cn/script.md）',
  scriptRules.length === 1 && scriptRules[0].startsWith('http-response '))
t('🔴 requires-body=true（否则 $response.body 恒为 undefined，脚本会永远放行）',
  scriptRules.length === 1 && scriptRules[0].includes('requires-body=true'))
t('它匹配 search/found_words 与 search/hots 两个端点',
  scriptRules.length === 1 && /found_words\|hots/.test(scriptRules[0]),
  scriptRules.join('\n'))
t('脚本指向本仓库托管路径（不是作者的站点）',
  scriptRules.length === 1 &&
  scriptRules[0].includes('Savues/loon-plugin-patches/main/plugins/Douban-Dedup/src/douban-search-ad.js'))
t('🔴 [URL Rewrite] 段没有 script-response-body（v1.2 的错：官方文档无此语法）',
  !rewriteLines.some(l => l.includes('script-response-body')))

// ── 4. 规则格式 ─────────────────────────────────────────────
console.log('\n【4】规则格式')
const plainRewrite = rewriteLines.filter(l => !l.includes('script-response-body'))
t('[URL Rewrite] 全部是 <正则> reject|reject-dict 或 script-response-body=',
  plainRewrite.every(l => /^\S+\s+(reject|reject-dict)$/.test(l)),
  plainRewrite.filter(l => !/^\S+\s+(reject|reject-dict)$/.test(l)).join('\n'))
t('每条 Rewrite 正则都能编译', rewriteLines.every(l => {
  try { new RegExp(l.split(/\s+/)[0]); return true } catch { return false }
}))
t('IP-CIDR 全部带 no-resolve', ruleLines.filter(l => l.startsWith('IP-CIDR')).every(l => l.includes('no-resolve')))

// ── 5. 🔴 两份抓包全量回归 ─────────────────────────────────
console.log('\n【5】🔴 两份抓包全量回归')
// 区分两类规则：reject 类（直接拦）与 script 类（改写响应体）。
// script 类不拦请求，只重写 body —— 混在一起算会让「零误伤」断言失真。
const rw = rewriteLines.map(l => {
  const [re, act] = l.split(/\s+/)
  return {
    re: new RegExp(re),
    act: act.startsWith('script-response-body') ? 'script' : act,
    src: l
  }
})
const isScript = r => r && r.act === 'script'
const hit = u => rw.find(r => r.re.test(u)) || null
// 真正「拦下」的只有 reject 类
const hitReject = u => { const h = hit(u); return h && !isScript(h) ? h : null }

for (const [tag, c] of [['A（218）', capA], ['B（249）', capB]]) {
  const blocked = c.filter(e => hitReject(e.url))
  const scripted = c.filter(e => isScript(hit(e.url)))
  const passed = c.filter(e => !hit(e.url))
  t(`${tag} 拦 ${blocked.length} / 脚本改写 ${scripted.length} / 放 ${passed.length}，总数守恒`,
    blocked.length + scripted.length + passed.length === c.length)
}

// 5a. 固件 B：v1.0 漏掉的，v1.1 必须全部拦下
const bFeed = capB.filter(e => /erebor\/feed_ad/.test(e.url))
t(`🔴 固件 B 的 feed_ad 被拦（v1.0 时是 ${bFeed[0]?.size} B 真回包）`,
  bFeed.length > 0 && bFeed.every(e => hitReject(e.url)), `size=${bFeed[0]?.size}`)
const bMovie = capB.filter(e => /\/movie\/ad/.test(e.url))
t(`🔴 固件 B 的 movie/ad 被拦（v1.0 时有 ${bMovie.filter(e => e.size > 100).length} 条带真实广告数据）`,
  bMovie.length > 0 && bMovie.every(e => hitReject(e.url)))
const bHome = capB.filter(e => /home_ads|home_banner/.test(e.url))
t('🔴 固件 B 的 home_ads / home_banner 被拦', bHome.every(e => hitReject(e.url)))

// 5b. 开屏
const splash = cap.filter(e => e.url.includes('/v2/app_ads/splash'))
t(`开屏接口被拦（两份抓包共 ${splash.length} 次）`, splash.every(e => hitReject(e.url)))
t('splash 用 reject-dict（JSON 接口；honue 版的错是 reject）',
  splash.every(e => hitReject(e.url)?.act === 'reject-dict'))
// v1.3 移除了素材图规则：它需要 img*.doubanio.com 进 [MITM]，
// 真机实测会让个人主页/小组页的并发图片请求瞬时失败（连接池排队）。
const adImg = cap.filter(e => e.url.includes('/dale_ad/public/'))
t(`素材图已不再拦截（v1.3 移除，共 ${adImg.length} 张受影响）`,
  adImg.every(e => !hitReject(e.url)))
t('🔴 移除后 splash_preload 仍被拦（开屏接口是主要防线）',
  cap.filter(e => e.url.includes('app_ads')).every(e => hitReject(e.url)))

// 5c. 🔴 零误伤
const imgs = cap.filter(e => /\/view\//.test(e.url) && !e.url.includes('/dale_ad/'))
const imgsBad = imgs.filter(e => hit(e.url))
t(`图片零误伤：${imgs.length - imgsBad.length}/${imgs.length} 张非广告图全部放过`,
  imgsBad.length === 0, imgsBad.slice(0, 3).map(e => e.url).join('\n'))
t('人物头像 / 海报等子目录一条都没拦',
  cap.filter(e => /\/view\/(celebrity|personage|photo|group)\//.test(e.url)).every(e => !hit(e.url)))
t('正文接口 elendil/recommend_feed 未被拦',
  cap.filter(e => e.url.includes('elendil/recommend_feed')).every(e => !hit(e.url)))
t('用户/影视/剧集/小组/通知零拦截',
  cap.filter(e => /\/api\/v2\/(user|movie\/recommend|tv\/|group|notification)/.test(e.url))
    .every(e => !hit(e.url)))
// 搜索端点走脚本改写（不 reject），所以不出现在 hit() 里 —— 单独断言
t('🔴 搜索端点用 script-response-body 改写而非 reject',
  scriptRules.length === 1 && /found_words\|hots/.test(scriptRules[0]))
t('🔴 搜索端点走脚本改写，绝不 reject（否则搜索联想会报废）',
  cap.filter(e => /\/api\/v2\/search\//.test(e.url)).every(e => !hitReject(e.url)))
t('athena 埋点、halfhill 会员商品未被拦',
  cap.filter(e => e.url.includes('athena') || e.url.includes('halfhill')).every(e => !hit(e.url)))

// 5d. 覆盖完整性
const upstreamBlocked = [...capA, ...capB].filter(e => e.hdrCount === 0 && e.status === 404)
// v1.3 移除了素材图规则，dale_ad 那几条不再被覆盖 —— 其余必须全覆盖
const adImgOnly = upstreamBlocked.filter(e => /dale_ad\/public\//.test(e.url))
t(`素材图 ${adImgOnly.length} 条已由 v1.3 主动放弃（不再要求覆盖）`,
  adImgOnly.every(e => !hit(e.url)))
const restBlocked = upstreamBlocked.filter(e => !/dale_ad\/public\//.test(e.url))
t(`其余 ${restBlocked.length} 条上游已拦请求全部覆盖`,
  restBlocked.length > 0 && restBlocked.every(e => hit(e.url)),
  restBlocked.filter(e => !hit(e.url)).map(e => e.url).join('\n'))

// ── 6. 跨版本与边界 ─────────────────────────────────────────
console.log('\n【6】跨版本与边界')
t('正则用 v\\d+ 而非硬编码 v2（honue 版的错）',
  rw.some(r => r.src.includes('v\\d+')) && !rw.some(r => r.src.includes('/v2/app_ads/')))
t('v3 路径同样命中', hit('https://api.douban.com/v3/app_ads/splash_preload')?.act === 'reject-dict')
t('🔴 素材图规则已随 img*.doubanio.com 一起移除',
  !rw.some(r => r.src.includes('dale_ad')))
t('素材图 URL 现在完全放行（不再解密 doubanio）',
  !hit('https://img3.doubanio.com/view/dale-online/dale_ad/public/x.jpg') &&
  !hit('https://img12.doubanio.com/view/dale-online/dale_ad/public/x.jpg'))
t('v2 根路径不误伤', !hit('https://api.douban.com/v2/app_ads'))
t('非广告的 app_ads 子路径不被吞掉', !hit('https://api.douban.com/v2/app_ads/banner'))
t('🆕 剧集页广告 /api/v2/tv/<id>/ad 被拦（v1.1 新增）',
  !!hit('https://frodo.douban.com/api/v2/tv/36117379/ad') &&
  !!hit('https://frodo.douban.com/api/v2/tv/36449291/ad?x=1'))
t('剧集本体 /api/v2/tv/<id> 不被误伤', !hit('https://frodo.douban.com/api/v2/tv/36117379'))
t('影视本体 /api/v2/movie/recommend 不被误伤',
  !hit('https://frodo.douban.com/api/v2/movie/recommend'))
t('home_ads 规则不会误伤 home_ads_next 之类',
  !hit('https://frodo.douban.com/api/v2/home/ads_next'))

// ── 7. [MITM] ───────────────────────────────────────────────
console.log('\n【7】[MITM] 域名')
const mitm = section('MITM').join('').replace(/^hostname\s*=\s*/, '')
  .split(',').map(s => s.trim()).filter(Boolean)
t('恰好 2 个域名（v1.3 移除 img*.doubanio.com）', mitm.length === 2, `实际 ${mitm.join(',')}`)
// frodo.douban.com 不是白 decrypt：它是 [URL Rewrite] 改写 HTTPS 路径的前提
t('frodo.douban.com 在列（[URL Rewrite] 改写 HTTPS 路径的前提条件）',
  mitm.includes('frodo.douban.com'))
t('api.douban.com 在列（开屏接口）', mitm.includes('api.douban.com'))
t('🔴 img*.doubanio.com 已移出（真机实测导致个人主页/小组页连接池排队）',
  !mitm.some(m => m.includes('doubanio')))
t('每个 MITM 域名都有对应规则（无白 decrypt）',
  mitm.every(m => rw.some(r => r.src.includes(m.split('.').slice(-2)[0]))))
t('MITM 域名都能被 [URL Rewrite] 或 [Script] 的规则命中',
  mitm.every(m => {
    const host = m.replace(/\./g, '\\.')
    return rw.some(r => r.re.source.includes(host)) ||
           section('SCRIPT').some(l => l.includes(m.replace(/\./g, '\\.')))
  }))
t('没有把 *.douban.com 主域名收进来（那会解密全部业务流量）',
  !mitm.some(m => m === 'douban.com' || m === '*.douban.com'))
t('MITM 域名全部在抓包中出现过', mitm.every(m => {
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
  `实际 ${bytes(honue)} 字节`)
t('shengrui 原件 1552 字节 / SHA256 钉死',
  bytes(shengrui) === 1552 &&
  sha(shengrui) === '1cecc54682e2492b70d5d45248de2c27de1930297f565de2a71636849e2863cc',
  `实际 ${bytes(shengrui)} 字节`)
t('honue 原件确实是那条粗规则（证明我们是在重写，不是在改它）',
  honue.includes('^https?:\\/\\/api\\.douban\\.com\\/v2\\/app_ads.+ reject'))
t('本清单不是上游的逐字节副本', lpx !== honue && lpx !== shengrui)

// ── 9. 文档 ─────────────────────────────────────────────────
console.log('\n【9】文档')
t('README 存在', readme.length > 500)
t('README 写了两份抓包证据（218 / 249）', /218/.test(readme) && /249/.test(readme))
t('README 记录了 v1.0 的真机失败与段位根因', /URL-REGEX/.test(readme))
t('README 说明 preload_ads 本地缓存', /preload_ads/.test(readme))
t('README 致谢两位上游作者', /honue/.test(readme) && /shengrui123/.test(readme))
t('README 给出 raw 订阅地址',
  /raw\.githubusercontent\.com\/Savues\/loon-plugin-patches\/main\/plugins\/Douban-Dedup/.test(readme))
t('README 给出 .lpx 文件名', /Douban-Dedup\.lpx/.test(readme))
t('README 版本号与 lpx 一致', readme.includes('v1.1'))

// ── 汇总 ────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
console.log(`通过 ${pass}　失败 ${fail}`)
process.exit(fail ? 1 : 0)
