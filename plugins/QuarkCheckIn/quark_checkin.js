/**
 * 夸克网盘 · 每日签到领空间
 * 7 天一轮，普通会员 20/40/20/20/20/20/100 MB，SVIP 最高 1024 MB。
 *
 * 凭证已内置。sign 过期（返回 31001）后，把下面 KPS/SIGN/VCODE 换成新抓包里的。
 * 不用 [MITM]，只走 $httpClient，不解密任何域名。
 */

const KPS   = "TkjIMKD74+V6DabEdq8bB6sd8NCAl334MGEqib7Pu7QNms0mF6hXivLRf69xLg4qQO6fDWxnd8ppFofq9VxSslYtXvVpQwFBEeDwc1Zk0raBfnTFTU6NebRU2ovZ1c93IUE=";
const SIGN  = "TkgJVr6840c5gCbmyeoHE1DuZooRMnV0uG+uNkWI7D3ULFzly2u/GKHMJ1r9t5d8gdI=";
// vcode 原样抄抓包的：sign 锚定了签发时刻，用当前时间重算会 401
const VCODE = "1790541592518";

const q = "kps=" + enc(KPS) + "&sign=" + enc(SIGN) + "&vcode=" + VCODE
        + "&pr=qk_clouddrive"   // 缺它服务端返 500，不是 401
        + "&fr=iphone";         // 缺它返 200 但 data 为空，读不到签到状态

$httpClient.post({
    url: "https://drive-member.quark.cn/1/clouddrive/capacity/growth/sign?" + q,
    // content-type 不能省：省了服务端返回 code=0 但 data={} 的假成功
    headers: { "content-type": "application/json;" },
    body: '{"sign_cyclic":true}',
    node: "DIRECT",
    insecure: false,
    "auto-cookie": false          // 凭证只在 query 里，禁止自动带 Cookie
}, function (err, resp, data) {
    // 服务端偶尔回 HTML 错误页，JSON.parse 会抛 —— 包住，别让脚本挂到超时
    let j;
    try { j = err ? {} : JSON.parse(data || "{}") || {}; } catch (e) { j = {}; }
    if (j.code === 0 && !(j.data && j.data.sign_daily_reward)) j.code = 44210;
    const n = j.data && j.data.sign_daily_reward;
    // $notification.post 需要 title/subtitle/content 三个参数，少传 content 会显示 null
    $notification.post(
        j.code === 0     ? "✅ 签到成功" :
        j.code === 44210 ? "📅 今日已签" :
        j.code === 31001 ? "🔑 凭证已失效" :
                           "⚠️ 异常",
        "夸克签到",
        j.code === 0     ? "获得 " + (n / 1048576) + "MB" :
        j.code === 31001 ? "sign 过期了\n更新脚本顶部 KPS/SIGN/VCODE" :
                           String(j.message || err || data || "无返回信息").slice(0, 200)
    );
    $done();
});

function enc(s) { return encodeURIComponent(s); }
