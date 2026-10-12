# 迅雷云盘·外部播放器

检测迅雷云盘视频直链，弹出通知跳转到第三方播放器。

## 功能

- 自动检测迅雷云盘 App 的视频播放请求（`vod*-vip-lixian.xunlei.com/download/`）
- 提取视频直链（MP4 格式，支持 Range 请求）
- 通过系统通知推送，点击直接跳转到指定播放器
- 支持主流 iOS 播放器：SenPlayer、Forward、Alook、nPlayer、Infuse、VLC、MPV 等
- 支持自定义 Scheme，兼容任意支持 URL Scheme 的播放器
- 可选自动将视频链接写入持久化存储，配合快捷指令使用

## 使用前提

1. **Loon 已配置 MitM 证书**并信任
2. 插件已启用，MitM 域名 `vod*-vip-lixian.xunlei.com` 已生效
3. 目标播放器 App 已安装（如 SenPlayer、Forward、Infuse 等）

## 配置说明

| 参数 | 类型 | 说明 |
|------|------|------|
| `播放器` | 选择 | 目标播放器，默认 Safari（系统浏览器打开） |
| `自定义Scheme` | 文本 | 选择 `Custom` 时必填，如 `myplayer://play?url=`（必须含 `://`） |
| `通知标题` | 文本 | 推送通知的标题，默认 `🎬 迅雷云盘视频` |
| `通知内容` | 文本 | 推送通知的内容，默认 `点击在外部播放器打开` |
| `自动复制链接` | 开关 | 开启后将视频链接写入 `$persistentStore`（键 `xunlei_last_video_url`） |

## 支持的播放器及 Scheme

| 选项 | App | Scheme 前缀 |
|------|-----|-------------|
| Safari | 系统浏览器 | 直接打开链接 |
| SenPlayer | SenPlayer | `SenPlayer://x-callback-url/play?url=` |
| Forward | Forward | `forward://play?url=` |
| Filebar | Fileball/文件传输助手 | `filebox://play?url=` |
| Alook | Alook 浏览器 | `alook://open?url=` |
| nPlayer | nPlayer | `nplayer://play?url=` |
| Infuse | Infuse | `infuse://x-callback-url/play?url=` |
| VLC | VLC for iOS | `vlc://x-callback-url/play?url=` |
| IINA | IINA (macOS) | `iina://open?url=` |
| MPV | MPV (macOS/Linux) | `mpv://play?url=` |
| Custom | 自定义 | 用户填写的完整前缀 |

## 工作流程

1. 在迅雷云盘 App 打开任意视频开始播放
2. Loon 拦截到视频流请求（匹配 `fid=...&mtp=video_mp4`）
3. 脚本提取完整视频直链
4. 根据配置拼接对应播放器的 Scheme 链接
5. 发送系统通知，携带 `openUrl`（点击跳转）和 `mediaUrl`（原始视频链接）
6. 用户点击通知 → iOS 唤起对应播放器 → 开始播放

## 注意事项

- **直链有时效性**：迅雷视频链接包含签名参数（`e`=过期时间、`g/i/at`=签名），通常有效期 30 分钟左右，需在 App 内重新打开视频获取新链接
- **User-Agent**：部分情况下需带 `LibVLC/3.0.23` 等 UA，播放器若报 403 请在播放器设置中添加自定义 UA
- **MitM 必须生效**：确保 Loon 证书已安装并信任，且 `vod*-vip-lixian.xunlei.com` 在 MitM 列表中
- **仅匹配视频流**：正则要求同时包含 `fid=` 和 `mtp=video_mp4`，自动排除音频、字幕、预览图等非视频请求

## 订阅地址

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/Xunlei-Player/Xunlei-Player.lpx
```

## 更新日志

### v1.0 (2026-10-12)
- 初始版本
- 支持 11 种内置播放器 + 自定义 Scheme
- 系统通知跳转，支持 openUrl / mediaUrl
- 可选持久化存储视频链接

## 许可证

MIT License