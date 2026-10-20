// Biliverse Enhanced - Mine iPad Customization
// Handles x/v2/account/mine/ipad for customizing "我的" page on iPad HD
// Author: Savues (based on Biliverse Enhanced by VirgilClyne, app2smile, Maasea)

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
  if (globalThis.$argument?.LogLevel) {
    logLevel = LogLevel[globalThis.$argument.LogLevel] ?? LogLevel.WARN;
  }
  const log = (...args) => {
    if (logLevel >= LogLevel.INFO) console.log('[Enhanced-Mine]', ...args);
  };
  const warn = (...args) => {
    if (logLevel >= LogLevel.WARN) console.warn('[Enhanced-Mine]', ...args);
  };
  const error = (...args) => {
    if (logLevel >= LogLevel.ERROR) console.error('[Enhanced-Mine]', ...args);
  };

  // PersistentStore wrapper (Loon/Shadowrocket/Stash/Egern)
  const $store = {
    read(key) {
      try {
        if (isLoon || isShadowrocket || isStash || isEgern) {
          return $persistentStore.read(key);
        }
        if (isQX) return $prefs.valueForKey(key);
        if (isSurge) return $persistentStore.read(key);
      } catch (e) {}
      return null;
    },
    write(key, value) {
      try {
        const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
        if (isLoon || isShadowrocket || isStash || isEgern) {
          return $persistentStore.write(str, key);
        }
        if (isQX) return $prefs.setValueForKey(str, key);
        if (isSurge) return $persistentStore.write(str, key);
      } catch (e) {
        error('Store write failed:', e);
      }
      return false;
    }
  };

  // Main handler
  const handleResponse = () => {
    const url = $request.url;
    const ua = ($request.headers && ($request.headers['User-Agent'] || $request.headers['user-agent'])) || '';

    // Only handle iPad HD (bili-hd2) mine/ipad requests
    if (!url.includes('x/v2/account/mine/ipad') || !/bili-hd2/.test(ua)) {
      $done({});
      return;
    }

    // Check if mine customization is enabled
    const arg = globalThis.$argument || {};
    if (!arg.MineEnable) {
      log('Mine customization disabled');
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

      // Parse config from arguments
      // Arguments order: MineEnable, MineHideIds, MineHideTitles, MineOrder, MineBlockUpper, MineBlockRecommend, MineBlockMore, MineSectionStyle
      const hideIds = new Set((arg.MineHideIds || '').split(',').filter(Boolean).map(Number));
      const hideTitles = new Set((arg.MineHideTitles || '').split(',').filter(Boolean));
      const order = (arg.MineOrder || '').split(',').filter(Boolean).map(Number);
      const blockUpper = !!arg.MineBlockUpper;
      const blockRecommend = !!arg.MineBlockRecommend;
      const blockMore = !!arg.MineBlockMore;
      const sectionStyle = arg.MineSectionStyle;

      log('Processing mine/ipad', {
        hideIds: Array.from(hideIds),
        hideTitles: Array.from(hideTitles),
        order,
        blockUpper,
        blockRecommend,
        blockMore,
        sectionStyle
      });

      // Fields to process (each with optional block flag)
      const fields = [
        { key: 'ipad_upper_sections', block: blockUpper },
        { key: 'ipad_recommend_sections', block: blockRecommend },
        { key: 'ipad_more_sections', block: blockMore }
      ];

      for (const f of fields) {
        if (f.block) {
          if (data[f.key]) {
            log(`Blocking ${f.key}`);
            data[f.key] = [];
          }
          continue;
        }

        if (!data[f.key]) continue;
        let arr = data[f.key];
        if (!Array.isArray(arr)) continue;

        // Filter by hideIds and hideTitles
        arr = arr.filter(it => {
          if (it.id && hideIds.has(it.id)) return false;
          if (it.title && hideTitles.has(it.title)) return false;
          return true;
        });

        // Reorder if order specified
        if (order.length > 0) {
          const map = new Map(arr.map(it => [it.id, it]));
          const ordered = [];
          for (const id of order) {
            const item = map.get(id);
            if (item) ordered.push(item);
          }
          // Append remaining items not in order
          for (const item of arr) {
            if (!ordered.includes(item)) ordered.push(item);
          }
          arr = ordered;
        }

        data[f.key] = arr;
        log(`Processed ${f.key}: ${arr.length} items`);
      }

      // Optional: section style
      if (sectionStyle !== undefined && data.ipad_section_style !== undefined) {
        data.ipad_section_style = Number(sectionStyle);
        log('Set ipad_section_style:', sectionStyle);
      }

      $done({ body: JSON.stringify(body) });
    } catch (e) {
      error('Mine customization error:', e);
      $done({});
    }
  };

  // Run handler
  handleResponse();
})();