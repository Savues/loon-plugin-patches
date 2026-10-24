// 小红书 switch_config 清洗: 通知引导弹窗 (push_guide_actions) 置空
// switch_config → data.configs.ios_scene_trigger_config (内嵌 JSON 字符串)
//   → push_guide_actions: 15 个场景触发式"打开推送通知"弹窗 (关注话题/收藏/短剧/订单/降价/优惠券...)
const obj = JSON.parse($response.body);
const configs = obj?.data?.configs;
if (configs && typeof configs === "object") {
  const key = "ios_scene_trigger_config";
  if (typeof configs[key] === "string") {
    try {
      let inner = JSON.parse(configs[key]);
      if (inner && Array.isArray(inner.push_guide_actions) && inner.push_guide_actions.length > 0) {
        inner.push_guide_actions = [];
        configs[key] = JSON.stringify(inner);
        $done({ body: JSON.stringify(obj) });
        return;
      }
    } catch (e) {}
  }
}
$done({});
