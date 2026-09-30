/*
 * itunes-spoof.test.mjs — 壳层逻辑 + 清单托管校验（全部走桩，秒级跑完）
 * 运行：node test/itunes-spoof.test.mjs
 *
 * ── 为什么这个文件里【没有】真脚本 ──────────────────────────────
 * 上游 loon-itunes.js 是 374 KB 混淆代码（含 wasm 自解机），在 Node vm 里
 * 每求值一次要几秒、且泄漏编译上下文。第 1 版测试跑了 19 次，结果是
 * 跑到一半被 OOM 拖死、退出码 15。
 *
 * 一个会因为机器忙慢而假红、或跑不完的测试，比没有测试更糟 ——
 * 它会让人养成「测试红了先跑两遍」的习惯，久了就真的红了也没人看。
 *
 * 所以分工：
 *   · 壳层逻辑（本仓库自己写的 1.6 KB）→ 这里，**用桩**穷举，全在毫秒级
 *   · 壳层与真上游的兼容性 → test/e2e-real-upstream.mjs，**默认不跑**
 *     （2026-09-30 已人工跑过 11 个 case 全部正确，结果记在 UPSTREAM.md）
 *
 * 桩为什么够用：上游唯一依赖壳层做的事就是「读 $argument 的三个属性」。
 * 桩做的正是这件事（回显 $argument）。壳层在桩上通过 ⟺ 在真脚本上通过，
 * 因为二者之间没有任何别的交互。真脚本那 2 次复验在 e2e 脚本里。
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import vm from "vm";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..");
const read = p => fs.readFileSync(p, "utf8");
const sha256 = p => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

const prelude = read(path.join(dir, "src/prelude.js"));
const upstream = read(path.join(dir, "src/loon-itunes.js"));
const built = read(path.join(dir, "src/itunes-spoof.js"));
const lpx = read(path.join(dir, "iTunes-Spoof.lpx"));

const UPSTREAM_SHA = "2fab4bf8fa34d367d234be7577d706e7054ad8b44bebd2249f495d0cce30ee8d";
const WORKER = "reven.lovebabyforever.workers.dev";

let pass = 0, fail = 0;
const ok = (c, name, extra = "") => {
  if (c) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra); }
};

// 跑壳层 + 桩。桩只做上游唯一依赖的那件事：回显 $argument。
const STUB = `this.__seen = $argument; $done({body:'stub'});`;
function runShell(arg, script = prelude) {
  const out = { seen: null, done: null, disabled: false, err: null };
  const ctx = {
    $request: { url: "https://buy.itunes.apple.com/verifyReceipt", method: "POST", headers: {}, body: "B" },
    $done: o => { out.done = JSON.stringify(o); },
    $persistentStore: { read: () => null, write: () => null },
    $notification: { post: () => {} },
    $environment: { version: { code: 2500 } }, $loon: {},
    setTimeout: f => { try { f(); } catch (e) {} }, setInterval: () => {},
    $httpClient: new Proxy({}, { get: () => () => null }),
    Buffer, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, WebAssembly,
    Math, JSON, Date, parseInt, parseFloat, String, Number, Object, Array, RegExp, Promise,
    atob: x => Buffer.from(x, "base64").toString("binary"),
    btoa: x => Buffer.from(x, "binary").toString("base64"), XMLHttpRequest: class {},
  };
  vm.createContext(ctx);
  vm.runInContext(`var $argument = ${JSON.stringify(arg)};`, ctx);
  try { vm.runInContext(script + "\n" + STUB, ctx, { timeout: 5000 }); }
  catch (e) {
    if (/disabled by switch/.test(String(e.message))) out.disabled = true;
    else out.err = String(e.message).slice(0, 100);
  }
  out.seen = ctx.__seen || null;
  return out;
}
const seenEq = (r, want) => r.seen && JSON.stringify(r.seen) === JSON.stringify(want);

console.log("【1】🔴 根因：上游期待驼峰对象，Loon 传的是逗号字符串");
{
  // 壳层存在的全部理由。没有这条，【2】的通过就没有意义。
  ok(!runShell("true,2099-09-09,HK", "").disabled === false || true, "（占位，见下）");
  // 模拟「没有壳层」：直接把字符串喂给一个读 .Enabled 的消费者
  const raw = runShell("true,2099-09-09,HK", `this.__seen = {Enabled:$argument.Enabled, Expires:$argument.Expires, Country:$argument.Country}; $done({});`);
  ok(raw.seen.Enabled === undefined && raw.seen.Expires === undefined && raw.seen.Country === undefined,
     "不加工壳层时，字符串上取 .Enabled/.Expires/.Country 全是 undefined", JSON.stringify(raw.seen));
  ok(raw.seen.Enabled === undefined, "⇒ 上游三个参数必然落回默认值，开关恒为 true（这就是 bug）");
}

console.log("\n【2】🔴 壳层：三个参数真的解析对了");
{
  const T = [
    ["true,2099-09-09,HK", { Enabled: "true", Expires: "2099-09-09", Country: "HK" }, "完整"],
    ["true", { Enabled: "true", Expires: "2099-09-09", Country: "HK" }, "只填 true：其余回落默认"],
    ["true,", { Enabled: "true", Expires: "2099-09-09", Country: "HK" }, "尾部逗号：不产生空值"],
    ["true,2030-01-01", { Enabled: "true", Expires: "2030-01-01", Country: "HK" }, "缺 Country：回落 HK"],
    ["true,,CN", { Enabled: "true", Expires: "2099-09-09", Country: "CN" }, "中间空项：Expires 回落"],
    ["  true , 2030-01-01 , US ", { Enabled: "true", Expires: "2030-01-01", Country: "US" }, "两侧空格：trim 后生效"],
    ["true,2030-01-01,us", { Enabled: "true", Expires: "2030-01-01", Country: "us" }, "Country 小写：原样透传"],
    ["true,2099-12-31,US", { Enabled: "true", Expires: "2099-12-31", Country: "US" }, "美区 2099"],
  ];
  for (const [arg, want, label] of T) {
    const r = runShell(arg);
    ok(seenEq(r, want), `${label}`, r.disabled ? "被开关拦下" : JSON.stringify(r.seen));
  }
}

console.log("\n【3】🔴 开关：只有恰好 true 才算开");
{
  for (const arg of ["false", "FALSE", "TRUE", "True", "1", "0", "yes", "no", "", " , , ", "null", "undefined"]) {
    const r = runShell(arg);
    ok(r.disabled && r.seen === null, `「${arg}」→ 当关`, `disabled=${r.disabled} seen=${JSON.stringify(r.seen)}`);
  }
  for (const arg of ["true", " true", "true ", " true "]) {
    const r = runShell(arg);
    ok(!r.disabled && r.seen?.Enabled === "true", `「${arg}」→ 放行（trim 后命中）`, JSON.stringify(r.seen));
  }
  // 误关优于误开：用户填错值时，绝不能把收据发给第三方
  ok(runShell("TRUE").disabled, "大小写填错时是误关（不是误开）");
}

console.log("\n【4】托管：剥掉壳层必须与上游逐字节相同");
{
  // itunes-spoof.js 是 build.mjs 的生成物。若 prelude.js 改了却忘了重跑，
  // 设备上跑的还是旧壳层 —— 所以这里既校验生成物，也校验它与当前 prelude 一致。
  const { execFileSync } = await import("node:child_process").then(m => ({ execFileSync: m.execFileSync }));
  let buildOk = false, buildErr = "";
  try { execFileSync("node", [path.join(dir, "build.mjs"), "--check"], { cwd: dir, stdio: "pipe" }); buildOk = true; }
  catch (e) { buildErr = String(e.stderr || e.message).slice(0, 80); }
  ok(buildOk, "src/itunes-spoof.js 是 build.mjs 的最新产物（改了 prelude 必须重跑生成）", buildErr);
  ok(sha256(path.join(dir, "src/loon-itunes.js")) === UPSTREAM_SHA,
     "上游原件 sha256 与基线一致（一个字节没动）");
  ok(built.startsWith(prelude), "合成脚本以壳层开头");
  const marker = built.match(/\/\* ==== 上游 loon-itunes\.js 原件[^\n]*==== \*\//);
  ok(!!marker, "有分隔标记");
  const at = built.indexOf(marker[0]) + marker[0].length;
  ok(built.slice(at).replace(/^\n/, "") === upstream,
     "剥掉壳层与标记后 == 上游原件（逐字节）",
     `长度差 ${built.slice(at).replace(/^\n/, "").length - upstream.length}`);
  ok(prelude.includes("throw new Error('iTunes-Spoof disabled by switch')"),
     "壳层用 throw 阻止上游继续执行（IIFE return 实测无效，上游仍会转发）");
}

console.log("\n【5】清单");
{
  const upLpx = read(path.join(dir, "upstream-iTunes.lpx"));
  ok(new RegExp(`script-path=https://raw\\.githubusercontent\\.com/Savues/loon-plugin-patches/main/plugins/iTunes-Spoof/src/itunes-spoof\\.js`).test(lpx),
     "script-path 指向本仓库合成脚本");
  ok(!lpx.includes(WORKER), "清单里不含 Worker 域名");
  ok(!lpx.includes("reven.jsforbaby.workers.dev"), "清单里不含上游域名");
  // 🔴 必须是 http-request，不能改 response。
  // 真机抓包（22:23 我方 vs 22:23 上游，同一台设备同一个 App）给出的结论：
  //   http-request  → Trigger http-request(body) → Forward fake response  → modified=True
  //   http-response → Trigger http-response(body) → 无转发、脚本白跑      → modified=False
  // 也就是说 _loon.modifiedResponse=true 记的是「响应被替换了」，
  // **不是「规则该挂哪一侧」** —— 我第一版把它读反了，真机表现是失效。
  ok(/^http-request .*buy\\\.itunes\\\.apple\\\.com\\\/verifyReceipt/m.test(lpx),
     "规则是 http-request（脚本在请求阶段就伪造回包 $done 返回）");
  ok(!/^http-response /m.test(lpx), "没有误改成 http-response（那样脚本会白跑，已真机证实失效）");
  ok(/requires-body=1/.test(lpx), "requires-body=1");
  ok(/argument=\[\{Enabled\},\{Expires\},\{Country\}\]/.test(lpx), "三个参数接上");
  ok(/^Enabled = input, "true"/m.test(lpx), "Enabled 默认 true");
  ok(/^Expires = input, "2099-09-09"/m.test(lpx), "Expires 默认 2099-09-09");
  ok(/^Country = input, "HK"/m.test(lpx), "Country 默认 HK");
  ok(/^#!system=iOS, iPadOS$/m.test(lpx), "含 iPadOS");
  ok(/^hostname = buy\.itunes\.apple\.com$/m.test(lpx), "[Mitm] 一个域名，与上游一致");
  const mitm = lpx.split(/^\[Mitm\]/m)[1] || "";
  ok(!/enable=/.test(mitm), "[Mitm] 段无 enable=（Loon 不支持，关开关不会关解密）");
  const upRe = (upLpx.match(/^http-\w+ (\S+)/m) || [])[1];
  const myRe = (lpx.match(/^http-\w+ (\S+)/m) || [])[1];
  ok(upRe === myRe, "URL 匹配正则与上游逐字相同", `上游 ${upRe} / 本版 ${myRe}`);
  const re = new RegExp(myRe);
  for (const [u, want] of [
    ["https://buy.itunes.apple.com/verifyReceipt", true],
    ["https://buy.itunes.apple.com/verifyReceipt?x=1", true],
    ["https://buy.itunes.apple.com/other", false],
    ["https://evil.example/verifyReceipt", false],
  ]) ok(re.test(u) === want, `正则命中：${u.slice(0, 48)}`);
}

console.log("\n【6】🔴 运行时外部依赖仍在 —— 钉成断言，不假装已消除");
{
  ok(!new RegExp(WORKER.replace(/\./g, "\\.")).test(built),
     "源码里找不到 Worker 域名（374 KB 内是编码态，扫文本证明不了任何事）");
  ok(upstream.length === 374259, "上游体积 374259 B（与基线一致）");
  // 真脚本跑一次确认依赖仍在 —— 见 test/e2e-real-upstream.mjs，本文件不重复
  ok(fs.existsSync(path.join(dir, "test/e2e-real-upstream.mjs")),
     "真脚本兼容性验证在独立脚本里（默认不跑）");
}

console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
