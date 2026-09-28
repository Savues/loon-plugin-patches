/*
 * 个人资料页会员伪装（app.bilibili.com/x/v2/space）
 *
 * 与 vip-theme.js 的区别：空间页用**另一套字段名**，且非会员时
 * B 站**整个删掉** vip 字段（不是给 vipStatus:0），所以必须「不存在就造」。
 *
 * 字段依据（用户实测抓包）：
 *   会员样本 ×11  app.bilibili.com/x/v2/space
 *     vipType:2  vipStatus:1  vipDueDate:<毫秒>  themeType:0  label:{...}
 *   非会员样本 ×1  同一端点
 *     无 vip 字段，仅 vip_space_label:{show_expire:false}
 *
 * 注入用字段名取自会员样本，值取自会员样本。
 */
const A = $argument || {};

const DUE = 253402214399000;   // 9999-12-30T23:59:59Z，毫秒

// 只改自己的主页。x/v2/space 是**通用端点**，访问任何人主页都走它；
// 不加此判断会把所有用户的资料页都显示成伪装的样子。
// 取自己的 uid：个人空间页地址栏数字，或 App「我的」页 mid。
const ME = Number(A.myMid) || 0;

const IMG = "https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Dedup/upstream/vip-assets";
const THEMES = {
  vip:                          { text: "大会员",     type: 1, image: IMG + "/gray-vip.png" },
  annual_vip:                   { text: "年度大会员",  type: 2, image: IMG + "/annual.png" },
  ten_annual_vip:               { text: "十年大会员",  type: 2, image: IMG + "/ten-cannon.png" },
  hundred_annual_vip:           { text: "百年大会员",  type: 2, image: IMG + "/hundred.png" },
  fools_day_hundred_annual_vip: { text: "小会员",     type: 2, image: "" }
};

const T = THEMES[A.vipTheme] || THEMES.fools_day_hundred_annual_vip;
const bg = A.vipBg || "#00E07C";
const fg = A.vipFg || "#000000";
const text = A.vipText || T.text;
// 牌子图与 myinfo 侧共用 upstream/vip-assets/ 下同一批素材。
// 小会员（绿鲤鱼）是愚人节特制，无公开图，仍走文字渲染。

function build(v) {
  const label = Object.assign({}, (v && v.label) || {}, {
    path: "",
    text: text,
    label_theme: T === THEMES.fools_day_hundred_annual_vip
      ? "fools_day_hundred_annual_vip" : (A.vipTheme || "vip"),
    text_color: fg,
    bg_style: 1,
    bg_color: bg,
    border_color: "",
    // 与 myinfo 侧（vip-theme.js）一致：主题默认图，可被 vipImg 覆盖。
    // 空间页原生 label **没有** use_img_label 字段（只有 myinfo 侧有），
    // 不显式补 true 的话 App 可能仍按文字渲染，图片不生效。
    image: A.vipImg || T.image || "",
    use_img_label: true
  });

  // 补齐与 myinfo 侧（vip-theme.js）一致的字段集，两个页面的对象逐字段相同。
  // 只多出空间页 schema 特有的 vipType/vipStatus/vipDueDate 等字段。
  return Object.assign({}, v || {}, {
    vipType: T.type,
    vipDueDate: DUE,
    dueRemark: "",
    accessStatus: 0,
    vipStatus: 1,
    vipStatusWarn: "",
    themeType: 0,
    label: label,
    silence: 0,
    control: 0,
    end_time: 0,
    silence_url: "",
    nickname_color: bg
  });
}

try {
  const j = JSON.parse($response.body);
  const d = j && j.data;

  const v = d.vip;
  // ⚠️ 用户 ID 在 data.card.mid，**不在 data.mid**（抓包实证：
  // 6 次 x/v2/space 响应中 data.mid 全部 undefined，card.mid 才有值）。
  // 读错位置会导致判定失效，所有用户主页都被改成伪装的样子。
  const card0 = (d.card && typeof d.card === "object") ? d.card : {};
  // ⚠️ card.mid 在 JSON 里是**字符串**（实测 "14895065"），ME 是数字，
  // 严格比较会判不等 → 自己的主页反被当成别人的透传。必须转成数字比。
  const who = (card0.mid === undefined || card0.mid === null)
    ? undefined : Number(card0.mid);

  // 三种情况原样透传，绝不改写：
  //   1) 别人的主页  —— card.mid 与自己不符
  //   2) 响应异常    —— 取不到 card.mid
  //   3) 已经是会员  —— 不冒充真会员
  // 非会员时 B 站直接删掉整个 vip 字段，故「不存在」也算未开通。
  const passthrough = !d
    || who === undefined
    || who !== ME
    || (v && v.vipStatus === 1);

  if (passthrough) {
    $done({ body: $response.body });
  } else {
    d.vip = build(v);

    // 空间页的到期提示开关，与会员样本一致
    if (d.vip_space_label) { d.vip_space_label.show_expire = false; }

    // 关键：主页顶栏实际读 data.card.vip，不是 data.vip。
    // 抓包实证（非会员主页，v7.10 注入后）：
    //   data.vip -> vipStatus:1   我们写的，App 不看
    //   card.vip -> vipStatus:0   App 读这个，所以一直显示灰色
    // 两处都写：card.vip 决定顶栏，data.vip 供其他页面使用。
    if (d.card && typeof d.card === "object") {
      d.card.vip = build(d.card.vip || {});
    }

    $done({ body: JSON.stringify(j) });
  }
} catch (e) {
  $done({});
}
