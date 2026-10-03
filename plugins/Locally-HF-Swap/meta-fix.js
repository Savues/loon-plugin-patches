/*
 Locally-HF-Swap 响应阶段：把元数据修成 App 能正确校验的样子

 真机实测的三个问题（2026-10-03，Locally / iPadOS 18.7.3）：

 1) 身份不对 —— 目录名对不上
    请求阶段把元数据换成了目标仓库，App 收到的 id 是目标仓库名，
    于是按目标仓库名落盘。而 Locally 只认白名单里的目录名，
    文件完整下载了也读不到。
    → 把 id / modelId / author / _id 改回 App 原本点的模型。

 2) 总量对不上 —— 传输中途被 App 掐断
    HF 的 usedStorage 与实际文件总和并不相等（实测某仓库
    usedStorage=675773842 而文件总和仅 347832341，差 1.94 倍）。
    App 拿 usedStorage 当「应下载总量」，等一个永远下不到的数，
    于是中途 RST 断流（日志里能看到 Left stream RST:8）。
    → 按 siblings 里的真实 size 重算 usedStorage。

 3) siblings 没有 size 字段
    App 请求的 URL 不带 ?blobs=true，HF 返回的 siblings 只有
    {"rfilename": "xxx"}，没有 size。上一版想「按 siblings 实算」，
    但根本拿不到 size，等于什么都没做。
    → 这里主动用 $httpClient 查一次带 ?blobs=true 的元数据取真实大小，
      结果缓存进 $persistentStore，整个下载过程只查一次。

 安全网：任何一步失败都原样放行 —— 宁可不改，也不能把 JSON 改坏。
*/

var HOST = "https://huggingface.co";

// 从 siblings 里剥掉 App 不会下载的仓库附属文件。
// 注意 README.md 是大写，不能只判首字符是否为 "."。
function keep(s) {
  if (!s || !s.rfilename) return false;
  var n = s.rfilename;
  return n.charAt(0) !== "." && n.toUpperCase() !== "README.MD";
}

// 用真实大小重算 usedStorage；没有 size 就保持原值，绝不臆造
function recompute(d) {
  var sib = d.siblings;
  if (!sib || !sib.length) return;
  var tot = 0, any = false;
  for (var i = 0; i < sib.length; i++) {
    if (typeof sib[i].size === "number") { tot += sib[i].size; any = true; }
  }
  if (any && tot > 0) d.usedStorage = tot;
}

// 读持久化值，任何异常都当没有
function rd(k) {
  try { return $persistentStore.read(k) || ""; } catch (e) { return ""; }
}
function wr(v, k) {
  try { $persistentStore.write(v, k); } catch (e) {}
}

function bail() { $done({}); }

// 序列化输出，任何异常都原样放行
function emit(d) {
  var out;
  try { out = JSON.stringify(d); } catch (e) { out = null; }
  if (typeof out === "string" && out.length) $done({ body: out });
  else bail();
}

var orig = rd("origRepo");

if (orig.indexOf("/") < 0) {
  // 没记下原仓库（本次没走请求阶段的改写）→ 不碰响应
  bail();
} else {
  var d;
  try {
    d = JSON.parse($response.body);
  } catch (e1) {
    bail();
  }

  if (!d || typeof d !== "object" || Array.isArray(d)) {
    // typeof [] 也是 "object"，必须显式排除数组
    bail();
  } else {
    // ---- 1) 身份字段改回原模型 ----
    try {
      var parts = orig.split("/");
      d.id = orig;
      d.modelId = orig;
      d.author = parts[0];
      if (d._id) d._id = orig;
    } catch (e2) {}

    // ---- 过滤 siblings ----
    try {
      if (d.siblings && d.siblings.length) {
        d.siblings = d.siblings.filter(keep);
      }
    } catch (e3) {}

    var tgt = rd("targetRepo");

    // siblings 已带 size（部分接口版本会返回）→ 直接重算，不必再查
    var haveSize = false;
    try {
      if (d.siblings && d.siblings.length && typeof d.siblings[0].size === "number") {
        haveSize = true;
      }
    } catch (e4) {}

    // ---- 2) usedStorage 修正 ----
    if (haveSize) {
      try { recompute(d); } catch (e5) {}
      emit(d);

    } else if (tgt.indexOf("/") < 0) {
      // 拿不到目标仓库名，也查不到 size → 只做身份改写
      try { recompute(d); } catch (e6) {}
      emit(d);

    } else {
      // ---- 3) 主动查 ?blobs=true 取真实大小 ----
      var key = "hf_blobs_" + tgt;
      var cached = rd(key);

      var apply = function (blobStr) {
        if (blobStr) {
          try {
            var blob = JSON.parse(blobStr);
            if (blob && blob.siblings && d.siblings) {
              var map = {};
              for (var i = 0; i < blob.siblings.length; i++) {
                var b = blob.siblings[i];
                if (b && b.rfilename) map[b.rfilename] = b.size;
              }
              for (var j = 0; j < d.siblings.length; j++) {
                var s = d.siblings[j];
                if (s && s.rfilename && typeof map[s.rfilename] === "number") {
                  s.size = map[s.rfilename];
                }
              }
            }
          } catch (e7) {}
        }
        try { recompute(d); } catch (e8) {}
        emit(d);
      };

      if (cached) {
        apply(cached);
      } else {
        $httpClient.get({
          url: HOST + "/api/models/" + tgt + "/revision/main?blobs=true",
          timeout: 8000
        }, function (err, resp, data) {
          var s = "";
          if (!err && data) {
            // 只有确认带 size 才缓存，避免把无效响应存下来
            try {
              var probe = JSON.parse(data);
              if (probe && probe.siblings &&
                  typeof probe.siblings[0].size === "number") {
                s = data;
                wr(data, key);
              }
            } catch (e9) {}
          }
          apply(s);   // 查不到就只做身份改写
        });
      }
    }
  }
}