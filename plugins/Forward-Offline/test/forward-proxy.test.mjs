/*
 * forward-proxy.test.mjs — forward-proxy.js 的回归测试
 * 运行：node test/forward-proxy.test.mjs
 *
 * 用 Node vm 模拟 Loon 运行时。两个关键点：
 *   1. $httpClient.post 是回调式且返回 undefined —— 与真实 Loon 一致。
 *      写成 .then() 会在真机上抛错并静默失败，这里让 sandbox 直接暴露它。
 *   2. $request.headers 的头名大小写混用，与真机一致。
 */
import fs from "fs";
import vm from "vm";
import path from "path";
import { fileURLToPath } from "url";

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(here, "forward-proxy.js"), "utf8");

let pass = 0, fail = 0;
const ok = (c, name, extra = "") => {
  if (c) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra); }
};

const TARGET = "https://mock.forward1.workers.dev/forward/v1/purchase/iap/subscription";

// 只看代码行，排除注释 —— 注释里正好写了这两个 API 名（作为踩坑记录）
const code = src.split("\n").filter(l => !/^\s*(\/\/|\*)/.test(l)).join("\n");

function run({ headers = {}, body = "BODY" } = {}) {
  const box = { calls: [], done: null, error: null, cb: null };
  const sandbox = {
    $request: { url: "https://fluxapi.vvebo.vip/v1/purchase/iap/subscription",
                method: "POST", headers, body },
    // 真实 Loon：$httpClient.post 返回 undefined，没有 then()
    $httpClient: {
      post(params, cb) {
        box.calls.push(params);
        box.cb = cb;   // 测试稍后手动触发，覆盖各种分支
      },
    },
    $done: o => { box.done = o; },
    console,
  };
  try {
    vm.runInContext(src, vm.createContext(sandbox));
  } catch (e) {
    box.error = e;
  }
  return box;
}

const OK = (err, resp, data) => [err, resp || { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }, data === undefined ? "CREDS" : data];

console.log("【1】API 形态：必须是回调式 $httpClient.post");
{
  const b = run();
  ok(!b.error, "脚本无异常", b.error && b.error.message);
  ok(b.calls.length === 1, "调用了一次 $httpClient.post", `实际 ${b.calls.length}`);
  ok(/\$httpClient\.post\(/.test(src), "用的是 $httpClient.post");
  ok(!/\$task\.fetch/.test(code), "没有误用 Surge 的 $task.fetch");
  // 回归防护：Promise 写法在 Loon 上因 undefined.then 抛错并静默失败
  ok(!/\$httpClient\.post\([\s\S]*?\)\s*\n?\s*\.then/.test(code), "没有把 post() 当 Promise 用");
  ok(!/\$httpClient[\s\S]{0,60}?\.then\s*\(/.test(code), "代码里没有 $httpClient...then()");
}

console.log("\n【2】转发目标与请求体");
{
  const b = run();
  ok(b.calls[0].url === TARGET, `目标 = ${TARGET}`, b.calls[0].url);
  ok(b.calls[0].body === "BODY", "请求体原样透传（不改写）");
  ok(b.calls[0].timeout === 15000, "设置了 timeout=15000", `实际 ${b.calls[0].timeout}`);
}

console.log("\n【3】请求头：全转发，但排除会改变 body 形态的");
{
  const b = run({ headers: {
    "x-auth-key": "AUTHKEY", "x-timestamp": "1790669202",
    "x-signature": "SIG", "authorization": "Bearer TOK",
    "content-type": "application/json", "accept": "*/*",
    "accept-language": "zh-Hans-US;q=1.0",
    "user-agent": "Forward-Simulator/1.3.13",
    "cookie": "acw_tc=xxx",
    "accept-encoding": "br", "content-length": "216", "host": "fluxapi.vvebo.vip",
  } });
  const h = b.calls[0].headers;
  ok(h["x-auth-key"] === "AUTHKEY", "X-Auth-Key 已转发（实测唯一必需项）");
  ok(h["x-timestamp"] === "1790669202", "x-timestamp 已转发");
  ok(h["x-signature"] === "SIG", "x-signature 已转发");
  ok(h["authorization"] === "Bearer TOK", "authorization 已转发");
  ok(h["user-agent"] === "Forward-Simulator/1.3.13", "user-agent 已转发");
  ok(h["cookie"] === "acw_tc=xxx", "cookie 已转发");
  const lower = Object.keys(h).map(k => k.toLowerCase());
  ok(!lower.includes("accept-encoding"), "不转发 accept-encoding（br/gzip 改变传输形态）");
  ok(!lower.includes("content-length"), "不转发 content-length（body 未改）");
  ok(!lower.includes("host"), "不转发 host（目标主机不同）");
}

console.log("\n【4】头名大小写不敏感");
{
  const b = run({ headers: { "X-Auth-Key": "K", "Accept-Encoding": "br", "Content-Length": "9" } });
  const lower = Object.keys(b.calls[0].headers).map(k => k.toLowerCase());
  ok(lower.includes("x-auth-key"), "大写 X-Auth-Key 已转发");
  ok(!lower.includes("accept-encoding"), "大写 Accept-Encoding 也被排除");
  ok(!lower.includes("content-length"), "大写 Content-Length 也被排除");
}

console.log("\n【5】content-type 缺省时补上");
{
  const b = run({ headers: { "x-auth-key": "K" } });
  const ct = Object.keys(b.calls[0].headers).find(k => k.toLowerCase() === "content-type");
  ok(ct && b.calls[0].headers[ct] === "application/json", "缺省补 application/json",
     JSON.stringify(b.calls[0].headers));
}

console.log("\n【6】成功时原样送回服务器响应");
{
  const b = run();
  b.cb(...OK());
  const r = b.done && b.done.response;
  ok(!!r, "$done({response:{...}}) 形态", JSON.stringify(b.done));
  ok(r && r.status === 200, "状态码透传 200", JSON.stringify(r));
  ok(r && r.body === "CREDS", "响应体原样透传（不解析、不改写）");
  ok(r && r.headers["content-type"] === "application/json; charset=utf-8",
     "content-type 取自服务器响应");
}

console.log("\n【7】服务器没给 content-type 时有兜底");
{
  const b = run();
  b.cb(null, { status: 200, headers: {} }, "X");
  ok(b.done.response.headers["content-type"] === "application/json; charset=utf-8",
     "兜底默认值", JSON.stringify(b.done));
}

console.log("\n【8】非 2xx 放行原请求（不把解不开的降级凭据喂给 App）");
for (const st of [386, 400, 500, 302]) {
  const b = run();
  b.cb(null, { status: st, headers: {} }, "DEGRADED");
  ok(JSON.stringify(b.done) === "{}", `status=${st} 时 $done({}) 放行`, JSON.stringify(b.done));
}

console.log("\n【9】网络异常时放行原请求");
{
  const b = run();
  b.cb("timeout", null, null);
  ok(JSON.stringify(b.done) === "{}", "$done({}) 放行", JSON.stringify(b.done));
}

console.log("\n【10】脚本不含任何本地加解密（密钥在服务器侧）");
{
  ok(!/crypto|subtle|AES|encrypt|decrypt/i.test(code), "无加解密调用");
  ok(!/Math\.random/.test(code), "不生成随机数（凭据由服务器造）");
  ok(code.includes("$httpClient"), "唯一的凭据来源是转发");
}

console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
