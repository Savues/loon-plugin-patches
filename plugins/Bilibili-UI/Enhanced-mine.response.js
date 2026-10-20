// Biliverse Enhanced - Mine iPad Customization (Fixed Removal)
// Handles x/v2/account/mine/ipad for customizing "我的" page on iPad HD
// Author: Savues (based on Biliverse Enhanced by VirgilClyne, app2smile, Maasea)
// Fixed removal of known useless items: 751(投稿), 755(我的关注), 763(我的客服), 747(离线缓存)

(() => {
  // Loon environment detection
  const isLoon = typeof $loon !== 'undefined';
  const isQX = typeof $task !== 'undefined';
  const isSurge = typeof $environment?.['surge-version'] !== 'undefined';
  const isStash = typeof $environment?.['stash-version'] !== 'undefined';
  const isShadowrocket = typeof $rocket !== 'undefined';
  const isEgern = typeof Egern !== 'undefined';
  const isNode = typeof process?.versions?.node !== 'undefined';
  const isWorker = typeof Cloudflare !== 'undefined';

  // Logger
  const LogLevel = {
    OFF: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4,
    ALL: 5
  };
  let logLevel = LogLevel.WARN;

  // Logger
  const log = (...args) => { if (logLevel >= 3) console.log('[Enhanced-Mine]', ...args); };
  const warn = (...args) => { if (logLevel >= 2) console.warn('[Enhanced-Mine]', ...args); };
  const error = (...args) => { if (logLevel >= 1) console.error('[Enhanced-Mine]', ...args); };

  // Main handler
  const handleResponse = () => {
    const url = $request.url;
    const ua = ($request.headers && ($request.headers['User-Agent'] || $request.headers['user-agent'])) || '';

    // Only handle iPad HD (bili-hd2) mine/ipad requests
    if (!url.includes('x/v2/account/mine/ipad') || !/bili-hd2/.test(ua)) {
      $done({});
      return;
    }

    try {
      let body = JSON.parse($response.body);
      if (!body || !body.data) {
        $done({});
        return;
      }

      const data = body.data;

      // Fixed removal of known useless items
      // 751=投稿, 755=我的关注, 763=我的客服, 747=离线缓存
      const HIDE_IDS = new Set([751, 755, 763, 747]);

      const fields = [
        'ipad_upper_sections',    // 投稿区
        'ipad_recommend_sections', // 推荐区
        'ipad_more_sections',      // 更多区
        'ipad_sections'            // 服务项网格（死字段，但也清理一下）
      ];

      for (const key of ['ipad_upper_sections', 'ipad_recommend_sections', 'ipad_more_sections', 'ipad_sections']) {
        if (!data[key] || !Array.isArray(data[key])) continue;
        
        const beforeLen = data[key].length;
        data[key] = data[key].filter(it => !HIDE_IDS.has(it.id));
        const afterLen = data[key].length;
        if (beforeLen !== afterLen) {
          console.log(`[Enhanced-Mine] ${key}: ${beforeLen} -> ${afterLen}`);
        }
      }

      $done({ body: JSON.stringify(body) });
    } catch (e) {
      $done({});
    }
  };

  // Run handler
  handleResponse();
})();