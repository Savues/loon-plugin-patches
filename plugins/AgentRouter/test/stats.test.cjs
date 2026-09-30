/* stats.test.cjs —— 通知排版相关纯函数的单元测试
 * Node 里跑：node test/stats.test.cjs
 *
 * 这些函数只吃服务端返回的数据、不联网，从 src/agentrouter.js 里抠出来 eval，
 * 测的是真实实现而不是副本。$persistentStore 用内存替身。
 */
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "agentrouter.js"), "utf8");

const STORE = {};
const $persistentStore = {
  read: (k) => (STORE[k] !== undefined ? STORE[k] : null),
  write: (v, k) => { STORE[k] = String(v); return true; },
  remove: () => { for (const k of Object.keys(STORE)) delete STORE[k]; return true; },
};
const $ = { getdata: (k) => $persistentStore.read(k), setdata: (v, k) => $persistentStore.write(v, k) };

const pick = (name) => {
  const i = src.indexOf("function " + name);
  if (i < 0) throw new Error("找不到 " + name);
  let d = 0;
  const j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) return src.slice(i, k + 1); }
  }
};
eval("const ANNOUNCE_KEY = 'agentrouter_announce_id';\nconst ANNOUNCE_LINES = 3;\n"
  + ["formatStats", "formatAnnouncement", "wrap",
     "formatTopbar", "formatCheckinReward"].map(pick).join("\n"));

const QPU = 500000;
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); }
}
const reset = () => { for (const k of Object.keys(STORE)) delete STORE[k]; };

console.log("=== formatStats：正文第 1 行，一行装完 ===\n");

t("余额 · 已用 · 请求数 挤在一行", () => {
  const s = formatStats({ quota: 671.57 * QPU, used_quota: 3.43 * QPU, request_count: 37 }, QPU);
  if (s !== "💳 余额 $671.57 · 已用 $3.43 · 37 次") throw new Error(s);
});

t("quotaUnit 未取到 → 显示原始额度", () => {
  const s = formatStats({ quota: 100, used_quota: 20, request_count: 5 }, null);
  if (!/💳 余额 100/.test(s) || !/已用 20/.test(s)) throw new Error(s);
});

t("request_count 缺失 → 不显示那一段", () => {
  const s = formatStats({ quota: 100, used_quota: 20 }, QPU);
  if (/次/.test(s)) throw new Error(s);
});

t("全部拿不到 → 明确的失败提示，不返回空串", () => {
  const s = formatStats({}, QPU);
  if (!/余额查询失败/.test(s)) throw new Error(s);
});

console.log("\n=== formatCheckinReward：标题里的金额 ===\n");

t("整数不带 .00（实测就是 $25）", () => {
  if (formatCheckinReward("每日签到成功，增加额度 ＄25.000000 额度") !== " +$25")
    throw new Error(JSON.stringify(formatCheckinReward("每日签到成功，增加额度 ＄25.000000 额度")));
});

t("半角 $ 也能解析", () => {
  if (formatCheckinReward("每日签到成功，增加额度 $40.000000 额度") !== " +$40")
    throw new Error(formatCheckinReward("每日签到成功，增加额度 $40.000000 额度"));
});

t("有小数才保留两位", () => {
  if (formatCheckinReward("每日签到成功，增加额度 ＄12.50 额度") !== " +$12.50")
    throw new Error(formatCheckinReward("每日签到成功，增加额度 ＄12.50 额度"));
});

t("认不出来时给提示而不是静默", () => {
  if (!/未识别/.test(formatCheckinReward("别的内容"))) throw new Error("应提示未识别");
});

console.log("\n=== formatTopbar：顶栏 ===\n");

const DAY19 = { id: 631097, created_at: Date.now() / 1000 - 19 * 86400 };

t("created_at 为 0（登录响应就是 0）→ 不显示天数", () => {
  const s = formatTopbar({ id: 631097, created_at: 0 }, "X");
  if (/天/.test(s)) throw new Error("不该显示天数: " + s);
});

console.log("\n=== wrap：公告断行 ===\n");

t("超长文本：收满 3 行就截，末行加省略号", () => {
  // 约 90 单位，3 行最多装 ~54 单位，必须截断
  const LONG = "额度用完后会报错 402 Budget pool quota has been exhausted，等待下一批投放，"
    + "或切换至 DeepSeek 与 GLM 等其他模型即可继续使用，无需担心额度不足。";
  const lines = wrap(LONG, 3).split("\n");
  if (lines.length !== 3) throw new Error("行数不对: " + lines.length);
  if (!lines[2].endsWith("…")) throw new Error("末行应有省略号: " + lines[2]);
});

t("短文本正好放下：不加省略号", () => {
  // 41 单位 ÷ 19 = 3 行整，放得下就不该有省略号
  const s = wrap("为保障服务长期运行，Claude 和 GPT 模型已调整为限量供应，每日分批次发放，用完即止。", 3);
  if (s.includes("…")) throw new Error("放得下却加了省略号: " + s);
  if (s.split("\n").length !== 3) throw new Error("行数不对: " + s);
});

t("续行缩进 2 格，且缩进算进行宽预算", () => {
  const lines = wrap("一二三四五六七八九十一二三四五六七八九十", 3).split("\n");
  if (!lines[1].startsWith("  ")) throw new Error("续行没缩进: " + JSON.stringify(lines[1]));
  const w = (s) => [...s].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 1 : 0.5), 0);
  for (const l of lines) if (w(l) > 19) throw new Error("行过宽 " + w(l) + ": " + l);
});

t("短文本不补空行", () => {
  if (wrap("很短", 3) !== "很短") throw new Error(wrap("很短", 3));
});

console.log("\n=== formatAnnouncement：只在有新公告时占行 ===\n");

const ANN = [{ id: 16, publishDate: "2026-08-28T03:19:38.000Z", content: "为保障服务长期运行，Claude 和 GPT 模型限量供应" }];

t("首次运行 → 返回公告（没有历史 id）", () => {
  reset();
  const s = formatAnnouncement(ANN);
  if (!/📢 08-28/.test(s)) throw new Error(JSON.stringify(s));
});

t("记下 id 之后再调 → 返回空串（不占行）", () => {
  if (formatAnnouncement(ANN) !== "") throw new Error("不该重复报");
});

t("出现新公告（id 更大）→ 再报一次", () => {
  const s = formatAnnouncement([{ id: 17, publishDate: "2026-09-30T00:00:00.000Z", content: "新公告" }]);
  if (!/09-30/.test(s)) throw new Error(JSON.stringify(s));
});

t("公告为空数组 → 返回空串", () => {
  reset();
  if (formatAnnouncement([]) !== "") throw new Error("不该有内容");
});

t("公告字段缺失 → 不崩", () => {
  reset();
  if (formatAnnouncement([{ id: 1 }]) !== "") throw new Error("内容缺失时不该有输出");
});

t("续行缩进与首行「📢 」等宽（emoji 1 + 空格 0.5 = 1.5 单位）", () => {
  // 真机截图暴露的缺陷：第一版缩进 2 个半角空格（1 个单位），
  // 续行起点比首行文字靠左半个字，肉眼可见。
  const w = (s) => [...s].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 1 : 0.5), 0);
  // 用 2026-09-30 真机那条公告的实际文案（含 "和 GPT" 之间的空格 ——
  // 断行点正好落在那个空格后面，是「某行多缩进一格」缺陷的触发条件）
  const text = "📢 08-28 为保障服务长期运行，Claude 和 GPT 模型已调整为限量供应，"
    + "每日分批次发放，用完即止。新的投放时间为🕙北京时间10:00和19:00。";
  const lines = wrap(text, 3).split("\n");
  // 所有续行的缩进必须完全一致，且等于首行「📢 」的宽度
  const leads = lines.map(l => w(/^(\s*)/.exec(l)[1]));
  if (new Set(leads.slice(1)).size !== 1) {
    throw new Error("各续行缩进不一致: " + JSON.stringify(leads));
  }
  // 缩进宽度必须等于首行「📢 」的宽度
  const prefix = w("📢 ");
  if (leads[1] !== prefix) throw new Error("缩进 " + leads[1] + " 单位 ≠ 首行前缀 " + prefix + " 单位");
});

t("中文标点后的空格被去掉（原文段落换行压成的空格）", () => {
  reset();
  const out = formatAnnouncement([{
    id: 99, publishDate: "2026-09-30T00:00:00.000Z",
    content: "第一段结束。\n\n第二段开始。",
  }]);
  if (/。\s+第/.test(out)) throw new Error("中文标点后仍有空格: " + out);
});

t("副标题：站点名 · ID · 第N天（时间戳占位后仍完整）", () => {
  // 站点名的空格要删掉 —— 副标题右侧留给时间戳（「昨天 20:05」最宽，7 字），
  // 「Agent Router」比「AgentRouter」贵半个单位。
  const s = formatTopbar(DAY19, "Agent Router");
  if (s !== "AgentRouter · 631097 · 第 20 天") throw new Error(s);
});

t("siteName 为空时退回 AgentRouter", () => {
  const s = formatTopbar(DAY19, "");
  if (!/^AgentRouter ·/.test(s)) throw new Error(s);
});

t("created_at 是 0 或负数 → 不显示天数（登录响应就返回 0）", () => {
  for (const c of [0, -1, undefined, null]) {
    const s = formatTopbar({ id: 1, created_at: c }, "X");
    if (/天/.test(s)) throw new Error("created_at=" + c + " 时不该显示天数: " + s);
  }
});

t("created_at 超过 36500 天 → 不显示天数（防脏数据）", () => {
  const ancient = Date.now() / 1000 - 40000 * 86400;
  const s = formatTopbar({ id: 1, created_at: ancient }, "X");
  if (/天/.test(s)) throw new Error("不该显示天数: " + s);
});

console.log("\n" + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
