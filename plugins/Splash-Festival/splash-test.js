/*
 * 测试版：只做一件事 —— 拦截 brand/list，注入固定 show（中秋 id=38）。
 * 无视任何节日/日期逻辑，纯测试拦截是否生效。
 */
try {
  const j = JSON.parse($response.body);
  if (!j.data) j.data = {};
  const now = Math.floor(Date.now() / 1000);
  j.data.show = [{
    id: 38,  // 中秋
    begin_time: now - 7 * 86400,
    end_time: now + 7 * 86400,
    probability: 1,
    duration: 1000,
    mode: "full",
    show_logo: true,
    logo_position: "center",
    new_splash: true,
    categories: null,
    initial_push_time: now - 7 * 86400,
    source: "brand"
  }];
  $done({ body: JSON.stringify(j) });
} catch (e) {
  $done({});
}
// TEST ONLY: inject fixed show (midautumn id=38)