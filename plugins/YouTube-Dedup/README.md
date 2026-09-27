# YouTube-Dedup

> 消除与 `blockAds.plugin` 的重复改写，收敛 MitM 范围。

## 适用场景

同时启用了以下三者时使用本插件：

- `blockAds.plugin`（奶思/fmz200，730+ App 广告合集）
- `YouTube去广告`（Maasea / VirgilClyne 等）
- `YouTube双语翻译`（VirgilClyne）

## 冲突分析

### 1. 同一份脚本跑两遍

`blockAds.plugin` 的 `[Script]` 段内置：

```
script-path=https://raw.githubusercontent.com/Maasea/sgmodule/refs/heads/master/Script/Youtube/youtube.response.js
enable={youtube_enable}     # 默认 true
```

独立插件使用 `YouTube_remove_ads_response.js`（来自 kelee.one）。

**实测比对：两份脚本 Build 注释之后的代码逐字节一致**，仅差末尾换行符与 kelee 多出的 115 字符版权注释。

同一份逻辑对同一个 `player` 响应执行两遍，protobuf 编解码也做两遍。

### 2. `initplayback` 被无条件拦截

`blockAds.plugin` 的 `[Rewrite]` 段：

```
^https:\/\/rr[\w-]+\.googlevideo\.com\/initplayback\? reject-dict
```

无 `enable=` 保护，默认无条件生效。而独立去广告插件的字幕翻译功能依赖该端点。

### 3. `*.youtube.com` 被解密

`YouTube双语翻译` 声明解密 `www.youtube.com` / `m.youtube.com` / `tv.youtube.com` / `music.youtube.com`，这是 App 加载卡顿的主要来源。

## 改动对照

| 项目 | 原版 | 本版 |
|---|---|---|
| `[MitM]` | `*.googlevideo.com` + `youtubei.googleapis.com` | 仅 `youtubei.googleapis.com` |
| `captionLang` 参数 | 6 个选项 | 移除 |
| `googlevideo` 请求规则 | 有 | 移除 |
| 覆盖端点 | browse/next/player/search/reel/guide/get_setting/get_watch/log_event/config | 不变 |
| 去广告 / 画中画 / 后台播放 / 隐藏按钮 | ✅ | ✅ 完整保留 |

## 文件

| 文件 | 用途 |
|---|---|
| `YouTube-Dedup.lpx` | **推荐**，仅解密 youtubei |
| `YouTube-Dedup-Slim.lpx` | 同上但保留 `captionLang`（供不装合集的用户） |
| `YouTube-Dedup-Debug.lpx` | 完整功能 + 默认开启调试模式 |

## 安装

1. Loon → 插件 → 广告拦截合集 → 参数 → 关闭 **「YouTube-脚本开关」**（仅点开关，不改文件）
2. 禁用旧的去广告插件，导入本插件
3. 确认开启 **MitM over HTTP/2** 与 **QUIC 回退保护**
4. 重启 Loon

字幕功能交由 `YouTube双语翻译` 插件处理（它不使用 googlevideo，不受 `initplayback` 拦截影响）。

> YouTube 的 **PO Token** 机制（player 接口对未完成 BotGuard 挑战的客户端返回 `400 FAILED_PRECONDITION`）属服务端要求，脚本层无法解决。

## 致谢

未修改上游脚本任何逻辑，仅裁剪清单声明。上游版权与许可全部适用：

Maasea <https://github.com/Maasea> ·
VirgilClyne <https://github.com/VirgilClyne> ·
Choler <https://github.com/Choler> ·
DivineEngine <https://github.com/DivineEngine> ·
app2smile <https://github.com/app2smile>
