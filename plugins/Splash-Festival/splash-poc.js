/*
 * splash/brand/list show 注入 —— 强制展示指定节日品牌皮肤。
 *
 * 机制：brand/list 响应的 data.show 数组是展示控制通道，
 * 客户端按 begin_time/end_time 时间窗口决定是否展示。
 * 注入目标节日条目，时间窗口设为当前时间前后各一天。
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
    thumb: "https://i0.hdslb.com/bfs/splash/0013afcbf738bc912a0d7bfb41b15df073cd8958.webp",
    logo_url: "http://i0.hdslb.com/bfs/archive/1b1a8a4fc78a3b1b2992402ebdc19808b9d251ed.png",
    thumb_name: "2026重阳节",
    source: "brand",
    show_logo: true
  }
};
const F = FESTIVALS[A.festival] || FESTIVALS.midautumn;

try {
  const j = JSON.parse($response.body);
  if (!j.data) j.data = {};
  const now = Math.floor(Date.now() / 1000);
  const entry = {
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
  };
  j.data.show = [entry];
  $done({ body: JSON.stringify(j) });
} catch (e) {
  $done({});
}
// v2: brand/list show injection (force refresh cache)
