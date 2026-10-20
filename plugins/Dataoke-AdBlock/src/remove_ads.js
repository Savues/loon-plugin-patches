// Dataoke-AdBlock 主脚本
// 大淘客联盟/易店长 v4.0.42 去广告规则
// 作者: Savues
// 版本: 1.4.0
// 更新: 2026-10-20

// Loon $argument 接收 boolean (true/false) - 来自 {${removeSplashAd}} 等展开
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
  // 2. 首页运营位: GET /app-index-topic
  //    响应: { data: { last: [...], middle: [...], top: [...] } }
  //    广告特征: banner 非空、jump 非空、goods_pic 非空
  //    处理分三类（三个独立开关）：
  //      - 顶部Banner: banner 非空 -> removeTopBanner
  //      - 其他运营位: jump/goods_pic 非空 -> removeIndexBanner
  //      - (app-index-topic 无 splash 类型)
  // ------------------------------------------------------------
  if (url.includes('/app-index-topic')) {
    if (body.data) {
      ['last', 'middle', 'top'].forEach(key => {
        if (Array.isArray(body.data[key])) {
          body.data[key] = body.data[key].filter(item => {
            const hasBanner = item.banner && item.banner !== '';
            const hasJumpOrPic = item.jump || item.goods_pic;
            
            // 顶部Banner：由 removeTopBanner 控制
            if (hasBanner && isEnabled('removeTopBanner')) {
              return false;
            }
            // 其他运营位：由 removeIndexBanner 控制
            if (hasJumpOrPic && isEnabled('removeIndexBanner')) {
              return false;
            }
            return true;
          });
        }
      });
    }
  }

  // ------------------------------------------------------------
  // 3. 首页运营位(备用): GET /get-index-topic-config
  //    响应: { data: [{...}, ...] } - 数组直接在 data 里
  //    三类广告，三个独立开关：
  //      1. 开屏类: topic_type === 4 -> removeSplashAd
  //      2. 顶部Banner: banner 字段非空 -> removeTopBanner
  //      3. 其他运营位: topic_type === 2、jump 非空、is_hot === 1 -> removeIndexBanner
  // ------------------------------------------------------------
  if (url.includes('/get-index-topic-config')) {
    if (Array.isArray(body.data)) {
      body.data = body.data.filter(item => {
        const isSplash = item.topic_type === 4;
        const isTopBanner = item.banner && item.banner !== '';
        const isRegularAd = item.topic_type === 2 || item.jump || item.is_hot === 1;
        
        // 开屏类：由 removeSplashAd 控制
        if (isSplash && isEnabled('removeSplashAd')) {
          return false;
        }
        // 顶部Banner：由 removeTopBanner 控制
        if (isTopBanner && isEnabled('removeTopBanner')) {
          return false;
        }
        // 其他运营位：由 removeIndexBanner 控制
        if (isRegularAd && isEnabled('removeIndexBanner')) {
          return false;
        }
        return true;
      });
    }
  }

  // ------------------------------------------------------------
  // 3.5 市场分类页: GET /get-all-market
  //    响应: { data: [{ fc_single_label_img, ... }, ...] }
  //    处理: 清空运营位图片字段 fc_single_label_img 等
  // ------------------------------------------------------------
  if (url.includes('/get-all-market') && isEnabled('removeIndexBanner')) {
    if (body.data && Array.isArray(body.data)) {
      body.data = body.data.map(item => ({
        ...item,
        fc_single_label_img: '',
        fc_single_label_img2: '',
        fc_single_label_img_wap: '',
        fc_screen_label_img_app: null,
        fc_screen_label_img_app_after: null,
        fc_screen_label_img_app_before: null,
        fc_detail_label_content: '',
        fc_detail_label_content_wap: '',
      }));
    }
  }

  // ------------------------------------------------------------
  // 4. 搜索/推荐流: GET /search-v2 (含网关代理 /go_getway/proxy/search-v2)
  //    两种响应结构：
  //    - dtk_go_app_api/v1/search-v2: { data: { list: [...] } }
  //    - go_getway/proxy/search-v2: { data: { search: { list: [...] } } }
  //    广告特征: is_pure_push === "1"、is_pure_push === 1、特定 tags 标识
  //    策略: 保留正常商品，过滤纯推广/广告标识商品
  //    修正: 仅当 is_pure_push=1 且缺少正常商品核心字段时才过滤，防止误伤普通商品
  // ------------------------------------------------------------
  if (url.includes('/search-v2') && isEnabled('removeAdList')) {
    // 支持两种响应结构
    const listRef = body.data?.search?.list ?? body.data?.list;
    if (Array.isArray(listRef)) {
      const filtered = listRef.filter(item => {
        // 仅当 is_pure_push=1 且看起来不像正常商品时才过滤
        // 正常商品特征: 有 goodsid/title/price/commission_rate 等核心字段
        const isPurePush = item.is_pure_push === "1" || item.is_pure_push === 1;
        const hasCoreFields = item.goodsid || item.id || item.title || item.price || item.commission_rate;
        
        if (isPurePush && !hasCoreFields) {
          // 纯推广且无核心商品字段 -> 广告
          return false;
        }
        // 过滤特定广告标签 (tags 数组中的 name 字段)
        if (item.tags && Array.isArray(item.tags)) {
          const hasAdTag = item.tags.some(t => 
            t.name && (t.name.includes('广告') || t.name.includes('推广') || t.name.includes('纯推'))
          );
          if (hasAdTag) return false;
        }
        return true;
      });
      // 写回对应结构
      if (body.data?.search?.list) {
        body.data.search.list = filtered;
      } else if (body.data?.list) {
        body.data.list = filtered;
      }
    }
  }

  // ------------------------------------------------------------
  // 5. 显式广告列表: /dtk-ad-banner-list, /dtk-ad-list, /dtk-search-ad-list
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
  // 6. 新用户红包引导: /new-user-excitation-guide/red-packet-info
  // ------------------------------------------------------------
  if (url.includes('/new-user-excitation-guide/red-packet-info') && isEnabled('removeNewUserGuide')) {
    body.data = null;
    body.code = 0;
    body.msg = 'blocked';
  }

  // ------------------------------------------------------------
  // 7. 工具配置: /get-tool-config
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
  // 8. 用户模板: /user-tpl
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