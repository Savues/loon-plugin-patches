/*
 * e2e-real-upstream.mjs — 壳层 × 真上游 374 KB 的兼容性验证
 * 运行：node test/e2e-real-upstream.mjs        （手动，不进 CI）
 *
 * ── 为什么它不在主测试里 ──────────────────────────────────────
 * 上游 loon-itunes.js 是 374 KB 混淆代码，含 wasm 自解机。
 * 在 Node vm 里每求值一次要几秒，且泄漏编译上下文。
 * 主测试曾把它跑了 19 次，结果跑到一半 OOM、退出码 15。
 * 所以这里**一次只跑一个 case，每跑完就丢掉 context**，
 * 并且必须逐个进程串行执行（见文末）。
 *
 * ── 这个脚本要证明什么 ────────────────────────────────────────
 * 主测试用桩证明「壳层把参数解析对了」。桩做的正是上游唯一依赖的事
 * （读 $argument 的三个属性），所以桩上通过 ⟺ 真上游上通过 ——
 * 但那是推理，需要实测确认。��就是本脚本的职责。
 *
 * 2026-09-30 已人工跑过：11 个 case 全部正确，结果记在 UPSTREAM.md。
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..");
const read = p => fs.readFileSync(p, "utf8");
const built = read(path.join(dir, "src/itunes-spoof.js"));

const WORKER = "reven.lovebabyforever.workers.dev";

const only = process.argv[2]; // 可选：只跑某个 case（下标或标签）

const CASES = [
  ["true,2099-09-09,HK",  "enabled=true&expires=2099-09-09&country=HK", "默认开"],
  ["true,2027-01-01,CN",  "enabled=true&expires=2027-01-01&country=CN",   "自定义到期日+国区"],
  ["true,2030-12-31,US",  "enabled=true&expires=2030-12-31&country=US",   "美区"],
  ["true,",               "enabled=true&expires=2099-09-09&country=HK",   "尾部逗号：不发空值"],
  ["true,2030-01-01",     "enabled=true&expires=2030-01-01&country=HK",   "缺 Country：回落 HK"],
  ["  true , 2030-01-01 , US ", "enabled=true&expires=2030-01-01&country=US", "两侧空格：trim"],
  ["true,2030-01-01,us",  "enabled=true&expires=2030-01-01&country=us",   "Country 小写：原样透传"],
  ["false,2099-09-09,HK", null,                                        "Enabled=false：不转发"],
  ["FALSE,2099-09-09,HK", null,                                        "大写 FALSE：不转发"],
  ["TRUE,2030-06-06,US",  null,                                        "大写 TRUE：不转发"],
  ["",                    null,                                        "整串空：不转发"],
];

// 每跑一个 case 就新建并丢弃一个 context —— 上游那段代码太重，不能累积。
function run(arg) {
  const out = { url: null, done: null, threw: null };
  const ctx = {
    $request: { url: "https://buy.itunes.apple.com/verifyReceipt", method: "POST", headers: {}, body: "B" },
    $done: o => { out.done = JSON.stringify(o); },
    $persistentStore: { read: () => null, write: () => null },
    $notification: { post: () => {} },
    $environment: { version: { code: 2500 } }, $loon: {},
    setTimeout: f => { try { f(); } catch (e) {} }, setInterval: () => {},
    $httpClient: new Proxy({}, { get: (_, m) => (...a) => { if (m === "post") out.url = a[0].url; return null; } }),
    Buffer, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, WebAssembly,
    Math, JSON, Date, parseInt, parseFloat, String, Number, Object, Array, RegExp, Promise,
    atob: x => Buffer.from(x, "base64").toString("binary"),
    btoa: x => Buffer.from(x, "binary").toString("base64"), XMLHttpRequest: class {},
  };
  vm.createContext(ctx);
  vm.runInContext(`var $argument = ${JSON.stringify(arg)};`, ctx);
  // 超时给到 180s：wasm 自解机冷启动本身就要几秒，连跑时还会更慢。
  try { vm.runInContext(built, ctx, { timeout: 180000 }); }
  catch (e) { out.threw = String(e && e.message || e); }
  return out;
}

const q = r => (r.url ? r.url.split("?")[1] : null);

// 单 case 模式：给 shell 反复调用用（每 case 一个独立进程，绝不并���）
if (only !== undefined) {
  const i = Number(only);
  const [arg, want, label] = CASES[i];
  const r = run(arg);
  const got = q(r);
  const pass = want === null ? (got === null && r.done === "{}") : got === want;
  console.log(JSON.stringify({
    i, label, arg, want, got, done: r.done,
    pass,
    // 关开关时不能有转发；开时必须发去 Worker
    leak: got ? got.includes(WORKER) : false,
  }));
  process.exit(pass ? 0 : 1);
}

// 全量模式：⚠️ 必须串行，且每跑一个 case 前不要堆内存。
console.log("⚠️  正在对 374 KB 混淆脚本做 11 次求值，可能需要几分钟。\n");
let pass = 0, fail = 0;
for (let i = 0; i < CASES.length; i++) {
  const [arg, want, label] = CASES[i];
  const r = run(arg);
  const got = q(r);
  const good = want === null ? (got === null && r.done === "{}") : got === want;
  if (good) { pass++; console.log(`  ✓ ${label}  [${arg}]`); }
  else { fail++; console.log(`  ✗ ${label}  [${arg}]\n      期望 ${want}\n      实际 ${got} (done=${r.done}, threw=${r.threw})`); }
}
console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
