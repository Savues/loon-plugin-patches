#!/usr/bin/env node
/*
 * mock-server.js — Forward 插件的 mock 服务端独立实现
 *
 * 用途：不想在 Loon 里跑脚本，或想在电脑上复现/自建这个 mock 时使用。
 *       零依赖，只用 Node 内置模块。
 *
 * 启动：node mock-server.js [端口]        默认 8787
 * 验证：curl -X POST http://127.0.0.1:8787/forward/v1/purchase/iap/subscription
 *
 * 路径与线上 worker 完全对应：
 *   POST /forward/v1/purchase/iap/subscription  -> 200, application/json, 386 字节
 *   其他路径 / GET 该路径                        -> 404（与线上行为一致）
 *
 * 若要自建，把 Loon 清单里的改写目标换成你的地址，例如：
 *   ^https:\/\/fluxapi\.vvebo\.vip\/v1\/purchase\/iap\/subscription header http://192.168.1.10:8787/forward/v1/$1
 */
const http = require("http");

const PREFIX_HEX =
  "731570b90002b037ecb28b93c9f9e56800e2433a4b8105ba8bdb74b176f0b284" +
  "77f4b4e43f59428f55726af611e1dff61ac322125bd3537fdd6b1573d719771c" +
  "7086cc7a204f7909b34ab2902e0546973941031af766fce853ecedf99b2640f" +
  "4c18960412bb7aa2886c6d40743a29d76447edbe3d803cb0bee8e798d2165cc0c";

const PREFIX_LEN = 128;
const RANDOM_LEN = 160;
const TARGET_PATH = "/forward/v1/purchase/iap/subscription";

const port = Number(process.argv[2]) || 8787;

const server = http.createServer((req, res) => {
  // 与线上保持一致：只有 POST + 精确路径才返回凭据，其余一律 404
  if (req.method !== "POST" || req.url.split("?")[0] !== TARGET_PATH) {
    res.writeHead(404, { "content-type": "text/plain; charset=UTF-8" });
    return res.end("404 Not Found");
  }

  req.resume();   // 丢弃请求体：线上对 body 不做任何处理

  const full = Buffer.alloc(PREFIX_LEN + RANDOM_LEN);
  Buffer.from(PREFIX_HEX, "hex").copy(full, 0);
  require("crypto").randomFillSync(full, PREFIX_LEN, RANDOM_LEN);

  const body = JSON.stringify(full.toString("base64"));   // 386 字节
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
});

server.listen(port, () => {
  console.log(`forward mock server 已启动: http://127.0.0.1:${port}`);
  console.log(`  POST ${TARGET_PATH}`);
  console.log(`  响应: 128 字节固定前缀 + ${RANDOM_LEN} 字节随机 -> base64 -> 386 字节 JSON 字符串`);
});
