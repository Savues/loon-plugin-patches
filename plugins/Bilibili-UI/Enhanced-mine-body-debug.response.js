// Biliverse Enhanced - Mine iPad Customization (Body Debug Version)
// Injects debug info directly into response body for HAR inspection

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

  // Logger (write to response body instead of console)
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

    const rawArgs = globalThis.$argument || [];
    const args = Array.isArray(rawArgs) ? rawArgs : [rawArgs];

    log('=== Request intercepted ===', { url: url.substring(0, 80), ua: ua.substring(0, 60) });
    log('Arguments received:', JSON.stringify(rawArgs));

    if (!rawArgs[0]) { // MineEnable
      log('MineEnable is false/undefined, skipping');
      // Still inject debug into response
      try {
        let body = JSON.parse($response.body);
        if (body && body.data) {
          body._debug = { 
            script: 'Enhanced-Mine',
            skipped: true, 
            reason: 'MineEnable=false',
            argsReceived: rawArgs
          };
          $done({ body: JSON.stringify(body) });
        } else {
          $done({});
        }
      } catch (e) {
        $done({});
      }
      return;
    }

    try {
      let body = JSON.parse($response.body);
      if (!body || !body.data) {
        $done({});
        return;
      }

      const data = body.data;

      // Parse config from arguments (array order: MineEnable, MineHideIds, MineHideTitles, MineOrder, MineBlockUpper, MineBlockRecommend, MineBlockMore, MineSectionStyle, LogLevel)
      const hideIds = new Set((rawArgs[1] || '').split(',').filter(Boolean).map(Number));
      const hideTitles = new Set((rawArgs[2] || '').split(',').filter(Boolean));
      const order = (rawArgs[3] || '').split(',').filter(Boolean).map(Number);
      const blockUpper = !!rawArgs[4];
      const blockRecommend = !!rawArgs[5];
      const blockMore = !!rawArgs[6];
      const sectionStyle = rawArgs[7];

      const debugInfo = {
        script: 'Enhanced-Mine',
        scriptExecuted: true,
        argsReceived: rawArgs,
        parsedConfig: {
          hideIds: Array.from(new Set((rawArgs[1] || '').split(',').filter(Boolean).map(Number))),
          hideTitles: Array.from(new Set((rawArgs[2] || '').split(',').filter(Boolean))),
          order: (rawArgs[3] || '').split(',').filter(Boolean).map(Number),
          blockUpper: !!rawArgs[4],
          blockRecommend: !!rawArgs[5],
          blockMore: !!rawArgs[6],
          sectionStyle: rawArgs[7]
        },
        beforeFilter: {}
      };

      // Fields to process
      const fields = [
        { key: 'ipad_upper_sections', block: !!rawArgs[4] },
        { key: 'ipad_recommend_sections', block: !!rawArgs[5] },
        { key: 'ipad_more_sections', block: !!rawArgs[6] }
      ];

      const hideIds = new Set((rawArgs[1] || '').split(',').filter(Boolean).map(Number));
      const hideTitles = new Set((rawArgs[2] || '').split(',').filter(Boolean));
      const order = (rawArgs[3] || '').split(',').filter(Boolean).map(Number);
      const blockUpper = !!rawArgs[4];
      const blockRecommend = !!rawArgs[5];
      const blockMore = !!rawArgs[6];
      const sectionStyle = rawArgs[7];

      for (const f of [{ key: 'ipad_upper_sections', block: !!rawArgs[4] }, { key: 'ipad_recommend_sections', block: !!rawArgs[5] }, { key: 'ipad_more_sections', block: !!rawArgs[6] }]) {
        if (f.block) {
          if (data[f.key]) {
            // Record before state
            debugInfo.beforeFilter[f.key] = data[f.key].map(it => ({ id: it.id, title: it.title }));
            data[f.key] = [];
          }
          continue;
        }

        if (!data[f.key]) continue;
        let arr = data[f.key];
        if (!Array.isArray(arr)) continue;

        // Record before state
        debugInfo.beforeFilter[f.key] = arr.map(it => ({ id: it.id, title: it.title }));

        // Filter by hideIds and hideTitles
        arr = arr.filter(it => {
          if (it.id && new Set((rawArgs[1] || '').split(',').filter(Boolean).map(Number)).has(it.id)) return false;
          if (it.title && new Set((rawArgs[2] || '').split(',').filter(Boolean)).has(it.title)) return false;
          return true;
        });

        // Reorder if order specified
        if ((rawArgs[3] || '').split(',').filter(Boolean).map(Number).length > 0) {
          const map = new Map(arr.map(it => [it.id, it]));
          const ordered = [];
          for (const id of (rawArgs[3] || '').split(',').filter(Boolean).map(Number)) {
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

      if (rawArgs[7] !== undefined && data.ipad_section_style !== undefined) {
        data.ipad_section_style = Number(rawArgs[7]);
      }

      // Inject debug info into response
      body._debug = {
        script: 'Enhanced-Mine',
        scriptExecuted: true,
        argsReceived: globalThis.$argument,
        parsedConfig: {
          hideIds: Array.from(new Set((globalThis.$argument?.[1] || '').split(',').filter(Boolean).map(Number))),
          hideTitles: Array.from(new Set((globalThis.$argument?.[2] || '').split(',').filter(Boolean))),
          order: (globalThis.$argument?.[3] || '').split(',').filter(Boolean).map(Number),
          blockUpper: !!globalThis.$argument?.[4],
          blockRecommend: !!globalThis.$argument?.[5],
          blockMore: !!globalThis.$argument?.[6],
          sectionStyle: globalThis.$argument?.[7]
        },
        beforeFilter: {},
        afterFilter: {}
      };

      // Capture after states
      ['ipad_upper_sections', 'ipad_recommend_sections', 'ipad_more_sections'].forEach(key => {
        if (data[key]) {
          debugInfo.afterFilter[key] = data[key].map(it => ({ id: it.id, title: it.title }));
        }
      });

      // Write debug to body
      body._debug = debugInfo;

      $done({ body: JSON.stringify(body) });
    } catch (e) {
      // On error, still inject error debug
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