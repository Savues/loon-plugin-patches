// 网络层重试的测试：假 $httpClient 前 N 次报错，看是否重试成功
import { readFileSync } from "node:fs";
import assert from "node:assert";
const SRC = readFileSync(new URL("../src/agentrouter.js", import.meta.url), "utf8");
const CREATED = 1789048067;
const DAY = (() => { const d = (Date.now()/1000 - CREATED)/86400; return `第 ${Math.floor(d)+1} 天`; })();

/** @param failTimes 各端点前几次请求失败（对象: {"path前缀": 次数}），statusFail 用状态码失败 */
function run({ failTimes = {}, statusFail = {} }) {
  const counts = {};
  const out = { notification: null, done: false, counts };
  const $argument = { username: "u", password: "p", accounts: "", debug: false };
  const $loon = { device: "test" };
  const $persistentStore = { read: () => null, write: () => true, remove: () => true };
  const $notification = { post: (t, s, b) => { out.notification = { t, s, b }; } };
  const $done = () => { out.done = true; };
  const LOG = [{ type: 4, created_at: Math.floor(Date.now()/1000) - 3600,
                 content: "每日签到成功，增加额度 ＄25.000000 额度" }];
  const hit = (url) => {
    for (const [k, n] of Object.entries(failTimes)) {
      if (url.includes(k) && (counts[k] = (counts[k] || 0) + 1) <= n) return true;
    }
    for (const [k, st] of Object.entries(statusFail)) {
      if (url.includes(k) && (counts[k] = (counts[k] || 0) + 1) <= st.n) return st.code;
    }
    return false;
  };
  const ok = (data) => setTimeout(() => cb2(null, { status: 200 }, JSON.stringify({ success: true, data })), 1);
  let cb2;
  const $httpClient = {
    get(req, cb) {
      cb2 = cb;
      const f = hit(req.url);
      if (f === true) return setTimeout(() => cb("The request timed out.", null, null), 1);
      if (typeof f === "number") return setTimeout(() => cb(null, { status: f }, ""), 1);
      if (req.url.includes("/api/log/self")) return ok({ items: LOG });
      return ok({ quota_per_unit: 500000, quota: 348284948, used_quota: 1715052,
                  request_count: 37, id: 631097, created_at: CREATED,
                  display_in_currency: true, announcements: [], system_name: "Agent Router" });
    },
    post(req, cb) {
      cb2 = cb;
      const f = hit(req.url);
      if (f === true) return setTimeout(() => cb("The request timed out.", null, null), 1);
      if (typeof f === "number") return setTimeout(() => cb(null, { status: f }, ""), 1);
      return setTimeout(() => cb(null, { status: 200, headers: { "set-cookie": "session=a; Path=/" } },
        JSON.stringify({ success: true, data: { id: 631097, username: "u", checked_in: true,
          quota: 348284948, used_quota: 1715052, created_at: CREATED } })), 1);
    },
  };
  const q = console.log; console.log = () => {};
  new Function("$argument","$loon","$persistentStore","$notification","$done","$httpClient",SRC)
    ($argument, $loon, $persistentStore, $notification, $done, $httpClient);
  console.log = q;
  return { ...out, counts, get notification() { return out.notification; },
    wait: () => new Promise((res) => { const t = () => (out.done ? res(out) : setTimeout(t, 10)); setTimeout(t, 10); }) };
}
async function scenario(o) { const r = run(o); await r.wait(); return { notification: r.notification, counts: r.counts }; }

let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); } }

console.log("=== 网络层重试（cron 每天 09:00 失败的那个场景）===\n");

await t("余额查询前 2 次网络失败 → 重试后成功", async () => {
  const r = await scenario({ failTimes: { "/api/user/self": 2 } });
  assert.strictEqual(r.notification.s, `✅ 今日已签到 +$25 · ${DAY}`, r.notification.s);
  assert.ok(!/失败/.test(r.notification.b), "不该再有失败提示: " + r.notification.b);
});

await t("登录本身失败 2 次 → 重试后成功（POST 也重试）", async () => {
  const r = await scenario({ failTimes: { "/api/user/login": 2 } });
  assert.strictEqual(r.notification.s, `✅ 今日已签到 +$25 · ${DAY}`, r.notification.s);
  assert.ok(r.counts["/api/user/login"] >= 3, "应重试到第 3 次，实际 " + r.counts["/api/user/login"]);
});

await t("前 2 次失败 + 第 3 次成功 → 总共发 3 次", async () => {
  const r = await scenario({ failTimes: { "/api/user/self": 2 } });
  assert.strictEqual(r.counts["/api/user/self"], 3, "应恰好 3 次，实际 " + r.counts["/api/user/self"]);
});

await t("全部 3 次都失败 → 报错带出底层错误原文", async () => {
  const r = await scenario({ failTimes: { "/api/user/self": 99 } });
  assert.ok(/timed out/i.test(r.notification.b), "应带出底层错误: " + r.notification.b);
});

await t("HTTP 500 → 重试；HTTP 403 → 不重试", async () => {
  const r500 = await scenario({ statusFail: { "/api/user/self": { n: 2, code: 500 } } });
  assert.strictEqual(r500.notification.s, `✅ 今日已签到 +$25 · ${DAY}`, "500 重试后应成功");
  const r403 = await scenario({ statusFail: { "/api/user/self": { n: 9, code: 403 } } });
  assert.ok(/403/.test(r403.notification.b), "403 应报出来: " + r403.notification.b);
  assert.ok(!/403/.test(r403.notification.s), "403 不该显示成成功");
});

console.log("\n" + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
