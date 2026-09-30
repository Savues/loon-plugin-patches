// 用真实上游脚本跑一次签到，验证插件在 Node 里的行为。
// 凭证从 AGENTROUTER 环境变量读（格式 用户名#密码），全程不打印。
const fs = require("fs");
const path = require("path");

const RAW = process.env.AGENTROUTER || "";
const [username, password] = RAW.split("#");
if (!username || !password) {
    console.error("AGENTROUTER 格式应为 用户名#密码");
    process.exit(2);
}

// 只显示脱敏形式
const mask = (s) => (s.length <= 2 ? s[0] + "*" : s.slice(0, 2) + "*".repeat(Math.min(s.length - 2, 8)));
console.log("账号: " + mask(username) + "  密码: " + mask(password) + "\n");

const STORE = {};
global.$persistentStore = {
  read: (k) => (STORE[k] !== undefined ? STORE[k] : null),
  write: (v, k) => { STORE[k] = String(v); return true; },
  remove: () => { for (const k of Object.keys(STORE)) delete STORE[k]; return true; },
};

function real(method) {
    return function (params, cb) {
        const u = new URL(params.url);
        const mod = u.protocol === "https:" ? require("https") : require("http");
        const opts = { method, headers: params.headers || {} };
        console.log("  → " + method + " " + u.pathname);
        if (params.node) console.log("    node=" + params.node + " insecure=" + params.insecure +
            " auto-redirect=" + params["auto-redirect"] + " auto-cookie=" + params["auto-cookie"]);
        const req = mod.request(u, opts, (res) => {
            let b = "";
            res.on("data", (d) => (b += d));
            res.on("end", () => {
                // 响应里可能含账号信息，打印前先脱敏
                let safe = b;
                try {
                    const j = JSON.parse(b);
                    const scrub = (o) => {
                        if (o && typeof o === "object") {
                            for (const k of Object.keys(o)) {
                                if (/pass|token|secret|key|username|email/i.test(k)) o[k] = "***";
                                else scrub(o[k]);
                            }
                        }
                        return o;
                    };
                    safe = JSON.stringify(scrub(j), null, 1);
                } catch (e) { /* 非 JSON 原样输出，长度截断 */ }
                console.log("    ← " + res.statusCode + " " + String(safe).slice(0, 700));
                cb(null, { status: res.statusCode, headers: res.headers }, b);
            });
        });
        req.setTimeout(params.timeout || 30000, () => { req.destroy(); cb("timeout", null, null); });
        req.on("error", (e) => { console.log("    ← 错误 " + e); cb(String(e), null, null); });
        if (params.body) req.write(params.body);
        req.end();
    };
}

global.$loon = { device: "test" };
globalThis.$httpClient = { get: real("GET"), post: real("POST") };
global.$notification = { post: (t, s, b) => console.log("\n【通知】" + t + "\n  副标题: " + s + "\n  正文  : " + String(b).split("\n").join("\n           ")) };
global.$done = () => { console.log("\n[$done] 脚本结束"); process.exit(0); };
global.$argument = { username, password, accounts: "", debug: true };

const script = path.join(__dirname, "..", "src", "agentrouter.js");
eval(fs.readFileSync(script, "utf8"));
setTimeout(() => { console.log("TIMEOUT"); process.exit(1); }, 120000);
