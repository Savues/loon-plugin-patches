# YouTube-Dedup 迭代记录 · Iteration Log

> 一次真机抓包 → 两个脚本级缺陷 → v5.0.0 → v5.1.0 的完整过程。
> One real capture → two script-level defects → v5.1.0.

---

## 2026-09-29 · v5.1.0：按抓包更新

### 输入

用户在 YouTube 21.39.4 / iPadOS 18.7.3 上用 Loon 抓的 HAR：**64 条，冷启动 6.4 秒**
（`02:45:52.213` – `02:45:58.490`）。HAR 里有完整的 `Authorization: Bearer ya29.…`，
**不能进仓库**，只取了两条响应体，并逐字节确认不含 `ya29` / `Bearer` / `oauth` / `AIza` / visitor-id。

### 端点清单（先确认「该不该拦」，再谈「怎么修」）

抓包里出现 15 个 YouTube 相关端点，插件正则命中 4 个，另外 11 个按规则不拦。
判定依据是上游脚本内部这张表（`Mi=[{path:…}]`，用 `url.includes(path)` 匹配）：

```
browse  next  player  search  reel_watch_sequence  guide
get_setting  get_watch  config  log_event
```

| 端点 | 次数 | 处置 |
|---|---|---|
| `youtubei/v1/browse` | 2 | 拦（上游） |
| `youtubei/v1/config` | 1 | **改由自研脚本**（见下） |
| `youtubei/v1/guide` | 1 | 拦（上游） |
| `youtubei/v1/account/get_setting` | 1 | 拦（上游） |
| `youtubei/v1/log_event` | 1 | 响应侧**不再拦**，请求侧保留 |
| `youtubei/v1/att/get` | 3 | 不拦（不在表里，拦了只会刷「脚本需要更新」） |
| `youtubei/v1/mdx/handoff` | 1 | 不拦（同上） |
| `youtubei/v1/notification_registration/{set_registration,get_settings}` | 2 | 不拦（见下方陷阱） |
| `youtubei.googleapis.com/generate_204` | 1 | 不拦（HEAD 连通性探测） |
| `redirector.googlevideo.com/initplayback` | 1 | 推荐版不解密 googlevideo |
| `rr3---sn-a5msenes.googlevideo.com/initplayback` | 1 | 同上 |
| `s.youtube.com/api/stats/{qoe,watchtime}` | 4 | 不拦（播放质量上报，非广告） |
| `www.google.com/ads/on-device/{clicks,conversions}` | 2 | 不拦（见「没做的事」） |

### 陷阱：`get_settings` 里藏着 `get_setting`

`notification_registration/get_settings` 的 URL **包含子串 `get_setting`**，
上游的 `url.includes("get_setting")` 会把它当成 `youtube.response.setting.Setting` 解析。
实测（把这条 URL 硬喂给上游脚本）：**不报错，而且真的改写了响应体** —— 一个通知注册配置
被当成账号设置页面重写，静默损坏。

现有正则写的是 `account\/get_setting`，正好挡住。**这条是本次抓包最值钱的产出**：
一个看起来无害的正则放宽，就能让通知注册静默损坏。

### 缺陷 1：`config` 响应解析必崩

用 Node + `vm` 造了个 Loon 运行时（注入 `$request` / `$response` / `$persistentStore` /
`$notification` / `$done`），把 HAR 里的真实响应逐条喂给上游脚本，**问题立刻复现**：

```
[29] /youtubei/v1/config  in=80364B  => PASSTHROUGH
     TypeError: The encoded data was not valid for encoding utf-8
       at Ke.string          (youtube.response.js)
       at yr.internalBinaryRead   ← youtube.response.config.GlobalConfigGroup
       at pr.internalBinaryRead   ← youtube.response.config.ResponseContext
       at dr.fromBinary           ← youtube.response.config.Config
```

顺着栈把 minified 代码里的 `super("类型名",[...])` 全量抽出来（83 个类），
再按列偏移把栈帧映射回类型，就看到了真凶：

```js
super("youtube.response.config.ColdConfigGroup", [])          // ← 空 schema
internalBinaryRead(e,t,n,i){ return i??this.create() }        // ← 直接 return，一字节不消费
```

而父消息是这么读的：

```js
case 6: r.coldConfigGroup = lr.internalBinaryRead(e, e.uint32(), n, r.coldConfigGroup); break;
case 7: r.hotConfigGroup  = cr.internalBinaryRead(...); break;
case 4: r.hotHashData     = e.string(); break;
case 5: r.coldHashData    = e.string(); break;
```

实测响应里 `globalConfigGroup` 的字段是 `4(680B) 5(928B) 6(42757B) 7(30222B) 9(196B) 11(204B)`。
`field 6` 读到一半，reader 停在 42757 字节那段的开头；下一轮循环把那里的 tag 读成
`field 4 / length-delimited`，于是 `e.string()` 去解一个 **298 字节的嵌套 protobuf**：

```
FAIL f4 pos=8500 len=298 head=10,8,10,2,8,0,18,2,8,1,34,157,2,...
```

（`10` = field 1 / wire 2，是标准 protobuf tag，不是文本。）

**连带后果**：`config` 处理器 `ri()` 一次都跑不到 → UMP onesie 的
`clientKey` / `encryptKey` 永远写不进 `YouTubeConfig` → 同插件的 `*_request.js`
在 `kt()` 里判定「没有缓存」，于是**每次 `log_event` 都把 `x-youtube-hot-hash-data` 头删掉**。
一个解析崩溃 quietly 传染到了请求侧。

验证补丁有效性：把 `case 6:` 那一行删掉，让它落进 protobuf-ts 的 unknown-field 分支
（`skip()` 读、写出时原样回写，零信息损失），同一份 fixture 立刻解析通过并写出密钥：

```
{"{\"youtube\":{\"clientKey\":\"z1ILCNJ2yPW3hvvCB27hxlP/QZCCgrLnxR+N9XsnaEc=\", …}}":"YouTubeConfig"}
```

### 为什么最后没提交这个补丁

补丁有效，但要在公开仓库里放一份**改过的 133 KB minified 上游脚本**。
仓库原则 #1/#2 是不动上游逻辑，GeoFix 的先例也只是托管 + 改名。
于是换了个做法：既然 `ri()` 做的事就只是「沿固定路径取两个 bytes 字段、base64、存盘」，
那就**为这一个端点另写 80 行自研脚本**，上游脚本一个字不动。

`src/config-onesie.js` 不依赖任何 schema，只按
`1 → 16 → 7 → 138536474 → 146311580 → (1|2)` 走位，
并复刻了上游的边界行为（相同则不写、Music UA 写 `youtubeMusic`、保留另一平台的键、
任何异常都 `$done({})` 放行）。测试把「打了补丁的上游脚本在同一 fixture 上的输出」当真值比对。

### 缺陷 2：`log_event` 的响应是 GIF

```
[11] /youtubei/v1/log_event  in=42B
     resp headers: content-type: image/gif
     resp body:    R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7
     Error: illegal tag: field no 8 wire type 7
```

`R` = `0x52`？不 —— `G` = `0x47`，tag = field 8 / wire 7，正是 protobuf 的非法 wire type。
上游把 `log_event` 和 `config` 映射到同一个 `Config` 类型（`{path:"log_event", msgType:kr, handler:ri}`），
今天已经不成立。而 onesie 密钥只存在于 `config` 响应里，`log_event` 响应给不出它，
所以从 **http-response** 正则里删掉 `log_event` 是零损失。**http-request 的规则保留** ——
它只读请求头，实测能正常改写 17 个头（剥 `content-encoding`、按缓存状态决定要不要留 hot-hash）。

### 顺带查清、结论是「不动」的两件事

1. **两条 `browse`（903 KB / 407 KB）解析正常、零改动。** 原始字节里搜不到
   `Sponsored` / `promoted` / `广告` / `广告内容`，只有 `shopping`（商品货架，不是广告）。
   抓包是在装了插件的真机上做的，广告已被剥掉，所以这份样本**无法证明去广告是否仍然有效**。
2. **广告归因埋点** `www.google.com/ads/on-device/{clicks,conversions}`
   （`api_version=3&oda_eid=0.0.0`）每次启动都发，插件完全没覆盖。
   但 Loon 的 `[Rewrite]` **只对 http 和已解密的 https 生效**，要拦就得把
   `www.google.com` 加进 MitM —— 为两个 1 KB 埋点解密整个 Google 主域，不划算。
   写进 README 的「可选」小节，附上条件成立时的手写规则。

### 这次抓包**没有**覆盖到的

抓包是**冷启动**，全程没有 `youtubei/v1/player` 响应（只看到 `initplayback` 和
`s.youtube.com/api/stats/watchtime`）。也就是说：
**播放页的插片广告、中插广告这条主路径，本次抓包无法验证。**
README 里如实写了这条限制，没有拿「browse 干净」冒充「去广告有效」。

---

## 复现

```bash
# 回归测试（16 例）
node plugins/YouTube-Dedup/test/config-onesie.test.mjs

# 规则与抓包对照（每条端点命中哪条规则、有无冲突）
python3 /var/minis/workspace/check_rules.py   # 该脚本未入库，逻辑见 README 表格
```

抓包复现步骤：Loon → 请求记录 → 导出 HAR → 冷启动 YouTube（**要进播放页再导出**，
否则拿不到 `player` 响应，验证不了主路径）。
**导出后先删掉 `Authorization` 头再入库。**

---

## 方法论备忘

- **HAR 里全是 protobuf 的时候，字符串搜索是没用的** —— 二进制里没有字段名。
  能定位靠的是「栈帧列偏移 → 映射回 `super("类型名")` → 抽全量 schema」。
- **给 minified 脚本造 harness 比读代码快**：`vm` 里注入 5 个 `$` 变量，
  真实响应喂进去，PASS/FAIL 和异常栈直接出来。本次三个结论有两个是这么发现的。
- **改 `catch` 打 stack 比 `console.log(err)` 信息量高一个量级**：
  `console.log(String(l))` 只剩一行 message，换成 `l.stack` 才拿得到「哪个类型的哪个字段」。
- **HAR 会带 `Bearer ya29.…`**，这是能直接用的账号令牌，入库前必须逐字节扫。
