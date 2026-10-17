/*
 * splash/brand/list show 注入 —— 强制展示指定节日/活动品牌皮肤。
 * v8: 支持 22 个官方皮肤 + block 屏蔽 + custom 自定义 URL 模式。
 *
 * custom 模式：用当前 22 个 id 作载体，thumb 替换为用户自定义 URL。
 * 这样可展示任意"隐藏开屏"（历史皮肤素材、自定义图片等）。
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
const customUrl = A.custom_url || "";

try {
  const j = JSON.parse($response.body);
  if (!j.data) j.data = {};
  if (!Array.isArray(j.data.list)) j.data.list = [];
  const now = Math.floor(Date.now() / 1000);

  if (sel === "block") {
    j.data.show = [];
    $done({ body: JSON.stringify(j) });
  } else if (sel === "custom" && customUrl) {
    // custom 模式：用 midautumn(id=38) 作载体，thumb 替换为自定义 URL
    const carrierId = FESTIVALS.midautumn;
    // 替换 list 中该 id 的 thumb
    const item = j.data.list.find(x => x.id === carrierId);
    if (item) {
      item.thumb = customUrl;
      item.thumb_name = "自定义开屏";
    }
    // 注入 show 排期
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
// v8: 22 skins + block + custom URL mode
