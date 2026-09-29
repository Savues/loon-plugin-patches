/*
 * test.mjs — forward-offline.js 的回归测试
 * 运行：node test.mjs
 *
 * 断言全部对照 mock.forward1.workers.dev 的线上实测值（2026-09-29 采样 6 次 + 真实站 3 次）。
 */
import fs from "fs";
import vm from "vm";
import path from "path";
import { fileURLToPath } from "url";

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(here, "forward-offline.js"), "utf8");
const onlinePrefix = fs.readFileSync(path.join(here, "samples/prefix-128.hex"), "utf8").trim();

let pass = 0, fail = 0;
const ok = (cond, name, extra = "") => {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra); }
};

function run() {
  // 在当前 realm 直接执行，不建 vm context —— 新 context 的 Math.random 种子固定，
  // 会让「尾部随机」这条断言假阴性。
  let out = null;
  const sandbox = { btoa: s => Buffer.from(s, "binary").toString("base64"), $done: o => { out = o; } };
  const wrapper = new Function("$done", "btoa", src);
  wrapper(sandbox.$done, sandbox.btoa);
  return out;
}

console.log("【1】响应外壳与线上逐项一致");
const r1 = run().response;
ok(r1.status === 200, "status = 200", `实际 ${r1.status}`);
ok(r1.headers["content-type"] === "application/json; charset=utf-8",
   'content-type = application/json; charset=utf-8', `实际 ${r1.headers["content-type"]}`);
ok(r1.body.length === 386, "body 长度 386 字节（线上实测值）", `实际 ${r1.body.length}`);
ok(typeof JSON.parse(r1.body) === "string", "body 是 JSON 字符串（带引号，与线上同形态）");
ok(JSON.stringify(JSON.parse(r1.body)) === r1.body, "base64 外层就是这对引号，无多余转义");

console.log("\n【2】二进制结构");
const b1 = Buffer.from(JSON.parse(r1.body), "base64");
ok(b1.length === 288, "base64 解码后 288 字节（128 固定 + 160 随机）", `实际 ${b1.length}`);
ok(b1.subarray(0, 128).toString("hex") === onlinePrefix,
   "前 128 字节 == 线上采样固定前缀（逐字节一致）");
ok(Buffer.from(JSON.parse(r1.body), "base64").toString("base64") === JSON.parse(r1.body),
   "base64 无填充残留，可被标准解码器还原");

console.log("\n【3】尾部随机性（线上每次请求都变）");
const tails = new Set();
const fulls = new Set();
for (let i = 0; i < 8; i++) {
  const b = Buffer.from(JSON.parse(run().response.body), "base64");
  tails.add(b.subarray(128).toString("hex"));
  fulls.add(b.toString("hex"));
}
ok(tails.size === 8, "8 次请求 160 字节尾部互不相同", `实际 ${tails.size} 种`);
ok(fulls.size === 8, "8 次请求整体密文互不相同");
ok([...tails].every(t => t.length === 320), "每个尾部 320 个 hex 字符 = 160 字节");

console.log("\n【4】前缀不随请求变化（上游校验结构而非内容）");
const prefixes = new Set();
for (let i = 0; i < 4; i++) {
  prefixes.add(Buffer.from(JSON.parse(run().response.body), "base64").subarray(0, 128).toString("hex"));
}
ok(prefixes.size === 1, "4 次请求前缀恒定");
ok([...prefixes][0] === onlinePrefix, "该恒定前缀 == 线上采样值");

console.log("\n【5】长度恒为 386（下游若按定长解析也不会错位）");
const lens = new Set();
for (let i = 0; i < 5; i++) lens.add(run().response.body.length);
ok(lens.size === 1 && lens.has(386), "5 次请求 body 长度恒定 386", `实际 ${[...lens]}`);

console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
