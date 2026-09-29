/*
 * forward-proxy.test.mjs — forward-proxy.js 的回归测试
 * 运行：node test/forward-proxy.test.mjs
 *
 * 用 Node vm 模拟 Loon 运行时（$request / $httpClient / $done），
 * 断言脚本转发的目标 URL、请求头、请求体，以及各种失败分支的降级行为。
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

function run({ headers = {}, body = "BODY", fetchImpl } = {}) {
  const box = { calls: [], done: null };
  const fetchDef = fetchImpl || (() => Promise.resolve({
    status: 200, headers: { "content-type": "application/json; charset=utf-8" }, body: "CREDS",
  }));
  const sandbox = {
    $request: { url: "https://fluxapi.vvebo.vip/v1/purchase/iap/subscription",
                method: "POST", headers, body },
    $httpClient: { fetch: o => { box.calls.push(o); return fetchDef(o); } },
    $done: o => { box.done = o; },
    console,
  };
  vm.runInContext(src, vm.createContext(sandbox));
  return box;
}
// vm 跨 realm 的 Promise 微任务在 immediates 之前就排空，
// setImmediate 抓不到，必须用 setTimeout 让出事件循环
const tick = () => new Promise(r => setTimeout(r, 20));

console.log("【1】转发目标与请求体");
{
  const { calls } = run();
  ok(calls.length === 1, "发起了一次转发", `实际 ${calls.length}`);
  ok(calls[0].url === TARGET, `目标 = ${TARGET}`, calls[0].url);
  ok(calls[0].method === "POST", "方法 POST");
  ok(calls[0].body === "BODY", "请求体原样透传（不改写）");
  ok(calls[0].timeout === 15, "设置了 timeout=15", `实际 ${calls[0].timeout}`);
}

console.log("\n【2】请求头：全转发，但排除会改变 body 形态的");
{
  const { calls } = run({ headers: {
    "x-auth-key": "AUTHKEY", "x-timestamp": "1790667962",
    "x-signature": "SIG", "authorization": "Bearer TOK",
    "content-type": "application/json", "accept": "*/*",
    "accept-language": "zh-Hans-US;q=1.0",
    "user-agent": "Forward-Simulator/1.3.13",
    "cookie": "acw_tc=xxx",
    "accept-encoding": "br", "content-length": "216", "host": "fluxapi.vvebo.vip",
  } });
  const h = calls[0].headers;
  ok(h["x-auth-key"] === "AUTHKEY", "X-Auth-Key 已转发（实测唯一必需项）");
  ok(h["x-timestamp"] === "1790667962", "x-timestamp 已转发");
  ok(h["x-signature"] === "SIG", "x-signature 已转发");
  ok(h["authorization"] === "Bearer TOK", "authorization 已转发");
  ok(h["user-agent"] === "Forward-Simulator/1.3.13", "user-agent 已转发");
  ok(h["cookie"] === "acw_tc=xxx", "cookie 已转发");
  const lower = Object.keys(h).map(k => k.toLowerCase());
  ok(!lower.includes("accept-encoding"), "不转发 accept-encoding（br/gzip 会改变传输形态）");
  ok(!lower.includes("content-length"), "不转发 content-length（body 未改，由运行时重算）");
  ok(!lower.includes("host"), "不转发 host（目标主机不同）");
}

console.log("\n【3】content-type 缺省时补上");
{
  const { calls } = run({ headers: { "x-auth-key": "K" } });
  const ct = Object.keys(calls[0].headers).find(k => k.toLowerCase() === "content-type");
  ok(ct && calls[0].headers[ct] === "application/json", "缺省补 application/json",
     JSON.stringify(calls[0].headers));
}

console.log("\n【4】只有 X-Auth-Key 也能转发（实测该头唯一必需）");
{
  const { calls } = run({ headers: { "x-auth-key": "ONLY-THIS" } });
  ok(calls[0].headers["x-auth-key"] === "ONLY-THIS", "单一头照常转发");
  ok(Object.keys(calls[0].headers).length === 2, "共 2 个头（auth-key + content-type）",
     `实际 ${Object.keys(calls[0].headers)}`);
}

console.log("\n【4b】大写头名也能识别（大小写不敏感排除）");
{
  const { calls } = run({ headers: { "X-Auth-Key": "K", "Accept-Encoding": "br", "Content-Length": "9" } });
  const lower = Object.keys(calls[0].headers).map(k => k.toLowerCase());
  ok(lower.includes("x-auth-key"), "大写 X-Auth-Key 已转发");
  ok(!lower.includes("accept-encoding"), "大写 Accept-Encoding 也被排除");
  ok(!lower.includes("content-length"), "大写 Content-Length 也被排除");
}

console.log("\n【5】成功时原样送回服务器响应");
{
  const box = run();
  await tick();
  const r = box.done && box.done.response;
  ok(!!r, "$done({response:{...}}) 形态", JSON.stringify(box.done));
  ok(r && r.status === 200, "状态码透传 200", JSON.stringify(r));
  ok(r && r.body === "CREDS", "响应体原样透传（不解析、不改写）");
  ok(r && r.headers["content-type"] === "application/json; charset=utf-8",
     "content-type 取自服务器响应");
}

console.log("\n【6】服务器返回非 2xx 时放行原请求（不喂降级凭据给 App）");
{
  const box = run({ fetchImpl: () => Promise.resolve({ status: 386, headers: {}, body: "DEGRADED" }) });
  await tick();
  ok(JSON.stringify(box.done) === "{}", "$done({}) 放行", JSON.stringify(box.done));
}

console.log("\n【7】网络异常时放行原请求（App 至少能拿到合法未订阅响应）");
{
  const box = run({ fetchImpl: () => Promise.reject(new Error("timeout")) });
  await tick();
  ok(JSON.stringify(box.done) === "{}", "$done({}) 放行", JSON.stringify(box.done));
}

console.log("\n【8】服务器没给 content-type 时有兜底");
{
  const box = run({ fetchImpl: () => Promise.resolve({ status: 200, headers: {}, body: "X" }) });
  await tick();
  ok(box.done.response.headers["content-type"] === "application/json; charset=utf-8", "兜底默认值", JSON.stringify(box.done));
}

console.log("\n【9】脚本不含任何本地加解密（密钥在服务器侧）");
{
  ok(!/crypto|subtle|AES|encrypt|decrypt/i.test(src), "无加解密调用");
  ok(!/Math\.random/.test(src), "不生成随机数（凭据由服务器造）");
  ok(src.includes("$httpClient"), "唯一的凭据来源是转发");
}

console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
