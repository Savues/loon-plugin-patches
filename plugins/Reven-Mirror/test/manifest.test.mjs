/*
 * manifest.test.mjs — Reven-Mirror.lpx 的托管正确性 + 开关接线校验
 * 运行：node test/manifest.test.mjs
 *
 * v1.1 把上游那一条大规则拆成 4 条（每条一个 switch），所以本文件的核心命题变成两条：
 *   1. 拆分后 4 条规则的域名并集 == 上游那一条，没多没少没重叠；
 *   2. 拆分只是「加了 enable=」，URL 范围 / 参数 / requires-body / script-path 一个都没变。
 * 另有一条容易被忽略的连带风险：脚本内部自己还有一份域名正则，
 * 若它比清单窄，清单放行的请求会被脚本放行透传 —— 一并钉住。
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..");
const repo = path.join(dir, "..", "..");
const read = p => fs.readFileSync(p, "utf8");
const sha256 = p => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

const lpx = read(path.join(dir, "Reven-Mirror.lpx"));
const upLpx = read(path.join(dir, "upstream-Reven.lpx"));
const js = read(path.join(dir, "src/loon-redirect.js"));
const manifest = JSON.parse(read(path.join(dir, "manifest.json")));
const watch = JSON.parse(read(path.join(repo, "tools/external-watch.json")));

let pass = 0, fail = 0;
const ok = (c, name, extra = "") => {
  if (c) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra); }
};

const UPSTREAM_JS_SHA = "425c476e04fc84a0b01b944d9eb718e22be46b7be55a956745148408f1c217eb";
const UPSTREAM_LPX_SHA = "4ed9911cfaa52b4b58c8b2650ace0500402b2870bcfd958b9d23f19653b078aa";
const SELF_RAW = "https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Reven-Mirror/src/loon-redirect.js";
const AUTHOR = "reven.jsforbaby.workers.dev";
const HOSTS = ["api.revenuecat.com", "api.rc-backup.com", "rc.visionarytech.ltd",
               "revenue.cuto.app", "proxy.linearity.io",
               "subscriptions-api.superwall.com", "api.adapty.io"];

// 取段正文（到下一个 [ 开头行为止）
const sec = (txt, name) => {
  const i = txt.search(new RegExp(`^\\[${name}\\]\\s*$`, "im"));
  if (i < 0) return "";
  const rest = txt.slice(i).split("\n").slice(1);
  const end = rest.findIndex(l => /^\s*\[/.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
};
// 活的规则行（排除注释）
const rulesOf = txt => txt.split("\n").filter(l => /^\s*http-request\s/.test(l));
// 从一条规则里取出其正则所覆盖的域名
// 注意：不要为了"避免部分匹配"而在末尾加 `|` —— 模式本身以 `\/` 结尾，
// 拼成 `…\/|` 后它会匹配空串，于是每个域名对每条规则都算命中（4×7=28），
// 而「没有域名被两条规则同时覆盖」那类断言恰恰依赖这个集合，会静默变成空断言。
const hostsOf = rule => {
  const pat = rule.trim().split(/\s+/)[1];
  let re = null;
  try { re = new RegExp(pat); } catch (e) { return null; }
  return HOSTS.filter(h => re.test(`https://${h}/x`));
};

console.log("【1】清单头部（元信息保持上游原样）");
ok(/^#!name=Reven$/m.test(lpx), "#!name=Reven");
ok(/^#!desc=.+/m.test(lpx), "#!desc 有描述");
ok(/^#!tag=/m.test(lpx), "#!tag 有标签");
ok(/^#!date=2026-09-29/m.test(lpx), "#!date 已更新（v1.1 加了开关）");
ok(/^#!icon=https:\/\/raw\.githubusercontent\.com\/fishdown\/Icon\/refs\/heads\/master\/app\/RevenueCat\.png$/m.test(lpx),
   "#!icon 仍是上游那一张（托管只管代码，不管图标）");

console.log("\n【2】段结构");
for (const s of ["Argument", "Script", "Mitm"]) {
  ok(new RegExp(`^\\[${s}\\]\\s*$`, "m").test(lpx), `有 [${s}] 段`);
}

console.log("\n【3】v1.1 拆规则：并集 == 上游那一条，且互不重叠");
const rules = rulesOf(lpx), upRules = rulesOf(upLpx);
ok(upRules.length === 1, "上游是 1 条规则", `实际 ${upRules.length}`);
ok(rules.length === 4, "镜像拆成 4 条（每 SDK 一条）", `实际 ${rules.length}`);
ok(rules.every(r => /enable=\{[a-z]+\}/.test(r)), "4 条规则都带 enable={...}");
const covered = rules.flatMap(hostsOf);
ok(covered.length === HOSTS.length, "覆盖域名总数 == 7（没重复没遗漏）", `实际 ${covered.length}：${covered}`);
ok(new Set(covered).size === HOSTS.length, "没有域名被两条规则同时覆盖（避免同一个请求被处理两次）");
ok(HOSTS.every(h => covered.includes(h)), "7 个域名一个不少");
ok(hostsOf(upRules[0])?.length === HOSTS.length, "上游那一条本来就覆盖全部 7 个");

console.log("\n【4】拆分只加了 enable=，别的没动");
{
  const upUrl = (upRules[0].match(/script-path=([^,]+)/) || [])[1];
  const selfUrl = (rules[0].match(/script-path=([^,]+)/) || [])[1];
  ok(!!upUrl && !!selfUrl, "两侧 script-path 都能解析");
  ok(rules.every(r => (r.match(/script-path=([^,]+)/) || [])[1] === selfUrl),
     "4 条规则指向同一个托管脚本");
  ok(rules.every(r => /requires-body\s*=\s*true/.test(r)), "4 条都是 requires-body=true");
  ok(rules.every(r => /argument=\[\{Bypass\},\{Strategy\}\]/.test(r)), "4 条都带完整 argument");
  ok(rules.every(r => /tag=Reven-[A-Za-z]+/.test(r)), "每条有自己的 tag（Loon 里能分辨关的是谁）");
  ok(!rules.some(r => /timeout=/.test(r)), "没引入 timeout（上游没有，不擅自加）");
}

console.log("\n【5】URL 匹配范围的行为等价（把上游那条的用例拿来跑新规则）");
{
  const upRe = new RegExp(upRules[0].trim().split(/\s+/)[1]);
  const cases = [
    ["https://api.revenuecat.com/v1/foo", true],
    ["https://subscriptions-api.superwall.com/v1/foo", true],
    ["https://api.adapty.io/v2/x", true],
    ["https://proxy.linearity.io/x", true],
    ["https://api.revenuecat.com.evil.example/v1/foo", false],
    ["https://evil.example/v1/foo", false],
    ["http://api.revenuecat.com/v1/foo", false],
  ];
  for (const [url, want] of cases) {
    const got = rules.some(r => new RegExp(r.trim().split(/\s+/)[1]).test(url));
    ok(got === want && upRe.test(url) === want, `4 条合并后与上游行为一致：${url}`, `得到 ${got}，期望 ${want}`);
  }
}

console.log("\n【6】脚本内部的域名正则不能比清单窄");
// 拆分规则后，若脚本自己那份正则漏了某个域，清单放行 → 脚本不匹配 → $done({}) 静默透传
const jsAlt = (js.match(/const regex = \/\^https:\\\/\\\/\(([^)]+)\)/) || [])[1];
ok(!!jsAlt, "脚本里的 regex 常量可解析");
const jsHosts = jsAlt ? jsAlt.split("|").map(s => s.replace(/\\\./g, ".")) : [];
ok(jsHosts.length === HOSTS.length, "脚本覆盖域名数 == 7", `实际 ${jsHosts.length}`);
ok(HOSTS.every(h => jsHosts.includes(h)), "脚本覆盖的 7 个域 == 清单的 7 个域");
ok(rules.flatMap(hostsOf).every(h => jsHosts.includes(h)),
   "清单放行的每一个域脚本都认（否则会被静默透传，解锁看起来『时好时坏』）");

console.log("\n【7】开关接线");
{
  const arg = sec(lpx, "Argument");
  const declared = [...arg.matchAll(/^(\w+)\s*=\s*switch,\s*(\w+)/gm)].map(m => [m[1], m[2]]);
  ok(declared.length === 4, "[Argument] 声明了 4 个 switch", `实际 ${declared.length}`);
  ok(declared.every(([, d]) => d === "true"), "4 个开关默认全开（true）", JSON.stringify(declared));
  ok(declared.map(([n]) => n).join(",") === "revenuecat,superwall,linearity,adapty",
     "开关名与 SDK 一一对应", declared.map(([n]) => n).join(","));
  const used = rules.map(r => (r.match(/enable=\{(\w+)\}/) || [])[1]);
  ok(used.every(n => declared.some(([d]) => d === n)), "每条规则的 enable 都指向已声明的开关",
     JSON.stringify(used));
  ok(new Set(used).size === 4, "没有两个规则共用一个开关（否则关一个连带关两个）");
  ok(declared.every(([d]) => used.includes(d)), "没有声明了却没人用的孤儿开关");
  // 上游那两个参数必须逐字保留
  const upArg = sec(upLpx, "Argument");
  for (const key of ["Bypass", "Strategy"]) {
    const a = upArg.split("\n").find(l => l.startsWith(key + " = "));
    const b = arg.split("\n").find(l => l.startsWith(key + " = "));
    ok(!!a && a === b, `${key} 逐字未改`);
  }
  ok(!/enable=.*&&|enable=.*\|\|/.test(lpx),
     "没用 && / || 组合条件（Loon 官方 script.md 只记载 enable=true 与单变量，组合无据可依）");
}

console.log("\n【8】[Mitm] 与上游逐字相同（Loon 无法用开关关 MITM，如实记录）");
ok(sec(lpx, "Mitm") === sec(upLpx, "Mitm"), "[Mitm] 逐字相同");
const listed = (sec(lpx, "Mitm").match(/hostname\s*=\s*(.+)/)?.[1] || "").split(",").map(s => s.trim());
ok(listed.length === HOSTS.length && HOSTS.every(h => listed.includes(h)),
   "7 个域名一个不少、没多", `实际 ${listed.length}`);

console.log("\n【9】script-path 指向本仓库，清单里零作者域残留");
ok(!new RegExp(AUTHOR.replace(/\./g, "\\.")).test(lpx), "镜像清单里不含作者域");
{
  const selfUrl = (rules[0].match(/script-path=([^,]+)/) || [])[1];
  ok(selfUrl === SELF_RAW, "指向本仓库 main 分支的托管副本", `实际 ${selfUrl}`);
  const vendoredKey = Object.keys(manifest.sources).find(k => k.endsWith("src/loon-redirect.js"));
  ok(vendoredKey && selfUrl.endsWith("/" + vendoredKey), "URL 结尾就是 manifest 登记的仓库内路径");
  ok(fs.existsSync(path.join(repo, vendoredKey)), "该文件在本仓库里确实存在");
}

console.log("\n【10】托管脚本：逐字节等于上游（本次一行未改）");
ok(sha256(path.join(dir, "src/loon-redirect.js")) === UPSTREAM_JS_SHA, "脚本 sha256 == 上游基线");
ok(sha256(path.join(dir, "upstream-Reven.lpx")) === UPSTREAM_LPX_SHA, "上游清单原件 sha256 == 基线");
ok(manifest.sources["plugins/Reven-Mirror/src/loon-redirect.js"].sha256 === UPSTREAM_JS_SHA,
   "manifest.json 登记一致");

console.log("\n【11】🔴 镜像【没有】消除作者域依赖 —— 钉成断言");
ok(new RegExp(AUTHOR.replace(/\./g, "\\.")).test(js), "脚本仍把请求转发到作者的 Worker");
ok(/headers:\s*\$request\.headers/.test(js), "原始请求头（含 Authorization）仍被转发");
ok(/const targetUrl = `https:\/\/reven\.jsforbaby\.workers\.dev\/reven\/\$\{host\}\/\$\{rest\}/.test(js),
   "转发目标把 host/path 原样拼到作者域下");
ok(!/\$done\(\{\s*response:\s*\{\s*status:\s*200/.test(js), "脚本不在本地伪造回包");

console.log("\n【12】外部资源基线已登记（tools/external-watch.json）");
{
  const by = Object.fromEntries(watch.resources.map(r => [r.id, r]));
  ok(by["reven-lpx"]?.sha256 === UPSTREAM_LPX_SHA, "清单基线哈希与本仓库原件一致");
  ok(by["reven-script"]?.sha256 === UPSTREAM_JS_SHA, "脚本基线哈希与本仓库托管副本一致");
  ok(!!by["reven-icon"], "图标也登记了（同样是每次现取）");
}

console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
