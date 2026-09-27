/*
 * 本地会员伪装（B 站）
 * 从 [Rewrite] 迁到 [Script]：Loon 的 enable= 只对 [Script] 生效，
 * 放在 [Rewrite] 里开关是死的。
 *
 * 主题取自 B 站 label.label_theme，role 15 = 百年系列
 */
const A = $argument || {};
const THEMES = {
  vip:                          "大会员",
  annual_vip:                   "年度大会员",
  ten_annual_vip:               "十年大会员",
  hundred_annual_vip:           "百年大会员",
  fools_day_hundred_annual_vip: "最强绿鲤鱼"
};
const theme = THEMES[A.vipTheme] ? A.vipTheme : "fools_day_hundred_annual_vip";
const text  = THEMES[theme];
const bg    = A.vipBg    || "#00E07C";
const fg    = A.vipFg    || "#000000";

try {
  const d = JSON.parse($response.body);
  const v = d && d.data && d.data.vip;
  if (v && v.status == 0) {
    d.data.vip = Object.assign({}, v, {
      status: 1, type: 2, due_date: 9005270400000, role: 15,
      label: Object.assign({}, v.label || {}, {
        text: text, label_theme: theme,
        text_color: fg, bg_color: bg, use_img_label: false
      })
    });
    if (d.data.vip_type !== undefined) d.data.vip_type = 2;
  }
  $done({ body: JSON.stringify(d) });
} catch (e) {
  $done({});   // 解析失败则原样放行
}
