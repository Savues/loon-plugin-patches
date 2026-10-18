/*
 * 测试版 v2：双端点拦截 brand/list + splash/show。
 * 注入固定中秋（id=38），验证双端点机制。
 */
const url = $request.url;
try {
  const j = JSON.parse($response.body);
  if (!j.data) j.data = {};
  const now = Math.floor(Date.now() / 1000);

  if (url.includes('brand/list')) {
    // brand/list: 注入 show 排期
    j.data.show = [{
      id: 38,
      begin_time: now - 7 * 86400,
      end_time: now + 7 * 86400,
      probability: 1,
      duration: 1000,
      mode: "full",
      show_logo: true,
      logo_position: "center",
      new_splash: true,
      categories: null,
      initial_push_time: now - 7 * 86400,
      source: "brand"
    }];
  } else if (url.includes('splash/show')) {
    // splash/show: 注入完整素材
    j.data.show = [{
      id: 38,
      thumb: "https://i0.hdslb.com/bfs/feed-admin/374fd75303cca2e68856b23f05022d68a97d07b2.webp",
      logo_url: "http://i0.hdslb.com/bfs/archive/1b1a8a4fc78a3b1b2992402ebdc19808b9d251ed.png",
      thumb_name: "中秋节",
      source: "brand",
      show_logo: true,
      is_ad: false,
      is_ad_loc: false,
      type: 2,
      card_type: 39,
      duration: 5,
      skip: true
    }];
  }
  $done({ body: JSON.stringify(j) });
} catch (e) {
  $done({});
}
// TEST v2: dual endpoint intercept (brand/list + splash/show)