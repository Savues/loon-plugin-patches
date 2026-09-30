/*
 * diag.test.mjs — 诊断插件的清单正确性
 * 运行：node diag/diag.test.mjs
 *
 * 为什么需要这个文件：ArgShape-Diag.lpx 第一版**漏写了 argument=**，
 * 导致 $argument 根本没定义、诊断输出 TYPE=undefined —— 白跑一轮真机取证。
 *
 * 漏写的根因不是「忘了」，是**没有逐字段对照上游**。
 * 所以这里把 Script 行的每个字段都钉死，并与上游清单对照。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..");
const read = p => fs.readFileSync(p, "utf8");

const diag = read(path.join(dir, "ArgShape-Diag.lpx"));
const up = read(path.join(dir, "upstream-iTunes.lpx"));
const js = read(path.join(here, "diag.js"));

let pass = 0, fail = 0;
const ok = (c, name, extra = "") => {
  if (c) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra); }
};
const scriptLine = t => (t.match(/^http-request .*/m) || [""])[0];
// 把 Script 行拆成 key=value 字段（URL 正则和 argument 里的 [] 要特殊处理）
// 把 Script 行拆成 key=value 字段。
// ⚠ URL 正则后面那段的字段（requires-body=...）前面是**空格**不是逗号，
//    只认 `^` 和 `,` 会漏掉它 —— 第一版就漏了，导致「有 requires-body 字段」假失败。
const fields = line => {
  const out = {};
  const re = /(?:^|,\s*|\s)([a-z][a-z-]*)=/g;
  const marks = [];
  let m;
  while ((m = re.exec(line))) marks.push([m.index + m[0].length, m[1]]);
  marks.forEach(([pos, k], i) => {
    const end = i + 1 < marks.length ? marks[i + 1][0] : line.length;
    // 结尾可能是 ",script-path=" 这样把下一个字段名带进来了 —— 用逗号或行尾截断
    out[k] = line.slice(pos, end).split(/,(?=[a-z][a-z-]*=)/)[0].replace(/,$/, "").trim();
  });
  return out;
};

console.log("【1】🔴 Script 行必须有 argument=（第一版漏了，白跑一轮真机取证）");
{
  const f = fields(scriptLine(diag));
  ok(!!f["argument"], "Script 行有 argument=", JSON.stringify(f["argument"] || null));
  ok(f["argument"] === "[{Enabled},{Expires},{Country}]", "argument 与上游逐字相同", f["argument"]);
}

console.log("\n【2】与上游清单逐字段对照");
{
  const mine = fields(scriptLine(diag));
  const theirs = fields(scriptLine(up));
  ok(Object.keys(mine).length > 0, "Script 行可解析出字段", JSON.stringify(Object.keys(mine)));
  for (const k of ["script-path", "requires-body", "argument"]) {
    ok(mine[k] !== undefined, `有 ${k} 字段`);
    if (k !== "script-path") {
      // 只比值。上游 requires-body 后面跟的是 ",tag=..."，切片边界会把 tag 吃进来，
      // 直接比整段会假失败。真值（true / 1）才是契约，格式不是。
      const norm = v => String(v || "").replace(/[,;].*$/, "").trim();
      ok(norm(mine[k]) === norm(theirs[k]), `${k} 的值与上游相同`,
         `上游 ${norm(theirs[k])} / 本版 ${norm(mine[k])}`);
    }
    else ok(/Savues\/loon-plugin-patches/.test(mine[k]), "script-path 指向本仓库", mine[k]);
  }
  // URL 正则逐字
  ok(scriptLine(diag).split(" ")[1] === scriptLine(up).split(" ")[1], "URL 匹配正则与上游逐字相同");
}

console.log("\n【3】[Argument] 三项的**值**必须与上游一致");
{
  // 注意：只比对 input 的**默认值**（它决定 $argument 里传什么），
  // 不要求 tag/desc 逐字 —— 那是给人看的文案，改中文不影响脚本行为。
  // 一开始把整行都要求逐字相同，是把「文案」当成了「契约」。
  const valOf = t => { const m = (t.match(new RegExp(`^${k} = input,\\s*"([^"]*)"`, "m")) || [])[1]; return m; };
  for (const k of ["Enabled", "Expires", "Country"]) {
    const a = (diag.match(new RegExp(`^${k} = (.*)$`, "m")) || [])[1];
    const b = (up.match(new RegExp(`^${k} = (.*)$`, "m")) || [])[1];
    const va = a && (a.match(/input,\s*"([^"]*)"/) || [])[1];
    const vb = b && (b.match(/input,\s*"([^"]*)"/) || [])[1];
    ok(!!a && !!b, `${k} 已声明`);
    ok(va === vb, `${k} 的默认值与上游相同（这才是 $argument 里传的值）`, `上游 ${vb} / 本版 ${va}`);
    ok(new RegExp(`^${k} = input,`, "m").test(diag), `${k} 是 input 类型`);
  }
  ok(/^#!system=iOS, iPadOS$/m.test(diag), "含 iPadOS");
  ok(/^hostname = buy\.itunes\.apple\.com$/m.test(diag), "[Mitm] 一个域名");
}

console.log("\n【4】诊断脚本必须真能输出（不能只是语法对）");
{
  // 第一版踩过：node --check 只验语法。真正的验收是「跑起来有没有 DIAG-START」。
  ok(!js.includes("loon-itunes"), "不含上游 374 KB（诊断不需要转发）");
  ok(js.includes("$done") && js.includes("599"), "返回 599 响应");
  ok(js.includes("DIAG-START") && js.includes("DIAG-END"), "有明确的起止标记便于从抓包里定位");
  ok(/TYPE=/.test(js) && /RAW=/.test(js) && /CODES=/.test(js), "输出 TYPE/RAW/CODES 三个关键字段");
  ok(/charCodeAt/.test(js), "输出字符码（肉眼分辨不出的引号/全角差异靠它定论）");
  // 真跑一次
  let body = null;
  const vm = await import("node:vm");
  const ctx = { $done: o => { body = o?.response?.body; }, setTimeout: () => {}, Buffer, JSON, String, Math };
  vm.createContext(ctx);
  try { vm.runInContext(`var $argument='true,2099-09-09,HK';`, ctx); vm.runInContext(js, ctx, { timeout: 5000 }); }
  catch (e) { /* throw 是预期的 */ }
  ok(!!body && body.includes("DIAG-START") && body.includes("TYPE=string"),
     "实跑能输出完整诊断体", body ? body.slice(0, 60) : "(无输出)");
}

console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
