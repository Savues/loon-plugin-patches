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

const THEMES = {
  vip:                          { text: "大会员",     type: 1 },
  annual_vip:                   { text: "年度大会员",  type: 2 },
  ten_annual_vip:               { text: "十年大会员",  type: 2 },
  hundred_annual_vip:           { text: "百年大会员",  type: 2 },
  fools_day_hundred_annual_vip: { text: "小会员",     type: 2 }
};

const T = THEMES[A.vipTheme] || THEMES.fools_day_hundred_annual_vip;
const bg = A.vipBg || "#00E07C";
const fg = A.vipFg || "#000000";
const text = A.vipText || T.text;
// 实测：App 对空间页的会员标走文字渲染（text + bg_color），
// 一次 /bfs/vip/ 图片请求都不会发。image 留空，与 myinfo 侧保持一致。

try {
  const j = JSON.parse($response.body);
  const d = j && j.data;
  if (!d) { $done({}); }

  const v = d.vip;
  // 非会员时 B 站直接删掉整个 vip 字段，因此以「不存在或未开通」为判据
  if (v && v.vipStatus === 1) { $done({ body: $response.body }); return; }  // 已开通，不动

  const label = Object.assign({}, (v && v.label) || {}, {
    path: "",
    text: text,
    label_theme: T === THEMES.fools_day_hundred_annual_vip
      ? "fools_day_hundred_annual_vip" : (A.vipTheme || "vip"),
    text_color: fg,
    bg_style: 1,
    bg_color: bg,
    border_color: "",
    image: ""
  });
  // 构造结果与 myinfo 侧（vip-theme.js）逐字段相同，
  // 只多出空间页 schema 特有的 vipType/vipStatus/vipDueDate 等字段。

  // 补齐与 myinfo 侧一致的字段集，两个页面的对象逐字段相同
  const FULL = {
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
  };

  d.vip = Object.assign({}, v || {}, FULL);

  // 空间页的到期提示开关，与会员样本一致
  if (d.vip_space_label) { d.vip_space_label.show_expire = false; }

  // 关键：主页顶栏实际读 data.card.vip，不是 data.vip。
  // 抓包实证（非会员主页，v7.10 注入后）：
  //   data.vip -> vipStatus:1   我们写的，App 不看
  //   card.vip -> vipStatus:0   App 读这个，所以一直显示灰色
  // 两处都写：card.vip 决定顶栏，data.vip 供其他页面使用。
  if (d.card && typeof d.card === "object") {
    d.card.vip = Object.assign({}, d.card.vip || {}, FULL);
  }

  $done({ body: JSON.stringify(j) });
} catch (e) {
  $done({});
}
