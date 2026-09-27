# YouTube-Dedup · 哔哩哔哩同源去重版

> 消除与 blockAds 的重复改写，收敛 MitM 范围。
> Removes duplicated rewrites against blockAds; narrows the MITM surface.

**可用 OK** · 3 个变体 · 3 variants

---

## 适用场景 · Use case

同时启用 `blockAds` 与本插件会导致 YouTube 响应被改写两遍。
Use both blockAds and this plugin → the YouTube response is rewritten twice.

---

## 冲突分析 · Conflict analysis

| # | 冲突 | 说明 |
|---|---|---|
| 1 | **同一份脚本跑两遍** | blockAds 内置 Maasea 的 `youtube.response.js`，与 kelee 的版本**字节级相同**（Build 注释后逐字节一致） |
| 2 | **`initplayback` 被无条件拦截** | blockAds 有一条 `reject` 规则，**无 `enable` 保护**，会拦掉字幕翻译所依赖的端点 |
| 3 | **`*.youtube.com` 被解密** | 字幕翻译插件声明解密主域，每个静态资源多一次 TLS 握手 |

---

## 改动对照 · What changed

| | 原版 | 本插件 |
|---|---|---|
| `[MitM]` | `*.googlevideo.com` + `youtubei.googleapis.com` | 仅 `youtubei.googleapis.com` |
| `captionLang` | 6 个选项 | **移除**（依赖被拦截的 initplayback） |
| `googlevideo` 规则 | 有 | **移除** |
| 覆盖端点 | 含 `log_event` / `config` | 保持不变 |
| 去广告 / 画中画 / 后台播放 | ✅ | ✅ **完整保留** |

---

## 文件 · Files

| 文件 | 用途 | Purpose |
|---|---|---|
| `YouTube-Dedup.lpx` | **推荐** | 仅解密 youtubei |
| `YouTube-Dedup-Slim.lpx` | 保留 captionLang | 供不装合集的用户 |
| `YouTube-Dedup-Debug.lpx` | 完整功能 + debug 默认开 | Full + debug on |

---

## 安装 · Install

1. 导入对应 `.lpx`
2. 确认 **MitM over HTTP/2** 与 **QUIC 回退保护** 已开启
3. 字幕交由 YouTube 双语翻译插件处理（不使用 googlevideo）
4. 重启 Loon

---

## ⚠️ 已知限制

- YouTube **PO Token** 机制：player 接口对未完成 BotGuard 挑战的客户端返回
  `400 FAILED_PRECONDITION`，属服务端要求，**脚本层无解**
- 完整约 60 个标签页类的配置走 App 内原生功能，脚本只能提供常用项

---

## 致谢 · Credits

- **Maasea** <https://github.com/Maasea> — 脚本作者
- **VirgilClyne**、**Choler**、**DivineEngine**、**app2smile** — 改进
- 上游分发 <https://kelee.one/>

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
