/*
 * src.js 回归测试。Node 里跑：node locally-hf-swap.test.mjs
 *
 * mock 忠实度说明（两条踩过的坑，都靠这层 mock 抓出来）：
 *   1) $request.url 是含 scheme+host 的完整 URL，不是 path。
 *      首版直接拿它去匹配 ^\/api\/models\/… → 永不命中，6 个用例全部静默失败。
 *   2) resolve-cache 的路径有 5 段前缀，split("/") 的索引极易错位。
 *      所以这里喂的是真实抓包 URL 原样，不做任何"帮它对齐"的预处理。
 */
import { readFileSync } from "node:fs";
import assert from "node:assert";

const SRC = readFileSync(new URL("./src.js", import.meta.url), "utf8");
const LPX = readFileSync(new URL("./Locally-HF-Swap.lpx", import.meta.url), "utf8");

const HOST = "https://huggingface.co";
const SRC_REPO = "mlx-community/MiniCPM5-1B-mlx-6Bit";
const SRC_SHA = "f4ff69f73671ae207dcebc1b05f17e332be5bc6d";
const TGT = "mlx-community/Qwen3-4B-4bit";
const TGT_SHA = "4dcb3d101c2a062e5c1d4bb173588c54ea6c4d25";

// 真实抓包里的 URL（Locally/165004，一次完整下载共 15 条请求）
const REAL = {
  metadata:
    `${HOST}/api/models/${SRC_REPO}/revision/main`,
  bigFile:
    `${HOST}/${SRC_REPO}/resolve/${SRC_SHA}/model.safetensors`,
  smallFile:
    `${HOST}/${SRC_REPO}/resolve/${SRC_SHA}/config.json`,
  resolveCache:
    `${HOST}/api/resolve-cache/models/${SRC_REPO}/${SRC_SHA}/tokenizer.json` +
    `?%2F${SRC_REPO}%2Fresolve%2F${SRC_SHA}%2Ftokenizer.json=&etag=%22ec0bf9a3%22`,
  indexJson:
    `${HOST}/${SRC_REPO}/resolve/${SRC_SHA}/model.safetensors.index.json`,
  unrelated: `${HOST}/api/whoami-v2`,
};

const store = Object.create(null);

// 返回 { out, fetchUrl } —— out 是 $done({url}) 里的 url，(unchanged) 表示原样放行
// argMode: "object" | "kv" | "bracketed" | "plain" | "array" | "empty"
// 默认 object；其余用于验证 $argument 的各种传法都能解析出目标仓库
function run(url, repo = TGT, apiSha = TGT_SHA, argMode = "object") {
  let out = null, done = false, fetchUrl = null;
  let $argument;
  switch (argMode) {
    case "object":    $argument = { repo }; break;
    case "kv":        $argument = `repo=${repo}`; break;
    case "bracketed": $argument = `[${repo}]`; break;
    case "plain":     $argument = repo; break;
    case "array":     $argument = [repo]; break;
    case "empty":     $argument = ""; break;
    default:          $argument = repo; break;
  }
  const $request = { url };
  const $done = (o) => { done = true; out = (o && o.url) || "(unchanged)"; };
  const $persistentStore = {
    read: (k) => (k in store ? store[k] : null),
    write: (v, k) => { store[k] = v; return true; },
  };
  const $httpClient = {
    get(p, cb) { fetchUrl = p.url; cb(null, { status: 200 }, JSON.stringify({ sha: apiSha })); },
  };
  // eslint-disable-next-line no-new-func
  new Function("$argument", "$request", "$done", "$persistentStore", "$httpClient", SRC)(
    $argument, $request, $done, $persistentStore, $httpClient
  );
  assert.ok(done, "脚本没有调用 $done —— 会挂住整个请求");
  return { out, fetchUrl };
}

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); }
}
const group = (t) => console.log("\n" + t);

group("真实抓包 URL 的改写结果");
check("元数据 → 目标仓库", () => {
  assert.equal(run(REAL.metadata).out, `${HOST}/api/models/${TGT}/revision/main`);
});
check("大文件 → 目标仓库 + main（307 可跳 CDN）", () => {
  assert.equal(run(REAL.bigFile).out, `${HOST}/${TGT}/resolve/main/model.safetensors`);
});
check("小文件 → 目标仓库 + main", () => {
  assert.equal(run(REAL.smallFile).out, `${HOST}/${TGT}/resolve/main/config.json`);
});
check("index.json → 目标仓库 + main", () => {
  assert.equal(run(REAL.indexJson).out, `${HOST}/${TGT}/resolve/main/model.safetensors.index.json`);
});
check("resolve-cache → 目标仓库 + 真实 sha", () => {
  const { out } = run(REAL.resolveCache);
  assert.equal(out, `${HOST}/api/resolve-cache/models/${TGT}/${TGT_SHA}/tokenizer.json`);
  // 关键：query 里的旧 repo 旧 sha 必须被剥掉，否则 query 与 path 不一致
  assert.ok(!out.includes(SRC_REPO), "输出里还残留原仓库名");
  assert.ok(!out.includes(SRC_SHA), "输出里还残留原 sha");
  assert.ok(!out.includes("?"), "etag query 应被剥掉");
});

group("sha 缓存（resolve-cache 必须查真实 sha）");
check("首次查询 API 并写入缓存", () => {
  const k = "hf_sha_" + TGT;
  delete store[k];
  const { fetchUrl } = run(REAL.resolveCache);
  assert.equal(fetchUrl, `${HOST}/api/models/${TGT}/revision/main`);
  assert.equal(store[k], TGT_SHA, "sha 没写进 $persistentStore");
});
check("命中缓存后不再发 API 请求", () => {
  const { fetchUrl } = run(REAL.resolveCache);
  assert.equal(fetchUrl, null, "已有缓存却还去查了一次 API");
});
check("API 失败时降级用 main，不挂住请求", () => {
  const k = "hf_sha_" + TGT;
  delete store[k];
  let out = null, done = false;
  const $argument = { repo: TGT }, $request = { url: REAL.resolveCache };
  const $done = (o) => { done = true; out = (o && o.url) || "(unchanged)"; };
  const $persistentStore = { read: () => null, write: () => true };
  const $httpClient = { get(p, cb) { cb("timeout", null, null); } };
  // eslint-disable-next-line no-new-func
  new Function("$argument", "$request", "$done", "$persistentStore", "$httpClient", SRC)(
    $argument, $request, $done, $persistentStore, $httpClient
  );
  assert.ok(done, "API 失败时没有调用 $done");
  assert.ok(out.endsWith("/tokenizer.json"), "降级 URL 不完整: " + out);
  delete store[k];
});

// 真机事故：插件装上了、开关是绿的、MITM 也在，但抓包显示 URL 一条都没改写。
// 根因是脚本只认 $argument.repo（对象形态），而 Loon 实际把参数传成了字符串，
// 于是 TARGET 为空 → 静默走「原样放行」。参数传法必须全部兼容。
group("$argument 的各种传法都要能解析出目标仓库");
for (const mode of ["object", "kv", "bracketed", "plain", "array"]) {
  check(`形态 ${mode} → 正确改写`, () => {
    assert.equal(
      run(REAL.metadata, TGT, TGT_SHA, mode).out,
      `${HOST}/api/models/${TGT}/revision/main`,
      `形态 ${mode} 未能解析出目标仓库`
    );
  });
}
check("resolve-cache 分支在各形态下也正确", () => {
  for (const mode of ["object", "kv", "bracketed", "plain", "array"]) {
    const k = "hf_sha_" + TGT;
    delete store[k];
    const { out } = run(REAL.resolveCache, TGT, TGT_SHA, mode);
    assert.ok(out.includes(TGT), `形态 ${mode} 的 resolve-cache 未改写: ${out}`);
  }
});

group("安全网 —— 任何情况下都不能把下载搞挂");
check("已指向目标 repo 时幂等跳过（防自触发死循环）", () => {
  assert.equal(run(`${HOST}/${TGT}/resolve/main/config.json`).out, "(unchanged)");
  assert.equal(run(`${HOST}/api/models/${TGT}/revision/main`).out, "(unchanged)");
});
check("非匹配 URL 原样放行", () => {
  assert.equal(run(REAL.unrelated).out, "(unchanged)");
});
check("目标参数为空 → 原样放行", () => {
  assert.equal(run(REAL.bigFile, "").out, "(unchanged)");
});
check("目标参数非法（多斜杠/含空格/路径穿越）→ 原样放行", () => {
  assert.equal(run(REAL.bigFile, "a/b/c").out, "(unchanged)");
  assert.equal(run(REAL.bigFile, "has space").out, "(unchanged)");
  assert.equal(run(REAL.bigFile, "../etc/passwd").out, "(unchanged)");
});
check("非 huggingface.co 的请求不处理", () => {
  assert.equal(run("https://example.com/api/models/x/y/revision/main").out, "(unchanged)");
});
check("子目录文件保留完整相对路径", () => {
  const u = `${HOST}/${SRC_REPO}/resolve/${SRC_SHA}/onnx/model.onnx`;
  assert.equal(run(u).out, `${HOST}/${TGT}/resolve/main/onnx/model.onnx`);
});

group("清单自检");
check(".lpx 声明了 huggingface.co 的 MITM", () => {
  assert.match(LPX, /\[MITM\][\s\S]*huggingface\.co/);
});
check(".lpx 脚本指向本仓库 raw 地址", () => {
  assert.match(LPX, /script-path=https:\/\/raw\.githubusercontent\.com\/Savues\/loon-plugin-patches\/main\/plugins\/Locally-HF-Swap\/src\.js/);
});
check(".lpx 用 enable= 受开关保护", () => {
  assert.match(LPX, /enable=\{swapOn\}/);
});
// 首版写的是 #!system=ios + #!loon_version=3.5.1(988)，在 iPad 上直接
// 报「操作系统不支持」装不进去。system 必须列出 iPadOS；loon_version 不能
// 卡在新语法门槛上（本插件用的是旧语法，3.x 全支持）。
check(".lpx 声明覆盖 iPadOS（否则 iPad 报「操作系统不支持」）", () => {
  const sys = LPX.match(/^#!system=(.*)$/m);
  assert.ok(sys, "缺少 #!system 声明");
  assert.match(sys[1], /iPadOS/i, "system 未包含 iPadOS: " + sys[1]);
});
check(".lpx 的 loon_version 不卡在新语法门槛", () => {
  const v = LPX.match(/^#!loon_version=(.*)$/m);
  assert.ok(v, "缺少 #!loon_version 声明");
  assert.ok(!/988/.test(v[1]), "loon_version 卡在 3.5.1(988) 但本插件用旧语法: " + v[1]);
});

console.log(`\n${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);