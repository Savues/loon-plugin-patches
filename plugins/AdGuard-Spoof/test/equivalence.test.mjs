/*
 * equivalence.test.mjs — 证明 src/receipt.response.js 与上游混淆脚本行为等价
 * 运行：node test/equivalence.test.mjs
 *
 * 本插件的核心风险不是「脚本写错」，而是「去混淆时理解错了原意」。
 * 所以这里不测「输出是否符合预期」——那只能证明我写的东西自洽；
 * 而是**把上游那份混淆原件和本仓库的重写版喂同一批输入，逐字节比对 $done 的产物**。
 * 等价性由上游说了算，不由我说了算。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..");
const read = p => fs.readFileSync(p, "utf8");

const upstream = read(path.join(dir, "upstream-AdGuardProCrack.js"));
const rewrite = read(path.join(dir, "src/receipt.response.js"));

let pass = 0, fail = 0;
const ok = (c, name, extra = "") => {
  if (c) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra); }
};

// 在一个仿 Loon 的沙盒里跑一个脚本，捕获它的 $done 产物。
// 返回 {done, threw}：threw 非空表示脚本抛异常且 $done 从未执行 ——
// 这在 Loon 里的表现是请求挂到超时，不是「放行」。
function runLoon(src, body) {
  const out = { done: undefined, threw: null };
  const sandbox = {
    $response: { body },
    $request: { url: "https://mobile-api.adguard.org/api/v1/ios_validate_receipt", method: "POST" },
    $done: o => { out.done = o; },
  };
  try {
    new Function("$response", "$request", "$done", src)(sandbox.$response, sandbox.$request, sandbox.$done);
  } catch (e) {
    out.threw = String(e && e.message || e);
  }
  return out;
}

// 同一批输入跑两份脚本，返回 [上游产物, 重写产物] 的对照表
const BODIES = [
  ["正常回包：已购买",        '{"products":[{"product_id":"com.adguard.lifetimePurchase","premium_status":"ACTIVE"}]}'],
  ["正常回包：未购买",        '{"products":[]}'],
  ["正常回包：订阅过期",      '{"products":[{"product_id":"com.adguard.iap.subscription","premium_status":"EXPIRED"}]}'],
  ["正常回包：多个商品",      '{"products":[{"product_id":"a","premium_status":"ACTIVE"},{"product_id":"b","premium_status":"EXPIRED"}]}'],
  ["含嵌套结构的回包",        '{"products":[{"product_id":"com.adguard.lifetimePurchase","premium_status":"ACTIVE","extra":{"nested":[1,2,{"k":"v"}]}}],"version":3}'],
  ["含 unicode 的回包",       '{"products":[{"product_id":"com.adguard.lifetimePurchase","premium_status":"ACTIVE","note":"中文 ✅ emoji 🎉"}]}'],
  ["服务器返回 HTML 错误页",  '<html><body>502 Bad Gateway</body></html>'],
  ["服务器返回空 body",       ''],
  ["服务器返回 null",         'null'],
  ["截断的 JSON",             '{"products":[{"product_id":'],
];

console.log("【1】上游混淆原件能跑，且确实产出了固定回包（先确认对照组有效）");
{
  const r = runLoon(upstream, BODIES[0][1]);
  ok(!r.threw, "上游在合法 JSON 输入下不抛异常", r.threw || "");
  ok(!!r.done, "上游调用了 $done");
  ok(r.done?.body === '{"products":[{"product_id":"com.adguard.lifetimePurchase","premium_status":"ACTIVE"}]}',
     "上游产物就是那串固定回包", r.done?.body);
}

console.log("\n【2】去混淆正确性：混淆数组里那几个索引到底解成什么");
{
  // 直接复刻上游的解码器，把 0xbf..0xcb 全解出来。
  // 上游头部的移位 IIFE 会把数组转到某个位置，node 跑一遍就知道结果。
  const dec = new Function("$response", "$done",
    upstream.slice(upstream.indexOf("var _0x4f31d5")) + "\nreturn _0x12ca;")(
    { body: "{}" }, () => {});
  const table = {};
  for (let i = 0xbf; i <= 0xcb; i++) table["0x" + i.toString(16)] = dec(i);
  ok(table["0xbf"] === "parse", "0xbf → parse", table["0xbf"]);
  ok(table["0xc2"] === "stringify", "0xc2 → stringify", table["0xc2"]);
  ok(table["0xc5"] === "ACTIVE", "0xc5 → ACTIVE", table["0xc5"]);
  ok(table["0xcb"] === "com.adguard.lifetimePurchase", "0xcb → 商品 ID", table["0xcb"]);
  // 剩下 9 个是自解机算校验和用的垃圾常量，不参与业务逻辑。
  const junk = Object.entries(table).filter(([k]) => !["0xbf", "0xc2", "0xc5", "0xcb"].includes(k));
  ok(junk.every(([, v]) => /^\d+[A-Za-z]+$/.test(v)),
     "其余 9 项全是 parseInt 用的数字混淆常量，无一是业务字段", JSON.stringify(junk.map(([, v]) => v)));
}

console.log("\n【3】🔴 逐输入等价性：10 组输入，两份脚本的 $done 产物必须完全相同");
{
  for (const [name, body] of BODIES) {
    const up = runLoon(upstream, body);
    const mine = runLoon(rewrite, body);
    if (up.threw && !mine.threw) {
      // 这不是不等价，是**本版刻意修掉的缺陷**。下面第 4 组专门钉它。
      ok(true, `${name}：上游抛异常(${up.threw.slice(0, 40)}…)，重写版未抛 —— 见第 4 组`);
      continue;
    }
    const same = JSON.stringify(up) === JSON.stringify(mine);
    ok(same, `${name}：产物一致`, `上游 ${JSON.stringify(up)} / 重写 ${JSON.stringify(mine)}`);
  }
}

console.log("\n【4】重写版刻意修掉的缺陷：上游那次 JSON.parse 是死代码");
{
  // 上游 `JSON.parse($response.body)` 的结果 obj 随即被整个覆盖，从未被读取。
  // 它唯一的作用是在服务端返回非 JSON 时抛异常 → $done 不执行 → 请求卡到超时。
  const cases = BODIES.filter(([, b]) => {
    try { JSON.parse(b); return false; } catch { return true; }
  });
  ok(cases.length === 3, "筛出 3 组非 JSON 输入", `实际 ${cases.length}`);
  for (const [name, body] of cases) {
    const up = runLoon(upstream, body);
    const mine = runLoon(rewrite, body);
    ok(!!up.threw, `${name}：上游确实抛异常（不调 $done，请求会挂到超时）`);
    ok(!mine.threw, `${name}：重写版不抛`, mine.threw || "");
    ok(!!mine.done?.body, `${name}：重写版仍然正常产出回包`, JSON.stringify(mine));
  }
  // 反向：合法 JSON 输入下两者必须完全一致（上一步已验，这里钉死「没顺手改内容」）
  const up = runLoon(upstream, '{"products":[]}');
  const mine = runLoon(rewrite, '{"products":[]}');
  ok(up.done?.body === mine.done?.body, "合法 JSON 输入下两者产物逐字节相同（没借修 bug 之名改内容）");
}

console.log("\n【5】脚本不改 status / headers（与上游一致，只换 body）");
{
  const mine = runLoon(rewrite, "{}");
  ok(Object.keys(mine.done).length === 1 && Object.keys(mine.done)[0] === "body",
     "$done 只带 body 一个键", JSON.stringify(Object.keys(mine.done)));
  ok(!("response" in mine.done), "没有包一层 {response:{...}}");
  ok(!("status" in mine.done), "不碰 status");
}

console.log("\n【6】清单：端点正则与上游逐字相同（收窄范围 = 行为变更，不做）");
{
  const lpx = read(path.join(dir, "AdGuard-Spoof.lpx"));
  const upRule = (read(path.join(dir, "upstream-adguard.plugin")).match(/^http-response\s+(\S+)/m) || [])[1];
  const myRule = (lpx.match(/^http-response\s+(\S+)/m) || [])[1];
  ok(!!upRule && !!myRule, "两侧规则都能解析出正则");
  ok(myRule === upRule, "URL 匹配正则与上游逐字相同", `上游 ${upRule} / 本版 ${myRule}`);
  // 逐个跑一遍真实/负例，确认这份正则现在还抓得到东西
  const re = new RegExp(myRule);
  const hit = [
    ["https://mobile-api.adguard.org/api/v1/ios_validate_receipt", true],
    ["https://mobile-api.adguard.org/api/v2/ios_validate_receipt", true],
    // 注意这条：正则里 `\/api\/.+\/ios_…` 的 `.+` 至少要吃掉一段路径，
    // 所以 `/api/ios_validate_receipt`（单段）**不命中**。这是上游正则本来的行为，
    // 本版逐字保留，不"顺手修正"——那会改变拦截范围。真实端点形如 /api/v1/ios_validate_receipt。
    ["https://mobile-api.adguard.org/api/ios_validate_receipt", false],
    ["https://mobile-api.adguard.org/api/v1/other_endpoint", false],
    ["https://mobile-api.adguard.org/ping", false],
    ["https://evil.example/api/v1/ios_validate_receipt", false],
    ["https://mobile-api.adguard.org.evil.example/api/v1/ios_validate_receipt", false],
  ];
  for (const [url, want] of hit) {
    ok(re.test(url) === want, `正则命中判定正确：${url.slice(0, 60)}`, `得到 ${re.test(url)}，期望 ${want}`);
  }
}

console.log("\n【7】清单：纯本地，零第三方运行时依赖");
{
  const lpx = read(path.join(dir, "AdGuard-Spoof.lpx"));
  ok(!/yfamilys\.com/.test(lpx), "清单里不含分发站 yfamilys.com");
  ok(!/yqc007/.test(lpx), "清单里不含二次分发者 yqc007");
  ok(/script-path=https:\/\/raw\.githubusercontent\.com\/Savues\/loon-plugin-patches\/main\/plugins\/AdGuard-Spoof\/src\/receipt\.response\.js/.test(lpx),
     "script-path 指向本仓库 main 分支");
  const js = read(path.join(dir, "src/receipt.response.js"));
  for (const api of ["$httpClient", "$persistentStore", "$notification", "fetch(", "XMLHttpRequest", "eval("]) {
    ok(!js.includes(api), `脚本里没有 ${api}（不会外发请求、不落盘、不动态执行）`);
  }
  ok(js.includes("$done("), "脚本确实调用 $done");
  // 头部的注释块是说明，不能被当成可执行代码
  const codeOnly = js.replace(/\/\*[\s\S]*?\*\//g, "");
  const codeLines = codeOnly.split("\n").filter(l => l.trim() && !l.trim().startsWith("//"));
  ok(codeLines.length === 9, "去掉注释后有效代码只有 9 行（真·极简）", `实际 ${codeLines.length}`);
  ok(codeLines[0].startsWith("const PRODUCT_ID") && codeLines[1].startsWith("const PREMIUM_STATUS"),
     "只有两个常量 + 一次 $done，没有分支");
  ok(codeLines.filter(l => l.includes("$done")).length === 1, "$done 只调用一次（无分支即无遗漏路径）");
}

console.log("\n【8】开关接线");
{
  const lpx = read(path.join(dir, "AdGuard-Spoof.lpx"));
  ok(/^spoof = switch,true,/m.test(lpx), "声明了 switch 且默认 true（装上行为与上游一致）");
  ok(/enable=\{spoof\}/.test(lpx), "规则挂了 enable={spoof}");
  // [Mitm] 段无 enable —— 这是 Loon 的限制，不是漏写
  const mitm = lpx.split(/^\[Mitm\]/m)[1] || "";
  ok(!/enable=/.test(mitm), "[Mitm] 段没有也不该有 enable=（Loon 不支持，关开关不会关解密）");
}

console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
