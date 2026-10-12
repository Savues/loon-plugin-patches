// 迅雷云盘请求探针 - 确认 Script 规则被评估
// Loon http-request script

const $ = new Env("迅雷云盘·请求探针 v1.2");

try {
    $.log(`[Xunlei-Player-Probe] REQUEST 规则触发 | URL: ${$request.url} | Method: ${$request.method} | Range: ${$request.headers?.["Range"] || $request.headers?.["range"] || "无"}`);
} catch (e) {
    console.log(`[Xunlei-Player-Probe] ERROR: ${e.message}`);
}

$.done({});