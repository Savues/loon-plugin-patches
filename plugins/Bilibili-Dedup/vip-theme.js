/*
 * 本地会员伪装（B 站）
 * 从 [Rewrite] 迁到 [Script]：Loon 的 enable= 只对 [Script] 生效。
 *
 * 每个主题一套完整配置，年度大会员取自 zirawell/R-Store 的 bilibiliJson.js
 * （含真实牌子图 URL）；其余主题无公开图 URL，image 留空走文字渲染。
 */
const A = $argument || {};

// due_date 为【秒级】Unix 时间戳，参照 zirawell 的实现（2090-12-31 23:59:59）
const DUE = 3818419199;

const THEMES = {
  vip: {
    text: "大会员", role: 1,
    label_theme: "vip", text_color: "#FFFFFF", bg_style: 1, bg_color: "#FB7299",
    nickname_color: "#FB7299", image: ""
  },
  annual_vip: {
    text: "年度大会员", role: 3,
    label_theme: "annual_vip", text_color: "#FFFFFF", bg_style: 1, bg_color: "#FB7299",
    nickname_color: "#FB7299",
    image: "https://i0.hdslb.com/bfs/vip/8d4f8bfc713826a5412a0a27eaaac4d6b9ede1d9.png"
  },
  ten_annual_vip: {
    text: "十年大会员", role: 7,
    label_theme: "ten_annual_vip", text_color: "#FFFFFF", bg_style: 1, bg_color: "#FB7299",
    nickname_color: "#FB7299", image: ""
  },
  hundred_annual_vip: {
    text: "百年大会员", role: 15,
    label_theme: "hundred_annual_vip", text_color: "#FFFFFF", bg_style: 1, bg_color: "#FB7299",
    nickname_color: "#FB7299", image: ""
  },
  fools_day_hundred_annual_vip: {
    text: "最强绿鲤鱼", role: 15,
    label_theme: "fools_day_hundred_annual_vip", text_color: "#000000", bg_style: 1, bg_color: "#00E07C",
    nickname_color: "#00E07C", image: ""
  }
};

const T = THEMES[A.vipTheme] || THEMES.fools_day_hundred_annual_vip;
// 手动填了颜色/图片就覆盖主题默认值
const bg = A.vipBg || T.bg_color;
const fg = A.vipFg || T.text_color;
const img = A.vipImg || T.image || "";

try {
  const d = JSON.parse($response.body);
  const v = d && d.data && d.data.vip;
  if (v && v.status == 0) {
    d.data.vip_type = 2;
    d.data.vip = Object.assign({}, v, {
      type: 2,
      status: 1,
      due_date: DUE,
      role: T.role,
      nickname_color: T.nickname_color,
      label: Object.assign({}, v.label || {}, {
        path: "",
        text: T.text,
        label_theme: T.label_theme,
        text_color: fg,
        bg_style: T.bg_style,
        bg_color: bg,
        border_color: "",
        image: img
      })
    });
  }
  $done({ body: JSON.stringify(d) });
} catch (e) {
  $done({});
}
