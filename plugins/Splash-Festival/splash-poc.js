/*
 * splash/brand/list show 注入 —— 强制展示指定节日/活动品牌皮肤。
 * v4: 支持全部 53 个官方皮肤（22 当前 + 31 历史）+ 屏蔽功能。
 *
 * 机制：brand/list 响应的 data.show 数组是展示控制通道，
 * 客户端按 begin_time/end_time 时间窗口决定是否展示。
 * 屏蔽：show 置空数组，客户端不展示任何品牌皮肤。
 */
const A = $argument || {};
const LOGO = "http://i0.hdslb.com/bfs/archive/1b1a8a4fc78a3b1b2992402ebdc19808b9d251ed.png";
const FESTIVALS = {
  // 节日类（当前）
  midautumn:  { id: 38,  name: "中秋节" },
  chongyang:  { id: 145, name: "重阳节" },
  yuandan:    { id: 34,  name: "元旦" },
  duanwu:     { id: 43,  name: "端午节" },
  qixi:       { id: 47,  name: "七夕节" },
  halloween:  { id: 31,  name: "万圣节" },
  xmas1:      { id: 32,  name: "圣诞节1.0" },
  xmas2:      { id: 33,  name: "圣诞节2.0" },
  women:      { id: 35,  name: "妇女节" },
  labor:      { id: 41,  name: "劳动节" },
  // 周年庆
  bili10:     { id: 12,  name: "Bilibili 10周年" },
  bili11:     { id: 13,  name: "Bilibili 11周年" },
  bili12:     { id: 44,  name: "Bilibili 12周年" },
  bili13:     { id: 67,  name: "Bilibili 13周年" },
  // 活动
  bml2021:    { id: 45,  name: "BML 2021" },
  bw2020:     { id: 10,  name: "BW 2020" },
  bw2021:     { id: 46,  name: "BW 2021" },
  // 通用
  "2233a":    { id: 14,  name: "2233 款式一" },
  "2233b":    { id: 15,  name: "2233 款式二" },
  "2233c":    { id: 37,  name: "2233 款式三" },
  "2233d":    { id: 36,  name: "2233 款式四" },
  slogan:     { id: 17,  name: "slogan" },
  // 历史皮肤（2024-2026）
  gaokao24:   { id: 113, name: "2024高考" },
  duanwu24:   { id: 114, name: "2024端午节" },
  summer24:   { id: 115, name: "2024暑假快乐" },
  qixi24:     { id: 116, name: "2024七夕" },
  chongyang24:{ id: 117, name: "2024重阳" },
  teacher24:  { id: 118, name: "2024教师节" },
  midautumn24:{ id: 119, name: "2024中秋" },
  cj25a:      { id: 120, name: "2025春节打铁花" },
  cj25b:      { id: 121, name: "2025春节放御灯" },
  cj25c:      { id: 122, name: "2025春节滚灯球" },
  cj25d:      { id: 123, name: "2025春节聚天宫" },
  cj25e:      { id: 124, name: "2025春节跨火盆" },
  cj25f:      { id: 125, name: "2025春节舞龙狮" },
  yx25:       { id: 126, name: "2025元宵节" },
  women25:    { id: 127, name: "2025妇女节" },
  qm25:       { id: 128, name: "2025清明" },
  labor25:    { id: 129, name: "2025劳动节" },
  labor25b:   { id: 130, name: "2025国际劳动节" },
  duanwu25:   { id: 131, name: "2025端午" },
  gaokao25:   { id: 132, name: "2025高考" },
  summer25:   { id: 133, name: "2025暑假过半" },
  qixi25:     { id: 134, name: "2025七夕" },
  teacher25:  { id: 135, name: "2025教师节" },
  midautumn25:{ id: 136, name: "2025中秋" },
  cj26a:      { id: 137, name: "2026春节-马灯笼" },
  cj26b:      { id: 138, name: "2026春节-马头琴" },
  cj26c:      { id: 139, name: "2026春节-马球" },
  labor26:    { id: 140, name: "2026五一" },
  gaokao26:   { id: 141, name: "2026高考" },
  duanwu26:   { id: 142, name: "2026端午" },
  midautumn26:{ id: 144, name: "2026中秋" },
  // 屏蔽
  block:      { id: 0,   name: "屏蔽节日开屏" }
};
const F = FESTIVALS[A.festival] || FESTIVALS.midautumn;

try {
  const j = JSON.parse($response.body);
  if (!j.data) j.data = {};
  const now = Math.floor(Date.now() / 1000);
  if (F.id === 0) {
    // 屏蔽：show 置空
    j.data.show = [];
  } else {
    j.data.show = [{
      id: F.id,
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
  }
  $done({ body: JSON.stringify(j) });
} catch (e) {
  $done({});
}
// v4: full 53 skins + block mode
