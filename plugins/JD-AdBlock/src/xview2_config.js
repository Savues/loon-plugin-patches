// 京东 client.action 空参响应清洗: xview2Config 弹窗/浮层图层注册表
// 516KB 图层配置走【空参URL】(fn在加密body, URL级规则不可见) — 本脚本按响应内容特征识别:
//   结构: {"code":0,"data":{"version","imgCompression","targets":[{"targetName":"JDMa...","layers":[...]}]}}
// 图层 name 关键词过滤 (新人/用增/底通/红包/优惠券/百补兜底等)
(function () {
  if (!$response || !$response.body) { $done({}); return; }
  const url = $request ? $request.url : "";
  if (url.indexOf("/client.action") < 0) { $done({}); return; }

  let obj;
  try { obj = JSON.parse($response.body); } catch (e) { $done({}); return; }

  // xview2Config 内容特征: data.targets + targetName JDMa 前缀
  const targets = obj && obj.data && Array.isArray(obj.data.targets) ? obj.data.targets : null;
  if (!targets || !targets.some(t => String(t && t.targetName || "").indexOf("JDMa") === 0)) { $done({}); return; }

  // 弹窗/浮层/营销图层 name 关键词 (对照实测 322 图层清单)
  const BLOCK_KEYS = [
    "弹窗", "红包", "优惠券", "话费", "新人", "用增", "底通", "底部的通栏", "底部通栏",
    "百补", "兜底", "惊喜福利", "签到", "领券", "开会员", "PLUS", "金融",
    "浮层", "悬浮", "轮播", "角标", "气泡", "腰封", "倒计时",
    "省钱卡", "续费提醒", "引导", "单单返", "CPS", "免单", "试用", "抽奖", "扇子", "权益"
  ];
  let removed = 0;
  for (const t of targets) {
    if (!t || !Array.isArray(t.layers)) continue;
    const before = t.layers.length;
    t.layers = t.layers.filter(layer => {
      const name = String(layer && layer.name || "");
      return !BLOCK_KEYS.some(k => name.indexOf(k) >= 0);
    });
    removed += before - t.layers.length;
  }
  if (removed > 0) {
    console.log("[JD-AdBlock] xview2Config 清洗弹窗图层: " + removed + " 个");
    $done({ body: JSON.stringify(obj) });
  } else {
    $done({});
  }
})();
