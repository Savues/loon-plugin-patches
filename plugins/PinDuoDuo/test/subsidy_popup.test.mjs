// subsidy_popup.response.js 的回归测试
// fixture 是 2026-11-01 真机抓包（shared-6BE310EC_16）中
// aquarius/hungary/global/homepage 的原样切片（已剔除巨型 base64 模板）
import { readFileSync } from 'node:fs'
import { t, done } from './harness.mjs'

const src = readFileSync(new URL('../src/subsidy_popup.response.js', import.meta.url), 'utf8')
const real = readFileSync(new URL('./subsidy-popup-fixture.json', import.meta.url), 'utf8')

const run = (argObj, body) => {
  const out = {}
  new Function('$argument', '$response', '$done', 'console', src)(
    argObj, { body }, (r) => { out.result = r }, console)
  return out.result
}
const PASSTHRU = (r) => r && Object.keys(r).length === 0

console.log('\n【1】fixture 自身')
t('fixture 含补贴弹窗 module', real.includes('ddvideo_shopping_subsidy_payment_0118_v5_wd'))
t('fixture list 长度 1', JSON.parse(real).list.length === 1)

console.log('\n【2】默认开：删除弹窗项')
const r = run({}, real)
t('返回了 body', typeof r.body === 'string', JSON.stringify(r).slice(0, 80))
if (r.body) {
  const j = JSON.parse(r.body)
  t('list 变空', Array.isArray(j.list) && j.list.length === 0, `实际 ${j.list && j.list.length}`)
  t('list 内已无补贴弹窗', j.list.every((x) => !String(x.module || '').startsWith('ddvideo_shopping_subsidy_payment')))
  t('其他顶层字段保留', j.server_time === JSON.parse(real).server_time)
  t('rm_id_list 保留', Array.isArray(j.rm_id_list) && j.rm_id_list.length === 2)
}

console.log('\n【3】开关关闭：原样放行')
t('subsidy_popup=false → 放行', PASSTHRU(run({ subsidy_popup: 'false' }, real)))
t('subsidy_popup=0 → 放行', PASSTHRU(run({ subsidy_popup: '0' }, real)))
t('subsidy_popup=off → 放行', PASSTHRU(run({ subsidy_popup: 'off' }, real)))
t('subsidy_popup=true → 生效', (() => {
  const rr = run({ subsidy_popup: 'true' }, real)
  return rr.body && JSON.parse(rr.body).list.length === 0
})())

console.log('\n【4】AB 变体全覆盖')
for (const v of ['v6', 'v8', 'v9', '']) {
  const mod = 'ddvideo_shopping_subsidy_payment_0118_' + (v || '') + '_wd'
  const j = JSON.parse(real)
  j.list[0].module = mod
  const out = run({}, JSON.stringify(j))
  t(`变体 ${mod} 被删`, !!out.body && JSON.parse(out.body).list.length === 0, mod)
}

console.log('\n【5】不误伤其他弹窗')
const j2 = JSON.parse(real)
j2.list.push({ module: 'star_ad_wd', render_id: 10, display: 1 })
j2.list.push({ module: 'other_popup_v1', render_id: 10 })
const out2 = run({}, JSON.stringify(j2))
if (out2.body) {
  const jj = JSON.parse(out2.body)
  t('只删补贴弹窗，保留其他 2 项', jj.list.length === 2, `实际 ${jj.list.length}`)
  t('star_ad_wd 保留', jj.list.some((x) => x.module === 'star_ad_wd'))
  t('other_popup_v1 保留', jj.list.some((x) => x.module === 'other_popup_v1'))
} else {
  t('非补贴弹窗场景应放行（无补贴项）', PASSTHRU(out2))
}

console.log('\n【6】异常输入不崩')
t('空 body → 放行', PASSTHRU(run({}, '')))
t('无 body → 放行', PASSTHRU(run({}, undefined)))
t('非 JSON → 放行', PASSTHRU(run({}, '<html>not json</html>')))
t('无 list 字段 → 放行', PASSTHRU(run({}, JSON.stringify({ server_time: 1 }))))
t('list 非数组 → 放行', PASSTHRU(run({}, JSON.stringify({ list: 'x' }))))
t('list 为空 → 放行', PASSTHRU(run({}, JSON.stringify({ list: [] }))))

done()
