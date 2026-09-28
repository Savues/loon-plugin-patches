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
// 换账号时改这里（自己的 uid，去个人空间页地址栏取）。
const ME = 14895065;

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
    image: ""
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
  // 三种情况原样透传，绝不改写：
  //   1) 别人的主页  —— mid 不匹配
  //   2) 响应异常    —— 无 data
  //   3) 已经是会员  —— 不冒充真会员
  // 非会员时 B 站直接删掉整个 vip 字段，故「不存在」也算未开通。
  const passthrough = !d
    || (d.mid !== undefined && d.mid !== ME)
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
