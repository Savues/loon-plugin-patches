/*
 * vip.js 回归测试。Node 里跑：node vip.test.mjs
 *
 * mock 忠实度：$argument/$request/$response/$done 四个都按真实签名注入，
 * 少注入一个就等于没测那条分支（去年 $notification.post 就是这么漏的）。
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import assert from "node:assert";

const SRC = readFileSync(new URL("../scripts/vip.js", import.meta.url), "utf8");
const DUE = 253402214399000;
const IMG = "https://raw.githubusercontent.com/Savues/loon-plugin-patches/ma./scripts/upstream/vip-assets";
const URL_MINE = "https://app.bilibili.com/x/v2/account/myinfo?access_key=x";
const URL_SPACE = "https://app.bilibili.com/x/v2/space?mid=14895065";
// 注：lab5 已把 grpc 的 View/View 与 Reply/MainList 从清单移除（那些响应里没有 vip 字段），
//     所以这里不再有 grpc 端点的样本 —— 曾经有过的用例已随那次收窄一起删掉。
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

t("彩蛋·点名：命中与不命中（全员开关未开时不生效）", () => {
  const f = spaceNonMember();
  f.data.card.mid = "777";
  const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipTargetMid: "888" } });
  untouched(r);
  const r2 = run({ body: f, url: URL_SPACE, arg: { vipTargetMid: "777" } });
  assert.strictEqual(json(r2).data.vip.vipStatus, 1, "点名命中");
});

t("彩蛋·认证标识：写 title/splice_title/icon（icon 供国际版画闪电）", () => {
  const f = spaceNonMember();
  f.data.card.official_verify = { type: -1, role: 0, icon: "keep-me" };
  const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipFakeVerify: true } });
  const ov = json(r).data.card.official_verify;
  assert.strictEqual(ov.type, 0);
  assert.strictEqual(ov.role, 7);
  assert.strictEqual(ov.title, "认证用户");
  assert.strictEqual(ov.desc, "认证用户");
  assert.strictEqual(ov.splice_title, "", "未填标题则不显示前缀行");
  assert.ok(/72wejSxl9Z\.png$/.test(ov.icon), "v7.40：icon 改写为黄闪电 URL（旧值 keep-me 被覆盖）");

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
  assert.strictEqual(L.image, IMG + "/vip-basic-pink.png");
});

t("主题·年度：带牌图且两页一致", () => {
  const a = json(run({ body: mineNonMember(), url: URL_MINE, arg: { vipTheme: "annual_vip" } })).data.vip;
  const b = json(run({ body: spaceNonMember(), url: URL_SPACE, arg: { myMid: String(ME), vipTheme: "annual_vip" } })).data.vip;
  assert.strictEqual(a.role, 3); assert.strictEqual(b.vipType, 2);
  assert.strictEqual(a.label.image, IMG + "/vip-annual-pink.png");
  assert.strictEqual(b.label.image, a.label.image);
});

t("主题·非法值：回落绿鲤鱼且 label_theme 同步回落", () => {
  const r = run({ body: mineNonMember(), url: URL_MINE, arg: { vipTheme: "__nope__" } });
  assert.strictEqual(json(r).data.vip.label.label_theme, "fools_day_hundred_annual_vip");
});

// 牌子图统一用纯文字版。vip-assets 里另存了一整套带图案的（火车/2023 活动带星），
// 体积大 5–8 倍，官方当年为活动期特别款，长期看会与新皮肤脱节——一律不引用。
t("牌子图·四个档位全部是纯文字版，无 cannon / 2023 图案款", () => {
  for (const k of ["vip", "annual_vip", "ten_annual_vip", "hundred_annual_vip"]) {
    const L = json(run({ body: mineNonMember(), url: URL_MINE, arg: { vipTheme: k } })).data.vip.label;
    assert.ok(L.image, k + " 缺牌子图");
    assert.ok(!/cannon|2023|mascot/.test(L.image), k + " 引用了带图案的版式: " + L.image);
  }
});
t("牌子图·引用的文件在 vip-assets 里真实存在（改名后不会静默 404）", () => {
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "upstream", "vip-assets");
  for (const k of ["vip", "annual_vip", "ten_annual_vip", "hundred_annual_vip"]) {
    const L = json(run({ body: mineNonMember(), url: URL_MINE, arg: { vipTheme: k } })).data.vip.label;
    assert.ok(existsSync(path.join(dir, path.basename(L.image))), "仓库里没有 " + L.image);
  }
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

// ---------- 开关语义的回归点：Loon 可能把 switch 传成字符串 ----------
// vipAllUsers 用 !!A.vipAllUsers 时，字符串 "false" 会被当真 ⇒ 关着的开关变成「全员生效」。
// 这是 2026-09-29 真实载荷测试（pass4b.mjs）抓出来的。
t("开关·vipAllUsers：布尔与字符串 false 都不生效（用别人的主页测）", () => {
  for (const v of [false, "false", "", 0, undefined, null]) {
    const f = spaceNonMember(); f.data.card.mid = "999";
    untouched(run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipAllUsers: v } }));
  }
});
t("开关·vipAllUsers：布尔与字符串 true 都生效", () => {
  for (const v of [true, "true"]) {
    const f = spaceNonMember(); f.data.card.mid = "999";
    const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipAllUsers: v } });
    assert.strictEqual(json(r).data.vip.vipStatus, 1, "值 " + JSON.stringify(v) + " 应生效");
  }
});
t("开关·vipFakeVerify：关掉时不改 official_verify", () => {
  for (const v of [false, "false", "", 0]) {
    const f = spaceNonMember();
    const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipFakeVerify: v } });
    const ov = json(r).data.card.official_verify;
    assert.notStrictEqual(ov && ov.type, 0, "值 " + JSON.stringify(v) + " 不应改 official_verify");
  }
});

// ---------- v7.33：ICON_LAYER 角标图层注入 ----------
// avatar 新协议对象（真实样本结构：mine 的 data.avatar / 空间页 data.card.avatar）
const avatarObj = () => ({
  container_size: { width: 1.35, height: 1.35 },
  fallback_layers: { layers: [
    { visible: true, general_spec: { pos_spec: { coordinate_pos: 2, axis_x: 0.675, axis_y: 0.675 },
        size_spec: { width: 1.0625, height: 1.0625 }, render_spec: { opacity: 1 } },
      layer_config: { tags: { AVATAR_LAYER: {} }, is_critical: true },
      resource: { res_type: 5, res_native_draw: { draw_src: { src_type: 3, draw: { draw_type: 1, fill_mode: 1 } } } } },
    { visible: true, general_spec: { pos_spec: { coordinate_pos: 2, axis_x: 0.675, axis_y: 0.675 },
        size_spec: { width: 1, height: 1 }, render_spec: { opacity: 1 } },
      layer_config: { tags: { AVATAR_LAYER: {} }, is_critical: true },
      resource: { res_type: 3, res_image: { image_src: { src_type: 1, placeholder: 6 } } } },
  ] },
  mid: ME,
});
const iconTags = (ls) => ls.filter((l) => l.layer_config && l.layer_config.tags && "ICON_LAYER" in l.layer_config.tags).length;

t("角标·我的页非会员+开关开 → data.avatar 追加 2 个 ICON_LAYER（4 层）", () => {
  const f = mineNonMember(); f.data.avatar = avatarObj();
  const r = run({ body: f, url: URL_MINE, arg: { vipAvatarBadge: true } });
  const ls = json(r).data.avatar.fallback_layers.layers;
  assert.strictEqual(ls.length, 4);
  assert.strictEqual(iconTags(ls), 2);
  const icon = ls[3];
  assert.strictEqual(icon.resource.res_image.image_src.local, 1, "图标应为 local:1（大会员大字）");
  const bg = ls[2];
  assert.strictEqual(bg.resource.res_native_draw.draw_src.draw.color_config.night.argb, "#FF17181A", "暗色底圈参数照抄真会员");
});

t("角标·开关关 → avatar 原样不动", () => {
  const f = mineNonMember(); f.data.avatar = avatarObj();
  const r = run({ body: f, url: URL_MINE, arg: { vipAvatarBadge: "false" } });
  assert.strictEqual(json(r).data.avatar.fallback_layers.layers.length, 2);
});

t("角标·我的页真会员 → 整体透传（不注入图层/不改 vip）", () => {
  const f = mineNonMember();
  f.data.vip.status = 1;
  f.data.avatar = avatarObj();
  untouched(run({ body: f, url: URL_MINE, arg: { vipAvatarBadge: true } }));
});
t("角标·空间页真会员（自己）+ 开关开 → 只替换角标图层，vip/牌子不动", () => {
  const f = spaceNonMember();
  f.data.vip = { vipStatus: 1, vipType: 2, label: { text: "真会员" } };
  f.data.card.vip = { vipStatus: 1, vipType: 2, label: { text: "真会员" } };
  f.data.card.avatar = avatarObj();
  f.data.card.avatar.fallback_layers.layers.push(
    { visible: true, general_spec: {}, layer_config: { tags: { ICON_LAYER: {} } }, resource: {} },
  );
  const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipAvatarBadge: true, vipBadgeIcon: "小会员" } });
  const j = json(r).data;
  assert.strictEqual(j.card.vip.label.text, "真会员", "vip/牌子零改动");
  const ls = j.card.avatar.fallback_layers.layers;
  assert.strictEqual(iconTags(ls), 2, "原角标层被剥掉后注入选定样式");
  assert.strictEqual(ls[ls.length - 1].resource.res_image.image_src.local, 2, "换成小会员小字");
});

t("角标·我的页响应无 avatar 字段 → 不炸、vip 伪装照常", () => {
  const r = run({ body: mineNonMember(), url: URL_MINE, arg: { vipAvatarBadge: true } });
  const j = json(r);
  assert.strictEqual(j.data.vip.status, 1, "vip 伪装仍生效");
  assert.strictEqual(j.data.avatar, undefined, "无 avatar 字段则不造");
});

t("角标·空间页自己主页+开关开 → card.avatar 追加 ICON_LAYER，认证保留", () => {
  const f = spaceNonMember(); f.data.card.avatar = avatarObj();
  f.data.card.official_verify.type = 0;                 // v7.34 起不再清除认证
  const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipAvatarBadge: true } });
  const ls = json(r).data.card.avatar.fallback_layers.layers;
  assert.strictEqual(ls.length, 4);
  assert.strictEqual(iconTags(ls), 2);
  assert.strictEqual(json(r).data.card.official_verify.type, 0, "认证不得被清除（v7.34）");
});

t("角标·空间页别人主页（无全员/点名）→ avatar 不动", () => {
  const f = spaceNonMember(); f.data.card.mid = "999"; f.data.card.avatar = avatarObj();
  untouched(run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipAvatarBadge: true } }));
});

// ---------- v7.34：角标样式自定义 + 证伪清理 ----------
t("角标样式·默认（未传 vipBadgeIcon）→ local:1 大会员", () => {
  const f = mineNonMember(); f.data.avatar = avatarObj();
  const r = run({ body: f, url: URL_MINE, arg: { vipAvatarBadge: true } });
  assert.strictEqual(json(r).data.avatar.fallback_layers.layers[3].resource.res_image.image_src.local, 1);
});
t("角标样式·认证闪电 → local:3", () => {
  const f = mineNonMember(); f.data.avatar = avatarObj();
  const r = run({ body: f, url: URL_MINE, arg: { vipAvatarBadge: true, vipBadgeIcon: "认证闪电" } });
  assert.strictEqual(json(r).data.avatar.fallback_layers.layers[3].resource.res_image.image_src.local, 3);
});
t("清理·我的页不再写 avatar_subscript / label 不再强改 annual_vip", () => {
  const f = mineNonMember(); f.data.avatar = avatarObj();
  const r = run({ body: f, url: URL_MINE, arg: { vipAvatarBadge: true } });
  const v = json(r).data.vip;
  assert.strictEqual("avatar_subscript" in v, false, "v7.31 字段已随证伪移除");
  assert.strictEqual("avatar_subscript_url" in v, false);
  assert.strictEqual(v.label.label_theme, "fools_day_hundred_annual_vip", "牌子主题跟随 vipTheme 选择");
  assert.strictEqual("label_id" in v.label, false, "v7.30 整段复刻已移除");
});
t("组合·头像角标与认证彩蛋同时开 → 图层注入且认证文字写入", () => {
  const f = spaceNonMember(); f.data.card.avatar = avatarObj();
  const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipAvatarBadge: true, vipFakeVerify: true } });
  const j = json(r).data;
  assert.strictEqual(iconTags(j.card.avatar.fallback_layers.layers), 2, "角标图层注入");
  assert.strictEqual(j.card.official_verify.type, 0, "认证彩蛋照常生效");
  assert.strictEqual(j.card.official_verify.title, "认证用户");
});

// ---------- v7.35：角标样式测试值 + 牌子配色覆盖 ----------
t("角标样式·小会员/企业认证/数字藏品/local6 全部可注入", () => {
  for (const [opt, id] of [["小会员", 2], ["企业认证", 4], ["数字藏品", 5], ["测试·local6", 6]]) {
    const f = mineNonMember(); f.data.avatar = avatarObj();
    const r = run({ body: f, url: URL_MINE, arg: { vipAvatarBadge: true, vipBadgeIcon: opt } });
    assert.strictEqual(json(r).data.avatar.fallback_layers.layers[3].resource.res_image.image_src.local, id, opt);
  }
});
t("角标样式·数字藏品·动态 → 白底圈+GIF（贴右下角标准位）", () => {
  const f = mineNonMember(); f.data.avatar = avatarObj();
  const r = run({ body: f, url: URL_MINE, arg: { vipAvatarBadge: true, vipBadgeIcon: "数字藏品·动态" } });
  const ls = json(r).data.avatar.fallback_layers.layers;
  assert.strictEqual(ls.length, 4, "2 原生 + 2 注入");
  assert.strictEqual(ls[3].resource.res_type, 4, "GIF 动画层");
  assert.ok(ls[3].resource.res_animation.webp_src.remote.url.includes("j8AeXAkEul.gif"));
  assert.strictEqual(ls[3].general_spec.pos_spec.axis_x, 1, "GIF 中心=头像右下角标准位（非 1.65 容器坐标）");
  assert.strictEqual(ls[2].general_spec.pos_spec.axis_x, 0.975, "白底圈同 Celestial 坐标");
});
t("角标样式·数字藏品·紫动态 → 深紫系列 GIF", () => {
  const f = mineNonMember(); f.data.avatar = avatarObj();
  const r = run({ body: f, url: URL_MINE, arg: { vipAvatarBadge: true, vipBadgeIcon: "数字藏品·紫动态" } });
  const ls = json(r).data.avatar.fallback_layers.layers;
  assert.ok(ls[3].resource.res_animation.webp_src.remote.url.includes("IOHoVs1ebP.gif"));
  assert.strictEqual(ls[3].general_spec.pos_spec.axis_x, 1);
});
t("角标样式·大会员+藏品动态 → 双标识并存（蒔花再開同款 4 个注入层）", () => {
  const f = mineNonMember(); f.data.avatar = avatarObj();
  const r = run({ body: f, url: URL_MINE, arg: { vipAvatarBadge: true, vipBadgeIcon: "大会员+藏品动态" } });
  const ls = json(r).data.avatar.fallback_layers.layers;
  assert.strictEqual(ls.length, 6, "2 原生 + 4 注入");
  assert.strictEqual(ls[3].resource.res_image.image_src.local, 1, "大会员大字");
  assert.strictEqual(ls[5].resource.res_type, 4, "GIF 动画层");
  assert.strictEqual(ls[5].general_spec.pos_spec.axis_x, 0.75, "GIF 左移 0.25 与会员图标并排");
  assert.strictEqual(ls[4].general_spec.pos_spec.axis_x, 0.725, "GIF 白圈同步左移");
  assert.strictEqual(iconTags(ls), 4, "4 个 ICON_LAYER");
});
t("角标样式·非法值回落 local:1", () => {
  const f = mineNonMember(); f.data.avatar = avatarObj();
  const r = run({ body: f, url: URL_MINE, arg: { vipAvatarBadge: true, vipBadgeIcon: "乱填" } });
  assert.strictEqual(json(r).data.avatar.fallback_layers.layers[3].resource.res_image.image_src.local, 1);
});
t("牌子配色·vipLabelAnnual 开 → label_theme 强制 annual_vip（主题表命中粉色）", () => {
  for (const url of [URL_MINE, URL_SPACE]) {
    const arg = url === URL_SPACE ? { myMid: String(ME), vipLabelAnnual: true } : { vipLabelAnnual: true };
    const f = url === URL_SPACE ? spaceNonMember() : mineNonMember();
    const r = run({ body: f, url, arg });
    const v = url === URL_SPACE ? json(r).data.vip : json(r).data.vip;
    assert.strictEqual(v.label.label_theme, "annual_vip", url);
    // 牌子文字/配色字段仍按用户主题写（真实渲染时被主题表覆盖成粉）
    assert.strictEqual(v.label.text, "小会员");
    assert.strictEqual(v.label.bg_color, "#00E07C");
  }
});
t("牌子配色·关（默认）→ label_theme 跟随 vipTheme", () => {
  const r = run({ body: mineNonMember(), url: URL_MINE });
  assert.strictEqual(json(r).data.vip.label.label_theme, "fools_day_hundred_annual_vip");
});
t("牌子配色·与角标独立：仅开粉色牌子不注入角标图层", () => {
  const f = mineNonMember(); f.data.avatar = avatarObj();
  const r = run({ body: f, url: URL_MINE, arg: { vipLabelAnnual: true } });
  const j = json(r);
  assert.strictEqual(j.data.vip.label.label_theme, "annual_vip");
  assert.strictEqual(j.data.avatar.fallback_layers.layers.length, 2, "角标开关没开则不注入图层");
});

// ---------- v7.38：认证彩蛋单选（黄/蓝） ----------
t("认证·蓝V·企业认证：type1/role3/默认标题官方账号", () => {
  const f = spaceNonMember();
  const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipVerify: "蓝V·企业认证" } });
  const ov = json(r).data.card.official_verify;
  assert.strictEqual(ov.type, 1);
  assert.strictEqual(ov.role, 3);
  assert.strictEqual(ov.title, "官方账号");
  assert.strictEqual(ov.desc, "官方账号");
  assert.strictEqual(ov.splice_title, "", "标题未自定义时不写 splice 前缀");
});
t("认证·蓝V+自定义标题：splice 前缀「bilibili机构认证-企业：」", () => {
  const f = spaceNonMember();
  const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipVerify: "蓝V·企业认证", vipVerifyTitle: "迈从官方账号" } });
  const ov = json(r).data.card.official_verify;
  assert.strictEqual(ov.splice_title, "bilibili机构认证-企业：迈从官方账号");
});
t("认证·黄V显式选择：type0/role7", () => {
  const f = spaceNonMember();
  const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipVerify: "黄V·UP主认证" } });
  const ov = json(r).data.card.official_verify;
  assert.strictEqual(ov.type, 0);
  assert.strictEqual(ov.role, 7);
  assert.strictEqual(ov.title, "认证用户");
});
t("认证·旧版 vipFakeVerify 开关值兼容 → 视作黄V", () => {
  const f = spaceNonMember();
  const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipFakeVerify: true } });
  assert.strictEqual(json(r).data.card.official_verify.type, 0);
});
t("认证·选「关」且旧开关关 → 不改 official_verify", () => {
  const f = spaceNonMember(); f.data.card.official_verify = { type: -1, role: 0 };
  const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipVerify: "关" } });
  assert.strictEqual(json(r).data.card.official_verify.type, -1);
});

// ---------- v7.38 审查：全员/点名彩蛋与新功能同步 ----------
t("审查·全员+角标 → 别人主页也注入 ICON_LAYER", () => {
  const f = spaceNonMember(); f.data.card.mid = "999"; f.data.card.avatar = avatarObj();
  const r = run({ body: f, url: URL_SPACE, arg: { vipAllUsers: true, vipAvatarBadge: true } });
  const ls = json(r).data.card.avatar.fallback_layers.layers;
  assert.strictEqual(iconTags(ls), 2, "全员生效时别人主页也注入角标");
});
t("审查·全员+认证彩蛋 → 别人主页写认证文字", () => {
  const f = spaceNonMember(); f.data.card.mid = "999";
  const r = run({ body: f, url: URL_SPACE, arg: { vipAllUsers: true, vipVerify: "蓝V·企业认证", vipVerifyTitle: "某某科技" } });
  const ov = json(r).data.card.official_verify;
  assert.strictEqual(ov.type, 1);
  assert.strictEqual(ov.splice_title, "bilibili机构认证-企业：某某科技");
});
t("审查·点名 UID → 生效；非点名 → 不生效", () => {
  const f = spaceNonMember(); f.data.card.mid = "888"; f.data.card.avatar = avatarObj();
  const r1 = run({ body: f, url: URL_SPACE, arg: { vipTargetMid: "888", vipAvatarBadge: true } });
  assert.strictEqual(iconTags(json(r1).data.card.avatar.fallback_layers.layers), 2, "点名 UID 生效");
  const f2 = spaceNonMember(); f2.data.card.mid = "777"; f2.data.card.avatar = avatarObj();
  untouched(run({ body: f2, url: URL_SPACE, arg: { vipTargetMid: "888", vipAvatarBadge: true } }));
});
t("审查·全员+角标 → 真会员的角标被替换成选定样式（vip/认证不写）", () => {
  const f = spaceNonMember(); f.data.card.mid = "999";
  f.data.vip = { vipStatus: 1, vipType: 2, label: { text: "真会员" } };
  f.data.card.vip = { vipStatus: 1, vipType: 2, label: { text: "真会员" } };
  f.data.card.avatar = avatarObj();
  f.data.card.avatar.fallback_layers.layers.push(
    { visible: true, general_spec: {}, layer_config: { tags: { ICON_LAYER: {} } }, resource: {} },
  );
  const r = run({ body: f, url: URL_SPACE, arg: { vipAllUsers: true, vipAvatarBadge: true, vipBadgeIcon: "数字藏品", vipVerify: "黄V·UP主认证" } });
  const j = json(r).data;
  assert.strictEqual(j.card.vip.label.text, "真会员", "真会员 vip 零改动");
  assert.notStrictEqual(j.card.official_verify.type, 0, "认证不写真会员");
  const ls = j.card.avatar.fallback_layers.layers;
  assert.strictEqual(iconTags(ls), 2, "旧角标剥掉");
  assert.strictEqual(ls[ls.length - 1].resource.res_image.image_src.local, 5, "换成数字藏品样式");
});
t("审查·全员+角标关 → 真会员整体透传", () => {
  const f = spaceNonMember(); f.data.card.mid = "999";
  f.data.vip = { vipStatus: 1, vipType: 2, label: { text: "真会员" } };
  f.data.card.vip = { vipStatus: 1, vipType: 2, label: { text: "真会员" } };
  f.data.card.avatar = avatarObj();
  untouched(run({ body: f, url: URL_SPACE, arg: { vipAllUsers: true } }));
});
t("审查·全员+角标 → 藏品用户的 GIF 层也被替换", () => {
  const f = spaceNonMember(); f.data.card.mid = "666";
  f.data.card.avatar = avatarObj();
  f.data.card.avatar.fallback_layers.layers.push(
    { visible: true, general_spec: {}, layer_config: { tags: { ICON_LAYER: {} } },
      resource: { res_type: 4, res_animation: {} } },   // 模拟藏品 GIF 层
  );
  const r = run({ body: f, url: URL_SPACE, arg: { vipAllUsers: true, vipAvatarBadge: true } });
  const ls = json(r).data.card.avatar.fallback_layers.layers;
  assert.strictEqual(iconTags(ls), 2, "旧 GIF 角标层剥掉后注入选定样式");
  assert.ok(!ls.some((l) => l.resource && l.resource.res_type === 4), "旧 GIF 层不存在");
});
t("审查·别人主页的专栏作者也被全员伪装（mine schema）", () => {
  const f = spaceNonMember(); f.data.card.mid = "999";
  f.data.item = [{ author: { mid: "555", name: "b", vip: { type: 0, status: 0, label: {} } } }];
  const r = run({ body: f, url: URL_SPACE, arg: { vipAllUsers: true } });
  const a = json(r).data.item[0].author;
  assert.strictEqual(a.vip.status, 1, "专栏作者跟随全员伪装");
});

// ---------- v7.40：认证闪电图标（国际版读 icon 字段） ----------
t("认证·蓝V 写 icon（企业蓝闪电真实样本 URL）", () => {
  const f = spaceNonMember();
  const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipVerify: "蓝V·企业认证" } });
  const ov = json(r).data.card.official_verify;
  assert.ok(/QFMyNuatvi\.png$/.test(ov.icon), "蓝V icon = QFMyNuatvi.png，实际 " + ov.icon);
});
t("认证·黄V 写 icon（UP主黄闪电真实样本 URL）", () => {
  const f = spaceNonMember();
  const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipVerify: "黄V·UP主认证" } });
  const ov = json(r).data.card.official_verify;
  assert.ok(/72wejSxl9Z\.png$/.test(ov.icon), "黄V icon = 72wejSxl9Z.png，实际 " + ov.icon);
});
t("认证·旧开关兼容路径同样带 icon", () => {
  const f = spaceNonMember();
  const r = run({ body: f, url: URL_SPACE, arg: { myMid: String(ME), vipFakeVerify: true } });
  assert.ok(/72wejSxl9Z\.png$/.test(json(r).data.card.official_verify.icon));
});
t("认证·全员模式下别人主页也带 icon", () => {
  const f = spaceNonMember(); f.data.card.mid = "999";
  const r = run({ body: f, url: URL_SPACE, arg: { vipAllUsers: true, vipVerify: "蓝V·企业认证" } });
  assert.ok(/QFMyNuatvi\.png$/.test(json(r).data.card.official_verify.icon));
});
console.log((process.exitCode ? "FAILED" : "OK") + "  " + pass + " cases");
