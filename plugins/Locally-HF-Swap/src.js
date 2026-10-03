/*
 Locally 模型劫持 —— 把 App 要下载的 HF 仓库，整体换成你指定的任意仓库

 依据：一次完整下载抓包（15 条请求）显示 Locally 的下载 URL 只有三种形态：
   1) /api/models/{repo}/revision/{ref}              取元数据
   2) /{repo}/resolve/{sha}/{file}                   302/307 跳 CDN 下大文件
   3) /api/resolve-cache/models/{repo}/{sha}/{file}  直接回文件内容（小文件）

 三种都要换，且 sha 必须换成「目标仓库真实的 sha」—— 实测：
   · 用别家仓库的 sha 请求           → 404
   · resolve-cache 里用 main 代替 sha → 400
 所以形态 3 走 $httpClient 查一次 sha 并缓存（$persistentStore），只查一次。

 参数来源按可靠性排序依次尝试，任何一种解析成功即停：
   1. $argument（对象 / 字符串 / 数组，各写法都试）
   2. $persistentStore.read("targetRepo")
 参数兼容对象 / 数组 / "k=v" 字符串三种写法，不依赖具体传参形态。
*/

var HOST = "https://huggingface.co";
var CACHE_PREFIX = "/api/resolve-cache/models/";
var REPO_RE = /^[\w.\-]+\/[\w.\-]+$/;

var TARGET = "";

// 从一个值里尽最大努力抠出 repo id；抠不出返回空串
function pick(a) {
  if (a === null || a === undefined || a === "") return "";
  if (typeof a === "string") {
    var s = a.trim();
    if (!s) return "";
    // "repo=owner/name" / "targetRepo=owner/name" / "a=1&repo=owner/name"
    var kv = s.match(/(?:^|[?&,;])(?:repo|targetRepo)=([^&;,]+)/i);
    if (kv) return decodeURIComponent(kv[1]).trim();
    // "[owner/name]" —— 去掉方括号
    if (s.charAt(0) === "[" && s.charAt(s.length - 1) === "]") s = s.slice(1, -1).trim();
    // 逗号分隔取第一段
    s = s.split(",")[0].trim();
    return s;
  }
  if (typeof a === "object") {
    if (Array.isArray(a)) {
      for (var i = 0; i < a.length; i++) {
        var r = pick(a[i]);
        if (r) return r;
      }
      return "";
    }
    var keys = ["repo", "targetRepo", "Repo", "RepoName", "value", "0"];
    for (var k = 0; k < keys.length; k++) {
      if (a[keys[k]] !== undefined && a[keys[k]] !== null) {
        var v = pick(a[keys[k]]);
        if (v) return v;
      }
    }
    // 兜底：遍历所有键，找第一个像 repo id 的字符串
    for (var key in a) {
      var v2 = pick(a[key]);
      if (v2) return v2;
    }
  }
  return "";
}

(function () {
  // 1) $argument
  try {
    var a = (typeof $argument === "undefined") ? null : $argument;
    TARGET = pick(a);
    if (TARGET && !REPO_RE.test(TARGET)) TARGET = "";
  } catch (e) {
    TARGET = "";
  }

  // 2) $persistentStore 兜底（某些版本/写法下参数可能落在这里）
  if (!TARGET) {
    try {
      TARGET = pick($persistentStore.read("targetRepo"));
      if (TARGET && !REPO_RE.test(TARGET)) TARGET = "";
    } catch (e2) { /* 忽略 */ }
  }
})();

if (!REPO_RE.test(TARGET)) {
  // 参数没传进来 / 不是合法 repo id → 原样放行，绝不挡路。
  $done({});
} else {
  var url = $request.url;

  if (url.indexOf(HOST) === 0 && url.indexOf("/" + TARGET + "/") < 0) {

    // 只对 path 做匹配：$request.url 含 scheme+host，正则不能从 ^ 锚起
    var qs = url.indexOf("?");
    var path = qs < 0 ? url.substring(HOST.length) : url.substring(HOST.length, qs);
    var m;

    if ((m = path.match(/^\/api\/models\/([^/]+\/[^/]+)\/revision\/[^/]+$/))) {
      // 形态 1：元数据。换成目标仓库后，App 会从响应里读到目标仓库
      // 真实的 sha 与文件清单，后续 URL 它自己就拼对了。
      //
      // 但 App 会用元数据里的 id 决定落盘目录，而它只认白名单里的目录名
      // —— 目标仓库名不在白名单，文件下完也用不了（2026-10-03 实测）。
      // 所以把原仓库名记下来，供响应阶段（meta-fix.js）把身份字段改回去；
      // 同时记下目标仓库名，响应阶段要靠它查 ?blobs=true 取真实文件大小。
      $persistentStore.write(m[1], "origRepo");
      try { $persistentStore.write(TARGET, "targetRepo"); } catch (e) {}
      $done({ url: HOST + "/api/models/" + TARGET + "/revision/main" });

    } else if ((m = path.match(/^\/[^/]+\/[^/]+\/resolve\/[^/]+\/(.+)$/))) {
      // 形态 2：大文件。sha 一律换成 main —— 实测 307 正常跳转
      $done({ url: HOST + "/" + TARGET + "/resolve/main/" + m[1] });

    } else if ((m = path.match(/^\/api\/resolve-cache\/models\/[^/]+\/[^/]+\/[^/]+\/(.+)$/))) {
      // 形态 3：resolve-cache，必须用真实 sha
      var file = m[1];
      var key = "hf_sha_" + TARGET;
      var cached = $persistentStore.read(key);

      if (cached) {
        $done({ url: HOST + CACHE_PREFIX + TARGET + "/" + cached + "/" + file });
      } else {
        $httpClient.get({ url: HOST + "/api/models/" + TARGET + "/revision/main", timeout: 8000 },
          function (err, resp, data) {
            var sha = "";
            try { sha = JSON.parse(data).sha || ""; } catch (e) {}
            if (sha) { $persistentStore.write(sha, key); }
            $done({ url: HOST + CACHE_PREFIX + TARGET + "/" + (sha || "main") + "/" + file });
          });
      }

    } else {
      $done({});
    }

  } else {
    $done({});
  }
}
