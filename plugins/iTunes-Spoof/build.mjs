#!/usr/bin/env node
/*
 * build.mjs — 由 prelude.js + loon-itunes.js 生成 itunes-spoof.js
 *
 * 为什么要有这个：Loon 的 .lpx 不支持内联 JavaScript（script.md 全文只有 script-path=），
 * 所以设备上加载的必须是**一个**完整文件。而我们既要保留上游逐字节原件（用于托管校验），
 * 又要在它前面加壳层 —— 不生成就会变成两份内容必须手工保持同步。
 *
 * 生成物 itunes-spoof.js 已入库（设备直接拉它），但它必须由本脚本产出：
 * 改 prelude.js 后必须重跑，否则设备上跑的还是旧的壳层。
 *
 * 用法：
 *   node build.mjs          生成并写入 src/itunes-spoof.js
 *   node build.mjs --check  只校验是否已是最新（CI 用，不写文件）
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const p = f => path.join(dir, f);

const prelude = fs.readFileSync(p("src/prelude.js"), "utf8");
const upstream = fs.readFileSync(p("src/loon-itunes.js"), "utf8");
const MARK = "/* ==== 上游 loon-itunes.js 原件，以下逐字节未改（sha256 2fab4bf8…） ==== */\n";
const out = prelude + MARK + upstream;
const OUT = p("src/itunes-spoof.js");

const sha = s => crypto.createHash("sha256").update(s).digest("hex");

if (process.argv.includes("--check")) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (cur === out) {
    console.log(`✓ src/itunes-spoof.js 与 prelude+upstream 一致（sha256 ${sha(out).slice(0, 16)}…）`);
    process.exit(0);
  }
  console.error("✗ src/itunes-spoof.js 已过期 —— 跑 node build.mjs 重新生成");
  process.exit(1);
}

fs.writeFileSync(OUT, out);

// 生成完立刻自检：剥掉壳层必须与上游逐字节相同。这是最不能出错的一条。
const back = out.slice((prelude + MARK).length);
if (back !== upstream) {
  console.error("✗ 生成物剥掉壳层后与上游不一致 —— 标记行位置错了");
  process.exit(1);
}
console.log(`已写入 src/itunes-spoof.js`);
console.log(`  壳层   ${prelude.length} B`);
console.log(`  上游   ${upstream.length} B（逐字节未改）`);
console.log(`  合计   ${out.length} B   sha256 ${sha(out).slice(0, 16)}…`);
console.log("  自检   剥掉壳层 == 上游原件 ✅");
