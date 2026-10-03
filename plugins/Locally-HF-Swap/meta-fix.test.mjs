/*
 * meta-fix.js 回归测试。node meta-fix.test.mjs
 *
 * 真实场景（2026-10-03 实测）：App 点了 mlx-community/MiniCPM5-1B-mlx-6Bit，
 * 但插件把元数据换成了 usermma/Huihui-MiniCPM5-1B-abliterated-mlx-2Bit，
 * App 收到 id=目标仓库 → 按目标仓库名落盘 → 该目录不在白名单 →
 * 文件完整下载了却读不到，报「出了点问题 超时」。
 * meta-fix.js 把身份字段改回原模型，sha/siblings 保持目标仓库。
 *
 * 元数据样本取自真机抓包（HAR 里的 base64 响应体，已解码）。
 */
import { readFileSync } from "node:fs";
import assert from "node:assert";

const SRC = readFileSync(new URL("./meta-fix.js", import.meta.url), "utf8");
const LPX = readFileSync(new URL("./Locally-HF-Swap.lpx", import.meta.url), "utf8");
const REQSRC = readFileSync(new URL("./src.js", import.meta.url), "utf8");

const ORIG = "mlx-community/MiniCPM5-1B-mlx-6Bit";

// 真机抓包里 App 实际收到的元数据（id 已是目标仓库，字段与 HF 实际返回一致）
const META = {
  _id: "6a2063dfbad9223e3096258b",
  id: "usermma/Huihui-MiniCPM5-1B-abliterated-mlx-2Bit",
  modelId: "usermma/Huihui-MiniCPM5-1B-abliterated-mlx-2Bit",
  author: "usermma",
  sha: "338e97683bcbd3d454db3fd25296f953cd263254",
  usedStorage: 675773842,
  siblings: [
    { rfilename: ".gitattributes", size: 1519 },
    { rfilename: "README.md", size: 1177 },
    { rfilename: "chat_template.jinja", size: 9062 },
    { rfilename: "config.json", size: 886 },
    { rfilename: "generation_config.json", size: 213 },
    { rfilename: "model.safetensors", size: 337886921 },
    { rfilename: "model.safetensors.index.json", size: 39380 },
    { rfilename: "tokenizer.json", size: 9894271 },
    { rfilename: "tokenizer_config.json", size: 431 },
  ],
};

const store = Object.create(null);

function run(body, orig = ORIG) {
  let out, done = false;
  // 每次显式设置，避免上一轮的值泄漏到下一轮（orig=null 表示「没有 origRepo」）
  if (orig === null) delete store["origRepo"];
  else store["origRepo"] = orig;
  const $persistentStore = {
    read: (k) => (k in store ? store[k] : null),
    write: (v, k) => { store[k] = v; return true; },
  };
  const $response = { status: 200, headers: {}, body };
  const $done = (o) => { done = true; out = (o && o.body) !== undefined ? o.body : "(unchanged)"; };
  // eslint-disable-next-line no-new-func
  new Function("$persistentStore", "$response", "$done", SRC)($persistentStore, $response, $done);
  assert.ok(done, "meta-fix.js 没有调用 $done —— 会挂住响应");
  return out;
}

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); }
}
const group = (t) => console.log("\n" + t);

group("核心目标：身份字段改回原模型");
check("id 改回原仓库（App 据此决定落盘目录）", () => {
  const out = JSON.parse(run(JSON.stringify(META)));
  assert.equal(out.id, ORIG);
});
check("modelId / author 一并改回", () => {
  const out = JSON.parse(run(JSON.stringify(META)));
  assert.equal(out.modelId, ORIG);
  assert.equal(out.author, "mlx-community");
});
check("_id 同步改回", () => {
  const out = JSON.parse(run(JSON.stringify(META)));
  assert.equal(out._id, ORIG);
});

group("必须保留目标仓库的字段（否则下载不了）");
check("sha 保持目标仓库的（App 用它拼后续 URL）", () => {
  const out = JSON.parse(run(JSON.stringify(META)));
  assert.equal(out.sha, "338e97683bcbd3d454db3fd25296f953cd263254");
});
check("权重文件仍在 siblings 里", () => {
  const out = JSON.parse(run(JSON.stringify(META)));
  const names = out.siblings.map((s) => s.rfilename);
  for (const n of ["config.json", "tokenizer.json", "model.safetensors",
                   "model.safetensors.index.json", "chat_template.jinja"]) {
    assert.ok(names.includes(n), "siblings 丢了 " + n);
  }
});
check("siblings 里每个文件的 size 原样保留", () => {
  const out = JSON.parse(run(JSON.stringify(META)));
  const w = out.siblings.find((s) => s.rfilename === "model.safetensors");
  assert.equal(w.size, 337886921);
});

group("usedStorage —— 与文件总和不等，必须按实算");
check("usedStorage 改为 siblings 实算总和（且等于过滤后的和）", () => {
  const out = JSON.parse(run(JSON.stringify(META)));
  const tot = out.siblings.reduce((a, s) => a + s.size, 0);
  assert.equal(out.usedStorage, tot,
    "usedStorage 应等于过滤后 siblings 的 size 之和");
  // 关键前置：样本里 usedStorage 远大于实际文件总和，
  // 若原样透传，App 会一直等一个永远下不到的总量。
  assert.ok(META.usedStorage > tot * 1.5,
    "前置条件不成立：样本 usedStorage 应明显大于文件总和");
});
check("过滤掉 README.md / .gitattributes 等仓库附属文件", () => {
  const out = JSON.parse(run(JSON.stringify(META)));
  const names = out.siblings.map((s) => s.rfilename);
  assert.ok(!names.includes("README.md"), "README.md 未被过滤");
  assert.ok(!names.includes(".gitattributes"), ".gitattributes 未被过滤");
});
check("siblings 无 size 字段时保持原样，不伪造 usedStorage", () => {
  const noSize = { ...META, siblings: META.siblings.map((s) => ({ rfilename: s.rfilename })) };
  const out = JSON.parse(run(JSON.stringify(noSize)));
  assert.equal(out.usedStorage, META.usedStorage, "无 size 时不应臆造 usedStorage");
});

group("安全网：任何异常都原样放行，绝不返回半个 JSON");
check("未记下原仓库（origRepo 不存在）→ 放行", () => {
  const out = run(JSON.stringify(META), null);
  assert.equal(out, "(unchanged)");
});
check("origRepo 不含斜杠 → 放行", () => {
  const out = run(JSON.stringify(META), "garbage");
  assert.equal(out, "(unchanged)");
});
check("body 不是 JSON → 放行", () => {
  assert.equal(run("<html>not json</html>"), "(unchanged)");
});
check("body 为空 → 放行", () => {
  assert.equal(run(""), "(unchanged)");
});
check("JSON 解析后是数组 → 放行", () => {
  assert.equal(run("[1,2,3]"), "(unchanged)");
});
check("缺 id 字段也不报错，正常输出", () => {
  const out = JSON.parse(run(JSON.stringify({ sha: "abc", siblings: [] })));
  assert.equal(out.sha, "abc");
});

group("与请求阶段的配合");
check("src.js 在改写元数据时记下原仓库名", () => {
  assert.match(REQSRC, /persistentStore\.write\(m\[1\],\s*"origRepo"\)/,
    "src.js 未记录 origRepo，meta-fix.js 就无从还原身份");
});
check(".lpx 有 http-response 规则指向 meta-fix.js", () => {
  const line = LPX.split("\n").find((l) => l.startsWith("http-response"));
  assert.ok(line, ".lpx 缺少 http-response 规则");
  assert.ok(line.includes("models"), "http-response 未匹配 /api/models/");
  assert.ok(line.includes("meta-fix.js"), "http-response 未指向 meta-fix.js");
  assert.ok(line.includes("requires-body=true"), "http-response 缺少 requires-body=true");
});
check(".lpx 两条规则都受同一开关控制", () => {
  const m = LPX.match(/enable=\{swapOn\}/g) || [];
  assert.equal(m.length, 2, "http-request 与 http-response 都应有 enable");
});

console.log(`\n${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);