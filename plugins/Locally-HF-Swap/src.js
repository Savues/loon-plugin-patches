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

 参数：$argument.repo = "owner/name"（HF 仓库 id）
*/

var TARGET = (($argument && $argument.repo) || "").trim();
var HOST = "https://huggingface.co";
var CACHE_PREFIX = "/api/resolve-cache/models/";

if (!/^[\w.\-]+\/[\w.\-]+$/.test(TARGET)) {
  // 参数没填好 / 不是合法 repo id → 原样放行，绝不挡路
  $done({});
} else {
  var url = $request.url;

  if (url.indexOf(HOST) === 0 && url.indexOf("/" + TARGET + "/") < 0) {

    // 只对 path 做匹配：$request.url 含 scheme+host，正则不能从 ^ 锚起
    var qs = url.indexOf("?");
    var path = qs < 0 ? url.substring(HOST.length) : url.substring(HOST.length, qs);
    var m;

    if ((m = path.match(/^\/api\/models\/[^/]+\/[^/]+\/revision\/[^/]+$/))) {
      // 形态 1：元数据。换成目标仓库后，App 会从响应里读到目标仓库
      // 真实的 sha 与文件清单，后续 URL 它自己就拼对了。
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
