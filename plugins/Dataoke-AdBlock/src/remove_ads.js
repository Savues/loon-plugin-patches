// Dataoke-AdBlock 主脚本
// 大淘客联盟/易店长 v4.0.42 去广告规则
// 作者: Savues
// 版本: 1.0.1
// 更新: 2026-10-20

// Loon $argument 接收 boolean (true/false) 而非中文标签
function isEnabled(key) {
  const v = $argument[key];
  return v === true || v === 'true';
}

function safeParse(body) {
  try {
    return JSON.parse(body);
  } catch (e) {
    return null;
  }
}

function main() {
  const url = $request.url;
  const body = safeParse($response.body);
  if (!body) { $done({}); return; }

  // ------------------------------------------------------------
  // 1. 开屏广告: GET /all-config -> data.advanced_strategy
  // ------------------------------------------------------------
  if (url.includes('/all-config') && isEnabled('removeSplashAd')) {
    if (body.data?.advanced_strategy) {
      body.data.advanced_strategy = {
        ...body.data.advanced_strategy,
        switch: 0,
        pic: '',
        text: '',
      };
    }
  }

  // ------------------------------------------------------------
  // 2. 首页运营位 Banner: GET /get-index-topic-config
  //    响应: { data: [{...}, ...] } - 数组直接在 data 里
  //    广告特征: banner 非空、jump 非空、topic_type === 2 (运营活动)、is_hot === 1
  //    保留: 纯分类导航 (topic_type !== 2、无 jump)
  // ------------------------------------------------------------
  if (url.includes('/get-index-topic-config') && isEnabled('removeIndexBanner')) {
    if (Array.isArray(body.data)) {
      body.data = body.data.filter(item => {
        // 保留正常分类入口，过滤运营活动/广告位
        const isAd = item.banner || item.jump || item.topic_type === 2 || item.is_hot === 1;
        return !isAd;
      });
    }
  }

  // ------------------------------------------------------------
  // 3. 显式广告列表: /dtk-ad-banner-list, /dtk-ad-list, /dtk-search-ad-list
  //    响应: { code: 1, data: { list: [...], banner: [...] } }
  // ------------------------------------------------------------
  if (isEnabled('removeAdList') &&
      (url.includes('/dtk-ad-banner-list') ||
       url.includes('/dtk-ad-list') ||
       url.includes('/dtk-search-ad-list'))) {
    if (body.data) {
      if (Array.isArray(body.data.list)) body.data.list = [];
      if (Array.isArray(body.data.banner)) body.data.banner = [];
      if (Array.isArray(body.data.ads)) body.data.ads = [];
    }
  }

  // ------------------------------------------------------------
  // 4. 新用户红包引导: /new-user-excitation-guide/red-packet-info
  // ------------------------------------------------------------
  if (url.includes('/new-user-excitation-guide/red-packet-info') && isEnabled('removeNewUserGuide')) {
    body.data = null;
    body.code = 0;
    body.msg = 'blocked';
  }

  // ------------------------------------------------------------
  // 5. 工具配置: /get-tool-config (可选)
  // ------------------------------------------------------------
  if (url.includes('/get-tool-config') && isEnabled('removeAdList')) {
    if (body.data?.list && Array.isArray(body.data.list)) {
      body.data.list = body.data.list.filter(item => {
        const name = (item.name || '').toLowerCase();
        const title = (item.title || '').toLowerCase();
        return !name.includes('ad') && !title.includes('广告') && !title.includes('推广');
      });
    }
  }

  // ------------------------------------------------------------
  // 6. 用户模板: /user-tpl (可选)
  // ------------------------------------------------------------
  if (url.includes('/user-tpl') && isEnabled('removeAdList')) {
    if (body.data?.tpl_list && Array.isArray(body.data.tpl_list)) {
      body.data.tpl_list = body.data.tpl_list.filter(tpl => {
        const name = (tpl.name || '').toLowerCase();
        return !name.includes('ad') && !name.includes('广告');
      });
    }
  }

  $done({ body: JSON.stringify(body) });
}

main();