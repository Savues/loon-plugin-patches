// 美团 horn 远程配置清洗: 广告/弹窗开关键反转 (portal-portm/h.meituan.com 的 horn_ios/mergeRequest)
// horn = 全 App 配置主干道 (169 模块), 只做键级反转不动结构
// 2026-10-25 清数据冷启动 HAR 实证键 (retail 模块):
//   com.meituan.retail.should_show_group_supermarket_guide_popup: "true" → "false" (闪购超市引导弹窗)
//   com.meituan.retail.maicai_splash_hidden: false → true (买菜开屏隐藏)
//   com.meituan.retail.splash_vap: true → false (开屏 VAP 动画)
//   com.meituan.retail.splash_video_disabled: false → true (开屏视频禁用)
//   pt_business_mine_popup_enable: true → false (我的页弹窗, 沙盒horn实证)
const REVERSES = [
  [/("com\.meituan\.retail\.should_show_group_supermarket_guide_popup"\s*:\s*)"?true"?/g, '$1"false"'],
  [/("com\.meituan\.retail\.maicai_splash_hidden"\s*:\s*)false/g, '$1true'],
  [/("com\.meituan\.retail\.splash_vap"\s*:\s*)true/g, '$1false'],
  [/("com\.meituan\.retail\.splash_video_disabled"\s*:\s*)false/g, '$1true'],
  [/("pt_business_mine_popup_enable"\s*:\s*)true/g, '$1false'],
];
let body = $response.body;
if (typeof body === 'string' && body.length > 1000) {
  let changed = false;
  for (const [re, rep] of REVERSES) {
    if (re.test(body)) { body = body.replace(re, rep); changed = true; }
    re.lastIndex = 0;
  }
  if (changed) { $done({ body }); return; }
}
$done({});
