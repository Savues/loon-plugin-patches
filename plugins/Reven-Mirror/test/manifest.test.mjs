/*
 * manifest.test.mjs — Reven-Mirror.lpx 的托管正确性校验
 * 运行：node test/manifest.test.mjs
 *
 * 本插件只做了一件事：把 script-path 指向本仓库。所以测试的核心命题只有一个 ——
 *   「除了那个 URL，别的什么都没动；而且【脚本本身】确实一行没改。」
 * 顺带把「镜像没有消除作者域依赖」这个事实钉成断言：将来谁想悄悄改掉转发目标，
 * 这条测试会先红。
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

// 上游基线（2026-09-29 实测，见 UPSTREAM.md）
const UPSTREAM_JS_SHA = "425c476e04fc84a0b01b944d9eb718e22be46b7be55a956745148408f1c217eb";
const UPSTREAM_LPX_SHA = "4ed9911cfaa52b4b58c8b2650ace0500402b2870bcfd958b9d23f19653b078aa";
const SELF_RAW = "https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Reven-Mirror/src/loon-redirect.js";
const AUTHOR = "reven.jsforbaby.workers.dev";

console.log("【1】清单头部（元信息保持上游原样）");
ok(/^#!name=Reven$/m.test(lpx), "#!name=Reven");
ok(/^#!desc=.+/m.test(lpx), "#!desc 有描述");
ok(/^#!tag=/m.test(lpx), "#!tag 有标签");
ok(new RegExp(`^#!icon=https://raw\\.githubusercontent\\.com/fishdown/Icon/refs/heads/master/app/RevenueCat\\.png$`, "m").test(lpx),
   "#!icon 仍是上游那一张（托管只管代码，不管图标）");

console.log("\n【2】段结构");
ok(/^\[Argument\]\s*$/m.test(lpx), "有 [Argument] 段");
ok(/^\[Script\]\s*$/m.test(lpx), "有 [Script] 段");
ok(/^\[Mitm\]\s*$/m.test(lpx), "有 [Mitm] 段（注意大小写）");

console.log("\n【3】[Script] 规则与 URL 匹配范围（必须与上游一致）");
const line = lpx.split("\n").find(l => /^\s*http-request\s/.test(l) && /script-path=/.test(l));
ok(!!line, "存在 http-request 规则（排除注释行）");
const upLine = upLpx.split("\n").find(l => /^\s*http-request\s/.test(l) && /script-path=/.test(l));
ok(!!upLine, "上游原件里也有同一条规则");
ok((line || "").split(/\s+/)[1] === (upLine || "").split(/\s+/)[1],
   "URL 正则与上游逐字符相同（匹配范围没动）");

// 按 Loon 的实际做法校验：把清单里的原始正则原样编译，去匹配真实端点 URL
const pat = (line || "").trim().split(/\s+/)[1] || "";
let re = null;
try { re = new RegExp(pat); } catch (e) { /* 交给下面断言报 */ }
ok(!!re, "URL 正则可编译", pat);
const HOSTS = ["api.revenuecat.com", "api.rc-backup.com", "rc.visionarytech.ltd",
               "revenue.cuto.app", "proxy.linearity.io",
               "subscriptions-api.superwall.com", "api.adapty.io"];
for (const h of HOSTS) {
  ok(re ? re.test(`https://${h}/v1/foo`) : false, `匹配 ${h}`);
}
ok(re ? !re.test("https://api.revenuecat.com.evil.example/v1/foo") : false, "不误伤相似域名");
ok(re ? !re.test("https://evil.example/v1/foo") : false, "不误伤其他域名");
ok(re ? !re.test("http://api.revenuecat.com/v1/foo") : false, "不匹配 http://（与上游行为一致）");
ok(/requires-body\s*=\s*true/.test(line || ""), "requires-body=true（与上游一致）");
ok(/argument=\[\{Bypass\},\{Strategy\}\]/.test(line || ""), "argument=[{Bypass},{Strategy}]");
ok(!/enable\s*=/.test(line || ""), "仍然没有 enable=（上游本来就没有开关，托管不新增也不承诺）");

console.log("\n【4】script-path 指向本仓库");
const sp = (line || "").match(/script-path=([^,]+)/);
ok(!!sp, "script-path 可解析");
ok(sp?.[1] === SELF_RAW, "指向本仓库 main 分支的托管副本", `实际 ${sp?.[1]}`);
ok(!new RegExp(AUTHOR.replace(/\./g, "\\.")).test(lpx), "镜像清单里零作者域残留");
// 仓库内路径以 manifest.json 登记的键为准（别拿 URL 切路径，切出来的 "main" 是分支名不是目录）
const vendoredKey = Object.keys(manifest.sources).find(k => k.endsWith("src/loon-redirect.js"));
ok(!!vendoredKey, "manifest.json 登记了托管脚本的仓库内路径");
ok(vendoredKey === "plugins/Reven-Mirror/src/loon-redirect.js", "登记路径符合约定", vendoredKey);
ok(sp?.[1]?.endsWith("/" + vendoredKey), "script-path 的结尾就是那个路径", `实际 ${sp?.[1]}`);
ok(fs.existsSync(path.join(repo, vendoredKey)), "script-path 指向的文件在本仓库里确实存在");

console.log("\n【5】与上游清单逐行比对：只允许差 script-path 那一行");
{
  const A = lpx.split("\n"), B = upLpx.split("\n");
  ok(A.length === B.length, "行数相同", `${B.length} → ${A.length}`);
  const diffIdx = A.map((v, i) => (v === B[i] ? -1 : i)).filter(i => i >= 0);
  ok(diffIdx.length === 1, "有且只有 1 行不同", `实际 ${diffIdx.length} 行：${diffIdx.join(",")}`);
  const i = diffIdx[0];
  if (i >= 0) {
    // 两个 URL 都从各自的清单里取，不另写常量 —— 常量写错就测不出来了
    const upUrl = (upLine || "").match(/script-path=([^,]+)/)?.[1];
    const selfUrl = (line || "").match(/script-path=([^,]+)/)?.[1];
    ok(!!upUrl && !!selfUrl && upUrl !== selfUrl, "两个 script-path URL 可解析且不同");
    // 把上游行里的 URL 换成我们的，应当逐字符等于镜像行
    ok(upUrl && A[i] === B[i].split(upUrl).join(selfUrl),
       "那一行的差异【仅限】script-path 的 URL（双向替换可复原）");
  }
}

console.log("\n【6】[Argument] 与 [Mitm] 逐字保留（托管不改行为）");
{
  const sec = (txt, name) => {
    const i = txt.search(new RegExp(`^\\[${name}\\]\\s*$`, "im"));
    if (i < 0) return "";
    const rest = txt.slice(i).split("\n").slice(1);
    const end = rest.findIndex(l => /^\s*\[/.test(l));
    return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
  };
  ok(sec(lpx, "Argument") === sec(upLpx, "Argument"), "[Argument] 逐字相同");
  ok(sec(lpx, "Mitm") === sec(upLpx, "Mitm"), "[Mitm] 逐字相同");
  const arg = sec(lpx, "Argument");
  ok(/Bypass\s*=\s*input,\s*"-"/.test(arg), "Bypass 默认 -（全部解锁）");
  ok(/Strategy\s*=\s*select,\s*"auto"/.test(arg), "Strategy 默认 auto");
  ok(!/switch/.test(arg), "[Argument] 里没有 switch —— 装了就没法只关一部分（记录事实）");
  const mitm = sec(lpx, "Mitm");
  const listed = (mitm.match(/hostname\s*=\s*(.+)/)?.[1] || "").split(",").map(s => s.trim());
  ok(listed.length === HOSTS.length, `hostname 仍是 ${HOSTS.length} 个`, `实际 ${listed.length}`);
  ok(HOSTS.every(h => listed.includes(h)), "7 个域名一个不少、没多");
}

console.log("\n【7】托管脚本：逐字节等于上游");
ok(sha256(path.join(dir, "src/loon-redirect.js")) === UPSTREAM_JS_SHA,
   "src/loon-redirect.js sha256 == 上游基线（2026-09-29）");
ok(sha256(path.join(dir, "upstream-Reven.lpx")) === UPSTREAM_LPX_SHA,
   "upstream-Reven.lpx sha256 == 上游基线");
ok(manifest.sources["plugins/Reven-Mirror/src/loon-redirect.js"].sha256 === UPSTREAM_JS_SHA,
   "manifest.json 里登记的哈希一致");
ok(manifest.sources["plugins/Reven-Mirror/src/loon-redirect.js"].bytes === 4369, "登记大小 4369 B");

console.log("\n【8】🔴 镜像【没有】消除作者域依赖 —— 钉成断言");
ok(new RegExp(AUTHOR.replace(/\./g, "\\.")).test(js),
   "脚本仍把请求转发到作者的 Worker（这是事实，不是缺陷）");
ok(/headers:\s*\$request\.headers/.test(js), "原始请求头（含 Authorization）仍被转发");
ok(/const targetUrl = `https:\/\/reven\.jsforbaby\.workers\.dev\/reven\/\$\{host\}\/\$\{rest\}/.test(js),
   "转发目标是把 host/path 原样拼到作者域下");
ok(!/\$done\(\{\s*response:\s*\{\s*status:\s*200/.test(js),
   "脚本不在本地伪造回包（本地没有解锁逻辑，客户端确实无可改之处）");
ok(!/strategy=|bypass=/.test(lpx.replace(/argument=\[\{Bypass\},\{Strategy\}\]/, "")),
   "Bypass/Strategy 只作为查询参数发给 Worker");

console.log("\n【9】外部资源基线已登记（tools/external-watch.json）");
{
  const by = Object.fromEntries(watch.resources.map(r => [r.id, r]));
  ok(!!by["reven-lpx"], "登记了插件清单");
  ok(!!by["reven-script"], "登记了脚本");
  ok(by["reven-lpx"]?.sha256 === UPSTREAM_LPX_SHA, "清单基线哈希与本仓库原件一致");
  ok(by["reven-script"]?.sha256 === UPSTREAM_JS_SHA, "脚本基线哈希与本仓库托管副本一致");
  ok(by["reven-script"]?.kind === "script-path", "脚本被标为 script-path（代码类资源）");
  ok(!!by["reven-icon"], "图标也登记了（它同样是每次现取）");
}

console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
