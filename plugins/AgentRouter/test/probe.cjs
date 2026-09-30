// 探查：签到记录里的 quota / other 等结构化字段，看能否替代解析文案
const https = require("https");
const [USER, PASS] = process.env.AGENTROUTER.split("#");
const BASE = "https://agentrouter.org";

function call(pathname, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(BASE + pathname, { method, headers }, (r) => {
      let b = "";
      r.on("data", (d) => (b += d));
      r.on("end", () => resolve({ status: r.statusCode, headers: r.headers, body: b }));
    });
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
const J = (r) => { try { return JSON.parse(r.body); } catch (e) { return null; } };
const ts = (s) => new Date(s * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Taipei" });

(async () => {
  const H = { "Content-Type": "application/json", Accept: "application/json",
              "User-Agent": "Mozilla/5.0", Origin: BASE, Referer: BASE + "/login" };
  const login = await call("/api/user/login", "POST", H, JSON.stringify({ username: USER, password: PASS }));
  const j = J(login);
  const cookie = (login.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
  const U = { ...H, Cookie: cookie, "New-API-User": String(j.data.id) };
  const st = J(await call("/api/status", "GET", H)).data;
  const qpu = st.quota_per_unit;
  const logs = J(await call("/api/log/self?p=1&page_size=20", "GET",
                            { ...U, Referer: BASE + "/console/log" })).data;

  const signin = logs.items.filter((i) => i.type === 4);
  console.log("签到记录逐条（quota_per_unit=" + qpu + "）:");
  for (const it of signin.slice(0, 5)) {
    console.log("  " + ts(it.created_at));
    console.log("    quota      =", it.quota, " → $" + (it.quota / qpu).toFixed(2));
    console.log("    content    =", JSON.stringify(it.content));
    console.log("    other      =", JSON.stringify(it.other));
    console.log("    token/model=", JSON.stringify(it.token_name), JSON.stringify(it.model_name));
  }

  const usage = logs.items.filter((i) => i.type === 2);
  console.log("\n用量类日志 (type=2) 本页 " + usage.length + " 条，示例:");
  for (const it of usage.slice(0, 3)) {
    console.log("  " + ts(it.created_at) + "  model=" + it.model_name
      + "  quota=" + it.quota + " ($" + (it.quota / qpu).toFixed(4) + ")"
      + "  用时=" + it.use_time + "s  tokens=" + it.prompt_tokens + "+" + it.completion_tokens);
  }
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayUsage = usage.filter((i) => i.created_at >= todayStart.getTime() / 1000);
  console.log("  今日用量条数:", todayUsage.length, " 今日消耗 $"
    + (todayUsage.reduce((s, i) => s + (i.quota || 0), 0) / qpu).toFixed(4));

  console.log("\n连续签到统计:");
  const days = [...new Set(signin.map((i) => new Date(i.created_at * 1000).toDateString()))];
  console.log("  本页 " + signin.length + " 条签到记录，跨 " + days.length + " 个自然日");
  console.log("  日志总数 " + logs.total + "，本页只取了 " + logs.items.length
    + " → 更早的签到记录看不到，连签天数算不准");
})().catch((e) => console.log("ERR", e.message));
