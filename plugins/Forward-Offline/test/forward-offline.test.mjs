/*
 * forward-offline.test.mjs — forward-offline.js 的回归测试
 * 运行：node test/forward-offline.test.mjs
 *
 * 响应结构（2026-09-29 用 4 份 HAR / 23 个带签名样本实测确定）：
 *
 *   密文 352 字节 = 128 字节恒定前缀 + 224 字节变化段
 *     → base64              = 472 字符
 *     → JSON.stringify 加引号 = 474 字节
 *     → 再 base64（不加引号） = 632 字符  ← HTTP 响应体
 *
 * 关键：外层是【裸 base64】，不带引号，尽管 content-type 是 application/json。
 * 单层只得到 288 字节，App 解不开 —— 这是 v1.0 失效的根因。
 */
import fs from "fs";
import vm from "vm";
import path from "path";
import { fileURLToPath } from "url";

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(here, "forward-offline.js"), "utf8");
const onlinePrefix = fs.readFileSync(path.join(here, "samples/prefix-128.hex"), "utf8").trim();

let pass = 0, fail = 0;
const ok = (c, name, extra = "") => {
  if (c) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra); }
};

function run() {
  // 在当前 realm 直接执行，不建 vm context —— 新 context 的 Math.random 种子固定，
  // 会让「变化段随机」这条断言假阴性。
  let out = null;
  const done = o => { out = o; };
  const btoaFn = s => Buffer.from(s, "binary").toString("base64");
  new Function("$done", "btoa", src)(done, btoaFn);
  return out;
}

// 三层解码，与 App 看到的完全一致
const layers = body => {
  const l1 = body;                                             // 632 字符，裸 base64
  const l2 = Buffer.from(l1, "base64").toString("utf8");       // 474 字节，带引号
  const l3 = Buffer.from(l2.replace(/^"|"$/g, ""), "base64");  // 352 字节密文
  return { l1, l2, l3 };
};

console.log("【1】响应外壳（632 = HAR 实测 HTTP 响应体，23 样本一致）");
const r1 = run().response;
ok(r1.status === 200, "status = 200", `实际 ${r1.status}`);
ok(r1.headers["content-type"] === "application/json; charset=utf-8",
   "content-type = application/json; charset=utf-8", `实际 ${r1.headers["content-type"]}`);
ok(r1.body.length === 632, "body 长度 632 字节", `实际 ${r1.body.length}`);
ok(/^[A-Za-z0-9+/=]+$/.test(r1.body), "body 是裸 base64（无引号）");
ok(!r1.body.startsWith('"'), "body 不以引号开头（v1.0 的错误之一）");

console.log("\n【2】三层结构逐层核对");
const d = layers(r1.body);
ok(d.l2.length === 474, "第二层 474 字节", `实际 ${d.l2.length}`);
ok(d.l2.startsWith('"') && d.l2.endsWith('"'), "第二层是被引号包裹的 base64 文本");
ok(d.l3.length === 352, "第三层 352 字节密文", `实际 ${d.l3.length}`);
ok(d.l2.slice(1, -1).length === 472, "第二层去引号后 472 字符");

console.log("\n【3】密文内容：128 恒定 + 224 变化");
ok(d.l3.subarray(0, 128).toString("hex") === onlinePrefix,
   "前 128 字节 == 线上采样固定前缀（逐字节一致）");
ok(d.l3.length - 128 === 224, "变化段 224 字节", `实际 ${d.l3.length - 128}`);

console.log("\n【4】变化段每次请求都不同（线上实测 23 样本全不同）");
const tails = new Set(), ciphers = new Set();
for (let i = 0; i < 8; i++) {
  const c = layers(run().response.body).l3;
  tails.add(c.subarray(128).toString("hex"));
  ciphers.add(c.toString("hex"));
}
ok(tails.size === 8, "8 次请求 224 字节变化段互不相同", `实际 ${tails.size} 种`);
ok(ciphers.size === 8, "8 次请求整体密文互不相同");
ok([...tails].every(t => t.length === 448), "每个变化段 448 hex 字符 = 224 字节");

console.log("\n【5】恒定前缀不随请求变化");
const prefixes = new Set();
for (let i = 0; i < 4; i++) prefixes.add(layers(run().response.body).l3.subarray(0, 128).toString("hex"));
ok(prefixes.size === 1, "4 次请求前缀恒定");
ok([...prefixes][0] === onlinePrefix, "该恒定前缀 == 线上采样值");

console.log("\n【6】编码链等价性（btoa 分支 vs Buffer 分支）");
{
  // Loon 运行时没有 Buffer，只有 btoa；Node 测试里用的是 btoa 注入。
  // 两条路径必须产出完全相同的 632 字符，否则测试通过而真机失败。
  const cipher = Buffer.concat([Buffer.from(onlinePrefix, "hex"), Buffer.alloc(224, 7)]);
  const inner = '"' + cipher.toString("base64") + '"';                  // 474
  const viaBtoa = Buffer.from(inner, "binary").toString("base64");      // btoa 语义
  const viaBuffer = Buffer.from(inner, "utf8").toString("base64");
  ok(viaBtoa.length === 632, "btoa 语义得 632 字符", `实际 ${viaBtoa.length}`);
  ok(viaBtoa === viaBuffer, "btoa 路径与 Buffer 路径产出逐字节相同（内容全是 ASCII，两语义等价）");
  ok(/^[A-Za-z0-9+/=]+$/.test(viaBtoa), "产出是合法裸 base64");
  ok(viaBtoa.length % 4 === 0, "长度是 4 的倍数（base64 合法长度）");
}

console.log("\n【7】长度恒定 632（下游若按定长解析也不会错位）");
const lens = new Set();
for (let i = 0; i < 5; i++) lens.add(run().response.body.length);
ok(lens.size === 1 && lens.has(632), "5 次请求 body 长度恒定 632", `实际 ${[...lens]}`);

console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
