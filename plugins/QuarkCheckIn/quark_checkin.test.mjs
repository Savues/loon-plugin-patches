/*
 * quark_checkin.js 回归测试。Node 里跑：node quark_checkin.test.mjs
 *
 * mock 忠实度：$notification.post 按真实的 3 参数签名接，少接一个就漏测
 * （2026-09-29 实际发生过：只传 2 个参数，Loon 推送正文显示 null）。
 */
import { readFileSync } from "node:fs";
import assert from "node:assert";

const SRC = readFileSync(new URL("./quark_checkin.js", import.meta.url), "utf8");
const LPX = readFileSync(new URL("./QuarkCheckIn.lpx", import.meta.url), "utf8");

// 跑一次脚本，返回 { notification, done, request }
function run({ body = "", err = null, status = 200 } = {}) {
  const out = { notification: null, done: false, request: null };
  const $httpClient = {
    post(req, cb) {
      out.request = req;
      cb(err, { status }, body);
    },
  };
  // arguments 完整保留，才能检出参数个数错误
  const $notification = { post: function () { out.notification = Array.from(arguments); } };
  const $done = () => { out.done = true; };
  // eslint-disable-next-line no-new-func
  new Function("$httpClient", "$notification", "$done", SRC)($httpClient, $notification, $done);
  return out;
}

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); }
}

console.log("quark_checkin.js 回归测试\n");

/* ---------- 通知格式：3 个参数，内容非空 ---------- */

check("$notification.post 传满 3 个参数（少传 Loon 显示 null）", () => {
  const r = run({ body: '{"code":44210,"message":"cap_growth_sign_repeat"}' });
  assert.strictEqual(r.notification.length, 3, "参数个数应为 3，实际 " + r.notification.length);
});

check("通知内容永远不为 null/空", () => {
  const cases = [
    { body: '{"code":0,"data":{"sign_daily_reward":41943040}}' },
    { body: '{"code":44210,"message":"cap_growth_sign_repeat"}' },
    { body: '{"code":31001,"message":"require login [guest]"}' },
    { body: '{"code":0,"data":{}}' },
    { body: '{"code":15000,"message":"inner error"}' },
    { body: "" },
    { body: "<html>502</html>" },
    { body: "null" },
    { body: "[1,2,3]" },
    { err: "timeout" },
  ];
  for (const c of cases) {
    const [, , content] = run(c).notification;
    assert.ok(content != null, "content 是 " + content + "（用例 " + JSON.stringify(c) + "）");
    assert.notStrictEqual(String(content).trim(), "", "content 为空（用例 " + JSON.stringify(c) + "）");
  }
});

/* ---------- 异常路径不能挂死 ---------- */

check("HTML 错误页不抛异常（抛了会漏掉 $done，脚本挂到超时）", () => {
  const r = run({ body: "<html>502</html>", status: 502 });
  assert.ok(r.done, "$done 未被调用");
  assert.strictEqual(r.notification[0], "⚠️ 异常");
});

check("所有用例都执行到 $done", () => {
  for (const body of ["", "null", "[1,2,3]", "<html>x</html>", '{"code":0,"data":{}}']) {
    assert.ok(run({ body }).done, "body=" + body + " 时 $done 未被调用");
  }
});

/* ---------- 返回码判定 ---------- */

check("code 0 + 有奖励 → 签到成功并显示 MB", () => {
  const [title, , content] = run({ body: '{"code":0,"data":{"sign_daily_reward":41943040}}' }).notification;
  assert.strictEqual(title, "✅ 签到成功");
  assert.strictEqual(content, "获得 40MB");
});

check("code 44210 → 今日已签", () => {
  assert.strictEqual(run({ body: '{"code":44210,"message":"x"}' }).notification[0], "📅 今日已签");
});

check("code 31001 → 凭证失效", () => {
  assert.strictEqual(run({ body: '{"code":31001,"message":"x"}' }).notification[0], "🔑 凭证已失效");
});

check("code 0 但 data 为空 → 不误报成功（服务端假成功）", () => {
  assert.strictEqual(run({ body: '{"code":0,"data":{}}' }).notification[0], "📅 今日已签");
});

/* ---------- 请求构造 ---------- */

check("content-type 必须带：省了服务端返 code 0 但 data 为空的假成功", () => {
  assert.ok(run({ body: "{}" }).request.headers["content-type"], "content-type 缺失");
});

check("POST body 为 sign_cyclic", () => {
  assert.strictEqual(JSON.parse(run({ body: "{}" }).request.body).sign_cyclic, true);
});

check("query 必带 pr=qk_clouddrive（缺它服务端返 500 而非 401）", () => {
  assert.ok(/[?&]pr=qk_clouddrive(&|$)/.test(run({ body: "{}" }).request.url), "缺 pr");
});

check("query 必带 fr=iphone（缺它返 200 但 data 为空，读不到签到状态）", () => {
  assert.ok(/[?&]fr=iphone(&|$)/.test(run({ body: "{}" }).request.url), "缺 fr");
});

check("vcode 用内置常量，不用 Date.now() 重算（sign 锚定签发时刻）", () => {
  const url = run({ body: "{}" }).request.url;
  const m = /[?&]vcode=(\d+)/.exec(url);
  assert.ok(m, "缺 vcode");
  assert.strictEqual(m[1], "1790541592518");
  assert.ok(!/\/capacity\/growth\/info/.test(url), "不该打 info 接口");
});

check("凭证全部 URL 编码（kps/sign 含 + / =，不编码会被 query 解析截断）", () => {
  const seg = (name) => {
    const m = new RegExp("[?&]" + name + "=([^&]*)").exec(run({ body: "{}" }).request.url);
    return m && m[1];
  };
  for (const name of ["kps", "sign"]) {
    assert.ok(seg(name), "缺 " + name);
    assert.ok(!/[+/=]/.test(seg(name)), name + " 段含未编码的 + / =");
  }
});

check("node 固定 DIRECT，不吃主配置策略", () => {
  assert.strictEqual(run({ body: "{}" }).request.node, "DIRECT");
});

check("关闭 auto-cookie，凭证不外流", () => {
  assert.strictEqual(run({ body: "{}" }).request["auto-cookie"], false);
});

check("insecure 关闭，不接受伪造证书", () => {
  assert.strictEqual(run({ body: "{}" }).request.insecure, false);
});

/* ---------- 清单：开关与规则 ---------- */

check("auto 声明为 switch 且默认 false", () => {
  assert.match(LPX, /^auto\s*=\s*switch\s*,\s*false/m);
});

check("cron 挂上 enable={auto}", () => {
  assert.match(LPX, /^cron .*enable=\{auto\}$/m);
});

check("没有多余的 generic 规则（cron 本身可手动触发）", () => {
  assert.ok(!/^generic /m.test(LPX), "仍有 generic 规则");
  assert.strictEqual(LPX.split("\n").filter((l) => /^(cron|generic) /.test(l)).length, 1);
});

check("唯一那条规则带 tag，插件页上能看到", () => {
  for (const r of LPX.split("\n").filter((l) => /^(cron|generic) /.test(l))) {
    assert.match(r, /tag=/, "缺 tag: " + r);
  }
});

check("auto 的 desc 说明手动触发方式，且不提已删除的「立即签到」", () => {
  const d = /^auto\s*=.*?desc=(.*)$/m.exec(LPX)[1];
  assert.match(d, /手动触发/, "未说明手动触发");
  assert.ok(!d.includes("立即签到"), "desc 仍引用已删除的 generic 规则");
  assert.ok(!/#!desc=.*立即签到/.test(LPX), "#!desc 仍提「立即签到」");
});

check("script-path 指向本仓库托管的脚本", () => {
  const urls = [...LPX.matchAll(/script-path=(\S+?)(?:,|\s|$)/g)].map((m) => m[1]);
  assert.ok(urls.length, "没有 script-path");
  for (const u of urls) {
    assert.ok(u.startsWith("https://raw.githubusercontent.com/Savues/loon-plugin-patches/"),
      "未指向本仓库: " + u);
  }
});

check("无 MITM 段（本插件不解密任何域名）", () => {
  assert.ok(!/\[MITM\]/i.test(LPX));
});

/* ---------- 汇总 ---------- */

console.log(`\n${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
