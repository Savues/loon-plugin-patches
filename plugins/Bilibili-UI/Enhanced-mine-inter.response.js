// Enhanced-mine-inter.response.js
// 国际版 iPhone (bili-inter) 我的页服务项自定义
// 端点：x/v2/account/mine (不含 /ipad)
// 响应字段：sections_v2 (数组，每项含 title + items[])

if ($request.url.includes('x/v2/account/mine') && !$request.url.includes('mine/ipad')) {
  try {
    // 参数：MineInterHideIds 通过 argument 传递
    let hideIdsStr = '494,500,741,742,1028,3084';
    if (Array.isArray($argument) && $argument.length > 0) {
      if (typeof $argument[0] === 'string') {
        hideIdsStr = $argument[0];
      } else if ($argument[0] && typeof $argument[0] === 'object' && $argument[0].MineInterHideIds) {
        hideIdsStr = $argument[0].MineInterHideIds;
      }
    } else if ($argument && typeof $argument === 'object' && $argument.MineInterHideIds) {
      hideIdsStr = $argument.MineInterHideIds;
    }
    const hideIds = new Set(hideIdsStr.split(',').filter(Boolean).map(Number));

    let body = JSON.parse($response.body);
    if (!body || !body.data || !body.data.sections_v2) { $done({}); return; }

    const data = body.data;

    // sections_v2: [{title, style, items: [{id, title, ...}]}, ...]
    data.sections_v2 = data.sections_v2.map(section => {
      if (!section.items || !Array.isArray(section.items)) return section;
      return {
        ...section,
        items: section.items.filter(it => !hideIds.has(it.id))
      };
    });

    // 如果某 section 的 items 全被隐藏，可选：隐藏整个 section
    // 这里保留空 section 让客户端自己处理标题显示

    $done({body: JSON.stringify(body)});
  } catch(e) {
    $done({});
  }
}
$done({});