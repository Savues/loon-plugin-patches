/*
 * splash/brand/list show 注入 —— 强制展示指定节日品牌皮肤。
 * v2: 支持 10 个节日，版本号方便分辨。
 *
 * 机制：brand/list 响应的 data.show 数组是展示控制通道，
 * 客户端按 begin_time/end_time 时间窗口决定是否展示。
 */
const A = $argument || {};
const FESTIVALS = {
  midautumn: { id: 38,  name: "中秋节",   thumb: "https://i0.hdslb.com/bfs/feed-admin/374fd75303cca2e68856b23f05022d68a97d07b2.webp" },
  chongyang: { id: 145, name: "重阳节",   thumb: "https://i0.hdslb.com/bfs/splash/0013afcbf738bc912a0d7bfb41b15df073cd8958.webp" },
  yuandan:   { id: 34,  name: "元旦",     thumb: "https://i0.hdslb.com/bfs/feed-admin/0cb0aec42faf29be1f2c20fb7c59768e731f331f.webp" },
  duanwu:    { id: 43,  name: "端午节",   thumb: "https://i0.hdslb.com/bfs/feed-admin/c8993d6ad7be75a33546978ae94522ace5ffc55e.webp" },
  qixi:      { id: 47,  name: "七夕节",   thumb: "https://i0.hdslb.com/bfs/feed-admin/fab33f95a2975b7ccb24becdcc058ba4d0fef42f.webp" },
  halloween: { id: 31,  name: "万圣节",   thumb: "http://i0.hdslb.com/bfs/feed-admin/6b86226bb0e63a452756512629e6784838b18626.jpg" },
  xmas1:     { id: 32,  name: "圣诞节1.0", thumb: "http://i0.hdslb.com/bfs/feed-admin/98b599bf5fe6bdad607d1bda7f1772d7e140089c.jpg" },
  xmas2:     { id: 33,  name: "圣诞节2.0", thumb: "http://i0.hdslb.com/bfs/feed-admin/09783b21e555dede32cfe845a7b7dd195efe4613.jpg" },
  women:     { id: 35,  name: "妇女节",   thumb: "http://i0.hdslb.com/bfs/feed-admin/ff2fde86d7d38502b195ec60dc4982764c75206a.jpg" },
  labor:     { id: 41,  name: "劳动节",   thumb: "https://i0.hdslb.com/bfs/feed-admin/00637f0cf189490c9aeaaf7d5a07cb28981621c7.webp" }
};
const LOGO = "http://i0.hdslb.com/bfs/archive/1b1a8a4fc78a3b1b2992402ebdc19808b9d251ed.png";
const F = FESTIVALS[A.festival] || FESTIVALS.midautumn;

try {
  const j = JSON.parse($response.body);
  if (!j.data) j.data = {};
  const now = Math.floor(Date.now() / 1000);
  j.data.show = [{
    id: F.id,
    begin_time: now - 86400,
    end_time: now + 86400,
    probability: 1,
    duration: 1000,
    mode: "full",
    show_logo: true,
    logo_position: "center",
    new_splash: true,
    categories: null,
    initial_push_time: now - 86400,
    source: "brand"
  }];
  $done({ body: JSON.stringify(j) });
} catch (e) {
  $done({});
}
// v2: full festival selector (10 festivals)
