/*
 * splash/brand/list show 注入 —— 强制展示指定节日/活动品牌皮肤。
 * v16: 22 官方皮肤 + block + 31 历史皮肤（通过 id=13 载体 + thumb 替换）。
 *
 * 机制：客户端验证 logo_hash 与 logo_url 匹配，但不验证 thumb_hash 与 id 对应关系。
 * 用 bili11(id=13) 作载体，替换 thumb + thumb_hash 为目标皮肤的值，不修改 logo_hash。
 */
const A = $argument || {};

const FESTIVALS = {
  midautumn: 38, chongyang: 145, yuandan: 34, duanwu: 43, qixi: 47,
  halloween: 31, xmas1: 32, xmas2: 33, women: 35, labor: 41,
  bili10: 12, bili11: 13, bili12: 44, bili13: 67,
  bml2021: 45, bw2020: 10, bw2021: 46,
  "2233a": 14, "2233b": 15, "2233c": 37, "2233d": 36, slogan: 17
};

// 历史皮肤（thumb + hash，通过 id=13 载体展示）
const HISTORICAL = {  gaokao24:     { thumb: "https://i0.hdslb.com/bfs/garb/e47526bc43894fa5e1b71ffc34bf805574229cd3.webp", hash: "06373b52a74215e0f88f8fae94b84b92", name: "2024高考" },
  duanwu24:     { thumb: "https://i0.hdslb.com/bfs/garb/504019c9290bc8897a42601333537dcbd67239f5.webp", hash: "1171efbb0ba3ae5b6f25f7ce0a264864", name: "2024端午节" },
  summer24:     { thumb: "https://i0.hdslb.com/bfs/garb/71d30f1189584e056dffee5c447c60cb882e131c.webp", hash: "6e581b904d51d95b072bd766b02d19eb", name: "2024暑假快乐" },
  qixi24:       { thumb: "https://i0.hdslb.com/bfs/garb/1c32a6f74da50c7c6087c4a6a8fb7475dc6344e3.webp", hash: "4179e69ecd5473d5f1a565b31511cefb", name: "2024七夕" },
  chongyang24:  { thumb: "https://i0.hdslb.com/bfs/garb/6209fc6c4147a1c758a1d98315fe2221526195b4.webp", hash: "b8547e59805d5b5e7984fe12fb73521f", name: "2024重阳" },
  teacher24:    { thumb: "https://i0.hdslb.com/bfs/garb/6f170eef00b25a5c124dc20324d3ae9bdb05f65e.webp", hash: "7023f9d552cb6b067077124cc1877ee6", name: "2024教师节" },
  midautumn24:  { thumb: "https://i0.hdslb.com/bfs/garb/b1dd824c4fd99cb966245de78f775033961b5620.webp", hash: "29a5e53fcd95d82dec534a7e57cf6bb7", name: "2024中秋" },
  cj25a:        { thumb: "https://i0.hdslb.com/bfs/garb/aa148313ca91f579f813573847f9b4362fc5b276.webp", hash: "857a3f463c6e84001ce70a4afad2a2ff", name: "2025春节打铁花" },
  cj25b:        { thumb: "https://i0.hdslb.com/bfs/garb/66d3179f2dce9bc9a28609fd782cae2afd0b03d4.webp", hash: "ca0e859a4c496f3855ebecbf98cbba22", name: "2025春节放御灯" },
  cj25c:        { thumb: "https://i0.hdslb.com/bfs/garb/a855072e6db58d381dc5424cd8e720ea80153eae.webp", hash: "cc1810978b247b3a936ab0c1b43dc9b0", name: "2025春节滚灯球" },
  cj25d:        { thumb: "https://i0.hdslb.com/bfs/garb/2132ccc84847907952361d8a95e459967b20620d.webp", hash: "1b2fad4837c61c9eb0fa1ff6e7fe8013", name: "2025春节聚天宫" },
  cj25e:        { thumb: "https://i0.hdslb.com/bfs/garb/c77fe0a05d2bd76e8316fd4069364e83244032e7.webp", hash: "e612ca9a86b68fac55c0c6ea48a273c0", name: "2025春节跨火盆" },
  cj25f:        { thumb: "https://i0.hdslb.com/bfs/garb/9a476f9a9f93cadd7174b6387adf49bface922dc.webp", hash: "1370b2582666702122da8f0d270d59b1", name: "2025春节舞龙狮" },
  yx25:         { thumb: "https://i0.hdslb.com/bfs/garb/a6c9ab07642d011f007ef28ad6b5cbcb88279b33.webp", hash: "40c26685a58a38aff0ebbf6bef1e2d45", name: "2025元宵节" },
  women25:      { thumb: "https://i0.hdslb.com/bfs/garb/04adbc664ebf337d1c4154073ea805bc5342d913.webp", hash: "f421406781ef5381cf064a8f7327ed0c", name: "2025妇女节" },
  qm25:         { thumb: "https://i0.hdslb.com/bfs/garb/234b235623814db9f53991ce8e95bfd6285eb830.webp", hash: "fea844b6fdd04227e1c851133ca5e87f", name: "2025清明" },
  labor25:      { thumb: "https://i0.hdslb.com/bfs/garb/3382e7a419b38b9b723cbfc44158c00df0f92b54.webp", hash: "bdb46b92e93d83f0cf35216b58376222", name: "2025劳动节" },
  labor25b:     { thumb: "https://i0.hdslb.com/bfs/garb/3382e7a419b38b9b723cbfc44158c00df0f92b54.webp", hash: "bdb46b92e93d83f0cf35216b58376222", name: "2025国际劳动节" },
  duanwu25:     { thumb: "https://i0.hdslb.com/bfs/splash/552d938598abcfda3077a539aa8bc483bddf8bda.webp", hash: "88835b4eb793752efb675cd8f6ebbee1", name: "2025端午" },
  gaokao25:     { thumb: "https://i0.hdslb.com/bfs/splash/23a49a76dc3e6cc9b26e0956596b3f6185608e29.webp", hash: "38d43e9fb2a9ed0c45577e2f409f7fe9", name: "2025高考" },
  summer25:     { thumb: "https://i0.hdslb.com/bfs/splash/8b086942e5fe42ca5eedee851aeeb47af72aa706.webp", hash: "4f67c1db88ff3587e1dd27bcc66edc0b", name: "2025暑假过半" },
  qixi25:       { thumb: "https://i0.hdslb.com/bfs/splash/951a62f737456ee33c16d126533eef845fbea1a7.webp", hash: "0a0ad5e8ce1d5e1a285b0ef45dd2de62", name: "2025七夕" },
  teacher25:    { thumb: "https://i0.hdslb.com/bfs/splash/d4ac4f58a94e995de548bd10d32416bc8b583541.webp", hash: "d20f0d77beef9d2cdb76d34fcfd83278", name: "2025教师节" },
  midautumn25:  { thumb: "https://i0.hdslb.com/bfs/splash/598aba964bb752198fda1114cb0b2edb9c1f6137.webp", hash: "c8e2a702b75e94b950ccd6d0fce20786", name: "2025中秋" },
  cj26a:        { thumb: "https://i0.hdslb.com/bfs/splash/c9f2932ed8bbe7ea3b37c08f8a449bfe4e94cca7.webp", hash: "ef6ad7e3c1ee0096bb623e7484047607", name: "2026春节-马灯笼" },
  cj26b:        { thumb: "https://i0.hdslb.com/bfs/splash/2b54217db12c31286670b01b07a70884e216eadb.webp", hash: "d49fc2fa45168270b55503b63c1cf9a0", name: "2026春节-马头琴" },
  cj26c:        { thumb: "https://i0.hdslb.com/bfs/splash/122a2d818d6da6e93316178e862f68c2d8ed41ff.webp", hash: "f636046db3b071d361942f8ffe061d4e", name: "2026春节-马球" },
  labor26:      { thumb: "https://i0.hdslb.com/bfs/splash/3724bd9467f0199d025843bc21503a99f3977a51.webp", hash: "e0420bfbbd985676b27b34845b799010", name: "2026五一" },
  gaokao26:     { thumb: "https://i0.hdslb.com/bfs/splash/e1734de117c20bf2145f1c5d2d1d49ee65ba4bfe.webp", hash: "2be857ce37c936dd06f29fced8170f72", name: "2026高考" },
  duanwu26:     { thumb: "https://i0.hdslb.com/bfs/splash/53ec7e17b88da0cd717c21bd8708daeafaeea489.webp", hash: "40ab7d24b2c7dec4594d03abe15a4628", name: "2026端午" },
  midautumn26:  { thumb: "https://i0.hdslb.com/bfs/splash/adbe8e54e5e3d1ab45f7bf3d1777f7522f9ea748.webp", hash: "cf3e9c439759651738948304d24b452a", name: "2026中秋" }
};

// 官方皮肤仓库图：图存 git 仓库，注入时替换 list 中该 id 的 thumb/thumb_hash，
// 客户端校验 thumb_hash 与素材 MD5（与历史皮肤同机制），避免官方换图影响展示。
const IMG_BASE = "https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Splash-Festival/images/";
const VENDORED = {
  // —— full 模式：横竖两套，按客户端设备选择（pad=iPad横图 / phone=手机竖图）——
  31: { pad: { file: "31_pad.jpg", hash: "3bdae29ad7994deecf3f52a376ad5a83", name: "万圣节" }, phone: { file: "31_phone.jpg", hash: "ee35af7edb80487d4f2b71f558fc0b4e", name: "万圣节" } },
  32: { pad: { file: "32_pad.jpg", hash: "ada0d9b118f24d66d17732473feeee56", name: "圣诞节1.0" }, phone: { file: "32_phone.jpg", hash: "c996585b6ba34e6dbeeaf83c1480195f", name: "圣诞节1.0" } },
  33: { pad: { file: "33_pad.jpg", hash: "c86dee0c8abc5019751f08700a42fab7", name: "圣诞节2.0" }, phone: { file: "33_phone.jpg", hash: "a2bb72f23cf3fea04759f8dc21bd6e52", name: "圣诞节2.0" } },
  34: { pad: { file: "34_pad.webp", hash: "236a8a857b460dff58b1e52b24dd1e4e", name: "元旦" }, phone: { file: "34_phone.webp", hash: "6c324acd0b1f66113e6c28042d4af4a3", name: "元旦" } },
  35: { pad: { file: "35_pad.jpg", hash: "f74525240fbf9fec5fc4ea2038e66038", name: "妇女节" }, phone: { file: "35_phone.jpg", hash: "1602207bedd8a18ee7cfc434c75b1c0c", name: "妇女节" } },
  38: { pad: { file: "38_pad.webp", hash: "9aeaed47d0958cf733cab7a51e554f2f", name: "中秋节" }, phone: { file: "38_phone.webp", hash: "f0546d18602c6470775c53ca6d436c11", name: "中秋节" } },
  41: { pad: { file: "41_pad.webp", hash: "266bfecb806f5e5e504294eebba198e8", name: "劳动节" }, phone: { file: "41_phone.webp", hash: "4e82972c6a6fd1911d3f10186b433564", name: "劳动节" } },
  43: { pad: { file: "43_pad.webp", hash: "36c71c1fa6c6a1174b7f4fc6724ba885", name: "端午节" }, phone: { file: "43_phone.webp", hash: "95325e637a7133ec20862a1d99c6b131", name: "端午节" } },
  44: { pad: { file: "44_pad.webp", hash: "a6c56481e46cad7e5b67ddc8a1c6c591", name: "Bilibili 12周年" }, phone: { file: "44_phone.webp", hash: "efabc3ef08ca8ce7572158824b7f75ed", name: "Bilibili 12周年" } },
  45: { pad: { file: "45_pad.jpg", hash: "5ecdedae29d94eeea81bd1654743a19e", name: "BML 2021" }, phone: { file: "45_phone.jpg", hash: "55064c7f22f504d29d1b2532bc46af7d", name: "BML 2021" } },
  46: { pad: { file: "46_pad.webp", hash: "57a7daa31bf37d65f9bc020d0c076ef8", name: "BW 2021" }, phone: { file: "46_phone.webp", hash: "59d93e6d24d73d301da19cbc133284bd", name: "BW 2021" } },
  47: { pad: { file: "47_pad.webp", hash: "d86e16b7ef0c273b0fced28f75fbc9e6", name: "七夕节" }, phone: { file: "47_phone.webp", hash: "da609374db2f4147d6738a5254fd882c", name: "七夕节" } },
  67: { pad: { file: "67_pad.webp", hash: "1e61a591ad1371331c425cf56747f684", name: "Bilibili 13周年" }, phone: { file: "67_phone.webp", hash: "21e2f845a5971eb97c817e00ab22ffdf", name: "Bilibili 13周年" } },
  145: { pad: { file: "145_pad.webp", hash: "b79e163fc7a19b71b8837e40041634b1", name: "2026重阳节" }, phone: { file: "145_phone.webp", hash: "9f62d30b87649778886af61675d90b4e", name: "2026重阳节" } },
  // —— half 模式：单套（iPad/手机两端相同）——
  10: { file: "10.png", hash: "af0b0486e1ee0b14e87c6d32cabcea5f", name: "BW 2020" },
  12: { file: "12.png", hash: "31f7f9a78cfec6710a62a6c1fc119edd", name: "Bilibili 10周年" },
  13: { file: "13.webp", hash: "4f67c1db88ff3587e1dd27bcc66edc0b", name: "2025暑假过半" },
  14: { file: "14.png", hash: "de1877c33dfef853af867b01c4926d7f", name: "2233 款式一" },
  15: { file: "15.png", hash: "c80b0c119116898265e2a146ec1cbd59", name: "2233 款式二" },
  17: { file: "17.png", hash: "543eedd93eced4ee4f31509212d911d8", name: "slogan" },
  36: { file: "36.webp", hash: "998c00adde03c12eea04352ca0dd2a8f", name: "2233 款式四" },
  37: { file: "37.webp", hash: "f2d92ab314664181eed36e4e3aaea1f3", name: "2233 款式三" }
};

// 判断客户端是否为 iPad（复刻服务器按设备下发横竖两版图的逻辑）
function __isPad() {
  var u = '';
  try { u = ($request && $request.url) || ''; } catch (e) {}
  if (/device=pad|mobi_app=ipad|appkey=5fd5a7d8bfd9b0e6/i.test(u)) return true;
  var h = ($request && $request.headers) || {};
  var ua = h['User-Agent'] || h['user-agent'] || '';
  return /iPad/i.test(ua);
}

const sel = A.festival;
try {
  const j = JSON.parse($response.body);
  if (!j.data) j.data = {};
  if (!Array.isArray(j.data.list)) j.data.list = [];
  const now = Math.floor(Date.now() / 1000);

  if (sel === "block") {
    j.data.show = [];
    $done({ body: JSON.stringify(j) });
  } else if (HISTORICAL[sel]) {
    // 历史皮肤：用 bili11(id=13) 作载体，替换 thumb + thumb_hash，不修改 logo_hash
    const carrierId = FESTIVALS.bili11;
    const target = HISTORICAL[sel];
    const item = j.data.list.find(x => x.id === carrierId);
    if (item) {
      item.thumb = target.thumb;
      item.thumb_name = target.name;
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
    // 官方皮肤：注入 show 排期；已仓库化的皮肤同时替换 list 中该 id 的 thumb
    // full 模式皮肤按设备选横竖版（iPad=横图 / 手机=竖图），half 模式单套
    const id = FESTIVALS[sel] || FESTIVALS.midautumn;
    const vend = VENDORED[id];
    if (vend) {
      const pick = (vend.pad && vend.phone) ? (__isPad() ? vend.pad : vend.phone) : vend;
      const item = j.data.list.find(x => x.id === id);
      if (item) {
        item.thumb = IMG_BASE + pick.file;
        item.thumb_name = pick.name;
        item.thumb_hash = pick.hash;
      }
    }
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
// v16: 22 skins + block + 31 historical skins via thumb replacement
