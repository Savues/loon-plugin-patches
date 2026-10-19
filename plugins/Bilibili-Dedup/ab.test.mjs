/*
 * ab.js 回放测试（真实 abserver 响应样本来自 HAR 405/国际版 HAR）。
 * Node 里跑：node ab.test.mjs
 */
import { readFileSync } from "node:fs";
import assert from "node:assert";

const SRC = readFileSync(new URL("./ab.js", import.meta.url), "utf8");
const URL_AB = "https://app.bilibili.com/x/resource/abtest/abserver?access_key=x";

// 真实响应（HAR 405 [257]，逐字节）
const realBody = () => JSON.stringify({
  code: 0, message: "OK", ttl: 1,
  data: { errorCode: 0, expire: 1800000, hit: { hitGroup: "" }, vars: [] },
});

function run({ body, arg = {} }) {
  let done = null;
  const ctx = {
    $argument: arg,
    $request: { url: URL_AB },
    $response: { body },
    $done: (v) => { done = v === undefined ? {} : v; },
  };
  // eslint-disable-next-line no-new-func
  new Function("$argument", "$request", "$response", "$done", SRC)(
    ctx.$argument, ctx.$request, ctx.$response, ctx.$done,
  );
  return done;
}
const json = (d) => (d && typeof d === "object" && "body" in d ? JSON.parse(d.body) : null);
const untouched = (d) => assert.deepStrictEqual(d, {}, "应当原样透传 ($done({}))");

let pass = 0;
function t(name, fn) {
  try { fn(); pass++; }
  catch (e) { console.error("FAIL " + name + "\n      " + e.message); process.exitCode = 1; }
}

t("开关关闭 → 原样透传", () => {
  const d = run({ body: realBody(), arg: { vipAvatarBadge: "false" } });
  untouched(d);
});

t("开关开启 → 两个 ff 开关注入（真实空 vars 样本）", () => {
  const d = run({ body: realBody(), arg: { vipAvatarBadge: true } });
  const j = json(d);
  assert.ok(j, "应有改写后的 body");
  assert.strictEqual(j.data.vars.length, 2);
  const names = j.data.vars.map((v) => v.name);
  assert.ok(names.includes("ff_new_avatar_view_enabled"));
  assert.ok(names.includes("ff_new_avatar_view_same_data_is_update"));
  for (const v of j.data.vars) {
    assert.strictEqual(v.value, "true");
    assert.strictEqual(v.force, 1);
    assert.ok(v.group, "group 必须非空（storageDict 三字段缺一即被丢弃）");
  }
  // 其余字段不动
  assert.strictEqual(j.data.expire, 1800000);
  assert.strictEqual(j.data.hit.hitGroup, "");
  assert.strictEqual(j.code, 0);
});

t("服务器已分对照组 → 条目就地翻转为 true（不重复注入）", () => {
  const body = JSON.stringify({
    code: 0, data: {
      errorCode: 0, expire: 1,
      hit: { hitGroup: "" },
      vars: [
        { name: "ff_new_avatar_view_enabled", group: "G0", value: "false", force: 0 },
        { name: "another_exp", group: "G1", value: "1", force: 0 },
      ],
    },
  });
  const d = run({ body, arg: { vipAvatarBadge: "true" } });
  const j = json(d);
  const target = j.data.vars.find((v) => v.name === "ff_new_avatar_view_enabled");
  assert.strictEqual(target.value, "true");
  assert.strictEqual(target.force, 1);
  assert.strictEqual(target.group, "G0", "未知字段保留");
  assert.strictEqual(j.data.vars.length, 3, "另一个实验条目保留 + 新增 same_data 开关");
  assert.strictEqual(j.data.vars.find((v) => v.name === "another_exp").value, "1");
});

t("vars 缺失/非数组 → 补成数组再注入", () => {
  const body = JSON.stringify({ code: 0, data: { expire: 1, hit: {} } });
  const j = json(run({ body, arg: { vipAvatarBadge: true } }));
  assert.strictEqual(j.data.vars.length, 2);
});

t("data 缺失 → 透传", () => {
  untouched(run({ body: JSON.stringify({ code: -304, data: null }), arg: { vipAvatarBadge: true } }));
});

t("非 JSON body → 透传不炸", () => {
  untouched(run({ body: "<html>bad gateway</html>", arg: { vipAvatarBadge: true } }));
});

console.log(`ab.test.mjs: ${pass} passed`);
