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

  // Parse $argument (Loon passes arguments as array in order of lpx argument list)
  // lpx order: MineEnable, MineHideIds, MineHideTitles, MineOrder, MineBlockUpper, MineBlockRecommend, MineBlockMore, MineSectionStyle, LogLevel
  const rawArgs = globalThis.$argument || [];
  const args = Array.isArray(rawArgs) ? rawArgs : [rawArgs];

  const arg = {
    MineEnable: args[0],
    MineHideIds: args[1],
    MineHideTitles: args[2],
    MineOrder: args[3],
    MineBlockUpper: args[4],
    MineBlockRecommend: args[5],
    MineBlockMore: args[6],
    MineSectionStyle: args[7],
    LogLevel: args[8]
  };

  if (args[8] && LogLevel[args[8]]) logLevel = LogLevel[args[8]];
  if (arg.LogLevel && LogLevel[arg.LogLevel]) logLevel = LogLevel[arg.LogLevel];

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

    // Check if mine customization is enabled
    if (!args[0]) { // MineEnable
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
      const hideIds = new Set((args[1] || '').split(',').filter(Boolean).map(Number));
      const hideTitles = new Set((args[2] || '').split(',').filter(Boolean));
      const order = (args[3] || '').split(',').filter(Boolean).map(Number);
      const blockUpper = !!args[4];
      const blockRecommend = !!args[5];
      const blockMore = !!args[6];
      const sectionStyle = args[7];

      // Fields to process (each with optional block flag)
      const fields = [
        { key: 'ipad_upper_sections', block: !!args[4] },
        { key: 'ipad_recommend_sections', block: !!args[5] },
        { key: 'ipad_more_sections', block: !!args[6] }
      ];

      for (const f of fields) {
        if (f.block) {
          if (data[f.key]) {
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
          for (const item of arr) {
            if (!ordered.includes(item)) ordered.push(item);
          }
          arr = ordered;
        }

        data[f.key] = arr;
      }

      // Optional: section style
      if (args[7] !== undefined && data.ipad_section_style !== undefined) {
        data.ipad_section_style = Number(args[7]);
      }

      $done({ body: JSON.stringify(body) });
    } catch (e) {
      $done({});
    }
  };

  // Run handler
  handleResponse();
})();