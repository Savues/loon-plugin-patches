/*
 * vip.js 回归测试。Node 里跑：node vip.test.mjs
 *
 * mock 忠实度：$argument/$request/$response/$done 四个都按真实签名注入，
 * 少注入一个就等于没测那条分支（去年 $notification.post 就是这么漏的）。
 */
import { readFileSync } from "node:fs";
import assert from "node:assert";

const SRC = readFileSync(new URL("./vip.js", import.meta.url), "utf8");
const DUE = 253402214399000;
const IMG = "https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Bilibili-Dedup/upstream/vip-assets";
const URL_MINE = "https://app.bilibili.com/x/v2/account/myinfo?access_key=x";
const URL_SPACE = "https://app.bilibili.com/x/v2/space?mid=14895065";
const URL_GRPC = "https://grpc.biliapi.net/bilibili.app.viewunite.v1.View/View";
const ME = 14895065;

// 跑一次脚本，返回 $done 收到的参数
function run({ body, url, arg = {} }) {
  let done = null;
  const ctx = {
    $argument: arg,
    $request: { url },
    $response: { body: typeof body === "string" ? body : JSON.stringify(body) },
    $done: (v) => { done = v === undefined ? {} : v; },
  };
  // eslint-disable-next-line no-new-func
  new Function("$argument", "$request", "$response", "$done", SRC)(
    ctx.$argument, ctx.$request, ctx.$response, ctx.$done
  );
  return done;
}
const json = (d) => (d && typeof d === "object" && "body" in d ? JSON.parse(d.body) : null);
const untouched = (d) => assert.deepStrictEqual(d, {}, "应当原样透传 ($done({}))");

let pass = 0;
function t(name, fn) {
  try { fn(); pass++; }
  catch (e) { console.error("FAIL " + name + "\n      " + e.message); process.exitCode = 1; }
}

// ---------- 素材 ----------
const mineNonMember = () => ({
  code: 0,
  data: {
    mid: ME, vip_type: 0,
    vip: { type: 0, status: 0, due_date: 0, role: 0, nickname_color: "",
           label: { path: "old", text: "old", label_theme: "old", text_color: "#111",
                    bg_style: 0, bg_color: "#111", border_color: "#111", image: "old.png" } },
  },
});
// 空间页非会员：vip 字段整个不存在；UID 在 card.mid 且是字符串
const spaceNonMember = () => ({
  code: 0,
  data: { card: { mid: String(ME), official_verify: { type: -1, role: 0 },
                  vip: { vipStatus: 0, label: { path: "old" } } },
          vip_space_label: { show_expire: true } },
});

// ---------- 「我的」页 / grpc ----------
t("我的页·非会员：注入且字段完整", () => {
  const r = run({ body: mineNonMember(), url: URL_MINE });
  const d = json(r).data;
  assert.strictEqual(d.vip_type, 2);
  assert.strictEqual(d.vip.status, 1);
  assert.strictEqual(d.vip.type, 2);
  assert.strictEqual(d.vip.due_date, DUE);
  assert.strictEqual(d.vip.role, 15, "默认绿鲤鱼 role=15");
  assert.strictEqual(d.vip.label.label_theme, "fools_day_hundred_annual_vip");
  assert.strictEqual(d.vip.label.bg_color, "#00E07C");
  assert.strictEqual(d.vip.label.text_color, "#000000");
  assert.strictEqual(d.vip.label.path, "", "原生旧值必须被覆盖");
  assert.strictEqual(d.vip.label.image, "", "绿鲤鱼无牌图");
  assert.strictEqual("use_img_label" in d.vip.label, false, "我的页原生已带此字段，不得新增");
  assert.strictEqual(d.mid, ME, "同级字段不得动");
});

t("我的页·真会员：透传", () => {
  untouched(run({ body: { data: { vip: { type: 2, status: 1, role: 7 } } }, url: URL_MINE }));
});

t("我的页·无 vip 字段：透传", () => {
  untouched(run({ body: { data: { mid: ME } }, url: URL_MINE }));
});

t("grpc View/View：与我的页同处理", () => {
  const r = run({ body: mineNonMember(), url: URL_GRPC });
  assert.strictEqual(json(r).data.vip.status, 1);
});

// ---------- 空间页：UID 门禁 ----------
t("空间页·自己的主页：data.vip 与 card.vip 都写入", () => {
  const r = run({ body: spaceNonMember(), url: URL_SPACE, arg: { myMid: String(ME) } });
  const d = json(r).data;
  assert.strictEqual(d.vip.vipStatus, 1);
  assert.strictEqual(d.vip.vipType, 2);
  assert.strictEqual(d.vip.vipDueDate, DUE);
  assert.strictEqual(d.card.vip.vipStatus, 1, "顶栏读 card.vip");
  assert.strictEqual(d.vip_space_label.show_expire, false);
  assert.strictEqual(d.vip.label.use_img_label, true, "空间页原生无此字段，必须显式补");
  assert.deepStrictEqual(d.card.vip, d.vip, "两份 vip 必须逐字段相同");
});

t("空间页·card.mid 是字符串：仍要判定为自己的主页", () => {
  const f = spaceNonMember();
  f.data.card.mid = String(ME);
  const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME) } });
  assert.strictEqual(json(r).data.vip.vipStatus, 1);
});

t("空间页·别人的主页：透传", () => {
  const f = spaceNonMember();
  f.data.card.mid = "999";
  untouched(run({ body: f, url: URL_SPACE, arg: { myMid: String(ME) } }));
});

t("空间页·我的UID 留空：不生效", () => {
  untouched(run({ body: spaceNonMember(), url: URL_SPACE, arg: {} }));
});

t("空间页·card 缺失：透传", () => {
  untouched(run({ body: { data: { vip: {} } }, url: URL_SPACE, arg: { myMid: String(ME) } }));
});

t("空间页·card 不是对象：透传（不炸）", () => {
  untouched(run({ body: { data: { card: "x" } }, url: URL_SPACE, arg: { myMid: String(ME) } }));
});

t("空间页·真会员：透传", () => {
  const f = spaceNonMember();
  f.data.vip = { vipStatus: 1 };
  untouched(run({ body: f, url: URL_SPACE, arg: { myMid: String(ME) } }));
});

t("彩蛋·全员：别人的主页也注入", () => {
  const f = spaceNonMember();
  f.data.card.mid = "999";
  const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipAllUsers: true } });
  assert.strictEqual(json(r).data.vip.vipStatus, 1);
});

t("彩蛋·全员优先于点名", () => {
  const f = spaceNonMember();
  f.data.card.mid = "777";
  const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipTargetMid: "888" } });
  untouched(r);
  const r2 = run({ body: f, url: URL_SPACE, arg: { vipTargetMid: "777" } });
  assert.strictEqual(json(r2).data.vip.vipStatus, 1, "点名命中");
});

t("彩蛋·认证标识：写 title/splice_title，不写 icon", () => {
  const f = spaceNonMember();
  f.data.card.official_verify = { type: -1, role: 0, icon: "keep-me" };
  const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipFakeVerify: true } });
  const ov = json(r).data.card.official_verify;
  assert.strictEqual(ov.type, 0);
  assert.strictEqual(ov.role, 7);
  assert.strictEqual(ov.title, "认证用户");
  assert.strictEqual(ov.desc, "认证用户");
  assert.strictEqual(ov.splice_title, "", "未填标题则不显示前缀行");
  assert.strictEqual(ov.icon, "keep-me", "不得改写 icon");

  const r2 = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipFakeVerify: true, vipVerifyTitle: "美食" } });
  const ov2 = json(r2).data.card.official_verify;
  assert.strictEqual(ov2.title, "美食");
  assert.strictEqual(ov2.splice_title, "bilibili UP主认证：美食");
});

// ---------- 主题与覆盖 ----------
t("主题·大会员：空间页也应是粉底（旧版硬编码绿色，此处即回归点）", () => {
  const r = run({ body: spaceNonMember(), url: URL_SPACE, arg: { myMid: String(ME), vipTheme: "vip" } });
  const L = json(r).data.vip.label;
  assert.strictEqual(L.bg_color, "#FB7299");
  assert.strictEqual(L.text_color, "#FFFFFF");
  assert.strictEqual(L.label_theme, "vip");
  assert.strictEqual(L.image, IMG + "/gray-vip.png");
});

t("主题·年度：带牌图且两页一致", () => {
  const a = json(run({ body: mineNonMember(), url: URL_MINE, arg: { vipTheme: "annual_vip" } })).data.vip;
  const b = json(run({ body: spaceNonMember(), url: URL_SPACE, arg: { myMid: String(ME), vipTheme: "annual_vip" } })).data.vip;
  assert.strictEqual(a.role, 3); assert.strictEqual(b.vipType, 2);
  assert.strictEqual(a.label.image, IMG + "/annual.png");
  assert.strictEqual(b.label.image, a.label.image);
});

t("主题·非法值：回落绿鲤鱼且 label_theme 同步回落", () => {
  const r = run({ body: mineNonMember(), url: URL_MINE, arg: { vipTheme: "__nope__" } });
  assert.strictEqual(json(r).data.vip.label.label_theme, "fools_day_hundred_annual_vip");
});

t("手动覆盖 vipBg/vipFg/vipText/vipImg 全部生效", () => {
  const arg = { vipBg: "#123456", vipFg: "#654321", vipText: "手动", vipImg: "https://x/y.png" };
  const a = json(run({ body: mineNonMember(), url: URL_MINE, arg })).data.vip.label;
  assert.deepStrictEqual([a.bg_color, a.text_color, a.text, a.image],
    ["#123456", "#654321", "手动", "https://x/y.png"]);
  const b = json(run({ body: spaceNonMember(), url: URL_SPACE, arg: { ...arg, myMid: String(ME) } })).data.vip.label;
  assert.deepStrictEqual([b.bg_color, b.text_color, b.text, b.image],
    ["#123456", "#654321", "手动", "https://x/y.png"]);
});

t("nickname_color 取主题色，不跟手填背景色走", () => {
  const a = json(run({ body: mineNonMember(), url: URL_MINE, arg: { vipBg: "#123456" } })).data.vip;
  const b = json(run({ body: spaceNonMember(), url: URL_SPACE, arg: { myMid: String(ME), vipBg: "#123456" } })).data.vip;
  assert.strictEqual(a.nickname_color, "#00E07C");
  assert.strictEqual(b.nickname_color, "#00E07C", "两页曾不一致");
});

// ---------- 异常 ----------
t("响应不是 JSON：$done({})", () => {
  untouched(run({ body: "<html>502</html>", url: URL_MINE }));
});
t("data 缺失：$done({}) 且只调一次", () => {
  let n = 0;
  const ctx = { $argument: {}, $request: { url: URL_MINE }, $response: { body: '{"code":0}' }, $done: () => { n++; } };
  new Function("$argument", "$request", "$response", "$done", SRC)(ctx.$argument, ctx.$request, ctx.$response, ctx.$done);
  assert.strictEqual(n, 1, "$done 只能调一次");
});
t("$request 缺失：退回 body 判定，仍能处理空间页", () => {
  let done = null;
  const ctx = { $argument: { myMid: String(ME) }, $response: { body: JSON.stringify(spaceNonMember()) },
                $done: (v) => { done = v; } };
  new Function("$argument", "$request", "$response", "$done", SRC)(ctx.$argument, undefined, ctx.$response, ctx.$done);
  assert.strictEqual(JSON.parse(done.body).data.vip.vipStatus, 1);
});

// ---------- 专栏页 /x/v2/space/article ----------
// 抓包实证：data.item[].author.vip 用的是「我的」页 schema，author 键 = mid/name/face/pendant/official_verify/nameplate/vip
const article = (mid) => ({
  code: 0,
  data: { count: 2, lists_count: 1,
          item: [{ author: { mid: String(mid), name: "a", vip: { type: 0, status: 0, due_date: 0, vip_pay_type: 0, theme_type: 0, label: { path: "p", text: "", label_theme: "" }, avatar_subscript: 0, nickname_color: "" } } },
                 { author: { mid: String(mid), name: "b", vip: { type: 0, status: 0, due_date: 0, vip_pay_type: 0, theme_type: 0, label: {}, avatar_subscript: 0, nickname_color: "" } } }] },
});

t("专栏页·自己的主页：作者 vip 被注入，且不凭空造 data.vip", () => {
  const r = run({ body: article(ME), url: URL_SPACE + "/article?mid=" + ME, arg: { myMid: String(ME) } });
  const d = json(r).data;
  assert.strictEqual(d.vip, undefined, "专栏页没有顶栏，不应造 data.vip");
  assert.strictEqual(d.item[0].author.vip.status, 1);
  assert.strictEqual(d.item[0].author.vip.due_date, DUE);
  assert.strictEqual(d.item[0].author.vip.role, 15);
  assert.strictEqual(d.item[0].author.vip.label.bg_color, "#00E07C");
  assert.strictEqual(d.item[0].author.vip.vip_pay_type, 0, "原生字段必须保留");
  assert.strictEqual(d.item[1].author.vip.status, 1, "列表里每篇都要改");
  assert.strictEqual(d.item[0].author.name, "a", "同级字段不得动");
});

t("专栏页·别人的主页：透传", () => {
  untouched(run({ body: article(999), url: URL_SPACE + "/article?mid=999", arg: { myMid: String(ME) } }));
});

t("专栏页·作者是真会员：透传", () => {
  const f = article(ME);
  f.data.item[0].author.vip.status = 1;
  f.data.item[1].author.vip.status = 1;
  untouched(run({ body: f, url: URL_SPACE + "/article?mid=" + ME, arg: { myMid: String(ME) } }));
});

t("专栏页·列表为空：无 mid 可判，透传", () => {
  untouched(run({ body: { data: { count: 0, item: [] } }, url: URL_SPACE + "/article", arg: { myMid: String(ME) } }));
});

t("专栏页·article 响应不命中空间页分支（无 card 时不会误改作者）", () => {
  // 走「我的」页分支：d.vip 不存在 → 透传，而不是去改 item[].author
  untouched(run({ body: article(ME), url: "https://app.bilibili.com/x/v2/account/myinfo?k=1", arg: { myMid: String(ME) } }));
});

console.log((process.exitCode ? "FAILED" : "OK") + "  " + pass + " cases");
