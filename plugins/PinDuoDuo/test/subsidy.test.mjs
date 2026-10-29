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
// v2.43：默认会注入 pdd-lightup-auto，这里关掉以专注测「搜索词清理」职责
t('完全不含 queryWords → 放行', PASSTHRU(run({ search_stub: 'true', lightup_auto: 'false', lightup_popup: 'false', hud: 'false', lucky_close: 'false' }, '<html><body>hi</body></html>')));
t('非字符串 body → 放行', PASSTHRU(run({ search_stub: 'true' }, 12345)))

console.log('\n【7】只替换第一处，缩小影响面（真实抓包中该键全文仅出现 1 次）')
const two = real + real
const r2 = run({ search_stub: 'true' }, two)
t('只清空第一处', (r2.body.match(/"queryWords":\[\]/g) || []).length === 1)
t('第二处原样保留', (r2.body.match(/"queryWords":\[/g) || []).length === 2)
t('长文本不超时', run({ search_stub: 'true' }, real.repeat(500)).body.length > 0)

console.log('\n【8】v2.43 点亮任务自动倒计时注入');
const inj = run({ lightup_auto: 'true' }, '<html><body>x</body></html>');
t('默认注入 pdd-lightup-auto', inj.body.includes('id="pdd-lightup-auto"'));
t('注入在 </body> 前', inj.body.indexOf('pdd-lightup-auto') < inj.body.indexOf('</body>'));
const again = run({ lightup_auto: 'true' }, inj.body);
t('幂等（重复处理返回空，不叠加）', !again.body || (again.body.match(/pdd-lightup-auto/g) || []).length === 1);
t('lightup_auto=false 不注入', PASSTHRU(run({ lightup_auto: 'false', lightup_popup: 'false', hud: 'false', lucky_close: 'false' }, '<html><body>x</body></html>')));

console.log('\n【9】v2.45 福袋弹窗自动关闭注入');
const lb = run({ lucky_close: 'true' }, '<html><body>x</body></html>');
t('默认注入 pdd-lucky-close', lb.body.includes('id="pdd-lucky-close"'));
t('注入在 </body> 前', lb.body.indexOf('pdd-lucky-close') < lb.body.indexOf('</body>'));
t('含关闭按钮图片特征', lb.body.includes('f57ce24c-be68-49a3-ab54-dd45824a4a1d'));
t('lucky_close=false 不注入', PASSTHRU(run({ lucky_close: 'false', lightup_auto: 'false', lightup_popup: 'false', hud: 'false' }, '<html><body>x</body></html>')));

console.log('\n【10】v2.66 HUD 佣金账本（Loon → 页面快照全链路）');
{
  // fake $persistentStore / $httpClient
  const m2 = {}
  const ps2 = { read: (k) => (k in m2 ? m2[k] : null), write: (v, k) => { m2[k] = v } }
  const dtk2 = JSON.stringify({ data: { pdd: { data: [
    { code: '0', goods: {}, match: 'goods.html?goods_id=444', msg: '该商品不支持转链' },
    { code: '1', goods: { rate: 0, goods_name: 'X商品', min_group_price: 9.9 }, match: 'goods.html?goods_id=222' },
    { code: '1', goods: { rate: 3.2, goods_name: 'AVS 充电器', commission_amount: '0.08', min_group_price: 82.9 },
      item_link: 'https://mobile.yangkeduo.com/duo_coupon_landing.html?goods_id=333&pid=1&cpsSign=CC_x',
      match: 'goods.html?goods_id=333' }
  ] } } })
  let httpN = 0
  const http2 = { post: (o, cb) => { httpN++; cb(null, {}, dtk2) } }
  const goods2 = [
    { goodsId: 333, activityPrice: 8290, activityPriceWordBeforeTag: { type: 23, tag_ext: {}, text: '券后' }, link_url: 'goods.html?goods_id=333' },
    { goodsId: 222, activityPrice: 990, activityPriceWord: '券后', link_url: 'goods.html?goods_id=222' },
    { goodsId: 444, activityPrice: 500, activityPriceWord: '券后', link_url: 'goods.html?goods_id=444' }
  ]
  const html2 = '<html><body>x<script>window.rawData=' +
    JSON.stringify({ stores: { store: { tabStore: { tabList: [{ subTabGoodsLists: [{ list: goods2 }] }] } } } }) +
    ';<\\/script></body></html>'
  let res3
  new Function('$argument', '$response', '$done', 'console', '$persistentStore', '$httpClient', src)(
    { search_stub: 'false', cps_label: true, cps_token: 't', cps_rewrite: 'true',
      no_anim: 'false', lightup_auto: 'false', lightup_popup: 'false', lucky_close: 'false', hud: 'true' },
    { body: html2 }, (r) => { res3 = r }, console, ps2, http2)
  const b2 = String(res3 && res3.body)
  const s2raw = m2['pddHudStats']
  const led2raw = m2['pddHudLedger']
  t('dtk 被调用 1 次', httpN === 1, `实际 ${httpN}`)
  t('转链统计已写入 $persistentStore', !!s2raw, 'pddHudStats 缺失')
  if (s2raw) {
    const s2 = JSON.parse(s2raw)
    t('tr=3 tok=2 pos=1 tf=1 c=1',
      s2.tr === 3 && s2.tok === 2 && s2.tpos === 1 && s2.tf === 1 && s2.c === 1, s2raw)
    t('缓存命中统计 ca=3 ch=0', s2.ca === 3 && s2.ch === 0)
  }
  t('真佣金账本已写入', !!led2raw, 'pddHudLedger 缺失')
  if (led2raw) {
    const led2 = JSON.parse(led2raw)
    const e = led2['333']
    t('账本条目 r/p/a 齐备', !!e && e.r === 3.2 && e.p === 82.9 && e.a === 0.08, led2raw)
  }
  t('佣金标签注入页面（佣金3.2%）', b2.includes('佣金3.2%'))
  t('link_url 已转 duo_coupon_landing', b2.includes('duo_coupon_landing.html?goods_id=333'))
  t('HTML 注入 __pddHudData 快照', b2.includes('id="pdd-hud-data"') && b2.includes('window.__pddHudData='))
  const idx2 = b2.indexOf('window.__pddHudData=')
  const end2 = b2.indexOf(';</script>', idx2)
  let snap = null
  try { snap = JSON.parse(b2.slice(b2.indexOf('=', idx2) + 1, end2)) } catch (e) { /* ignore */ }
  t('快照 JSON 可解析且含 s/l', !!snap && !!snap.s && !!snap.l, snap ? 'ok' : '解析失败')
  t('HUD 内嵌 JS 语法合法', (() => {
    const a1 = src.indexOf('<script id="pdd-hud">')
    const a2 = src.indexOf('</script>', a1)
    const js = src.slice(a1 + 21, a2)
    try { new Function(js); return true } catch (e) { return false }
  })())
  t('HUD 含账本渲染（ledgerList/data-act/真佣金）',
    b2.includes('ledgerList') && b2.includes('data-act') && b2.includes('真佣金'))
}

done()
