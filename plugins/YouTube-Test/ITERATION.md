# YouTube-Test 迭代记录 · Iteration Log

> 合订、去广告、双语字幕、脚本托管的完整过程。
> Merge, ad-block, bilingual subtitles, vendoring.

插件清单只保留生效配置与一行指针，历史全部在这里。

---

## v1.0 · 从广告拦截合集提取

从 `BlockAds-Patched`（fmz200/wool_scripts）逐条提取 YouTube 相关的 **5 处**内容：
`[Argument] youtube_enable`、`[Rule] ads.youtube.com`、`[Rewrite] initplayback`、
`[Script] youtubei 8 端点 → 上游 youtube.response.js`、`[Mitm] 2 域名`。

提取方法不能靠肉眼翻 —— 400 KB / 8486 行的产物里，`[MITM]` 是**一整行几千个域名**。
按规则行的特征用脚本抽，再反向扫一遍「含 youtube/googlevideo 且未被覆盖」的行确认没漏（本次为 0）。

### v1.1 · 补 argument=，Shorts 按钮删不掉

上游脚本的默认参数是：

```js
function ai(){return F.decodeParams({captionLang:"off", blockUpload:!0,
                 blockImmersive:!0, blockShorts:!1})}
function $i(l,{params:e}){let t=["SPunlimited"]; e.blockUpload&&t.push("FEuploads"),
  e.blockImmersive&&t.push("FEmusic_immersive"), e.blockShorts&&t.push("FEshorts"); ...}
```

`guide` 端点的 handler 就是 `$i`，靠 `e.blockShorts` 决定删不删 `FEshorts`。
**`blockShorts` 默认就是 `!1`（false）** —— 不传参就永不删 Shorts 按钮。

v1.0 只抄了合集的 `youtube_enable`，**没带 `argument=`** ⇒ 脚本全程吃默认值。

> 🔴 **合集原版也有这个毛病**：`youtube_enable` 只是总开关，blockAds 的 Script 规则
> 本来就没写 `argument=`。所以合集那个 YouTube 脚本从来也删不掉 Shorts 按钮。

---

## 合订：为什么把去广告和字幕合成一个

Loon 的 `[Script]` 是**先匹配先执行**：同一 URL 只能挂一条 `http-response` 规则，
后面的永不执行。两者在 `youtubei` 的 **player / browse / get_watch** 三个端点上完全重叠。

字幕插件的 README 自己写了「需置于 YouTube去广告插件之下」——说的正是这条顺序。
分开装必须手动摆，摆错了就是「改了没效果」且零报错。合订后顺序写死在清单里。

代价：MitM 从 2 域名涨到 6 个，App 启动略慢。

**丢掉的 2 条规则**：字幕插件这 2 条 http-response 与去广告命中**完全相同**的 URL，
合并成一份清单后必然有一条永不跑，所以直接删掉，不留一行看着像生效的死规则。
（对应的 http-request 方向独立、不互抢，已保留。）

---

## 字幕 429：一次改判

第一次只拿到一份 429 抓包，我断言「出口 IP 限流」，还让用户去做 AutoCC 判别实验 —— **方向完全错了**。

用户补了一份**对照抓包**（Test v1.1 + 字幕插件分开装），两次实测只差 10 分钟：

| | 状态 | 大小 | timedtext URL |
|---|---|---|---|
| 分开装 | **200** | 46 KB | `lang=en&name=CC1&**subtype=Translate**` |
| 合并版 | **429** | 1.4 KB | `lang=en&name=CC1&**tlang=zh-Hans**` |

同一批脚本、同一份 persistentStore。脚本的改写链：

```js
if (n.AutoCC) → 追加 tlang
再看 n.Type：Official/Composite → 保留 tlang
             Translate         → 删掉 tlang，改设 subtype=Translate
```

Settings 优先级是 `{...内置默认值, ...$argument, ...persistentStore}`。
persistentStore 里没有 `Type`，所以由 `$argument` 说了算 ——
**换插件 = 换默认值**。合订版是新插件，select 默认取第一项 `Official`，走了 tlang 那条被判 429 的路。

修法：把 select 第一项改成 `Translate`。

> 教训：**同时段对照抓包**比单份抓包强得多。看到 429/风控页，先要一份能正常工作的对照。
> 另外，清单行为对拍（逐 URL 模拟 first-match-wins）**只能证伪「清单层有差异」，
> 不能证成「清单层没问题」** —— 它验的是规则命中，不含参数求值。差异藏在参数默认值里，对拍看不见。

---

## v1.1（合订版）· 「原文字幕位置」开关失效

`Position` / `ShowOnly` **只在响应脚本里被读取**（`Jl()` 拼双语那一步）：

```js
function Jl(l,n,u=false,e="Forward",t="\n"){ let a="";
  if(u===true) a=n;                                  // ShowOnly
  else switch(e){ case"Forward": default: a=`${l}${t}${n}`;   // 原文\n译文
                  case"Reverse": a=`${n}${t}${l}` } }          // 译文\n原文
```

上游那 4 条 **http-response** 规则写的是空的 `argument=` ⇒ `$argument` 是 null
⇒ 拿不到 `Position` ⇒ 恒走默认 Forward。请求侧的 http-request 规则本来就有完整 argument
（所以 `Type` 生效、双语能出），响应侧没有（所以 `Position` 失效）。

**这个功能在原版里就是坏的。** 修法：4 条响应规则补上 argument，脚本一行未动。

> 🔴 **逐字节一致 ≠ 正确。** `merge-verify.mjs` 当时有个「保留的规则与原版一致」断言，
> 但它的 `strip()` 把 `argument=` 一起剥掉了 —— 正是那个盲点让上游的 bug 被原样保留下来，
> 还通过了我的检查。

---

## v1.2 · 默认值调成「装完即用」

v1.1 补上 argument= 后，参数真的传进去了，但**传进去的值是错的**：

`ShowOnly` 默认 `true` ⇒ `Jl()` 第一句 `if(u===true) return n` 直接返回译文、
把原文整个丢掉 ⇒ **只剩中文**。（v1.0 不传参数时反而正常 —— 一个 bug 遮住了另一个。）

顺带发现：**Loon 的三值 switch 写法无法用来「关」**。真机实测 `switch,true,false`
与 `switch,false,true` **都解析成 true**。已全部改成两值 `switch,<默认值>`，
与本仓库 Bilibili-UI 的写法一致。

最终默认值（与脚本内置默认值逐条对齐）：

| 参数 | 默认 | 脚本内置 |
|---|---|---|
| Type | Translate | Official |
| AutoCC | 开 | `!0` |
| ShowOnly | **关**（双语） | `!1` |
| Position | **Reverse**（译文在上） | Forward |
| 上传 / Shorts / 选段 | 屏蔽 | `!0` / `!1` / `!0` |

> 教训：**给规则补参数时，要按「脚本在哪一步读这个参数」来判断该补哪条规则。**
> 同一个参数常同时出现在 request 与 response 两条规则上，只补一条 = 功能静默失效。
> 判断依据：去脚本里 grep 参数名，看它出现在哪个函数的哪个环节。

---

## 脚本托管

**动机**：Loon 拉远程 `script-path` 不做任何校验。上游仓库改名/删库、CDN 被投毒
都会静默换代码，用户无感知。收进本仓库后，从「永远信任一个别人控制的域名」
变成「审一次，之后 diff 就能看出变化」。

6 个脚本全部是**逐字节副本**，SHA-256 在 `manifest.json`，由 `tools/vendor-check.py` 校验。

顺带一处去重：kelee 的 `YouTube_remove_ads_response.js` 与 Maasea 的 `youtube.response.js`
逐字节等价（99.1% 标识符交集、`// Build:` 时间戳相同，仅差 135 字节署名注释头），
两插件现共用一个文件。

**托管解决的是可用性，不是数据流向** —— 字幕原文仍会发给翻译服务商，
详见 [UPSTREAM.md](UPSTREAM.md) 的审计结论。
