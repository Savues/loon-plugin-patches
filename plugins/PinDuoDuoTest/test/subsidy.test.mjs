// subsidy.response.js 的回归测试：百亿补贴页搜索框推广词
// fixture 是 2026-09-29 真机抓包（15MB HAR）中 brand_activity_subsidy.html 的原样切片
import { readFileSync } from 'node:fs'
import { t, done } from './harness.mjs'

const src = readFileSync(new URL('../src/subsidy.response.js', import.meta.url), 'utf8')
const real = readFileSync(new URL('./subsidy-fixture.txt', import.meta.url), 'utf8')

const run = (argObj, body) => {
  const out = {}
  new Function('$argument', '$response', '$done', 'console', src)(
    argObj, { body }, (r) => { out.result = r }, console)
  return out.result
}
// 取回改后的 queryWords
const words = (b) => {
  const m = String(b).match(/"queryWords"\s*:\s*(\[[^\]]*\])/)
  return m ? JSON.parse(m[1]) : null
}
const PASSTHRU = (r) => r && Object.keys(r).length === 0

console.log('\n【1】真实抓包切片：推广词确实在页面里')
t('原始切片含百事可乐', real.includes('百事可乐'))
t('原始切片含可口可乐', real.includes('可口可乐'))
t('原始 10 个轮播词', words(real).length === 10, `实际 ${words(real).length}`)

console.log('\n【2】search_stub 开：轮播词清空')
const on_ = run({ search_stub: 'true' }, real)
t('queryWords 变成空数组', JSON.stringify(words(on_.body)) === '[]', JSON.stringify(words(on_.body)))
t('百事可乐已消失', !on_.body.includes('百事可乐'))
t('可口可乐已消失', !on_.body.includes('可口可乐'))
t('body 确实被替换', typeof on_.body === 'string' && on_.body !== real)

console.log('\n【3】只动目标字段，其余原样')
t('enable 未动', on_.body.includes('"enable":true'))
t('style 未动', on_.body.includes('"style":1'))
t('rightText 未动', on_.body.includes('"rightText":"搜低价"'))
t('服务端时间未动', on_.body.includes('"serverTime":1790674212'))
t('相邻字段未误伤', on_.body.includes('"isValidIntervalVersion":true'))
t('长度只减不增', on_.body.length < real.length, `${real.length} → ${on_.body.length}`)

console.log('\n【4】search_stub 关：原样放行')
t('开关关 → 完全不碰', PASSTHRU(run({ search_stub: 'false' }, real)))
t('开关缺失 → 完全不碰', PASSTHRU(run({}, real)))
t('开关取 on/off 各种形态', PASSTHRU(run({ search_stub: 'off' }, real))
  && PASSTHRU(run({ search_stub: '0' }, real)))
t('开关开（真值 true）生效', !run({ search_stub: true }, real).body.includes('百事可乐'))

console.log('\n【5】轮播占位词一并清掉')
const withGuide = real.replace('"queryGuideWord":""', '"queryGuideWord":"百事可乐限时秒杀"')
t('构造：占位词非空', withGuide.includes('百事可乐限时秒杀'))
const g = run({ search_stub: 'true' }, withGuide)
t('占位词被清空', g.body.includes('"queryGuideWord":""'))
t('占位词推广文案消失', !g.body.includes('百事可乐限时秒杀'))

console.log('\n【6】异常输入不崩')
t('空 body → 放行', PASSTHRU(run({ search_stub: 'true' }, '')))
t('无 body 字段 → 放行', PASSTHRU(run({ search_stub: 'true' }, undefined)))
t('完全不含 queryWords → 放行', PASSTHRU(run({ search_stub: 'true' }, '<html><body>hi</body></html>')))
t('非字符串 body → 放行', PASSTHRU(run({ search_stub: 'true' }, 12345)))

console.log('\n【7】只替换第一处，缩小影响面（真实抓包中该键全文仅出现 1 次）')
const two = real + real
const r2 = run({ search_stub: 'true' }, two)
t('只清空第一处', (r2.body.match(/"queryWords":\[\]/g) || []).length === 1)
t('第二处原样保留', (r2.body.match(/"queryWords":\[/g) || []).length === 2)
t('长文本不超时', run({ search_stub: 'true' }, real.repeat(500)).body.length > 0)

done()
