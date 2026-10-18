/*
 * splash/brand/list show 注入 —— 强制展示指定节日/活动品牌皮肤。
 * v16: 22 官方皮肤 + block + 31 历史皮肤（通过 id=13 载体 + thumb 替换）。
 *
 * 机制：客户端验证 logo_hash 与 logo_url 匹配，但不验证 thumb_hash 与 id 对应关系。
 * 用 bili11(id=13) 作载体，替换 thumb + thumb_hash 为目标皮肤的值，不修改 logo_hash。
 */
var A = $argument || {};

// 中文标签 → 英文键名映射（[Argument] select 不支持 label=value 语法，
// 界面显示中文标签，脚本内部用英文键名查找）
// 注意：必须定义在文件顶部——下方 var sel 会立即读取它，放在文件中部会触发 TDZ。
const CN_TO_KEY = {
  "中秋节": "midautumn", "重阳节": "chongyang", "元旦": "yuandan",
  "端午节": "duanwu", "七夕节": "qixi", "万圣节": "halloween",
  "圣诞节1.0": "xmas1", "圣诞节2.0": "xmas2", "妇女节": "women",
  "劳动节": "labor", "10周年": "bili10", "11周年": "bili11",
  "12周年": "bili12", "13周年": "bili13", "BML 2021": "bml2021",
  "BW 2020": "bw2020", "BW 2021": "bw2021",
  "2233款式一": "2233a", "2233款式二": "2233b", "2233款式三": "2233c", "2233款式四": "2233d",
  "Slogan": "slogan", "屏蔽开屏": "block",
  // —— 2023 年新增 ——
  "2023端午节": "duanwu23", "2023暑假过半": "summer23",
  "2023七夕节": "qixi23a", "2023七夕款式二": "qixi23b", "2023七夕款式三": "qixi23c",
  "2023七夕款式四": "qixi23d", "2023七夕款式五": "qixi23e", "2023七夕款式六": "qixi23f",
  "2023开学季": "school23", "2023中秋节": "midautumn23",
  "2023万圣节款式一": "halloween23a", "2023万圣节款式二": "halloween23b",
  "2023跨年": "yuandan23",
  // —— 2024 年新增 ——
  "2024春节-款式一": "cj24a", "2024春节-款式二": "cj24b", "2024春节-款式三": "cj24c",
  "2024春节-款式四": "cj24d", "2024春节-款式五": "cj24e", "2024春节-款式六": "cj24f",
  "2024元宵节": "yx24", "2024妇女节": "women24", "2024清明": "qm24", "2024劳动节": "labor24",
  // —— 2024 下半年（已有）——
  "2024高考": "gaokao24", "2024端午节": "duanwu24", "2024暑假快乐": "summer24",
  "2024七夕节": "qixi24", "2024重阳节": "chongyang24", "2024教师节": "teacher24",
  "2024中秋节": "midautumn24",
  // —— 2025 年（已有）——
  "2025春节-打铁花": "cj25a", "2025春节-放御灯": "cj25b", "2025春节-滚灯球": "cj25c",
  "2025春节-聚天宫": "cj25d", "2025春节-跨火盆": "cj25e", "2025春节-舞龙狮": "cj25f",
  "2025元宵节": "yx25", "2025妇女节": "women25", "2025清明": "qm25",
  "2025劳动节": "labor25",
  // 「2025国际劳动节」已从选项中移除（与「2025劳动节」同一张图）；
  // 保留此映射，让老配置里存着该值时仍显示劳动节图，而不是落到兜底。
  "2025国际劳动节": "labor25",
  "2025端午节": "duanwu25",
  "2025高考": "gaokao25", "2025暑假过半": "summer25", "2025七夕节": "qixi25",
  "2025教师节": "teacher25", "2025中秋节": "midautumn25",
  // —— 2026 年（已有）——
  "2026春节-马灯笼": "cj26a", "2026春节-马头琴": "cj26b", "2026春节-马球": "cj26c",
  "2026五一": "labor26", "2026高考": "gaokao26", "2026端午节": "duanwu26", "2026中秋节": "midautumn26"
};

// 把 [Argument] 传来的值规范化成内部英文键名。
// 兼容三种历史格式：
//   v31+ 中文标签（"2026五一"）      → 查 CN_TO_KEY
//   v30   "标签=key"（"官方-中秋节=midautumn"）→ 取 = 后半段
//   v29   "官方_key"（"官方_midautumn"）      → 去前缀
// 已移除选项的残留值别名（老配置兼容，指向仍在的条目）
const ALIAS_KEY = { labor25b: "labor25" };

function normalizeFestival(v) {
  if (!v) return v;
  if (CN_TO_KEY[v]) return CN_TO_KEY[v];
  var k = v;
  if (v.indexOf("=") >= 0) k = v.split("=").pop();
  else if (v.indexOf("官方_") === 0) k = v.slice(3);
  return ALIAS_KEY[k] || k;
}

var MODE_SEL = A.splashMode || "official";  // official=官方设定 / full=强制铺满 / half=强制缩放完整
var IMG_MODE = A.imgMode || "auto";         // auto=按设备 / landscape=横图 / portrait=竖图
var sel = normalizeFestival(A.festival);

const FESTIVALS = {
  midautumn: 38, chongyang: 145, yuandan: 34, duanwu: 43, qixi: 47,
  halloween: 31, xmas1: 32, xmas2: 33, women: 35, labor: 41,
  bili10: 12, bili11: 13, bili12: 44, bili13: 67,
  bml2021: 45, bw2020: 10, bw2021: 46,
  "2233a": 14, "2233b": 15, "2233c": 37, "2233d": 36, slogan: 17
};

// 历史皮肤（thumb + hash，通过 id=13 载体展示）
// 54 个历史皮肤全部已入库 images/，注入时替换为仓库 URL（免疫官方链接失效）
var HISTORICAL_VENDORED = {
  // —— 2023 年新增（zjkwdy/bili_app_splash 归档）——
  duanwu23:     { file: "duanwu23.webp", hash: "d8ee2240ca2ba43a81046a534a03edfd", name: "2023端午节" },
  summer23:     { file: "summer23.webp", hash: "572aedf353574767079246c2871a2dfe", name: "2023暑假过半" },
  qixi23a:      { file: "qixi23a.webp", hash: "d4d6cdc28ecc64190064639a85c2f12f", name: "2023七夕节" },
  qixi23b:      { file: "qixi23b.webp", hash: "efa6968a50e5b6c2590298bb542a46f7", name: "2023七夕款式二" },
  qixi23c:      { file: "qixi23c.webp", hash: "3a6e47d71621b5e45dfdcf65239e7ad7", name: "2023七夕款式三" },
  qixi23d:      { file: "qixi23d.webp", hash: "e48e85aa05de072f22915c5182c77fc6", name: "2023七夕款式四" },
  qixi23e:      { file: "qixi23e.webp", hash: "7a310283902b2edf336f7c6e44c1f186", name: "2023七夕款式五" },
  qixi23f:      { file: "qixi23f.webp", hash: "78cb7eeacfeef2012882f857a715462d", name: "2023七夕款式六" },
  school23:     { file: "school23.webp", hash: "67f7fc954bc8bde77ed15027fac1cee3", name: "2023开学季" },
  midautumn23:  { file: "midautumn23.webp", hash: "0113a51f88927fe66b516254a7f4f896", name: "2023中秋节" },
  halloween23a: { file: "halloween23a.webp", hash: "fed922d0850cd809e3b23f27e1fc36ee", name: "2023万圣节款式一" },
  halloween23b: { file: "halloween23b.webp", hash: "511f6ecc421298d553c35317d01a3fbd", name: "2023万圣节款式二" },
  yuandan23:    { file: "yuandan23.webp", hash: "a0d4161bc9e3e1b6d40427b021d487a4", name: "2023跨年" },
  // —— 2024 年新增 ——
  cj24a:        { file: "cj24a.webp", hash: "1e897dcd5932001bdf94d3a4030dbe50", name: "2024春节-款式一" },
  cj24b:        { file: "cj24b.webp", hash: "cc8a187db60fb57361d034a9ccac52ac", name: "2024春节-款式二" },
  cj24c:        { file: "cj24c.webp", hash: "5e6fc01ae5417f3b176077ecb8166b4a", name: "2024春节-款式三" },
  cj24d:        { file: "cj24d.webp", hash: "35d191cf4917ebed27b5e4488c6b8369", name: "2024春节-款式四" },
  cj24e:        { file: "cj24e.webp", hash: "cc8a187db60fb57361d034a9ccac52ac", name: "2024春节-款式五" },
  cj24f:        { file: "cj24f.webp", hash: "35d191cf4917ebed27b5e4488c6b8369", name: "2024春节-款式六" },
  yx24:         { file: "yx24.webp", hash: "9e201791544d9edf2cf9cb5129d6b7bd", name: "2024元宵节" },
  women24:      { file: "women24.webp", hash: "01c5215b60e6f9fd7311b0b215a2e94d", name: "2024妇女节" },
  qm24:         { file: "qm24.webp", hash: "fdba5d96b9d28d8566e86074974a6db1", name: "2024清明" },
  labor24:      { file: "labor24.webp", hash: "0a5d0e69963ac31ec533ada53b430f2a", name: "2024劳动节" },
  // —— 2024 下半年（已有）——
  gaokao24:     { file: "gaokao24.webp", hash: "06373b52a74215e0f88f8fae94b84b92", name: "2024高考" },
  duanwu24:     { file: "duanwu24.webp", hash: "1171efbb0ba3ae5b6f25f7ce0a264864", name: "2024端午节" },
  summer24:     { file: "summer24.webp", hash: "6e581b904d51d95b072bd766b02d19eb", name: "2024暑假快乐" },
  qixi24:       { file: "qixi24.webp", hash: "4179e69ecd5473d5f1a565b31511cefb", name: "2024七夕" },
  chongyang24:  { file: "chongyang24.webp", hash: "b8547e59805d5b5e7984fe12fb73521f", name: "2024重阳" },
  teacher24:    { file: "teacher24.webp", hash: "7023f9d552cb6b067077124cc1877ee6", name: "2024教师节" },
  midautumn24:  { file: "midautumn24.webp", hash: "29a5e53fcd95d82dec534a7e57cf6bb7", name: "2024中秋" },
  cj25a:        { file: "cj25a.webp", hash: "857a3f463c6e84001ce70a4afad2a2ff", name: "2025春节打铁花" },
  cj25b:        { file: "cj25b.webp", hash: "ca0e859a4c496f3855ebecbf98cbba22", name: "2025春节放御灯" },
  cj25c:        { file: "cj25c.webp", hash: "cc1810978b247b3a936ab0c1b43dc9b0", name: "2025春节滚灯球" },
  cj25d:        { file: "cj25d.webp", hash: "1b2fad4837c61c9eb0fa1ff6e7fe8013", name: "2025春节聚天宫" },
  cj25e:        { file: "cj25e.webp", hash: "e612ca9a86b68fac55c0c6ea48a273c0", name: "2025春节跨火盆" },
  cj25f:        { file: "cj25f.webp", hash: "1370b2582666702122da8f0d270d59b1", name: "2025春节舞龙狮" },
  yx25:         { file: "yx25.webp", hash: "40c26685a58a38aff0ebbf6bef1e2d45", name: "2025元宵节" },
  women25:      { file: "women25.webp", hash: "f421406781ef5381cf064a8f7327ed0c", name: "2025妇女节" },
  qm25:         { file: "qm25.webp", hash: "fea844b6fdd04227e1c851133ca5e87f", name: "2025清明" },
  labor25:      { file: "labor25.webp", hash: "bdb46b92e93d83f0cf35216b58376222", name: "2025劳动节" },
  duanwu25:     { file: "duanwu25.webp", hash: "88835b4eb793752efb675cd8f6ebbee1", name: "2025端午" },
  gaokao25:     { file: "gaokao25.webp", hash: "38d43e9fb2a9ed0c45577e2f409f7fe9", name: "2025高考" },
  summer25:     { file: "summer25.webp", hash: "4f67c1db88ff3587e1dd27bcc66edc0b", name: "2025暑假过半" },
  qixi25:       { file: "qixi25.webp", hash: "0a0ad5e8ce1d5e1a285b0ef45dd2de62", name: "2025七夕" },
  teacher25:    { file: "teacher25.webp", hash: "d20f0d77beef9d2cdb76d34fcfd83278", name: "2025教师节" },
  midautumn25:  { file: "midautumn25.webp", hash: "c8e2a702b75e94b950ccd6d0fce20786", name: "2025中秋" },
  cj26a:        { file: "cj26a.webp", hash: "ef6ad7e3c1ee0096bb623e7484047607", name: "2026春节-马灯笼" },
  cj26b:        { file: "cj26b.webp", hash: "d49fc2fa45168270b55503b63c1cf9a0", name: "2026春节-马头琴" },
  cj26c:        { file: "cj26c.webp", hash: "f636046db3b071d361942f8ffe061d4e", name: "2026春节-马球" },
  labor26:      { file: "labor26.webp", hash: "e0420bfbbd985676b27b34845b799010", name: "2026五一" },
  gaokao26:     { file: "gaokao26.webp", hash: "2be857ce37c936dd06f29fced8170f72", name: "2026高考" },
  duanwu26:     { file: "duanwu26.webp", hash: "40ab7d24b2c7dec4594d03abe15a4628", name: "2026端午" },
  midautumn26:  { file: "midautumn26.webp", hash: "cf3e9c439759651738948304d24b452a", name: "2026中秋" }
};

// 历史皮肤键名列表（用于判断是否历史皮肤）
const HISTORICAL_KEYS = Object.keys(HISTORICAL_VENDORED);

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
  13: { file: "13.png", hash: "ad7bb6b7fd542862f093dedad32b7af3", name: "Bilibili 11周年" },
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

var sel = normalizeFestival(A.festival);
try {
  const j = JSON.parse($response.body);
  if (!j.data) j.data = {};
  if (!Array.isArray(j.data.list)) j.data.list = [];
  const now = Math.floor(Date.now() / 1000);

  if (sel === "block") {
    j.data.show = [];
    $done({ body: JSON.stringify(j) });
  } else if (Object.keys(HISTORICAL_VENDORED).includes(sel)) {
    // 历史皮肤：用 bili11(id=13) 作载体，替换 thumb + thumb_hash 为仓库图
    const carrierId = FESTIVALS.bili11;
    const target = HISTORICAL_VENDORED[sel];
    const item = j.data.list.find(x => x.id === carrierId);
    if (item) {
      item.thumb = IMG_BASE + target.file;
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
      let pick = vend;
      if (vend.pad && vend.phone) {
        if (IMG_MODE === "landscape") pick = vend.pad;
        else if (IMG_MODE === "portrait") pick = vend.phone;
        else pick = __isPad() ? vend.pad : vend.phone;  // auto
      }
      const item = j.data.list.find(x => x.id === id);
      if (item) {
        item.thumb = IMG_BASE + pick.file;
        item.thumb_name = pick.name;
        item.thumb_hash = pick.hash;
        // 显示模式：official=不动（官方设定）；full/half=强制覆盖
        if (MODE_SEL === "full" || MODE_SEL === "half") item.mode = MODE_SEL;
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
