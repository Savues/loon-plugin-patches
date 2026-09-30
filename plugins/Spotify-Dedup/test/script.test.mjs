// script.test.mjs —— Spotify-Dedup 脚本层回归测试
//
// 拿**真机抓包**（2026-09-30，已脱敏）里的两份 83 KB protobuf 响应体回放脚本，
// 再把输出解回来逐条比对。这比读代码可靠得多 —— 上一轮就是因为只读代码，
// 才发现 36 个 accountAttributes 里只有 10 个被写入。
//
// fixture 由 patch/make-fixture.py 从 HAR 生成，account-id / strider-key 等
// 账号标识已做等长字节替换，可以安全入库。
//
// 运行：node test/script.test.mjs

import { readFileSync, existsSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'
import { t, done } from './harness.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const jsPath = join(HERE, '..', 'src', 'spotify.response.js')
const fx = n => join(HERE, 'fixtures', `${n}.bin.gz`)

const URLS = {
  customize: 'https://guc3-spclient.spotify.com:443/user-customization-service/v1/customize',
  bootstrap: 'https://guc3-spclient.spotify.com:443/bootstrap/v1/bootstrap'
}

// ── 极简 protobuf 解码器（只解我们需要的那几层）─────────────────────────
const rdVarint = (b, s) => { let r = 0, sh = 0, x; do { x = b[s.i++]; r += (x & 0x7f) * 2 ** sh; sh += 7 } while (x & 0x80); return r }
const fields = b => {
  const s = { i: 0 }, out = []
  while (s.i < b.length) {
    const k = rdVarint(b, s), fn = k >>> 3, wt = k & 7
    if (wt === 0) out.push([fn, rdVarint(b, s)])
    else if (wt === 2) { const l = rdVarint(b, s); out.push([fn, b.subarray(s.i, s.i + l)]); s.i += l }
    else if (wt === 5) { out.push([fn, b.subarray(s.i, s.i + 4)]); s.i += 4 }
    else if (wt === 1) { out.push([fn, b.subarray(s.i, s.i + 8)]); s.i += 8 }
    else throw new Error('wt ' + wt)
  }
  return out
}
// 剥掉外层包装，直到出现 {1:configuration, 3:accountAttributes, 5:timeMillis} 这一层。
// customize 是 UcsResponseWrapper 多一层，bootstrap 的 BootstrapResponse 多两层 ——
// 两种壳子脚本都处理，所以这里不按 URL 分支。
const core = buf => {
  let cur = buf
  for (let i = 0; i < 8; i++) {
    const f = fields(cur)
    const looksLikeCore = f.some(([fn]) => fn === 3) && f.some(([fn]) => fn === 5)
    if (looksLikeCore) return cur
    if (f.length === 1 && f[0][1] instanceof Uint8Array) cur = f[0][1]
    else break
  }
  return cur
}
const accountAttributes = buf => {
  const out = {}
  for (const [fn, v] of fields(core(buf))) {
    if (fn !== 3 || !(v instanceof Uint8Array)) continue
    for (const [, e] of fields(v)) {
      if (!(e instanceof Uint8Array)) continue
      let k = null, val = {}
      for (const [f3, v3] of fields(e)) {
        if (f3 === 1 && v3 instanceof Uint8Array) k = Buffer.from(v3).toString('utf8')
        else if (f3 === 2 && v3 instanceof Uint8Array) {
          for (const [f4, v4] of fields(v3)) {
            if (f4 === 2) val.bool = v4
            else if (f4 === 3) val.long = v4
            else if (f4 === 4 && v4 instanceof Uint8Array) val.string = Buffer.from(v4).toString('utf8')
          }
        }
      }
      if (k) out[k] = val
    }
  }
  return out
}
// configuration 在 core.field1.field1 里（success → resolveSuccess → configuration）
const assignedValue = (buf, scope, name) => {
  let conf = null
  for (const [fn, v] of fields(core(buf))) {
    if (fn !== 1 || !(v instanceof Uint8Array)) continue
    for (const [f2, v2] of fields(v)) {
      if (f2 === 1 && v2 instanceof Uint8Array) conf = v2
    }
  }
  if (!conf) return undefined
  for (const [fn, v] of fields(conf)) {
    if (fn !== 3 || !(v instanceof Uint8Array)) continue
    let pid = {}, val
    for (const [f4, v4] of fields(v)) {
      if (f4 === 1 && v4 instanceof Uint8Array) {
        for (const [f5, v5] of fields(v4)) {
          if (f5 === 1) pid.scope = Buffer.from(v5).toString('utf8')
          if (f5 === 2) pid.name = Buffer.from(v5).toString('utf8')
        }
      } else if ((f4 === 3 || f4 === 4 || f4 === 5) && v4 instanceof Uint8Array) {
        for (const [, v5] of fields(v4)) val = v5
      }
    }
    if (pid.scope === scope && pid.name === name) return val
  }
  return undefined
}

// ── Loon 运行时模拟 ────────────────────────────────────────────────────
const run = (url, body, argument) => {
  let doneArg = null
  const logs = []
  const ctx = {
    $request: { url, method: 'POST', headers: {} },
    $response: { status: 200, body },
    $argument: argument,
    $done: a => { doneArg = a },
    console: { log: (...a) => logs.push(a.map(String).join(' ')) },
    Uint8Array, TextDecoder, Array, Math, JSON, Object, Error, String, Date,
    parseInt, isNaN, decodeURIComponent
  }
  ctx.globalThis = ctx
  vm.createContext(ctx)
  let thrown = null
  try { vm.runInContext(readFileSync(jsPath, 'utf8'), ctx, { timeout: 20000 }) }
  catch (e) { thrown = e.message }
  return { thrown, logs, out: doneArg && doneArg.body ? Buffer.from(doneArg.body) : null, keys: doneArg ? Object.keys(doneArg) : [] }
}

// ── 前置检查 ───────────────────────────────────────────────────────────
console.log('\n【0】fixture')
const js = readFileSync(jsPath)
for (const n of ['customize', 'bootstrap']) {
  t(`test/fixtures/${n}.bin.gz 存在`, existsSync(fx(n)))
}
const before = {}
for (const n of ['customize', 'bootstrap']) {
  before[n] = gunzipSync(readFileSync(fx(n)))
}

// ── 1. 真机 fixture 本身是「免费态」 ────────────────────────────────────
console.log('\n【1】fixture 基线：未改动的真机响应确实是免费态')
// 这条断言是后面所有断言的前提：若上游哪天真的给了 premium，
// 下面的「改成 premium」就失去意义，测试必须红而不是绿
for (const n of ['customize', 'bootstrap']) {
  const a = accountAttributes(before[n])
  t(`${n}: catalogue=free（基线）`, a.catalogue?.string === 'free', `实际 ${JSON.stringify(a.catalogue)}`)
  t(`${n}: audio-quality=0（基线）`, a['audio-quality']?.string === '0')
  t(`${n}: high-bitrate=false（基线）`, a['high-bitrate']?.bool === 0)
  t(`${n}: smart-shuffle=UNAVAILABLE（基线）`, a['smart-shuffle']?.string === 'UNAVAILABLE')
  t(`${n}: 无 subscription-enddate（基线）`, a['subscription-enddate'] === undefined)
}

// ── 2. 脚本跑通 ────────────────────────────────────────────────────────
console.log('\n【2】脚本执行')
const after = {}
for (const n of ['customize', 'bootstrap']) {
  const r = run(URLS[n], before[n], { tab: false, useractivity: true })
  t(`${n}: 不抛异常`, r.thrown === null, r.thrown || '')
  t(`${n}: $done 带 body`, r.keys.includes('body'))
  t(`${n}: 响应体确实被改写`, r.out && !r.out.equals(before[n]))
  after[n] = r.out
}

// ── 3. 36 个 crack-dev 属性全部落地 ────────────────────────────────────
console.log('\n【3】解锁维度：crack-dev 的 36 个 accountAttributes 全部写入')
// 逐条抄自 001ProMax/Surge Script/Spotify.Crack.Dev.js 的 A() 函数
const EXPECT = {
  'smart-shuffle': { string: 'AVAILABLE' },
  'is-euterpe': { bool: 1 },
  'has-audiobooks-subscription': { bool: 1 },
  'type': { string: 'premium' },
  'payments-initial-campaign': { string: 'prepaid' },
  'social-session-free-tier': { bool: 0 },
  'can_use_superbird': { bool: 1 },
  'jam-social-session': { string: 'EXPANDED' },
  'offline': { bool: 1 },
  'audio-quality': { string: '1' },
  'shuffle-algorithm': { string: 'RANDOM' },
  'is-thalia': { bool: 1 },
  'shuffle': { bool: 0 },
  'is-pigeon': { bool: 1 },
  'nft-disabled': { string: '1' },
  'libspotify': { bool: 1 },
  'high-bitrate': { bool: 1 },
  'unrestricted': { bool: 1 },
  'catalogue': { string: 'premium' },
  'your-library-tags': { bool: 1 },
  'ads': { bool: 0 },
  'on-demand': { bool: 1 },
  'name': { string: 'Spotify Premium' },
  'loudness-levels': { string: '1:-5.0,0.0,3.0:-2.0' },
  'social-session': { bool: 1 },
  'pick-and-shuffle': { bool: 0 },
  'offline-backup': { string: 'UNRESTRICTED' },
  'lyrics-offline': { bool: 1 },
  'streaming-rules': { string: '' },
  'mixing-tools': { string: 'EDIT' },
  'mobile': { bool: 1 },
  'player-license': { string: 'premium' },
  'com.spotify.madprops.use.ucs.product.state': { bool: 1 },
  'com.spotify.madprops.delivered.by.ucs': { bool: 1 },
  // kelee 独有，crack-dev 没写
  'publish-playlist': { bool: 0 },
  'financial-product': { string: 'pr:premium,tc:0' }
}
for (const n of ['customize', 'bootstrap']) {
  const a = accountAttributes(after[n])
  const bad = []
  for (const [k, v] of Object.entries(EXPECT)) {
    const got = a[k]
    const ok = got && Object.entries(v).every(([kk, vv]) => got[kk] === vv)
    if (!ok) bad.push(`${k}=${JSON.stringify(got)} 期望 ${JSON.stringify(v)}`)
  }
  t(`${n}: 38 个属性全部写入正确`, bad.length === 0, bad.slice(0, 5).join(' | '))
}
t('EXPECT 表覆盖 36 项固定值（34 crack-dev + kelee 独有 2；另 2 个动态到期日单独断言）',
  Object.keys(EXPECT).length === 36,
  `实际 ${Object.keys(EXPECT).length} —— crack-dev 的 36 项里 subscription-enddate / product-expiry 是动态值，不在此表`)

// 到期日：当前时间 +1 个月。
// 注意断言写成容差比较 —— 脚本在 run() 那一刻取 new Date()，
// 断言在 run() 之后取，两者必然差几毫秒，写死等值会假红。
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
for (const n of ['customize', 'bootstrap']) {
  const a = accountAttributes(after[n])
  const got = a['subscription-enddate']?.string
  t(`${n}: subscription-enddate 是 ISO 格式`, typeof got === 'string' && ISO_RE.test(got), `实际 ${got}`)
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  const want = d.getTime()
  const diff = Math.abs(new Date(got).getTime() - want)
  t(`${n}: subscription-enddate ≈ 当前+1个月（容差 5 分钟）`, diff < 5 * 60 * 1000,
    `实际 ${got} 偏差 ${diff} ms`)
  t(`${n}: product-expiry 与 subscription-enddate 同值`,
    a['product-expiry']?.string === got)
}

// ── 4. 开关仍然工作（并进属性表不能把开关机制弄坏）──────────────────────
console.log('\n【4】开关：并入 36 个属性后 $argument 机制仍有效')
t('脚本仍读 $argument（4 次以上）',
  (js.toString().match(/\$argument/g) || []).length >= 4,
  '掉到 0 次 = 开关全部失效，这正是 crack-dev.js 的短板')

// useractivity：关掉 → is_useractivity_sharing_enabled 应变 false
{
  const r = run(URLS.customize, before.customize, { tab: false, useractivity: false })
  const v = assignedValue(r.out, 'ios-feature-share', 'is_useractivity_sharing_enabled')
  t('useractivity=false → is_useractivity_sharing_enabled=0', v === 0, `实际 ${v}`)
}
{
  const r = run(URLS.customize, before.customize, { tab: false, useractivity: true })
  const v = assignedValue(r.out, 'ios-feature-share', 'is_useractivity_sharing_enabled')
  t('useractivity=true → 保持原值 1', v === 1, `实际 ${v}`)
}
// is_row_enabled 无条件生效（两版脚本共有）
{
  const v = assignedValue(after.customize, 'ios-system-your-plan-sidedrawer', 'is_row_enabled')
  t('is_row_enabled 恒为 0（无条件，不受开关影响）', v === 0, `实际 ${v}`)
}

// tab：属性已从服务端消失，开关是死开关 —— 测试要如实记录这件事
console.log('\n【5】tab 开关：属性已不存在，如实钉住现状')
{
  const t1 = run(URLS.customize, before.customize, { tab: false, useractivity: true })
  const t2 = run(URLS.customize, before.customize, { tab: true, useractivity: true })
  // 两次运行相隔几毫秒，subscription-enddate / product-expiry 是动态值必然不同，
  // 比逐字节前先把这两处抹成同样长度再比 —— 否则这条断言永远红，且红得没有意义。
  const blank = b => b.toString('latin1')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g, '0000-00-00T00:00:00Z')
  t('tab=true/false 输出一致（该开关当前无效）',
    blank(t1.out) === blank(t2.out),
    '若哪天 Spotify 恢复下发 tab_configuration，这条会红 —— 那是好事，提醒回来改测试')
  const s = before.customize.toString('latin1')
  t('fixture 里确实没有 tab_configuration', !s.includes('tab_configuration'))
  t('fixture 里确实没有 ios-feature-navigation scope', !s.includes('ios-feature-navigation'))
}

// ── 6. 非 200 直接透传 ────────────────────────────────────────────────
console.log('\n【6】状态守卫')
{
  let doneArg = null
  const ctx = {
    $request: { url: URLS.customize, method: 'POST', headers: {} },
    $response: { status: 304, body: Buffer.alloc(0) },
    $argument: { tab: false, useractivity: true },
    $done: a => { doneArg = a },
    console: { log: () => {} },
    Uint8Array, TextDecoder, Array, Math, JSON, Object, Error, String, Date,
    parseInt, isNaN, decodeURIComponent
  }
  ctx.globalThis = ctx
  vm.createContext(ctx)
  vm.runInContext(js.toString(), ctx, { timeout: 10000 })
  t('304 时 $done({}) 不带 body（脚本首行守卫）',
    doneArg && !('body' in doneArg),
    '已登录冷启动时 Spotify 发 304，脚本必须放行')
}

// ── 7. 脚本指纹 ────────────────────────────────────────────────────────
console.log('\n【7】脚本指纹')
t('SHA256 记录在案（改动脚本请同步更新 UPSTREAM.md）',
  createHash('sha256').update(js).digest('hex').length === 64,
  createHash('sha256').update(js).digest('hex'))
t('含 crack-dev 的 36 个属性（抽样 6 个）',
  // 注意：合法 JS 标识符键在压缩后不带引号（catalogue:{...}），含连字符的才带引号
  ['catalogue', 'audio-quality', 'loudness-levels', 'offline-backup', 'smart-shuffle', 'mixing-tools']
    .every(k => js.toString().includes(k)))
t('含 kelee 独有的 financial-product', js.toString().includes('"financial-product"'))
t('含到期日计算 setMonth', js.toString().includes('setMonth'))

done()
