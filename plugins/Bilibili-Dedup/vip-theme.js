/*
 * 本地会员伪装（B 站）
 * 从 [Rewrite] 迁到 [Script]：Loon 的 enable= 只对 [Script] 生效。
 *
 * 每个主题一套完整配置，年度大会员取自 zirawell/R-Store 的 bilibiliJson.js
 * （含真实牌子图 URL）；图片已镜像至 upstream/vip-assets/，避免官方素材下线。
 * 其余主题无公开图 URL，image 留空走文字渲染。
 */
const A = $argument || {};

// due_date 单位：【毫秒】—— 实测 B站原生响应为 1721577600000（=2024-07-21），
// 确认为毫秒时间戳。此前误采 zirawell 的秒级值 3818419199，与原生单位不一致。
// 此处取 9999-12-31 23:59:59 (UTC) 的毫秒值。
const DUE = 253402214399000;

const THEMES = {
  vip: {
    // 大会员「炮」版 249x60。
    // 不用同目录的 d7b702ef 灰版（144x60）——那是非会员态标识，开通后显示不对。
    text: "大会员", role: 1,
    label_theme: "vip", text_color: "#FFFFFF", bg_style: 1, bg_color: "#FB7299",
    nickname_color: "#FB7299",
    image: "https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Dedup/upstream/vip-assets/vip-cannon.png"
  },
  annual_vip: {
    text: "年度大会员", role: 3,
    label_theme: "annual_vip", text_color: "#FFFFFF", bg_style: 1, bg_color: "#FB7299",
    nickname_color: "#FB7299",
    image: "https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Dedup/upstream/vip-assets/annual.png"
  },
  ten_annual_vip: {
    // 十年大会员「炮」版 249x60
    text: "十年大会员", role: 7,
    label_theme: "ten_annual_vip", text_color: "#FFFFFF", bg_style: 1, bg_color: "#FB7299",
    nickname_color: "#FB7299",
    image: "https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Dedup/upstream/vip-assets/ten-cannon.png"
  },
  hundred_annual_vip: {
    // 「超·百年大会员」牌子图 249x60，B站 2023-09 活动素材，已镜像至 upstream/vip-assets/。
    // use_img_label 时 App 优先渲染此图，text 字段不显示。
    text: "百年大会员", role: 15,
    label_theme: "hundred_annual_vip", text_color: "#FFFFFF", bg_style: 1, bg_color: "#FB7299",
    nickname_color: "#FB7299",
    image: "https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Dedup/upstream/vip-assets/hundred.png"
  },
  fools_day_hundred_annual_vip: {
    text: "小会员", role: 15,
    label_theme: "fools_day_hundred_annual_vip", text_color: "#000000", bg_style: 1, bg_color: "#00E07C",
    nickname_color: "#00E07C", image: ""
  }
};

const T = THEMES[A.vipTheme] || THEMES.fools_day_hundred_annual_vip;
// 手动填了颜色/图片就覆盖主题默认值
const bg = A.vipBg || T.bg_color;
const fg = A.vipFg || T.text_color;
const img = A.vipImg || T.image || "";
const text = A.vipText || T.text;   // 牌子文字，可手动覆盖

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
        text: text,
        label_theme: T.label_theme,
        text_color: fg,
        bg_style: T.bg_style,
        bg_color: bg,
        border_color: "",
        image: img,
      })
    });
  }
  $done({ body: JSON.stringify(d) });
} catch (e) {
  $done({});
}
