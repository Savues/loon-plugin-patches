/*
 * 本地会员伪装（B 站）——「我的」页 + 个人资料页，同一个脚本。
 *
 * 两个端点两套字段名：
 *   x/v2/account/(myinfo|mine)  data.vip = { type, status, due_date, role, label }
 *   x/v2/space                  data.vip = { vipType, vipStatus, vipDueDate, ... }
 *   x/v2/space/article          data.item[].author.vip = **「我的」页那套**（status/label/due_date）
 *
 * 曾覆盖 grpc 的 View/View 与 Reply/MainList，已移除：5 份抓包 22 个样本，
 * 这两个端点的响应里**一个 vip 字段都没有**，规则纯属白跑一次 JSON.parse。
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
// ⚠️ Loon 的 switch 关掉时可能传字符串 "false"/"0"，它们在 JS 里都是真值。
// 所有开关一律走这个判断，别用 !! 或裸真值。两处历史上都栽过（全员生效 / 认证标识）。
const on = (v) => v === true || v === "true";
const ALL = on(A.vipAllUsers);

// due_date 单位：【毫秒】—— 实测 B站原生响应为 1721577600000（=2024-07-21）。
// 此前误采 zirawell 的秒级值 3818419199，与原生单位不一致。取 9999-12-30T23:59:59Z。
const DUE = 253402214399000;

const IMG = "https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Dedup/upstream/vip-assets";

// 一套主题配齐两页：文字 / role(我的页) / type(空间页) / 配色 / 牌子图。
// 牌子图统一用**纯文字版**（官方 hdslb 原图）：vip-assets 里另有一整套带图案的
// 「火车版」(cannon) 和 2023 活动带星版，体积大 5–8 倍，本插件一律不用。
// 图源与清单见 upstream/MANIFEST.json。
const THEMES = {
  vip:                          { text: "大会员",     role: 1,  type: 1, bg: "#FB7299", fg: "#FFFFFF", image: IMG + "/vip-basic-pink.png" },
  annual_vip:                   { text: "年度大会员", role: 3,  type: 2, bg: "#FB7299", fg: "#FFFFFF", image: IMG + "/vip-annual-pink.png" },
  ten_annual_vip:               { text: "十年大会员", role: 7,  type: 2, bg: "#FB7299", fg: "#FFFFFF", image: IMG + "/vip-ten-pink.png" },
  hundred_annual_vip:           { text: "百年大会员", role: 15, type: 2, bg: "#FB7299", fg: "#FFFFFF", image: IMG + "/vip-hundred-pink.png" },
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
// 头像角标（头像下方"大"字）：客户端按 label.label_theme 在本地主题表里查
// subscript.iconUrl 渲染。fools_day_hundred_annual_vip 不在表里 → 小会员无角标
// （HAR 实证：真小会员同样无角标）。开启后改用 annual_vip（真实年度大会员的
// key，主题表里必有）让角标出现。牌子文字/配色仍由上面的 label 字段决定，不受影响。
const LABEL_THEME = on(A.vipAvatarBadge) ? "annual_vip" : KEY;
// 开关本体：开启后真实会员的响应也改 label_theme（只此一处，其余真实字段不动）
const BADGE = on(A.vipAvatarBadge);
// 真年度大会员的 label 实测值（HAR 逐字段抄录）。静态分析已确认 vip 数据路径
// （isValidVip/vipTheme/themeInfoName/主题表）与真会员完全等价后角标仍不出现，
// 剩余唯一差异是这三个字段：image/label_id/label_goto。开启后整段替换做等价性测试。
const REAL_ANNUAL_LABEL = {
  path: "", text: "年度大会员", label_theme: "annual_vip",
  text_color: "#FFFFFF", bg_style: 1, bg_color: "#FB7299",
  border_color: "", image: "https://i0.hdslb.com/bfs/vip/8d4f8bfc713826a5412a0a27eaaac4d6b9ede1d9.png",
  label_id: -22, label_goto: "https://big.bilibili.com/mobile/index?navhide=1&from_spmid=vipicon"
};

function label(v) {
  if (BADGE) { return Object.assign({}, (v && v.label) || {}, REAL_ANNUAL_LABEL); }
  return Object.assign({}, (v && v.label) || {}, {
    path: "", text: text, label_theme: LABEL_THEME,
    text_color: fg, bg_style: 1, bg_color: bg, border_color: "", image: img
  });
}

// 头像角标与认证互斥（反汇编实证：updateBadgeWithUserInfo 里
// certificationType≠0 直接渲染认证角标并跳过 VIP 角标路径）。
// certificationType 由 official_verify.type 映射：-1→0(无)、0→1(个人)、1→2(机构)。
// 开了角标就要把认证清掉，否则"大"字永远不出现。
function clearCert(d) {
  if (d.official_verify) { d.official_verify = Object.assign({}, d.official_verify, { type: -1 }); }
  if (d.official) { d.official = Object.assign({}, d.official, { type: -1 }); }
}

// 「我的」页 schema。x/v2/account/* 与专栏页（/x/v2/space/article 的 item[].author）共用这一套。
function mine(v) {
  return Object.assign({}, v, {
    type: 2, status: 1, due_date: DUE, role: T.role,
    nickname_color: T.bg, label: label(v)
  });
}

// 个人资料页（顶栏 + 专栏列表）。x/v2/space 访问任何人主页都走它，故必须按 UID 限定生效范围。
function patchSpace(d) {
  // ⚠️ card 可能是数组/字符串，typeof 判定不能省
  const card = (d.card && typeof d.card === "object") ? d.card : null;
  const items = d.item || [];                    // 专栏页：data.item[].author
  const a0 = items[0] && items[0].author;
  // ⚠️ UID 来源有两处：主页在 card.mid，专栏页在 item[].author.mid，JSON 里都是**字符串**
  const who = Number(card ? card.mid : (a0 ? a0.mid : NaN));  // 取不到或非法 → NaN，永远不等于 ME/TARGET
  // 空间页判据是 vipStatus（我的页是 status，两者不通用）
  const v = d.vip;
  // 别人的主页（未点名）/ 响应异常 → 原样透传
  if (!(ALL || who === ME || who === TARGET)) { return false; }
  // 已是真实会员：默认不动；开了头像角标 → 只换 label_theme 让角标出现
  const isReal = v && v.vipStatus === 1;
  if (isReal && !BADGE) { return false; }

  let changed = false;
  // 顶栏：只在这一步写 d.vip。专栏页响应里没有顶栏，造一个 d.vip 没有意义。
  if (card) {
    if (isReal) {
      // 真实会员 + 角标开关：label 整段换成真年度会员字段（等价性测试），
      // 到期时间/等级等真实字段全部保留。
      const lt = (cv) => label(cv);
      card.vip = Object.assign({}, card.vip || {}, { label: lt(card.vip) });
      if (d.vip) { d.vip = Object.assign({}, d.vip, { label: lt(d.vip) }); }
      changed = true;
    } else {
      const vip = Object.assign({}, v || {}, {
        vipType: T.type, vipDueDate: DUE, dueRemark: "", accessStatus: 0,
        vipStatus: 1, vipStatusWarn: "", themeType: 0, label: label(v),
        silence: 0, control: 0, end_time: 0, silence_url: "", nickname_color: T.bg
      });
      // 空间页原生 label **没有** use_img_label 字段（只有「我的」页有），
      // 不显式补 true 的话 App 可能仍按文字渲染，牌子图不生效。
      // 但开角标时按真年度会员响应复刻（其空间页无此字段），不加。
      if (!BADGE) { vip.label.use_img_label = true; }
      d.vip = vip;
      // 空间页的到期提示开关，与会员样本一致
      if (d.vip_space_label) { d.vip_space_label.show_expire = false; }
      // 关键：主页顶栏实际读 data.card.vip。抓包实证：只写 data.vip 时顶栏仍显示灰色。
      card.vip = Object.assign({}, card.vip || {}, vip);
      changed = true;
    }

    // 开了头像角标 → 清掉认证（与认证角标互斥，不清则"大"字不出现）
    if (BADGE) { clearCert(card); }

    // 彩蛋：伪装「已认证」标识。注意**不写 icon**——抓包实证 App 从不请求
    // official_verify.icon，角标是本地按状态渲染的内置图标，改 JSON 改不动。
    // type/title/splice_title 仍有效：认证文字会显示，只是头像角标不会出现。
    // 与头像角标开关互斥（认证在客户端优先级更高）。
    if (!BADGE && on(A.vipFakeVerify)) {
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
  // 空间页判定：URL 优先，取不到 $request 就认 body（「我的」页没有 data.card）
  const url = (typeof $request !== "undefined" && $request && $request.url) || "";
  const space = /\/x\/v2\/space/.test(url) || !!(d && d.card && d.card.mid != null);
  let changed = false;
  if (d) {
    if (space) {
      changed = patchSpace(d);
    } else if (d.vip && d.vip.status == 0) {   // 非会员 → 完整伪装
      d.vip = mine(d.vip);
      d.vip_type = 2;
      if (BADGE) { clearCert(d); }
      changed = true;
    } else if (d.vip && d.vip.status == 1 && BADGE) {
      // 真实会员 + 角标开关 → label 整段换成真年度会员字段（等价性测试）
      d.vip.label = label(d.vip);
      clearCert(d);
      changed = true;
    }
  }
  $done(changed ? { body: JSON.stringify(j) } : {});
} catch (e) {
  $done({});
}
