/*
 * splash/show 注入 PoC —— 强制展示指定节日品牌皮肤。
 *
 * 处理两种响应：
 *   1) 200 + data.show=[] → 直接替换 show 数组
 *   2) -304 + data=null（缓存命中）→ Loon 拦截后返回 200 + 注入的 show
 *
 * 假设（未验证）：splash/show 的 show 数组除广告/活动条目外，也接受品牌皮肤条目。
 * 若客户端 splash/show 为空时只走本地节日表、忽略 show 里的品牌条目 → 注入无效。
 */
const A = $argument || {};
const FESTIVALS = {
  midautumn: {
    id: 38,
    thumb: "https://i0.hdslb.com/bfs/feed-admin/374fd75303cca2e68856b23f05022d68a97d07b2.webp",
    logo_url: "http://i0.hdslb.com/bfs/archive/1b1a8a4fc78a3b1b2992402ebdc19808b9d251ed.png",
    thumb_name: "中秋节",
    source: "brand",
    show_logo: true
  },
  chongyang: {
    id: 145,
    thumb: "https://i0.hdslb.com/bfs/splash/d48ac964228e69c8a6f764a836f50053fb368568.webp",
    logo_url: "http://i0.hdslb.com/bfs/archive/1b1a8a4fc78a3b1b2992402ebdc19808b9d251ed.png",
    thumb_name: "2026重阳节",
    source: "brand",
    show_logo: true
  }
};
const F = FESTIVALS[A.festival] || FESTIVALS.midautumn;

try {
  const j = JSON.parse($response.body);
  // -304 时 data=null，构造完整结构；200 时直接改 show
  if (!j.data) {
    j.data = { show: [], splash_request_id: "poc" };
  }
  const entry = Object.assign({}, F, {
    is_ad: false,
    is_ad_loc: false,
    type: 2,
    card_type: 39,
    duration: 5,
    skip: true
  });
  j.data.show = [entry];
  $done({ body: JSON.stringify(j) });
} catch (e) {
  $done({});
}
