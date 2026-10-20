// Biliverse Enhanced - Mine iPad Customization (Body Debug Version - Hardcoded Config)
// Injects debug info directly into response body for HAR inspection
// Config: HIDE_IDS, HIDE_TITLES, ORDER, BLOCK_UPPER, BLOCK_RECOMMEND, BLOCK_MORE, SECTION_STYLE

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

  // ============ HARDCODED CONFIG (modify here) ============
  const HIDE_IDS = '';           // 如 '751,755,763'
  const HIDE_TITLES = '';        // 如 '投稿,我的关注,我的客服'
  const ORDER = '';              // 如 '751,755,763'
  const BLOCK_UPPER = false;     // 隐藏投稿区
  const BLOCK_RECOMMEND = false; // 隐藏推荐区
  const BLOCK_MORE = false;      // 隐藏更多区
  const SECTION_STYLE = 0;       // 区块样式
  // =========================================================

  // Logger (write to response body)
  let debugLines = [];
  const log = (...args) => { debugLines.push('[Enhanced-Mine] ' + args.join(' ')); };
  const warn = (...args) => { debugLines.push('[Enhanced-Mine-WARN] ' + args.join(' ')); };
  const error = (...args) => { debugLines.push('[Enhanced-Mine-ERROR] ' + args.join(' ')); };

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

      // Parse hardcoded config
      const hideIds = new Set((HIDE_IDS || '').split(',').filter(Boolean).map(Number));
      const hideTitles = new Set((HIDE_TITLES || '').split(',').filter(Boolean));
      const order = (ORDER || '').split(',').filter(Boolean).map(Number);
      const blockUpper = BLOCK_UPPER;
      const blockRecommend = BLOCK_RECOMMEND;
      const blockMore = BLOCK_MORE;
      const sectionStyle = SECTION_STYLE;

      const debugInfo = {
        script: 'Enhanced-Mine',
        scriptExecuted: true,
        config: {
          hideIds: Array.from(hideIds),
          hideTitles: Array.from(hideTitles),
          order,
          blockUpper,
          blockRecommend,
          blockMore,
          sectionStyle
        },
        beforeFilter: {}
      };

      const fields = [
        { key: 'ipad_upper_sections', block: BLOCK_UPPER },
        { key: 'ipad_recommend_sections', block: BLOCK_RECOMMEND },
        { key: 'ipad_more_sections', block: BLOCK_MORE }
      ];

      for (const f of fields) {
        if (f.block) {
          if (data[f.key]) {
            debugInfo.beforeFilter[f.key] = data[f.key].map(it => ({ id: it.id, title: it.title }));
            data[f.key] = [];
          }
          continue;
        }

        if (!data[f.key]) continue;
        let arr = data[f.key];
        if (!Array.isArray(arr)) continue;

        debugInfo.beforeFilter[f.key] = arr.map(it => ({ id: it.id, title: it.title }));

        arr = arr.filter(it => {
          if (it.id && hideIds.has(it.id)) return false;
          if (it.title && hideTitles.has(it.title)) return false;
          return true;
        });

        if (order.length > 0) {
          const map = new Map(arr.map(it => [it.id, it]));
          const ordered = [];
          for (const id of order) {
            const item = map.get(id);
            if (item) ordered.push(item);
          }
          for (const item of arr) {
            if (!ordered.includes(item)) ordered.push(item);
          }
          arr = ordered;
        }

        data[f.key] = arr;
      }

      if (SECTION_STYLE !== undefined && data.ipad_section_style !== undefined) {
        data.ipad_section_style = Number(SECTION_STYLE);
      }

      // Capture after states
      const afterFilter = {};
      ['ipad_upper_sections', 'ipad_recommend_sections', 'ipad_more_sections'].forEach(key => {
        if (data[key]) {
          afterFilter[key] = data[key].map(it => ({ id: it.id, title: it.title }));
        }
      });

      // Inject debug info into response
      body._debug = {
        script: 'Enhanced-Mine',
        scriptExecuted: true,
        config: {
          hideIds: Array.from(hideIds),
          hideTitles: Array.from(hideTitles),
          order,
          blockUpper: BLOCK_UPPER,
          blockRecommend: BLOCK_RECOMMEND,
          blockMore: BLOCK_MORE,
          sectionStyle: SECTION_STYLE
        },
        beforeFilter: debugInfo.beforeFilter,
        afterFilter
      };

      body._debug = debugInfo;

      $done({ body: JSON.stringify(body) });
    } catch (e) {
      try {
        let body = JSON.parse($response.body);
        body._debug = { script: 'Enhanced-Mine', error: String(e), scriptExecuted: true };
        $done({ body: JSON.stringify(body) });
      } catch {
        $done({});
      }
    }
  };

  handleResponse();
})();