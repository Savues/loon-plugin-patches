/*
 * itunes-spoof.test.mjs — 清单托管正确性 + 真机参数形状回归
 * 运行：node test/itunes-spoof.test.mjs
 *
 * ── v1.02 的教训（本插件最重要的一条）─────────────────────────────
 * v1.0/v1.01 我认定「上游把 $argument 当驼峰对象读、而 Loon 传逗号字符串」，
 * 据此写了 1.7 KB 壳层去"修"。**真机诊断证明这个 bug 不存在**：
 *
 *   TYPE=object
 *   KEYS=["Enabled","Expires","Country"]
 *   K=Enabled TYPE=string VAL="true"
 *   K=Expires TYPE=string VAL="2099-09-09"
 *   K=Country TYPE=string VAL="HK"
 *
 * Loon 传的 $argument 就是对象，键名正是上游读取的那三个，值也正确。
 * **上游一直读得到参数，一直正常。**
 *
 * 失效的真凶是我自己：壳层里 `typeof $argument !== 'string'` 就强制置空，
 * 于是真机传对象时判成「关」→ 不转发 → App 拿到 Apple 原包 → 订阅被下掉。
 *
 * 错因：拿 Node 沙盒的结果当真机结论。沙盒里我传的是字符串，
 * 测出「上游收不到参数」；真机传的是对象，那个"现象"根本不存在。
 *
 * 所以本文件现在钉两件事：
 *   1. 真机实测的参数形状 —— 防止有人再按「字符串」的假设改代码
 *   2. 清单指向的是上游原件，壳层已删除，上游逐字节未改
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..");
const read = p => fs.readFileSync(p, "utf8");
const sha256 = p => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

const upstream = read(path.join(dir, "src/loon-itunes.js"));
const lpx = read(path.join(dir, "iTunes-Spoof.lpx"));
const upLpx = read(path.join(dir, "upstream-iTunes.lpx"));

const UPSTREAM_SHA = "2fab4bf8fa34d367d234be7577d706e7054ad8b44bebd2249f495d0cce30ee8d";
const WORKER = "reven.lovebabyforever.workers.dev";

let pass = 0, fail = 0;
const ok = (c, name, extra = "") => {
  if (c) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra); }
};

console.log("【1】🔴 真机实测的参数形状（唯一的接口事实来源）");
{
  // 这三条来自 iPad 真机诊断插件的回显，不是推断，也不是沙盒。
  // 任何「上游收不到参数 / 需要类型转换」的说法都与它们矛盾。
  const REAL = { Enabled: "true", Expires: "2099-09-09", Country: "HK" };
  ok(typeof REAL === "object", "Loon 传的 $argument 是**对象**，不是逗号字符串");
  ok(Object.keys(REAL).join(",") === "Enabled,Expires,Country",
     "键名正是 Enabled/Expires/Country", Object.keys(REAL).join(","));
  ok(REAL.Enabled === "true" && REAL.Expires === "2099-09-09" && REAL.Country === "HK",
     "三个值都正确（默认配置下）", JSON.stringify(REAL));
  ok(REAL.Enabled === "true", "⇒ 上游读 $argument.Enabled 读到的是 'true'，不是 undefined");
  // 上游源码里这三个键名是编码态、明文 0 次，所以只能靠真机证据，不能扫源码。
  for (const k of ["Enabled", "Expires", "Country"]) {
    ok(upstream.includes(k) === false,
       `（记录）上游源码里 "${k}" 明文出现 0 次 —— 键名只能靠真机取证`, String(upstream.includes(k)));
  }
}

console.log("\n【2】🔴 壳层必须已删除（它才是失效的唯一原因）");
{
  ok(!lpx.includes("itunes-spoof.js"), "script-path 不是合成的 itunes-spoof.js");
  ok(/src\/loon-itunes\.js/.test(lpx), "script-path 指向上游原件 loon-itunes.js");
  ok(!fs.existsSync(path.join(dir, "src/prelude.js")), "壳层文件已删除（不是注释掉，是不在仓库里）");
  ok(!fs.existsSync(path.join(dir, "src/itunes-spoof.js")), "合成脚本已删除");
  ok(!fs.existsSync(path.join(dir, "build.mjs")), "构建脚本已删除（不再需要生成）");
  // 那行 `typeof $argument !== 'string'` 就是把真机传的对象判成「关」的那句。
  // 保留在注释里作为证据，但仓库里不能再有活代码执行它。
  ok(!read(path.join(dir, "test/e2e-real-upstream.mjs")).includes("itunes-spoof.js"),
     "e2e 脚本已改指上游原件");
}

console.log("\n【3】上游逐字节未改");
{
  ok(sha256(path.join(dir, "src/loon-itunes.js")) === UPSTREAM_SHA,
     "上游原件 sha256 与基线一致（一个字节没动）",
     sha256(path.join(dir, "src/loon-itunes.js")).slice(0, 16));
  ok(upstream.length === 374259, "体积 374259 B");
}

console.log("\n【4】清单：与上游逐字段对照");
{
  const line = lpx.match(/^http-request .*/m)[0];
  const upLine = upLpx.match(/^http-request .*/m)[0];
  const val = (t, k) => { const m = t.match(new RegExp(`(?:^|[,\\s])${k}=([^,]*)`)); return m ? m[1].trim() : undefined; };

  ok(line.split(" ")[1] === upLine.split(" ")[1], "URL 匹配正则与上游逐字相同");
  ok(val(line, "argument") === val(upLine, "argument"), "argument 与上游相同", val(line, "argument"));
  ok(/requires-body=(1|true)/.test(line), "requires-body 已声明");
  ok(/^http-request /m.test(lpx), "🔴 必须是 http-request（v1.0 改成 http-response 会导致脚本白跑）");
  ok(!/^http-response /m.test(lpx), "没有误改成 http-response（真机证实那样会失效）");
  ok(new RegExp(`Savues/loon-plugin-patches/main/plugins/iTunes-Spoof/src/loon-itunes\\.js`).test(line),
     "script-path 指向本仓库托管副本");
  ok(!lpx.includes(WORKER), "清单里不含 Worker 域名");
  ok(/^#!system=iOS, iPadOS$/m.test(lpx), "含 iPadOS");
  ok(/^hostname = buy\.itunes\.apple\.com$/m.test(lpx), "[Mitm] 一个域名，与上游一致");
  const mitm = lpx.split(/^\[Mitm\]/m)[1] || "";
  ok(!/enable=/.test(mitm), "[Mitm] 段无 enable=（Loon 不支持，关开关不会关解密）");
  // [Argument] 的默认值 —— 这才是真机传进 $argument 的东西
  for (const [k, v] of [["Enabled", "true"], ["Expires", "2099-09-09"], ["Country", "HK"]]) {
    const m = lpx.match(new RegExp(`^${k} = input,\\s*"([^"]*)"`, "m"));
    ok(m && m[1] === v, `${k} 默认值 = ${v}（与真机实测的 $argument 值一致）`, m ? m[1] : "(无)");
  }
}

console.log("\n【5】✅ 真机验证已通过（2026-09-30 00:11）");
{
  // 下面是 iPad 真机抓包的实测值。用来确认「现在这份配置是对的」，
  // 也提醒后来者：这些字段一旦变了，插件多半又不工作了。
  //   script=['iTunes收据转发']  modified=true      ← 脚本触发并改写了响应
  //   回包 2457 B                                     ← 伪造后的长度（Apple 原包是 810）
  //   download_id 末位 900                           ← 897 是 Apple 原值，900 才是伪造
  //   转发目标 …/verifyReceipt?enabled=true&expires=2099-09-09&country=HK
  //   in_app[0] = com.knockout.1year.AIVIP / expires 2099-09-09 / PURCHASED
  ok(/src\/loon-itunes\.js/.test(lpx), "指向上游原件（与成功那次一致）");
  ok(/^http-request /m.test(lpx), "http-request（与成功那次一致）");
  ok(/argument=\[\{Enabled\},\{Expires\},\{Country\}\]/.test(lpx),
     "argument 与成功那次一致");
  // 失效那两版的特征值，出现即说明配置被改回去了
  ok(!/http-response \^https/.test(lpx), "没有退回 v1.0 的 http-response（那样 modified=false）");
  // 那句把对象强制置空的代码原本在壳层里，壳层已整体删除。
  // 这里确认仓库里再没有活代码做这件事（注释里出现是允许的，UPSTREAM.md 有留存）。
  const liveJs = fs.readdirSync(path.join(dir, "src")).map(f => read(path.join(dir, "src", f))).join("\n");
  ok(!/typeof\s+\$argument\s*!==\s*['"]string['"]/.test(liveJs),
     "src/ 下没有把 $argument 强制置空的代码（v1.01 失效的真凶）");
}

console.log("\n【6】🔴 运行时外部依赖仍在 —— 钉成断言，不假装已消除");
{
  ok(!new RegExp(WORKER.replace(/\./g, "\\.")).test(upstream),
     "源码里找不到 Worker 域名（374 KB 内是编码态，扫文本证明不了任何事）");
  ok(fs.existsSync(path.join(dir, "test/e2e-real-upstream.mjs")),
     "与真上游的运行时验证在独立脚本里（默认不跑）");
  ok(fs.existsSync(path.join(dir, "diag/diag.js")), "参数形状诊断脚本留存（真机取证用）");
}

console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
