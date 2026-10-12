// 迅雷云盘视频直链检测 → 外部播放器跳转
// Loon http-response script
// argument: [player, custom_scheme, notify_title, notify_body, auto_copy]

const $ = new Env("迅雷云盘·外部播放器");

// ========== 解析参数 ==========
const [
    playerChoice,
    customScheme,
    notifyTitle,
    notifyBody,
    autoCopy
] = $argument;

// 默认值
const title = notifyTitle || "🎬 迅雷云盘视频";
const body = notifyBody || "点击在外部播放器打开";
const doCopy = autoCopy === "true" || autoCopy === true;

// ========== 播放器 Scheme 映射表 ==========
const playerMap = {
    "Safari":       { scheme: null,        name: "Safari (系统默认)" },
    "SenPlayer":    { scheme: "SenPlayer://x-callback-url/play?url=", name: "SenPlayer" },
    "Forward":      { scheme: "forward://play?url=",                  name: "Forward" },
    "Filebar":      { scheme: "filebox://play?url=",                  name: "Filebar" },
    "Alook":        { scheme: "alook://open?url=",                    name: "Alook" },
    "nPlayer":      { scheme: "nplayer://play?url=",                  name: "nPlayer" },
    "Infuse":       { scheme: "infuse://x-callback-url/play?url=",    name: "Infuse" },
    "VLC":          { scheme: "vlc://x-callback-url/play?url=",       name: "VLC" },
    "IINA":         { scheme: "iina://open?url=",                     name: "IINA (Mac)" },
    "MPV":          { scheme: "mpv://play?url=",                      name: "MPV" },
    "Custom":       { scheme: customScheme,                           name: "自定义" },
};

// ========== 获取视频 URL ==========
const videoUrl = $request.url;

// 校验 URL 格式
if (!videoUrl.includes("vod") || !videoUrl.includes("mtp=video_mp4")) {
    $.log("非视频直链，跳过");
    $.done({});
}

// ========== 解析播放器选择 ==========
const player = playerChoice || "Safari";
const playerInfo = playerMap[player];

if (!playerInfo) {
    $.log(`未知播放器: ${player}`);
    $.done({});
}

let finalUrl;

if (player === "Safari") {
    // Safari 直接打开原始链接
    finalUrl = videoUrl;
} else if (player === "Custom") {
    if (!customScheme || !customScheme.includes("://")) {
        $.log("自定义 Scheme 无效，需包含 ://");
        $.done({});
    }
    // 自定义 scheme 已包含完整前缀，直接拼接
    finalUrl = customScheme + encodeURIComponent(videoUrl);
} else {
    // 内置播放器 scheme + 编码后的视频链接
    finalUrl = playerInfo.scheme + encodeURIComponent(videoUrl);
}

// ========== 可选：复制到剪贴板 ==========
if (doCopy) {
    $persistentStore.write(videoUrl, "xunlei_last_video_url");
    $.log("视频链接已写入持久化存储，可通过快捷指令读取");
}

// ========== 发送通知 ==========
// Loon 的通知支持 openUrl 和 mediaUrl
// openUrl: 点击通知打开的链接（我们的 scheme 链接）
// mediaUrl: 长按通知/媒体播放用的原始视频链接
$.msg(title, "", body, {
    openUrl: finalUrl,
    mediaUrl: videoUrl,
    // 也可以加媒体封面（可选）
    // mediaCover: "https://example.com/cover.jpg"
});

$.log(`已推送通知 → ${playerInfo.name}`);
$.log(`视频链接: ${videoUrl}`);
$.log(`跳转链接: ${finalUrl}`);

$.done({});

// ========== Env 通用类（兼容 Loon/Surge/Quantumult X/Shadowrocket/Node.js） ==========
function Env(name, options = {}) {
    this.name = name;
    this.version = "1.0.0";
    this.data = null;
    this.logs = [];
    this.isMute = false;
    this.isNeedRewrite = false;
    this.logSeparator = "\n";
    this.encoding = "utf-8";
    this.startTime = new Date().getTime();
    Object.assign(this, options);
    this.log("", `🔔 ${this.name}, 开始!`);
}

Env.prototype.platform = function() {
    if (typeof $environment !== "undefined") {
        if ($environment["surge-version"]) return "Surge";
        if ($environment["stash-version"]) return "Stash";
    }
    if (typeof module !== "undefined" && module.exports) return "Node.js";
    if (typeof $task !== "undefined") return "Quantumult X";
    if (typeof $loon !== "undefined") return "Loon";
    if (typeof $rocket !== "undefined") return "Shadowrocket";
    if (typeof Egern !== "undefined") return "Egern";
    return "Unknown";
};

Env.prototype.isLoon = function() { return this.platform() === "Loon"; };
Env.prototype.isSurge = function() { return this.platform() === "Surge"; };
Env.prototype.isQuanX = function() { return this.platform() === "Quantumult X"; };
Env.prototype.isShadowrocket = function() { return this.platform() === "Shadowrocket"; };
Env.prototype.isStash = function() { return this.platform() === "Stash"; };

Env.prototype.toObj = function(str, fallback = null) {
    try { return JSON.parse(str); } catch { return fallback; }
};
Env.prototype.toStr = function(obj, fallback = null) {
    try { return JSON.stringify(obj); } catch { return fallback; }
};

Env.prototype.lodash_get = function(obj, path, fallback = undefined) {
    if (!Array.isArray(path)) path = path.replace(/\[(\d+)\]/g, ".$1").split(".");
    let result = obj;
    for (const key of path) {
        result = Object(result)[key];
        if (result === undefined) return fallback;
    }
    return result;
};

Env.prototype.lodash_set = function(obj, path, value) {
    if (!Array.isArray(path)) path = path.replace(/\[(\d+)\]/g, ".$1").split(".");
    path.slice(0, -1).reduce((o, k, i) => {
        return Object(o[k]) === o[k] ? o[k] : (o[k] = /^\d+$/.test(path[i + 1]) ? [] : {});
    }, obj)[path[path.length - 1]] = value;
    return obj;
};

Env.prototype.getItem = function(key, fallback = null) {
    if (key.startsWith("@")) {
        const match = key.match(/^@(?<store>[^.]+)(?:\.(?<path>.*))?$/);
        if (!match) return fallback;
        const store = match.groups.store;
        const path = match.groups.path;
        let data = this.getItem(store, {});
        if (typeof data !== "object") data = {};
        return this.lodash_get(data, path, fallback);
    }
    switch (this.platform()) {
        case "Surge":
        case "Loon":
        case "Stash":
        case "Egern":
        case "Shadowrocket":
            return $persistentStore.read(key) ?? fallback;
        case "Quantumult X":
            return $prefs.valueForKey(key) ?? fallback;
        default:
            return this.data?.[key] ?? fallback;
    }
};

Env.prototype.setItem = function(key, value) {
    if (typeof value === "object") value = JSON.stringify(value);
    if (key.startsWith("@")) {
        const match = key.match(/^@(?<store>[^.]+)(?:\.(?<path>.*))?$/);
        if (!match) return false;
        const store = match.groups.store;
        const path = match.groups.path;
        let data = this.getItem(store, {});
        if (typeof data !== "object") data = {};
        this.lodash_set(data, path, value);
        return this.setItem(store, data);
    }
    switch (this.platform()) {
        case "Surge":
        case "Loon":
        case "Stash":
        case "Egern":
        case "Shadowrocket":
            return $persistentStore.write(value, key);
        case "Quantumult X":
            return $prefs.setValueForKey(value, key);
        default:
            this.data = this.data || {};
            this.data[key] = value;
            return true;
    }
};

Env.prototype.log = function(...args) {
    if (args.length > 0) this.logs.push(...args);
    console.log(args.join(this.logSeparator));
};

Env.prototype.logErr = function(...args) {
    this.log("", `❗️ ${this.name}, 错误!`, ...args);
};

Env.prototype.wait = function(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
};

Env.prototype.msg = function(title, subtitle = "", body = "", options = {}) {
    const toOpenUrl = (opts) => {
        switch (typeof opts) {
            case "string":
                switch (this.platform()) {
                    case "Surge": case "Stash": case "Egern": default: return { url: opts };
                    case "Loon": case "Shadowrocket": return opts;
                    case "Quantumult X": return { "open-url": opts };
                }
            case "object":
                switch (this.platform()) {
                    case "Surge": case "Stash": case "Egern": case "Shadowrocket": default:
                        return { url: opts.url || opts.openUrl || opts["open-url"] };
                    case "Loon":
                        return { openUrl: opts.openUrl || opts.url || opts["open-url"], mediaUrl: opts.mediaUrl || opts["media-url"] };
                    case "Quantumult X":
                        return { "open-url": opts["open-url"] || opts.url || opts.openUrl, "media-url": opts["media-url"] || opts.mediaUrl, "update-pasteboard": opts["update-pasteboard"] || opts.updatePasteboard };
                }
            default:
                return undefined;
        }
    };

    if (!this.isMute) {
        const openUrlObj = toOpenUrl(options);
        switch (this.platform()) {
            case "Surge":
            case "Loon":
            case "Stash":
            case "Egern":
            case "Shadowrocket":
            default:
                $notification.post(title, subtitle, body, openUrlObj);
                break;
            case "Quantumult X":
                $notify(title, subtitle, body, openUrlObj);
                break;
        }
    }
    if (!this.isMuteLog) {
        this.log("", `==============📣 系统通知 ==============`);
        this.log(title);
        subtitle && this.log(subtitle);
        body && this.log(body);
        this.log(`openUrl: ${JSON.stringify(openUrlObj)}`);
    }
};

Env.prototype.done = function(data = {}) {
    const elapsed = (new Date().getTime() - this.startTime) / 1000;
    this.log("", `🔔 ${this.name}, 结束! 🕛 ${elapsed} 秒`);
    switch (this.platform()) {
        case "Surge":
            if (data.policy) this.lodash_set(data, "headers.X-Surge-Policy", data.policy);
            $done(data);
            break;
        case "Loon":
            if (data.policy) data.node = data.policy;
            $done(data);
            break;
        case "Stash":
            if (data.policy) this.lodash_set(data, "headers.X-Stash-Selected-Proxy", encodeURI(data.policy));
            $done(data);
            break;
        case "Egern":
            $done(data);
            break;
        case "Shadowrocket":
        default:
            $done(data);
            break;
        case "Quantumult X":
            if (data.policy) this.lodash_set(data, "opts.policy", data.policy);
            delete data["auto-redirect"];
            delete data["auto-cookie"];
            delete data["binary-mode"];
            delete data.charset;
            delete data.host;
            delete data.insecure;
            delete data.method;
            delete data.opt;
            delete data.path;
            delete data.policy;
            delete data["policy-descriptor"];
            delete data.scheme;
            delete data.sessionIndex;
            delete data.statusCode;
            delete data.timeout;
            if (data.body instanceof ArrayBuffer) { data.bodyBytes = data.body; delete data.body; }
            else if (ArrayBuffer.isView(data.body)) { data.bodyBytes = data.body.buffer.slice(data.body.byteOffset, data.body.byteLength + data.body.byteOffset); delete data.body; }
            else if (data.body) delete data.bodyBytes;
            $done(data);
            break;
    }
};

// 兼容性：如果已经是 Loon 环境，直接使用全局 $done
if (typeof $done === "function" && typeof $notification !== "undefined") {
    // 已在 Loon 环境，Env 类只是为了兼容性
}