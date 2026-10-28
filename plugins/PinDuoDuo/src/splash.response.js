/*
 * splash.response.js —— 开屏广告预防性屏蔽（自研脚本）
 *
 * 背景（2026-10-28 沙盒取证）：
 *   开屏是「预下载素材 + 本地调度」模式，不是纯网络下发：
 *     · Documents/splashes/                     6 张 1206×2277 PNG 素材
 *     · Documents/mmkv/PDD_BIZ_SPLASH_MMKV_KEY  PDD_SPLASH_LIST 调度表
 *         resource_url / start_time / end_time / show_duration /
 *         show_rule / forward_type / process_type
 *
 *   所以只拦网络请求【无法】清掉已经下载好的素材 —— 那些会按
 *   end_time 在本地直接展示，与网络无关。
 *
 *   但预防性地把下发接口置空仍然有价值：
 *     ① 阻止新素材/新调度表写入（缓存过期后不再续命）
 *     ② 服务端若某天恢复下发，插件能立刻兜住
 *
 * 实测正常响应：{"splash_list":[],"size":0}  (27B)
 * 本脚本直接返回同一结构，与「服务端无开屏」时的响应完全一致，
 * App 侧行为无差异，不会触发任何异常分支。
 */

try {
  $done({ body: '{"splash_list":[],"size":0}' });
} catch (e) {
  $done({});
}
