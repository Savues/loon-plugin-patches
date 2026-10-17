/*
 * splash/brand/list show 注入 —— 强制展示指定节日/活动品牌皮肤。
 * v7: 只保留当前 22 个官方皮肤 + block 屏蔽。
 *
 * 历史皮肤（id 113-144）经测试无法展示（客户端有本地白名单），已移除。
 */
const A = $argument || {};
const LOGO = "http://i0.hdslb.com/bfs/archive/1b1a8a4fc78a3b1b2992402ebdc19808b9d251ed.png";

const FESTIVALS = {
  midautumn: 38, chongyang: 145, yuandan: 34, duanwu: 43, qixi: 47,
  halloween: 31, xmas1: 32, xmas2: 33, women: 35, labor: 41,
  bili10: 12, bili11: 13, bili12: 44, bili13: 67,
  bml2021: 45, bw2020: 10, bw2021: 46,
  "2233a": 14, "2233b": 15, "2233c": 37, "2233d": 36, slogan: 17
};

const sel = A.festival;
try {
  const j = JSON.parse($response.body);
  if (!j.data) j.data = {};
  const now = Math.floor(Date.now() / 1000);
  const id = FESTIVALS[sel] || FESTIVALS.midautumn;

  if (sel === "block") {
    j.data.show = [];
    $done({ body: JSON.stringify(j) });
  } else {
    j.data.show = [{
      id: id,
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
    $done({ body: JSON.stringify(j) });
  }
} catch (e) {
  $done({});
}
// v7: current 22 skins only + block
