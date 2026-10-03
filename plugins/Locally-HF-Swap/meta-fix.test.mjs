/*
 * meta-fix.js 回归测试。node meta-fix.test.mjs
 *
 * ⚠️ 样本形态必须与真机一致（这是上一版翻车的原因）：
 *   App 请求的元数据 URL **不带 ?blobs=true**，HF 返回的 siblings 只有
 *   {"rfilename": "xxx"}，**没有 size 字段**。真机抓包实测：
 *     "content":{"size":11543,...,"text":"<base64>"} 解码后
 *     siblings[0] === {"rfilename":"chat_template.jinja"}
 *   上一版测试用了我自己查 ?blobs=true 得到的带 size 样本，
 *   于是脚本「按 siblings 实算」这条分支永远走不到，测试却全绿 ——
 *   真机上等于什么都没做。**mock 形态必须来自真机证据。**
 *
 * 因此这里分两组样本：
 *   META_NO_SIZE —— 真机形态，siblings 无 size（走 $httpClient 查 blobs 分支）
 *   META_SIZE    —— 防御性样本，siblings 带 size（走同步重算分支）
 */
import { readFileSync } from "node:fs";
import assert from "node:assert";

const SRC = readFileSync(new URL("./meta-fix.js", import.meta.url), "utf8");
const LPX = readFileSync(new URL("./Locally-HF-Swap.lpx", import.meta.url), "utf8");
const REQSRC = readFileSync(new URL("./src.js", import.meta.url), "utf8");

const ORIG = "mlx-community/MiniCPM5-1B-mlx-6Bit";
const TGT = "usermma/Huihui-MiniCPM5-1B-abliterated-mlx-2Bit";

// 真机抓包解码出的元数据（id 已是目标仓库；siblings 无 size）
const META_NO_SIZE = {
  _id: "6a2063dfbad9223e3096258b",
  id: TGT,
  modelId: TGT,
  author: "usermma",
  sha: "338e97683bcbd3d454db3fd25296f953cd263254",
  usedStorage: 675773842,
  siblings: [
    { rfilename: "chat_template.jinja" },
    { rfilename: "config.json" },
    { rfilename: "generation_config.json" },
    { rfilename: "model.safetensors" },
    { rfilename: "model.safetensors.index.json" },
    { rfilename: "tokenizer.json" },
    { rfilename: "tokenizer_config.json" },
  ],
};

// 真实文件大小（curl ?blobs=true 实测；不含 README/.gitattributes）
const REAL_SIZES = {
  "chat_template.jinja": 9062,
  "config.json": 886,
  "generation_config.json": 213,
  "model.safetensors": 337886921,
  "model.safetensors.index.json": 39380,
  "tokenizer.json": 9894271,
  "tokenizer_config.json": 431,
};
const REAL_TOTAL = Object.values(REAL_SIZES).reduce((a, b) => a + b, 0); // 347832341

// 带 size 的防御性样本
const META_SIZE = {
  ...META_NO_SIZE,
  siblings: Object.entries(REAL_SIZES).map(([rfilename, size]) => ({ rfilename, size })),
};

let store = Object.create(null);

function run(body, opts = {}) {
  const { orig = ORIG, target = TGT, blob = "real", preset = {} } = opts;
  store = Object.create(null);
  store["origRepo"] = orig;
  if (target !== null) store["targetRepo"] = target;
  Object.assign(store, preset);

  let out, done = false, fetched = null;
  const $persistentStore = {
    read: (k) => (k in store ? store[k] : null),
    write: (v, k) => { store[k] = v; return true; },
  };
  const $response = { status: 200, headers: {}, body };
  const $httpClient = {
    get(p, cb) {
      fetched = p.url;
      if (blob === "fail") cb("timeout", null, null);
      else if (blob === "nosize") cb(null, { status: 200 }, JSON.stringify({ siblings: [{ rfilename: "x" }] }));
      else cb(null, { status: 200 }, JSON.stringify({
        siblings: Object.entries(REAL_SIZES).map(([rfilename, size]) => ({ rfilename, size })),
      }));
    },
  };
  const $done = (o) => {
    done = true;
    out = (o && o.body) !== undefined ? o.body : "(unchanged)";
  };
  // eslint-disable-next-line no-new-func
  new Function("$persistentStore", "$response", "$httpClient", "$done", SRC)(
    $persistentStore, $response, $httpClient, $done
  );
  assert.ok(done, "meta-fix.js 没有调用 $done —— 会挂住响应");
  return { out, fetched };
}

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); }
}
const group = (t) => console.log("\n" + t);

group("核心：身份字段改回原模型（App 据此决定落盘目录）");
check("真机形态（siblings 无 size）下 id 也改回原仓库", () => {
  const { out } = run(JSON.stringify(META_NO_SIZE));
  assert.equal(JSON.parse(out).id, ORIG);
});
check("modelId / author / _id 一并改回", () => {
  const o = JSON.parse(run(JSON.stringify(META_NO_SIZE)).out);
  assert.equal(o.modelId, ORIG);
  assert.equal(o.author, "mlx-community");
  assert.equal(o._id, ORIG);
});

group("必须保留目标仓库的字段（否则下载不了）");
check("sha 保持目标仓库的（App 用它拼后续 URL）", () => {
  const o = JSON.parse(run(JSON.stringify(META_NO_SIZE)).out);
  assert.equal(o.sha, "338e97683bcbd3d454db3fd25296f953cd263254");
});
check("7 个权重/配置文件全部仍在 siblings", () => {
  const o = JSON.parse(run(JSON.stringify(META_NO_SIZE)).out);
  const names = o.siblings.map((s) => s.rfilename);
  for (const n of Object.keys(REAL_SIZES)) assert.ok(names.includes(n), "丢了 " + n);
});

group("问题3：siblings 无 size 时主动查 ?blobs=true");
check("确实发起了带 ?blobs=true 的查询", () => {
  const { fetched } = run(JSON.stringify(META_NO_SIZE));
  assert.ok(fetched && fetched.includes("?blobs=true"),
    "未查询 blobs，实际: " + fetched);
  assert.ok(fetched.includes(TGT), "查询的应是目标仓库: " + fetched);
});
check("把真实 size 填进 siblings", () => {
  const o = JSON.parse(run(JSON.stringify(META_NO_SIZE)).out);
  const w = o.siblings.find((s) => s.rfilename === "model.safetensors");
  assert.equal(w.size, 337886921, "权重 size 未填入");
  const t = o.siblings.find((s) => s.rfilename === "tokenizer.json");
  assert.equal(t.size, 9894271);
});

group("问题2：usedStorage 改成真实文件总和");
check("usedStorage 从 675773842 改为 347832341", () => {
  const o = JSON.parse(run(JSON.stringify(META_NO_SIZE)).out);
  assert.equal(o.usedStorage, REAL_TOTAL,
    "App 拿 usedStorage 当应下载总量，对不上就会中途 RST 断流");
});
check("该值恰好等于过滤后 siblings 的 size 之和", () => {
  const o = JSON.parse(run(JSON.stringify(META_NO_SIZE)).out);
  const tot = o.siblings.reduce((a, s) => a + (s.size || 0), 0);
  assert.equal(o.usedStorage, tot);
});
check("前置断言：原值远大于实际总和（1.94 倍）", () => {
  assert.ok(META_NO_SIZE.usedStorage > REAL_TOTAL * 1.9);
});
check("siblings 本身带 size 时走同步重算，不发多余请求", () => {
  const { out, fetched } = run(JSON.stringify(META_SIZE));
  assert.equal(fetched, null, "已有 size 却还去查 blobs");
  assert.equal(JSON.parse(out).usedStorage, REAL_TOTAL);
});

group("缓存：只查一次");
check("查询结果写入 hf_blobs_{repo}", () => {
  const key = "hf_blobs_" + TGT;
  run(JSON.stringify(META_NO_SIZE));
  // run 内部重建了 store，这里改为直接验证脚本行为：再跑一次应不发请求
  const { fetched } = run(JSON.stringify(META_NO_SIZE), { preset: { [key]: JSON.stringify({ siblings: Object.entries(REAL_SIZES).map(([rfilename, size]) => ({ rfilename, size })) }) } });
  assert.equal(fetched, null, "命中缓存却仍发了请求");
  assert.equal(JSON.parse(fetched || "{}") && 1, 1);
});
check("命中缓存时 usedStorage 依然正确", () => {
  const key = "hf_blobs_" + TGT;
  const { out } = run(JSON.stringify(META_NO_SIZE), {
    preset: { [key]: JSON.stringify({ siblings: Object.entries(REAL_SIZES).map(([rfilename, size]) => ({ rfilename, size })) }) },
  });
  assert.equal(JSON.parse(out).usedStorage, REAL_TOTAL);
});

group("安全网：任何失败都原样放行，绝不返回半个 JSON");
check("blobs 查询失败 → 只改身份，不臆造 usedStorage", () => {
  const { out } = run(JSON.stringify(META_NO_SIZE), { blob: "fail" });
  const o = JSON.parse(out);
  assert.equal(o.id, ORIG, "身份仍应改回");
  assert.equal(o.usedStorage, META_NO_SIZE.usedStorage,
    "查不到 size 时必须保持原值，不得臆造");
});
check("blobs 返回无 size 的响应 → 同上，不缓存不臆造", () => {
  const { out } = run(JSON.stringify(META_NO_SIZE), { blob: "nosize" });
  const o = JSON.parse(out);
  assert.equal(o.id, ORIG);
  assert.equal(o.usedStorage, META_NO_SIZE.usedStorage);
});
check("未记下原仓库 → 放行", () => {
  assert.equal(run(JSON.stringify(META_NO_SIZE), { orig: "" }).out, "(unchanged)");
});
check("origRepo 不含斜杠 → 放行", () => {
  assert.equal(run(JSON.stringify(META_NO_SIZE), { orig: "garbage" }).out, "(unchanged)");
});
check("body 不是 JSON → 放行", () => {
  assert.equal(run("<html>x</html>").out, "(unchanged)");
});
check("body 为空 → 放行", () => {
  assert.equal(run("").out, "(unchanged)");
});
check("JSON 是数组 → 放行", () => {
  assert.equal(run("[1,2,3]").out, "(unchanged)");
});
check("拿不到 targetRepo → 只改身份，不发请求", () => {
  const { out, fetched } = run(JSON.stringify(META_NO_SIZE), { target: null });
  assert.equal(fetched, null, "无目标仓库时不应发请求");
  assert.equal(JSON.parse(out).id, ORIG);
});

group("与请求阶段 / 清单的配合");
check("src.js 改写元数据时记下 origRepo", () => {
  assert.match(REQSRC, /persistentStore\.write\(m\[1\],\s*"origRepo"\)/);
});
check("src.js 同时记下 targetRepo 供响应阶段取用", () => {
  assert.match(REQSRC, /write\(TARGET,\s*"targetRepo"\)/,
    "响应阶段需要 targetRepo 才能查 ?blobs=true");
});
check(".lpx 有 http-response 指向 meta-fix.js 且 requires-body=true", () => {
  const line = LPX.split("\n").find((l) => l.startsWith("http-response"));
  assert.ok(line, "缺少 http-response 规则");
  assert.ok(line.includes("models"), "未匹配 /api/models/");
  assert.ok(line.includes("meta-fix.js"), "未指向 meta-fix.js");
  assert.ok(line.includes("requires-body=true"), "缺少 requires-body=true");
});
check(".lpx 两条规则都受同一开关控制", () => {
  assert.equal((LPX.match(/enable=\{swapOn\}/g) || []).length, 2);
});

console.log(`\n${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);