/*
 * splash/brand/list + splash/show 双注入 —— 强制展示指定节日/活动品牌皮肤。
 * v6: 历史皮肤同时注入 brand/list (list条目+show排期) 和 splash/show (完整字段)。
 *
 * 机制：客户端可能同时检查 brand/list 和 splash/show，
 * 历史皮肤需要两个端点都注入才能生效。
 */
const A = $argument || {};
const LOGO = "http://i0.hdslb.com/bfs/archive/1b1a8a4fc78a3b1b2992402ebdc19808b9d251ed.png";

// 当前皮肤（id 在服务端 list 中）
const CURRENT = {
  midautumn: 38, chongyang: 145, yuandan: 34, duanwu: 43, qixi: 47,
  halloween: 31, xmas1: 32, xmas2: 33, women: 35, labor: 41,
  bili10: 12, bili11: 13, bili12: 44, bili13: 67,
  bml2021: 45, bw2020: 10, bw2021: 46,
  "2233a": 14, "2233b": 15, "2233c": 37, "2233d": 36, slogan: 17
};

// 历史皮肤（不在 list 中，需同时注入 list 条目 + show 排期）
const HISTORICAL = {
  gaokao24:    { id: 113, name: "2024高考",     thumb: "https://i0.hdslb.com/bfs/garb/e47526bc43894fa5e1b71ffc34bf805574229cd3.webp" },
  duanwu24:    { id: 114, name: "2024端午节",   thumb: "https://i0.hdslb.com/bfs/garb/504019c9290bc8897a42601333537dcbd67239f5.webp" },
  summer24:    { id: 115, name: "2024暑假快乐", thumb: "https://i0.hdslb.com/bfs/garb/71d30f1189584e056dffee5c447c60cb882e131c.webp" },
  qixi24:      { id: 116, name: "2024七夕",     thumb: "https://i0.hdslb.com/bfs/garb/1c32a6f74da50c7c6087c4a6a8fb7475dc6344e3.webp" },
  chongyang24: { id: 117, name: "2024重阳",     thumb: "https://i0.hdslb.com/bfs/garb/6209fc6c4147a1c758a1d98315fe2221526195b4.webp" },
  teacher24:   { id: 118, name: "2024教师节",   thumb: "https://i0.hdslb.com/bfs/garb/6f170eef00b25a5c124dc20324d3ae9bdb05f65e.webp" },
  midautumn24: { id: 119, name: "2024中秋",     thumb: "https://i0.hdslb.com/bfs/garb/b1dd824c4fd99cb966245de78f775033961b5620.webp" },
  cj25a:       { id: 120, name: "2025春节打铁花", thumb: "https://i0.hdslb.com/bfs/garb/aa148313ca91f579f813573847f9b4362fc5b276.webp" },
  cj25b:       { id: 121, name: "2025春节放御灯", thumb: "https://i0.hdslb.com/bfs/garb/66d3179f2dce9bc9a28609fd782cae2afd0b03d4.webp" },
  cj25c:       { id: 122, name: "2025春节滚灯球", thumb: "https://i0.hdslb.com/bfs/garb/a855072e6db58d381dc5424cd8e720ea80153eae.webp" },
  cj25d:       { id: 123, name: "2025春节聚天宫", thumb: "https://i0.hdslb.com/bfs/garb/2132ccc84847907952361d8a95e459967b20620d.webp" },
  cj25e:       { id: 124, name: "2025春节跨火盆", thumb: "https://i0.hdslb.com/bfs/garb/c77fe0a05d2bd76e8316fd4069364e83244032e7.webp" },
  cj25f:       { id: 125, name: "2025春节舞龙狮", thumb: "https://i0.hdslb.com/bfs/garb/9a476f9a9f93cadd7174b6387adf49bface922dc.webp" },
  yx25:        { id: 126, name: "2025元宵节",   thumb: "https://i0.hdslb.com/bfs/garb/a6c9ab07642d011f007ef28ad6b5cbcb88279b33.webp" },
  women25:     { id: 127, name: "2025妇女节",   thumb: "https://i0.hdslb.com/bfs/garb/04adbc664ebf337d1c4154073ea805bc5342d913.webp" },
  qm25:        { id: 128, name: "2025清明",     thumb: "https://i0.hdslb.com/bfs/garb/234b235623814db9f53991ce8e95bfd6285eb830.webp" },
  labor25:     { id: 129, name: "2025劳动节",   thumb: "https://i0.hdslb.com/bfs/garb/3382e7a419b38b9b723cbfc44158c00df0f92b54.webp" },
  labor25b:    { id: 130, name: "2025国际劳动节", thumb: "https://i0.hdslb.com/bfs/garb/3382e7a419b38b9b723cbfc44158c00df0f92b54.webp" },
  duanwu25:    { id: 131, name: "2025端午",     thumb: "https://i0.hdslb.com/bfs/splash/552d938598abcfda3077a539aa8bc483bddf8bda.webp" },
  gaokao25:    { id: 132, name: "2025高考",     thumb: "https://i0.hdslb.com/bfs/splash/23a49a76dc3e6cc9b26e0956596b3f6185608e29.webp" },
  summer25:    { id: 133, name: "2025暑假过半", thumb: "https://i0.hdslb.com/bfs/splash/8b086942e5fe42ca5eedee851aeeb47af72aa706.webp" },
  qixi25:      { id: 134, name: "2025七夕",     thumb: "https://i0.hdslb.com/bfs/splash/951a62f737456ee33c16d126533eef845fbea1a7.webp" },
  teacher25:   { id: 135, name: "2025教师节",   thumb: "https://i0.hdslb.com/bfs/splash/d4ac4f58a94e995de548bd10d32416bc8b583541.webp" },
  midautumn25: { id: 136, name: "2025中秋",     thumb: "https://i0.hdslb.com/bfs/splash/598aba964bb752198fda1114cb0b2edb9c1f6137.webp" },
  cj26a:       { id: 137, name: "2026春节-马灯笼", thumb: "https://i0.hdslb.com/bfs/splash/c9f2932ed8bbe7ea3b37c08f8a449bfe4e94cca7.webp" },
  cj26b:       { id: 138, name: "2026春节-马头琴", thumb: "https://i0.hdslb.com/bfs/splash/2b54217db12c31286670b01b07a70884e216eadb.webp" },
  cj26c:       { id: 139, name: "2026春节-马球", thumb: "https://i0.hdslb.com/bfs/splash/122a2d818d6da6e93316178e862f68c2d8ed41ff.webp" },
  labor26:     { id: 140, name: "2026五一",     thumb: "https://i0.hdslb.com/bfs/splash/3724bd9467f0199d025843bc21503a99f3977a51.webp" },
  gaokao26:    { id: 141, name: "2026高考",     thumb: "https://i0.hdslb.com/bfs/splash/e1734de117c20bf2145f1c5d2d1d49ee65ba4bfe.webp" },
  duanwu26:    { id: 142, name: "2026端午",     thumb: "https://i0.hdslb.com/bfs/splash/53ec7e17b88da0cd717c21bd8708daeafaeea489.webp" },
  midautumn26: { id: 144, name: "2026中秋",     thumb: "https://i0.hdslb.com/bfs/splash/adbe8e54e5e3d1ab45f7bf3d1777f7522f9ea748.webp" }
};

const sel = A.festival;
const url = $request.url;

try {
  const j = JSON.parse($response.body);
  if (!j.data) j.data = {};
  const now = Math.floor(Date.now() / 1000);

  if (sel === "block") {
    j.data.show = [];
    $done({ body: JSON.stringify(j) });
  } else if (url.includes("brand/list")) {
    // brand/list: 注入 list 条目 + show 排期
    if (HISTORICAL[sel]) {
      const h = HISTORICAL[sel];
      const listItem = {
        id: h.id,
        thumb: h.thumb,
        logo_url: LOGO,
        mode: "full",
        thumb_name: h.name,
        source: "brand",
        show_logo: true
      };
      if (!j.data.list) j.data.list = [];
      if (!j.data.list.some(x => x.id === h.id)) j.data.list.push(listItem);
    }
    const id = HISTORICAL[sel] ? HISTORICAL[sel].id : (CURRENT[sel] || CURRENT.midautumn);
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
  } else if (url.includes("splash/show")) {
    // splash/show: 注入完整 show 数组
    const id = HISTORICAL[sel] ? HISTORICAL[sel].id : (CURRENT[sel] || CURRENT.midautumn);
    const thumb = HISTORICAL[sel] ? HISTORICAL[sel].thumb : LOGO;
    const name = HISTORICAL[sel] ? HISTORICAL[sel].name : "品牌皮肤";
    j.data.show = [{
      id: id,
      thumb: thumb,
      logo_url: LOGO,
      thumb_name: name,
      source: "brand",
      show_logo: true,
      is_ad: false,
      is_ad_loc: false,
      type: 2,
      card_type: 39,
      duration: 5,
      skip: true
    }];
    $done({ body: JSON.stringify(j) });
  } else {
    $done({});
  }
} catch (e) {
  $done({});
}
// v6: dual injection (brand/list + splash/show)
