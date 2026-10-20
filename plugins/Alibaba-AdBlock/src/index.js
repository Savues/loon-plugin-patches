/*
 * Alibaba-AdBlock — 统一入口路由 (src/index.js)
 * 版本: 2.0.0
 * 多 App 架构：核心模块 + App 专属逻辑
 */

const { isEnabled, safeParse, log } = require('./core/common.js');
const { handleMoonResponse } = require('./apps/moon.js');

/**
 * App 路由表
 * key: URL 关键字匹配
 * value: 处理函数
 */
const APP_ROUTERS = {
  // Moon App (阿里妈妈/淘宝联盟)
  "mtop.alimama.union.skyleap.distribution.batchsite": handleMoonResponse,
  "mtop.etao.noah.query": handleMoonResponse,
  "mtop.alimama.moon.provider.tac.service": handleMoonResponse,
  "mtop.taobao.union.marquee.query": handleMoonResponse,
  "mtop.alimama.moon.provider.metax.homepage.query": handleMoonResponse,
  "mtop.alimama.union.pub.entry": handleMoonResponse,
  
  // TODO: 添加其他 App 的路由
  // "mtop.mtop.tbhome.query": handleTaobaoResponse,
  // "mtop.tmall.home.query": handleTmallResponse,
  // "mtop.xianyu.feed.query": handleXianyuResponse,
};

/**
 * 统一入口函数
 */
function main() {
  if (!$response || !$response.body) {
    log("No response body");
    $done({});
    return;
  }

  const url = $request?.url || "";
  log("Script triggered for:", url);

  const body = typeof $response.body === "string" ? $response.body : $response.body.toString();

  // 查找匹配的路由
  for (const [pattern, handler] of Object.entries(APP_ROUTERS)) {
    if (url.includes(pattern)) {
      log(`Matched router: ${pattern}`);
      const newBody = handler(body, url);
      if (newBody !== null && newBody !== body) {
        log("Response modified by:", pattern);
        $done({ body: newBody });
        return;
      }
      break; // 匹配到路由但无变化，不再继续
    }
  }

  log("No matching handler or no changes");
  $done({});
}

main();