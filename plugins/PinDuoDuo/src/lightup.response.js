/*
 * lightup.response.js —— 消费券「浏览N秒点亮」任务缩短倒计时（自研脚本）
 *
 * 端点：POST /api/pinduoduo.com/api/brand-sega/light-up/start_task
 *
 * 背景（2026-10-28 抓包 shared-C45A933A_18 定位）
 *   消费券页面有个「浏览商品10秒，即可点亮1次」的任务，点亮攒够次数换券。
 *   完整流程：
 *     ① POST light-up/start_task
 *        → {result:{code:0, data:{task_id, task_duration:10,
 *                                 title:"浏览商品10秒，即可点亮1次"}}}
 *     ② 前端按 task_duration 倒计时
 *     ③ POST light-up/end_task  {task_id}
 *        → {result:{code:0, data:{status:0, toast:"已成功点亮，明日再来可继续点亮"}}}
 *
 *   实测时间戳：start_task server_time=1793123108，
 *               end_task   server_time=1793123120（隔 12 秒，与 task_duration=10 吻合）
 *   → 倒计时秒数由服务端下发的 task_duration 决定，改它即可缩短前端等待。
 *
 * 做法：把 task_duration 改成 lightup_secs（默认 1 秒）。
 *
 * ⚠️ 未验证的风险
 *   服务端可能校验「距 start_task 的间隔 ≥ task_duration」。若如此，
 *   end_task 会返回错误，本次点亮失败（不影响账号，次日可再来）。
 *   若 1 秒失败，可把 lightup_secs 调成 3 / 5 逐步试，或设 0 关闭本功能。
 *
 * 开关：lightup_secs
 *   0 或空  → 不处理（保持服务端原值）
 *   1~59    → 改成该秒数
 */

const A = (function (raw) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = {}; } }
  if (Array.isArray(v)) {
    const merged = {};
    for (let i = 0; i < v.length; i++) {
      const it = v[i];
      if (it && typeof it === 'object' && !Array.isArray(it)) for (const k in it) merged[k] = it[k];
    }
    v = merged;
  }
  return (v && typeof v === 'object') ? v : {};
})($argument);

// 默认 1 秒；传 0 / 空 / 非法 → 关闭
const SECS = (function () {
  const n = parseInt(A.lightup_secs, 10);
  if (!isFinite(n) || n <= 0) return 0;
  return Math.min(n, 59);
})();

try {
  if (!SECS) { $done({}); return; }

  const raw = $response.body;
  if (!raw) { $done({}); return; }

  let j = null;
  try { j = JSON.parse(raw); } catch (e) { j = null; }
  if (!j || typeof j !== 'object') { $done({}); return; }

  const data = j.result && j.result.data;
  if (!data || typeof data !== 'object') { $done({}); return; }

  // 只在确实是点亮任务（有 task_id）时动手，避免误伤其他响应
  if (data.task_id == null) { $done({}); return; }

  if (data.task_duration === SECS) { $done({}); return; }   // 幂等

  data.task_duration = SECS;

  // 标题里若带原秒数，同步替换，避免「浏览10秒」配 1 秒倒计时的错位观感
  if (typeof data.title === 'string' && /\d+\s*秒/.test(data.title)) {
    data.title = data.title.replace(/\d+(\s*)秒/, SECS + '$1秒');
  }

  $done({ body: JSON.stringify(j) });
} catch (e) {
  // 兜底：出错一律放行，绝不因脚本问题让消费券页打不开
  $done({});
}
