# CtClient-AdBlock — 中国电信去广告

中国电信 App（`CtClient` / 二进制 `CTPocket` 13.5.0）去广告 + 无用功能精简插件。

> ⚠️ **实验性（v1.0.2）**：本插件在 **Live Container 测试环境**验证通过（62 条 appgoadsz 请求 200，字段级清洗全部生效）；
> 但**正式环境会因证书校验导致 App 整体断网**（详见「八、证书校验边界」）。正式环境请勿启用。

- 版本：**v1.0.0**
- 探针：`https://appgoadsz.189.cn/gw/loon-sim.probe.ctclient_adblock`
- 取证环境：Live Container 容器（`lcf-forensics` 抓原始响应 + 沙盒目录读写 + `strings CTPocket`）
- 取证文件：`Data/Application/B8A26766-…/` 与 `1E35CB6D-…/Documents/lcf-log/forensics-2026*.jsonl`

---

## 一、为什么要按「字段」而不是「接口」动手

这台 App 的广告和功能入口**共用同一个容器接口**，整接口 reject 就是白屏。两个实测反例：

### 反例 1：`queryHomepageMarketingFloor` 的 `adList` 不是广告

`adList` 名字像广告位，实际返回的是**首页常用功能九宫格** 20 项：

```
查账单 / 办套餐 / 宽带到家 / 买手机 / 积分商城 / AI新品 / 流量优选 / 芒果TV
/ 网易云 / 服务大厅 / 查开通小区 / 使用量分析 / 订单查询 / 携号入网 / 流量查询
/ 电子发票 / 网龄查询 / 我的宽带 / 语音查询 / 喜马拉雅
```

每一项都带 `linkType` + `sceneId`（`hg_sy_jglq##…`）+ `recommender`，是服务端下发的功能位。
**清空 = 首页功能全部消失。本插件绝不清 `adList`**，只清同接口里真正纯营销的 `hotSelection`。

### 反例 2：`compoundADSpace` 全是功能入口

二进制常量区把它归在广告体系（`ESAdvertisingSpaceInfo` / `CompoundADSpaceInfo`），
但实测 5 份响应里的项是：

```
在线客服 / 数字人 ×2 / 扫一扫 / 付款码 / 关爱版 / 英文版
/ AI帮干活 / 意见反馈 / 我要投诉 / 我的地址 / 特惠副卡 / 全屋光宽
```

唯一「广告」是 `order=0` 的**全 null 占位项**（清它无收益且有排序风险）。
**本插件不清洗 `compoundADSpace`。**

---

## 二、清洗项（Script，`bundle.js` 单文件）

| 接口 | 清洗字段 | 实测规模 | 开关 |
|---|---|---|---|
| `queryHomepageMarketingFloor` | `hotSelection.advertisingListLeft/Right` | 5 + 3 条（11.11限定 / 低价订酒店 / 合约机 / 出境漫游用电信 / 29元15GB月包 / 芒果TV周卡） | `homepageFloor` + `homepageHotSelection` |
| 同上 | `packageAndNumberCard.tabList[].bottomBannerList` | 3 + 1 条（5G-A套餐 / 5G畅享云套餐 / 卫星功能卡 / 精选好号） | `homepageTariffBanner` |
| `getFeedList` | `feedList[].recommendAdBean.recommendAdList` | 3 / 3 / 2 条（宽带新装 / 宽带专区 / 天翼出行Plus） | `feedRecommendAd` |
| `queryMessageChannel` | `marketingMessageList` + `dynamicMessage.marketingMessageList` | 11 + 9 条（闲置好物…） | `marketingMessage` |
| `queryHomepageAICard` | `digitalPersonCard.adList` | 6~7 条（充值100元 / 积分兑好礼） | `aICardAd` |
| `queryMyChannelTop` | `topAdList` | 1~3 条 | `myChannelTopAd` |
| `queryMyCloudMonitorCard` | `noDeviceData.noDeviceAdList` | 4 条（看家护院） | `cardInnerAd` |
| `queryMyStorageCard` | `unauthorizedData.adList` | 4 条（超大空间） | `cardInnerAd` |
| `queryMyAiRingtoneCard` | `myCreation.adList` | 3 条（AI特效） | `cardInnerAd` |
| `myCommunicationAssistantCard` | `notOpenData.bottomAdList` | 7 条（号码识别） | `cardInnerAd` |
| `myTravelCardNew` | `myTravelTabList[].hotelBean.topAdList` | 1 条（低价订酒店） | `cardInnerAd` |
| `queryMyRingtoneAndLifeCard` | `adList` | 7 条（签到领流量…） | `cardInnerAd` |

**保留项（明确不动）**：`adList` 九宫格、`sortList`（`["1","2","3"]` 控制首页三段顺序）、
`feedList` 本体与 `topArea`、服务消息 / 实时事件、`messageIdInfos`（122 条）。

---

## 三、拦截项（`[Rewrite]`，无条件）

### 3.1 辅助位（实测已有空响应容忍）

| 路径 | 实测空态证据 |
|---|---|
| `query/suspend/suspendWindow` | `{"resultCode":"1001","data":null}` |
| `query/suspendWindowForQuery` / `ForWap` / `V2` | 二进制 selector 同族 |
| `query/loginSuspendWindow` | 有过 12 条「登录帮助」bean，删空不涉登录主干 |
| `query/queryNotificationGuideDialog` | `guideDialogList: []` |

### 3.2 二进制常量区实证、本次未抓到响应样本（⚠️ 需真机守门）

```
/query/advertising/compositeAd
/query/advertising/mallPackageAd
/query/advertising/serviceChannelAd
/query/queryAdvertisingSpace
/query/queryCustomerAdvertising
/query/qryNearConfigAdvertising
/query/qryTraAdvertisingSpace
```

名称即语义（advertising / Ad），按纯广告接口处理。
**若「查询办理」「商城」「附近营业厅」出现空白区块，先注释这一段再复测。**

> `[Rewrite]` 段不支持开关（本仓库已两次实证：`enable={}` 与 `&& ${sw} == true` 均不生效），
> 所以拦截项是无条件的；要临时关掉只能注释 lpx 里对应行。

---

## 四、已知边界（做不到的部分，别指望插件）

| 边界 | 证据 | 结论 |
|---|---|---|
| **开屏广告** | 二进制 `GetSplashProtoRoot` / `GetSplashRequest_Builder` / `splashAds` / `uniSplashAdInfos`；沙盒 `launch_save_*` 落盘槽 + `launch_show_data={}`；三次冷启动 `lcf-resp` 全文搜 `splash` **0 命中**；`actives/multiactiveiosclient.json` 为密文 hex | 走 **Protobuf RPC**，不在 NSURLSession 可见通道 → **HTTP 层无规则可写** |
| **小程序列表** | `capp.189.cn/mobile/pa/queryMiniList` 返回 180KB **纯密文 hex**（`c6797385…`） | Loon Script 无法 JSON 解析，语义不可知 → 不清洗、不 reject（怕砍小程序入口） |
| **App 内缓存重播** | `Library/Preferences/CtClient.plist` 的 `phoneFloorModel_*` 存整段楼层 JSON；`Library/Caches/CtClient/Cache.db` 93 条 NSURLCache | 真机上首次冷启动可能先渲染缓存楼层，等 App 自刷新后才净；插件无法清真机缓存 |
| **图床 `w.189.cn/bigdata/**`** | 200 次请求，功能图标与广告图**同域同路径格式** | 不能按域名/路径拦（拦了 Tab 图标与卡片图标全空），只能靠 JSON 删引用 |

---

## 五、双域覆盖（必须）

同一路径在不同网络/账号状态下走不同子域，实测都出现过：

```
appgoadsz.189.cn   ← 默认（首页/我的）
appgoadhd.189.cn   ← 灰度/宽带态（同一 queryHomepageMarketingFloor，结构一致）
appfuwusz.189.cn / appfuwuhd.189.cn   （queryMainDataArea）
appkefusz.189.cn   （myWallet）
appgosz.189.cn     （tablebar / addressInfo / querySecondFloor）
```

`[MitM]` 六个域全含；正则用 `(?:appgoadsz|appgoadhd|…)` 前缀族 + `(?::\d+)?` 兼容显式端口
（实测存在 `https://appgoadhd.189.cn:443/...` 这种写法）。

---

## 六、验证记录（2026-11-05，loon-sim）

```
node cli.js check CtClient-AdBlock.lpx
  结果: 0 错误, 0 警告 | [Rule] 0 · [Script] 6 · [Rewrite] 4 · [Mitm] 6 · [Argument] 8
```

真实响应回放（原始 lcf-resp 文件 → 清洗后）：

| 接口 | 字节 | 断言 |
|---|---|---|
| `queryHomepageMarketingFloor` | 23979 → 13657 | hotSelection L0/R0，adList **20 不变**，sortList 不变，banner [0,0,0] |
| `getFeedList` | 89940 → 84097 | feedList 32 不变，残留 recommendAdList 项 **0** |
| `queryMessageChannel` | 42006 → 28486 | marketing 11→0，dyn.marketing 9→0，messageIdInfos 122 保留 |
| `queryHomepageAICard` | 5388 → 2483 | digitalPersonCard.adList 7→0 |
| `queryMyChannelTop` | 542 → 185 | topAdList 1→0 |
| `queryMyCloudMonitorCard` | 5606 → 2784 | noDeviceAdList 4→0 |
| `queryMyStorageCard` | 6827 → 2335 | unauthorizedData.adList 4→0 |
| `queryMyAiRingtoneCard` | 6104 → 2991 | myCreation.adList 3→0 |
| `myCommunicationAssistantCard` | 4474 → 1193 | notOpenData.bottomAdList 7→0 |
| `myTravelCardNew` | 38248 → 36354 | hotelBean.topAdList 1→0 |
| `queryMyRingtoneAndLifeCard` | 4161 → 510 | adList 7→0 |
| hd 域同 URL | 23979 → 13657 | MITM 命中 `appgoadhd.189.cn`，清洗一致 |
| 无关接口 `queryKeyInformationCard` | 不变 | 相关 Script **0 条** |
| 开关全关 `--arg homepageFloor=false` | 不变 | 原样返回 |

`sh ci.sh` → **通过 31 | 已知失败 15 | 新失败 0 | 双仓一致 ✅**

---

## 七、待补取证（下一版再说）

1. **开屏**：冷杀后录屏 + 同进程 lc-forensics，确认 `GetSplash*` 走 Protobuf over 哪条 TCP/HTTP2 通道，以及 `multiactiveiosclient.json` 的密钥来源
2. **`compoundADSpaceNew`**：二进制独有变体（`compoundADSpaceNewWithIsPremiumEdition`），VIP 态下可能出现新字段
3. **`query/qryNearConfigAdvertising`**：附近营业厅广告，需定位权限实测
4. **`capp` 加解密**：需 crypto 函数名 + 明密文对，才能清洗小程序位
5. **弹窗族**：`ESPopupsManager` / `ESLivePopupCoupon` / `ESLivePopupMarket` / `FloorAndPopupsConf` 未触发，需真实弹窗时段 HAR

---

## 八、与 Loon「抓包」的冲突（v1.1.0 更正）

### 现象

| 状态 | 结果 |
|---|---|
| 插件启用 + **抓包关闭** | ✅ **正常工作**（实测 v1.0.2：首页信息流里的「宽带新装 / 天翼出行」推荐位消失） |
| 插件启用 + **抓包开启** | ❌ App 报「您可能正在连接到一个伪装成 appgoadsz.189.cn 的服务器」并断网 |
| 插件禁用 | 一切正常，广告回来 |

### 更正说明

v1.0.2 的 README 曾判定「该 App 做了 SSL Pinning，正式环境不可用」——**这个结论是错的**。
用户实测证明：关掉抓包后插件照常生效，MITM 与清洗都没问题。真正触发断网的是 Loon 的**抓包模式**，
与被拦域名无关（把 MITM 目标换成 `appupdates.189.cn` 抓包，App 同样报错）。

### 已排除的假设（附证据，勿重复走）

| 假设 | 检验 | 结果 |
|---|---|---|
| 叶子证书 CN 异常导致 | `openssl s_client -connect appgoadsz.189.cn:443` → `subject=O=Loon, CN=shop-api.retail.mi.com`，SAN=`DNS:appgoadsz.189.cn` | ❌ 排除。CN 取的是 MITM 列表里最早的那个域名（删掉那条后变成 `appconf.mail.163.com`），SAN 始终正确 |
| CA 来源有问题 | 解出配置里的 `ca-p12`：只有 1 张自签 CA（`LOON CA(2026-07-10) 1783656365336`），无叶子证书；换成 openssl 现场生成的 CA 结果相同 | ❌ 排除。叶子由 Loon 现场签发 |
| MITM 主机名列表残留 | 删除「本地」里的 `shop-api.retail.mi.com` 后重新签发 | ❌ 排除。CN 只是换成下一个域名 |
| 域名级 pinning | 同设备同 CA，`appupdates.189.cn` 抓包 4 条请求全部 200；而 App 在日常使用中能正常请求 appgoadsz | ❌ 排除 |

### 使用建议

- 平时**正常开着插件**即可，广告清洗生效
- 需要抓包时，**先临时停用本插件**（或接受该 App 在抓包期间不可用）
- 二进制里确实有 `AFSecurityPolicy` / `SecTrustSetAnchorCertificates` 等校验代码，但实际未对 appgoadsz 生效

### 环境坑

Loon 重启时会用内存状态**重写 `.lcf`**：手工删掉 `ca-p12` / `ca-passphrase` 会导致「CA 证书生成或解析错误、MitM 不可用」。
改 CA 必须在 Loon 完全退出时改，并保留 `.bak`。

---

## 九、无用功能整接口置空（v2.0.0）

返回**合法空信封**而非 `reject {}`：

```json
{"headerInfos":{"code":"0000","reason":"操作成功"},
 "responseData":{"resultCode":"1001","resultDesc":"无数据","attach":"","data":null}}
```

App 对 `resultCode=1001 / data:null` 有现成容错（实测 `suspendWindow` 本来就返回这种形态）。

### 证据等级说明

- **A 级**：本次 lcf-forensics 抓到过真实响应，字段结构确认
- **B 级**：仅 `strings CTPocket` 常量区出现该路径，本次未触发；按名称语义判定为纯展示/营销

| 接口 | 用途推断 | 开关 | 证据 |
|---|---|---|---|
| `query/getPopUpWindows` | 通用弹窗 | `stubPopups` | B |
| `query/queryAdRotation` | 广告轮播 | `stubPopups` | B |
| `query/queryMyChannelAdvSpace` | 我的页广告位 | `stubMarketing` | B |
| `query/queryRechargeMarketing` | 充值页营销 | `stubMarketing` | B |
| `query/queryRechargeTips` | 充值提示文案 | `stubMarketing` | B |
| `query/queryRechargeMsg` / `queryRechargerMsg` | 充值消息 | `stubMarketing` | B |
| `query/userActivity/queryActivityInfo` | 活动 | `stubMarketing` | A（实测 `adItems=[]`、`totalCount=null` 已空）|
| `query/userActivity/queryRechagerMessage` | 充值活动消息 | `stubMarketing` | B |
| `query/getSolarTerms` | 节气装饰 | `stubMarketing` | B |
| `query/queryBeautifulScr` | 靓号推荐 | `stubMarketing` | B |
| `query/queryOffersAndBroadband` | 优惠/宽带推荐 | `stubMarketing` | B |
| `query/queryHotNav` | 热门导航（营销入口行） | `stubMarketing` | B |

**风险提示**

- `stubPopups` 会把实名认证、欠费提醒这类弹窗一起挡掉 —— 需要时关掉这个开关
- `queryHotNav` 如果承载首页某一行入口，关掉后会有留白；目前无 A 级证据，异常就关 `stubMarketing`
- B 级条目全部可单独关闭（`[Argument]` 两个开关），不会像 `[Rewrite]` 那样无条件生效

### MITM 域名

v2.0.0 起为 3 个：`appgoadsz` / `appgoadhd`（业务 API）、`appgosz`（通用查询，可能承载上述接口）。
