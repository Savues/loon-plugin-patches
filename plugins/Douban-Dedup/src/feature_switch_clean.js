// 豆瓣 feature_switch 清洗: 开屏框架关闭 (v2.2.0)
// feature_switch = 豆瓣配置主干道 (44KB/94键, api/v2) — 功能配置只能键级清洗
// 残壳根因: 开屏接口已拦 2B, 但框架由 splash_sdk_info 等键驱动照常渲染 (遮罩/摇一摇/跳过)
;(function () {
const pass = () => $done({})
const body = $response && $response.body
if (!body) return pass()

let data
try { data = JSON.parse(body) } catch (e) { return pass() }
if (!data || typeof data !== 'object') return pass()
const d = data.data && typeof data.data === 'object' ? data.data : data
if (!d || typeof d !== 'object') return pass()

let dirty = false

// ① 开屏 SDK 投放配置清空 (jztSplashSDK 竞智通等 — 框架渲染的驱动源)
if (Array.isArray(d.splash_sdk_info) && d.splash_sdk_info.length) {
  d.splash_sdk_info = []
  dirty = true
}

// ② 开屏/广告开关反转
const TOGGLES = ['personalized_ad_enabled', 'personalized_rec_enabled',
  'enable_splash_client_bid', 'splash_client_bid_use_preload', 'fake_ad_fetch_in_advance']
for (const k of TOGGLES) {
  if (d[k] === true) { d[k] = false; dirty = true }
  else if (d[k] === 2) { d[k] = 0; dirty = true }
}

if (dirty) { $done({ body: JSON.stringify(data) }); return }
pass()
})()
