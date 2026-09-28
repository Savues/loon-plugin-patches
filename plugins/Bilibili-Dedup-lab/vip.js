/*
 * 本地会员伪装（B 站）——「我的」页 + 个人资料页，同一个脚本。
 *
 * 两个端点两套字段名：
 *   x/v2/account/(myinfo|mine)  data.vip = { type, status, due_date, role, label }
 *   x/v2/space                  data.vip = { vipType, vipStatus, vipDueDate, ... }
 *   x/v2/space/article          data.item[].author.vip = **「我的」页那套**（status/label/due_date）
 *   grpc View/View、Reply/MainList  同「我的」页
 *
 * 空间页的三个坑（均为抓包实证，改动前先读）：
 *   1) 非会员时 B 站**整个删掉** vip 字段，不是给 vipStatus:0 → 判据只能是「不存在或未开通」
 *   2) 顶栏读的是 data.card.vip，不是 data.vip → 两处都写
 *   3) UID 在 data.card.mid（不在 data.mid），且 JSON 里是**字符串** → Number() 后比
 * 另：空间页原生 label 没有 use_img_label 字段（只有「我的」页有），
 *      不显式补 true 的话 App 可能仍按文字渲染，牌子图不生效。
 *
 * 依据：用户实测双抓包对照（插件开/关各一份），详见 README。
 */
const A = $argument || {};
const ME = Number(A.myMid) || 0;             // 我的UID，留空=0
const TARGET = Number(A.vipTargetMid) || 0;   // 点名的 UID，0=不点名
const ALL = !!A.vipAllUsers;                  // 全员生效（含真会员）

// due_date 单位：【毫秒】—— 实测 B站原生响应为 1721577600000（=2024-07-21）。
// 此前误采 zirawell 的秒级值 3818419199，与原生单位不一致。取 9999-12-30T23:59:59Z。
const DUE = 253402214399000;

const IMG = "https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Dedup/upstream/vip-assets";

// 一套主题配齐两页：文字 / role(我的页) / type(空间页) / 配色 / 牌子图。
// vip-assets 下曾有 11 张图，只有这 4 张接得上，其余 7 张无引用已删。
const THEMES = {
  vip:                          { text: "大会员",     role: 1,  type: 1, bg: "#FB7299", fg: "#FFFFFF", image: IMG + "/gray-vip.png" },
  annual_vip:                   { text: "年度大会员", role: 3,  type: 2, bg: "#FB7299", fg: "#FFFFFF", image: IMG + "/annual.png" },
  ten_annual_vip:               { text: "十年大会员", role: 7,  type: 2, bg: "#FB7299", fg: "#FFFFFF", image: IMG + "/ten-cannon.png" },
  hundred_annual_vip:           { text: "百年大会员", role: 15, type: 2, bg: "#FB7299", fg: "#FFFFFF", image: IMG + "/hundred.png" },
  fools_day_hundred_annual_vip: { text: "小会员",     role: 15, type: 2, bg: "#00E07C", fg: "#000000", image: "" }
};

// label_theme 就是主题 key，单独存一份是重复。
const KEY = THEMES[A.vipTheme] ? A.vipTheme : "fools_day_hundred_annual_vip";
const T = THEMES[KEY];
// 手动填了颜色/图片/文字就覆盖主题默认值
const bg = A.vipBg || T.bg;
const fg = A.vipFg || T.fg;
const text = A.vipText || T.text;
const img = A.vipImg || T.image;

function label(v) {
  return Object.assign({}, (v && v.label) || {}, {
    path: "", text: text, label_theme: KEY,
    text_color: fg, bg_style: 1, bg_color: bg, border_color: "", image: img
  });
}

// 「我的」页 schema。x/v2/account/* 与专栏页（/x/v2/space/article 的 item[].author）共用这一套。
function mine(v) {
  return Object.assign({}, v, {
    type: 2, status: 1, due_date: DUE, role: T.role,
    nickname_color: T.bg, label: label(v)
  });
}

// 「我的」页。已开通的真实大会员不动（判据 status == 0）。
function patchMine(d) {
  if (!d.vip || d.vip.status != 0) { return false; }
  d.vip = mine(d.vip);
  d.vip_type = 2;
  return true;
}

// 个人资料页（顶栏 + 专栏列表）。x/v2/space 访问任何人主页都走它，故必须按 UID 限定生效范围。
function patchSpace(d) {
  // ⚠️ card 可能是数组/字符串，typeof 判定不能省
  const card = (d.card && typeof d.card === "object") ? d.card : null;
  const items = d.item || [];                    // 专栏页：data.item[].author
  const a0 = items[0] && items[0].author;
  // ⚠️ UID 来源有两处：主页在 card.mid，专栏页在 item[].author.mid，JSON 里都是**字符串**
  const who = Number(card ? card.mid : (a0 ? a0.mid : NaN));  // 取不到或非法 → NaN，永远不等于 ME/TARGET
  const v = d.vip;
  // 三种情况原样透传：别人的主页 / 响应异常 / 已经是会员
  if (!(ALL || who === ME || who === TARGET) || (v && v.vipStatus === 1)) { return false; }

  let changed = false;
  // 顶栏：只在这一步写 d.vip。专栏页响应里没有顶栏，造一个 d.vip 没有意义。
  if (card) {
    const vip = Object.assign({}, v || {}, {
      vipType: T.type, vipDueDate: DUE, dueRemark: "", accessStatus: 0,
      vipStatus: 1, vipStatusWarn: "", themeType: 0, label: label(v),
      silence: 0, control: 0, end_time: 0, silence_url: "", nickname_color: T.bg
    });
    // 空间页原生 label **没有** use_img_label 字段（只有「我的」页有），
    // 不显式补 true 的话 App 可能仍按文字渲染，牌子图不生效。
    vip.label.use_img_label = true;
    d.vip = vip;
    // 空间页的到期提示开关，与会员样本一致
    if (d.vip_space_label) { d.vip_space_label.show_expire = false; }
    // 关键：主页顶栏实际读 data.card.vip。抓包实证：只写 data.vip 时顶栏仍显示灰色。
    card.vip = Object.assign({}, card.vip || {}, vip);
    changed = true;

    // 彩蛋：伪装「已认证」标识。注意**不写 icon**——抓包实证 App 从不请求
    // official_verify.icon，角标是本地按状态渲染的内置图标，改 JSON 改不动。
    // type/title/splice_title 仍有效：认证文字会显示，只是头像角标不会出现。
    if (A.vipFakeVerify) {
      const t = A.vipVerifyTitle || "认证用户";
      card.official_verify = Object.assign({}, card.official_verify || {}, {
        type: 0, role: 7, title: t, desc: t,
        splice_title: A.vipVerifyTitle ? "bilibili UP主认证：" + t : ""
      });
    }
  }

  // 专栏列表：每篇文章的作者 vip 是「我的页」schema，与顶栏那套不同。
  // 不加这步 → 同一页顶栏显示伪装、专栏列表显示真实牌子/没有牌子。
  for (const it of items) {
    const a = it.author;
    if (a && a.vip && a.vip.status == 0) { a.vip = mine(a.vip); changed = true; }
  }
  return changed;
}

try {
  const j = JSON.parse($response.body);
  const d = j && j.data;
  // 空间页判定：URL 优先，取不到 $request 就认 body（我的页/grpc 没有 data.card）。
  const url = (typeof $request !== "undefined" && $request && $request.url) || "";
  const space = /\/x\/v2\/space/.test(url) || !!(d && d.card && d.card.mid != null);
  const changed = d && (space ? patchSpace(d) : patchMine(d));
  $done(changed ? { body: JSON.stringify(j) } : {});
} catch (e) {
  $done({});
}
