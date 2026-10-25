/*
 * 搜索页下拉过滤：去掉「热搜榜」(trending) 与「搜索发现」(recommend)，保留「搜索历史」(history)。
 *
 * 为什么不用 BiliUniverse bundle：
 *   1. bundle 842KB 冷启动约 18ms，本插件另有多条规则也用它；
 *   2. 实测同一端点挂两条 [Script] 时只有先声明的那条生效，后一条不执行；
 *   3. 搜索页这段逻辑极简，无需引入整个 bundle。
 * 故搜索页下拉由本脚本独立处理，bundle 那边缩到只管 splash。
 * 强制生效，不可开关。
 */
if ($response.body) {
  try {
    const d = JSON.parse($response.body);
    if (Array.isArray(d.data)) {
      d.data = d.data.filter(function (e) { return e.type === "history"; });
    }
    $done({ body: JSON.stringify(d) });
  } catch (e) {
    $done({});
  }
}
