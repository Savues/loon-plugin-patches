// V3.5 测试：我的页字段消费验证 - 可配置隐藏 ID
// 目的：确认 x/v2/account/mine/ipad 的哪些字段驱动「我的」页渲染
// 功能：可配置隐藏 ID（逗号分隔），默认仅保留 历史记录(748)/收藏(749)/设置(764)

if ($request.url.includes('x/v2/account/mine/ipad')) {
  try {
    // 参数：MineHideIds 通过 argument 传递，可能是数组或对象
    // 默认隐藏除 748/749/764 外的所有 ID
    let hideIdsStr = '752,753,754,756,757,758,759,2541,760,965,750';
    if (Array.isArray($argument) && $argument.length > 0) {
      if (typeof $argument[0] === 'string') {
        hideIdsStr = $argument[0];
      } else if ($argument[0] && typeof $argument[0] === 'object' && $argument[0].MineHideIds) {
        hideIdsStr = $argument[0].MineHideIds;
      }
    } else if ($argument && typeof $argument === 'object' && $argument.MineHideIds) {
      hideIdsStr = $argument.MineHideIds;
    }
    const hideIds = new Set(hideIdsStr.split(',').filter(Boolean).map(Number));

    let body = JSON.parse($response.body);
    if (!body || !body.data) { $done({}); return; }

    const data = body.data;

    // 1. 投稿区：按配置隐藏
    if (body.data.ipad_upper_sections) {
      let before = body.data.ipad_upper_sections.length;
      body.data.ipad_upper_sections = body.data.ipad_upper_sections.filter(it => !hideIds.has(it.id));
    }

    // 2. 推荐区：按配置隐藏
    if (body.data.ipad_recommend_sections) {
      let before = body.data.ipad_recommend_sections.length;
      body.data.ipad_recommend_sections = body.data.ipad_recommend_sections.filter(it => !hideIds.has(it.id));
    }

    // 3. 更多区：按配置隐藏
    if (body.data.ipad_more_sections) {
      let before = body.data.ipad_more_sections.length;
      body.data.ipad_more_sections = body.data.ipad_more_sections.filter(it => !hideIds.has(it.id));
    }

    // 4. 服务项网格：按配置隐藏（死字段）
    if (body.data.ipad_sections) {
      let before = body.data.ipad_sections.length;
      body.data.ipad_sections = body.data.ipad_sections.filter(it => !hideIds.has(it.id));
    }

    $done({body: JSON.stringify(body)});
  } catch(e) {
    $done({});
  }
}
$done({});