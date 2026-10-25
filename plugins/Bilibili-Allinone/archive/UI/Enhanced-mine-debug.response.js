// Biliverse Enhanced - Mine iPad Customization (Debug版)
// 会在 Loon 日志里打印 [Enhanced-Mine] 前缀日志

(() => {
  const isLoon = typeof $loon !== 'undefined';
  const isQX = typeof $task !== 'undefined';
  const isSurge = typeof $environment?.['surge-version'] !== 'undefined';
  const isStash = typeof $environment?.['stash-version'] !== 'undefined';
  const isShadowrocket = typeof $rocket !== 'undefined';
  const isEgern = typeof Egern !== 'undefined';
  const isNode = typeof process?.versions?.node !== 'undefined';
  const isWorker = typeof Cloudflare !== 'undefined';

  const LogLevel = { OFF: 0, ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4, ALL: 5 };
  let logLevel = LogLevel.DEBUG; // 强制 DEBUG
  if (globalThis.$argument?.LogLevel) logLevel = LogLevel[globalThis.$argument.LogLevel] ?? LogLevel.DEBUG;

  const log = (...args) => { if (logLevel >= LogLevel.INFO) console.log('[Enhanced-Mine]', ...args); };
  const warn = (...args) => { if (logLevel >= LogLevel.WARN) console.warn('[Enhanced-Mine]', ...args); };
  const error = (...args) => { if (logLevel >= LogLevel.ERROR) console.error('[Enhanced-Mine]', ...args); };

  const handleResponse = () => {
    const url = $request.url;
    const ua = ($request.headers && ($request.headers['User-Agent'] || $request.headers['user-agent'])) || '';

    log('=== Request intercepted ===', { url: url.substring(0, 80), ua: ua.substring(0, 60) });

    if (!url.includes('x/v2/account/mine/ipad') || !/bili-hd2/.test(ua)) {
      log('Skip: not mine/ipad or not bili-hd2');
      $done({});
      return;
    }

    const arg = globalThis.$argument || {};
    log('Arguments received:', JSON.stringify(arg));

    if (!arg.MineEnable) {
      log('MineEnable is false/undefined, skipping');
      $done({});
      return;
    }

    try {
      let body = JSON.parse($response.body);
      if (!body || !body.data) {
        log('Invalid response body');
        $done({});
        return;
      }

      const data = body.data;

      // Parse config from arguments
      const hideIds = new Set((arg.MineHideIds || '').split(',').filter(Boolean).map(Number));
      const hideTitles = new Set((arg.MineHideTitles || '').split(',').filter(Boolean));
      const order = (arg.MineOrder || '').split(',').filter(Boolean).map(Number);
      const blockUpper = !!arg.MineBlockUpper;
      const blockRecommend = !!arg.MineBlockRecommend;
      const blockMore = !!arg.MineBlockMore;
      const sectionStyle = arg.MineSectionStyle;

      log('Parsed config:', { hideIds: Array.from(hideIds), hideTitles: Array.from(hideTitles), order, blockUpper, blockRecommend, blockMore, sectionStyle });

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
        log(`Processed ${f.key}: ${arr.length} items`);
      }

      if (sectionStyle !== undefined && data.ipad_section_style !== undefined) {
        data.ipad_section_style = Number(sectionStyle);
        log('Set ipad_section_style:', sectionStyle);
      }

      $done({ body: JSON.stringify(body) });
    } catch (e) {
      error('Error:', e);
      $done({});
    }
  };

  handleResponse();
})();