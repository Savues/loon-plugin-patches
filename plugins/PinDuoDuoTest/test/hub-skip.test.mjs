// hub_skip.response.js 的回归测试：月卡 H5 自动点「跳过」注入
import { readFileSync } from 'node:fs'
import { t, done } from './harness.mjs'

const src = readFileSync(new URL('../src/hub_skip.response.js', import.meta.url), 'utf8')
const PAGE = '<!doctype html><html><head><title>hub</title></head><body><div id="app"></div></body></html>'

const run = (argObj, body) => {
  const out = {}
  new Function('$argument', '$response', '$done', 'console', src)(
    argObj, { body }, (r) => { out.result = r }, console)
  return out.result
}
const PASSTHRU = (r) => r && Object.keys(r).length === 0
// 从改写后的 HTML 里抠出注入的脚本正文
const injected = (b) => {
  const m = String(b).match(/<script>\(([\s\S]*)\)\(\);<\/script>/)
  return m ? m[1] : null
}

console.log('\n【1】开关语义')
t('开关关 → 完全放行', PASSTHRU(run({ auto_skip: 'false' }, PAGE)))
t('开关缺失 → 完全放行', PASSTHRU(run({}, PAGE)))
t('on/1/true 各种写法都算开', ['true', '1', 'on', true, 1].every(v => !PASSTHRU(run({ auto_skip: v }, PAGE))))
t('非字符串 body → 放行', PASSTHRU(run({ auto_skip: 'true' }, { a: 1 })))
t('空 body → 放行', PASSTHRU(run({ auto_skip: 'true' }, '')))

console.log('\n【2】注入行为')
const out = run({ auto_skip: 'true' }, PAGE)
t('body 被改写', typeof out.body === 'string' && out.body !== PAGE)
t('注入在 </body> 之前', out.body.indexOf('data-pdd-autoskip') < out.body.indexOf('</body>'))
t('script 标签只多一个', (out.body.match(/<script>/g) || []).length === 1)
t('原页面内容未动', out.body.includes('<div id="app"></div>') && out.body.includes('<title>hub</title>'))
t('没有 </body> 时追加到末尾', (run({ auto_skip: 'true' }, '<html><body>x</body>').body || '').includes('</body>'))

console.log('\n【3】注入脚本自身的质量')
const js = injected(out.body)
t('能抠出脚本正文', !!js)
t('语法合法（可被解析为函数表达式）', (() => { try { new Function('return (' + js + ')'); return true } catch (e) { return false } })())
t('无外部网络依赖', !/https?:\/\//.test(js), (js || '').match(/https?:\/\/[^"'\s]+/) || '')
t('含文本匹配「跳过」', js.includes('跳过') || js.includes('\\u8df3'))
t('模拟指针事件序列', js.includes('pointerdown') && js.includes('mousedown') && js.includes('click'))
t('有次数上限与超时收工', js.includes('clicks >= 4') && js.includes('clearInterval'))
t('要求元素可见（尺寸过滤）', js.includes('getBoundingClientRect') && js.includes('visibility'))

console.log('\n【4】真实抓包页面尾部切片')
const realTail = readFileSync(new URL('./hub-page-tail-fixture.txt', import.meta.url), 'utf8')
const realOut = run({ auto_skip: 'true' }, realTail)
t('真机页面片段被注入', typeof realOut.body === 'string' && realOut.body.indexOf('data-pdd-autoskip') !== -1)
t('注入仍在 </body> 之前', realOut.body.indexOf('data-pdd-autoskip') < realOut.body.indexOf('</body>'))
const mk = realOut.body.indexOf('data-pdd-autoskip')
const di = realOut.body.lastIndexOf('<script>', mk), dj = realOut.body.indexOf('</script>', mk) + '</script>'.length
t('页面原有内容逐字保留', realOut.body.slice(0, di) + realOut.body.slice(dj) === realTail, `diff@${di}`)

console.log('\n【5】幂等与容错')
const once = out.body
t('对已注入的 body 再跑 → 放行', PASSTHRU(run({ auto_skip: 'true' }, once)))

done()
