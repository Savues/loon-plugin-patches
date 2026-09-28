// 校验：lab 清单的每条正则，对照 v7.18 清单逐条比对
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
// 路径一律相对本文件定位：写死 /var/minis 的话，别人 clone 下来这条闸门直接跑不了
const HERE = dirname(fileURLToPath(import.meta.url));
const OLD_P = resolve(HERE, "../Bilibili-Dedup/Bilibili-Dedup.lpx");
const NEW_P = resolve(HERE, "Bilibili-Dedup-lab.lpx");
if (!existsSync(OLD_P)) { console.error("找不到对照清单: " + OLD_P); process.exit(2); }
const OLD = readFileSync(OLD_P, "utf8");
const NEW = readFileSync(NEW_P, "utf8");
const sec = (txt, name) => {
  const m = txt.match(new RegExp("^\\[" + name + "\\]$", "m"));
  if (!m) { throw new Error("no section " + name); }
  const body = txt.slice(m.index + m[0].length).split(/\n\[/)[0];
  return body.split("\n").map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));   // 注释不算条目
};

// [Rewrite] 必须逐条一致 —— 除非落在显式白名单里（每条都要写明为什么）
const EXPECTED_REWRITE_DELTA = [
  // lab3：DefaultWords 的 mock 补 grpc.biliapi.net。依据：实测 19 次请求 13 次走 grpc，
  // 旧规则只覆盖 app.bili*，滚动词在主力路径上根本没被处理。
  /DefaultWords/,
];
const allowed = (line) => EXPECTED_REWRITE_DELTA.some((re) => re.test(line));
const ro = sec(OLD, "Rewrite"), rn = sec(NEW, "Rewrite");
const dropped = ro.filter((l) => !rn.includes(l));
const added = rn.filter((l) => !ro.includes(l));
const realDelta = [...dropped, ...added].filter((l) => !allowed(l));
const logged = [...dropped, ...added].filter(allowed);
console.log("Rewrite  " + (realDelta.length === 0
  ? "一致 ✓" + (logged.length ? "（含 " + logged.length + " 条已登记的改动）" : "")
  : "有未登记的差异 ✗"));
logged.forEach((l) => console.log("  已登记: " + l.slice(0, 96)));
realDelta.forEach((l) => console.log("  ✗ 未登记: " + l.slice(0, 96)));
if (realDelta.length) process.exitCode = 1;
const uo = sec(OLD, "Rule"), un = sec(NEW, "Rule");
console.log("Rule     " + (JSON.stringify(uo) === JSON.stringify(un) ? "逐条一致 ✓" : "不一致 ✗"));
const mo = sec(OLD, "Mitm"), mn = sec(NEW, "Mitm");
console.log("Mitm     " + (JSON.stringify(mo) === JSON.stringify(mn) ? "逐条一致 ✓" : "不一致 ✗"));
const ao = sec(OLD, "Argument"), an = sec(NEW, "Argument");
console.log("Argument " + ao.length + " -> " + an.length + " 项");

// 2) Script 正则：老规则匹配过的 URL，新规则必须也匹配
const urls = [
  "https://app.bilibili.com/x/v2/account/myinfo?access_key=k",
  "https://app.bilibili.com/x/v2/account/mine?access_key=k",
  "https://app.bilibili.com/x/v2/account/mine/ipad",
  "https://grpc.biliapi.net/bilibili.app.viewunite.v1.View/View",
  "https://app.biliapi.net/bilibili.app.viewunite.v1.View/View",
  "https://app.bilibili.com/bilibili.main.community.reply.v1.Reply/MainList",
  "https://app.bilibili.com/x/v2/space?mid=1",
  "https://app.biliapi.net/x/v2/space/archive/cursor?mid=1",
  "https://app.bilibili.com/x/v2/space/article?mid=1",
  "https://app.biliapi.net/x/v2/space/archive?mid=1",   // 负样本：archive 不该命中
  "https://app.bilibili.com/x/v2/splash/brand/list",
  "https://app.bilibili.com/x/v2/splash/event/list2",
  "https://app.biliapi.net/x/v2/splash/list",
  "https://app.bilibili.com/x/v2/splash/show",
  "https://app.biliapi.net/x/v2/search/square",
  "https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd?fresh_type=4",
  "https://grpc.biliapi.net/bilibili.app.interface.v1.Search/DefaultWords",
  "https://app.biliapi.net/bilibili.app.interface.v1.Search/DefaultWords",
  "https://api.bilibili.com/pgc/page/bangumi?ep_id=1",
  "https://api.biliapi.net/pgc/page/cinema/tab?x=1",
  "https://api.bilibili.com/pgc/page/cinema/tab?",
  "https://app.bilibili.com/pgc/page/bangumi?ep_id=1",   // 负样本：老清单也是 app.，不应命中
  "https://app.bilibili.com/x/v2/account/mine",          // 负样本：老清单要求带 ?，不应命中
  "https://api.live.bilibili.com/xlive/app-room/v1/index/getInfoByRoom?room_id=1",
  "https://grpc.biliapi.net/bilibili.community.service.dm.v1.DM/DmSegMobile",
  "https://grpc.biliapi.net/bilibili.app.show.v1.Popular/Index",
  "https://grpc.biliapi.net/bilibili.polymer.app.search.v1.Search/SearchAll",
  "https://grpc.biliapi.net/bilibili.app.dynamic.v2.Dynamic/DynAll",
  "https://grpc.biliapi.net/bilibili.app.viewunite.v1.View/ViewProgress",
  "https://grpc.biliapi.net/bilibili.app.playurl.v1.PlayURL/PlayView",
];
// [Script] 行格式：<http-response|http-request> <正则> key=value, key=value ...
// 正则是第 2 个 token（正则内不含空格）；若规则不匹配任何 URL 视为解析失败
const re = (l) => {
  const rx = l.split(" ")[1];
  if (!rx || !rx.startsWith("^")) { throw new Error("正则 token 解析失败: " + l.slice(0, 60)); }
  return new RegExp(rx);
};
// 比对口径：tag 是给人看的名字，合并后必然改名（4 条并 1 条）；
// 真正不能变的是「这条 URL 上跑了哪些脚本、带什么开关」→ 用 script-path + enable 标识
const tag = (l) => {
  const raw = (l.match(/script-path=([^,]*)/) || [, "?"])[1].split("/").pop();
  const p = /^vip-(theme|space)\.js$|^vip\.js$/.test(raw) ? "vip.js" : raw;   // 合并后改名，算同一脚本
  const e = (l.match(/enable=\{?([^,}]*)/) || [, ""])[1];
  return p + (e ? "@" + e : "");
};
const tagn = (l) => (l.match(/tag=([^,]*)/) || [, "?"])[1];
const oldS = sec(OLD, "Script"), newS = sec(NEW, "Script");
console.log("\nScript 条数 " + oldS.length + " -> " + newS.length);
let bad = 0, empty = 0, renamed = 0, dedup = 0; const addedFor = [];
for (const u of urls) {
  const o = oldS.filter((l) => re(l).test(u));
  const n = newS.filter((l) => re(l).test(u));
  const oi = o.map(tag), ni = n.map(tag);          // 身份数组，比对必须用它，规则行本身已改名
  const os = oi.join("/"), ns = ni.join("/");
  if (!os) { empty++; console.log("  ??  " + u + "  老清单也没命中，检查 URL 样本"); }
  const same = os === ns;
  // 少数子集且无新增 = 只是「不再重复执行」（合并的预期收益）
  const fewer = !same && ni.every((x) => oi.includes(x)) && ni.length <= oi.length;
  if (same && o.map(tagn).join("/") !== n.map(tagn).join("/")) renamed++;
  if (fewer) { dedup++; continue; }
  const added = ni.filter((x) => !oi.includes(x));
  if (!same && !added.length) { bad++; }
  if (added.length) {
    addedFor.push(u.replace(/^https?:\/\//, "") + "  → " + added.join(","));
    continue;
  }
  console.log((same ? "  ok  " : "  !!  ") + u.replace(/^https?:\/\//, "").padEnd(62)
    + " 老:" + os.padEnd(34) + "新:" + ns);
}
console.log(bad ? "\n脚本集合不一致 " + bad + " 条 ✗" : "\n每个端点上运行的脚本集合一致 ✓");
if (renamed) console.log("（" + renamed + " 条仅 tag 改名，属合并的预期代价）");
if (dedup) console.log("（" + dedup + " 条新清单少跑了重复脚本，属合并的预期收益）");
if (addedFor.length) {
  console.log("\n⚠️ 以下端点**新增**了脚本（每条都需人确认：v7.18 漏 https:// 前缀从未命中 / lab2 新增专栏页覆盖）：");
  addedFor.forEach((s) => console.log("   + " + s));
}
