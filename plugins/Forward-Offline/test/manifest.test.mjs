/*
 * manifest.test.mjs — Forward-Offline.lpx 的结构与脚本接线校验
 * 运行：node test/manifest.test.mjs
 *
 * 覆盖两类断言：
 *   1. 清单结构正确（段、正则、MITM 域名）
 *   2. 清单里那条长 URL 正则与脚本的预期路径一致（少写一个字符就静默失效）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..");
const lpx = fs.readFileSync(path.join(dir, "Forward-Offline.lpx"), "utf8");
const js = fs.readFileSync(path.join(dir, "forward-offline.js"), "utf8");
const prefix = fs.readFileSync(path.join(dir, "samples/prefix-128.hex"), "utf8").trim();

let pass = 0, fail = 0;
const ok = (c, name, extra = "") => {
  if (c) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra); }
};

console.log("【1】清单头部");
ok(/^#!name=Forward-Offline/m.test(lpx), "#!name=Forward-Offline");
ok(/^#!desc=.+/m.test(lpx), "#!desc 有描述");
ok(/^#!tag=/m.test(lpx), "#!tag 有标签");

console.log("\n【2】段结构");
ok(/\[Script\]/i.test(lpx), "有 [Script] 段");
ok(/\[MITM\]/i.test(lpx), "有 [MITM] 段");
ok(!/\[Argument\]/i.test(lpx), "无 [Argument] 段（本插件没有可调参数）");

console.log("\n【3】[Script] 规则");
// 必须排除注释行：文件头注释里出现过 "http-request" 这个词
const scriptLine = lpx.split("\n").find(l =>
  /^\s*http-request\s/.test(l) && /script-path=/.test(l));
ok(!!scriptLine, "存在 http-request 规则（且不是注释行）");
ok(/^http-request\s+\^https/.test((scriptLine || "").trim()), "规则以 ^https 开头（限定 https）");

// 按 Loon 的实际做法校验：把清单里的原始正则原样编译，去匹配真实端点 URL。
// （不要拿手写的常量去比对转义串 —— 那样测的是字符串相等，不是规则可用。）
const rawPattern = (scriptLine || "").trim().split(/\s+/)[1] || "";
let re = null;
try { re = new RegExp(rawPattern); } catch (e) { /* 留给下面的断言报 */ }
ok(!!re, "URL 正则可编译", rawPattern);
ok(re ? re.test("https://fluxapi.vvebo.vip/v1/purchase/iap/subscription") : false,
   "匹配目标端点（带 https 前缀）");
ok(re ? re.test("https://fluxapi.vvebo.vip/v1/purchase/iap/subscription?uid=1") : false,
   "带 query 的真实请求也能匹配");
ok(re ? !re.test("https://fluxapi.vvebo.vip/v1/other/endpoint") : false,
   "不误伤同域名的其他端点");
ok(re ? !re.test("https://evil.example.com/v1/purchase/iap/subscription") : false,
   "不误伤其他域名");
ok(re ? !re.test("http://fluxapi.vvebo.vip/v1/purchase/iap/subscription") : false,
   "不匹配 http://（原版也是这样，避免明文请求绕过）");
ok(/requires-body\s*=\s*true/.test(scriptLine || ""), "requires-body=true");
ok(/timeout=\d+/.test(scriptLine || ""), "设置了 timeout");
ok(/enable\s*=\s*true/.test(scriptLine || ""), "enable=true");

console.log("\n【4】script-path 指向本仓库托管副本");
const sp = (scriptLine || "").match(/script-path=([^,]+)/);
ok(!!sp, "script-path 可解析");
ok(/raw\.githubusercontent\.com\/Savues\/loon-plugin-patches\/main\/plugins\/Forward-Offline\/forward-offline\.js/.test(sp?.[1] || ""),
   "指向本仓库 main 分支的托管副本", `实际 ${sp?.[1]}`);
ok(!/mock\.forward1\.workers\.dev/.test(lpx), "清单里不含原作者的 mock 服务器地址");
ok(!/photo\.lily\.lat/.test(sp?.[1] || ""), "脚本本身不依赖第三方图标站");

console.log("\n【5】[MITM] 只声明目标域名");
// 段名是 [Mitm]，注释里也有 "[MITM]" 字样 —— 取最后一个真段起始
const mitmStart = lpx.search(/^\[Mitm\]\s*$/im);
const mitm = mitmStart >= 0 ? lpx.slice(mitmStart) : "";
ok(mitmStart >= 0, "[Mitm] 段存在（区分注释里的 [MITM] 字样）");
ok(/^\s*hostname\s*=\s*fluxapi\.vvebo\.vip\s*$/m.test(mitm), "hostname = fluxapi.vvebo.vip");
ok(!/mock\.forward1\.workers\.dev/.test(mitm), "MITM 段不含 mock 服务器（无需解密它）");
ok(!/vvebo\.vip\s*,\s*\*|=\s*\*/.test(mitm), "没有通配符（只解密这一个域名）");
const mitmBody = mitm.split("\n").slice(1)
  .filter(l => l.trim() && !/^\s*#/.test(l));
ok(mitmBody.length === 1, "整段只有 1 行有效配置（段名不计）", `实际 ${mitmBody.length} 行`);

console.log("\n【6】无重复规则（原版与本插件同装会争同一个请求）");
const rules = lpx.split("\n").filter(l => /^\s*\^https/.test(l) && !/^\s*#/.test(l));
ok(rules.length === 0, "没有任何活的 [Rewrite] 规则", `实际 ${rules.length} 条`);
ok(!/reject/.test(lpx.split("[Rewrite]")[1]?.split("[Script]")[0] || ""), "Rewrite 段里没有 reject 兜底");

console.log("\n【7】脚本与样本一致");
const inJs = (js.match(/PREFIX_HEX\s*=\s*((?:"[0-9a-f]+"\s*\+?\s*)+)/) || [])[1];
const hexInJs = inJs ? (inJs.match(/"([0-9a-f]+)"/g) || []).map(s => s.replace(/"/g, "")).join("") : "";
ok(hexInJs.length === 256, "脚本内嵌前缀 128 字节", `实际 ${hexInJs.length / 2} 字节`);
ok(hexInJs === prefix, "内嵌前缀 == 线上采样值（逐字节一致）");
ok(/PREFIX_LEN\s*=\s*128/.test(js), "PREFIX_LEN = 128");
ok(/RANDOM_LEN\s*=\s*160/.test(js), "RANDOM_LEN = 160");
ok(/JSON\.stringify\(b64\)/.test(js), "用 JSON.stringify 包装（带引号，与线上同形态）");
ok(/getRandomValues/.test(js), "尾部用 crypto.getRandomValues 生成");
ok(/response:\s*\{/.test(js), "用 $done({response:{...}}) 形态（http-request 专用）");

console.log("\n【8】上游原件存档完整");
ok(fs.existsSync(path.join(dir, "upstream-Forward.lpx")), "保留了上游清单原件");
const sums = fs.readFileSync(path.join(dir, "upstream-SHA256SUMS"), "utf8");
ok(/^[0-9a-f]{64}\s+forward\.lpx$/m.test(sums), "原件 SHA256 已记录");
ok(fs.existsSync(path.join(dir, "samples/mock-01.json")), "保留了线上响应采样");

console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
