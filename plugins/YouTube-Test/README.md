# YouTube-Test · YouTube去广告 + 双语字幕

> 去广告与双语字幕合成一个插件，省掉手动摆插件顺序。
> Ad-block and bilingual subtitles in one plugin.

**v1.0** · 9 参数 / 11 条规则 / 6 域名 · 更新 `2026-09-29T12:00`

| | 中文 | English |
|---|---|---|
| 脚本 | 5 个，**全部由本仓库托管** | 5 scripts, **all self-hosted** |
| 外部依赖 | **无** —— 不再依赖 kelee.one | none |

---

## 订阅 · Subscribe

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/YouTube-Test/YouTube-Test.lpx
```

**需开启 MitM over HTTP/2。** 拉不到新版加 `?cb=2` 破 CDN 缓存。

---

## 功能 · Features

| 功能 | 状态 | Feature | Status |
|---|---|---|---|
| 去广告（首页/搜索/播放页/Shorts） | ✅ | Ad removal | ✅ |
| 底栏按钮屏蔽（Shorts/上传/选段） | ✅ 默认全开 | Bottom bar cleanup | ✅ 3 switches |
| 播放页广告拦截 | ✅ | Player page ads | ✅ |
| `ads.youtube.com` 拦截 | ✅ | Domain block | ✅ |
| 字幕双语翻译 | ✅ 默认开启 | Bilingual subtitles | ✅ on by default |
| YouTube Music 歌词翻译 | ✅ | Lyrics translation | ✅ |
| 播放页广告域名 | ✅ | `ads.youtube.com` | ✅ |

---

## 为什么要合订 · Why one plugin

Loon 的 `[Script]` 是**先匹配先执行**：同一 URL 只能挂一条规则，后面的永不执行。

去广告脚本与字幕脚本在 `youtubei` 的 **player / browse / get_watch** 三个端点上完全重叠。
分开装必须手动决定谁在前面（字幕插件的 README 也写了「需置于去广告插件之下」），
**顺序错了就是「改了没效果」且零报错**。合订后顺序写死在清单里。

代价：MitM 从 2 个域名涨到 6 个（多解密 4 个 YouTube 主域），App 启动会略慢。

---

## 外部资源 · External resources

**清单层不含任何第三方脚本。** 5 个脚本全部是上游原版的逐字节副本，收在
[`src/`](src/)，SHA-256 记在 [`manifest.json`](manifest.json)。

```bash
python3 tools/vendor-check.py --hash   # 校验本地未被改动
python3 tools/vendor-check.py --diff   # 看上游是否更新
```

⚠️ **但字幕内容会出设备**：`Type=Translate` 时脚本把字幕原文发给翻译服务商
（默认 Google 免费端点 `client=gtx`，**不需要 API key**）。
托管解决的是**可用性**，不是数据流向。详见 [UPSTREAM.md](UPSTREAM.md)。

---

## 致谢 · Credits

- **奶思 / fmz200** <https://github.com/fmz200/wool_scripts> — 去广告规则
- **Maasea** <https://github.com/Maasea/sgmodule> — 去广告脚本
- **VirgilClyne** / **DualSubs** <https://github.com/DualSubs> — 字幕翻译

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
