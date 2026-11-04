// Alibaba-AdBlock 语义回归 —— 只锁定「踩过的事故」，不追求覆盖
// 每条用例对应一次真机事故（见 docs/Taobao.md §2.7 / §4.5）：
//   1-2  chaojisheng.draw.hongbao  结算入口被拦 → 「获取返利信息失败」+ 无付款按钮
//   3    ossgw buy_submit_h5.js    模板 CDN 整域拦 → 结算栏消失
//   4    adzone.default.get        分享链路前置被拦 → 「去分享」无反应
//   5    mtop.etao.noah.query      弹窗漏拦 / 反向不能整条 reject
//   6    反向：核心开屏广告必须仍被拦（防止「修测试」= 删规则）
//   7    noah.wireless.config       通用页面配置被当开屏拦 → Moon「我的」页卡死
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { t, done, rules, runScript } from './harness.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const FIX = (n) => join(HERE, 'fixtures', n)

console.log('【1】一淘结算入口不得被终止')
{
  const r = rules('https://acs.m.taobao.com/gw/mtop.etao.fe.chaojisheng.draw.hongbao/1.0/?type=originaljson')
  t('ruleBlocked = false', r.ruleBlocked === false, JSON.stringify(r.rule))
  t('rewriteBlocked = false', r.rewriteBlocked === false, String(r.rewrite))
}

console.log('【2】结算入口响应不得被清洗破坏')
{
  const body = runScript('https://acs.m.taobao.com/gw/mtop.etao.fe.chaojisheng.draw.hongbao/1.0/', FIX('etao-settle-entry.json'))
  let j = null
  try { j = JSON.parse(body) } catch (e) { /* 留给断言 */ }
  t('placeOrderUrl 保留', !!(j && typeof j.data?.placeOrderUrl === 'string' && j.data.placeOrderUrl.length > 0))
  t('etaoRoutePageCode=v3 保留', String(j?.data?.placeOrderUrl || '').includes('etaoRoutePageCode%22%3A%22v3'))
}

console.log('【3】ossgw 结算模板不得被终止')
{
  const r = rules('https://ossgw.alicdn.com/rapid-oss-bucket/template_online/buy_submit/1600853389896/buy_submit_h5.js')
  t('ruleBlocked = false', r.ruleBlocked === false, JSON.stringify(r.rule))
  t('rewriteBlocked = false', r.rewriteBlocked === false, String(r.rewrite))
}

console.log('【4】分享链路 adzone.default.get 不得被终止')
{
  const r = rules('https://acs.m.taobao.com/gw/mtop.taobao.union.adzone.default.get/1.0/?type=originaljson')
  t('ruleBlocked = false', r.ruleBlocked === false, JSON.stringify(r.rule))
  t('rewriteBlocked = false', r.rewriteBlocked === false, String(r.rewrite))
}

console.log('【5】NOAH：接口保留 + 广告资产清空 + tao_splash 例外')
{
  const r = rules('https://acs.m.taobao.com/gw/mtop.etao.noah.query/1.0/?type=originaljson')
  t('接口不得被终止', r.ruleBlocked === false && r.rewriteBlocked === false, String(r.rewrite))
  const body = runScript('https://acs.m.taobao.com/gw/mtop.etao.noah.query/1.0/', FIX('etao-noah-popup.json'))
  let j = null
  try { j = JSON.parse(body) } catch (e) { /* 留给断言 */ }
  t('assetResult 已清空', !!(j && Array.isArray(j.data?.assetResult) && j.data.assetResult.length === 0))
  const s = rules('https://acs.m.taobao.com/gw/mtop.etao.noah.query/1.0/?type=originaljson&tao_splash=1')
  t('tao_splash 仍必须被终止', s.rewriteBlocked === true, String(s.rewrite))
}

console.log('【6】反向：核心开屏广告必须仍被拦截')
{
  const r = rules('https://guide-acs.m.taobao.com/gw/mtop.taobao.wireless.home.splash.awesome.get/1.0/')
  t('开屏接口被终止', r.ruleBlocked === true || r.rewriteBlocked === true, String(r.rewrite))
}

console.log('【7】Moon 我的页配置：wireless.config 保留 + trigger 仍拦')
{
  const uc = rules('https://acs.m.taobao.com/gw/mtop.etao.noah.wireless.config/1.0/?type=originaljson&data=%7B%22src%22%3A%22iphone%22%2C%22bizScene%22%3A%22%5B%5C%22UserCenter%5C%22%5D%22%7D')
  t('wireless.config 不得被终止', uc.ruleBlocked === false && uc.rewriteBlocked === false, String(uc.rewrite))
  const trig = rules('https://acs.m.taobao.com/gw/mtop.etao.noah.trigger/1.0/?type=originaljson')
  t('noah.trigger 仍必须被终止', trig.rewriteBlocked === true, String(trig.rewrite))
}

done()
