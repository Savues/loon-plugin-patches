// V3.4 测试：我的页字段消费验证 - 可配置隐藏 ID
// 目的：确认 x/v2/account/mine/ipad 的哪些字段驱动「我的」页渲染
// 功能：可配置隐藏 ID（逗号分隔），默认移除 751/755/763/747

if ($request.url.includes('x/v2/account/mine/ipad')) {
  try {
    let body = JSON.parse($response.body);
    if (!body || !body.data) { $done({}); return; }

    // 参数：MineHideIds 通过 argument 传递，可能是数组或对象
    const rawArgs = $argument || [];
    // 支持两种格式：数组 ['751,755...'] 或对象 {MineHideIds: '751,755...'}
    let hideIdsStr = '751,755,763,747';
    if (Array.isArray(rawArgs) && rawArgs.length > 0) {
      if (typeof rawArgs[0] === 'string') {
        hideIdsStr = rawArgs[0];
      } else if (rawArgs[0] && typeof rawArgs[0] === 'object' && rawArgs[0].MineHideIds) {
        hideIdsStr = rawArgs[0].MineHideIds;
      }
    } else if (rawArgs && typeof rawArgs === 'object' && rawArgs.MineHideIds) {
      hideIdsStr = rawArgs.MineHideIds;
    }
    const hideIds = new Set(hideIdsStr.split(',').filter(Boolean).map(Number));

    let body = JSON.parse($response.body);
    if (!body || !body.data) { $done({}); return; }

    const data = body.data;
    let log = [];

    // 1. 投稿区：按配置隐藏
    if (body.data.ipad_upper_sections) {
      let before = body.data.ipad_upper_sections.length;
      body.data.ipad_upper_sections = body.data.ipad_upper_sections.filter(it => !hideIds.has(it.id));
      log.push(`upper: ${before} -> ${body.data.ipad_upper_sections.length}`);
    }

    // 2. 推荐区：按配置隐藏
    if (body.data.ipad_recommend_sections) {
      let before = body.data.ipad_recommend_sections.length;
      body.data.ipad_recommend_sections = body.data.ipad_recommend_sections.filter(it => !hideIds.has(it.id));
      log.push(`recommend: ${before} -> ${body.data.ipad_recommend_sections.length}`);
    }

    // 3. 更多区：按配置隐藏
    if (body.data.ipad_more_sections) {
      let before = body.data.ipad_more_sections.length;
      body.data.ipad_more_sections = body.data.ipad_more_sections.filter(it => !hideIds.has(it.id));
      log.push(`more: ${before} -> ${body.data.ipad_more_sections.length}`);
    }

    // 4. 服务项网格：按配置隐藏（死字段）
    if (body.data.ipad_sections) {
      let before = body.data.ipad_sections.length;
      body.data.ipad_sections = body.data.ipad_sections.filter(it => !hideIds.has(it.id));
      log.push(`sections: ${before} -> ${body.data.ipad_sections.length}`);
    }

    console.log('[Enhanced-Mine] ' + log.join(' | '));
    $done({body: JSON.stringify(body)});
  } catch(e) {
    console.log('[Enhanced-Mine] 错误: ' + e);
    $done({});
  }
}
$done({});