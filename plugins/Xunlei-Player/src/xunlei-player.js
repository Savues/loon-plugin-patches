// 迅雷云盘视频直链检测 → 外部播放器跳转 v1.2
// Loon http-response script
// argument: [player, custom_scheme, notify_title, notify_body, auto_copy]

const $ = new Env("迅雷云盘·外部播放器 v1.2");

// ========== 全局错误捕获 ==========
try {
    main();
} catch (e) {
    console.log(`[Xunlei-Player-Probe] FATAL ERROR: ${e.message}\n${e.stack}`);
    $.done({});
}

function main() {
    // ========== 探针：脚本启动日志 ==========
    $.log(`[Xunlei-Player-Probe] v1.2 RESPONSE 脚本启动 | URL: ${$request.url} | Status: ${$response?.status || "unknown"} | UA: ${$request.headers?.["User-Agent"] || $request.headers?.["user-agent"] || "无"}`);

    // ========== 解析参数 ==========
    const [
        playerChoice,
        customScheme,
        notifyTitle,
        notifyBody,
        autoCopy
    ] = $argument || [];

    // 默认值
    const title = notifyTitle || "🎬 迅雷云盘视频";
    const body = notifyBody || "点击在外部播放器打开";
    const doCopy = autoCopy === "true" || autoCopy === true;

    // ========== 获取视频 URL ==========
    const videoUrl = $request.url;

    // 校验 URL 格式（放宽：只需域名含 vod 且参数含 mtp=video_mp4）
    if (!videoUrl.includes("vod") || !videoUrl.includes("mtp=video_mp4")) {
        $.log(`[Xunlei-Player-Probe] 非视频直链，跳过 | URL: ${videoUrl}`);
        return $.done({});
    }

    $.log(`[Xunlei-Player-Probe] 视频直链匹配成功 | 视频URL: ${videoUrl}`);

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

    // ========== 解析播放器选择 ==========
    const player = playerChoice || "Safari";
    const playerInfo = playerMap[player];

    if (!playerInfo) {
        $.log(`[Xunlei-Player-Probe] 未知播放器: ${player}，回退 Safari`);
        return sendNotification("Safari", playerMap["Safari"], videoUrl, title, body);
    }

    let finalUrl;

    if (player === "Safari") {
        finalUrl = videoUrl;
    } else if (player === "Custom") {
        if (!customScheme || !customScheme.includes("://")) {
            $.log(`[Xunlei-Player-Probe] 自定义 Scheme 无效: ${customScheme}，回退 Safari`);
            return sendNotification("Safari", playerMap["Safari"], videoUrl, title, body);
        }
        finalUrl = customScheme + encodeURIComponent(videoUrl);
    } else {
        finalUrl = playerInfo.scheme + encodeURIComponent(videoUrl);
    }

    // ========== 可选：持久化存储视频链接 ==========
    if (doCopy) {
        try {
            $persistentStore.write(videoUrl, "xunlei_last_video_url");
            $.log(`[Xunlei-Player-Probe] 视频链接已存入 persistentStore`);
        } catch (e) {
            $.log(`[Xunlei-Player-Probe] 存储失败: ${e.message}`);
        }
    }

    // ========== 发送通知 ==========
    return sendNotification(player, playerInfo, videoUrl, title, body, finalUrl);
}

function sendNotification(playerName, playerInfo, videoUrl, title, body, finalUrl) {
    try {
        $.log(`[Xunlei-Player-Probe] 准备发送通知 | 播放器: ${playerInfo.name} | finalUrl前缀: ${finalUrl?.substring(0, 80)}...`);

        $.msg(title, "", body, {
            openUrl: finalUrl,
            mediaUrl: videoUrl,
        });

        $.log(`[Xunlei-Player-Probe] 通知发送完成 → ${playerInfo.name}`);
    } catch (e) {
        $.log(`[Xunlei-Player-Probe] 发送通知异常: ${e.message}\n${e.stack}`);
    }

    $.done({});
}

// ========== Env 通用类（精简版，专用 Loon） ==========
function Env(name, options = {}) {
    this.name = name;
    this.version = "1.2.0";
    this.data = null;
    this.logs = [];
    this.isMute = false;
    this.isNeedRewrite = false;
    this.logSeparator = "\n";
    this.encoding = "utf-8";
    this.startTime = new Date().getTime();
    Object.assign(this, options);
}

Env.prototype.log = function(...args) {
    if (args.length > 0) this.logs.push(...args);
    console.log(args.join(this.logSeparator));
};

Env.prototype.msg = function(title, subtitle = "", body = "", options = {}) {
    if (this.isMute) return;

    const openUrlObj = (() => {
        if (!options) return undefined;
        switch (typeof options) {
            case "string":
                return options; // Loon 支持字符串直接作为 openUrl
            case "object":
                return {
                    openUrl: options.openUrl || options.url || options["open-url"],
                    mediaUrl: options.mediaUrl || options["media-url"]
                };
            default:
                return undefined;
        }
    })();

    try {
        if (typeof $notification !== "undefined" && $notification.post) {
            $notification.post(title, subtitle, body, openUrlObj);
        }
    } catch (e) {
        this.log(`[Xunlei-Player-Probe] $notification.post 失败: ${e.message}`);
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
    if (typeof $done === "function") {
        $done(data);
    }
};