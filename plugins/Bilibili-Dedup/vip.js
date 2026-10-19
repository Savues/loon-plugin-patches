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
// 头像角标（v7.33 定案）：角标是 avatar 新协议的 ICON_LAYER 图层（见下方
// addBadgeLayers 注释），**与 vip 字段/label/主题完全无关** —— 牌子由上面的
// label 字段驱动，角标由图层驱动，两者独立。v7.27~7.32 在 vip 数据侧的所有
// 实验（label 整段复刻、avatar_subscript、清认证、abserver 实验注入）已全部
// 证伪并移除。
const BADGE = on(A.vipAvatarBadge);
// 角标图标（ICON_LAYER 的 local 资源 id）——2026-10-20 用户真机实测确认：
//   1=大会员"大"字  2=小会员"小"字  3=认证+会员闪电  4=企业/机构认证  5=数字藏品标识
//   6 仍未验证（下一个愚人节对照真实小会员的空间页响应可继续排查）
const BADGE_ICONS = { "大会员": 1, "小会员": 2, "认证闪电": 3, "企业认证": 4, "数字藏品": 5, "测试·local6": 6 };
// 动态数字藏品标识（HAR 412：蒔花再開 = 数字藏品头像 + 年大会员，7 层）：
// GIF 动画层（res_type:4）+ 自己的白底圈，与会员图标并存。层参数逐字段抄自实测。
const BADGE_BG = (x, y) => ({ visible: true,
  general_spec: { pos_spec: { coordinate_pos: 1, axis_x: x, axis_y: y },
                  size_spec: { width: 0.275, height: 0.275 }, render_spec: { opacity: 1 } },
  layer_config: { tags: { ICON_LAYER: {} } },
  resource: { res_type: 5,
    res_native_draw: { draw_src: { src_type: 3,
      draw: { draw_type: 1, fill_mode: 1,
        color_config: { is_dark_mode_aware: true,
          day: { argb: "#FFFFFFFF" }, night: { argb: "#FF17181A" } } } } } } });
const BADGE_LOCAL = (id) => ({ visible: true,
  general_spec: { pos_spec: { coordinate_pos: 1, axis_x: 1, axis_y: 1 },
                  size_spec: { width: 0.25, height: 0.25 }, render_spec: { opacity: 1 } },
  layer_config: { tags: { ICON_LAYER: {} } },
  resource: { res_type: 3,
    res_image: { image_src: { src_type: 2, local: id } } } });
// 数字藏品 GIF 层。⚠ 坐标系：HAR 412/413 的藏品用户全是 1.65/1.8 大容器（带挂件
// PENDENT_LAYER 或大头像层），照抄其坐标在普通 1.35/1.5 容器上会错位（v7.36 实测）。
// 换算规律（HAR 413 实证）：角标中心距头像右下角恒定偏移，普通头像(1.05/pos0.75，
// 右下=1.275)时 = Celestial 已验证坐标：单藏品 GIF 占右下角标准位（飞天螺旋小肥羊
// 结构）；双标识 GIF 相对会员图标左移 0.25（蒔花再開/シンフォギア同款并排）。
// GIF 资源有两个系列（实测主色）：j8AeXAkEul=粉紫标准款、IOHoVs1ebP=深紫款。
const NFT_URL_PINK = "https://i0.hdslb.com/bfs/activity-plat/static/20220506/334553dd7c506a92b88eaf4d59ac8b4d/j8AeXAkEul.gif";
const NFT_URL_PURPLE = "https://i0.hdslb.com/bfs/activity-plat/static/20220506/334553dd7c506a92b88eaf4d59ac8b4d/IOHoVs1ebP.gif";
const nftGif = (url, x, y) => ({ visible: true,
  general_spec: { pos_spec: { coordinate_pos: 1, axis_x: x, axis_y: y },
                  size_spec: { width: 0.25, height: 0.25 }, render_spec: { opacity: 1 } },
  layer_config: { tags: { ICON_LAYER: {} } },
  resource: { res_type: 4,
    res_animation: { webp_src: { src_type: 1, placeholder: 5,
      remote: { url: url, bfs_style: "widget-layer-avatar" } } } } });
const NFT_BG_LEFT = BADGE_BG(0.725, 0.975);

// 按选择生成要追加的角标图层数组
function badgeLayersFor(choice) {
  if (choice === "数字藏品·动态") { return [ICON_LAYERS[0], nftGif(NFT_URL_PINK, 1, 1)]; }
  if (choice === "数字藏品·紫动态") { return [ICON_LAYERS[0], nftGif(NFT_URL_PURPLE, 1, 1)]; }
  if (choice === "大会员+藏品动态") { return [ICON_LAYERS[0], BADGE_LOCAL(1), NFT_BG_LEFT, nftGif(NFT_URL_PINK, 0.75, 1)]; }
  return [ICON_LAYERS[0], BADGE_LOCAL(BADGE_ICONS[choice] || 1)];
}

// 牌子配色覆盖（v7.29 发现的机制，v7.34 清理时曾随角标实验一起移除）：
// 客户端牌子渲染按 label.label_theme 查本地主题表（BFCVipThemeConfig），
// 表里的配色**覆盖** label 自带的 bg_color/text_color。开启后强制
// label_theme="annual_vip"（主题表必命中）→ 任意主题的牌子都变粉色年度款。
// 不开则 label_theme 跟随 vipTheme 选择（绿鲤鱼不在表里 → 用 label 自带绿色）。
const PINK_LABEL = on(A.vipLabelAnnual);

function label(v) {
  return Object.assign({}, (v && v.label) || {}, {
    path: "", text: text, label_theme: PINK_LABEL ? "annual_vip" : KEY,
    text_color: fg, bg_style: 1, bg_color: bg, border_color: "", image: img
  });
}



// ★ 头像角标的真正机制（HAR 410 铁证，2026-10-19 定案）：
// iPad 走新头像视图（BBAvatarView，Swift），它**不读 vip 字段**，角标是
// avatar 新协议（data.avatar / 空间页 data.card.avatar）里 fallback_layers.layers
// 的两个 ICON_LAYER 图层：① 白底圆（res_type 5 native_draw，右下角 0.3 尺寸）
// ② 本地图标（res_type 3，src_type 2 local：1=大会员"大"字、3=认证+会员闪电）。
// HAR 实证：真会员空间页 4 层（2×AVATAR_LAYER+2×ICON_LAYER），非会员只有 2 层。
// v7.27~7.32 改 vip 字段全无效就是因为新视图根本不看它；以下模板逐字段抄自
// 纯年度大会员（Celestial紗雪）的实测响应。
const ICON_LAYERS = [
  { visible: true,
    general_spec: { pos_spec: { coordinate_pos: 1, axis_x: 0.975, axis_y: 0.975 },
                    size_spec: { width: 0.3, height: 0.3 },
                    render_spec: { opacity: 1 } },
    layer_config: { tags: { ICON_LAYER: {} } },
    resource: { res_type: 5,
      res_native_draw: { draw_src: { src_type: 3,
        draw: { draw_type: 1, fill_mode: 1,
          color_config: { is_dark_mode_aware: true,
            day: { argb: "#FFFFFFFF" }, night: { argb: "#FF17181A" } } } } } } }
];

// 给 avatar 新协议对象追加角标图层。真会员响应已带 ICON_LAYER → 不动（返回 false）。
function addBadgeLayers(av) {
  if (!av || !av.fallback_layers || !Array.isArray(av.fallback_layers.layers)) { return false; }
  const ls = av.fallback_layers.layers;
  const has = ls.some((l) => l && l.layer_config && l.layer_config.tags && "ICON_LAYER" in l.layer_config.tags);
  if (has) { return false; }
  ls.push.apply(ls, badgeLayersFor(A.vipBadgeIcon));
  return true;
}


// 「我的」页 schema。x/v2/account/* 与专栏页（/x/v2/space/article 的 item[].author）共用这一套。
// （v7.31 的 avatar_subscript 补写已随 ICON_LAYER 定案移除——新视图不读该字段。）
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
  // 已是真实会员：不碰（角标图层服务端已下发，牌子是真实数据）
  const isReal = v && v.vipStatus === 1;
  if (isReal) { return false; }

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

    // 开了头像角标 → 追加 ICON_LAYER 图层（新视图渲染，与 vip/认证字段无关）
    if (BADGE) {
      addBadgeLayers(card.avatar);          // 空间页头像新协议：card.avatar
      if (d.avatar) { addBadgeLayers(d.avatar); }
    }

    // 彩蛋：伪装「已认证」标识。注意**不写 icon**——抓包实证 App 从不请求
    // official_verify.icon，角标是本地按状态渲染的内置图标，改 JSON 改不动。
    // type/title/splice_title 仍有效：认证文字会显示，只是头像角标不会出现。
    // v7.34 起与头像角标解除互斥（角标走图层，与 official_verify 无关）。
    if (on(A.vipFakeVerify)) {
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
      if (BADGE) {
        addBadgeLayers(d.avatar);              // 我的页头像新协议：data.avatar
      }
      changed = true;
    }
    // 真实会员（status==1）不碰：角标图层服务端已下发，牌子是真实数据
  }
  $done(changed ? { body: JSON.stringify(j) } : {});
} catch (e) {
  $done({});
}
