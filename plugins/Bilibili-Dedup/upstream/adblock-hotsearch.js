/*
 * 搜索页下拉后处理：去除「搜索发现 / 推荐」（type: "recommend"）
 *
 * BiliUniverse bundle 只过滤 type=="trending"（热搜榜），不处理 recommend。
 * bundle 是逐字节镜像不改，故此处作为后处理补齐：
 * 规则声明在本脚本之前，Loon 按顺序执行，bundle 先跑、本脚本再收尾。
 * 与 bundle 一样强制生效、不可开关。
 */
if ($response.body) {
  try {
    const d = JSON.parse($response.body);
    if (Array.isArray(d.data)) {
      d.data = d.data.filter(function (e) { return e.type !== "recommend"; });
    }
    $done({ body: JSON.stringify(d) });
  } catch (e) {
    $done({});
  }
}
