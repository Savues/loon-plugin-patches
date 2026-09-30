/*
 * AgentRouter 回归测试。Node 里跑：node test/manifest.test.mjs
 *
 * 覆盖两层：
 *   清单 —— 开关默认关闭、cron 挂上开关、手动触发不受开关控制，
 *           上游的 Argument / argument= 对应关系没被改坏；
 *   脚本 —— src/agentrouter.js 相对上游原件只改了奖励金额的正则，
 *           且这份修改确实生效（拿服务端实测返回的那句话喂进去）。
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert";

const ROOT = new URL("../", import.meta.url);
const lpx = readFileSync(new URL("AgentRouter.lpx", ROOT), "utf8");
const src = readFileSync(new URL("src/agentrouter.js", ROOT), "utf8");
const upstream = readFileSync(new URL("src/upstream-agentrouter.js", ROOT), "utf8");

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); }
}

console.log("AgentRouter 清单回归测试\n");

/* ---------- 开关 ---------- */

t("auto 声明为 switch 且默认 false", () => {
  assert.match(lpx, /^auto\s*=\s*switch\s*,\s*false/m);
});

t("cron 挂上 enable={auto}", () => {
  assert.match(lpx, /^cron .*enable=\{auto\}$/m);
});

t("没有残留无条件 enable=true（开关才是唯一入口）", () => {
  assert.ok(!lpx.includes("enable=true"), "仍有 enable=true");
});

/* ---------- 手动触发 ---------- */

t("没有多余的 generic 规则（cron 本身可手动触发）", () => {
  assert.ok(!/^generic /m.test(lpx), "仍有 generic 规则");
  assert.strictEqual(lpx.split("\n").filter(l => /^(cron|generic) /.test(l)).length, 1);
});

t("唯一那条规则带 tag，插件页上能看到", () => {
  const rules = lpx.split("\n").filter(l => /^(cron|generic) /.test(l));
  for (const r of rules) assert.ok(/tag=/.test(r), "缺 tag: " + r);
});

/* ---------- 上游 Argument 完整保留 ---------- */

const UPSTREAM_ARGS = ["username", "password", "accounts", "debug"];

t("上游 4 个 Argument 一条没删", () => {
  for (const k of UPSTREAM_ARGS) {
    assert.match(lpx, new RegExp("^" + k + "\\s*=", "m"), "丢了 " + k);
  }
});

t("argument= 仍是上游那 4 个 key（auto 是纯开关，不进列表）", () => {
  const m = /argument=\[([^\]]*)\]/.exec(lpx);
  assert.ok(m, "没有 argument=");
  assert.deepStrictEqual(m[1].split(",").map(s => s.trim().replace(/[{}]/g, "")), UPSTREAM_ARGS);
});

t("argument= 只出现一次（唯一那条 cron）", () => {
  const all = [...lpx.matchAll(/argument=\[([^\]]*)\]/g)].map(m => m[1]);
  assert.strictEqual(all.length, 1, "argument= 出现 " + all.length + " 次");
});

/* ---------- 脚本层托管且逐字节未改 ---------- */

t("script-path 全部指向本仓库托管的副本", () => {
  const urls = [...lpx.matchAll(/script-path=(\S+?)(?:,|\s|$)/g)].map(m => m[1]);
  assert.ok(urls.length, "没有 script-path");
  for (const u of urls) {
    assert.ok(u.startsWith("https://raw.githubusercontent.com/Savues/loon-plugin-patches/"),
              "仍指向上游: " + u);
  }
});

t("托管的脚本与清单原件都在仓库里", () => {
  for (const f of ["src/agentrouter.js", "src/upstream-agentrouter.js",
                   "upstream-agentrouter.lpx"]) {
    assert.ok(existsSync(new URL(f, ROOT)), "缺 " + f);
  }
});

t("上游原件确实没被改动过（改动只发生在副本上）", () => {
  const m = JSON.parse(readFileSync(new URL("manifest.json", ROOT), "utf8"));
  const actual = createHash("sha256").update(upstream).digest("hex");
  assert.strictEqual(actual,
    m.sources["plugins/AgentRouter/src/upstream-agentrouter.js"].sha256);
  assert.strictEqual(m.sources["plugins/AgentRouter/src/upstream-agentrouter.js"].bytes, 16104);
});

t("副本相对原件：删掉的行都有出处，且该删的都删了", () => {
  // 这里只管**删除侧**。新增/改写侧不再逐行列白名单 ——
  // formatStats / averageDailySpend 整个函数体都是新写的，逐行列必然漏，
  // 漏一条就误报，白名单也就失去了意义。
  // 改动的**行为正确性**由 test/stats.test.cjs 覆盖（纯函数，不联网，10 条用例），
  // 关键的几条结构断言也单列在下面。
  const a = upstream.split("\n");
  const b = src.split("\n").filter(l => !l.includes("U+FF04"));
  const removed = a.filter(l => !new Set(b).has(l));

  const isKnownRemoved = (l) =>
    /maskAccount|username\.split|name\.length|^function formatAmount|^\}$|^$/.test(l)
    || /match\(\/\^每日签到成功/.test(l)          // 旧正则
    || /findTodayCheckin|签到记录|log\/self|checkinRecord|let detail|detail =|最近记录数|今日签到记录/.test(l)
    || /累计调用|request_count|stats =|stats \+=|const user = profile/.test(l)
    || /const items = logs\.json\.data\.items;/.test(l);
  for (const r of removed) {
    assert.ok(isKnownRemoved(r), "删掉了预期外的行: " + JSON.stringify(r));
  }
  // 上游的 maskAccount 整块确实没了
  assert.ok(removed.some(l => l.startsWith("function maskAccount")), "应删掉 maskAccount 定义");
  assert.ok(removed.some(l => l.includes("maskAccount(accounts[0].username)")), "应删掉单账号那处调用");
  assert.ok(removed.some(l => l.includes("maskAccount(accounts[i].username)")), "应删掉多账号那处调用");
  assert.ok(!/maskAccount/.test(src), "仍有 maskAccount 引用");

  // 该加的都在
  assert.ok(src.includes("function formatStats"), "应新增 formatStats");
  assert.ok(src.includes("function averageDailySpend"), "应新增 averageDailySpend");
  assert.ok(src.includes("[$＄]"), "改后的正则没收全角 ＄");
  assert.ok(src.includes("📅 今日消耗"), "应显示今日消耗");
  assert.ok(src.includes("⏳ 按当前用量约可用"), "应显示可用天数外推");
});

t("签到判定和用量统计共用同一页日志（只拉一次）", () => {
  // 两次 /api/log/self 就是白拉一次；findTodayCheckin 与 formatStats 应收同一个 items
  const calls = [...src.matchAll(/request\("GET", "\/api\/log\/self/g)];
  assert.strictEqual(calls.length, 1, "log/self 被请求了 " + calls.length + " 次");
  assert.match(src, /const checkinRecord = items \? findTodayCheckin\(items, Date\.now\(\)\) : null;/);
  assert.match(src, /stats = formatStats\(profile\.json\.data, items, quotaUnit\);/);
});

t("签到记录的 quota 字段为 0，奖励金额只能靠解析文案", () => {
  // 2026-09-30 真机实测：type=4 的记录 quota=0，内容里才有金额。
  // 这条断言是提醒：别想着改用 quota 字段取奖励金额。
  assert.match(src, /系统日志的 quota 不是奖励/);
});

t("奖励金额正则收全角 ＄（U+FF04）—— 服务端实测返回的就是全角", () => {
  const rx = /每日签到成功，\s*增加额度\s*[$＄]\s*(\d+(?:\.\d+)?)\s*额度$/;
  const m = "每日签到成功，增加额度 ＄25.000000 额度".trim().match(rx);
  assert.ok(m, "全角 ＄ 匹配失败");
  assert.strictEqual(Number(m[1]), 25);
  assert.ok("每日签到成功，增加额度 $25.00 额度".trim().match(rx), "半角 $ 匹配失败");
});

t("脚本源码里那条正则确实半角全角都收", () => {
  assert.ok(src.includes("[$＄]"), "未找到同时含半角 $ 与全角 ＄ 的字符类");
});

t("manifest.json 登记了这两个文件", () => {
  const m = JSON.parse(readFileSync(new URL("manifest.json", ROOT), "utf8"));
  for (const f of ["plugins/AgentRouter/src/agentrouter.js",
                   "plugins/AgentRouter/upstream-agentrouter.lpx"]) {
    assert.ok(m.sources[f], "manifest 未登记 " + f);
    assert.match(m.sources[f].sha256, /^[0-9a-f]{64}$/);
  }
});

t("清单原件与上游脚本原件的 sha256 都与 manifest 一致", () => {
  const m = JSON.parse(readFileSync(new URL("manifest.json", ROOT), "utf8"));
  for (const f of ["upstream-agentrouter.lpx", "src/upstream-agentrouter.js"]) {
    const actual = createHash("sha256").update(readFileSync(new URL(f, ROOT))).digest("hex");
    assert.strictEqual(actual, m.sources["plugins/AgentRouter/" + f].sha256, f + " 已被改动");
    assert.match(m.sources["plugins/AgentRouter/" + f].upstream,
      /^https:\/\/raw\.githubusercontent\.com\/MaYIHEI\//);
  }
  // 改过的副本单独登记，标注 based-on，不参与漂移比对
  // 注意：based-on 带连字符，必须用方括号取，不能写 patched.based-on
  const patched = m.sources["plugins/AgentRouter/src/agentrouter.js"];
  assert.strictEqual(patched["origin"], "patched-upstream");
  assert.strictEqual(patched["based-on"], "plugins/AgentRouter/src/upstream-agentrouter.js");
});

t("icon 仍指向上游（每次现取，不托管）", () => {
  assert.match(lpx, /^#!icon=https:\/\/raw\.githubusercontent\.com\/MaYIHEI\//m);
});

t("无 MITM 段（本插件不解密任何域名）", () => {
  assert.ok(!/\[MITM\]/i.test(lpx));
});

/* ---------- 元信息 ---------- */

t("保留原作者署名", () => {
  assert.ok(lpx.includes("773075692") && lpx.includes("MaYIHEI"));
});

t("标注修改版与仓库地址", () => {
  assert.ok(/^#!author=.*Savues/m.test(lpx), "author 未标注修改版");
  assert.ok(/^#!homepage=https:\/\/github\.com\/Savues\/loon-plugin-patches/m.test(lpx));
});

t("desc 说明了默认值与手动触发方式", () => {
  const d = /^#!desc=(.*)$/m.exec(lpx)[1];
  assert.ok(/默认关闭/.test(d), "desc 未说明默认关闭");
  assert.ok(/手动触发/.test(d), "desc 未说明手动触发");
  assert.ok(!/「立即签到」/.test(d), "desc 仍引用已删除的 generic 规则");
});

/* ---------- 汇总 ---------- */

console.log(`\n${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);