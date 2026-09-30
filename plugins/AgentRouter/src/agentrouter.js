/**
 * AgentRouter · 每日登录签到，查看奖励、余额与累计消耗
 *
 * 抓取:无需抓包，Loon 在插件设置填写账号和密码，其他平台使用 BoxJS
 * 签到:cron 每天 09:00 自动运行，结果未确认时请到网站核对
 *
 * @Author: @773075692 <https://github.com/773075692/agentrouter-checkin>
 * @Modifier: MaYIHEI <https://github.com/MaYIHEI/paperclip>
 * @Channel: Telegram 频道 https://t.me/mayihei
 * @Updated: 2026-09-12
 *
 * ===== Loon =====
 * [Argument]
 * username = input,"",tag=账号,desc=网站账号或邮箱
 * password = input,"",tag=密码,desc=网站登录密码
 * accounts = input,"",tag=多账号（JSON）,desc=选填；填写后优先使用列表；格式见插件主页
 * debug = switch,false,tag=调试模式,desc=仅记录请求状态和签到判定
 *
 * [Script]
 * cron "0 9 * * *" script-path=https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/main/app/agentrouter/agentrouter.js, argument=[{username},{password},{accounts},{debug}], tag=AgentRouter签到, timeout=300, img-url=https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/main/app/agentrouter/icon.png, enable=true
 *
 * ===== Surge =====
 * [Script]
 * AgentRouter签到 = type=cron,cronexp=0 9 * * *,timeout=60,script-path=https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/main/app/agentrouter/agentrouter.js,img-url=https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/main/app/agentrouter/icon.png
 *
 * ===== Quantumult X =====
 * [task_local]
 * 0 9 * * * https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/main/app/agentrouter/agentrouter.js, tag=AgentRouter签到, img-url=https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/main/app/agentrouter/icon.png, enabled=true
 *
 * ===== Stash =====
 * cron:
 *   script:
 *     - name: AgentRouter签到
 *       cron: '0 9 * * *'
 *       timeout: 60
 *
 * script-providers:
 *   AgentRouter签到:
 *     url: https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/main/app/agentrouter/agentrouter.js
 *     interval: 86400
 */

const $ = new Env("AgentRouter");
const SCRIPT_VERSION = "2026-09-12.r8";
$.log(`[INFO] 脚本版本 ${SCRIPT_VERSION}`);

const USER_KEY = "agentrouter_username";
const PASSWORD_KEY = "agentrouter_password";
const CLEAR_KEY = "agentrouter_clear";
const DEBUG_KEY = "agentrouter_debug";
const IS_LOON = $.isLoon();
const PLUGIN = typeof $argument !== "undefined" && $argument && typeof $argument === "object" ? $argument : {};
const SETTINGS_PAGE = IS_LOON ? "Loon 插件设置" : "BoxJS";
const BASE_URL = "https://agentrouter.org";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

run().catch((error) => {
    // 只输出脚本主动生成的错误，不转储账号、请求和原始响应。
    $.msg($.name, "❌ 运行失败", error.message);
}).finally(() => $.done());

async function run() {
    const clear = IS_LOON ? null : $.getdata(CLEAR_KEY);
    if (clear === "true" || clear === "1") {
        const userCleared = $.setdata("", USER_KEY);
        const passwordCleared = $.setdata("", PASSWORD_KEY);
        if (!userCleared || !passwordCleared) {
            throw new Error("账号信息清除失败，请在 BoxJS 中检查并手动清空");
        }
        $.setdata("false", CLEAR_KEY);
        $.msg($.name, "✅ 账号信息已清除", "需要继续签到时，请在 BoxJS 重新填写账号和密码");
        return;
    }

    const accounts = readAccounts();
    if (!accounts.length) {
        $.msg($.name, "🚫 未配置账号", `请在 ${SETTINGS_PAGE} 的 AgentRouter 中分别填写账号和密码并保存`);
        return;
    }

    let quotaUnit = null;
    let announcements = null;
    let siteName = null;
    try {
        const status = await request("GET", "/api/status", { Accept: "application/json" }, undefined, "站点配置查询");
        const config = status.json.data;
        if (status.json.success === true && config && config.display_in_currency === true
            && typeof config.quota_per_unit === "number" && Number.isFinite(config.quota_per_unit) && config.quota_per_unit > 0) {
            quotaUnit = config.quota_per_unit;
        }
        if (status.json.success === true && config) {
            announcements = config.announcements;
            siteName = typeof config.system_name === "string" && config.system_name ? config.system_name : null;
        }
    } catch (_) {
        debug("站点配置未取得，余额按原始额度显示");
    }
    const results = [];
    for (let i = 0; i < accounts.length; i++) {
        debug(`开始账号 ${i + 1}/${accounts.length}`);
        try {
            results.push(await checkin(accounts[i], quotaUnit, announcements, siteName));
        } catch (error) {
            results.push({ title: "❌ 运行失败", content: error.message, topbar: null });
        }
    }
    if (results.length === 1) {
        $.msg(results[0].topbar || $.name, results[0].title, results[0].content);
    } else {
        $.msg(`签到汇总（${results.length} 个账号）`, "多账号",
            results.map((result, i) =>
            `账号 ${i + 1} · ${accounts[i].username}\n${result.title}\n${result.content}`).join("\n\n"));
    }
}

function readAccounts() {
    const multi = IS_LOON ? (PLUGIN.accounts || "").trim() : "";
    if (multi) {
        let accounts;
        try {
            accounts = JSON.parse(multi);
        } catch (_) {
            throw new Error("多账号格式错误，请按使用说明填写 JSON 数组");
        }
        if (!Array.isArray(accounts) || !accounts.length) {
            throw new Error("多账号必须是非空 JSON 数组；使用单账号时请清空多账号输入框");
        }
        return accounts.map((account, i) => {
            if (!account || typeof account.username !== "string" || !account.username.trim()
                || typeof account.password !== "string" || !account.password) {
                throw new Error(`多账号第 ${i + 1} 项缺少有效的 username 或 password，请检查插件设置`);
            }
            return { username: account.username.trim(), password: account.password };
        });
    }
    const username = ((IS_LOON ? PLUGIN.username : $.getdata(USER_KEY)) || "").trim();
    const password = (IS_LOON ? PLUGIN.password : $.getdata(PASSWORD_KEY)) || "";
    return username && password ? [{ username, password }] : [];
}

async function checkin({ username, password }, quotaUnit, announcements, siteName) {
    const headers = {
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Origin: BASE_URL,
        Referer: `${BASE_URL}/login`,
    };
    const login = await request("POST", "/api/user/login", headers, JSON.stringify({ username, password }), "登录");
    if (login.json.success !== true) {
        return { title: "❌ 登录失败", content: `请先在 AgentRouter 网页确认账号、密码及是否需要验证码，再更新 ${SETTINGS_PAGE}` };
    }
    const data = login.json.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        return { title: "⚠️ 签到待确认", content: "登录成功，但响应缺少用户信息，请到网站使用日志中核对" };
    }
    debug(`登录成功；checked_in=${data.checked_in === true ? "true" : data.checked_in === false ? "false" : "缺失或格式异常"}`);

    const cookie = sessionCookie(login.headers);
    if (!cookie || !Number.isInteger(data.id) || data.id <= 0) {
        return { title: "⚠️ 签到待确认", content: "登录响应缺少 Cookie 或用户编号，请到网站核对签到记录与余额" };
    }
    const userHeaders = {
        ...headers,
        Referer: `${BASE_URL}/console`,
        Cookie: cookie,
        "New-API-User": String(data.id),
    };
    // 日志只拉一次，签到判定和用量统计共用这一页
    let items = null;
    let detail;
    try {
        const logs = await request("GET", "/api/log/self?p=1&page_size=20", {
            ...userHeaders,
            Referer: `${BASE_URL}/console/log`,
        }, undefined, "签到记录查询");
        if (logs.json.success !== true || !logs.json.data || !Array.isArray(logs.json.data.items)) {
            throw new Error("签到记录查询未成功，请在网站使用日志中核对");
        }
        items = logs.json.data.items;
        debug(`最近记录数=${items.length}`);
    } catch (error) {
        detail = error.message;
    }
    const checkinRecord = items ? findTodayCheckin(items, Date.now()) : null;
    if (items) {
        debug(`今日签到记录=${!!checkinRecord}`);
        if (!checkinRecord) detail = `最近 ${items.length} 条日志中未找到今日签到记录，请到网站核对`;
    }

    // 账户信息用于顶栏（ID / 注册天数）与正文第 1 行（余额 / 已用 / 请求数）
    let user = data;
    let stats;
    try {
        const profile = await request("GET", "/api/user/self", userHeaders, undefined, "余额查询");
        const quota = profile.json.data && profile.json.data.quota;
        if (profile.json.success !== true || typeof quota !== "number" || !Number.isFinite(quota)) {
            throw new Error("余额查询未返回有效额度，请到网站核对");
        }
        user = profile.json.data;
        stats = formatStats(user, quotaUnit);
    } catch (error) {
        stats = `💳 余额查询失败：${error.message}`;
    }
    const topbar = formatTopbar(user, siteName);
    // 公告只占正文第 2-4 行；正文首行永远是余额那行
    const announce = formatAnnouncement(announcements);
    const body = announce ? `${stats}\n${announce}` : stats;

    if (checkinRecord) {
        return { topbar, title: "✅ 今日已签到" + formatCheckinReward(checkinRecord.content), content: body };
    } else {
        const state = data.checked_in === true ? "服务端返回已签到，但日志尚未确认" : "登录成功，签到状态尚未确认";
        return { topbar, title: "⚠️ 签到待确认", content: `🎁 签到奖励：待确认\n${stats}\n\n${state}\n${detail}` };
    }
}

// 通知正文第 1 行：余额 · 已用 · 请求数 挤在一行里。
// iOS 锁屏通知正文只给 4 行，拆成多行会把下面的公告挤出预算。
function formatStats(user, quotaUnit) {
    const money = (v) => {
        if (typeof v !== "number" || !Number.isFinite(v)) return null;
        return quotaUnit === null ? String(v) : "$" + (v / quotaUnit).toFixed(2);
    };
    const parts = [];
    const bal = money(user.quota);
    const used = money(user.used_quota);
    if (bal) parts.push(`💳 余额 ${bal}`);
    if (used) parts.push(`已用 ${used}`);
    if (Number.isInteger(user.request_count) && user.request_count >= 0) {
        parts.push(`${user.request_count} 次`);
    }
    return parts.join(" · ") || "💳 余额查询失败";
}

const ANNOUNCE_KEY = "agentrouter_announce_id";
const ANNOUNCE_LINES = 3;   // 通知正文第 2-4 行留给公告

// 公告：只在有新公告时占正文行。用 $persistentStore 记住上次见到的最大 id。
// 首次运行没有记录，会把当前最新的那条当新公告报一次。
function formatAnnouncement(announcements) {
    if (!Array.isArray(announcements) || !announcements.length) return "";
    const latest = announcements[0];
    if (!latest || typeof latest.content !== "string") return "";
    const seen = $.getdata(ANNOUNCE_KEY);
    if (seen !== null && seen !== undefined && seen !== "" && String(latest.id) === String(seen)) return "";
    $.setdata(String(latest.id), ANNOUNCE_KEY);
    const date = String(latest.publishDate || "").slice(5, 10);   // MM-DD
    // 原文段落换行压成空格；但中文标点后面那个空格要去掉，否则读着别扭
    const text = String(latest.content)
        .replace(/\s+/g, " ")
        .replace(/([　-〿＀-￯])\s+(?=[一-鿿])/g, "$1")
        .trim();
    return wrap("📢 " + date + " " + text, ANNOUNCE_LINES);
}

// 按显示宽度断行：全角算 1、半角算 0.5，上限 max 行。iOS 通知正文不会自己折行，
// 超出的部分直接被截掉，所以必须自己断。续行缩进 2 格，便于和首行的 📢 对齐。
function wrap(text, max) {
    const width = (ch) => (ch.charCodeAt(0) > 0x2e80 ? 1 : 0.5);
    // 缩进要与首行「📢 」等宽才能对齐 —— emoji 1 + 空格 0.5 = 1.5 个全角单位。
    // 第一版用 2 个空格（1 个单位），续行起点比首行文字靠左半个字，肉眼能看出来。
    const INDENT = 3;
    const LIMIT = 19;                          // 19 全角单位 ≈ 窄屏一行
    const out = [];
    let cur = "", w = 0;
    for (const ch of text) {
        const cw = width(ch);
        const room = LIMIT - (out.length ? INDENT : 0);
        if (w + cw > room) {
            // 行首行尾空格都剪掉：断行点常落在空格前后，留着会叠加到下一行的
            // 缩进上，表现为某一行比别的多缩进一格（真机截图里见过）。
            out.push(cur.replace(/^\s+|\s+$/g, ""));
            if (out.length === max) break;
            cur = ""; w = 0;
        }
        cur += ch; w += cw;
    }
    if (out.length < max && cur) out.push(cur);
    if (out.length > max) out.length = max;
    // 只要原文没被完整放下，末行就加省略号
    const kept = out.join("").replace(/\s/g, "");
    if (kept.length < text.replace(/\s/g, "").length) out[out.length - 1] += "…";
    return out.map((l, i) => (i ? " ".repeat(INDENT) + l : l)).join("\n");
}

// 通知顶栏（副标题）：站点名 · 用户 ID · 注册至今天数
function formatTopbar(user, siteName) {
    // 站点名里的空格删掉：通知宽度紧张，"Agent Router"(6) 比 "AgentRouter"(5.5)
    // 贵半个单位，副标题右侧还要给时间戳留位。
    const parts = [(siteName || "AgentRouter").replace(/\s+/g, "")];
    if (Number.isInteger(user && user.id) && user.id > 0) parts.push(String(user.id));
    if (user && typeof user.created_at === "number" && user.created_at > 0) {
        const days = (Date.now() / 1000 - user.created_at) / 86400;
        // 注册当天算第 1 天，所以是 floor + 1。
        // 上界 36500 天：登录响应的 created_at 是 0，不设上界会算出几万天。
        if (Number.isFinite(days) && days >= 0 && days < 36500) {
            parts.push("第 " + (Math.floor(days) + 1) + " 天");
        }
    }
    return parts.join(" · ");
}

function formatCheckinReward(content) {
    // 系统日志的 quota 不是奖励；只解析实测详情中明确标注的美元金额。
    // 金额前的符号实测是全角 ＄（U+FF04），不是半角 $ —— 半角全角都收。
    const match = content.trim().match(/^每日签到成功，\s*增加额度\s*[$＄]\s*(\d+(?:\.\d+)?)\s*额度$/);
    const amount = match ? Number(match[1]) : NaN;
    if (!Number.isFinite(amount)) return "（金额未识别，请到网站核对）";
    // 整数不带小数点：$25 而不是 $25.00
    return ` +$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

function findTodayCheckin(items, now) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    let latest = null;
    for (const item of items) {
        if (item && item.type === 4
            && typeof item.content === "string" && item.content.includes("签到成功")
            && typeof item.created_at === "number" && Number.isFinite(item.created_at)
            && item.created_at * 1000 >= start.getTime() && item.created_at * 1000 <= now
            && (!latest || item.created_at > latest.created_at)) latest = item;
    }
    return latest;
}

function sessionCookie(headers) {
    const key = Object.keys(headers).find((name) => name.toLowerCase() === "set-cookie");
    const raw = key ? [].concat(headers[key]).join("\n") : "";
    // 仅复用 session；不把 Expires 中的逗号或其他 Set-Cookie 属性当作 Cookie。
    const match = raw.match(/(?:^|[\n,])\s*(?:set-cookie:\s*)?(session=[^;\s,]+)/i);
    return match ? match[1] : "";
}

function request(method, path, headers, body, label) {
    return new Promise((resolve, reject) => {
        const options = { url: BASE_URL + path, headers };
        if (body !== undefined) options.body = body;
        // 账号密码只发给固定 HTTPS 站点；Loon 默认允许不受信任证书，需显式关闭。
        if ($.isLoon()) {
            options.insecure = false;
            options["auto-redirect"] = false;
            // 每个账号只使用本次登录拿到的 session，禁止 Cookie 自动沿用到下一个账号。
            options["auto-cookie"] = false;
        }
        $.send(options, method, (error, response, text) => {
            if (error) {
                reject(new Error(`${label}网络请求失败，请检查该网站的 Loon 分流或稍后重试`));
                return;
            }
            const status = Number(response && (response.status || response.statusCode));
            debug(`${label} HTTP ${status}`);
            if (status < 200 || status >= 300 || !status) {
                reject(new Error(`${label}返回 HTTP ${status || "未知"}，请在浏览器确认网站是否可访问或需要验证`));
                return;
            }
            let json;
            try {
                json = JSON.parse(text);
            } catch (_) {
                reject(new Error(`${label}返回非 JSON 内容，可能是网页验证或服务异常，请到网站检查`));
                return;
            }
            if (!json || typeof json !== "object" || Array.isArray(json)) {
                reject(new Error(`${label}响应格式异常，请到网站检查`));
                return;
            }
            resolve({ json, headers: response.headers || {} });
        });
    });
}

function debug(message) {
    if (IS_LOON ? PLUGIN.debug === true : $.getdata(DEBUG_KEY) === "true") $.log(`[DEBUG] ${message}`);
}

function Env(s) {
    this.name = s;
    this.isSurge = () => typeof $httpClient !== "undefined";
    this.isQuanX = () => typeof $task !== "undefined";
    this.isLoon = () => typeof $loon !== "undefined";
    this.log = (...a) => console.log(a.join("\n"));
    this.msg = (t = this.name, s = "", b = "") => {
        if (this.isSurge() || this.isLoon()) $notification.post(t, s, b);
        else if (this.isQuanX()) $notify(t, s, b);
        console.log(["", `====📣${t}====`, s, b].filter(Boolean).join("\n"));
    };
    this.getdata = (k) => {
        if (this.isSurge() || this.isLoon()) return $persistentStore.read(k);
        if (this.isQuanX()) return $prefs.valueForKey(k);
        return null;
    };
    this.setdata = (v, k) => {
        if (this.isSurge() || this.isLoon()) return $persistentStore.write(v, k);
        if (this.isQuanX()) return $prefs.setValueForKey(v, k);
        return false;
    };
    this.send = (req, method, cb) => {
        if (this.isSurge() || this.isLoon()) {
            const fn = method === "POST" ? $httpClient.post : $httpClient.get;
            fn(req, (err, resp, data) => {
                if (resp) {
                    resp.body = data;
                    resp.statusCode = resp.status || resp.statusCode;
                }
                cb(err, resp, data);
            });
        } else if (this.isQuanX()) {
            req.method = method;
            $task.fetch(req).then(
                (r) => {
                    r.status = r.statusCode;
                    cb(null, r, r.body);
                },
                (e) => cb(e.error || e, null, null),
            );
        }
    };
    this.done = (v = {}) => {
        if (typeof $done !== "undefined") $done(v);
    };
}
