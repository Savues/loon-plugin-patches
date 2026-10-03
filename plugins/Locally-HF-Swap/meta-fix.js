/*
 Locally-HF-Swap 响应阶段：把元数据的「身份字段」改回 App 原本点的那个模型

 为什么需要（2026-10-03 真机实测）：
   请求阶段把元数据换成了目标仓库，App 收到的 `id` 变成目标仓库名，
   于是它按目标仓库名决定落盘目录。而 Locally **只认白名单里的目录名**，
   目标仓库不在白名单 → 文件确实完整下载了（进度条跑满、337MB 一个字节
   不少），App 却找不到它自己的目录，报「出了点问题 超时」。

 这里改什么、不改什么：
   改回原仓库：id / modelId / author / _id  —— 决定目录名与身份校验
   保留目标仓库：sha / siblings / config   —— 决定实际下载哪些文件、哪个版本
   同时补上 usedStorage：HF 的 usedStorage 与实际文件总和并不相等
   （实测 usermma 仓库：usedStorage 675773842 vs 文件总和 347833860），
   若 App 用它当「应下载总量」会永远等不到，故按 siblings 实算。

 失败时一律原样放行 —— 宁可不动，也不能把 JSON 改坏。
*/

var HOST = "https://huggingface.co";

var orig = "";
try { orig = $persistentStore.read("origRepo") || ""; } catch (e) { orig = ""; }

if (orig.indexOf("/") < 0) {
  // 没记下原仓库（多半是本次没走请求阶段的改写）→ 不碰响应
  $done({});
} else {
  var body = $response.body;
  var d;
  try {
    d = JSON.parse(body);
  } catch (e) {
    $done({});   // 不是 JSON，放行
  }

  if (!d || typeof d !== "object" || Array.isArray(d)) {
    // typeof [] 也是 "object"，必须显式排除数组，否则会把数组当对象改写出错
    $done({});
  } else {
    // 身份字段改回原模型
    try {
      var parts = orig.split("/");
      d.id = orig;
      d.modelId = orig;
      d.author = parts[0];
      if (d._id) d._id = orig;
    } catch (e2) {}

    // 先过滤 siblings（去掉 App 不会下载的仓库附属文件），再据此计算 usedStorage。
    // 顺序很重要：若先算 usedStorage 后过滤，两者会对不上。
    // 注意 README.md 是大写，不能只判首字符是否为 "."。
    try {
      if (d.siblings && d.siblings.length) {
        d.siblings = d.siblings.filter(function (s) {
          if (!s || !s.rfilename) return false;
          var n = s.rfilename;
          return n.charAt(0) !== "." && n.toUpperCase() !== "README.MD";
        });
      }
    } catch (e3) {}

    // usedStorage 按过滤后的 siblings 实算，避免 App 拿它当应下载总量而永远等不到。
    // HF 的 usedStorage 与文件总和并不相等（实测某仓库 675773842 vs 347832341）。
    try {
      var sib = d.siblings;
      if (sib && sib.length && typeof sib[0].size === "number") {
        var tot = 0;
        for (var i = 0; i < sib.length; i++) {
          if (typeof sib[i].size === "number") tot += sib[i].size;
        }
        if (tot > 0) d.usedStorage = tot;
      }
    } catch (e4) {}

    var out;
    try {
      out = JSON.stringify(d);
    } catch (e5) {
      $done({});   // 序列化失败就放行，绝不返回半个 JSON
    }

    if (typeof out !== "string" || !out.length) {
      $done({});
    } else {
      $done({ body: out });
    }
  }
}