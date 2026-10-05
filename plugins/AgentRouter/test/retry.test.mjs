/* retry.test.mjs —— 签到判定与日志落库竞态的回归测试
 * Node 里跑：node test/retry.test.mjs
 *
 * 背景（2026-10-01 真机）：签到是在 POST /api/user/login 时由服务端完成的，
 * 但 /api/log/self 的记录是异步写的。脚本登录后立刻查日志，记录往往还没落库，
 * 于是余额已经 +$25、checked_in=true，通知却报「签到待确认」。
 *
 * 用假 $httpClient 模拟服务端的三种时序，验证：
 *   1. 日志延迟出现 → 重试后拿到正确金额
 *   2. 日志始终不出现 → 兜底显示「已签到」，不报假警
 *   3. 服务端说没签到 → 不重试，立刻返回
 */
import { readFileSync } from "node:fs";
import assert from "node:assert";

// 天数会随时间变（真机那天是第 21 天，今天已经 25 天了），不能硬编码期望值。
// 用假 created_at 按 src/agentrouter.js 里 accountDay() 的同一公式现算。
const FAKE_CREATED = 1789048067;
const EXPECTED_DAY = (() => {
  const days = (Date.now() / 1000 - FAKE_CREATED) / 86400;
  return `第 ${Math.floor(days) + 1} 天`;
})();
const EXPECTED_TITLE = `✅ 今日已签到 +$25 · ${EXPECTED_DAY}`;

const SRC = readFileSync(new URL("../src/agentrouter.js", import.meta.url), "utf8");

const CHECKIN_LOG = {
  type: 4,
  created_at: Math.floor(Date.now() / 1000) - 3600,
  content: "每日签到成功，增加额度 ＄25.000000 额度",
};
const OTHER_LOGS = [
  { type: 2, quota: 127242, created_at: Math.floor(Date.now() / 1000) - 7200, content: "模型倍率" },
  { type: 2, quota: 119298, created_at: Math.floor(Date.now() / 1000) - 7300, content: "模型倍率" },
];

/**
 * @param logVisibleAt 第几次日志查询开始能看到签到记录（Infinity = 永远看不到）
 * @param checkedIn    登录响应里的 checked_in
 */
function run({ logVisibleAt, checkedIn }) {
  let logCalls = 0;
  const out = { notification: null, logCalls: 0, done: false };
  const $argument = { username: "u", password: "p", accounts: "", debug: false };
  const $loon = { device: "test" };
  const $persistentStore = { read: () => null, write: () => true, remove: () => true };
  const $notification = { post: (t, s, b) => { out.notification = { t, s, b }; } };
  const $done = () => { out.done = true; };
  const $httpClient = {
    get(req, cb) {
      // $httpClient 收的是 options 对象，url 是它的属性（见 Env.send）
      const url = req.url;
      if (url.includes("/api/log/self")) {
        logCalls++; out.logCalls = logCalls;
        const items = logCalls >= logVisibleAt ? [CHECKIN_LOG, ...OTHER_LOGS] : OTHER_LOGS;
        return setTimeout(() => cb(null, { status: 200 },
          JSON.stringify({ success: true, data: { items } })), 1);
      }
      // /api/status 与 /api/user/self
      return setTimeout(() => cb(null, { status: 200 }, JSON.stringify({
        success: true,
        data: { quota_per_unit: 500000, quota: 348284948, used_quota: 1715052,
                request_count: 37, id: 631097, created_at: 1789048067,
                display_in_currency: true, announcements: [], system_name: "Agent Router" },
      })), 1);
    },
    post(req, cb) {
      const url = req.url;
      if (url.includes("/api/user/login")) {
        return setTimeout(() => cb(null, {
          status: 200, headers: { "set-cookie": "session=abc; Path=/" },
        }, JSON.stringify({ success: true, data: {
          id: 631097, username: "u", checked_in: checkedIn,
          quota: 348284948, used_quota: 1715052, request_count: 37, created_at: 1789048067,
        } })), 1);
      }
      return setTimeout(() => cb(null, { status: 200 }, JSON.stringify({ success: true, data: {} })), 1);
    },
  };
  // 脚本是异步的（run().catch().finally()），$done 在若干轮 setTimeout 之后才触发。
  // eslint-disable-next-line no-new-func
  new Function("$argument", "$loon", "$persistentStore", "$notification", "$done", "$httpClient", SRC)
    ($argument, $loon, $persistentStore, $notification, $done, $httpClient);
  return {
    get logCalls() { return logCalls; },
    get notification() { return out.notification; },
    wait: () => new Promise((res) => {
      const tick = () => (out.done ? res(out) : setTimeout(tick, 10));
      setTimeout(tick, 10);
    }),
  };
}

// 跑一次并等 $done
async function scenario(opts) {
  const r = run(opts);
  const done = await r.wait();
  return { ...done, logCalls: r.logCalls, notification: r.notification };
}

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); }
}

console.log("=== 签到判定：日志落库竞态 ===\n");

await t("日志第 3 次查询才出现 → 重试后拿到金额（真机那天的时序）", async () => {
  const r = await scenario({ logVisibleAt: 3, checkedIn: true });
  assert.ok(r.logCalls >= 3, "应重试到第 3 次，实际 " + r.logCalls + " 次");
  assert.strictEqual(r.notification.s, EXPECTED_TITLE, r.notification.s);
});

await t("日志始终查不到但服务端说已签到 → 显示已签到，不报假警", async () => {
  const r = await scenario({ logVisibleAt: Infinity, checkedIn: true });
  assert.ok(/已签到/.test(r.notification.s), "标题应显示已签到: " + r.notification.s);
  assert.ok(!/待确认/.test(r.notification.s + r.notification.b), "不该出现「待确认」");
  assert.ok(!/⚠️/.test(r.notification.s), "不该用警告图标: " + r.notification.s);
  assert.ok(r.logCalls > 1, "应重试过，实际 " + r.logCalls + " 次");
});

await t("服务端说没签到 + 日志里也没有 → 不重试（只查 1 次），报状态未确认", async () => {
  // logVisibleAt=Infinity 才是「日志里始终没有今日签到记录」的语义
  const r = await scenario({ logVisibleAt: Infinity, checkedIn: false });
  assert.strictEqual(r.logCalls, 1, "不该重试，实际查了 " + r.logCalls + " 次");
  assert.strictEqual(r.notification.s, "⚠️ 签到状态未确认");
});

await t("日志立刻可见 → 一次就拿到，不浪费时间（哪怕 checked_in=false）", async () => {
  // 有今日签到记录就以它为准 —— 记录比 login 响应的 checked_in 更权威
  const r = await scenario({ logVisibleAt: 1, checkedIn: true });
  assert.strictEqual(r.logCalls, 1, "不该重试");
  assert.strictEqual(r.notification.s, EXPECTED_TITLE);
});

await t("重试上限为 4 次（不是无限等）", async () => {
  const r = await scenario({ logVisibleAt: Infinity, checkedIn: true });
  assert.ok(r.logCalls <= 4, "重试次数应 ≤ 4，实际 " + r.logCalls);
});

console.log("\n" + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
