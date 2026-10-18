/*
 * splash/brand/list show 注入 —— 强制展示指定节日/活动品牌皮肤。
 * v14: 22 官方皮肤 + block + replace 模式（用官方 thumb URL 替换）。
 *
 * replace 模式：用 id=13 作载体，thumb 换成另一个官方皮肤的 URL。
 * 测试客户端是否接受"官方 URL + 不同 id"的组合。
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

// 官方皮肤的 thumb URL + hash（用于 replace 模式）
const OFFICIAL_THUMBS = {
  midautumn: {
    thumb: "https://i0.hdslb.com/bfs/feed-admin/374fd75303cca2e68856b23f05022d68a97d07b2.webp",
    hash: "9aeaed47d0958cf733cab7a51e554f2f"
  },
  chongyang: {
    thumb: "https://i0.hdslb.com/bfs/splash/0013afcbf738bc912a0d7bfb41b15df073cd8958.webp",
    hash: "7cc80d3a9e8b576693f8a7ae8a21ce8a"
  }
};

const sel = A.festival;
try {
  const j = JSON.parse($response.body);
  if (!j.data) j.data = {};
  if (!Array.isArray(j.data.list)) j.data.list = [];
  const now = Math.floor(Date.now() / 1000);

  if (sel === "block") {
    j.data.show = [];
    $done({ body: JSON.stringify(j) });
  } else if (sel === "replace") {
    // replace 模式：用 bili11(id=13) 作载体，thumb 换成中秋的 URL + hash
    const carrierId = FESTIVALS.bili11;
    const target = OFFICIAL_THUMBS.midautumn;
    const item = j.data.list.find(x => x.id === carrierId);
    if (item) {
      item.thumb = target.thumb;
      item.thumb_name = "替换测试";
      item.thumb_hash = target.hash;
    }
    j.data.show = [{
      id: carrierId,
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
  } else {
    const id = FESTIVALS[sel] || FESTIVALS.midautumn;
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
// v14: 22 skins + block + replace mode (official thumb URL swap test)
