/*
 * AgentRouter 清单回归测试。Node 里跑：node test/manifest.test.mjs
 *
 * 本插件只改清单层，脚本逐字节沿用上游，因此这里只校验清单：
 * 开关默认关闭、cron 挂上开关、手动触发不受开关控制，
 * 以及上游的 Argument / argument= 对应关系没被改坏。
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert";

const ROOT = new URL("../", import.meta.url);
const lpx = readFileSync(new URL("AgentRouter.lpx", ROOT), "utf8");

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); }
}

console.log("AgentRouter 清单回归测试\n");

/* ---------- 开关 ---------- */

t("auto 声明为 switch 且默认 false", () => {
  assert.match(lpx, /^auto\s*=\s*switch\s*,\s*false/m);
});

t("cron 挂上 enable={auto}", () => {
  assert.match(lpx, /^cron .*enable=\{auto\}$/m);
});

t("没有残留无条件 enable=true（开关才是唯一入口）", () => {
  assert.ok(!lpx.includes("enable=true"), "仍有 enable=true");
});

/* ---------- 手动触发 ---------- */

t("存在 generic 手动触发规则", () => {
  assert.match(lpx, /^generic /m);
});

t("generic 不受开关控制（开关关着也能手动签）", () => {
  const g = /^generic .*$/m.exec(lpx);
  assert.ok(g, "没有 generic 规则");
  assert.ok(!g[0].includes("enable="), "generic 被开关挡住了：" + g[0]);
});

t("两条规则都带 tag，插件页面上能看到两个可点项", () => {
  const rules = lpx.split("\n").filter(l => /^(cron|generic) /.test(l));
  assert.strictEqual(rules.length, 2, "规则数应为 2，实际 " + rules.length);
  for (const r of rules) assert.ok(/tag=/.test(r), "缺 tag: " + r);
});

/* ---------- 上游 Argument 完整保留 ---------- */

const UPSTREAM_ARGS = ["username", "password", "accounts", "debug"];

t("上游 4 个 Argument 一条没删", () => {
  for (const k of UPSTREAM_ARGS) {
    assert.match(lpx, new RegExp("^" + k + "\\s*=", "m"), "丢了 " + k);
  }
});

t("argument= 仍是上游那 4 个 key（auto 是纯开关，不进列表）", () => {
  const m = /argument=\[([^\]]*)\]/.exec(lpx);
  assert.ok(m, "没有 argument=");
  assert.deepStrictEqual(m[1].split(",").map(s => s.trim().replace(/[{}]/g, "")), UPSTREAM_ARGS);
});

t("两条规则的 argument= 完全一致", () => {
  const all = [...lpx.matchAll(/argument=\[([^\]]*)\]/g)].map(m => m[1]);
  assert.ok(all.length >= 2);
  for (const a of all) assert.strictEqual(a, all[0]);
});

/* ---------- 脚本层托管且逐字节未改 ---------- */

t("script-path 全部指向本仓库托管的副本", () => {
  const urls = [...lpx.matchAll(/script-path=(\S+?)(?:,|\s|$)/g)].map(m => m[1]);
  assert.ok(urls.length, "没有 script-path");
  for (const u of urls) {
    assert.ok(u.startsWith("https://raw.githubusercontent.com/Savues/loon-plugin-patches/"),
              "仍指向上游: " + u);
  }
});

t("托管的脚本与清单原件都在仓库里", () => {
  for (const f of ["src/agentrouter.js", "upstream-agentrouter.lpx"]) {
    assert.ok(existsSync(new URL(f, ROOT)), "缺 " + f);
  }
});

t("manifest.json 登记了这两个文件", () => {
  const m = JSON.parse(readFileSync(new URL("manifest.json", ROOT), "utf8"));
  for (const f of ["plugins/AgentRouter/src/agentrouter.js",
                   "plugins/AgentRouter/upstream-agentrouter.lpx"]) {
    assert.ok(m.sources[f], "manifest 未登记 " + f);
    assert.match(m.sources[f].sha256, /^[0-9a-f]{64}$/);
  }
});

t("清单原件与脚本原件的 sha256 都与 manifest 一致（托管件没被改动）", () => {
  const m = JSON.parse(readFileSync(new URL("manifest.json", ROOT), "utf8"));
  for (const f of ["upstream-agentrouter.lpx", "src/agentrouter.js"]) {
    const actual = createHash("sha256").update(readFileSync(new URL(f, ROOT))).digest("hex");
    assert.strictEqual(actual, m.sources["plugins/AgentRouter/" + f].sha256, f + " 已被改动");
  }
  assert.strictEqual(
    m.sources["plugins/AgentRouter/upstream-agentrouter.lpx"].upstream,
    "https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/main/app/agentrouter/agentrouter.lpx");
  assert.strictEqual(
    m.sources["plugins/AgentRouter/src/agentrouter.js"].upstream,
    "https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/main/app/agentrouter/agentrouter.js");
});

t("icon 仍指向上游（每次现取，不托管）", () => {
  assert.match(lpx, /^#!icon=https:\/\/raw\.githubusercontent\.com\/MaYIHEI\//m);
});

t("无 MITM 段（本插件不解密任何域名）", () => {
  assert.ok(!/\[MITM\]/i.test(lpx));
});

/* ---------- 元信息 ---------- */

t("保留原作者署名", () => {
  assert.ok(lpx.includes("773075692") && lpx.includes("MaYIHEI"));
});

t("标注修改版与仓库地址", () => {
  assert.ok(/^#!author=.*Savues/m.test(lpx), "author 未标注修改版");
  assert.ok(/^#!homepage=https:\/\/github\.com\/Savues\/loon-plugin-patches/m.test(lpx));
});

t("desc 说明了默认值与用法", () => {
  const d = /^#!desc=(.*)$/m.exec(lpx)[1];
  assert.ok(/默认关闭/.test(d), "desc 未说明默认关闭");
});

/* ---------- 汇总 ---------- */

console.log(`\n${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);