// V3 测试：我的页字段消费验证
// 目的：确认 x/v2/account/mine/ipad 的哪些字段真的驱动「我的」页渲染
// 测试动作：同时删除四个区块的特定项，观察哪些区块有变化

if ($request.url.includes('x/v2/account/mine/ipad')) {
  try {
    let body = JSON.parse($response.body);
    if (!body || !body.data) { $done({}); return; }

    let log = [];

    // 1. 投稿区：删 id=751（投稿）
    if (body.data.ipad_upper_sections) {
      let before = body.data.ipad_upper_sections.length;
      body.data.ipad_upper_sections = body.data.ipad_upper_sections.filter(it => it.id !== 751);
      log.push(`upper: ${before} -> ${body.data.ipad_upper_sections.length}`);
    }

    // 2. 推荐区：删 id=755（我的关注）
    if (body.data.ipad_recommend_sections) {
      let before = body.data.ipad_recommend_sections.length;
      body.data.ipad_recommend_sections = body.data.ipad_recommend_sections.filter(it => it.id !== 755);
      log.push(`recommend: ${before} -> ${body.data.ipad_recommend_sections.length}`);
    }

    // 3. 更多区：删 id=763（我的客服）
    if (body.data.ipad_more_sections) {
      let before = body.data.ipad_more_sections.length;
      body.data.ipad_more_sections = body.data.ipad_more_sections.filter(it => it.id !== 763);
      log.push(`more: ${before} -> ${body.data.ipad_more_sections.length}`);
    }

    // 4. 服务项网格：删 id=747（离线缓存）— 预期无效（死字段）
    if (body.data.ipad_sections) {
      let before = body.data.ipad_sections.length;
      body.data.ipad_sections = body.data.ipad_sections.filter(it => it.id !== 747);
      log.push(`sections: ${before} -> ${body.data.ipad_sections.length}`);
    }

    console.log('[V3测试] ' + log.join(' | '));
    $done({body: JSON.stringify(body)});
  } catch(e) {
    console.log('[V3测试] 错误: ' + e);
    $done({});
  }
}
$done({});
