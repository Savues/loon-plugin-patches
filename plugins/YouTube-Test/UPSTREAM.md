# YouTube 脚本托管记录 · Vendored Script Provenance

> 本目录的脚本全部是**上游原版的逐字节副本**，一行未改。
> Byte-for-byte copies of upstream scripts. Nothing modified.

托管的动机只有一个：**上游站点消失时，已导入的插件会直接加载失败。**
Loon 拉 `script-path` 不带任何校验，域名易主或 CDN 被投毒都会**静默换代码**。
收进本仓库后，「永远信任一个别人控制的域名」变成「审一次，之后 diff 就能看出变化」。

---

## 文件 · Files

| 文件 | 上游 · Upstream |
|---|---|
| `youtube.response.js` | [Maasea/sgmodule](https://github.com/Maasea/sgmodule) |
| `YouTube_Subtitles_request.js` | [DualSubs/YouTube](https://github.com/DualSubs/YouTube) |
| `YouTube_Subtitles_response.js` | [DualSubs/YouTube](https://github.com/DualSubs/YouTube) |
| `YouTube_Composite_Subtitles_response.js` | [DualSubs/Universal](https://github.com/DualSubs/Universal) |
| `YouTube_Subtitles_Translate_response.js` | [DualSubs/Universal](https://github.com/DualSubs/Universal) |
| `../YouTube-Dedup/src/remove-ads-request.js` | [VirgilClyne](https://github.com/VirgilClyne) |

大小与 SHA-256 见 [`manifest.json`](manifest.json)。校验：

```bash
python3 tools/vendor-check.py --hash
```

---

## 一处等价合并 · One deduplication

`YouTube-Dedup` 原先引用的 kelee `YouTube_remove_ads_response.js` 与 Maasea 的
`youtube.response.js` **逐字节等价**（仅差 135 字节署名注释头，Build 时间戳相同），
两个插件现共用 `youtube.response.js` 一个文件。

---

## 审计结论 · Audit result

`test/external-audit.mjs` 扫描全部脚本的明文域名与网络原语，**除字幕翻译脚本外的 5 个脚本零外发**
（有跨平台 HTTP adapter，但 0 个调用点）。

唯一的真实外发在 `YouTube_Subtitles_Translate_response.js`：6 家翻译服务商集中在 `Gl()`
（`Gl(l="Google", …)`，默认 vendor = Google），其中
`translate.googleapis.com/translate_a/single?client=gtx` **不需要 API key**。
⚠️ **`Type=Translate` 会把字幕原文发送给它们。**

`eval` / `new Function` / `import()` / `WebSocket` / `sendBeacon` / `XMLHttpRequest` —— 全部 0。
无远程配置拉取（`Configs` 是内置默认值）。

复核：`node test/external-audit.mjs <脚本目录>`

---

## 致谢 · Credits

- **奶思 / fmz200** <https://github.com/fmz200/wool_scripts> — 合集规则原作者
- **Maasea** <https://github.com/Maasea/sgmodule> — `youtube.response.js`
- **DualSubs** <https://github.com/DualSubs> — 字幕翻译 4 个脚本（署名 VirgilClyne）
- **VirgilClyne** <https://github.com/VirgilClyne> — `remove-ads-request.js`

上游版权与许可全部适用 · Upstream copyrights and licenses apply in full.
